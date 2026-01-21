import { useQuery, useMutation } from "@tanstack/react-query";
import { useRoute } from "wouter";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Separator } from "@/components/ui/separator";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { User, Star, Briefcase, TrendingUp, Calendar, MessageSquare, UserPlus, ArrowLeft, Award } from "lucide-react";
import { Link } from "wouter";
import { format } from "date-fns";
import { useState } from "react";
import { apiRequest, queryClient } from "@/lib/queryClient";

interface UserStatus {
  onlineStatus: "online" | "offline";
  workStatus: "working" | "on-break" | "unemployed" | "inactive" | null;
  displayStatus: string;
}

interface PublicProfile {
  id: string;
  userId: number;
  username: string;
  avatar: string | null;
  role: string;
  level: number;
  rating: string;
  ratingCount: number;
  completedJobs: number;
  createdAt: string;
  specialization: string | null;
  bio: string | null;
  status: UserStatus;
  recentCompletedJobs?: {
    id: string;
    title: string;
    category: string;
    completedAt: string;
  }[];
}

interface AvailableJob {
  id: string;
  title: string;
  budget: string;
  category: string;
  customer: {
    id: string;
    username: string;
    avatar: string | null;
  } | null;
}

interface CurrentUser {
  id: string;
  role: string;
}

function getRoleBadgeVariant(role: string): "default" | "secondary" | "outline" | "destructive" {
  switch (role) {
    case "founder": return "default";
    case "head_of_moderation": return "default";
    case "moderator": return "secondary";
    case "staff": return "secondary";
    case "freelancer": return "outline";
    case "customer": return "outline";
    default: return "outline";
  }
}

function getRoleDisplay(role: string): string {
  switch (role) {
    case "founder": return "Founder";
    case "head_of_moderation": return "Head of Moderation";
    case "moderator": return "Moderator";
    case "staff": return "Staff";
    case "freelancer": return "Freelancer";
    case "customer": return "Customer";
    default: return role;
  }
}

function getOnlineStatusColor(status: string): string {
  switch (status) {
    case "online": return "bg-green-500";
    case "offline": return "bg-gray-400";
    default: return "bg-gray-400";
  }
}

function getWorkStatusBadge(workStatus: string | null): { text: string; variant: "default" | "secondary" | "outline" | "destructive" } | null {
  if (!workStatus) return null;
  switch (workStatus) {
    case "working": return { text: "Working", variant: "default" };
    case "on-break": return { text: "On Break", variant: "secondary" };
    case "unemployed": return { text: "Available", variant: "outline" };
    case "inactive": return { text: "Inactive", variant: "destructive" };
    default: return null;
  }
}

