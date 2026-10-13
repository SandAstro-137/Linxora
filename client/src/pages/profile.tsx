import { useState } from "react";
import { useAuth } from "@/lib/auth-context";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Briefcase, Star, TrendingUp, Clock, Edit2, Save, Shield, DollarSign, FileCheck, CalendarDays, CheckCircle, XCircle, Award, Users, Link2 } from "lucide-react";
import { StatsCard } from "@/components/stats-card";
import { Separator } from "@/components/ui/separator";
import { ScrollArea } from "@/components/ui/scroll-area";
import { JobCard } from "@/components/job-card";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { formatAccountCreated } from "@/lib/utils";
import { useToast } from "@/hooks/use-toast";
import { getLevelProgressFromEarnings, getEarningsToNextLevel, type WorkingHours } from "@shared/schema";

export default function ProfilePage() {
  const { user, refetchUser } = useAuth();
  const { toast } = useToast();
  const [isEditingHours, setIsEditingHours] = useState(false);
  const [isEditingSpecialization, setIsEditingSpecialization] = useState(false);
  const [isEditingPortfolio, setIsEditingPortfolio] = useState(false);
  const [specializationValue, setSpecializationValue] = useState("");
  const [portfolioValue, setPortfolioValue] = useState("");
  const [workingHours, setWorkingHours] = useState({
    monday: { start: "", end: "" },
    tuesday: { start: "", end: "" },
    wednesday: { start: "", end: "" },
    thursday: { start: "", end: "" },
    friday: { start: "", end: "" },
    saturday: { start: "", end: "" },
    sunday: { start: "", end: "" },
  });

  const { data: completedJobs } = useQuery({
    queryKey: ["/api/profile/completed-jobs"],
    refetchInterval: 10000, // Keep completed-job count current without a manual refresh
  });

  const { data: savedWorkingHours } = useQuery({
    queryKey: ["/api/profile/working-hours"],
    enabled: user?.role === "freelancer",
  });

  const { data: profileStats } = useQuery<any>({
    queryKey: ["/api/profile/stats"],
    refetchInterval: 10000, // Keep level / earnings progress current without a manual refresh
  });

  const { data: moderatorTasks, isError: moderatorTasksError } = useQuery<any[]>({
    queryKey: ["/api/moderator-tasks"],
    enabled: user?.role === "moderator" || user?.role === "head_of_moderation",
    retry: false,
  });

  const updatePortfolioMutation = useMutation({
    mutationFn: (portfolio: string) => apiRequest("PUT", "/api/profile/portfolio", { portfolio }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/auth/me"] });
      refetchUser();
      setIsEditingPortfolio(false);
      toast({
        title: "Portfolio updated",
        description: "Your portfolio link has been saved",
      });
    },
    onError: (error: any) => {
      toast({
        title: "Failed to update portfolio",
        description: error?.message || "Please enter a valid http(s) URL",
        variant: "destructive",
      });
    },
  });

  const updateWorkingHoursMutation = useMutation({
    mutationFn: (hours: WorkingHours) => apiRequest("PUT", "/api/profile/working-hours", hours),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/profile/working-hours"] });
      queryClient.invalidateQueries({ queryKey: ["/api/auth/me"] });
      setIsEditingHours(false);
      toast({
        title: "Working hours updated",
        description: "Your schedule has been saved successfully",
      });
    },
    onError: (error: any) => {
      toast({
        title: "Failed to update working hours",
        description: error?.message || "Please ensure end time is after start time for each day",
        variant: "destructive",
      });
    },
  });


  const updateSpecializationMutation = useMutation({
    mutationFn: (specialization: string) => apiRequest("PUT", "/api/profile/specialization", { specialization }),
    onSuccess: () => {
      // The user object comes from AuthContext (plain fetch), not react-query,
      // so we must refetch it directly — invalidateQueries alone does nothing here.
      refetchUser();
      setIsEditingSpecialization(false);
      toast({
        title: "Specialization updated",
        description: "Your specialization has been saved",
      });
    },
    onError: (error: any) => {
      toast({
        title: "Failed to update",
        description: error?.message || "Please try again",
        variant: "destructive",
      });
    },
  });

  if (!user) return null;

  const initials = user.username
    .split(" ")
    .map((n) => n[0])
    .join("")
    .toUpperCase()
    .slice(0, 2);

  // Level progression is based on lifetime earnings (USD), not completed jobs.
  // Level 1 is the base level; higher levels unlock at $20, $50, $100, $250, $450, $750, and $1500.
  const totalEarned = parseFloat(user.totalEarned || "0");
  const levelProgress = getLevelProgressFromEarnings(totalEarned);
  const earningsToNextLevel = getEarningsToNextLevel(totalEarned);
  const earningsToNextFormatted = earningsToNextLevel.toLocaleString("en-US", { maximumFractionDigits: 2 });

  const getRoleTitle = () => {
    switch (user.role) {
      case "customer": return "Customer Profile";
      case "moderator": case "staff": return "Moderator Profile";
      default: return "Freelancer Profile";
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-3xl font-bold tracking-tight">{getRoleTitle()}</h2>
        <p className="text-muted-foreground">Manage your professional profile</p>
      </div>

      <div className="grid gap-6 md:grid-cols-3">
        <Card className="md:col-span-1">
          <CardHeader>
            <CardTitle>Profile</CardTitle>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="flex flex-col items-center text-center">
              <div className="relative mb-4">
                <Avatar className="w-24 h-24">
                  <AvatarImage src={user.avatar || undefined} alt={user.username} />
                  <AvatarFallback className="text-2xl">{initials}</AvatarFallback>
                </Avatar>
              </div>
              <h3 className="text-xl font-semibold mb-1" data-testid="text-username">
                {user.username}
              </h3>
              <p className="text-sm text-muted-foreground mb-1" data-testid="text-user-id">
                User ID: {user.userId}
              </p>
              {user.email && (
                <p className="text-sm text-muted-foreground mb-2">{user.email}</p>
              )}
              <Badge variant="secondary" className="mb-4">
                {user.role}
              </Badge>
              {user.specialization && (
                <Badge variant="outline">{user.specialization}</Badge>
              )}
            </div>

            {user.role === "freelancer" && (
              <>
                <Separator />

                <div>
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-sm font-medium" data-testid="text-level">Level {user.level}</span>
                  </div>
                  <Progress value={levelProgress} className="h-2" data-testid="progress-level" />
                  <p className="text-xs text-muted-foreground mt-1">
                    {(user.level || 1) >= 8 
                      ? "Max level reached!" 
                      : `Earn ${earningsToNextFormatted} More To Level Up!`}
                  </p>
                </div>

                <Separator />

                <div className="space-y-2">
                  <div className="flex items-center gap-2">
                    <Star className="w-4 h-4 text-yellow-500" />
                    <span className="text-sm font-medium">Rating</span>
                    <span className="ml-auto text-sm font-bold" data-testid="text-rating-value">
                      {(user.totalRatings || 0) > 0 && user.rating ? `${user.rating}/5` : "N/A"}
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <TrendingUp className="w-4 h-4 text-green-500" />
                    <span className="text-sm font-medium">Completion Rate</span>
                    <span className="ml-auto text-sm font-bold" data-testid="text-completion-percentage">
                      {user.completionPercentage ? `${user.completionPercentage}%` : "0%"}
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <Briefcase className="w-4 h-4 text-primary" />
                    <span className="text-sm font-medium">Completed Jobs</span>
                    <span className="ml-auto text-sm font-bold" data-testid="text-completed-count">
                      {user.completedJobs || 0}
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <CalendarDays className="w-4 h-4 text-muted-foreground" />
                    <span className="text-sm font-medium">Account Created</span>
                    <span className="ml-auto text-sm font-bold">
                      {formatAccountCreated(user.createdAt)}
                    </span>
                  </div>
                </div>
              </>
            )}

            {user.role === "customer" && profileStats && (
              <>
                <Separator />
                {profileStats.isVerified && (
                  <div className="flex items-center gap-2 p-2 bg-green-500/10 rounded-lg mb-2">
                    <CheckCircle className="w-4 h-4 text-green-500" />
                    <span className="text-sm font-medium text-green-700 dark:text-green-400">Verified Customer</span>
                  </div>
                )}
                <div className="space-y-2">
                  <div className="flex items-center gap-2">
                    <Briefcase className="w-4 h-4 text-primary" />
                    <span className="text-sm font-medium">Jobs Posted</span>
                    <span className="ml-auto text-sm font-bold">
                      {profileStats.totalJobsPosted || 0}
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <FileCheck className="w-4 h-4 text-green-500" />
                    <span className="text-sm font-medium">Completed</span>
                    <span className="ml-auto text-sm font-bold">
                      {profileStats.completedJobs || 0}
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <DollarSign className="w-4 h-4 text-yellow-500" />
                    <span className="text-sm font-medium">Total Traded</span>
                    <span className="ml-auto text-sm font-bold">
                      ${(profileStats.totalSpent || 0).toLocaleString()}
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <Star className="w-4 h-4 text-blue-500" />
                    <span className="text-sm font-medium">Reliability Score</span>
                    <span className="ml-auto text-sm font-bold">
                      {profileStats.reliabilityScore || 0}/10
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <XCircle className="w-4 h-4 text-red-500" />
                    <span className="text-sm font-medium">Cancellation Rate</span>
                    <span className="ml-auto text-sm font-bold">
                      {profileStats.cancellationRate || 0}%
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <CalendarDays className="w-4 h-4 text-muted-foreground" />
                    <span className="text-sm font-medium">Account Created</span>
                    <span className="ml-auto text-sm font-bold">
                      {formatAccountCreated(user.createdAt)}
                    </span>
                  </div>
                </div>
              </>
            )}

            {(user.role === "moderator" || user.role === "staff") && profileStats && (
              <>
                <Separator />
                {profileStats.isVerified && (
                  <div className="flex items-center gap-2 p-2 bg-purple-500/10 rounded-lg mb-2">
                    <Shield className="w-4 h-4 text-purple-500" />
                    <span className="text-sm font-medium text-purple-700 dark:text-purple-400">Verified Moderator</span>
                  </div>
                )}
                <div className="space-y-2">
                  <div className="flex items-center gap-2">
                    <Award className="w-4 h-4 text-yellow-500" />
                    <span className="text-sm font-medium">Rank</span>
                    <span className="ml-auto text-sm font-bold">
                      {profileStats.moderatorTier || "Bronze"}
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <Shield className="w-4 h-4 text-primary" />
                    <span className="text-sm font-medium">Jobs Moderated</span>
                    <span className="ml-auto text-sm font-bold">
                      {profileStats.totalJobsModerated || 0}
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <Users className="w-4 h-4 text-green-500" />
                    <span className="text-sm font-medium">Cases Reviewed</span>
                    <span className="ml-auto text-sm font-bold">
                      {profileStats.casesReviewed || 0}
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <Clock className="w-4 h-4 text-yellow-500" />
                    <span className="text-sm font-medium">Pending Queue</span>
                    <span className="ml-auto text-sm font-bold">
                      {profileStats.pendingQueue || 0}
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <CalendarDays className="w-4 h-4 text-muted-foreground" />
                    <span className="text-sm font-medium">Account Created</span>
                    <span className="ml-auto text-sm font-bold">
                      {formatAccountCreated(user.createdAt)}
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <CheckCircle className="w-4 h-4 text-green-500" />
                    <span className="text-sm font-medium">Status</span>
                    <span className="ml-auto text-sm font-bold text-green-600 dark:text-green-400">
                      {profileStats.moderatorStatus || "Active"}
                    </span>
                  </div>
                </div>
              </>
            )}
          </CardContent>
        </Card>

        <div className="md:col-span-2 space-y-6">
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {user.role === "freelancer" && (
              <>
                <StatsCard
                  title="Completed Jobs"
                  value={user.completedJobs || 0}
                  icon={Briefcase}
                  description="All time"
                />
                <StatsCard
                  title="Completion Rate"
                  value={user.completionPercentage ? `${user.completionPercentage}%` : "0%"}
                  icon={TrendingUp}
                  description="Job success rate"
                />
                <StatsCard
                  title="Current Level"
                  value={`Level ${user.level || 1}`}
                  icon={Star}
                  description="Professional growth"
                />
              </>
            )}
            {user.role === "customer" && profileStats && (
              <>
                <StatsCard
                  title="Jobs Posted"
                  value={profileStats.totalJobsPosted || 0}
                  icon={Briefcase}
                  description="Total jobs created"
                />
                <StatsCard
                  title="Reliability Score"
                  value={`${profileStats.reliabilityScore || 0}/10`}
                  icon={Star}
                  description="Customer trustworthiness"
                />
                <StatsCard
                  title="Total Traded"
                  value={`$${(profileStats.totalSpent || 0).toLocaleString()}`}
                  icon={DollarSign}
                  description="On completed jobs"
                />
              </>
            )}
            {(user.role === "moderator" || user.role === "staff") && profileStats && (
              <>
                <StatsCard
                  title="Moderator Rank"
                  value={profileStats.moderatorTier || "Bronze"}
                  icon={Award}
                  description="Based on cases reviewed"
                />
                <StatsCard
                  title="Cases Reviewed"
                  value={profileStats.casesReviewed || 0}
                  icon={Users}
                  description="Reports handled"
                />
              </>
            )}
          </div>

          {user.role === "freelancer" && (
            <Card data-testid="card-specialization">
              <CardHeader>
                <div className="flex items-center justify-between gap-2">
                  <CardTitle>Specialization</CardTitle>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      if (isEditingSpecialization) {
                        if (specializationValue.trim()) {
                          updateSpecializationMutation.mutate(specializationValue);
                        } else {
                          setIsEditingSpecialization(false);
                        }
                      } else {
                        setSpecializationValue(user.specialization || "");
                        setIsEditingSpecialization(true);
                      }
                    }}
                    disabled={updateSpecializationMutation.isPending}
                    data-testid="button-edit-specialization"
                  >
                    {isEditingSpecialization ? (
                      <>
                        <Save className="w-4 h-4 mr-1" />
                        Save
                      </>
                    ) : (
                      <>
                        <Edit2 className="w-4 h-4 mr-1" />
                        {user.specialization ? "Edit" : "Add"}
                      </>
                    )}
                  </Button>
                </div>
              </CardHeader>
              <CardContent>
                {isEditingSpecialization ? (
                  <Input
                    placeholder="e.g., Web Development, UI/UX Design, Data Analysis"
                    value={specializationValue}
                    onChange={(e) => setSpecializationValue(e.target.value)}
                    maxLength={100}
                    data-testid="input-specialization"
                  />
                ) : (
                  <p className="text-muted-foreground">
                    {user.specialization || "No specialization set. Click Edit to add one."}
                  </p>
                )}
              </CardContent>
            </Card>
          )}

          {user.role === "freelancer" && (
            <Card data-testid="card-portfolio">
              <CardHeader>
                <div className="flex items-center justify-between gap-2">
                  <CardTitle>Portfolio</CardTitle>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      if (isEditingPortfolio) {
                        updatePortfolioMutation.mutate(portfolioValue);
                      } else {
                        setPortfolioValue(user.portfolio || "");
                        setIsEditingPortfolio(true);
                      }
                    }}
                    disabled={updatePortfolioMutation.isPending}
                    data-testid="button-edit-portfolio"
                  >
                    {isEditingPortfolio ? (
                      <>
                        <Save className="w-4 h-4 mr-1" />
                        Save
                      </>
                    ) : (
                      <>
                        <Edit2 className="w-4 h-4 mr-1" />
                        {user.portfolio ? "Edit" : "Add"}
                      </>
                    )}
                  </Button>
                </div>
              </CardHeader>
              <CardContent>
                {isEditingPortfolio ? (
                  <Input
                    placeholder="https://yourportfolio.com"
                    value={portfolioValue}
                    onChange={(e) => setPortfolioValue(e.target.value)}
                    maxLength={300}
                    data-testid="input-portfolio"
                  />
                ) : user.portfolio ? (
                  <a
                    href={user.portfolio}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-primary hover:underline inline-flex items-center gap-1"
                    data-testid="link-portfolio"
                  >
                    <Link2 className="w-4 h-4" />
                    {user.portfolio}
                  </a>
                ) : (
                  <p className="text-muted-foreground">
                    No portfolio set. Click Add to link your portfolio.
                  </p>
                )}
              </CardContent>
            </Card>
          )}

          {user.role === "freelancer" && (
            <Card data-testid="card-working-hours">
              <CardHeader>
                <div className="flex items-center justify-between">
                  <CardTitle>Working Hours (Eastern Time)</CardTitle>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      if (isEditingHours) {
                        updateWorkingHoursMutation.mutate(workingHours);
                      } else {
                        if (savedWorkingHours && typeof savedWorkingHours === 'object') {
                          setWorkingHours({ ...workingHours, ...savedWorkingHours });
                        }
                        setIsEditingHours(true);
                      }
                    }}
                    data-testid="button-edit-working-hours"
                  >
                    {isEditingHours ? (
                      <>
                        <Save className="w-4 h-4 mr-1" />
                        Save
                      </>
                    ) : (
                      <>
                        <Edit2 className="w-4 h-4 mr-1" />
                        Edit
                      </>
                    )}
                  </Button>
                </div>
              </CardHeader>
              <CardContent>
                {isEditingHours ? (
                  <div className="space-y-3">
                    {Object.entries(workingHours).map(([day, hours]) => (
                      <div key={day} className="flex items-center gap-2">
                        <Label className="w-24 capitalize">{day}</Label>
                        <Input
                          type="time"
                          placeholder="Start"
                          value={(hours as any).start}
                          onChange={(e) =>
                            setWorkingHours((prev) => ({
                              ...prev,
                              [day]: { ...prev[day as keyof typeof prev], start: e.target.value },
                            }))
                          }
                          className="flex-1"
                          data-testid={`input-${day}-start`}
                        />
                        <span className="text-muted-foreground">to</span>
                        <Input
                          type="time"
                          placeholder="End"
                          value={(hours as any).end}
                          onChange={(e) =>
                            setWorkingHours((prev) => ({
                              ...prev,
                              [day]: { ...prev[day as keyof typeof prev], end: e.target.value },
                            }))
                          }
                          className="flex-1"
                          data-testid={`input-${day}-end`}
                        />
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="space-y-2">
                    {savedWorkingHours && typeof savedWorkingHours === 'object' && Object.keys(savedWorkingHours).length > 0 ? (
                      Object.entries(savedWorkingHours).map(([day, hours]: [string, any]) => (
                        <div key={day} className="flex items-center justify-between">
                          <span className="capitalize font-medium">{day}</span>
                          <span className="text-muted-foreground">
                            {hours.start && hours.end
                              ? `${hours.start} - ${hours.end}`
                              : "Not set"}
                          </span>
                        </div>
                      ))
                    ) : (
                      <div className="flex items-center gap-2 text-muted-foreground py-4">
                        <Clock className="w-4 h-4" />
                        <span>No working hours configured yet</span>
                      </div>
                    )}
                  </div>
                )}
              </CardContent>
            </Card>
          )}

          {(user.role === "moderator" || user.role === "head_of_moderation") ? (
            <Card>
              <CardHeader>
                <CardTitle>Assigned Tasks</CardTitle>
              </CardHeader>
              <CardContent>
                {moderatorTasksError ? (
                  <p className="text-center py-8 text-muted-foreground">
                    Unable to load tasks
                  </p>
                ) : Array.isArray(moderatorTasks) && moderatorTasks.length > 0 ? (
                  <div className="space-y-3">
                    {moderatorTasks.slice(0, 5).map((task: any) => (
                      <div 
                        key={task.id} 
                        className="flex items-start gap-3 p-3 rounded-lg border"
                        data-testid={`task-card-${task.id}`}
                      >
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap mb-1">
                            <span className="font-medium truncate">{task.title}</span>
                            <Badge 
                              variant={task.taskType === "team" ? "default" : "secondary"}
                              className="text-xs"
                            >
                              {task.taskType === "team" ? (
                                <><Users className="w-3 h-3 mr-1" />Team</>
                              ) : (
                                "Personal"
                              )}
                            </Badge>
                            <Badge 
                              variant={
                                task.status === "completed" ? "default" : 
                                task.status === "in_progress" ? "secondary" : "outline"
                              }
                              className="text-xs"
                            >
                              {task.status === "completed" ? (
                                <><CheckCircle className="w-3 h-3 mr-1" />Completed</>
                              ) : task.status === "in_progress" ? (
                                <><Clock className="w-3 h-3 mr-1" />In Progress</>
                              ) : (
                                "Pending"
                              )}
                            </Badge>
                          </div>
                          {task.description && (
                            <p className="text-sm text-muted-foreground truncate">
                              {task.description}
                            </p>
                          )}
                          <div className="flex items-center gap-2 mt-1 text-xs text-muted-foreground">
                            {task.priority && (
                              <span className={`capitalize ${
                                task.priority === "high" ? "text-red-500" : 
                                task.priority === "medium" ? "text-yellow-500" : ""
                              }`}>
                                {task.priority} priority
                              </span>
                            )}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-center py-8 text-muted-foreground">
                    No tasks assigned yet
                  </p>
                )}
              </CardContent>
            </Card>
          ) : (
            <Card>
              <CardHeader>
                <CardTitle>Completed Projects</CardTitle>
              </CardHeader>
              <CardContent>
                {Array.isArray(completedJobs) && completedJobs.length > 0 ? (
                  <ScrollArea className="h-[500px] pr-3">
                    <div className="grid gap-4">
                      {completedJobs.map((job: any) => (
                        <JobCard key={job.id} job={job} showActions={false} />
                      ))}
                    </div>
                  </ScrollArea>
                ) : (
                  <p className="text-center py-8 text-muted-foreground">
                    No completed jobs yet
                  </p>
                )}
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}
