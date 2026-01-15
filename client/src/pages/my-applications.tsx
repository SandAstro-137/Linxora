import { useQuery, useMutation } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { Briefcase, Clock, X, CheckCircle, XCircle, Eye } from "lucide-react";
import { toZonedTime, format as formatTz } from "date-fns-tz";

function formatToET(date: Date | string): string {
  const d = typeof date === "string" ? new Date(date) : date;
  const eastern = toZonedTime(d, "America/New_York");
  return formatTz(eastern, "MMM d, yyyy 'at' h:mm a 'ET'", { timeZone: "America/New_York" });
}
import { Link } from "wouter";

interface JobRequestWithJob {
  id: string;
  jobId: string;
  freelancerId: string;
  status: string;
  message: string | null;
  createdAt: string;
  updatedAt: string;
  job: {
    id: string;
    title: string;
    category: string;
    budget: string;
    status: string;
    customerId: string;
    deadline: string | null;
  };
}

function getStatusBadge(status: string) {
  switch (status) {
    case "pending":
      return <Badge variant="outline" className="text-yellow-600"><Clock className="w-3 h-3 mr-1" />Pending</Badge>;
    case "accepted":
      return <Badge className="bg-green-600"><CheckCircle className="w-3 h-3 mr-1" />Accepted</Badge>;
    case "rejected":
      return <Badge variant="destructive"><XCircle className="w-3 h-3 mr-1" />Rejected</Badge>;
    case "withdrawn":
      return <Badge variant="secondary"><X className="w-3 h-3 mr-1" />Withdrawn</Badge>;
    case "cancelled":
      return <Badge variant="secondary">Cancelled</Badge>;
    default:
      return <Badge variant="outline">{status}</Badge>;
  }
}

export default function MyApplicationsPage() {
  const { toast } = useToast();

  const { data: applications = [], isLoading } = useQuery<JobRequestWithJob[]>({
    queryKey: ["/api/my-job-requests"],
  });

  const withdrawMutation = useMutation({
    mutationFn: async (jobId: string) => {
      return apiRequest("POST", `/api/jobs/${jobId}/cancel-request`, {});
    },
    onSuccess: () => {
      toast({ title: "Application Withdrawn", description: "Your job application has been withdrawn." });
      queryClient.invalidateQueries({ queryKey: ["/api/my-job-requests"] });
    },
    onError: (error: Error) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });

  const pendingApplications = applications.filter(a => a.status === "pending");
  const otherApplications = applications.filter(a => a.status !== "pending");

  if (isLoading) {
    return (
      <div className="p-6 max-w-4xl mx-auto space-y-6">
        <Skeleton className="h-10 w-48" />
        <Skeleton className="h-48 w-full" />
        <Skeleton className="h-48 w-full" />
      </div>
    );
  }

  return (
    <div className="p-6 max-w-4xl mx-auto space-y-6">
      <div className="flex items-center gap-3">
        <Briefcase className="w-8 h-8 text-primary" />
        <div>
          <h1 className="text-2xl font-bold" data-testid="text-my-applications-title">My Job Applications</h1>
          <p className="text-muted-foreground">View and manage your job applications</p>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-4">
        <Card>
          <CardContent className="pt-6">
            <div className="text-center">
              <div className="text-3xl font-bold text-yellow-600" data-testid="text-pending-count">
                {pendingApplications.length}
              </div>
              <p className="text-sm text-muted-foreground">Pending</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="text-center">
              <div className="text-3xl font-bold text-green-600" data-testid="text-accepted-count">
                {applications.filter(a => a.status === "accepted").length}
              </div>
              <p className="text-sm text-muted-foreground">Accepted</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="text-center">
              <div className="text-3xl font-bold" data-testid="text-total-count">
                {applications.length}
              </div>
              <p className="text-sm text-muted-foreground">Total Applications</p>
            </div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Clock className="w-5 h-5" />
            Pending Applications
          </CardTitle>
          <CardDescription>
            You can apply to up to 5 jobs at a time. Currently: {pendingApplications.length}/5
          </CardDescription>
        </CardHeader>
        <CardContent>
          {pendingApplications.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <Briefcase className="w-12 h-12 mx-auto mb-4 opacity-50" />
              <p>No pending job applications.</p>
              <p className="text-sm">Browse the job board to find work!</p>
              <Link href="/jobs">
                <Button className="mt-4" data-testid="button-browse-jobs">Browse Jobs</Button>
              </Link>
            </div>
          ) : (
            <div className="space-y-4">
              {pendingApplications.map((application) => (
                <div
                  key={application.id}
                  className="flex items-center justify-between p-4 border rounded-lg"
                  data-testid={`application-${application.id}`}
                >
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-1">
                      <Link 
                        href={`/jobs/${application.jobId}`}
                        className="font-medium hover:underline"
                      >
                        {application.job.title}
                      </Link>
                      {getStatusBadge(application.status)}
                    </div>
                    <div className="flex items-center gap-4 text-sm text-muted-foreground">
                      <span>{application.job.category}</span>
                      <span>${parseFloat(application.job.budget).toFixed(2)}</span>
                      <span>Applied: {formatToET(application.createdAt)}</span>
                    </div>
                    {application.message && (
                      <p className="text-sm mt-2 text-muted-foreground italic">
                        "{application.message}"
                      </p>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    <Link href={`/jobs/${application.jobId}`}>
                      <Button size="sm" variant="outline" data-testid={`button-view-${application.id}`}>
                        <Eye className="w-4 h-4 mr-1" />
                        View Job
                      </Button>
                    </Link>
                    <Button
                      size="sm"
                      variant="destructive"
                      onClick={() => withdrawMutation.mutate(application.jobId)}
                      disabled={withdrawMutation.isPending}
                      data-testid={`button-withdraw-${application.id}`}
                    >
                      <X className="w-4 h-4 mr-1" />
                      Withdraw
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {otherApplications.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Application History</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {otherApplications.map((application) => (
                <div
                  key={application.id}
                  className="flex items-center justify-between p-4 border rounded-lg"
                  data-testid={`history-${application.id}`}
                >
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-1">
                      <Link 
                        href={`/jobs/${application.jobId}`}
                        className="font-medium hover:underline"
                      >
                        {application.job.title}
                      </Link>
                      {getStatusBadge(application.status)}
                    </div>
                    <div className="flex items-center gap-4 text-sm text-muted-foreground">
                      <span>{application.job.category}</span>
                      <span>${parseFloat(application.job.budget).toFixed(2)}</span>
                      <span>Applied: {formatToET(application.createdAt)}</span>
                    </div>
                  </div>
                  <Link href={`/jobs/${application.jobId}`}>
                    <Button size="sm" variant="outline" data-testid={`button-view-history-${application.id}`}>
                      <Eye className="w-4 h-4 mr-1" />
                      View
                    </Button>
                  </Link>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