export default function UserProfilePage() {
  const [, params] = useRoute("/user/:id");
  const userId = params?.id;
  const { toast } = useToast();
  const [recommendDialogOpen, setRecommendDialogOpen] = useState(false);
  const [selectedJobId, setSelectedJobId] = useState<string>("");
  const [customerMessage, setCustomerMessage] = useState("");
  const [freelancerMessage, setFreelancerMessage] = useState("");

  const { data: currentUser } = useQuery<CurrentUser>({
    queryKey: ["/api/auth/me"],
  });

  const { data: profile, isLoading, error } = useQuery<PublicProfile>({
    queryKey: ["/api/users", userId, "profile"],
    queryFn: async () => {
      const res = await fetch(`/api/users/${userId}/profile`, { credentials: "include" });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Failed to load profile");
      }
      return res.json();
    },
    enabled: !!userId,
  });

  const { data: availableJobs = [] } = useQuery<AvailableJob[]>({
    queryKey: ["/api/recommendations/available-jobs"],
    enabled: currentUser?.role === "freelancer" && profile?.role === "freelancer",
  });

  const recommendMutation = useMutation({
    mutationFn: async (data: { recommendedFreelancerId: string; jobId: string; customerMessage?: string; freelancerMessage?: string }) => {
      const res = await apiRequest("POST", "/api/recommendations", data);
      return res.json();
    },
    onSuccess: () => {
      toast({
        title: "Recommendation sent",
        description: `You have recommended ${profile?.username} for this job. The customer will be notified.`,
      });
      setRecommendDialogOpen(false);
      setSelectedJobId("");
      setCustomerMessage("");
      setFreelancerMessage("");
    },
    onError: (error: Error) => {
      toast({
        title: "Failed to send recommendation",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const handleRecommend = () => {
    if (!selectedJobId || !profile) return;
    recommendMutation.mutate({
      recommendedFreelancerId: profile.id,
      jobId: selectedJobId,
      customerMessage: customerMessage || undefined,
      freelancerMessage: freelancerMessage || undefined,
    });
  };

  if (isLoading) {
    return (
      <div className="p-6 max-w-3xl mx-auto space-y-6">
        <Skeleton className="h-10 w-48" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  if (error || !profile) {
    return (
      <div className="p-6 max-w-3xl mx-auto">
        <Card>
          <CardContent className="pt-6 text-center">
            <User className="w-12 h-12 mx-auto text-muted-foreground mb-4" />
            <h2 className="text-xl font-semibold mb-2">User Not Found</h2>
            <p className="text-muted-foreground mb-4">
              {(error as Error)?.message || "This user profile could not be found."}
            </p>
            <Link href="/friends">
              <Button variant="outline">
                <ArrowLeft className="w-4 h-4 mr-2" />
                Back to Friends
              </Button>
            </Link>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="p-6 max-w-3xl mx-auto space-y-6">
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <Link href="/friends">
          <Button variant="ghost" size="sm" data-testid="button-back-to-friends">
            <ArrowLeft className="w-4 h-4 mr-1" />
            Back to Friends
          </Button>
        </Link>
      </div>

      <Card data-testid="card-user-profile">
        <CardHeader>
          <div className="flex items-start gap-4">
            <div className="relative">
              <Avatar className="h-20 w-20">
                <AvatarImage src={profile.avatar || undefined} />
                <AvatarFallback className="text-2xl">
                  {profile.username.charAt(0).toUpperCase()}
                </AvatarFallback>
              </Avatar>
              <div 
                className={`absolute bottom-1 right-1 w-4 h-4 rounded-full border-2 border-background ${getOnlineStatusColor(profile.status?.onlineStatus || "offline")}`}
                title={profile.status?.onlineStatus === "online" ? "Online" : "Offline"}
                data-testid="indicator-online-status"
              />
            </div>
            <div className="flex-1">
              <div className="flex items-center gap-2 flex-wrap">
                <CardTitle className="text-2xl" data-testid="text-username">
                  {profile.username}
                </CardTitle>
                <Badge variant={getRoleBadgeVariant(profile.role)} data-testid="badge-role">
                  {getRoleDisplay(profile.role)}
                </Badge>
                {profile.status?.workStatus && getWorkStatusBadge(profile.status.workStatus) && (
                  <Badge 
                    variant={getWorkStatusBadge(profile.status.workStatus)!.variant} 
                    data-testid="badge-work-status"
                  >
                    {getWorkStatusBadge(profile.status.workStatus)!.text}
                  </Badge>
                )}
              </div>
              <div className="flex items-center gap-2 mt-1">
                <span 
                  className={`text-sm ${profile.status?.onlineStatus === "online" ? "text-green-600 dark:text-green-400" : "text-muted-foreground"}`}
                  data-testid="text-online-status"
                >
                  {profile.status?.onlineStatus === "online" ? "Online" : "Offline"}
                </span>
                <span className="text-muted-foreground">|</span>
                <CardDescription>
                  User ID: {profile.userId}
                </CardDescription>
              </div>
              {profile.specialization && (
                <p className="text-sm text-muted-foreground mt-1">
                  {profile.specialization}
                </p>
              )}
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-wrap gap-2">
            <Link href={`/messages/${profile.id}`}>
              <Button size="sm" data-testid="button-send-message">
                <MessageSquare className="w-4 h-4 mr-2" />
                Send Message
              </Button>
            </Link>
            
            {currentUser?.role === "freelancer" && profile.role === "freelancer" && currentUser.id !== profile.id && (
              <Dialog open={recommendDialogOpen} onOpenChange={setRecommendDialogOpen}>
                <DialogTrigger asChild>
                  <Button size="sm" variant="outline" data-testid="button-recommend">
                    <Award className="w-4 h-4 mr-2" />
                    Recommend for Job
                  </Button>
                </DialogTrigger>
                <DialogContent>
                  <DialogHeader>
                    <DialogTitle>Recommend {profile.username}</DialogTitle>
                    <DialogDescription>
                      Recommend this freelancer to a customer for one of their active jobs.
                    </DialogDescription>
                  </DialogHeader>
                  <div className="space-y-4 py-4">
                    <div className="space-y-2">
                      <label className="text-sm font-medium">Select a job</label>
                      <Select value={selectedJobId} onValueChange={setSelectedJobId}>
                        <SelectTrigger data-testid="select-job">
                          <SelectValue placeholder="Choose a job..." />
                        </SelectTrigger>
                        <SelectContent>
                          {availableJobs.length === 0 ? (
                            <div className="p-2 text-sm text-muted-foreground text-center">
                              No active jobs available
                            </div>
                          ) : (
                            availableJobs.map((job) => (
                              <SelectItem key={job.id} value={job.id}>
                                <div className="flex flex-col">
                                  <span>{job.title}</span>
                                  <span className="text-xs text-muted-foreground">
                                    ${job.budget} - {job.customer?.username || "Unknown"}
                                  </span>
                                </div>
                              </SelectItem>
                            ))
                          )}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-2">
                      <label className="text-sm font-medium">Message to Customer (optional)</label>
                      <Textarea
                        placeholder="Why should they accept this freelancer?"
                        value={customerMessage}
                        onChange={(e) => setCustomerMessage(e.target.value)}
                        data-testid="input-customer-message"
                      />
                    </div>
                    <div className="space-y-2">
                      <label className="text-sm font-medium">Message to {profile?.username} (optional)</label>
                      <Textarea
                        placeholder="Let them know about the opportunity..."
                        value={freelancerMessage}
                        onChange={(e) => setFreelancerMessage(e.target.value)}
                        data-testid="input-freelancer-message"
                      />
                    </div>
                    <Button
                      onClick={handleRecommend}
                      disabled={!selectedJobId || recommendMutation.isPending}
                      className="w-full"
                      data-testid="button-submit-recommendation"
                    >
                      {recommendMutation.isPending ? "Sending..." : "Send Recommendation"}
                    </Button>
                  </div>
                </DialogContent>
              </Dialog>
            )}
          </div>

          {profile.bio && (
            <>
              <Separator />
              <div data-testid="section-bio">
                <h3 className="font-semibold mb-2">About</h3>
                <p className="text-sm text-muted-foreground whitespace-pre-wrap">{profile.bio}</p>
              </div>
            </>
          )}

          <Separator />

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            {(profile.role === "freelancer" || profile.role === "moderator") && (
              <>
                <div className="text-center p-3 bg-muted rounded-lg">
                  <TrendingUp className="w-5 h-5 mx-auto mb-1 text-primary" />
                  <p className="text-lg font-bold" data-testid="text-level">Level {profile.level}</p>
                  <p className="text-xs text-muted-foreground">Experience</p>
                </div>
                <div className="text-center p-3 bg-muted rounded-lg">
                  <Star className="w-5 h-5 mx-auto mb-1 text-yellow-500" />
                  <p className="text-lg font-bold" data-testid="text-rating">
                    {profile.rating || "N/A"}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {profile.ratingCount || 0} reviews
                  </p>
                </div>
                <div className="text-center p-3 bg-muted rounded-lg">
                  <Briefcase className="w-5 h-5 mx-auto mb-1 text-blue-500" />
                  <p className="text-lg font-bold" data-testid="text-completed-jobs">
                    {profile.completedJobs || 0}
                  </p>
                  <p className="text-xs text-muted-foreground">Completed Jobs</p>
                </div>
              </>
            )}
            <div className="text-center p-3 bg-muted rounded-lg">
              <Calendar className="w-5 h-5 mx-auto mb-1 text-green-500" />
              <p className="text-sm font-medium" data-testid="text-joined">
                {format(new Date(profile.createdAt), "MMM yyyy")}
              </p>
              <p className="text-xs text-muted-foreground">Member Since</p>
            </div>
          </div>

          {profile.recentCompletedJobs && profile.recentCompletedJobs.length > 0 && (
            <>
              <Separator />
              <div>
                <h3 className="font-semibold mb-3">Recent Completed Jobs</h3>
                <div className="space-y-2">
                  {profile.recentCompletedJobs.map((job) => (
                    <div
                      key={job.id}
                      className="flex items-center justify-between p-2 border rounded-lg text-sm"
                      data-testid={`completed-job-${job.id}`}
                    >
                      <div>
                        <p className="font-medium">{job.title}</p>
                        <p className="text-xs text-muted-foreground">{job.category}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
