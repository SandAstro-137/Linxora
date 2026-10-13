import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { useToast } from "@/hooks/use-toast";
import { Mail, Briefcase, DollarSign, Calendar, User, Check, X, ChevronDown, ChevronUp, Users, Wallet, Eye } from "lucide-react";
import { Link } from "wouter";
import { formatEasternDateTime } from "@/lib/timezone";
import { apiRequest, queryClient } from "@/lib/queryClient";

interface TeamMember {
  id: string;
  username: string;
  avatar: string | null;
  level: number;
}

interface JobInvitation {
  id: string;
  type?: "recommendation" | "direct_invitation";
  status: string;
  recommenderMessage?: string | null;
  freelancerMessage?: string | null;
  customerNote?: string | null;
  createdAt: string;
  recommender?: {
    id: string;
    username: string;
    avatar: string | null;
  } | null;
  inviter?: {
    id: string;
    username: string;
    avatar: string | null;
  } | null;
  customer: {
    id: string;
    username: string;
    avatar: string | null;
  } | null;
  job: {
    id: string;
    title: string;
    description: string;
    budget: string;
    category: string;
    deadline: string | null;
  } | null;
  teamMembers: TeamMember[];
  currentTeamSize: number;
  estimatedShare: string;
}

export default function JobInvitationsPage() {
  const { toast } = useToast();
  const [expandedInvitations, setExpandedInvitations] = useState<Set<string>>(new Set());

  const toggleExpanded = (id: string) => {
    setExpandedInvitations(prev => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  // Fetch recommendation-based invitations
  const { data: recommendationInvitations = [], isLoading: isLoadingRecommendations } = useQuery<JobInvitation[]>({
    queryKey: ["/api/recommendations/invitations"],
    refetchInterval: 5000,
    refetchIntervalInBackground: true, // New invitations appear even when this tab is in the background
  });

  // Fetch direct team invitations (from Offer Team feature)
  const { data: directInvitations = [], isLoading: isLoadingDirect } = useQuery<JobInvitation[]>({
    queryKey: ["/api/invitations/pending"],
    refetchInterval: 5000,
    refetchIntervalInBackground: true, // New invitations appear even when this tab is in the background
  });

  // Combine both types of invitations
  const invitations = [
    ...recommendationInvitations.map(inv => ({ ...inv, type: "recommendation" as const })),
    ...directInvitations,
  ];
  const isLoading = isLoadingRecommendations || isLoadingDirect;

  // Mutation for recommendation-based invitations
  const respondMutation = useMutation({
    mutationFn: async ({ id, accept }: { id: string; accept: boolean }) => {
      const res = await apiRequest("POST", `/api/recommendations/${id}/invitation-respond`, { accept });
      return res.json();
    },
    onSuccess: (data, variables) => {
      toast({
        title: variables.accept ? "Invitation accepted" : "Invitation declined",
        description: variables.accept 
          ? "You have been assigned to the job!" 
          : "The customer has been notified.",
      });
      queryClient.invalidateQueries({ queryKey: ["/api/recommendations/invitations"] });
      queryClient.invalidateQueries({ queryKey: ["/api/invitations/pending"] });
      queryClient.invalidateQueries({ queryKey: ["/api/jobs"] });
      queryClient.invalidateQueries({ queryKey: ["/api/freelancer/jobs"] });
      queryClient.invalidateQueries({ queryKey: ["/api/dashboard/stats"] });
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  // Mutation for direct team invitations
  const respondDirectMutation = useMutation({
    mutationFn: async ({ id, accept }: { id: string; accept: boolean }) => {
      const endpoint = accept ? `/api/invitations/${id}/accept` : `/api/invitations/${id}/reject`;
      const res = await apiRequest("POST", endpoint, {});
      return res.json();
    },
    onSuccess: (data, variables) => {
      toast({
        title: variables.accept ? "Invitation accepted" : "Invitation declined",
        description: variables.accept 
          ? "You have been added to the job team!" 
          : "The inviter has been notified.",
      });
      queryClient.invalidateQueries({ queryKey: ["/api/invitations/pending"] });
      queryClient.invalidateQueries({ queryKey: ["/api/recommendations/invitations"] });
      queryClient.invalidateQueries({ queryKey: ["/api/jobs"] });
      queryClient.invalidateQueries({ queryKey: ["/api/freelancer/jobs"] });
      queryClient.invalidateQueries({ queryKey: ["/api/dashboard/stats"] });
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  if (isLoading) {
    return (
      <div className="p-6 max-w-4xl mx-auto space-y-6">
        <Skeleton className="h-10 w-48" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  return (
    <div className="p-6 max-w-4xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Job Invitations</h1>
        <p className="text-muted-foreground">
          Direct team invitations and recommendations from other freelancers
        </p>
      </div>

      {invitations.length === 0 ? (
        <Card>
          <CardContent className="pt-6 text-center">
            <Mail className="w-12 h-12 mx-auto text-muted-foreground mb-4" />
            <h2 className="text-xl font-semibold mb-2">No Pending Invitations</h2>
            <p className="text-muted-foreground">
              When someone invites you to collaborate on a job or recommends you and the customer accepts, you'll see the invitation here.
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-4">
          {invitations.map((invitation) => (
            <Card key={invitation.id} data-testid={`invitation-${invitation.id}`}>
              <CardHeader>
                <div className="flex items-start justify-between flex-wrap gap-4">
                  <div>
                    <CardTitle className="text-lg">{invitation.job?.title || "Job"}</CardTitle>
                    <CardDescription>
                      {invitation.type === "direct_invitation" 
                        ? `Invited by ${invitation.inviter?.username || invitation.customer?.username || "customer"}`
                        : `Recommended by ${invitation.recommender?.username || "a friend"}`
                      }
                    </CardDescription>
                  </div>
                  <div className="flex gap-2 flex-wrap">
                    {invitation.type === "direct_invitation" && (
                      <Badge variant="outline">Direct Invitation</Badge>
                    )}
                    <Badge variant="secondary">Pending Response</Badge>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-sm">
                  <div className="flex items-center gap-2">
                    <User className="w-4 h-4 text-muted-foreground" />
                    <span>Customer: {invitation.customer?.username || "Unknown"}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <DollarSign className="w-4 h-4 text-muted-foreground" />
                    <span>Total Budget: ${invitation.job?.budget || "N/A"}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <Wallet className="w-4 h-4 text-primary" />
                    <span className="font-medium text-primary">Your Est. Share: ${invitation.estimatedShare}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <Users className="w-4 h-4 text-muted-foreground" />
                    <span>Team Size: {invitation.currentTeamSize} member{invitation.currentTeamSize !== 1 ? "s" : ""}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <Briefcase className="w-4 h-4 text-muted-foreground" />
                    <span>Category: {invitation.job?.category || "N/A"}</span>
                  </div>
                  {invitation.job?.deadline && (
                    <div className="flex items-center gap-2">
                      <Calendar className="w-4 h-4 text-muted-foreground" />
                      <span>Deadline: {formatEasternDateTime(invitation.job.deadline)} (ET)</span>
                    </div>
                  )}
                </div>

                {invitation.teamMembers && invitation.teamMembers.length > 0 && (
                  <div className="bg-muted/50 p-3 rounded-lg">
                    <p className="text-sm font-medium mb-2">Current Team Members:</p>
                    <div className="flex flex-wrap gap-2">
                      {invitation.teamMembers.map((member) => (
                        <Link key={member.id} href={`/user/${member.id}`} onClick={(e) => e.stopPropagation()}>
                          <div className="flex items-center gap-2 bg-background p-2 rounded-md border hover-elevate cursor-pointer min-w-0">
                            <Avatar className="h-6 w-6">
                              <AvatarImage src={member.avatar || undefined} />
                              <AvatarFallback className="text-xs">{member.username.charAt(0).toUpperCase()}</AvatarFallback>
                            </Avatar>
                            <span className="text-sm truncate">{member.username}</span>
                            <Badge variant="outline" className="text-xs">Lvl {member.level}</Badge>
                          </div>
                        </Link>
                      ))}
                    </div>
                  </div>
                )}

                {invitation.freelancerMessage && invitation.type !== "direct_invitation" && (
                  <div className="bg-muted p-3 rounded-lg">
                    <p className="text-sm font-medium mb-1">
                      Message from {invitation.recommender?.username || "recommender"}:
                    </p>
                    <p className="text-sm text-muted-foreground">
                      "{invitation.freelancerMessage}"
                    </p>
                  </div>
                )}

                <Collapsible open={expandedInvitations.has(invitation.id)}>
                  <CollapsibleTrigger asChild>
                    <Button 
                      variant="ghost" 
                      size="sm" 
                      className="w-full justify-between"
                      onClick={() => toggleExpanded(invitation.id)}
                      data-testid={`button-view-details-${invitation.id}`}
                    >
                      <span>View Full Description</span>
                      {expandedInvitations.has(invitation.id) ? (
                        <ChevronUp className="w-4 h-4" />
                      ) : (
                        <ChevronDown className="w-4 h-4" />
                      )}
                    </Button>
                  </CollapsibleTrigger>
                  <CollapsibleContent className="pt-3">
                    {invitation.job?.description && (
                      <div className="bg-muted/30 p-4 rounded-lg border">
                        <h4 className="font-medium mb-2">Full Job Description</h4>
                        <p className="text-sm text-muted-foreground whitespace-pre-wrap break-words">
                          {invitation.job.description}
                        </p>
                      </div>
                    )}
                  </CollapsibleContent>
                </Collapsible>

                <div className="flex gap-2 pt-2 flex-wrap">
                  <Link href={`/jobs/${invitation.job?.id}`}>
                    <Button
                      variant="secondary"
                      data-testid={`button-view-job-${invitation.id}`}
                    >
                      <Eye className="w-4 h-4 mr-2" />
                      View Job Details
                    </Button>
                  </Link>
                  <Button
                    onClick={() => {
                      if (invitation.type === "direct_invitation") {
                        respondDirectMutation.mutate({ id: invitation.id, accept: true });
                      } else {
                        respondMutation.mutate({ id: invitation.id, accept: true });
                      }
                    }}
                    disabled={respondMutation.isPending || respondDirectMutation.isPending}
                    data-testid={`button-accept-${invitation.id}`}
                  >
                    <Check className="w-4 h-4 mr-2" />
                    Accept Invitation
                  </Button>
                  <Button
                    variant="outline"
                    onClick={() => {
                      if (invitation.type === "direct_invitation") {
                        respondDirectMutation.mutate({ id: invitation.id, accept: false });
                      } else {
                        respondMutation.mutate({ id: invitation.id, accept: false });
                      }
                    }}
                    disabled={respondMutation.isPending || respondDirectMutation.isPending}
                    data-testid={`button-decline-${invitation.id}`}
                  >
                    <X className="w-4 h-4 mr-2" />
                    Decline
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
