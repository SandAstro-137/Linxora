import { useAuth } from "@/lib/auth-context";
import { useQuery } from "@tanstack/react-query";
import { StatsCard } from "@/components/stats-card";
import { JobCard } from "@/components/job-card";
import { Briefcase, DollarSign, TrendingUp, Users, Shield, CalendarDays, AlertCircle, UserCheck, Star, Award } from "lucide-react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Job } from "@shared/schema";
import { Skeleton } from "@/components/ui/skeleton";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Link } from "wouter";

interface RecommendedFreelancer {
  id: string;
  userId: number;
  username: string;
  avatar: string | null;
  level: number;
  rating: string;
  ratingCount: number;
  completedJobs: number;
  specialization: string | null;
  score: number;
}

interface DashboardStats {
  activeJobs?: number;
  postedJobs?: number;
  pendingJobs?: number;
  totalSpent?: string;
  approvedToday?: number;
  totalJobs?: number;
  teamMembers?: number;
  pendingReports?: number;
  upgradeRequests?: number;
  totalUsers?: number;
  platformRevenue?: string;
}

export default function DashboardPage() {
  const { user } = useAuth();

  const { data: stats, isLoading: statsLoading } = useQuery<DashboardStats>({
    queryKey: ["/api/dashboard/stats"],
  });

  const { data: recentJobs, isLoading: jobsLoading } = useQuery<Job[]>({
    queryKey: ["/api/jobs/recent"],
  });

  const { data: recommendations = [], isLoading: recommendationsLoading } = useQuery<RecommendedFreelancer[]>({
    queryKey: ["/api/freelancers/recommendations"],
    enabled: user?.role === "customer",
  });

  if (!user) return null;

  const renderFreelancerDashboard = () => (
    <>
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
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
          description="Keep growing!"
        />
        <StatsCard
          title="Rating"
          value={user.rating || "N/A"}
          icon={Users}
          description="Average rating"
        />
        <StatsCard
          title="Active Jobs"
          value={statsLoading ? "..." : stats?.activeJobs || 0}
          icon={Briefcase}
          description="In progress"
        />
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Available Jobs</CardTitle>
        </CardHeader>
        <CardContent>
          {jobsLoading ? (
            <div className="space-y-4">
              {[1, 2, 3].map((i) => (
                <Skeleton key={i} className="h-32 w-full" />
              ))}
            </div>
          ) : recentJobs && recentJobs.length > 0 ? (
            <div className="grid gap-4 md:grid-cols-2">
              {recentJobs.slice(0, 4).map((job) => (
                <JobCard key={job.id} job={job} />
              ))}
            </div>
          ) : (
            <p className="text-center text-muted-foreground py-8">
              No jobs available at the moment
            </p>
          )}
        </CardContent>
      </Card>
    </>
  );

  const renderCustomerDashboard = () => (
    <>
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <StatsCard
          title="Posted Jobs"
          value={statsLoading ? "..." : stats?.postedJobs || 0}
          icon={Briefcase}
          description="Total jobs created"
        />
        <StatsCard
          title="Active Jobs"
          value={statsLoading ? "..." : stats?.activeJobs || 0}
          icon={TrendingUp}
          description="Currently hiring"
        />
        <StatsCard
          title="Pending Approval"
          value={statsLoading ? "..." : stats?.pendingJobs || 0}
          icon={Users}
          description="In moderation"
        />
        <StatsCard
          title="Total Spent"
          value={statsLoading ? "..." : `$${stats?.totalSpent || 0}`}
          icon={DollarSign}
          description="All time"
        />
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Your Recent Jobs</CardTitle>
        </CardHeader>
        <CardContent>
          {jobsLoading ? (
            <div className="space-y-4">
              {[1, 2].map((i) => (
                <Skeleton key={i} className="h-32 w-full" />
              ))}
            </div>
          ) : recentJobs && recentJobs.length > 0 ? (
            <div className="grid gap-4">
              {recentJobs.slice(0, 3).map((job) => (
                <JobCard key={job.id} job={job} showActions={false} />
              ))}
            </div>
          ) : (
            <p className="text-center text-muted-foreground py-8">
              You haven't posted any jobs yet
            </p>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Award className="w-5 h-5 text-yellow-500" />
            Recommended Freelancers
          </CardTitle>
          <CardDescription>Top-rated freelancers based on performance and reputation</CardDescription>
        </CardHeader>
        <CardContent>
          {recommendationsLoading ? (
            <div className="space-y-3">
              {[1, 2, 3].map((i) => (
                <Skeleton key={i} className="h-16 w-full" />
              ))}
            </div>
          ) : recommendations.length > 0 ? (
            <div className="space-y-3">
              {recommendations.slice(0, 5).map((freelancer, index) => (
                <Link key={freelancer.id} href={`/user/${freelancer.id}`}>
                  <div
                    className="flex items-center justify-between p-3 border rounded-lg hover-elevate cursor-pointer"
                    data-testid={`recommended-freelancer-${freelancer.id}`}
                  >
                    <div className="flex items-center gap-3">
                      <div className="relative">
                        <Avatar>
                          <AvatarImage src={freelancer.avatar || undefined} />
                          <AvatarFallback>{freelancer.username.charAt(0).toUpperCase()}</AvatarFallback>
                        </Avatar>
                        {index < 3 && (
                          <Badge className="absolute -top-1 -right-1 h-5 w-5 p-0 flex items-center justify-center text-xs">
                            {index + 1}
                          </Badge>
                        )}
                      </div>
                      <div>
                        <p className="font-medium">{freelancer.username}</p>
                        <div className="flex items-center gap-2 text-sm text-muted-foreground">
                          <span>Level {freelancer.level}</span>
                          <span className="flex items-center gap-1">
                            <Star className="w-3 h-3 text-yellow-500" />
                            {freelancer.rating || "N/A"}
                          </span>
                          <span>{freelancer.completedJobs} jobs</span>
                        </div>
                      </div>
                    </div>
                    <Button size="sm" variant="outline" data-testid={`button-view-${freelancer.id}`}>
                      View Profile
                    </Button>
                  </div>
                </Link>
              ))}
            </div>
          ) : (
            <p className="text-center text-muted-foreground py-4">
              No freelancer recommendations available yet.
            </p>
          )}
        </CardContent>
      </Card>
    </>
  );

  const renderStaffDashboard = () => (
    <>
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <StatsCard
          title="Pending Review"
          value={statsLoading ? "..." : stats?.pendingJobs || 0}
          icon={Briefcase}
          description="Awaiting moderation"
        />
        <StatsCard
          title="Approved Today"
          value={statsLoading ? "..." : stats?.approvedToday || 0}
          icon={TrendingUp}
          description="Last 24 hours"
        />
        <StatsCard
          title="Total Jobs"
          value={statsLoading ? "..." : stats?.totalJobs || 0}
          icon={Users}
          description="All time"
        />
        <StatsCard
          title="Active Jobs"
          value={statsLoading ? "..." : stats?.activeJobs || 0}
          icon={Briefcase}
          description="Currently active"
        />
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Moderation Queue</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">
            Visit the Moderation Queue to review pending jobs
          </p>
        </CardContent>
      </Card>
    </>
  );

  const renderHeadOfModerationDashboard = () => (
    <>
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <StatsCard
          title="Team Members"
          value={statsLoading ? "..." : stats?.teamMembers || 0}
          icon={Users}
          description="Active moderators"
        />
        <StatsCard
          title="Pending Reports"
          value={statsLoading ? "..." : stats?.pendingReports || 0}
          icon={AlertCircle}
          description="Needs attention"
        />
        <StatsCard
          title="Upgrade Requests"
          value={statsLoading ? "..." : stats?.upgradeRequests || 0}
          icon={UserCheck}
          description="Awaiting review"
        />
        <StatsCard
          title="Pending Review"
          value={statsLoading ? "..." : stats?.pendingJobs || 0}
          icon={Briefcase}
          description="Jobs to moderate"
        />
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Users className="w-5 h-5" />
              Team Management
            </CardTitle>
            <CardDescription>
              Manage your moderation team
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <p className="text-sm text-muted-foreground">
              Assign tasks, schedule meetings, and monitor team performance.
            </p>
            <Button asChild>
              <Link href="/team-management">
                Manage Team
              </Link>
            </Button>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <CalendarDays className="w-5 h-5" />
              Upcoming Meetings
            </CardTitle>
            <CardDescription>
              Your scheduled meetings
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <p className="text-sm text-muted-foreground">
              View and manage your upcoming meetings with the team.
            </p>
            <Button asChild variant="outline">
              <Link href="/meetings">
                View Meetings
              </Link>
            </Button>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Shield className="w-5 h-5" />
              Moderation Queue
            </CardTitle>
            <CardDescription>
              Review pending jobs and reports
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <p className="text-sm text-muted-foreground">
              Approve jobs, handle reports, and maintain platform quality.
            </p>
            <Button asChild variant="outline">
              <Link href="/moderation">
                Open Queue
              </Link>
            </Button>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <UserCheck className="w-5 h-5" />
              Role Upgrades
            </CardTitle>
            <CardDescription>
              Process role upgrade applications
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <p className="text-sm text-muted-foreground">
              Review applications from users requesting role upgrades.
            </p>
            <Button asChild variant="outline">
              <Link href="/role-upgrade-review">
                Review Requests
              </Link>
            </Button>
          </CardContent>
        </Card>
      </div>
    </>
  );

  const renderFounderDashboard = () => (
    <>
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <StatsCard
          title="Total Users"
          value={statsLoading ? "..." : stats?.totalUsers || 0}
          icon={Users}
          description="All platform users"
        />
        <StatsCard
          title="Total Jobs"
          value={statsLoading ? "..." : stats?.totalJobs || 0}
          icon={Briefcase}
          description="All time"
        />
        <StatsCard
          title="Active Jobs"
          value={statsLoading ? "..." : stats?.activeJobs || 0}
          icon={TrendingUp}
          description="Currently in progress"
        />
        <StatsCard
          title="Platform Revenue"
          value={statsLoading ? "..." : `$${stats?.platformRevenue || 0}`}
          icon={DollarSign}
          description="Total earnings"
        />
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Shield className="w-5 h-5" />
              Admin Panel
            </CardTitle>
            <CardDescription>
              Manage platform leadership
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <p className="text-sm text-muted-foreground">
              Promote moderators to Head of Moderation and manage platform roles.
            </p>
            <Button asChild>
              <Link href="/admin">
                Open Admin Panel
              </Link>
            </Button>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Users className="w-5 h-5" />
              Team Management
            </CardTitle>
            <CardDescription>
              Oversee moderation team
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <p className="text-sm text-muted-foreground">
              Schedule meetings and coordinate with the moderation team.
            </p>
            <Button asChild variant="outline">
              <Link href="/team-management">
                Manage Team
              </Link>
            </Button>
          </CardContent>
        </Card>
      </div>
    </>
  );

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-3xl font-bold tracking-tight">
          Welcome back, {user.username}!
        </h2>
        <p className="text-muted-foreground">
          Here's an overview of your Stats
        </p>
      </div>

      {user.role === "freelancer" && renderFreelancerDashboard()}
      {user.role === "customer" && renderCustomerDashboard()}
      {(user.role === "staff" || user.role === "moderator") && renderStaffDashboard()}
      {user.role === "head_of_moderation" && renderHeadOfModerationDashboard()}
      {user.role === "founder" && renderFounderDashboard()}
    </div>
  );
}
