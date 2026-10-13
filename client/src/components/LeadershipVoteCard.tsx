import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useAuth } from "@/lib/auth-context";
import { useToast } from "@/hooks/use-toast";
import { Crown, Vote, Check, X, ShieldQuestion } from "lucide-react";

export interface ActiveLeadershipVote {
  id: string;
  jobId: string;
  candidateId: string;
  candidateUsername: string;
  status: string;
  agreeCount: number;
  disapproveCount: number;
  totalEligible: number;
  hasVoted: boolean;
  myChoice: string | null;
}

interface FreelancerOption {
  id: string;
  username: string;
}

interface LeadershipVoteCardProps {
  job: {
    id: string;
    customerId: string;
    projectLeaderId?: string | null;
    freelancerId?: string | null;
    projectLeaderUsername?: string | null;
    collaboratorData?: Array<{ id: string; username: string }>;
    activeLeadershipVote?: ActiveLeadershipVote | null;
  };
  onChanged?: () => void;
}

export default function LeadershipVoteCard({ job, onChanged }: LeadershipVoteCardProps) {
  const { user } = useAuth();
  const { toast } = useToast();
  const [candidatePickerOpen, setCandidatePickerOpen] = useState(false);
  const [selectedCandidateId, setSelectedCandidateId] = useState("");

  const isCustomer = user?.id === job.customerId;
  const currentLeaderId = job.projectLeaderId || job.freelancerId || null;
  const isFreelancerTeamMember = !!user && !!job.collaboratorData?.some((c) => c.id === user.id);

  const vote = job.activeLeadershipVote;

  // Candidate list = all freelancers except the current leader
  const candidates: FreelancerOption[] = (job.collaboratorData || []).filter(
    (c) => c.id !== currentLeaderId
  );

  const startVoteMutation = useMutation({
    mutationFn: (candidateId: string) =>
      apiRequest("POST", `/api/jobs/${job.id}/project-leader-vote`, { candidateId }),
    onSuccess: () => {
      setCandidatePickerOpen(false);
      setSelectedCandidateId("");
      queryClient.invalidateQueries({ queryKey: [`/api/jobs`, job.id] });
      queryClient.invalidateQueries({ queryKey: ["/api/freelancer/jobs"] });
      onChanged?.();
      toast({
        title: "Vote started",
        description: "Freelancers on this job have been notified to cast their vote.",
      });
    },
    onError: (error: any) => {
      toast({
        title: "Could not start vote",
        description: error?.message || "Please try again.",
        variant: "destructive",
      });
    },
  });

  const castVoteMutation = useMutation({
    mutationFn: async (choice: "agree" | "disapprove") => {
      const res = await apiRequest("POST", `/api/jobs/${job.id}/project-leader-vote/cast`, { choice });
      return res.json();
    },
    onSuccess: (data: any) => {
      queryClient.invalidateQueries({ queryKey: [`/api/jobs`, job.id] });
      queryClient.invalidateQueries({ queryKey: ["/api/freelancer/jobs"] });
      onChanged?.();
      if (data?.passed) {
        toast({ title: "Vote passed", description: "The Project Leader has been changed." });
      } else if (data?.failed) {
        toast({ title: "Vote failed", description: "Not enough freelancers agreed." });
      } else {
        toast({ title: "Vote recorded", description: "Your vote has been cast anonymously." });
      }
    },
    onError: (error: any) => {
      toast({
        title: "Could not cast vote",
        description: error?.message || "Please try again.",
        variant: "destructive",
      });
    },
  });

  const cancelVoteMutation = useMutation({
    mutationFn: () => apiRequest("POST", `/api/jobs/${job.id}/project-leader-vote/cancel`, {}),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/jobs`, job.id] });
      queryClient.invalidateQueries({ queryKey: ["/api/freelancer/jobs"] });
      onChanged?.();
      toast({ title: "Vote cancelled" });
    },
    onError: (error: any) => {
      toast({
        title: "Could not cancel vote",
        description: error?.message || "Please try again.",
        variant: "destructive",
      });
    },
  });

  // Nothing to show: no vote, and the customer has no eligible candidate to hold one
  if (!vote && (!isCustomer || candidates.length === 0)) {
    return null;
  }

  if (!vote) {
    // Customer can hold a vote
    return (
      <Card className="border-dashed" data-testid="card-leadership-vote">
        <CardHeader className="pb-2">
          <CardTitle className="text-base flex items-center gap-2">
            <Crown className="w-4 h-4 text-amber-500" />
            Project Leader
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <p className="text-sm text-muted-foreground">
            <span className="font-medium text-foreground">{job.projectLeaderUsername || "Lead freelancer"}</span>{" "}
            is the Project Leader — the only person who can submit work.
          </p>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setCandidatePickerOpen(true)}
            data-testid="button-hold-vote"
          >
            <Vote className="w-4 h-4 mr-2" />
            Hold Vote to Change Project Leader
          </Button>

          <Dialog open={candidatePickerOpen} onOpenChange={setCandidatePickerOpen}>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Change Project Leader</DialogTitle>
                <DialogDescription>
                  Hold an anonymous vote among the freelancers on this job. The position changes if
                  50% or more agree.
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-3">
                <label className="text-sm font-medium">New Project Leader</label>
                <Select value={selectedCandidateId} onValueChange={setSelectedCandidateId}>
                  <SelectTrigger data-testid="select-candidate">
                    <SelectValue placeholder="Select a freelancer" />
                  </SelectTrigger>
                  <SelectContent>
                    {candidates.map((c) => (
                      <SelectItem key={c.id} value={c.id}>
                        {c.username}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setCandidatePickerOpen(false)}>
                  Cancel
                </Button>
                <Button
                  onClick={() => startVoteMutation.mutate(selectedCandidateId)}
                  disabled={!selectedCandidateId || startVoteMutation.isPending}
                  data-testid="button-confirm-start-vote"
                >
                  {startVoteMutation.isPending ? "Starting..." : "Start Vote"}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </CardContent>
      </Card>
    );
  }

  const total = vote.totalEligible || 1;
  const notVoted = Math.max(0, total - vote.agreeCount - vote.disapproveCount);
  const agreePct = (vote.agreeCount / total) * 100;
  const disapprovePct = (vote.disapproveCount / total) * 100;
  const notVotedPct = (notVoted / total) * 100;

  return (
    <Card className="border-blue-500/30" data-testid="card-leadership-vote">
      <CardHeader className="pb-2">
        <CardTitle className="text-base flex items-center gap-2">
          <Vote className="w-4 h-4 text-blue-500" />
          Project Leader Vote
          <Badge variant="secondary">In Progress</Badge>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <p className="text-sm text-muted-foreground">
          Vote to make{" "}
          <span className="font-medium text-foreground">{vote.candidateUsername}</span> the new
          Project Leader. Votes are <span className="font-medium">anonymous</span>.
        </p>

        {/* Three-color progress bar: blue = agree, red = disapprove, grey = not voted */}
        <div className="flex h-4 w-full overflow-hidden rounded-full bg-muted" data-testid="vote-progress-bar">
          <div
            className="h-full bg-blue-500 transition-all"
            style={{ width: `${agreePct}%` }}
            title={`${vote.agreeCount} agree`}
          />
          <div
            className="h-full bg-red-500 transition-all"
            style={{ width: `${disapprovePct}%` }}
            title={`${vote.disapproveCount} disapprove`}
          />
          <div
            className="h-full bg-muted-foreground/30 transition-all"
            style={{ width: `${notVotedPct}%` }}
            title={`${notVoted} not voted`}
          />
        </div>

        <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
          <span className="flex items-center gap-1">
            <span className="h-2.5 w-2.5 rounded-full bg-blue-500 inline-block" /> {vote.agreeCount} Agree
          </span>
          <span className="flex items-center gap-1">
            <span className="h-2.5 w-2.5 rounded-full bg-red-500 inline-block" /> {vote.disapproveCount} Disapprove
          </span>
          <span className="flex items-center gap-1">
            <span className="h-2.5 w-2.5 rounded-full bg-muted-foreground/40 inline-block" /> {notVoted} Not Voted
          </span>
        </div>

        {isFreelancerTeamMember && (
          <div>
            {vote.hasVoted ? (
              <p className="text-sm text-muted-foreground flex items-center gap-2">
                <ShieldQuestion className="w-4 h-4" />
                You voted {vote.myChoice === "agree" ? "Agree" : "Disapprove"}
              </p>
            ) : (
              <div className="flex gap-2">
                <Button
                  size="sm"
                  className="bg-blue-600 hover:bg-blue-700"
                  onClick={() => castVoteMutation.mutate("agree")}
                  disabled={castVoteMutation.isPending}
                  data-testid="button-vote-agree"
                >
                  <Check className="w-4 h-4 mr-1" />
                  Agree
                </Button>
                <Button
                  size="sm"
                  variant="destructive"
                  onClick={() => castVoteMutation.mutate("disapprove")}
                  disabled={castVoteMutation.isPending}
                  data-testid="button-vote-disapprove"
                >
                  <X className="w-4 h-4 mr-1" />
                  Disapprove
                </Button>
              </div>
            )}
          </div>
        )}

        {isCustomer && (
          <div className="flex items-center justify-between gap-2 pt-1">
            <p className="text-xs text-muted-foreground">
              50% or more in agreement changes the position.
            </p>
            <Button
              variant="outline"
              size="sm"
              onClick={() => cancelVoteMutation.mutate()}
              disabled={cancelVoteMutation.isPending}
              data-testid="button-cancel-vote"
            >
              Cancel Vote
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
