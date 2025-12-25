import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Shield, Users, CheckCircle, XCircle, Star, Briefcase } from "lucide-react";
import { formatEasternDateTime, TIMEZONE_LABEL } from "@/lib/timezone";
import { useState } from "react";

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

export default function RoleUpgradeReviewPage() {
  const { toast } = useToast();
  const [reviewNotes, setReviewNotes] = useState<Record<string, string>>({});

  const { data: requests = [], isLoading } = useQuery<EnrichedRoleUpgradeRequest[]>({
    queryKey: ["/api/role-upgrade-requests/pending"],
  });

  const reviewMutation = useMutation({
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
      setReviewNotes((prev) => {
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

  if (isLoading) {
    return (
      <div className="p-6 max-w-4xl mx-auto space-y-6">
        <Skeleton className="h-10 w-64" />
        <Skeleton className="h-48 w-full" />
        <Skeleton className="h-48 w-full" />
      </div>
    );
  }

  return (
    <div className="p-6 max-w-4xl mx-auto space-y-6">
      <div className="flex items-center gap-3">
        <Shield className="w-8 h-8 text-primary" />
        <div>
          <h1 className="text-2xl font-bold" data-testid="text-page-title">Role Upgrade Requests</h1>
          <p className="text-muted-foreground">Review and approve role upgrade applications</p>
        </div>
      </div>

      {requests.length === 0 ? (
        <Card>
          <CardContent className="p-6 text-center">
            <Users className="w-12 h-12 mx-auto text-muted-foreground mb-4" />
            <p className="text-muted-foreground">No pending role upgrade requests</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-4">
          <p className="text-sm text-muted-foreground">All times are in {TIMEZONE_LABEL}</p>
          {requests.map((request) => (
            <Card key={request.id} data-testid={`card-review-${request.id}`}>
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
                    value={reviewNotes[request.id] || ""}
                    onChange={(e) => setReviewNotes((prev) => ({ ...prev, [request.id]: e.target.value }))}
                    data-testid={`input-review-notes-${request.id}`}
                  />
                </div>

                <div className="flex gap-2 pt-2">
                  <Button
                    onClick={() => reviewMutation.mutate({ 
                      id: request.id, 
                      status: "approved",
                      notes: reviewNotes[request.id]
                    })}
                    disabled={reviewMutation.isPending}
                    className="flex-1"
                    data-testid={`button-approve-${request.id}`}
                  >
                    <CheckCircle className="w-4 h-4 mr-2" />
                    Approve
                  </Button>
                  <Button
                    variant="destructive"
                    onClick={() => reviewMutation.mutate({ 
                      id: request.id, 
                      status: "rejected",
                      notes: reviewNotes[request.id]
                    })}
                    disabled={reviewMutation.isPending}
                    className="flex-1"
                    data-testid={`button-reject-${request.id}`}
                  >
                    <XCircle className="w-4 h-4 mr-2" />
                    Reject
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
