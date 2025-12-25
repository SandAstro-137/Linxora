import { Card, CardContent, CardFooter, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Clock, DollarSign, User } from "lucide-react";
import { Job } from "@shared/schema";
import { formatDistanceToNow } from "date-fns";
import { formatEasternDate } from "@/lib/timezone";

interface JobCardProps {
  job: Job;
  onView?: (job: Job) => void;
  onClaim?: (job: Job) => void;
  showActions?: boolean;
}

export function JobCard({ job, onView, onClaim, showActions = true }: JobCardProps) {
  const getStatusColor = (status: string) => {
    switch (status) {
      case "pending":
        return "bg-yellow-500/10 text-yellow-700 dark:text-yellow-400";
      case "active":
        return "bg-green-500/10 text-green-700 dark:text-green-400";
      case "claimed":
        return "bg-blue-500/10 text-blue-700 dark:text-blue-400";
      case "in_progress":
        return "bg-purple-500/10 text-purple-700 dark:text-purple-400";
      case "completed":
        return "bg-gray-500/10 text-gray-700 dark:text-gray-400";
      default:
        return "bg-gray-500/10 text-gray-700 dark:text-gray-400";
    }
  };

  return (
    <Card className="hover-elevate transition-all" data-testid={`card-job-${job.id}`}>
      <CardHeader className="space-y-2">
        <div className="flex items-start justify-between gap-2 flex-wrap">
          <h3 className="text-lg font-semibold line-clamp-1" data-testid={`text-job-title-${job.id}`}>
            {job.title}
          </h3>
          <Badge className={getStatusColor(job.status)} variant="secondary">
            {job.status}
          </Badge>
        </div>
        <Badge variant="outline" className="w-fit">
          {job.category}
        </Badge>
      </CardHeader>
      <CardContent className="space-y-4">
        <p className="text-sm text-muted-foreground line-clamp-2">
          {job.description}
        </p>
        <div className="flex flex-wrap gap-4 text-sm">
          <div className="flex items-center gap-1 text-muted-foreground">
            <DollarSign className="w-4 h-4" />
            <span className="font-medium text-foreground">${job.budget}</span>
          </div>
          {job.deadline && (
            <div className="flex items-center gap-1 text-muted-foreground">
              <Clock className="w-4 h-4" />
              <span>Due {formatEasternDate(job.deadline)} (ET)</span>
            </div>
          )}
          {job.collaborators && job.collaborators.length > 0 && (
            <div className="flex items-center gap-1 text-muted-foreground">
              <User className="w-4 h-4" />
              <span>{job.collaborators.length} collaborators</span>
            </div>
          )}
        </div>
      </CardContent>
      {showActions && (
        <CardFooter className="gap-2 flex-wrap">
          {onView && (
            <Button variant="outline" size="sm" onClick={() => onView(job)} data-testid={`button-view-job-${job.id}`}>
              View Details
            </Button>
          )}
          {onClaim && job.status === "active" && (
            <Button size="sm" onClick={() => onClaim(job)} data-testid={`button-claim-job-${job.id}`}>
              Claim Job
            </Button>
          )}
        </CardFooter>
      )}
    </Card>
  );
}
