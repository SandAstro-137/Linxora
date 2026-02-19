import { useQuery, useMutation } from "@tanstack/react-query";
import { Job, CancellationRequest, Report, PTORequest } from "@shared/schema";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Check, X, AlertCircle, FileText, ExternalLink, Flag, MessageSquare, User, Briefcase, Calendar, Gavel, Users, Star, Lock, CheckCircle, XCircle } from "lucide-react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/lib/auth-context";
import { Skeleton } from "@/components/ui/skeleton";
import { formatDistanceToNow, format } from "date-fns";
import { formatEasternDateTime, TIMEZONE_LABEL } from "@/lib/timezone";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { useState, useEffect } from "react";
import { Link, useSearch } from "wouter";

interface EnrichedCancellationRequest extends CancellationRequest {
  jobTitle?: string;
  freelancerUsername?: string;
}

interface EnrichedPTORequest extends PTORequest {
  freelancerUsername?: string;
  freelancerAvatar?: string | null;
}

interface EnrichedDispute {
  id: string;
  jobId: string;
  openedByUserId: string;
  reason: string;
  status: string;
  moderatorId: string | null;
  resolution: string | null;
  freelancerAmount: string | null;
  customerRefund: string | null;
  createdAt: Date;
  updatedAt: Date;
  jobTitle?: string;
  jobBudget?: string;
  openedByUsername?: string;
  moderatorUsername?: string;
}

interface EnrichedRoleUpgradeRequest {
  id: string;
  userId: string;
  upgradeType: string;
  reason: string;
  experience: string | null;
  portfolio: string | null;
  status: string;
  reviewerId: string | null;
  reviewNotes: string | null;
  createdAt: Date;
  updatedAt: Date;
  user: {
    id: string;
    username: string;
    avatar: string | null;
    role: string;
    completedJobs: number;
    level: number;
    rating: string;
  } | null;
}

