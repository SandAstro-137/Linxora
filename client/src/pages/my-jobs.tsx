import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useAuth } from "@/lib/auth-context";
import { Link } from "wouter";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Briefcase, DollarSign, Calendar, User, X, Check, Trash2 } from "lucide-react";
import type { Job } from "@shared/schema";

type EnrichedJob = Job & { hasRating?: boolean };
import { formatDistanceToNow } from "date-fns";

export default function MyJobsPage() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [cancelDialogOpen, setCancelDialogOpen] = useState(false);
  const [selectedJob, setSelectedJob] = useState<Job | null>(null);
  const [cancelReason, setCancelReason] = useState("");

  // Get customer's jobs (all statuses)
  const { data: myJobs = [] } = useQuery<EnrichedJob[]>({
    queryKey: ["/api/my-jobs"],
  });

  const cancelJobMutation = useMutation({
    mutationFn: ({ jobId, reason }: { jobId: string; reason: string }) =>
      apiRequest("POST", "/api/cancellation-requests", { jobId, reason }),
    onSuccess: (data: any) => {
      queryClient.invalidateQueries({ queryKey: ["/api/jobs"] });
      queryClient.invalidateQueries({ queryKey: ["/api/my-jobs"] });
      queryClient.invalidateQueries({ queryKey: ["/api/profile/stats"] });
      setCancelDialogOpen(false);
      setCancelReason("");
      setSelectedJob(null);

      toast({
        title: data.approvalRequired ? "Cancellation being reviewed" : "Job cancelled",
        description: data.message,
      });
    },
    onError: (error: any) => {
      toast({
        title: "Failed to cancel job",
        description: error.message || "Please try again",
        variant: "destructive",
      });
    },
  });

  const handleCancelClick = (job: Job) => {
    setSelectedJob(job);
    setCancelDialogOpen(true);
  };

  const handleCancelSubmit = () => {
    if (!selectedJob) return;

    // For pending/active jobs, reason is optional
    // For claimed/in_progress jobs, reason is required
    const requiresApproval = selectedJob.status === "claimed" || selectedJob.status === "in_progress";
    
    if (requiresApproval && !cancelReason.trim()) {
      toast({
        title: "Reason required",
        description: "Please provide a reason for cancelling this active job",
        variant: "destructive",
      });
      return;
    }

    cancelJobMutation.mutate({
      jobId: selectedJob.id,
      reason: cancelReason.trim() || "Cancelled by customer",
    });
  };

  const archiveJobMutation = useMutation({
    mutationFn: (jobId: string) => apiRequest("POST", `/api/jobs/${jobId}/archive`, {}),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/my-jobs"] });
      toast({
        title: "Job cleared",
        description: "The job has been removed from your list",
      });
    },
    onError: (error: any) => {
      toast({
        title: "Failed to clear job",
        description: error.message || "Please try again",
        variant: "destructive",
      });
    },
  });

  const canClearJob = (job: EnrichedJob) => {
    // Cancelled jobs can always be cleared
    if (job.status === "cancelled") return true;
    // Completed jobs can only be cleared after rating the freelancer
    if (job.status === "completed") {
      // Jobs without a freelancer (edge case) can be cleared
      if (!job.freelancerId) return true;
      // Must have rating to clear
      return job.hasRating === true;
    }
    return false;
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case "pending":
        return "secondary";
      case "active":
        return "default";
      case "freelancer_requested":
        return "secondary";
      case "claimed":
      case "in_progress":
        return "default";
      case "completed":
        return "default";
      case "rejected":
        return "destructive";
      case "changes_requested":
        return "destructive";
      default:
        return "secondary";
    }
  };

  const canCancelJob = (job: Job) => {
    return ["pending", "active", "claimed", "in_progress"].includes(job.status);
  };

  if (myJobs.length === 0) {
    return (
      <div className="container mx-auto p-6 max-w-6xl">
        <Card data-testid="card-no-jobs">
          <CardHeader>
            <CardTitle>My Jobs</CardTitle>
            <CardDescription>You haven't posted any jobs yet</CardDescription>
          </CardHeader>
          <CardContent>
            <p className="text-muted-foreground mb-4">
              Start by posting your first job to find talented freelancers
            </p>
            <Link href="/jobs/create">
              <Button data-testid="button-post-first-job">Post a Job</Button>
            </Link>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="container mx-auto p-6 max-w-6xl">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-3xl font-bold" data-testid="text-page-title">
          My Jobs
        </h1>
        <Link href="/jobs/create">
          <Button data-testid="button-post-new-job">Post New Job</Button>
        </Link>
      </div>

      <div className="space-y-4">
        {myJobs.map((job) => {
          const isPending = job.status === "pending";
          const isRejected = job.status === "rejected";
          const needsChanges = job.status === "changes_requested";

          return (
            <Card
              key={job.id}
              className={isPending || isRejected || needsChanges ? "opacity-60" : ""}
              data-testid={`card-job-${job.id}`}
            >
              <CardHeader>
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-1 flex-wrap">
                      <CardTitle data-testid={`text-job-title-${job.id}`}>
                        {job.title}
                      </CardTitle>
                      <Badge variant={getStatusColor(job.status)} data-testid={`badge-status-${job.id}`}>
                        {job.status.replace("_", " ")}
                      </Badge>
                      {isPending && (
                        <Badge variant="secondary" data-testid={`badge-pending-${job.id}`}>
                          Awaiting Approval
                        </Badge>
                      )}
                      {needsChanges && (
                        <Badge variant="secondary" className="bg-yellow-500/10 text-yellow-700 dark:text-yellow-400" data-testid={`badge-needs-changes-${job.id}`}>
                          Action Required
                        </Badge>
                      )}
                    </div>
                    <CardDescription>{job.category}</CardDescription>
                  </div>
                  <div className="flex gap-2">
                    {canCancelJob(job) && (
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleCancelClick(job)}
                        data-testid={`button-cancel-${job.id}`}
                      >
                        <X className="w-4 h-4 mr-1" />
                        Cancel
                      </Button>
                    )}
                    {canClearJob(job) && (
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => archiveJobMutation.mutate(job.id)}
                        disabled={archiveJobMutation.isPending}
                        data-testid={`button-clear-${job.id}`}
                      >
                        <Trash2 className="w-4 h-4 mr-1" />
                        Clear
                      </Button>
                    )}
                  </div>
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                {(needsChanges || isRejected) && job.moderatorFeedback && (
                  <div className="bg-destructive/10 border border-destructive/20 rounded-md p-4">
                    <h4 className="font-semibold text-destructive mb-2">Moderator Feedback</h4>
                    <p className="text-sm whitespace-pre-wrap" data-testid={`text-moderator-feedback-${job.id}`}>
                      {job.moderatorFeedback}
                    </p>
                  </div>
                )}
                <p className="text-muted-foreground line-clamp-2" data-testid={`text-description-${job.id}`}>
                  {job.description}
                </p>

                <div className="flex flex-wrap gap-6">
                  <div className="flex items-center gap-2">
                    <DollarSign className="w-4 h-4 text-muted-foreground" />
                    <div>
                      <p className="text-sm text-muted-foreground">Budget</p>
                      <p className="font-semibold" data-testid={`text-budget-${job.id}`}>
                        ${job.budget}
                      </p>
                    </div>
                  </div>

                  {job.deadline && (
                    <div className="flex items-center gap-2">
                      <Calendar className="w-4 h-4 text-muted-foreground" />
                      <div>
                        <p className="text-sm text-muted-foreground">Deadline</p>
                        <p className="font-semibold" data-testid={`text-deadline-${job.id}`}>
                          {new Date(job.deadline).toLocaleDateString()}
                        </p>
                      </div>
                    </div>
                  )}

                  {job.freelancerId && (
                    <div className="flex items-center gap-2">
                      <User className="w-4 h-4 text-muted-foreground" />
                      <div>
                        <p className="text-sm text-muted-foreground">Assigned To</p>
                        <p className="font-semibold">Freelancer</p>
                      </div>
                    </div>
                  )}

                  <div className="flex items-center gap-2">
                    <Briefcase className="w-4 h-4 text-muted-foreground" />
                    <div>
                      <p className="text-sm text-muted-foreground">Posted</p>
                      <p className="font-semibold">
                        {formatDistanceToNow(new Date(job.createdAt!), { addSuffix: true })}
                      </p>
                    </div>
                  </div>
                </div>

                <div className="flex gap-2 flex-wrap">
                  <Link href={`/jobs/${job.id}`}>
                    <Button variant="outline" size="sm" data-testid={`button-view-details-${job.id}`}>
                      View Details
                    </Button>
                  </Link>
                  {(needsChanges || isRejected || isPending) && (
                    <Link href={`/jobs/create?edit=${job.id}`}>
                      <Button size="sm" data-testid={`button-edit-resubmit-${job.id}`}>
                        Edit & Resubmit
                      </Button>
                    </Link>
                  )}
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      {/* Cancel Job Dialog */}
      <Dialog open={cancelDialogOpen} onOpenChange={setCancelDialogOpen}>
        <DialogContent data-testid="dialog-cancel-job">
          <DialogHeader>
            <DialogTitle>Cancel Job</DialogTitle>
            <DialogDescription>
              {selectedJob?.status === "claimed" || selectedJob?.status === "in_progress"
                ? "This job is already assigned. Cancellation requires admin approval."
                : "This job will be cancelled immediately."}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            <div>
              <Label htmlFor="cancel-reason">
                Reason {(selectedJob?.status === "claimed" || selectedJob?.status === "in_progress") && "(Required)"}
              </Label>
              <Textarea
                id="cancel-reason"
                placeholder="Please provide a reason for cancelling..."
                value={cancelReason}
                onChange={(e) => setCancelReason(e.target.value)}
                className="mt-2"
                data-testid="textarea-cancel-reason"
              />
            </div>
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setCancelDialogOpen(false);
                setCancelReason("");
                setSelectedJob(null);
              }}
              data-testid="button-cancel-dialog-close"
            >
              Close
            </Button>
            <Button
              variant="destructive"
              onClick={handleCancelSubmit}
              disabled={cancelJobMutation.isPending}
              data-testid="button-cancel-job-confirm"
            >
              {cancelJobMutation.isPending ? "Cancelling..." : "Cancel Job"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
