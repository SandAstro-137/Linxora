import { useQuery, useMutation } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import { Award, Briefcase, Star, TrendingUp, Check, X, User } from "lucide-react";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { Link } from "wouter";

interface IncomingRecommendation {
  id: string;
  status: string;
  recommenderMessage: string | null;
  createdAt: string;
  recommender: {
    id: string;
    username: string;
    avatar: string | null;
    level: number | null;
    rating: string | null;
  } | null;
  recommendedFreelancer: {
    id: string;
    username: string;
    avatar: string | null;
    level: number;
    rating: string | null;
    ratingCount: number;
    completedJobs: number;
    specialization: string | null;
  } | null;
  job: {
    id: string;
    title: string;
    budget: string;
    category: string;
  } | null;
}

export default function IncomingRecommendationsPage() {
  const { toast } = useToast();

  const { data: recommendations = [], isLoading } = useQuery<IncomingRecommendation[]>({
    queryKey: ["/api/recommendations/customer"],
  });

  const pendingRecommendations = recommendations.filter(r => r.status === "pending");

  const respondMutation = useMutation({
    mutationFn: async ({ id, accept, note }: { id: string; accept: boolean; note?: string }) => {
      const res = await apiRequest("POST", `/api/recommendations/${id}/respond`, { accept, note });
      return res.json();
    },
    onSuccess: (data, variables) => {
      toast({
        title: variables.accept ? "Recommendation accepted" : "Recommendation declined",
        description: variables.accept 
          ? "An invitation has been sent to the freelancer." 
          : "The recommender has been notified.",
      });
      queryClient.invalidateQueries({ queryKey: ["/api/recommendations/customer"] });
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
        <h1 className="text-2xl font-bold">Incoming Recommendations</h1>
        <p className="text-muted-foreground">
          Freelancers recommended by others for your active jobs
        </p>
      </div>

      {pendingRecommendations.length === 0 ? (
        <Card>
          <CardContent className="pt-6 text-center">
            <Award className="w-12 h-12 mx-auto text-muted-foreground mb-4" />
            <h2 className="text-xl font-semibold mb-2">No Pending Recommendations</h2>
            <p className="text-muted-foreground">
              When freelancers recommend others for your jobs, they'll appear here for review.
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-4">
          {pendingRecommendations.map((rec) => (
            <Card key={rec.id} data-testid={`recommendation-${rec.id}`}>
              <CardHeader>
                <div className="flex items-start justify-between flex-wrap gap-4">
                  <div>
                    <CardTitle className="text-lg">
                      Recommendation for: {rec.job?.title || "Job"}
                    </CardTitle>
                    <CardDescription>
                      {rec.recommender?.username || "Someone"} recommends {rec.recommendedFreelancer?.username || "a freelancer"}
                    </CardDescription>
                  </div>
                  <Badge variant="secondary">Pending Review</Badge>
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex items-start gap-4 p-4 bg-muted rounded-lg">
                  <Avatar className="h-12 w-12">
                    <AvatarImage src={rec.recommendedFreelancer?.avatar || undefined} />
                    <AvatarFallback>
                      {rec.recommendedFreelancer?.username?.charAt(0).toUpperCase() || "?"}
                    </AvatarFallback>
                  </Avatar>
                  <div className="flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <h3 className="font-semibold">{rec.recommendedFreelancer?.username || "Unknown"}</h3>
                      <Badge variant="outline">Freelancer</Badge>
                    </div>
                    <div className="flex items-center gap-4 mt-1 text-sm text-muted-foreground flex-wrap">
                      <span className="flex items-center gap-1">
                        <TrendingUp className="w-3 h-3" />
                        Level {rec.recommendedFreelancer?.level || 1}
                      </span>
                      <span className="flex items-center gap-1">
                        <Star className="w-3 h-3 text-yellow-500" />
                        {rec.recommendedFreelancer?.rating || "N/A"} ({rec.recommendedFreelancer?.ratingCount || 0} reviews)
                      </span>
                      <span className="flex items-center gap-1">
                        <Briefcase className="w-3 h-3" />
                        {rec.recommendedFreelancer?.completedJobs || 0} jobs completed
                      </span>
                    </div>
                    {rec.recommendedFreelancer?.specialization && (
                      <p className="text-sm mt-1">{rec.recommendedFreelancer.specialization}</p>
                    )}
                  </div>
                  <Link href={`/user/${rec.recommendedFreelancer?.id}`}>
                    <Button variant="outline" size="sm" data-testid={`button-view-profile-${rec.id}`}>
                      <User className="w-4 h-4 mr-1" />
                      View Profile
                    </Button>
                  </Link>
                </div>

                {rec.recommenderMessage && (
                  <div className="bg-background border p-3 rounded-lg">
                    <p className="text-sm font-medium mb-1">
                      Why {rec.recommender?.username || "they"} recommends this freelancer:
                    </p>
                    <p className="text-sm text-muted-foreground">
                      "{rec.recommenderMessage}"
                    </p>
                  </div>
                )}

                <div className="flex items-center gap-4 text-sm">
                  <span className="text-muted-foreground">Job Budget:</span>
                  <Badge variant="outline">${rec.job?.budget || "N/A"}</Badge>
                  <span className="text-muted-foreground">Category:</span>
                  <Badge variant="outline">{rec.job?.category || "N/A"}</Badge>
                </div>

                <div className="flex gap-2 pt-2">
                  <Button
                    onClick={() => respondMutation.mutate({ id: rec.id, accept: true })}
                    disabled={respondMutation.isPending}
                    data-testid={`button-accept-${rec.id}`}
                  >
                    <Check className="w-4 h-4 mr-2" />
                    Accept & Send Invitation
                  </Button>
                  <Button
                    variant="outline"
                    onClick={() => respondMutation.mutate({ id: rec.id, accept: false })}
                    disabled={respondMutation.isPending}
                    data-testid={`button-decline-${rec.id}`}
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
