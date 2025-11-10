import { useAuth } from "@/lib/auth-context";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Briefcase, Star, TrendingUp, Clock } from "lucide-react";
import { StatsCard } from "@/components/stats-card";
import { Separator } from "@/components/ui/separator";
import { JobCard } from "@/components/job-card";

export default function ProfilePage() {
  const { user } = useAuth();

  const { data: completedJobs } = useQuery({
    queryKey: ["/api/profile/completed-jobs"],
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

          <Card>
            <CardHeader>
              <CardTitle>Working Hours</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex items-center gap-2 text-muted-foreground">
                <Clock className="w-4 h-4" />
                <span>Configure your availability and working schedule</span>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Completed Projects</CardTitle>
            </CardHeader>
            <CardContent>
              {completedJobs && completedJobs.length > 0 ? (
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
