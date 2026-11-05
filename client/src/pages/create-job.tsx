import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQuery } from "@tanstack/react-query";
import { insertJobSchema, Job, JobStatus } from "@shared/schema";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Form, FormControl, FormDescription, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { useLocation, useSearch } from "wouter";
import { useAuth } from "@/lib/auth-context";
import { useEffect, useState } from "react";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { Save, Send, AlertCircle, Wallet, Star } from "lucide-react";
import { fromZonedTime, formatInTimeZone } from "date-fns-tz";
import { TIMEZONE } from "@/lib/timezone";
import { getJobFundingShortfall } from "@shared/job-funding";

function isFutureDeadline(value: string): boolean {
  if (!value) return true;
  const d = fromZonedTime(value, TIMEZONE);
  return !Number.isNaN(d.getTime()) && d.getTime() > Date.now();
}

const formSchema = insertJobSchema.extend({
  budget: z
    .string()
    .min(1, "Budget is required")
    .refine((v) => parseFloat(v) >= 5, {
      message: "Budget must be at least $5",
    }),
  deadline: z
    .string()
    .min(1, "Deadline is required")
    .refine(isFutureDeadline, {
      message: "Deadline must be in the future",
    }),
});

const categories = [
  "Web Development",
  "Mobile Development",
  "Design",
  "Writing",
  "Marketing",
  "Data Science",
  "DevOps",
  "Other",
];

interface WalletData {
  id: string;
  usdtBalance: string;
  pendingUsdtBalance: string;
}

