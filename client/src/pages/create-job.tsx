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
import { Save, Send, AlertCircle, Wallet, Star, Clock } from "lucide-react";

const formSchema = insertJobSchema.extend({
  budget: z.string().min(1, "Budget is required"),
  deadline: z.string().optional(),
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
  const [countdown, setCountdown] = useState("");

  interface CooldownData {
    canSubmit: boolean;
    hasPendingReview: boolean;
    pendingReviewTitle: string | null;
    cooldownEndsAt: string | null;
  }

  const { data: cooldown_data } = useQuery<CooldownData>({
    queryKey: ["/api/jobs/cooldown"],
    refetchInterval: 30000,
  });

  const onCooldown = cooldown_data ? !cooldown_data.canSubmit : false;

  useEffect(() => {
    if (!cooldown_data?.cooldownEndsAt) {
      setCountdown("");
      return;
    }
    const endTime = new Date(cooldown_data.cooldownEndsAt).getTime();
    const tick = () => {
      const remaining = endTime - Date.now();
      if (remaining <= 0) {
        setCountdown("");
        queryClient.invalidateQueries({ queryKey: ["/api/jobs/cooldown"] });
        return;
      }
      const h = Math.floor(remaining / (60 * 60 * 1000));
      const m = Math.floor((remaining % (60 * 60 * 1000)) / (60 * 1000));
      const s = Math.floor((remaining % (60 * 1000)) / 1000);
      setCountdown(`${h}h ${m.toString().padStart(2, "0")}m ${s.toString().padStart(2, "0")}s`);
    };
    tick();
    const interval = setInterval(tick, 1000);
    return () => clearInterval(interval);
  }, [cooldown_data?.cooldownEndsAt]);

  const { data: wallet } = useQuery<WalletData>({
    queryKey: ["/api/wallet"],
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
  const hasSufficientFunds = availableBalance >= totalCost;

  // Fetch job data when in edit mode
  const { data: existingJob, isLoading: isLoadingJob } = useQuery<Job>({
    queryKey: [`/api/jobs/${editJobId}`],
    enabled: isEditMode && !!editJobId,
  });

  // Prefill form when job data loads
  useEffect(() => {
    if (existingJob && isEditMode) {
      form.reset({
        title: existingJob.title,
        description: existingJob.description,
        category: existingJob.category,
        budget: existingJob.budget,
        requirements: existingJob.requirements || "",
        deadline: existingJob.deadline ? new Date(existingJob.deadline).toISOString().split('T')[0] : "",
        customerId: existingJob.customerId,
        status: existingJob.status,
        isPremium: existingJob.isPremium || false,
        premiumAmount: existingJob.premiumAmount || "0",
      });
    }
  }, [existingJob, isEditMode, form]);

  const createJobMutation = useMutation({
    mutationFn: async (data: z.infer<typeof formSchema> & { action?: "draft" | "submit" }) => {
      const { action, ...formData } = data;
      const jobData = {
        ...formData,
        budget: formData.budget,
        deadline: formData.deadline ? new Date(formData.deadline).toISOString() : undefined,
        status: JobStatus.DRAFT,
      };
      
      let result;
      if (isEditMode && editJobId) {
        result = await apiRequest("PUT", `/api/jobs/${editJobId}`, jobData);
      } else {
        result = await apiRequest("POST", "/api/jobs", jobData);
      }
      
      return { result, action };
    },
    onSuccess: async ({ result, action }) => {
      queryClient.invalidateQueries({ queryKey: ["/api/jobs"] });
      queryClient.invalidateQueries({ queryKey: ["/api/my-jobs"] });
      
      if (action === "draft") {
        toast({
          title: "Job saved as draft",
          description: "You can submit it for approval when ready.",
        });
        setLocation("/my-jobs");
      } else if (action === "submit") {
        const jobId = (result as any)?.id || editJobId;
        if (jobId) {
          submitForApprovalMutation.mutate(jobId);
        }
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

  const submitForApprovalMutation = useMutation({
    mutationFn: (jobId: string) => apiRequest("POST", `/api/jobs/${jobId}/submit-for-approval`, {}),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/jobs"] });
      queryClient.invalidateQueries({ queryKey: ["/api/my-jobs"] });
      queryClient.invalidateQueries({ queryKey: ["/api/moderation/pending"] });
      queryClient.invalidateQueries({ queryKey: ["/api/wallet"] });
      toast({
        title: "Submitted for approval!",
        description: "Your job has been submitted for moderator review. Funds have been reserved.",
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

      {onCooldown && (
        <Alert>
          <Clock className="h-4 w-4" />
          <AlertTitle>
            {cooldown_data?.hasPendingReview 
              ? "Job Pending Review" 
              : "Cooldown Active"}
          </AlertTitle>
          <AlertDescription>
            {cooldown_data?.hasPendingReview 
              ? `Your job "${cooldown_data.pendingReviewTitle}" is still being reviewed by a moderator. You can submit a new job once it's been reviewed.`
              : countdown 
                ? `You can submit a new job for review in ${countdown}.`
                : "Please wait before submitting another job."
            }
          </AlertDescription>
        </Alert>
      )}

      {isEditMode && existingJob?.moderatorFeedback && (
        <Card className="border-destructive">
          <CardHeader>
            <CardTitle className="text-destructive">Moderator Feedback</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm whitespace-pre-wrap">{existingJob.moderatorFeedback}</p>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Job Details</CardTitle>
          <CardDescription>
            All jobs go through a moderation process before being published
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
                      <Input type="number" placeholder="500" {...field} data-testid="input-job-budget" />
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
                    <FormLabel>Deadline (Optional)</FormLabel>
                    <FormControl>
                      <Input type="date" {...field} data-testid="input-job-deadline" />
                    </FormControl>
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
                          Available: ${availableBalance.toFixed(2)} | Total required: ${totalCost.toFixed(2)}
                          {isPremium && premiumFee > 0 && ` (Budget $${budgetValue.toFixed(2)} + Premium $${premiumFee.toFixed(2)})`}
                        </p>
                      </div>
                      {!hasSufficientFunds && (
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

              {!hasSufficientFunds && totalCost > 0 && (
                <Alert variant="destructive">
                  <AlertCircle className="h-4 w-4" />
                  <AlertTitle>Funds Required</AlertTitle>
                  <AlertDescription>
                    You need ${(totalCost - availableBalance).toFixed(2)} more to submit this job for approval. 
                    The total amount{isPremium && premiumFee > 0 ? " (budget + premium fee)" : ""} will be held in escrow when submitted.
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
                  disabled={isSubmitting || createJobMutation.isPending}
                  onClick={() => setSubmitAction("draft")}
                  data-testid="button-save-draft"
                >
                  <Save className="w-4 h-4 mr-2" />
                  {createJobMutation.isPending && submitAction === "draft" ? "Saving..." : "Save as Draft"}
                </Button>
                <Button 
                  type="submit" 
                  disabled={isSubmitting || onCooldown || createJobMutation.isPending || submitForApprovalMutation.isPending || (!hasSufficientFunds && totalCost > 0) || (!!isPremium && premiumAmountValue < 100)}
                  onClick={() => setSubmitAction("submit")}
                  data-testid="button-submit-job"
                >
                  <Send className="w-4 h-4 mr-2" />
                  {isSubmitting && submitAction === "submit"
                    ? (submitForApprovalMutation.isPending ? "Submitting for review..." : "Saving...") 
                    : onCooldown && countdown
                      ? `Wait ${countdown}`
                      : (isEditMode ? "Update & Submit" : "Submit for Review")}
                </Button>
              </div>
            </form>
          </Form>
        </CardContent>
      </Card>
    </div>
  );
}
