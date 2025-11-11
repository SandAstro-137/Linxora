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
import { Briefcase, Star, TrendingUp, Clock, Edit2, Save } from "lucide-react";
import { StatsCard } from "@/components/stats-card";
import { Separator } from "@/components/ui/separator";
import { JobCard } from "@/components/job-card";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import type { WorkingHours } from "@shared/schema";

export default function ProfilePage() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [isEditingHours, setIsEditingHours] = useState(false);
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
    onError: () => {
      toast({
        title: "Failed to update",
        description: "Please try again",
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

  const levelProgress = ((user.completedJobs || 0) % 10) * 10;

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-3xl font-bold tracking-tight">Freelancer Profile</h2>
        <p className="text-muted-foreground">Manage your professional profile</p>
      </div>

      <div className="grid gap-6 md:grid-cols-3">
        <Card className="md:col-span-1">
          <CardHeader>
            <CardTitle>Profile</CardTitle>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="flex flex-col items-center text-center">
              <Avatar className="w-24 h-24 mb-4">
                <AvatarImage src={user.avatar || undefined} alt={user.username} />
                <AvatarFallback className="text-2xl">{initials}</AvatarFallback>
              </Avatar>
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

            <Separator />

            <div>
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm font-medium">Level {user.level}</span>
                <span className="text-sm text-muted-foreground">
                  {user.completedJobs || 0} jobs
                </span>
              </div>
              <Progress value={levelProgress} className="h-2" />
              <p className="text-xs text-muted-foreground mt-1">
                {10 - ((user.completedJobs || 0) % 10)} jobs until next level
              </p>
            </div>

            <Separator />

            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <Star className="w-4 h-4 text-yellow-500" />
                <span className="text-sm font-medium">Rating</span>
                <span className="ml-auto text-sm font-bold">
                  {user.rating || "N/A"}
                </span>
              </div>
              <div className="flex items-center gap-2">
                <Briefcase className="w-4 h-4 text-primary" />
                <span className="text-sm font-medium">Completed Jobs</span>
                <span className="ml-auto text-sm font-bold">
                  {user.completedJobs || 0}
                </span>
              </div>
            </div>
          </CardContent>
        </Card>

        <div className="md:col-span-2 space-y-6">
          <div className="grid gap-4 sm:grid-cols-2">
            <StatsCard
              title="Completed Jobs"
              value={user.completedJobs || 0}
              icon={Briefcase}
              description="All time"
            />
            <StatsCard
              title="Current Level"
              value={`Level ${user.level || 1}`}
              icon={TrendingUp}
              description="Professional growth"
            />
          </div>

          {user.specialization && (
            <Card>
              <CardHeader>
                <CardTitle>Specialization</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-muted-foreground">{user.specialization}</p>
              </CardContent>
            </Card>
          )}

          {user.role === "freelancer" && (
            <Card data-testid="card-working-hours">
              <CardHeader>
                <div className="flex items-center justify-between">
                  <CardTitle>Working Hours</CardTitle>
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
