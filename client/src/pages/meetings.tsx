import { useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/lib/auth-context";
import { format } from "date-fns";
import { toZonedTime } from "date-fns-tz";
import { CalendarDays, Clock, Users, CheckCircle2, XCircle, AlertCircle, Shield, FileQuestion } from "lucide-react";

interface ModeratorMeeting {
  id: string;
  title: string;
  description: string | null;
  scheduledById: string;
  scheduledDate: Date;
  duration: number;
  isTeamMeeting: boolean;
  invitedModeratorIds: string[] | null;
  createdAt: Date;
  updatedAt: Date;
}

interface MeetingRsvp {
  id: string;
  meetingId: string;
  moderatorId: string;
  status: string;
  respondedAt: Date | null;
  createdAt: Date;
}

const ET_TIMEZONE = "America/New_York";

function formatToET(date: Date | string): string {
  const d = typeof date === "string" ? new Date(date) : date;
  const zonedDate = toZonedTime(d, ET_TIMEZONE);
  return format(zonedDate, "MMM d, yyyy h:mm a") + " ET";
}

export default function MeetingsPage() {
  const { toast } = useToast();
  const { user } = useAuth();

  const { data: meetings = [], isLoading: meetingsLoading } = useQuery<ModeratorMeeting[]>({
    queryKey: ["/api/moderator-meetings"],
  });

  const rsvpMutation = useMutation({
    mutationFn: async ({ meetingId, status }: { meetingId: string; status: string }) => {
      return apiRequest("POST", `/api/moderator-meetings/${meetingId}/rsvp`, { status });
    },
    onSuccess: (_data, variables) => {
      const { meetingId, status } = variables;
      queryClient.invalidateQueries({ queryKey: ["/api/moderator-meetings"] });
      queryClient.invalidateQueries({ queryKey: ["/api/moderator-meetings", meetingId, "my-rsvp"] });
      queryClient.invalidateQueries({ queryKey: ["/api/moderator-meetings", meetingId, "rsvps"] });
      toast({
        title: "Response Sent",
        description: `You have ${status} the meeting invitation`,
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: error.message || "Failed to respond to meeting",
        variant: "destructive",
      });
    },
  });

  const exemptionMutation = useMutation({
    mutationFn: async ({ meetingId, reason }: { meetingId: string; reason: string }) => {
      return apiRequest("POST", "/api/meeting-exemptions", { meetingId, reason });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/meeting-exemptions"] });
      toast({
        title: "Request Submitted",
        description: "Your exemption request has been sent for review",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: error.message || "Failed to submit exemption request",
        variant: "destructive",
      });
    },
  });

  if (!user || !["moderator", "head_of_moderation", "founder"].includes(user.role)) {
    return (
      <div className="p-6 max-w-4xl mx-auto">
        <Card>
          <CardContent className="p-6 text-center">
            <Shield className="w-12 h-12 mx-auto text-muted-foreground mb-4" />
            <p className="text-muted-foreground">This page is only accessible to moderators</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (meetingsLoading) {
    return (
      <div className="p-6 max-w-4xl mx-auto space-y-6">
        <Skeleton className="h-10 w-64" />
        <Skeleton className="h-32 w-full" />
        <Skeleton className="h-32 w-full" />
      </div>
    );
  }

  const upcomingMeetings = meetings
    .filter((m) => new Date(m.scheduledDate) >= new Date())
    .sort((a, b) => new Date(a.scheduledDate).getTime() - new Date(b.scheduledDate).getTime());

  const pastMeetings = meetings
    .filter((m) => new Date(m.scheduledDate) < new Date())
    .sort((a, b) => new Date(b.scheduledDate).getTime() - new Date(a.scheduledDate).getTime());

  return (
    <div className="p-6 max-w-4xl mx-auto space-y-6">
      <div className="flex items-center gap-3">
        <CalendarDays className="w-8 h-8 text-primary" />
        <div>
          <h1 className="text-2xl font-bold" data-testid="text-page-title">My Meetings</h1>
          <p className="text-muted-foreground">View and respond to meeting invitations</p>
        </div>
      </div>

      <div className="space-y-6">
        <div>
          <h2 className="text-lg font-semibold mb-4">Upcoming Meetings</h2>
          {upcomingMeetings.length === 0 ? (
            <Card>
              <CardContent className="p-6 text-center">
                <CalendarDays className="w-12 h-12 mx-auto text-muted-foreground mb-4" />
                <p className="text-muted-foreground">No upcoming meetings</p>
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-4">
              {upcomingMeetings.map((meeting) => (
                <MeetingCard
                  key={meeting.id}
                  meeting={meeting}
                  onAccept={() => rsvpMutation.mutate({ meetingId: meeting.id, status: "accepted" })}
                  onDecline={() => rsvpMutation.mutate({ meetingId: meeting.id, status: "declined" })}
                  onRequestExemption={(reason) => exemptionMutation.mutate({ meetingId: meeting.id, reason })}
                  isPending={rsvpMutation.isPending || exemptionMutation.isPending}
                />
              ))}
            </div>
          )}
        </div>

        {pastMeetings.length > 0 && (
          <div>
            <h2 className="text-lg font-semibold mb-4">Past Meetings</h2>
            <div className="space-y-4">
              {pastMeetings.slice(0, 5).map((meeting) => (
                <MeetingCard
                  key={meeting.id}
                  meeting={meeting}
                  isPast
                />
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function MeetingCard({
  meeting,
  onAccept,
  onDecline,
  onRequestExemption,
  isPending,
  isPast,
}: {
  meeting: ModeratorMeeting;
  onAccept?: () => void;
  onDecline?: () => void;
  onRequestExemption?: (reason: string) => void;
  isPending?: boolean;
  isPast?: boolean;
}) {
  const { toast } = useToast();
  const { user } = useAuth();
  const [exemptionDialogOpen, setExemptionDialogOpen] = useState(false);
  const [exemptionReason, setExemptionReason] = useState("");

  const { data: myRsvp } = useQuery<MeetingRsvp>({
    queryKey: ["/api/moderator-meetings", meeting.id, "my-rsvp"],
    queryFn: async () => {
      const res = await fetch(`/api/moderator-meetings/${meeting.id}/rsvps`);
      if (!res.ok) throw new Error("Failed to fetch RSVPs");
      const rsvps = await res.json();
      return rsvps.find((r: MeetingRsvp) => r.moderatorId === user?.id);
    },
    enabled: !!user,
  });

  const statusConfig = {
    accepted: { icon: CheckCircle2, color: "text-green-500", bg: "bg-green-500/10", label: "Accepted" },
    declined: { icon: XCircle, color: "text-red-500", bg: "bg-red-500/10", label: "Declined" },
    pending: { icon: AlertCircle, color: "text-yellow-500", bg: "bg-yellow-500/10", label: "Pending Response" },
  };

  const rsvpStatus = myRsvp?.status || "pending";
  const status = statusConfig[rsvpStatus as keyof typeof statusConfig] || statusConfig.pending;
  const StatusIcon = status.icon;

  const handleExemptionSubmit = () => {
    if (exemptionReason.trim().length < 10) {
      toast({
        title: "Error",
        description: "Please provide a reason of at least 10 characters",
        variant: "destructive",
      });
      return;
    }
    onRequestExemption?.(exemptionReason);
    setExemptionDialogOpen(false);
    setExemptionReason("");
  };

  const isModerator = user?.role === "moderator";

  return (
    <Card data-testid={`card-meeting-${meeting.id}`} className={isPast ? "opacity-70" : ""}>
      <CardContent className="p-4">
        <div className="flex items-start justify-between gap-4">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap mb-2">
              <CalendarDays className="w-5 h-5 text-primary" />
              <h3 className="font-semibold">{meeting.title}</h3>
              {meeting.isTeamMeeting && (
                <Badge variant="outline">Team Meeting</Badge>
              )}
              <Badge variant="secondary">Required</Badge>
              {isPast && (
                <Badge variant="secondary">Past</Badge>
              )}
            </div>

            {meeting.description && (
              <p className="text-sm text-muted-foreground mb-3">{meeting.description}</p>
            )}

            <div className="flex items-center gap-4 text-sm flex-wrap">
              <div className="flex items-center gap-1">
                <Clock className="w-4 h-4 text-muted-foreground" />
                <span>{formatToET(meeting.scheduledDate)}</span>
              </div>
              <div className="flex items-center gap-1 text-muted-foreground">
                <span>Duration: {meeting.duration} min</span>
              </div>
            </div>
          </div>

          <div className="flex flex-col items-end gap-2">
            <div className={`flex items-center gap-1 px-2 py-1 rounded-md ${status.bg}`}>
              <StatusIcon className={`w-4 h-4 ${status.color}`} />
              <span className={`text-sm font-medium ${status.color}`}>{status.label}</span>
            </div>
            
            {!isPast && (
              <div className="flex items-center gap-2 flex-wrap justify-end">
                {rsvpStatus !== "accepted" && (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={onAccept}
                    disabled={isPending}
                    className="text-green-600 hover:text-green-700"
                    data-testid={`button-accept-${meeting.id}`}
                  >
                    <CheckCircle2 className="w-4 h-4 mr-1" />
                    Confirm
                  </Button>
                )}
                
                {isModerator && (
                  <Dialog open={exemptionDialogOpen} onOpenChange={setExemptionDialogOpen}>
                    <DialogTrigger asChild>
                      <Button
                        variant="ghost"
                        size="sm"
                        data-testid={`button-exemption-${meeting.id}`}
                      >
                        <FileQuestion className="w-4 h-4 mr-1" />
                        Request Exemption
                      </Button>
                    </DialogTrigger>
                    <DialogContent>
                      <DialogHeader>
                        <DialogTitle>Request Meeting Exemption</DialogTitle>
                        <DialogDescription>
                          Meetings are mandatory. If you cannot attend, please provide a valid reason for your exemption request.
                        </DialogDescription>
                      </DialogHeader>
                      <div className="space-y-4 py-4">
                        <div className="space-y-2">
                          <Label htmlFor="exemption-reason">Reason for exemption</Label>
                          <Textarea
                            id="exemption-reason"
                            value={exemptionReason}
                            onChange={(e) => setExemptionReason(e.target.value)}
                            placeholder="Please explain why you need to be exempted from this meeting..."
                            className="min-h-[100px]"
                            data-testid="input-exemption-reason"
                          />
                          <p className="text-xs text-muted-foreground">
                            Minimum 10 characters required
                          </p>
                        </div>
                      </div>
                      <DialogFooter>
                        <Button
                          variant="outline"
                          onClick={() => setExemptionDialogOpen(false)}
                        >
                          Cancel
                        </Button>
                        <Button
                          onClick={handleExemptionSubmit}
                          disabled={exemptionReason.trim().length < 10}
                          data-testid="button-submit-exemption"
                        >
                          Submit Request
                        </Button>
                      </DialogFooter>
                    </DialogContent>
                  </Dialog>
                )}
              </div>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
