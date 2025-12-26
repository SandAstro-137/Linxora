import { useState, useRef } from "react";
import { useAuth } from "@/lib/auth-context";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Briefcase, Star, TrendingUp, Clock, Edit2, Save, Camera, Shield, DollarSign, FileCheck, CalendarDays, CheckCircle, XCircle, Award, Users, Target } from "lucide-react";
import { StatsCard } from "@/components/stats-card";
import { Separator } from "@/components/ui/separator";
import { JobCard } from "@/components/job-card";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import type { WorkingHours } from "@shared/schema";

export default function ProfilePage() {
  const { user } = useAuth();
  const { toast } = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isEditingHours, setIsEditingHours] = useState(false);
  const [isEditingSpecialization, setIsEditingSpecialization] = useState(false);
  const [specializationValue, setSpecializationValue] = useState("");
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
  });

  const { data: savedWorkingHours } = useQuery({
    queryKey: ["/api/profile/working-hours"],
    enabled: user?.role === "freelancer",
  });

  const { data: profileStats } = useQuery<any>({
    queryKey: ["/api/profile/stats"],
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

  const updateAvatarMutation = useMutation({
    mutationFn: (avatar: string) => apiRequest("PUT", "/api/profile/avatar", { avatar }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/auth/me"] });
      toast({
        title: "Profile picture updated",
        description: "Your new profile picture has been saved",
      });
    },
    onError: (error: any) => {
      toast({
        title: "Failed to update profile picture",
        description: error?.message || "Please try again with a different image",
        variant: "destructive",
      });
    },
  });

  const updateSpecializationMutation = useMutation({
    mutationFn: (specialization: string) => apiRequest("PUT", "/api/profile/specialization", { specialization }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/auth/me"] });
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

  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith("image/")) {
      toast({
        title: "Invalid file type",
        description: "Please select an image file",
        variant: "destructive",
      });
      return;
    }

    if (file.size > 5 * 1024 * 1024) {
      toast({
        title: "File too large",
        description: "Please select an image smaller than 5MB",
        variant: "destructive",
      });
      return;
    }

    const reader = new FileReader();
    reader.onloadend = () => {
      const base64String = reader.result as string;
      updateAvatarMutation.mutate(base64String);
    };
    reader.readAsDataURL(file);
  };

  if (!user) return null;

  const initials = user.username
    .split(" ")
    .map((n) => n[0])
    .join("")
    .toUpperCase()
    .slice(0, 2);

  // Calculate level progress based on actual level system
  // Level 1: 0-4, Level 2: 5-14, Level 3: 15-29, Level 4: 30-49, Level 5: 50+
  const calculateLevelProgress = () => {
    const completed = user.completedJobs || 0;
    const level = user.level || 1;
    
    let progress = 0;
    
    if (level === 1) {
      // 0-4 jobs, need 5 for next level
      progress = (completed / 5) * 100;
    } else if (level === 2) {
      // 5-14 jobs, need 15 for next level
      progress = ((completed - 5) / 10) * 100;
    } else if (level === 3) {
      // 15-29 jobs, need 30 for next level
      progress = ((completed - 15) / 15) * 100;
    } else if (level === 4) {
      // 30-49 jobs, need 50 for next level
      progress = ((completed - 30) / 20) * 100;
    } else {
      // Level 5 (50+), max level reached
      progress = 100;
    }
    
    // Clamp progress between 0 and 100 to handle race conditions
    return Math.min(100, Math.max(0, progress));
  };
  
  const getJobsUntilNextLevel = () => {
    const completed = user.completedJobs || 0;
    const level = user.level || 1;
    
    let remaining = 0;
    
    if (level === 1) remaining = 5 - completed;
    else if (level === 2) remaining = 15 - completed;
    else if (level === 3) remaining = 30 - completed;
    else if (level === 4) remaining = 50 - completed;
    else remaining = 0; // Max level
    
    // Ensure remaining is never negative
    return Math.max(0, remaining);
  };
  
  const levelProgress = calculateLevelProgress();
  const jobsUntilNext = getJobsUntilNextLevel();

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
                <Button
                  size="icon"
                  variant="secondary"
                  className="absolute bottom-0 right-0 h-8 w-8 rounded-full"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={updateAvatarMutation.isPending}
                  data-testid="button-upload-avatar"
                >
                  <Camera className="h-4 w-4" />
                </Button>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={handleFileChange}
                  data-testid="input-avatar-file"
                />
              </div>
              <h3 className="text-xl font-semibold mb-1" data-testid="text-username">
                {user.username}
              </h3>
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
                    <span className="text-sm text-muted-foreground" data-testid="text-completed-jobs">
                      {user.completedJobs || 0} jobs
                    </span>
                  </div>
                  <Progress value={levelProgress} className="h-2" data-testid="progress-level" />
                  <p className="text-xs text-muted-foreground mt-1">
                    {(user.level || 1) === 5 
                      ? "Max level reached!" 
                      : `${jobsUntilNext} job${jobsUntilNext !== 1 ? 's' : ''} until next level`}
                  </p>
                </div>

                <Separator />

                <div className="space-y-2">
                  <div className="flex items-center gap-2">
                    <Star className="w-4 h-4 text-yellow-500" />
                    <span className="text-sm font-medium">Rating</span>
                    <span className="ml-auto text-sm font-bold" data-testid="text-rating-value">
                      {user.rating ? `${user.rating}/5` : "N/A"}
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
                    <span className="text-sm font-medium">Account Age</span>
                    <span className="ml-auto text-sm font-bold">
                      {profileStats.accountAgeDays || 0} days
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
                    <Target className="w-4 h-4 text-blue-500" />
                    <span className="text-sm font-medium">Accuracy Score</span>
                    <span className="ml-auto text-sm font-bold">
                      {profileStats.accuracyScore || 0}%
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
                    <span className="text-sm font-medium">Account Age</span>
                    <span className="ml-auto text-sm font-bold">
                      {profileStats.accountAgeDays || 0} days
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
                <StatsCard
                  title="Accuracy Score"
                  value={`${profileStats.accuracyScore || 0}%`}
                  icon={Target}
                  description="Decision accuracy"
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

          <Card>
            <CardHeader>
              <CardTitle>Completed Projects</CardTitle>
            </CardHeader>
            <CardContent>
              {Array.isArray(completedJobs) && completedJobs.length > 0 ? (
                <div className="grid gap-4">
                  {completedJobs.slice(0, 3).map((job: any) => (
                    <JobCard key={job.id} job={job} showActions={false} />
                  ))}
                </div>
              ) : (
                <p className="text-center py-8 text-muted-foreground">
                  No completed jobs yet
                </p>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
