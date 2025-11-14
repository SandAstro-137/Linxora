import { useAuth } from "@/lib/auth-context";
import { useQuery } from "@tanstack/react-query";
import { StatsCard } from "@/components/stats-card";
import { JobCard } from "@/components/job-card";
import { Briefcase, DollarSign, TrendingUp, Users } from "lucide-react";
import { Job } from "@shared/schema";
import { Skeleton } from "@/components/ui/skeleton";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export default function DashboardPage() {
  const { user } = useAuth();

  const { data: stats, isLoading: statsLoading } = useQuery({
    queryKey: ["/api/dashboard/stats"],
  });

  const { data: recentJobs, isLoading: jobsLoading } = useQuery<Job[]>({
    queryKey: ["/api/jobs/recent"],
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
    </div>
  );
}