export default function CreateJobPage() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [, setLocation] = useLocation();
  const searchParams = useSearch();
  const editJobId = new URLSearchParams(searchParams).get("edit");
  const isEditMode = !!editJobId;
  const [submitAction, setSubmitAction] = useState<"draft" | "submit">("submit");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [hasWithdrawnForEdit, setHasWithdrawnForEdit] = useState(false);
  const [hasPrefilledEditJobId, setHasPrefilledEditJobId] = useState<string | null>(null);


  const { data: wallet } = useQuery<WalletData>({
    queryKey: ["/api/wallet"],
  });
  const { data: existingJob, isLoading: isLoadingJob } = useQuery<Job>({
    queryKey: [`/api/jobs/${editJobId}`],
    enabled: isEditMode && !!editJobId,
  });

  const form = useForm<z.infer<typeof formSchema>>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      title: "",
      description: "",
      category: "",
      budget: "",
      requirements: "",
      deadline: "",
      customerId: user?.id || "",
      status: JobStatus.DRAFT,
      isPremium: false,
    },
  });

  const budgetValue = parseFloat(form.watch("budget") || "0");
  const isPremium = form.watch("isPremium");
  const premiumAmountValue = parseFloat(form.watch("premiumAmount") || "0");
  const premiumFee = isPremium ? premiumAmountValue : 0;
  const totalCost = budgetValue + premiumFee;
  const availableBalance = wallet
    ? parseFloat(wallet.usdtBalance || "0") - parseFloat(wallet.pendingUsdtBalance || "0")
    : 0;
  const isPendingReviewJob = isEditMode && !hasWithdrawnForEdit && !!existingJob && ["pending", JobStatus.PENDING_APPROVAL].includes(existingJob.status);
  const pendingReviewEscrowAmount = isPendingReviewJob
    ? parseFloat(existingJob?.budget || "0") + (existingJob?.isPremium ? parseFloat(existingJob.premiumAmount || "0") : 0)
    : 0;
  const existingEscrowAmount = !hasWithdrawnForEdit && !!existingJob && ["pending", JobStatus.PENDING_APPROVAL].includes(existingJob.status)
    ? pendingReviewEscrowAmount
    : 0;
  const amountToFund = Math.max(0, totalCost - existingEscrowAmount);
  const fundingShortfall = getJobFundingShortfall(totalCost, availableBalance, existingEscrowAmount);
  const isCheckingFundsForThisAction = !isEditMode || hasWithdrawnForEdit || !isPendingReviewJob;
  const hasSufficientFunds = fundingShortfall === 0;

  // Prefill once per edited job. Refetches after withdrawal must not replace
  // changes the customer has already made in the form.
  useEffect(() => {
    if (existingJob && isEditMode && editJobId && hasPrefilledEditJobId !== editJobId) {
      form.reset({
        title: existingJob.title,
        description: existingJob.description,
        category: existingJob.category,
        budget: existingJob.budget,
        requirements: existingJob.requirements || "",
        deadline: existingJob.deadline ? formatInTimeZone(new Date(existingJob.deadline), TIMEZONE, "yyyy-MM-dd'T'HH:mm") : "",
        customerId: existingJob.customerId,
        status: existingJob.status,
        isPremium: existingJob.isPremium || false,
        premiumAmount: existingJob.premiumAmount || "0",
      });
      setHasPrefilledEditJobId(editJobId);
    }
  }, [existingJob, isEditMode, editJobId, hasPrefilledEditJobId, form]);

  const createJobMutation = useMutation({
    mutationFn: async (data: z.infer<typeof formSchema> & { action?: "draft" | "submit" }) => {
      const { action, ...formData } = data;
      const jobData = {
        ...formData,
        budget: formData.budget,
        deadline: formData.deadline ? fromZonedTime(formData.deadline, TIMEZONE).toISOString() : undefined,
        status: action === "draft" ? JobStatus.DRAFT : JobStatus.PENDING_APPROVAL,
      };
      
      if (isEditMode && editJobId) {
        const response = await apiRequest("PUT", `/api/jobs/${editJobId}`, jobData);
        const savedJob = await response.json();
        return { action, jobId: editJobId, savedJob };
      }

      const response = await apiRequest("POST", "/api/jobs", jobData);
      const savedJob = await response.json();
      return { action, jobId: savedJob.id as string, savedJob };
    },
    onSuccess: async ({ action, jobId, savedJob }) => {
      queryClient.setQueryData<Job>([`/api/jobs/${jobId}`], (currentJob) =>
        currentJob ? { ...currentJob, ...savedJob } : savedJob,
      );
      queryClient.invalidateQueries({ queryKey: ["/api/jobs"] });
      queryClient.invalidateQueries({ queryKey: ["/api/my-jobs"] });
      queryClient.invalidateQueries({ queryKey: ["/api/wallet"] });
      queryClient.invalidateQueries({ queryKey: ["/api/wallet/transactions"] });
      queryClient.invalidateQueries({ queryKey: ["/api/moderation/pending"] });

      setIsSubmitting(false);
      setHasWithdrawnForEdit(false);
      if (action === "draft") {
        await queryClient.invalidateQueries({ queryKey: [`/api/jobs/${jobId}`] });
        toast({
          title: "Job saved as draft",
          description: "You can submit it for approval when ready.",
        });
        setLocation("/my-jobs");
      } else {
        submitForApprovalMutation.mutate(jobId);
      }
    },
    onError: (error: any) => {
      setIsSubmitting(false);
      toast({
        title: isEditMode ? "Failed to update job" : "Failed to save job",
        description: error.message || "Please try again later.",
        variant: "destructive",
      });
    },
  });

  const withdrawForEditMutation = useMutation({
    mutationFn: (jobId: string) => apiRequest("POST", `/api/jobs/${jobId}/withdraw-for-edit`, {}),
    onSuccess: async () => {
      queryClient.setQueryData([`/api/jobs/${editJobId}`], (job: Job | undefined) =>
        job ? { ...job, status: JobStatus.DRAFT, submittedForReviewAt: null } : job,
      );
      queryClient.invalidateQueries({ queryKey: ["/api/my-jobs"] });
      queryClient.invalidateQueries({ queryKey: ["/api/wallet"] });
      queryClient.invalidateQueries({ queryKey: ["/api/wallet/transactions"] });
      queryClient.invalidateQueries({ queryKey: ["/api/moderation/pending"] });
      setHasWithdrawnForEdit(true);
      setIsSubmitting(false);
      toast({
        title: "Job withdrawn for editing",
        description: "Its held escrow has been returned to your wallet. Your changes are not saved yet; save them as a draft, then submit for review when you are ready.",
      });
    },
    onError: (error: any) => {
      setIsSubmitting(false);
      toast({
        title: "Could not withdraw job",
        description: error.message || "Please try again.",
        variant: "destructive",
      });
    },
  });

  const submitForApprovalMutation = useMutation({
    mutationFn: async (jobId: string) => {
      const response = await apiRequest("POST", `/api/jobs/${jobId}/submit-for-approval`, {});
      return await response.json() as Job;
    },
    onSuccess: (result, jobId) => {
      queryClient.invalidateQueries({ queryKey: [`/api/jobs/${jobId}`], exact: true });
      queryClient.invalidateQueries({ queryKey: ["/api/jobs"] });
      queryClient.invalidateQueries({ queryKey: ["/api/my-jobs"] });
      queryClient.invalidateQueries({ queryKey: ["/api/moderation/pending"] });
      queryClient.invalidateQueries({ queryKey: ["/api/wallet"] });
      queryClient.invalidateQueries({ queryKey: ["/api/wallet/transactions"] });
      const isPendingReview = result.status === JobStatus.PENDING_APPROVAL;
      toast({
        title: isPendingReview ? "Submitted for moderator review" : "Job posted!",
        description: isPendingReview
          ? `Your job was flagged for review. ${result.moderatorFeedback || "Moderators will check it before publication."} Funds have been reserved.`
          : "Your job passed the automatic content check and is now open for applications. Funds have been reserved.",
      });
      setLocation("/my-jobs");
    },
    onError: (error: any) => {
      setIsSubmitting(false);
      toast({
        title: "Failed to submit for approval",
        description: error.message || "Please check your wallet balance and try again.",
        variant: "destructive",
      });
    },
  });

  function onSubmit(values: z.infer<typeof formSchema>) {
    if (isSubmitting) return;
    setIsSubmitting(true);
    createJobMutation.mutate({ ...values, action: submitAction });
  }

  if (isEditMode && isLoadingJob) {
    return (
      <div className="max-w-4xl mx-auto space-y-6">
        <Skeleton className="h-12 w-64" />
        <Card>
          <CardHeader>
            <Skeleton className="h-8 w-48" />
            <Skeleton className="h-4 w-96" />
          </CardHeader>
          <CardContent className="space-y-6">
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-32 w-full" />
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <div>
        <h2 className="text-3xl font-bold tracking-tight">
          {isEditMode ? "Edit & Resubmit Job" : "Post a New Job"}
        </h2>
        <p className="text-muted-foreground">
          {isEditMode 
            ? "Update your job details and resubmit for moderation"
            : "Create a job posting to find the perfect freelancer"}
        </p>
      </div>


      {isEditMode && existingJob?.moderatorFeedback && (
        <Card className="border-destructive">
          <CardHeader>
            <CardTitle className="text-destructive">Moderator Feedback</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm whitespace-pre-wrap break-words">{existingJob.moderatorFeedback}</p>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Job Details</CardTitle>
          <CardDescription>
            Job posts are checked automatically. Flagged posts go to moderators; clean posts publish immediately.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
              <FormField
                control={form.control}
                name="title"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Job Title *</FormLabel>
                    <FormControl>
                      <Input placeholder="e.g., Build a React Dashboard" {...field} data-testid="input-job-title" />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="category"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Category *</FormLabel>
                    <Select onValueChange={field.onChange} defaultValue={field.value}>
                      <FormControl>
                        <SelectTrigger data-testid="select-job-category">
                          <SelectValue placeholder="Select a category" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {categories.map((category) => (
                          <SelectItem key={category} value={category}>
                            {category}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="budget"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Budget (USD) *</FormLabel>
                    <FormControl>
                      <Input type="number" placeholder="5" {...field} data-testid="input-job-budget" />
                    </FormControl>
                    <FormDescription>Enter the total budget in USD</FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="description"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Description *</FormLabel>
                    <FormControl>
                      <Textarea
                        placeholder="Describe the job requirements and expectations..."
                        className="min-h-32"
                        {...field}
                        data-testid="input-job-description"
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="requirements"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Requirements</FormLabel>
                    <FormControl>
                      <Textarea
                        placeholder="List any specific skills or requirements..."
                        {...field}
                        value={field.value || ""}
                        data-testid="input-job-requirements"
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="deadline"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Deadline</FormLabel>
                    <FormControl>
                      <Input type="datetime-local" {...field} data-testid="input-job-deadline" />
                    </FormControl>
                    <FormDescription>Date and time in Eastern Time (ET).</FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="isPremium"
                render={({ field }) => (
                  <FormItem>
                    <Card className={field.value ? "border-amber-500/50 bg-amber-500/5" : ""}>
                      <CardContent className="p-4">
                        <div className="flex items-center gap-3">
                          <Star className={`w-5 h-5 ${field.value ? "text-amber-500 fill-amber-500" : "text-muted-foreground"}`} />
                          <div className="flex-1">
                            <FormLabel className="text-sm font-medium cursor-pointer">
                              Premium Listing
                            </FormLabel>
                            <FormDescription className="text-xs">
                              Pay for priority placement on the job board. The more you spend, the higher your job appears. Minimum $100.
                            </FormDescription>
                          </div>
                          <FormControl>
                            <Switch
                              checked={field.value ?? false}
                              onCheckedChange={(checked) => {
                                field.onChange(checked);
                                if (checked && premiumAmountValue < 100) {
                                  form.setValue("premiumAmount", "100");
                                }
                              }}
                              data-testid="switch-premium"
                            />
                          </FormControl>
                        </div>
                        {field.value && (
                          <div className="mt-3 pt-3 border-t">
                            <FormField
                              control={form.control}
                              name="premiumAmount"
                              render={({ field: amountField }) => (
                                <FormItem>
                                  <FormLabel className="text-xs">Premium Amount ($)</FormLabel>
                                  <FormControl>
                                    <Input
                                      type="number"
                                      min="100"
                                      step="1"
                                      placeholder="100"
                                      value={amountField.value || ""}
                                      onChange={amountField.onChange}
                                      data-testid="input-premium-amount"
                                    />
                                  </FormControl>
                                  {premiumAmountValue > 0 && premiumAmountValue < 100 && (
                                    <p className="text-xs text-destructive">Minimum premium amount is $100</p>
                                  )}
                                  <FormDescription className="text-xs">
                                    Higher amounts get better placement on the job board
                                  </FormDescription>
                                </FormItem>
                              )}
                            />
                          </div>
                        )}
                      </CardContent>
                    </Card>
                  </FormItem>
                )}
              />

              {(budgetValue > 0 || isPremium) && (
                <Card className={hasSufficientFunds ? "border-green-500/50 bg-green-500/5" : "border-destructive/50 bg-destructive/5"}>
                  <CardContent className="p-4">
                    <div className="flex items-center gap-3">
                      <Wallet className={`w-5 h-5 ${hasSufficientFunds ? "text-green-500" : "text-destructive"}`} />
                      <div className="flex-1">
                        <p className="text-sm font-medium">
                          {hasSufficientFunds ? "Funds available" : "Insufficient funds"}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          Available: ${availableBalance.toFixed(2)} | New amount required: ${amountToFund.toFixed(2)}
                          {isPremium && premiumFee > 0 && ` (Budget $${budgetValue.toFixed(2)} + Premium $${premiumFee.toFixed(2)})`}
                        </p>
                      </div>
                      {!hasSufficientFunds && isCheckingFundsForThisAction && (
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={() => setLocation("/wallet")}
                          data-testid="button-add-funds"
                        >
                          Add Funds
                        </Button>
                      )}
                    </div>
                  </CardContent>
                </Card>
              )}

              {((fundingShortfall > 0 && isCheckingFundsForThisAction) || (isPendingReviewJob && totalCost <= existingEscrowAmount)) && totalCost > 0 && (
                <Alert variant="default">
                  <AlertCircle className="h-4 w-4" />
                  <AlertTitle>{fundingShortfall > 0 ? "Funds Required" : "Escrow Refund"}</AlertTitle>
                  <AlertDescription>
                    {fundingShortfall > 0
                      ? `You need $${fundingShortfall.toFixed(2)} more to submit this job for approval${isPendingReviewJob ? " after the current escrow is refunded" : ""}.`
                      : `You have $${(existingEscrowAmount - totalCost).toFixed(2)} more held than this job will require. Editing removes it from the moderator queue and refunds the full $${existingEscrowAmount.toFixed(2)} currently held in escrow. The edited job can then be resubmitted after funds are checked.`}
                    {fundingShortfall > 0 && isPendingReviewJob && existingEscrowAmount > 0
                      ? ` $${existingEscrowAmount.toFixed(2)} is already held in escrow; only the amount exceeding that is counted.`
                      : fundingShortfall > 0
                        ? ` The total amount${isPremium && premiumFee > 0 ? " (budget + premium fee)" : ""} will be held in escrow when submitted.`
                        : ""}
                  </AlertDescription>
                </Alert>
              )}

              <div className="flex gap-4 justify-end flex-wrap">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setLocation("/jobs")}
                  data-testid="button-cancel"
                >
                  Cancel
                </Button>
                <Button
                  type="submit"
                  variant="secondary"
                  disabled={isSubmitting || createJobMutation.isPending || withdrawForEditMutation.isPending}
                  onClick={() => setSubmitAction("draft")}
                  data-testid="button-save-draft"
                >
                  <Save className="w-4 h-4 mr-2" />
                  {withdrawForEditMutation.isPending || (createJobMutation.isPending && submitAction === "draft") ? "Saving..." : "Save as Draft"}
                </Button>
                <Button
                  type="button"
                  disabled={isSubmitting || createJobMutation.isPending || submitForApprovalMutation.isPending || withdrawForEditMutation.isPending || (isCheckingFundsForThisAction && !hasSufficientFunds && totalCost > 0 && submitAction === "submit" && !hasWithdrawnForEdit) || (!!isPremium && premiumAmountValue < 100)}
                  onClick={() => {
                    setSubmitAction("submit");
                    if (isPendingReviewJob) {
                      setIsSubmitting(true);
                      withdrawForEditMutation.mutate(editJobId!);
                    } else if (hasWithdrawnForEdit && isEditMode) {
                      form.handleSubmit((values) => {
                        setIsSubmitting(true);
                        createJobMutation.mutate({ ...values, action: "submit" });
                      })();
                    } else {
                      form.handleSubmit(onSubmit)();
                    }
                  }}
                  data-testid="button-submit-job"
                >
                  <Send className="w-4 h-4 mr-2" />
                  {withdrawForEditMutation.isPending
                    ? "Withdrawing from review..."
                    : createJobMutation.isPending && submitAction === "submit"
                      ? "Saving draft..."
                      : submitForApprovalMutation.isPending
                        ? "Submitting..."
                        : isPendingReviewJob
                          ? "Withdraw for Editing"
                          : hasWithdrawnForEdit
                            ? "Resubmit Job"
                            : isEditMode
                              ? "Update & Submit"
                              : "Post Job"}
                </Button>
              </div>
            </form>
          </Form>
        </CardContent>
      </Card>
    </div>
  );
}
