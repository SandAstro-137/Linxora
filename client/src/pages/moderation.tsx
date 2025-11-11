import { useQuery, useMutation } from "@tanstack/react-query";
import { Job, CancellationRequest } from "@shared/schema";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Check, X, AlertCircle, FileText, ExternalLink } from "lucide-react";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Skeleton } from "@/components/ui/skeleton";
import { formatDistanceToNow } from "date-fns";

interface EnrichedCancellationRequest extends CancellationRequest {
  jobTitle?: string;
  freelancerUsername?: string;
}

export default function ModerationPage() {
  const { toast } = useToast();

  const { data: pendingJobs, isLoading: jobsLoading } = useQuery<Job[]>({
    queryKey: ["/api/moderation/pending"],
  });

  const { data: cancellationRequests, isLoading: requestsLoading } = useQuery<EnrichedCancellationRequest[]>({
    queryKey: ["/api/cancellation-requests"],
  });

  const approveMutation = useMutation({
    mutationFn: (jobId: string) =>
      apiRequest("POST", `/api/moderation/${jobId}/approve`, {}),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/moderation/pending"] });
      toast({
        title: "Job approved",
        description: "The job has been published to the marketplace.",
      });
    },
    onError: () => {
      toast({
        title: "Failed to approve job",
        description: "Please try again later.",
        variant: "destructive",
      });
    },
  });

  const rejectMutation = useMutation({
    mutationFn: (jobId: string) =>
      apiRequest("POST", `/api/moderation/${jobId}/reject`, {}),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/moderation/pending"] });
      toast({
        title: "Job rejected",
        description: "The job has been removed from the queue.",
      });
    },
    onError: () => {
      toast({
        title: "Failed to reject job",
        description: "Please try again later.",
        variant: "destructive",
      });
    },
  });

  const approveRequestMutation = useMutation({
    mutationFn: (requestId: string) =>
      apiRequest("POST", `/api/cancellation-requests/${requestId}/approve`, {}),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/cancellation-requests"] });
      toast({
        title: "Cancellation approved",
        description: "The job has been released back to the marketplace.",
      });
    },
    onError: () => {
      toast({
        title: "Failed to approve cancellation",
        description: "Please try again later.",
        variant: "destructive",
      });
    },
  });

  const declineRequestMutation = useMutation({
    mutationFn: (requestId: string) =>
      apiRequest("POST", `/api/cancellation-requests/${requestId}/decline`, {}),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/cancellation-requests"] });
      toast({
        title: "Cancellation declined",
        description: "The freelancer will continue working on the job.",
      });
    },
    onError: () => {
      toast({
        title: "Failed to decline cancellation",
        description: "Please try again later.",
        variant: "destructive",
      });
    },
  });

  const requestEvidenceMutation = useMutation({
    mutationFn: (requestId: string) =>
      apiRequest("POST", `/api/cancellation-requests/${requestId}/request-evidence`, {}),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/cancellation-requests"] });
      toast({
        title: "More evidence requested",
        description: "The freelancer will be notified to provide more information.",
      });
    },
    onError: () => {
      toast({
        title: "Failed to request evidence",
        description: "Please try again later.",
        variant: "destructive",
      });
    },
  });

  const pendingRequestsCount = cancellationRequests?.filter(r => r.status === "pending").length || 0;

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-3xl font-bold tracking-tight">Moderation Queue</h2>
        <p className="text-muted-foreground">
          Review and approve job postings and cancellation requests
        </p>
      </div>

      <Tabs defaultValue="jobs" className="space-y-4">
        <TabsList>
          <TabsTrigger value="jobs" data-testid="tab-jobs">
            Pending Jobs
            {pendingJobs && pendingJobs.length > 0 && (
              <Badge variant="secondary" className="ml-2">
                {pendingJobs.length}
              </Badge>
            )}
          </TabsTrigger>
          <TabsTrigger value="requests" data-testid="tab-requests">
            Cancellation Requests
            {pendingRequestsCount > 0 && (
              <Badge variant="secondary" className="ml-2">
                {pendingRequestsCount}
              </Badge>
            )}
          </TabsTrigger>
        </TabsList>

        <TabsContent value="jobs">
          {jobsLoading ? (
            <div className="space-y-4">
              {[1, 2, 3].map((i) => (
                <Skeleton key={i} className="h-48 w-full" />
              ))}
            </div>
          ) : pendingJobs && pendingJobs.length > 0 ? (
            <div className="space-y-4">
              {pendingJobs.map((job) => (
                <Card key={job.id} className="border-2" data-testid={`card-pending-job-${job.id}`}>
                  <CardHeader>
                    <div className="flex items-start justify-between gap-4 flex-wrap">
                      <div className="flex-1">
                        <CardTitle className="mb-2">{job.title}</CardTitle>
                        <div className="flex gap-2 flex-wrap">
                          <Badge variant="outline">{job.category}</Badge>
                          <Badge variant="secondary">${job.budget}</Badge>
                        </div>
                      </div>
                      <Badge variant="secondary" className="bg-yellow-500/10 text-yellow-700 dark:text-yellow-400">
                        Pending Review
                      </Badge>
                    </div>
                    <CardDescription className="mt-2">
                      Submitted {formatDistanceToNow(new Date(job.createdAt!), { addSuffix: true })}
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div>
                      <h4 className="font-semibold mb-2">Description</h4>
                      <p className="text-sm text-muted-foreground">{job.description}</p>
                    </div>

                    {job.requirements && (
                      <div>
                        <h4 className="font-semibold mb-2">Requirements</h4>
                        <p className="text-sm text-muted-foreground">{job.requirements}</p>
                      </div>
                    )}

                    {job.deadline && (
                      <div>
                        <h4 className="font-semibold mb-2">Deadline</h4>
                        <p className="text-sm text-muted-foreground">
                          {new Date(job.deadline).toLocaleDateString()}
                        </p>
                      </div>
                    )}

                    <div className="flex gap-2 pt-4 border-t flex-wrap">
                      <Button
                        onClick={() => approveMutation.mutate(job.id)}
                        disabled={approveMutation.isPending}
                        className="gap-2"
                        data-testid={`button-approve-${job.id}`}
                      >
                        <Check className="w-4 h-4" />
                        Approve
                      </Button>
                      <Button
                        variant="destructive"
                        onClick={() => rejectMutation.mutate(job.id)}
                        disabled={rejectMutation.isPending}
                        className="gap-2"
                        data-testid={`button-reject-${job.id}`}
                      >
                        <X className="w-4 h-4" />
                        Reject
                      </Button>
                      <Button
                        variant="outline"
                        className="gap-2"
                        data-testid={`button-request-changes-${job.id}`}
                      >
                        <AlertCircle className="w-4 h-4" />
                        Request Changes
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          ) : (
            <Card>
              <CardContent className="py-12">
                <div className="text-center">
                  <Check className="w-12 h-12 mx-auto mb-4 text-muted-foreground" />
                  <h3 className="text-lg font-semibold mb-2">All caught up!</h3>
                  <p className="text-muted-foreground">
                    No jobs pending moderation at the moment
                  </p>
                </div>
              </CardContent>
            </Card>
          )}
        </TabsContent>

        <TabsContent value="requests">
          {requestsLoading ? (
            <div className="space-y-4">
              {[1, 2, 3].map((i) => (
                <Skeleton key={i} className="h-48 w-full" />
              ))}
            </div>
          ) : cancellationRequests && cancellationRequests.length > 0 ? (
            <div className="space-y-4">
              {cancellationRequests.map((request) => (
                <Card key={request.id} className="border-2" data-testid={`card-request-${request.id}`}>
                  <CardHeader>
                    <div className="flex items-start justify-between gap-4 flex-wrap">
                      <div className="flex-1">
                        <CardTitle className="mb-2">
                          {request.jobTitle || "Unknown Job"}
                        </CardTitle>
                        <div className="flex gap-2 flex-wrap">
                          <Badge variant="outline">
                            By: {request.freelancerUsername || "Unknown"}
                          </Badge>
                          <Badge 
                            variant="secondary"
                            className={
                              request.status === "pending"
                                ? "bg-yellow-500/10 text-yellow-700 dark:text-yellow-400"
                                : request.status === "approved"
                                ? "bg-green-500/10 text-green-700 dark:text-green-400"
                                : request.status === "declined"
                                ? "bg-red-500/10 text-red-700 dark:text-red-400"
                                : "bg-blue-500/10 text-blue-700 dark:text-blue-400"
                            }
                          >
                            {request.status.replace("_", " ")}
                          </Badge>
                        </div>
                      </div>
                    </div>
                    <CardDescription className="mt-2">
                      Submitted {formatDistanceToNow(new Date(request.createdAt), { addSuffix: true })}
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div>
                      <h4 className="font-semibold mb-2">Reason</h4>
                      <p className="text-sm text-muted-foreground whitespace-pre-wrap">
                        {request.reason}
                      </p>
                    </div>

                    {request.proofUrl && (
                      <div>
                        <h4 className="font-semibold mb-2">Proof</h4>
                        <Button
                          variant="outline"
                          size="sm"
                          className="gap-2"
                          onClick={() => window.open(request.proofUrl!, "_blank")}
                          data-testid={`button-view-proof-${request.id}`}
                        >
                          <ExternalLink className="w-4 h-4" />
                          View Proof
                        </Button>
                      </div>
                    )}

                    {request.reviewNotes && (
                      <div>
                        <h4 className="font-semibold mb-2">Review Notes</h4>
                        <p className="text-sm text-muted-foreground whitespace-pre-wrap">
                          {request.reviewNotes}
                        </p>
                      </div>
                    )}

                    {request.status === "pending" && (
                      <div className="flex gap-2 pt-4 border-t flex-wrap">
                        <Button
                          onClick={() => approveRequestMutation.mutate(request.id)}
                          disabled={approveRequestMutation.isPending}
                          className="gap-2"
                          data-testid={`button-approve-request-${request.id}`}
                        >
                          <Check className="w-4 h-4" />
                          Approve
                        </Button>
                        <Button
                          variant="destructive"
                          onClick={() => declineRequestMutation.mutate(request.id)}
                          disabled={declineRequestMutation.isPending}
                          className="gap-2"
                          data-testid={`button-decline-request-${request.id}`}
                        >
                          <X className="w-4 h-4" />
                          Decline
                        </Button>
                        <Button
                          variant="outline"
                          onClick={() => requestEvidenceMutation.mutate(request.id)}
                          disabled={requestEvidenceMutation.isPending}
                          className="gap-2"
                          data-testid={`button-request-evidence-${request.id}`}
                        >
                          <FileText className="w-4 h-4" />
                          Request More Evidence
                        </Button>
                      </div>
                    )}
                  </CardContent>
                </Card>
              ))}
            </div>
          ) : (
            <Card>
              <CardContent className="py-12">
                <div className="text-center">
                  <Check className="w-12 h-12 mx-auto mb-4 text-muted-foreground" />
                  <h3 className="text-lg font-semibold mb-2">No cancellation requests</h3>
                  <p className="text-muted-foreground">
                    All cancellation requests have been processed
                  </p>
                </div>
              </CardContent>
            </Card>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}
