import { useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/lib/auth-context";
import { format, formatDistanceToNow } from "date-fns";
import { toZonedTime } from "date-fns-tz";
import { Shield, Users, Calendar, ClipboardList, Plus, Clock, CheckCircle2, XCircle, AlertCircle, User, CalendarDays } from "lucide-react";

interface User {
  id: string;
  discordId: string;
  username: string;
  email: string | null;
  avatar: string | null;
  role: string;
  level: number;
}

interface ModeratorTask {
  id: string;
  title: string;
  description: string | null;
  assignedById: string;
  assigneeId: string;
  taskType: string;
  teamMembers: string[] | null;
  status: string;
  priority: string | null;
  dueDate: Date | null;
  completedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

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
  moderator?: User;
}

const ET_TIMEZONE = "America/New_York";

function formatToET(date: Date | string): string {
  const d = typeof date === "string" ? new Date(date) : date;
  const zonedDate = toZonedTime(d, ET_TIMEZONE);
  return format(zonedDate, "MMM d, yyyy h:mm a") + " ET";
}

export default function TeamManagementPage() {
  const { toast } = useToast();
  const { user } = useAuth();
  const [taskDialogOpen, setTaskDialogOpen] = useState(false);
  const [meetingDialogOpen, setMeetingDialogOpen] = useState(false);
  const [selectedMeetingId, setSelectedMeetingId] = useState<string | null>(null);

  const { data: moderators = [], isLoading: moderatorsLoading } = useQuery<User[]>({
    queryKey: ["/api/admin/moderators"],
  });

  const { data: tasksAssignedByMe = [], isLoading: tasksLoading } = useQuery<ModeratorTask[]>({
    queryKey: ["/api/moderator-tasks/assigned-by-me"],
  });

  const { data: meetingsScheduledByMe = [], isLoading: meetingsLoading } = useQuery<ModeratorMeeting[]>({
    queryKey: ["/api/moderator-meetings/scheduled-by-me"],
  });

  const { data: meetingRsvps = [] } = useQuery<MeetingRsvp[]>({
    queryKey: ["/api/moderator-meetings", selectedMeetingId, "rsvps"],
    enabled: !!selectedMeetingId,
    queryFn: async () => {
      const res = await fetch(`/api/moderator-meetings/${selectedMeetingId}/rsvps`);
      if (!res.ok) throw new Error("Failed to fetch RSVPs");
      return res.json();
    },
  });

  const createTaskMutation = useMutation({
    mutationFn: async (data: {
      title: string;
      description?: string;
      assigneeId: string;
      taskType: string;
      teamMembers?: string[];
      priority: string;
      dueDate?: string;
    }) => {
      return apiRequest("POST", "/api/moderator-tasks", data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/moderator-tasks/assigned-by-me"] });
      setTaskDialogOpen(false);
      toast({ title: "Success", description: "Task assigned successfully" });
    },
    onError: (error: Error) => {
      toast({ title: "Error", description: error.message || "Failed to create task", variant: "destructive" });
    },
  });

  const createMeetingMutation = useMutation({
    mutationFn: async (data: {
      title: string;
      description?: string;
      scheduledDate: string;
      duration: number;
      isTeamMeeting: boolean;
      invitedModeratorIds?: string[];
    }) => {
      return apiRequest("POST", "/api/moderator-meetings", data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/moderator-meetings/scheduled-by-me"] });
      setMeetingDialogOpen(false);
      toast({ title: "Success", description: "Meeting scheduled successfully" });
    },
    onError: (error: Error) => {
      toast({ title: "Error", description: error.message || "Failed to schedule meeting", variant: "destructive" });
    },
  });

  if (user?.role !== "head_of_moderation" && user?.role !== "founder") {
    return (
      <div className="p-6 max-w-4xl mx-auto">
        <Card>
          <CardContent className="p-6 text-center">
            <Shield className="w-12 h-12 mx-auto text-muted-foreground mb-4" />
            <p className="text-muted-foreground">This page is only accessible to Heads of Moderation and Founder</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (moderatorsLoading) {
    return (
      <div className="p-6 max-w-6xl mx-auto space-y-6">
        <Skeleton className="h-10 w-64" />
        <Skeleton className="h-48 w-full" />
      </div>
    );
  }

  const allModerators = moderators.filter(m => m.role === "moderator" || m.role === "head_of_moderation");

  return (
    <div className="p-6 max-w-6xl mx-auto space-y-6">
      <div className="flex items-center gap-3">
        <Users className="w-8 h-8 text-primary" />
        <div>
          <h1 className="text-2xl font-bold" data-testid="text-page-title">Team Management</h1>
          <p className="text-muted-foreground">Assign tasks and schedule meetings for your moderation team</p>
        </div>
      </div>

      <Tabs defaultValue="tasks" className="w-full">
        <TabsList className="grid w-full grid-cols-2">
          <TabsTrigger value="tasks" data-testid="tab-tasks">
            <ClipboardList className="w-4 h-4 mr-2" />
            Tasks
          </TabsTrigger>
          <TabsTrigger value="calendar" data-testid="tab-calendar">
            <Calendar className="w-4 h-4 mr-2" />
            Meetings & Calendar
          </TabsTrigger>
        </TabsList>

        <TabsContent value="tasks" className="space-y-4">
          <div className="flex justify-between items-center">
            <h2 className="text-lg font-semibold">Assigned Tasks</h2>
            <Dialog open={taskDialogOpen} onOpenChange={setTaskDialogOpen}>
              <DialogTrigger asChild>
                <Button data-testid="button-assign-task">
                  <Plus className="w-4 h-4 mr-2" />
                  Assign Task
                </Button>
              </DialogTrigger>
              <DialogContent className="max-w-lg">
                <DialogHeader>
                  <DialogTitle>Assign New Task</DialogTitle>
                  <DialogDescription>Create a task for a moderator or the whole team</DialogDescription>
                </DialogHeader>
                <TaskForm
                  moderators={allModerators}
                  onSubmit={(data) => createTaskMutation.mutate(data)}
                  isPending={createTaskMutation.isPending}
                />
              </DialogContent>
            </Dialog>
          </div>

          {tasksLoading ? (
            <div className="space-y-4">
              <Skeleton className="h-24 w-full" />
              <Skeleton className="h-24 w-full" />
            </div>
          ) : tasksAssignedByMe.length === 0 ? (
            <Card>
              <CardContent className="p-6 text-center">
                <ClipboardList className="w-12 h-12 mx-auto text-muted-foreground mb-4" />
                <p className="text-muted-foreground">No tasks assigned yet</p>
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-4">
              {tasksAssignedByMe.map((task) => (
                <TaskCard key={task.id} task={task} moderators={allModerators} />
              ))}
            </div>
          )}
        </TabsContent>

        <TabsContent value="calendar" className="space-y-4">
          <div className="flex justify-between items-center">
            <h2 className="text-lg font-semibold">Scheduled Meetings</h2>
            <Dialog open={meetingDialogOpen} onOpenChange={setMeetingDialogOpen}>
              <DialogTrigger asChild>
                <Button data-testid="button-schedule-meeting">
                  <Plus className="w-4 h-4 mr-2" />
                  Schedule Meeting
                </Button>
              </DialogTrigger>
              <DialogContent className="max-w-lg">
                <DialogHeader>
                  <DialogTitle>Schedule Meeting</DialogTitle>
                  <DialogDescription>Create a meeting for moderators</DialogDescription>
                </DialogHeader>
                <MeetingForm
                  moderators={allModerators}
                  onSubmit={(data) => createMeetingMutation.mutate(data)}
                  isPending={createMeetingMutation.isPending}
                />
              </DialogContent>
            </Dialog>
          </div>

          {meetingsLoading ? (
            <div className="space-y-4">
              <Skeleton className="h-32 w-full" />
              <Skeleton className="h-32 w-full" />
            </div>
          ) : meetingsScheduledByMe.length === 0 ? (
            <Card>
              <CardContent className="p-6 text-center">
                <CalendarDays className="w-12 h-12 mx-auto text-muted-foreground mb-4" />
                <p className="text-muted-foreground">No meetings scheduled yet</p>
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-4">
              {meetingsScheduledByMe.map((meeting) => (
                <MeetingCard
                  key={meeting.id}
                  meeting={meeting}
                  moderators={allModerators}
                  onViewRsvps={() => setSelectedMeetingId(meeting.id)}
                  rsvps={selectedMeetingId === meeting.id ? meetingRsvps : []}
                  showRsvps={selectedMeetingId === meeting.id}
                />
              ))}
            </div>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}

function TaskForm({
  moderators,
  onSubmit,
  isPending,
}: {
  moderators: User[];
  onSubmit: (data: any) => void;
  isPending: boolean;
}) {
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [assigneeId, setAssigneeId] = useState("");
  const [taskType, setTaskType] = useState("personal");
  const [priority, setPriority] = useState("medium");
  const [dueDate, setDueDate] = useState("");
  const [selectedTeamMembers, setSelectedTeamMembers] = useState<string[]>([]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSubmit({
      title,
      description: description || undefined,
      assigneeId: taskType === "team" ? selectedTeamMembers[0] : assigneeId,
      taskType,
      teamMembers: taskType === "team" ? selectedTeamMembers : undefined,
      priority,
      dueDate: dueDate || undefined,
    });
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="space-y-2">
        <Label htmlFor="title">Title</Label>
        <Input
          id="title"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Enter task title"
          required
          data-testid="input-task-title"
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor="description">Description (optional)</Label>
        <Textarea
          id="description"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="Enter task description"
          data-testid="input-task-description"
        />
      </div>

      <div className="space-y-2">
        <Label>Task Type</Label>
        <Select value={taskType} onValueChange={setTaskType}>
          <SelectTrigger data-testid="select-task-type">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="personal">Personal (Individual)</SelectItem>
            <SelectItem value="team">Team Task</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {taskType === "personal" ? (
        <div className="space-y-2">
          <Label>Assign To</Label>
          <Select value={assigneeId} onValueChange={setAssigneeId}>
            <SelectTrigger data-testid="select-assignee">
              <SelectValue placeholder="Select moderator" />
            </SelectTrigger>
            <SelectContent>
              {moderators.map((mod) => (
                <SelectItem key={mod.id} value={mod.id}>
                  {mod.username}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      ) : (
        <div className="space-y-2">
          <Label>Team Members</Label>
          <div className="border rounded-md p-3 space-y-2 max-h-40 overflow-y-auto">
            {moderators.map((mod) => (
              <div key={mod.id} className="flex items-center gap-2">
                <Checkbox
                  id={`mod-${mod.id}`}
                  checked={selectedTeamMembers.includes(mod.id)}
                  onCheckedChange={(checked) => {
                    if (checked) {
                      setSelectedTeamMembers([...selectedTeamMembers, mod.id]);
                    } else {
                      setSelectedTeamMembers(selectedTeamMembers.filter((id) => id !== mod.id));
                    }
                  }}
                />
                <label htmlFor={`mod-${mod.id}`} className="text-sm cursor-pointer">
                  {mod.username}
                </label>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label>Priority</Label>
          <Select value={priority} onValueChange={setPriority}>
            <SelectTrigger data-testid="select-priority">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="low">Low</SelectItem>
              <SelectItem value="medium">Medium</SelectItem>
              <SelectItem value="high">High</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-2">
          <Label htmlFor="dueDate">Due Date (optional)</Label>
          <Input
            id="dueDate"
            type="datetime-local"
            value={dueDate}
            onChange={(e) => setDueDate(e.target.value)}
            data-testid="input-due-date"
          />
        </div>
      </div>

      <DialogFooter>
        <Button type="submit" disabled={isPending || !title || (taskType === "personal" && !assigneeId) || (taskType === "team" && selectedTeamMembers.length === 0)} data-testid="button-submit-task">
          {isPending ? "Assigning..." : "Assign Task"}
        </Button>
      </DialogFooter>
    </form>
  );
}

function MeetingForm({
  moderators,
  onSubmit,
  isPending,
}: {
  moderators: User[];
  onSubmit: (data: any) => void;
  isPending: boolean;
}) {
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [scheduledDate, setScheduledDate] = useState("");
  const [duration, setDuration] = useState("60");
  const [isTeamMeeting, setIsTeamMeeting] = useState(true);
  const [selectedModerators, setSelectedModerators] = useState<string[]>([]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSubmit({
      title,
      description: description || undefined,
      scheduledDate,
      duration: parseInt(duration),
      isTeamMeeting,
      invitedModeratorIds: isTeamMeeting ? undefined : selectedModerators,
    });
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="space-y-2">
        <Label htmlFor="meetingTitle">Title</Label>
        <Input
          id="meetingTitle"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Enter meeting title"
          required
          data-testid="input-meeting-title"
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor="meetingDescription">Description (optional)</Label>
        <Textarea
          id="meetingDescription"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="Enter meeting description"
          data-testid="input-meeting-description"
        />
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label htmlFor="scheduledDate">Date & Time</Label>
          <Input
            id="scheduledDate"
            type="datetime-local"
            value={scheduledDate}
            onChange={(e) => setScheduledDate(e.target.value)}
            required
            data-testid="input-meeting-date"
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="duration">Duration (minutes)</Label>
          <Select value={duration} onValueChange={setDuration}>
            <SelectTrigger data-testid="select-duration">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="15">15 min</SelectItem>
              <SelectItem value="30">30 min</SelectItem>
              <SelectItem value="45">45 min</SelectItem>
              <SelectItem value="60">1 hour</SelectItem>
              <SelectItem value="90">1.5 hours</SelectItem>
              <SelectItem value="120">2 hours</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="space-y-2">
        <div className="flex items-center gap-2">
          <Checkbox
            id="teamMeeting"
            checked={isTeamMeeting}
            onCheckedChange={(checked) => setIsTeamMeeting(!!checked)}
          />
          <label htmlFor="teamMeeting" className="text-sm cursor-pointer">
            Team meeting (invite all moderators)
          </label>
        </div>
      </div>

      {!isTeamMeeting && (
        <div className="space-y-2">
          <Label>Invite Moderators</Label>
          <div className="border rounded-md p-3 space-y-2 max-h-40 overflow-y-auto">
            {moderators.map((mod) => (
              <div key={mod.id} className="flex items-center gap-2">
                <Checkbox
                  id={`meeting-mod-${mod.id}`}
                  checked={selectedModerators.includes(mod.id)}
                  onCheckedChange={(checked) => {
                    if (checked) {
                      setSelectedModerators([...selectedModerators, mod.id]);
                    } else {
                      setSelectedModerators(selectedModerators.filter((id) => id !== mod.id));
                    }
                  }}
                />
                <label htmlFor={`meeting-mod-${mod.id}`} className="text-sm cursor-pointer">
                  {mod.username}
                </label>
              </div>
            ))}
          </div>
        </div>
      )}

      <DialogFooter>
        <Button
          type="submit"
          disabled={isPending || !title || !scheduledDate || (!isTeamMeeting && selectedModerators.length === 0)}
          data-testid="button-submit-meeting"
        >
          {isPending ? "Scheduling..." : "Schedule Meeting"}
        </Button>
      </DialogFooter>
    </form>
  );
}

function TaskCard({ task, moderators }: { task: ModeratorTask; moderators: User[] }) {
  const assignee = moderators.find((m) => m.id === task.assigneeId);
  const teamMembers = task.teamMembers?.map((id) => moderators.find((m) => m.id === id)).filter(Boolean) as User[];

  const statusConfig = {
    pending: { icon: AlertCircle, color: "text-yellow-500", bg: "bg-yellow-500/10" },
    in_progress: { icon: Clock, color: "text-blue-500", bg: "bg-blue-500/10" },
    completed: { icon: CheckCircle2, color: "text-green-500", bg: "bg-green-500/10" },
  };

  const priorityConfig = {
    low: { color: "bg-gray-500/10 text-gray-600" },
    medium: { color: "bg-yellow-500/10 text-yellow-600" },
    high: { color: "bg-red-500/10 text-red-600" },
  };

  const status = statusConfig[task.status as keyof typeof statusConfig] || statusConfig.pending;
  const priority = priorityConfig[task.priority as keyof typeof priorityConfig] || priorityConfig.medium;
  const StatusIcon = status.icon;

  return (
    <Card data-testid={`card-task-${task.id}`}>
      <CardContent className="p-4">
        <div className="flex items-start justify-between gap-4">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap mb-2">
              <h3 className="font-semibold truncate">{task.title}</h3>
              <Badge variant="outline" className={priority.color}>
                {task.priority}
              </Badge>
              <Badge variant="outline">
                {task.taskType === "team" ? "Team" : "Personal"}
              </Badge>
            </div>

            {task.description && (
              <p className="text-sm text-muted-foreground mb-3 line-clamp-2">{task.description}</p>
            )}

            <div className="flex items-center gap-4 text-sm">
              <div className="flex items-center gap-1">
                <User className="w-4 h-4 text-muted-foreground" />
                {task.taskType === "team" ? (
                  <span>{teamMembers.length} team members</span>
                ) : (
                  <span>{assignee?.username || "Unknown"}</span>
                )}
              </div>

              {task.dueDate && (
                <div className="flex items-center gap-1 text-muted-foreground">
                  <Clock className="w-4 h-4" />
                  <span>Due {formatToET(task.dueDate)}</span>
                </div>
              )}
            </div>
          </div>

          <div className={`flex items-center gap-1 px-2 py-1 rounded-md ${status.bg}`}>
            <StatusIcon className={`w-4 h-4 ${status.color}`} />
            <span className={`text-sm font-medium ${status.color}`}>
              {task.status.replace("_", " ")}
            </span>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function MeetingCard({
  meeting,
  moderators,
  onViewRsvps,
  rsvps,
  showRsvps,
}: {
  meeting: ModeratorMeeting;
  moderators: User[];
  onViewRsvps: () => void;
  rsvps: MeetingRsvp[];
  showRsvps: boolean;
}) {
  const invitedCount = meeting.isTeamMeeting
    ? moderators.length
    : meeting.invitedModeratorIds?.length || 0;

  const acceptedCount = rsvps.filter((r) => r.status === "accepted").length;
  const declinedCount = rsvps.filter((r) => r.status === "declined").length;
  const pendingCount = rsvps.filter((r) => r.status === "pending").length;

  const isPast = new Date(meeting.scheduledDate) < new Date();

  return (
    <Card data-testid={`card-meeting-${meeting.id}`}>
      <CardContent className="p-4">
        <div className="flex items-start justify-between gap-4">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap mb-2">
              <CalendarDays className="w-5 h-5 text-primary" />
              <h3 className="font-semibold">{meeting.title}</h3>
              {meeting.isTeamMeeting && (
                <Badge variant="outline">Team Meeting</Badge>
              )}
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
              <div className="flex items-center gap-1">
                <span className="text-muted-foreground">Duration: {meeting.duration} min</span>
              </div>
              <div className="flex items-center gap-1">
                <Users className="w-4 h-4 text-muted-foreground" />
                <span>{invitedCount} invited</span>
              </div>
            </div>
          </div>

          <Button variant="outline" size="sm" onClick={onViewRsvps} data-testid={`button-view-rsvps-${meeting.id}`}>
            View RSVPs
          </Button>
        </div>

        {showRsvps && (
          <div className="mt-4 pt-4 border-t">
            <h4 className="font-medium mb-3">Responses</h4>
            
            <div className="flex gap-4 mb-4 text-sm">
              <div className="flex items-center gap-1">
                <CheckCircle2 className="w-4 h-4 text-green-500" />
                <span>{acceptedCount} accepted</span>
              </div>
              <div className="flex items-center gap-1">
                <XCircle className="w-4 h-4 text-red-500" />
                <span>{declinedCount} declined</span>
              </div>
              <div className="flex items-center gap-1">
                <AlertCircle className="w-4 h-4 text-yellow-500" />
                <span>{pendingCount} pending</span>
              </div>
            </div>

            {rsvps.length === 0 ? (
              <p className="text-sm text-muted-foreground">No responses yet</p>
            ) : (
              <div className="space-y-2">
                {rsvps.map((rsvp) => (
                  <div key={rsvp.id} className="flex items-center justify-between p-2 bg-muted/50 rounded-md">
                    <div className="flex items-center gap-2">
                      <Avatar className="w-6 h-6">
                        <AvatarImage src={rsvp.moderator?.avatar || undefined} />
                        <AvatarFallback>{rsvp.moderator?.username?.charAt(0) || "?"}</AvatarFallback>
                      </Avatar>
                      <span className="text-sm">{rsvp.moderator?.username || "Unknown"}</span>
                    </div>
                    <Badge
                      variant="outline"
                      className={
                        rsvp.status === "accepted"
                          ? "bg-green-500/10 text-green-600"
                          : rsvp.status === "declined"
                          ? "bg-red-500/10 text-red-600"
                          : "bg-yellow-500/10 text-yellow-600"
                      }
                    >
                      {rsvp.status}
                    </Badge>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