export default function ModerationPage() {
  const { toast } = useToast();
  const { user: currentUser } = useAuth();
  const searchString = useSearch();
  const searchParams = new URLSearchParams(searchString);
  const tabFromUrl = searchParams.get("tab");
  const [activeTab, setActiveTab] = useState(tabFromUrl || "jobs");

  useEffect(() => {
    if (tabFromUrl) {
      setActiveTab(tabFromUrl);
    }
  }, [tabFromUrl]);

  const [requestChangesDialogOpen, setRequestChangesDialogOpen] = useState(false);
  const [selectedJob, setSelectedJob] = useState<Job | null>(null);
  const [changesFeedback, setChangesFeedback] = useState("");

  const { data: pendingJobs, isLoading: jobsLoading } = useQuery<Job[]>({
    queryKey: ["/api/moderation/pending"],
  });

  const { data: cancellationRequests, isLoading: requestsLoading } = useQuery<EnrichedCancellationRequest[]>({
    queryKey: ["/api/cancellation-requests"],
  });

  const { data: pendingReports, isLoading: reportsLoading } = useQuery<Report[]>({
    queryKey: ["/api/reports/pending"],
  });

  const { data: pendingPTORequests, isLoading: ptoLoading } = useQuery<EnrichedPTORequest[]>({
    queryKey: ["/api/pto/pending"],
  });

  const { data: disputes, isLoading: disputesLoading } = useQuery<EnrichedDispute[]>({
    queryKey: ["/api/disputes"],
  });

  const { data: roleUpgradeRequests = [], isLoading: upgradesLoading } = useQuery<EnrichedRoleUpgradeRequest[]>({
    queryKey: ["/api/role-upgrade-requests/pending"],
  });

  const [upgradeReviewNotes, setUpgradeReviewNotes] = useState<Record<string, string>>({});
  const canApproveModeratorPromotion = currentUser?.role === "founder" || currentUser?.role === "head_of_moderation";

  const reviewUpgradeMutation = useMutation({
    mutationFn: async ({ id, status, notes }: { id: string; status: string; notes?: string }) => {
      return apiRequest("PATCH", `/api/role-upgrade-requests/${id}`, { status, reviewNotes: notes });
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ["/api/role-upgrade-requests/pending"] });
      toast({
        title: variables.status === "approved" ? "Request Approved" : "Request Rejected",
        description: variables.status === "approved" 
          ? "The user's role has been upgraded." 
          : "The upgrade request has been declined.",
      });
      setUpgradeReviewNotes((prev) => {
        const newNotes = { ...prev };
        delete newNotes[variables.id];
        return newNotes;
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: error.message || "Failed to process request",
        variant: "destructive",
      });
    },
  });

  const [disputeDialogOpen, setDisputeDialogOpen] = useState(false);
  const [selectedDispute, setSelectedDispute] = useState<EnrichedDispute | null>(null);
  const [disputeResolution, setDisputeResolution] = useState("");
  const [freelancerAmount, setFreelancerAmount] = useState("");
  const [customerRefund, setCustomerRefund] = useState("");

  const claimDisputeMutation = useMutation({
    mutationFn: (disputeId: string) =>
      apiRequest("POST", `/api/disputes/${disputeId}/claim`, {}),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/disputes"] });
      toast({
        title: "Dispute claimed",
        description: "You are now handling this dispute.",
      });
    },
    onError: () => {
      toast({
        title: "Failed to claim dispute",
        description: "Please try again later.",
        variant: "destructive",
      });
    },
  });

  const resolveDisputeMutation = useMutation({
    mutationFn: ({ disputeId, resolution, freelancerAmount, customerRefund }: { 
      disputeId: string; 
      resolution: string; 
      freelancerAmount: string; 
      customerRefund: string;
    }) =>
      apiRequest("POST", `/api/disputes/${disputeId}/resolve`, { 
        resolution, 
        freelancerAmount: parseFloat(freelancerAmount), 
        customerRefund: parseFloat(customerRefund) 
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/disputes"] });
      setDisputeDialogOpen(false);
      setSelectedDispute(null);
      setDisputeResolution("");
      setFreelancerAmount("");
      setCustomerRefund("");
      toast({
        title: "Dispute resolved",
        description: "The funds have been distributed according to your decision.",
      });
    },
    onError: (error: any) => {
      toast({
        title: "Failed to resolve dispute",
        description: error.message || "Please try again later.",
        variant: "destructive",
      });
    },
  });

  const openDisputes = disputes?.filter(d => d.status === "open") || [];
  const inProgressDisputes = disputes?.filter(d => d.status === "in_progress") || [];

  const approvePTOMutation = useMutation({
    mutationFn: (ptoId: string) =>
      apiRequest("POST", `/api/pto/${ptoId}/approve`, {}),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/pto/pending"] });
      toast({
        title: "PTO approved",
        description: "The freelancer has been notified.",
      });
    },
    onError: () => {
      toast({
        title: "Failed to approve PTO",
        description: "Please try again later.",
        variant: "destructive",
      });
    },
  });

  const rejectPTOMutation = useMutation({
    mutationFn: (ptoId: string) =>
      apiRequest("POST", `/api/pto/${ptoId}/reject`, {}),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/pto/pending"] });
      toast({
        title: "PTO rejected",
        description: "The freelancer has been notified.",
      });
    },
    onError: () => {
      toast({
        title: "Failed to reject PTO",
        description: "Please try again later.",
        variant: "destructive",
      });
    },
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

  const requestChangesMutation = useMutation({
    mutationFn: ({ jobId, feedback }: { jobId: string; feedback: string }) =>
      apiRequest("POST", `/api/moderation/${jobId}/request-changes`, { feedback }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/moderation/pending"] });
      setRequestChangesDialogOpen(false);
      setChangesFeedback("");
      setSelectedJob(null);
      toast({
        title: "Changes requested",
        description: "The customer has been notified of the required changes.",
      });
    },
    onError: () => {
      toast({
        title: "Failed to request changes",
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
  const pendingReportsCount = pendingReports?.length || 0;

  const [selectedReport, setSelectedReport] = useState<Report | null>(null);
  const [reportReviewNotes, setReportReviewNotes] = useState("");
  const [reportReviewDialogOpen, setReportReviewDialogOpen] = useState(false);

  const updateReportMutation = useMutation({
    mutationFn: ({ reportId, status, reviewNotes }: { reportId: string; status: string; reviewNotes?: string }) =>
      apiRequest("PATCH", `/api/reports/${reportId}`, { status, reviewNotes }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/reports/pending"] });
      setReportReviewDialogOpen(false);
      setSelectedReport(null);
      setReportReviewNotes("");
      toast({
        title: "Report updated",
        description: "The report status has been updated.",
      });
    },
    onError: () => {
      toast({
        title: "Failed to update report",
        description: "Please try again later.",
        variant: "destructive",
      });
    },
  });

  const getReportTypeIcon = (type: string) => {
    switch (type) {
      case "job": return <Briefcase className="w-4 h-4" />;
      case "user": return <User className="w-4 h-4" />;
      case "message": return <MessageSquare className="w-4 h-4" />;
      default: return <Flag className="w-4 h-4" />;
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-3xl font-bold tracking-tight">Moderation Queue</h2>
        <p className="text-muted-foreground">
          Review and approve job postings, cancellation requests, and user reports
        </p>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-4">
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
          <TabsTrigger value="reports" data-testid="tab-reports">
            <Flag className="w-4 h-4 mr-1" />
            Reports
            {pendingReportsCount > 0 && (
              <Badge variant="secondary" className="ml-2">
                {pendingReportsCount}
              </Badge>
            )}
          </TabsTrigger>
          <TabsTrigger value="pto" data-testid="tab-pto">
            <Calendar className="w-4 h-4 mr-1" />
            PTO Requests
            {pendingPTORequests && pendingPTORequests.length > 0 && (
              <Badge variant="secondary" className="ml-2">
                {pendingPTORequests.length}
              </Badge>
            )}
          </TabsTrigger>
          <TabsTrigger value="disputes" data-testid="tab-disputes">
            <Gavel className="w-4 h-4 mr-1" />
            Disputes
            {(openDisputes.length + inProgressDisputes.length) > 0 && (
              <Badge variant="secondary" className="ml-2">
                {openDisputes.length + inProgressDisputes.length}
              </Badge>
            )}
          </TabsTrigger>
          <TabsTrigger value="upgrades" data-testid="tab-upgrades">
            <Users className="w-4 h-4 mr-1" />
            Role Upgrades
            {roleUpgradeRequests.length > 0 && (
              <Badge variant="secondary" className="ml-2">
                {roleUpgradeRequests.length}
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
                        onClick={() => {
                          setSelectedJob(job);
                          setRequestChangesDialogOpen(true);
                        }}
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
                      Submitted {request.createdAt ? formatDistanceToNow(new Date(request.createdAt), { addSuffix: true }) : "Unknown"}
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

        <TabsContent value="reports">
          {reportsLoading ? (
            <div className="space-y-4">
              {[1, 2, 3].map((i) => (
                <Skeleton key={i} className="h-48 w-full" />
              ))}
            </div>
          ) : pendingReports && pendingReports.length > 0 ? (
            <div className="space-y-4">
              {pendingReports.map((report) => (
                <Card key={report.id} className="border-2" data-testid={`card-report-${report.id}`}>
                  <CardHeader>
                    <div className="flex items-start justify-between gap-4 flex-wrap">
                      <div className="flex-1">
                        <div className="flex items-center gap-2 mb-2">
                          {getReportTypeIcon(report.reportType)}
                          <CardTitle className="text-lg">
                            {report.reportType.charAt(0).toUpperCase() + report.reportType.slice(1)} Report
                          </CardTitle>
                        </div>
                        <div className="flex gap-2 flex-wrap">
                          <Badge variant="outline">{report.reportType}</Badge>
                          <Badge variant="secondary" className="bg-yellow-500/10 text-yellow-700 dark:text-yellow-400">
                            Pending Review
                          </Badge>
                        </div>
                      </div>
                    </div>
                    <CardDescription className="mt-2">
                      Submitted {report.createdAt ? formatDistanceToNow(new Date(report.createdAt), { addSuffix: true }) : "Unknown"}
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div>
                      <h4 className="font-semibold mb-2">Reason</h4>
                      <p className="text-sm text-muted-foreground">{report.reason}</p>
                    </div>

                    {report.description && (
                      <div>
                        <h4 className="font-semibold mb-2">Additional Details</h4>
                        <p className="text-sm text-muted-foreground whitespace-pre-wrap">
                          {report.description}
                        </p>
                      </div>
                    )}

                    <div>
                      <h4 className="font-semibold mb-2">Target ID</h4>
                      <p className="text-sm text-muted-foreground font-mono">{report.targetId}</p>
                    </div>

                    {/* Context-specific actions based on report type */}
                    <div className="flex gap-2 pt-2 flex-wrap">
                      {report.reportType === "job" && (
                        <Button
                          variant="outline"
                          size="sm"
                          asChild
                          data-testid={`button-view-job-${report.id}`}
                        >
                          <Link href={`/jobs/${report.targetId}`}>
                            <Briefcase className="w-4 h-4 mr-1" />
                            View Reported Job
                          </Link>
                        </Button>
                      )}
                      {report.reportType === "user" && (
                        <Button
                          variant="outline"
                          size="sm"
                          asChild
                          data-testid={`button-view-user-${report.id}`}
                        >
                          <Link href={`/profile/${report.targetId}`}>
                            <User className="w-4 h-4 mr-1" />
                            View Reported User
                          </Link>
                        </Button>
                      )}
                    </div>

                    <div className="flex gap-2 pt-4 border-t flex-wrap">
                      <Button
                        onClick={() => {
                          setSelectedReport(report);
                          setReportReviewNotes("");
                          setReportReviewDialogOpen(true);
                        }}
                        className="gap-2"
                        data-testid={`button-resolve-report-${report.id}`}
                      >
                        <Check className="w-4 h-4" />
                        Resolve
                      </Button>
                      <Button
                        variant="outline"
                        onClick={() => {
                          setSelectedReport(report);
                          setReportReviewNotes("");
                          setReportReviewDialogOpen(true);
                        }}
                        className="gap-2"
                        data-testid={`button-review-report-${report.id}`}
                      >
                        <FileText className="w-4 h-4" />
                        Mark Reviewed
                      </Button>
                      <Button
                        variant="ghost"
                        onClick={() => {
                          setSelectedReport(report);
                          setReportReviewNotes("");
                          setReportReviewDialogOpen(true);
                        }}
                        className="gap-2 text-muted-foreground"
                        data-testid={`button-dismiss-report-${report.id}`}
                      >
                        <X className="w-4 h-4" />
                        Dismiss
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
                  <Flag className="w-12 h-12 mx-auto mb-4 text-muted-foreground" />
                  <h3 className="text-lg font-semibold mb-2">No pending reports</h3>
                  <p className="text-muted-foreground">
                    All reports have been processed
                  </p>
                </div>
              </CardContent>
            </Card>
          )}
        </TabsContent>

        <TabsContent value="pto">
          {ptoLoading ? (
            <div className="space-y-4">
              {[1, 2, 3].map((i) => (
                <Skeleton key={i} className="h-32 w-full" />
              ))}
            </div>
          ) : pendingPTORequests && pendingPTORequests.length > 0 ? (
            <div className="space-y-4">
              {pendingPTORequests.map((request) => (
                <Card key={request.id} className="border-2" data-testid={`card-pto-${request.id}`}>
                  <CardHeader>
                    <div className="flex items-start justify-between gap-4 flex-wrap">
                      <div className="flex-1">
                        <CardTitle className="mb-2 flex items-center gap-2">
                          <Calendar className="w-5 h-5" />
                          PTO Request from {request.freelancerUsername || "Unknown Freelancer"}
                        </CardTitle>
                        <CardDescription>
                          Submitted {formatDistanceToNow(new Date(request.createdAt!), { addSuffix: true })}
                        </CardDescription>
                      </div>
                      <div className="flex gap-2 flex-wrap">
                        <Button
                          variant="default"
                          size="sm"
                          onClick={() => approvePTOMutation.mutate(request.id)}
                          disabled={approvePTOMutation.isPending || rejectPTOMutation.isPending}
                          data-testid={`button-approve-pto-${request.id}`}
                        >
                          <Check className="w-4 h-4 mr-1" />
                          Approve
                        </Button>
                        <Button
                          variant="destructive"
                          size="sm"
                          onClick={() => rejectPTOMutation.mutate(request.id)}
                          disabled={approvePTOMutation.isPending || rejectPTOMutation.isPending}
                          data-testid={`button-reject-pto-${request.id}`}
                        >
                          <X className="w-4 h-4 mr-1" />
                          Reject
                        </Button>
                      </div>
                    </div>
                  </CardHeader>
                  <CardContent>
                    <div className="grid gap-4 sm:grid-cols-2">
                      <div>
                        <p className="text-sm font-medium text-muted-foreground">Start Date</p>
                        <p className="text-sm">{format(new Date(request.startDate), "PPP")}</p>
                      </div>
                      <div>
                        <p className="text-sm font-medium text-muted-foreground">End Date</p>
                        <p className="text-sm">{format(new Date(request.endDate), "PPP")}</p>
                      </div>
                      {request.reason && (
                        <div className="sm:col-span-2">
                          <p className="text-sm font-medium text-muted-foreground">Reason</p>
                          <p className="text-sm">{request.reason}</p>
                        </div>
                      )}
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          ) : (
            <Card>
              <CardContent className="pt-6">
                <div className="text-center">
                  <Calendar className="w-12 h-12 mx-auto mb-4 text-muted-foreground" />
                  <h3 className="text-lg font-semibold mb-2">No pending PTO requests</h3>
                  <p className="text-muted-foreground">
                    All PTO requests have been processed
                  </p>
                </div>
              </CardContent>
            </Card>
          )}
        </TabsContent>

        <TabsContent value="disputes">
          {disputesLoading ? (
            <div className="space-y-4">
              {[1, 2, 3].map((i) => (
                <Skeleton key={i} className="h-48 w-full" />
              ))}
            </div>
          ) : (openDisputes.length + inProgressDisputes.length) > 0 ? (
            <div className="space-y-4">
              {[...openDisputes, ...inProgressDisputes].map((dispute) => (
                <Card key={dispute.id} className="border-2" data-testid={`card-dispute-${dispute.id}`}>
                  <CardHeader>
                    <div className="flex items-start justify-between gap-4 flex-wrap">
                      <div className="flex-1">
                        <CardTitle className="mb-2 flex items-center gap-2">
                          <Gavel className="w-5 h-5" />
                          {dispute.jobTitle || "Dispute"}
                        </CardTitle>
                        <div className="flex gap-2 flex-wrap">
                          {dispute.jobBudget && (
                            <Badge variant="secondary">${dispute.jobBudget}</Badge>
                          )}
                        </div>
                      </div>
                      <Badge variant={dispute.status === "open" ? "destructive" : "outline"}>
                        {dispute.status === "open" ? "Open" : "In Progress"}
                      </Badge>
                    </div>
                    <CardDescription className="mt-2">
                      Opened {formatDistanceToNow(new Date(dispute.createdAt), { addSuffix: true })}
                      {dispute.openedByUsername && ` by ${dispute.openedByUsername}`}
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div>
                      <h4 className="font-semibold mb-2">Reason for Dispute</h4>
                      <p className="text-sm text-muted-foreground">{dispute.reason}</p>
                    </div>

                    {dispute.moderatorUsername && (
                      <div className="flex items-center gap-2 text-sm text-muted-foreground">
                        <User className="w-4 h-4" />
                        <span>Assigned to: {dispute.moderatorUsername}</span>
                      </div>
                    )}

                    <div className="flex gap-2 flex-wrap pt-2">
                      <Link href={`/jobs/${dispute.jobId}`}>
                        <Button variant="outline" size="sm" data-testid={`button-view-job-${dispute.id}`}>
                          <ExternalLink className="w-4 h-4 mr-1" />
                          View Job
                        </Button>
                      </Link>
                      {dispute.status === "open" && (
                        <Button
                          size="sm"
                          onClick={() => claimDisputeMutation.mutate(dispute.id)}
                          disabled={claimDisputeMutation.isPending}
                          data-testid={`button-claim-dispute-${dispute.id}`}
                        >
                          <Check className="w-4 h-4 mr-1" />
                          {claimDisputeMutation.isPending ? "Claiming..." : "Claim Dispute"}
                        </Button>
                      )}
                      {dispute.status === "in_progress" && (
                        <Button
                          size="sm"
                          onClick={() => {
                            setSelectedDispute(dispute);
                            setFreelancerAmount(dispute.jobBudget || "0");
                            setCustomerRefund("0");
                            setDisputeDialogOpen(true);
                          }}
                          data-testid={`button-resolve-dispute-${dispute.id}`}
                        >
                          <Gavel className="w-4 h-4 mr-1" />
                          Resolve Dispute
                        </Button>
                      )}
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          ) : (
            <Card>
              <CardContent className="pt-6">
                <div className="text-center">
                  <Gavel className="w-12 h-12 mx-auto mb-4 text-muted-foreground" />
                  <h3 className="text-lg font-semibold mb-2">No active disputes</h3>
                  <p className="text-muted-foreground">
                    All disputes have been resolved
                  </p>
                </div>
              </CardContent>
            </Card>
          )}
        </TabsContent>

        <TabsContent value="upgrades">
          {upgradesLoading ? (
            <div className="space-y-4">
              {[1, 2].map((i) => (
                <Skeleton key={i} className="h-48 w-full" />
              ))}
            </div>
          ) : roleUpgradeRequests.length === 0 ? (
            <Card>
              <CardContent className="pt-6">
                <div className="text-center">
                  <Users className="w-12 h-12 mx-auto mb-4 text-muted-foreground" />
                  <h3 className="text-lg font-semibold mb-2">No pending role upgrade requests</h3>
                  <p className="text-muted-foreground">
                    Role upgrade applications will appear here for review
                  </p>
                </div>
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-4">
              <p className="text-sm text-muted-foreground">All times are in {TIMEZONE_LABEL}</p>
              {roleUpgradeRequests.map((request) => (
                <Card key={request.id} data-testid={`card-upgrade-${request.id}`}>
                  <CardHeader>
                    <div className="flex items-start justify-between gap-4 flex-wrap">
                      <div className="flex items-center gap-3">
                        <Avatar>
                          <AvatarImage src={request.user?.avatar || undefined} />
                          <AvatarFallback>
                            {request.user?.username?.charAt(0).toUpperCase() || "?"}
                          </AvatarFallback>
                        </Avatar>
                        <div>
                          <CardTitle className="text-lg">{request.user?.username || "Unknown User"}</CardTitle>
                          <CardDescription>
                            {request.upgradeType === "customer_to_freelancer"
                              ? "Requesting: Customer → Freelancer"
                              : "Requesting: Freelancer → Moderator"}
                          </CardDescription>
                        </div>
                      </div>
                      <Badge variant="secondary" className="bg-yellow-500/10 text-yellow-700 dark:text-yellow-400">
                        Pending Review
                      </Badge>
                    </div>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    {request.user && (
                      <div className="flex flex-wrap gap-4 text-sm">
                        <div className="flex items-center gap-1">
                          <Briefcase className="w-4 h-4 text-muted-foreground" />
                          <span>{request.user.completedJobs || 0} completed jobs</span>
                        </div>
                        <div className="flex items-center gap-1">
                          <Star className="w-4 h-4 text-muted-foreground" />
                          <span>Level {request.user.level || 1}</span>
                        </div>
                        {Number(request.user.rating) > 0 && (
                          <div className="flex items-center gap-1">
                            <Star className="w-4 h-4 text-yellow-500" />
                            <span>{Number(request.user.rating).toFixed(1)} rating</span>
                          </div>
                        )}
                      </div>
                    )}

                    <div className="space-y-2">
                      <p className="font-medium">Reason for Request:</p>
                      <p className="text-muted-foreground">{request.reason}</p>
                    </div>

                    {request.experience && (
                      <div className="space-y-2">
                        <p className="font-medium">Experience:</p>
                        <p className="text-muted-foreground">{request.experience}</p>
                      </div>
                    )}

                    {request.portfolio && (
                      <div className="space-y-2">
                        <p className="font-medium">Portfolio:</p>
                        <a
                          href={request.portfolio}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-primary hover:underline"
                        >
                          {request.portfolio}
                        </a>
                      </div>
                    )}

                    <p className="text-xs text-muted-foreground">
                      Submitted {formatEasternDateTime(request.createdAt)} (ET)
                    </p>

                    <div className="space-y-2 pt-4 border-t">
                      <label className="text-sm font-medium">Review Notes (optional):</label>
                      <Textarea
                        placeholder="Add notes about your decision..."
                        value={upgradeReviewNotes[request.id] || ""}
                        onChange={(e) => setUpgradeReviewNotes((prev) => ({ ...prev, [request.id]: e.target.value }))}
                        data-testid={`input-upgrade-notes-${request.id}`}
                      />
                    </div>

                    {request.upgradeType === "freelancer_to_moderator" && !canApproveModeratorPromotion ? (
                      <div className="flex items-center gap-2 pt-2 p-3 rounded-md bg-muted/50 text-muted-foreground">
                        <Lock className="w-4 h-4" />
                        <span className="text-sm">Only Founder or Head of Moderation can approve moderator promotions</span>
                      </div>
                    ) : (
                      <div className="flex gap-2 pt-2">
                        <Button
                          onClick={() => reviewUpgradeMutation.mutate({ 
                            id: request.id, 
                            status: "approved",
                            notes: upgradeReviewNotes[request.id]
                          })}
                          disabled={reviewUpgradeMutation.isPending}
                          className="flex-1"
                          data-testid={`button-approve-upgrade-${request.id}`}
                        >
                          <CheckCircle className="w-4 h-4 mr-2" />
                          Approve
                        </Button>
                        <Button
                          variant="destructive"
                          onClick={() => reviewUpgradeMutation.mutate({ 
                            id: request.id, 
                            status: "rejected",
                            notes: upgradeReviewNotes[request.id]
                          })}
                          disabled={reviewUpgradeMutation.isPending}
                          className="flex-1"
                          data-testid={`button-reject-upgrade-${request.id}`}
                        >
                          <XCircle className="w-4 h-4 mr-2" />
                          Reject
                        </Button>
                      </div>
                    )}
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </TabsContent>
      </Tabs>

      <Dialog open={disputeDialogOpen} onOpenChange={setDisputeDialogOpen}>
        <DialogContent data-testid="dialog-resolve-dispute">
          <DialogHeader>
            <DialogTitle>Resolve Dispute</DialogTitle>
            <DialogDescription>
              Decide how to split the funds between the freelancer and customer.
              Total budget: ${selectedDispute?.jobBudget || "0"}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="freelancerAmount">Amount to Freelancer ($)</Label>
              <Input
                type="number"
                id="freelancerAmount"
                value={freelancerAmount}
                onChange={(e) => setFreelancerAmount(e.target.value)}
                step="0.01"
                min="0"
                data-testid="input-freelancer-amount"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="customerRefund">Refund to Customer ($)</Label>
              <Input
                type="number"
                id="customerRefund"
                value={customerRefund}
                onChange={(e) => setCustomerRefund(e.target.value)}
                step="0.01"
                min="0"
                data-testid="input-customer-refund"
              />
            </div>
            {selectedDispute && (
              <p className="text-sm text-muted-foreground">
                Total: ${(parseFloat(freelancerAmount || "0") + parseFloat(customerRefund || "0")).toFixed(2)} / ${selectedDispute.jobBudget || "0"}
              </p>
            )}
            <div className="space-y-2">
              <Label htmlFor="resolution">Resolution Notes</Label>
              <Textarea
                id="resolution"
                placeholder="Explain your decision..."
                value={disputeResolution}
                onChange={(e) => setDisputeResolution(e.target.value)}
                rows={4}
                data-testid="textarea-resolution"
              />
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setDisputeDialogOpen(false);
                setSelectedDispute(null);
                setDisputeResolution("");
                setFreelancerAmount("");
                setCustomerRefund("");
              }}
              data-testid="button-cancel-resolve"
            >
              Cancel
            </Button>
            <Button
              onClick={() => {
                if (!selectedDispute || !disputeResolution.trim()) return;
                
                const freelancerAmt = parseFloat(freelancerAmount || "0");
                const customerAmt = parseFloat(customerRefund || "0");
                const budget = parseFloat(selectedDispute.jobBudget || "0");
                
                if (isNaN(freelancerAmt) || isNaN(customerAmt) || freelancerAmt < 0 || customerAmt < 0) {
                  toast({
                    title: "Invalid amounts",
                    description: "Please enter valid positive numbers for both amounts.",
                    variant: "destructive",
                  });
                  return;
                }
                
                if (freelancerAmt + customerAmt > budget) {
                  toast({
                    title: "Amounts exceed budget",
                    description: `Total distribution cannot exceed the job budget of $${budget}.`,
                    variant: "destructive",
                  });
                  return;
                }
                
                resolveDisputeMutation.mutate({
                  disputeId: selectedDispute.id,
                  resolution: disputeResolution,
                  freelancerAmount: freelancerAmt.toString(),
                  customerRefund: customerAmt.toString(),
                });
              }}
              disabled={!disputeResolution.trim() || resolveDisputeMutation.isPending}
              data-testid="button-confirm-resolve"
            >
              {resolveDisputeMutation.isPending ? "Resolving..." : "Resolve Dispute"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={requestChangesDialogOpen} onOpenChange={setRequestChangesDialogOpen}>
        <DialogContent data-testid="dialog-request-changes">
          <DialogHeader>
            <DialogTitle>Request Changes</DialogTitle>
            <DialogDescription>
              Provide feedback on what changes are needed for this job posting.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="feedback">Feedback</Label>
              <Textarea
                id="feedback"
                placeholder="Explain what changes are required..."
                value={changesFeedback}
                onChange={(e) => setChangesFeedback(e.target.value)}
                rows={5}
                data-testid="textarea-feedback"
              />
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setRequestChangesDialogOpen(false);
                setChangesFeedback("");
                setSelectedJob(null);
              }}
              data-testid="button-cancel-changes"
            >
              Cancel
            </Button>
            <Button
              onClick={() => {
                if (selectedJob && changesFeedback.trim()) {
                  requestChangesMutation.mutate({
                    jobId: selectedJob.id,
                    feedback: changesFeedback,
                  });
                }
              }}
              disabled={!changesFeedback.trim() || requestChangesMutation.isPending}
              data-testid="button-submit-changes"
            >
              Submit Feedback
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={reportReviewDialogOpen} onOpenChange={setReportReviewDialogOpen}>
        <DialogContent data-testid="dialog-review-report">
          <DialogHeader>
            <DialogTitle>Review Report</DialogTitle>
            <DialogDescription>
              Select an action and optionally add notes for this report.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            {selectedReport && (
              <div className="p-3 bg-muted/50 rounded-md space-y-2">
                <p className="text-sm"><strong>Type:</strong> {selectedReport.reportType}</p>
                <p className="text-sm"><strong>Reason:</strong> {selectedReport.reason}</p>
                {selectedReport.description && (
                  <p className="text-sm"><strong>Details:</strong> {selectedReport.description}</p>
                )}
              </div>
            )}
            <div className="space-y-2">
              <Label htmlFor="reviewNotes">Review Notes (Optional)</Label>
              <Textarea
                id="reviewNotes"
                placeholder="Add any notes about your decision..."
                value={reportReviewNotes}
                onChange={(e) => setReportReviewNotes(e.target.value)}
                rows={3}
                data-testid="textarea-review-notes"
              />
            </div>
          </div>
          <DialogFooter className="flex-col sm:flex-row gap-2">
            <Button
              variant="outline"
              onClick={() => {
                setReportReviewDialogOpen(false);
                setSelectedReport(null);
                setReportReviewNotes("");
              }}
              data-testid="button-cancel-review"
            >
              Cancel
            </Button>
            <Button
              variant="ghost"
              onClick={() => {
                if (selectedReport) {
                  updateReportMutation.mutate({
                    reportId: selectedReport.id,
                    status: "dismissed",
                    reviewNotes: reportReviewNotes || undefined,
                  });
                }
              }}
              disabled={updateReportMutation.isPending}
              className="text-muted-foreground"
              data-testid="button-confirm-dismiss"
            >
              <X className="w-4 h-4 mr-1" />
              Dismiss
            </Button>
            <Button
              variant="outline"
              onClick={() => {
                if (selectedReport) {
                  updateReportMutation.mutate({
                    reportId: selectedReport.id,
                    status: "reviewed",
                    reviewNotes: reportReviewNotes || undefined,
                  });
                }
              }}
              disabled={updateReportMutation.isPending}
              data-testid="button-confirm-review"
            >
              <FileText className="w-4 h-4 mr-1" />
              Mark Reviewed
            </Button>
            <Button
              onClick={() => {
                if (selectedReport) {
                  updateReportMutation.mutate({
                    reportId: selectedReport.id,
                    status: "resolved",
                    reviewNotes: reportReviewNotes || undefined,
                  });
                }
              }}
              disabled={updateReportMutation.isPending}
              data-testid="button-confirm-resolve"
            >
              <Check className="w-4 h-4 mr-1" />
              Resolve
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
