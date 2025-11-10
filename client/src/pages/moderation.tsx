import { useQuery, useMutation } from "@tanstack/react-query";
import { Job } from "@shared/schema";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Check, X, AlertCircle } from "lucide-react";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Skeleton } from "@/components/ui/skeleton";
import { formatDistanceToNow } from "date-fns";

export default function ModerationPage() {
  const { toast } = useToast();

  const { data: pendingJobs, isLoading } = useQuery<Job[]>({
    queryKey: ["/api/moderation/pending"],
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

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-3xl font-bold tracking-tight">Moderation Queue</h2>
          <p className="text-muted-foreground">
            Review and approve job postings before publication
          </p>
        </div>
        <Badge variant="secondary" className="text-lg px-4 py-2">
          {pendingJobs?.length || 0} pending
        </Badge>
      </div>

      {isLoading ? (
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
    </div>
  );
}
