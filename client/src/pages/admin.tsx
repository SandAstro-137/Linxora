import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Skeleton } from "@/components/ui/skeleton";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/lib/auth-context";
import { Crown, Shield, UserPlus, UserMinus, Users, Star, Briefcase } from "lucide-react";

interface User {
  id: string;
  discordId: string;
  username: string;
  email: string | null;
  avatar: string | null;
  role: string;
  level: number;
  completedJobs: number;
  rating: string;
}

export default function AdminPage() {
  const { toast } = useToast();
  const { user } = useAuth();

  const { data: moderators = [], isLoading: moderatorsLoading } = useQuery<User[]>({
    queryKey: ["/api/admin/moderators"],
  });

  const { data: headsOfModeration = [], isLoading: headsLoading } = useQuery<User[]>({
    queryKey: ["/api/admin/heads-of-moderation"],
  });

  const assignMutation = useMutation({
    mutationFn: async (userId: string) => {
      return apiRequest("POST", `/api/admin/assign-head-of-moderation/${userId}`, {});
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/moderators"] });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/heads-of-moderation"] });
      toast({
        title: "Success",
        description: "User has been promoted to Head of Moderation",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: error.message || "Failed to assign role",
        variant: "destructive",
      });
    },
  });

  const removeMutation = useMutation({
    mutationFn: async (userId: string) => {
      return apiRequest("POST", `/api/admin/remove-head-of-moderation/${userId}`, {});
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/moderators"] });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/heads-of-moderation"] });
      toast({
        title: "Success",
        description: "User has been demoted to Moderator",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: error.message || "Failed to remove role",
        variant: "destructive",
      });
    },
  });

  if (user?.role !== "founder") {
    return (
      <div className="p-6 max-w-4xl mx-auto">
        <Card>
          <CardContent className="p-6 text-center">
            <Shield className="w-12 h-12 mx-auto text-muted-foreground mb-4" />
            <p className="text-muted-foreground">This page is only accessible to the Founder</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (moderatorsLoading || headsLoading) {
    return (
      <div className="p-6 max-w-4xl mx-auto space-y-6">
        <Skeleton className="h-10 w-64" />
        <Skeleton className="h-48 w-full" />
        <Skeleton className="h-48 w-full" />
      </div>
    );
  }

  const regularModerators = moderators.filter(m => m.role === "moderator");

  return (
    <div className="p-6 max-w-4xl mx-auto space-y-6">
      <div className="flex items-center gap-3">
        <Crown className="w-8 h-8 text-yellow-500" />
        <div>
          <h1 className="text-2xl font-bold" data-testid="text-page-title">Founder Admin Panel</h1>
          <p className="text-muted-foreground">Manage Heads of Moderation and oversee platform operations</p>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Users className="w-5 h-5" />
            Heads of Moderation ({headsOfModeration.length}/3)
          </CardTitle>
          <CardDescription>
            Heads of Moderation can approve freelancer-to-moderator promotions. Maximum of 3 allowed.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {headsOfModeration.length === 0 ? (
            <p className="text-muted-foreground text-center py-4">No Heads of Moderation assigned yet</p>
          ) : (
            <div className="space-y-3">
              {headsOfModeration.map((head) => (
                <div
                  key={head.id}
                  className="flex items-center justify-between p-3 rounded-md bg-muted/50"
                  data-testid={`card-head-${head.id}`}
                >
                  <div className="flex items-center gap-3">
                    <Avatar>
                      <AvatarImage src={head.avatar || undefined} />
                      <AvatarFallback>
                        {head.username.charAt(0).toUpperCase()}
                      </AvatarFallback>
                    </Avatar>
                    <div>
                      <p className="font-medium">{head.username}</p>
                      <div className="flex items-center gap-2 text-sm text-muted-foreground">
                        <Badge variant="secondary" className="bg-purple-500/10 text-purple-700 dark:text-purple-400">
                          Head of Moderation
                        </Badge>
                      </div>
                    </div>
                  </div>
                  <Button
                    variant="destructive"
                    size="sm"
                    onClick={() => removeMutation.mutate(head.id)}
                    disabled={removeMutation.isPending}
                    data-testid={`button-remove-${head.id}`}
                  >
                    <UserMinus className="w-4 h-4 mr-1" />
                    Remove
                  </Button>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Shield className="w-5 h-5" />
            Moderators
          </CardTitle>
          <CardDescription>
            Promote moderators to Head of Moderation
          </CardDescription>
        </CardHeader>
        <CardContent>
          {regularModerators.length === 0 ? (
            <p className="text-muted-foreground text-center py-4">No moderators available to promote</p>
          ) : (
            <div className="space-y-3">
              {regularModerators.map((mod) => (
                <div
                  key={mod.id}
                  className="flex items-center justify-between p-3 rounded-md bg-muted/50"
                  data-testid={`card-mod-${mod.id}`}
                >
                  <div className="flex items-center gap-3">
                    <Avatar>
                      <AvatarImage src={mod.avatar || undefined} />
                      <AvatarFallback>
                        {mod.username.charAt(0).toUpperCase()}
                      </AvatarFallback>
                    </Avatar>
                    <div>
                      <p className="font-medium">{mod.username}</p>
                      <div className="flex items-center gap-4 text-sm text-muted-foreground">
                        <span className="flex items-center gap-1">
                          <Briefcase className="w-3 h-3" />
                          {mod.completedJobs || 0} jobs
                        </span>
                        <span className="flex items-center gap-1">
                          <Star className="w-3 h-3" />
                          Level {mod.level || 1}
                        </span>
                      </div>
                    </div>
                  </div>
                  <Button
                    size="sm"
                    onClick={() => assignMutation.mutate(mod.id)}
                    disabled={assignMutation.isPending || headsOfModeration.length >= 3}
                    data-testid={`button-promote-${mod.id}`}
                  >
                    <UserPlus className="w-4 h-4 mr-1" />
                    Promote
                  </Button>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
