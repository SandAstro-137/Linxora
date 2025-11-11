import { useRoute, useLocation } from "wouter";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Textarea } from "@/components/ui/textarea";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useAuth } from "@/lib/auth-context";
import { useToast } from "@/hooks/use-toast";
import { ArrowLeft, DollarSign, Clock, User, Users, Calendar, XCircle, Upload } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";

interface EnrichedJob {
  id: string;
  title: string;
  description: string;
  category: string;
  budget: string;
  requirements: string | null;
  deadline: Date | null;
  status: string;
  freelancerId: string | null;
  collaborators: string[] | null;
  customerUsername?: string;
  customerDiscordId?: string;
  collaboratorData?: Array<{
    id: string;
    username: string;
    avatar: string | null;
    specialization: string | null;
  }>;
  profitSplits?: Array<{
    userId: string;
    percentage: number;
    amount: string;
  }>;
  createdAt: Date;
  updatedAt: Date;
}

export default function JobDetailPage() {
  const [, params] = useRoute("/jobs/:id");
  const [, setLocation] = useLocation();
  const { user } = useAuth();
  const { toast } = useToast();
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedUser, setSelectedUser] = useState<any>(null);
  const [isInviteDialogOpen, setIsInviteDialogOpen] = useState(false);
  const [isCancelDialogOpen, setIsCancelDialogOpen] = useState(false);
  const [proofFile, setProofFile] = useState<File | null>(null);

  const cancellationFormSchema = z.object({
    reason: z.string().min(10, "Reason must be at least 10 characters"),
  });

  const cancellationForm = useForm<z.infer<typeof cancellationFormSchema>>({
    resolver: zodResolver(cancellationFormSchema),
    defaultValues: {
      reason: "",
    },
  });

  const jobId = params?.id;

  const { data: job, isLoading } = useQuery<EnrichedJob>({
    queryKey: ["/api/jobs", jobId],
    enabled: !!jobId,
  });

  const { data: searchResults = [] } = useQuery<any[]>({
    queryKey: ["/api/users/search", searchQuery],
    enabled: searchQuery.length > 2,
  });

  const claimJobMutation = useMutation({
    mutationFn: () => apiRequest("POST", `/api/jobs/${jobId}/claim`, {}),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/jobs", jobId] });
      queryClient.invalidateQueries({ queryKey: ["/api/jobs"] });
      toast({
        title: "Job claimed successfully!",
        description: "You can now start working on this job.",
      });
    },
    onError: () => {
      toast({
        title: "Failed to claim job",
        description: "Please try again later.",
        variant: "destructive",
      });
    },
  });

  const inviteMutation = useMutation({
    mutationFn: (userId: string) =>
      apiRequest("POST", `/api/jobs/${jobId}/invite`, { userId }),
    onSuccess: () => {
      setIsInviteDialogOpen(false);
      setSearchQuery("");
      setSelectedUser(null);
      toast({
        title: "Team invitation sent!",
        description: "The freelancer will be notified of your offer.",
      });
    },
    onError: () => {
      toast({
        title: "Failed to send invitation",
        description: "Please try again later.",
        variant: "destructive",
      });
    },
  });

  const cancelJobMutation = useMutation({
    mutationFn: async (data: z.infer<typeof cancellationFormSchema>) => {
      let proofUrl = null;

      if (proofFile) {
        const reader = new FileReader();
        const fileData = await new Promise<string>((resolve) => {
          reader.onloadend = () => resolve(reader.result as string);
          reader.readAsDataURL(proofFile);
        });

        const uploadResponse = await apiRequest("POST", "/api/uploads", {
          fileName: proofFile.name,
          fileData,
        }) as { url: string };
        proofUrl = uploadResponse.url;
      }

      return apiRequest("POST", "/api/cancellation-requests", {
        jobId: jobId!,
        requesterId: user!.id,
        reason: data.reason,
        proofUrl,
      });
    },
    onSuccess: (data: any) => {
      setIsCancelDialogOpen(false);
      cancellationForm.reset();
      setProofFile(null);
      queryClient.invalidateQueries({ queryKey: ["/api/jobs", jobId] });
      queryClient.invalidateQueries({ queryKey: ["/api/jobs"] });
      toast({
        title: data.approvalRequired ? "Cancellation being reviewed" : "Job cancelled",
        description: data.message,
      });
    },
    onError: (error: any) => {
      toast({
        title: "Failed to submit cancellation request",
        description: error.message || "Please try again later.",
        variant: "destructive",
      });
    },
  });

  if (isLoading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-10 w-full" />
        <Skeleton className="h-64 w-full" />
        <Skeleton className="h-32 w-full" />
      </div>
    );
  }

  if (!job) {
    return (
      <div className="text-center py-12">
        <p className="text-muted-foreground">Job not found</p>
        <Button
          variant="outline"
          onClick={() => setLocation("/jobs")}
          className="mt-4"
          data-testid="button-back-to-jobs"
        >
          <ArrowLeft className="w-4 h-4 mr-2" />
          Back to Jobs
        </Button>
      </div>
    );
  }

  const isJobTaken = job.status === "claimed" || job.status === "in_progress";
  const isEligibleToClaim = job.status === "active" && user?.role === "freelancer";
  const isJobOwner = job.freelancerId === user?.id;
  const canOfferTeam = isJobTaken && !isJobOwner;

  const getStatusColor = (status: string) => {
    switch (status) {
      case "pending":
        return "bg-yellow-500/10 text-yellow-700 dark:text-yellow-400";
      case "active":
        return "bg-green-500/10 text-green-700 dark:text-green-400";
      case "claimed":
        return "bg-blue-500/10 text-blue-700 dark:text-blue-400";
      case "in_progress":
        return "bg-purple-500/10 text-purple-700 dark:text-purple-400";
      case "completed":
        return "bg-gray-500/10 text-gray-700 dark:text-gray-400";
      default:
        return "bg-gray-500/10 text-gray-700 dark:text-gray-400";
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <Button
          variant="ghost"
          size="icon"
          onClick={() => setLocation("/jobs")}
          data-testid="button-back"
        >
          <ArrowLeft className="w-5 h-5" />
        </Button>
        <div className="flex-1">
          <h1 className="text-3xl font-bold" data-testid="text-job-title">
            {job.title}
          </h1>
          <div className="flex items-center gap-2 mt-2 flex-wrap">
            <Badge className={getStatusColor(job.status)} variant="secondary">
              {job.status}
            </Badge>
            <Badge variant="outline">{job.category}</Badge>
          </div>
        </div>
      </div>

      <div className="grid gap-6 md:grid-cols-3">
        <div className="md:col-span-2 space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Job Description</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <p className="text-muted-foreground whitespace-pre-wrap" data-testid="text-job-description">
                {job.description}
              </p>
              {job.requirements && (
                <>
                  <Separator />
                  <div>
                    <h3 className="font-semibold mb-2">Requirements</h3>
                    <p className="text-muted-foreground whitespace-pre-wrap">
                      {job.requirements}
                    </p>
                  </div>
                </>
              )}
            </CardContent>
          </Card>

          {job.profitSplits && job.profitSplits.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle>Team & Profit Sharing</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  {job.collaboratorData?.map((collaborator, index) => {
                    const split = job.profitSplits?.find(
                      (s) => s.userId === collaborator.id
                    );
                    return (
                      <div
                        key={collaborator.id}
                        className="flex items-center justify-between p-3 rounded-md bg-muted/50"
                        data-testid={`team-member-${index}`}
                      >
                        <div className="flex items-center gap-3">
                          <Avatar className="h-10 w-10">
                            <AvatarImage src={collaborator.avatar || undefined} />
                            <AvatarFallback>
                              {collaborator.username.charAt(0).toUpperCase()}
                            </AvatarFallback>
                          </Avatar>
                          <div>
                            <p className="font-medium">{collaborator.username}</p>
                            {collaborator.specialization && (
                              <p className="text-sm text-muted-foreground">
                                {collaborator.specialization}
                              </p>
                            )}
                          </div>
                        </div>
                        <div className="text-right">
                          <p className="font-semibold">${split?.amount}</p>
                          <p className="text-sm text-muted-foreground">
                            {split?.percentage}%
                          </p>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </CardContent>
            </Card>
          )}
        </div>

        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Job Details</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center gap-2 text-muted-foreground">
                <DollarSign className="w-4 h-4" />
                <div>
                  <p className="text-sm">Budget</p>
                  <p className="text-lg font-semibold text-foreground" data-testid="text-budget">
                    ${job.budget}
                  </p>
                </div>
              </div>
              {job.deadline && (
                <div className="flex items-center gap-2 text-muted-foreground">
                  <Clock className="w-4 h-4" />
                  <div>
                    <p className="text-sm">Deadline</p>
                    <p className="text-sm text-foreground">
                      {formatDistanceToNow(new Date(job.deadline), {
                        addSuffix: true,
                      })}
                    </p>
                  </div>
                </div>
              )}
              <div className="flex items-center gap-2 text-muted-foreground">
                <User className="w-4 h-4" />
                <div>
                  <p className="text-sm">Client</p>
                  <p className="text-sm text-foreground" data-testid="text-customer">
                    {job.customerUsername || "Unknown"}
                  </p>
                </div>
              </div>
              {job.collaboratorData && job.collaboratorData.length > 0 && (
                <div className="flex items-center gap-2 text-muted-foreground">
                  <Users className="w-4 h-4" />
                  <div>
                    <p className="text-sm">Team Size</p>
                    <p className="text-sm text-foreground">
                      {job.collaboratorData.length} member
                      {job.collaboratorData.length !== 1 ? "s" : ""}
                    </p>
                  </div>
                </div>
              )}
              <div className="flex items-center gap-2 text-muted-foreground">
                <Calendar className="w-4 h-4" />
                <div>
                  <p className="text-sm">Posted</p>
                  <p className="text-sm text-foreground">
                    {formatDistanceToNow(new Date(job.createdAt), {
                      addSuffix: true,
                    })}
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Actions</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {isEligibleToClaim && !isJobTaken && (
                <Button
                  className="w-full"
                  onClick={() => claimJobMutation.mutate()}
                  disabled={claimJobMutation.isPending}
                  data-testid="button-claim-job"
                >
                  {claimJobMutation.isPending ? "Claiming..." : "Request to Take Job"}
                </Button>
              )}
              {isJobTaken && (
                <Button
                  className="w-full"
                  variant="secondary"
                  disabled
                  data-testid="button-job-taken"
                >
                  Job Already Taken
                </Button>
              )}
              {canOfferTeam && (
                <Dialog open={isInviteDialogOpen} onOpenChange={setIsInviteDialogOpen}>
                  <DialogTrigger asChild>
                    <Button
                      className="w-full"
                      variant="outline"
                      data-testid="button-offer-team"
                    >
                      <Users className="w-4 h-4 mr-2" />
                      Offer Team
                    </Button>
                  </DialogTrigger>
                  <DialogContent>
                    <DialogHeader>
                      <DialogTitle>Invite Team Member</DialogTitle>
                      <DialogDescription>
                        Search for a freelancer to invite to this job. Profits will be
                        split equally among all team members.
                      </DialogDescription>
                    </DialogHeader>
                    <div className="space-y-4">
                      <div className="space-y-2">
                        <Label htmlFor="search">Search Freelancers</Label>
                        <Input
                          id="search"
                          placeholder="Search by username..."
                          value={searchQuery}
                          onChange={(e) => setSearchQuery(e.target.value)}
                          data-testid="input-search-freelancer"
                        />
                      </div>
                      {searchResults.length > 0 && (
                        <div className="space-y-2 max-h-64 overflow-y-auto">
                          {searchResults.map((result) => (
                            <div
                              key={result.id}
                              className={`flex items-center justify-between p-3 rounded-md border cursor-pointer hover-elevate ${
                                selectedUser?.id === result.id
                                  ? "bg-accent"
                                  : ""
                              }`}
                              onClick={() => setSelectedUser(result)}
                              data-testid={`freelancer-${result.id}`}
                            >
                              <div className="flex items-center gap-3">
                                <Avatar className="h-8 w-8">
                                  <AvatarImage src={result.avatar || undefined} />
                                  <AvatarFallback>
                                    {result.username.charAt(0).toUpperCase()}
                                  </AvatarFallback>
                                </Avatar>
                                <div>
                                  <p className="font-medium text-sm">
                                    {result.username}
                                  </p>
                                  {result.specialization && (
                                    <p className="text-xs text-muted-foreground">
                                      {result.specialization}
                                    </p>
                                  )}
                                </div>
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                    <DialogFooter>
                      <Button
                        onClick={() => {
                          if (selectedUser) {
                            inviteMutation.mutate(selectedUser.id);
                          }
                        }}
                        disabled={!selectedUser || inviteMutation.isPending}
                        data-testid="button-send-invitation"
                      >
                        {inviteMutation.isPending ? "Sending..." : "Send Invitation"}
                      </Button>
                    </DialogFooter>
                  </DialogContent>
                </Dialog>
              )}
              {isJobOwner && (job.status === "claimed" || job.status === "in_progress") && (
                <Dialog open={isCancelDialogOpen} onOpenChange={setIsCancelDialogOpen}>
                  <DialogTrigger asChild>
                    <Button
                      className="w-full"
                      variant="destructive"
                      data-testid="button-request-cancellation"
                    >
                      <XCircle className="w-4 h-4 mr-2" />
                      Request Cancellation
                    </Button>
                  </DialogTrigger>
                  <DialogContent>
                    <DialogHeader>
                      <DialogTitle>Request Job Cancellation</DialogTitle>
                      <DialogDescription>
                        Submit a cancellation request with a reason and proof. An admin will review your request.
                      </DialogDescription>
                    </DialogHeader>
                    <Form {...cancellationForm}>
                      <form onSubmit={cancellationForm.handleSubmit((data) => cancelJobMutation.mutate(data))} className="space-y-4">
                        <FormField
                          control={cancellationForm.control}
                          name="reason"
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel>Reason for Cancellation *</FormLabel>
                              <FormControl>
                                <Textarea
                                  placeholder="Explain why you need to cancel this job..."
                                  className="min-h-24"
                                  data-testid="textarea-cancel-reason"
                                  {...field}
                                />
                              </FormControl>
                              <FormMessage />
                            </FormItem>
                          )}
                        />
                        <div className="space-y-2">
                          <Label htmlFor="proof">Proof (Optional)</Label>
                          <div className="flex gap-2">
                            <Input
                              id="proof"
                              type="file"
                              accept="image/*,.pdf"
                              onChange={(e) => setProofFile(e.target.files?.[0] || null)}
                              data-testid="input-proof-file"
                            />
                            {proofFile && (
                              <Button
                                type="button"
                                variant="ghost"
                                size="icon"
                                onClick={() => setProofFile(null)}
                                data-testid="button-remove-proof"
                              >
                                <XCircle className="w-4 h-4" />
                              </Button>
                            )}
                          </div>
                          {proofFile && (
                            <p className="text-sm text-muted-foreground">
                              Selected: {proofFile.name}
                            </p>
                          )}
                        </div>
                        <DialogFooter>
                          <Button
                            type="button"
                            variant="outline"
                            onClick={() => {
                              setIsCancelDialogOpen(false);
                              cancellationForm.reset();
                              setProofFile(null);
                            }}
                            data-testid="button-cancel-dialog"
                          >
                            Cancel
                          </Button>
                          <Button
                            type="submit"
                            disabled={cancelJobMutation.isPending}
                            data-testid="button-submit-cancellation"
                          >
                            {cancelJobMutation.isPending ? "Submitting..." : "Submit Request"}
                          </Button>
                        </DialogFooter>
                      </form>
                    </Form>
                  </DialogContent>
                </Dialog>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
