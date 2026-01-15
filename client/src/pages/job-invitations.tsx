import { useQuery, useMutation } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import { Mail, Briefcase, DollarSign, Calendar, User, Check, X } from "lucide-react";
import { format } from "date-fns";
import { apiRequest, queryClient } from "@/lib/queryClient";

interface JobInvitation {
  id: string;
  status: string;
  recommenderMessage: string | null;
  customerNote: string | null;
  createdAt: string;
  recommender: {
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
}

export default function JobInvitationsPage() {
  const { toast } = useToast();

  const { data: invitations = [], isLoading } = useQuery<JobInvitation[]>({
    queryKey: ["/api/recommendations/invitations"],
  });

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
      queryClient.invalidateQueries({ queryKey: ["/api/jobs"] });
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
          Invitations from customers based on recommendations from other freelancers
        </p>
      </div>

      {invitations.length === 0 ? (
        <Card>
          <CardContent className="pt-6 text-center">
            <Mail className="w-12 h-12 mx-auto text-muted-foreground mb-4" />
            <h2 className="text-xl font-semibold mb-2">No Pending Invitations</h2>
            <p className="text-muted-foreground">
              When someone recommends you for a job and the customer accepts, you'll see the invitation here.
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
                      Recommended by {invitation.recommender?.username || "a friend"}
                    </CardDescription>
                  </div>
                  <Badge variant="secondary">Pending Response</Badge>
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
                    <span>Budget: ${invitation.job?.budget || "N/A"}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <Briefcase className="w-4 h-4 text-muted-foreground" />
                    <span>Category: {invitation.job?.category || "N/A"}</span>
                  </div>
                  {invitation.job?.deadline && (
                    <div className="flex items-center gap-2">
                      <Calendar className="w-4 h-4 text-muted-foreground" />
                      <span>Deadline: {format(new Date(invitation.job.deadline), "MMM d, yyyy")}</span>
                    </div>
                  )}
                </div>

                {invitation.job?.description && (
                  <div>
                    <h4 className="font-medium mb-1">Job Description</h4>
                    <p className="text-sm text-muted-foreground line-clamp-3">
                      {invitation.job.description}
                    </p>
                  </div>
                )}

                {invitation.recommenderMessage && (
                  <div className="bg-muted p-3 rounded-lg">
                    <p className="text-sm font-medium mb-1">
                      Message from {invitation.recommender?.username || "recommender"}:
                    </p>
                    <p className="text-sm text-muted-foreground">
                      "{invitation.recommenderMessage}"
                    </p>
                  </div>
                )}

                <div className="flex gap-2 pt-2">
                  <Button
                    onClick={() => respondMutation.mutate({ id: invitation.id, accept: true })}
                    disabled={respondMutation.isPending}
                    data-testid={`button-accept-${invitation.id}`}
                  >
                    <Check className="w-4 h-4 mr-2" />
                    Accept Invitation
                  </Button>
                  <Button
                    variant="outline"
                    onClick={() => respondMutation.mutate({ id: invitation.id, accept: false })}
                    disabled={respondMutation.isPending}
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
