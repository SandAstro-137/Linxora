import { useRoute, useLocation } from "wouter";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Textarea } from "@/components/ui/textarea";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useAuth } from "@/lib/auth-context";
import { useToast } from "@/hooks/use-toast";
import { ArrowLeft, DollarSign, Clock, User, Users, Calendar, XCircle, Upload, FileText, CheckSquare, MessageSquare, Plus, Trash2, Edit2, Check, X, Star, Flag, Briefcase, Send, Link, AlertTriangle, CheckCircle2, Gavel } from "lucide-react";
import { ReportDialog } from "@/components/ReportDialog";
import { formatDistanceToNow } from "date-fns";
import { formatEasternDate, TIMEZONE_LABEL } from "@/lib/timezone";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";

interface EnrichedJob {
  id: string;
  customerId: string;
  title: string;
  description: string;
  category: string;
  budget: string;
  requirements: string | null;
  deadline: Date | null;
  status: string;
  freelancerId: string | null;
  collaborators: string[] | null;
  isLocked?: boolean;
  autoCompleteAt?: Date | null;
  customerUsername?: string;
  customerDiscordId?: string;
  collaboratorData?: Array<{
    id: string;
    username: string;
    avatar: string | null;
    specialization: string | null;
  }>;
  profitSplits?: Array<{
    userId: string;
    percentage: number;
    amount: string;
  }>;
  createdAt: Date;
  updatedAt: Date;
}

interface TeamNote {
  id: string;
  jobId: string;
  authorId: string;
  content: string;
  createdAt: Date;
  updatedAt: Date;
  authorUsername?: string;
}

interface TeamTask {
  id: string;
  jobId: string;
  title: string;
  description: string | null;
  status: "todo" | "in_progress" | "done";
  assignedTo: string | null;
  createdAt: Date;
  updatedAt: Date;
}

interface TeamMessage {
  id: string;
  jobId: string;
  userId: string;
  message: string;
  createdAt: Date;
  username?: string;
  avatar?: string;
}

interface JobRequestWithFreelancer {
  id: string;
  jobId: string;
  freelancerId: string;
  status: string;
  message: string | null;
  createdAt: Date;
  freelancer: {
    id: string;
    userId: number;
    username: string;
    avatar: string | null;
    level: number;
    rating: string;
    completedJobs: number;
    completionPercentage: string;
  } | null;
}

function JobRequestsViewer({ jobId, isJobOwner }: { jobId: string; isJobOwner: boolean }) {
  const { toast } = useToast();
  const [sortBy, setSortBy] = useState<"date" | "level" | "rating" | "jobs">("date");
  const [sortOrder, setSortOrder] = useState<"asc" | "desc">("desc");

  const { data: requests = [], isLoading } = useQuery<JobRequestWithFreelancer[]>({
    queryKey: ["/api/jobs", jobId, "requests"],
    enabled: !!jobId && isJobOwner,
  });

  const approveFreelancerMutation = useMutation({
    mutationFn: (freelancerId: string) => 
      apiRequest("POST", `/api/jobs/${jobId}/approve-freelancer`, { freelancerId }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/jobs", jobId] });
      queryClient.invalidateQueries({ queryKey: ["/api/jobs", jobId, "requests"] });
      queryClient.invalidateQueries({ queryKey: ["/api/jobs"] });
      queryClient.invalidateQueries({ queryKey: ["/api/freelancer/jobs"] });
      queryClient.invalidateQueries({ queryKey: ["/api/dashboard/stats"] });
      toast({
        title: "Freelancer approved!",
        description: "The freelancer has been assigned to your job.",
      });
    },
    onError: (error: any) => {
      toast({
        title: "Failed to approve freelancer",
        description: error.message || "Please try again later.",
        variant: "destructive",
      });
    },
  });

  const rejectFreelancerMutation = useMutation({
    mutationFn: (freelancerId: string) => 
      apiRequest("POST", `/api/jobs/${jobId}/reject-freelancer`, { freelancerId }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/jobs", jobId, "requests"] });
      toast({
        title: "Application declined",
        description: "The freelancer has been notified.",
      });
    },
    onError: (error: any) => {
      toast({
        title: "Failed to decline application",
        description: error.message || "Please try again later.",
        variant: "destructive",
      });
    },
  });

  const pendingRequests = requests.filter(r => r.status === "pending");

  const sortedRequests = [...pendingRequests].sort((a, b) => {
    const freelancerA = a.freelancer;
    const freelancerB = b.freelancer;
    
    let comparison = 0;
    
    switch (sortBy) {
      case "date":
        comparison = new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
        break;
      case "level":
        comparison = (freelancerA?.level || 0) - (freelancerB?.level || 0);
        break;
      case "rating":
        comparison = parseFloat(freelancerA?.rating || "0") - parseFloat(freelancerB?.rating || "0");
        break;
      case "jobs":
        comparison = (freelancerA?.completedJobs || 0) - (freelancerB?.completedJobs || 0);
        break;
    }
    
    return sortOrder === "desc" ? -comparison : comparison;
  });

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Freelancer Applications</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="animate-pulse space-y-3">
            <div className="h-16 bg-muted rounded" />
            <div className="h-16 bg-muted rounded" />
          </div>
        </CardContent>
      </Card>
    );
  }

  if (pendingRequests.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Users className="w-5 h-5" />
            Freelancer Applications
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-muted-foreground text-center py-4">
            No applications yet. When freelancers apply, they will appear here.
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between flex-wrap gap-2">
          <CardTitle className="flex items-center gap-2">
            <Users className="w-5 h-5" />
            Freelancer Applications ({pendingRequests.length})
          </CardTitle>
          <div className="flex items-center gap-2">
            <select
              className="text-sm border rounded px-2 py-1 bg-background"
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value as typeof sortBy)}
              data-testid="select-sort-by"
            >
              <option value="date">Date Applied</option>
              <option value="level">Level</option>
              <option value="rating">Rating</option>
              <option value="jobs">Completed Jobs</option>
            </select>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setSortOrder(sortOrder === "asc" ? "desc" : "asc")}
              data-testid="button-toggle-sort"
            >
              {sortOrder === "desc" ? "↓" : "↑"}
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        {sortedRequests.map((request) => (
          <div
            key={request.id}
            className="flex items-center justify-between p-4 rounded-lg border bg-card"
            data-testid={`job-request-${request.id}`}
          >
            <div className="flex items-center gap-4">
              <Avatar className="h-12 w-12">
                <AvatarImage src={request.freelancer?.avatar || undefined} />
                <AvatarFallback>
                  {request.freelancer?.username?.charAt(0).toUpperCase() || "?"}
                </AvatarFallback>
              </Avatar>
              <div>
                <div className="flex items-center gap-2">
                  <p className="font-medium">{request.freelancer?.username || "Unknown"}</p>
                  <Badge variant="secondary" className="text-xs">
                    Level {request.freelancer?.level || 1}
                  </Badge>
                </div>
                <div className="flex items-center gap-3 text-sm text-muted-foreground">
                  <span className="flex items-center gap-1">
                    <Star className="w-3 h-3" />
                    {parseFloat(request.freelancer?.rating || "0").toFixed(1)}
                  </span>
                  <span>{request.freelancer?.completedJobs || 0} jobs</span>
                  <span>
                    {formatDistanceToNow(new Date(request.createdAt), { addSuffix: true })}
                  </span>
                </div>
                {request.message && (
                  <p className="text-sm mt-1 text-muted-foreground italic">
                    "{request.message}"
                  </p>
                )}
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Button
                size="sm"
                onClick={() => approveFreelancerMutation.mutate(request.freelancerId)}
                disabled={approveFreelancerMutation.isPending || rejectFreelancerMutation.isPending}
                data-testid={`button-approve-${request.freelancerId}`}
              >
                <Check className="w-4 h-4 mr-1" />
                Accept
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={() => rejectFreelancerMutation.mutate(request.freelancerId)}
                disabled={approveFreelancerMutation.isPending || rejectFreelancerMutation.isPending}
                data-testid={`button-reject-${request.freelancerId}`}
              >
                <X className="w-4 h-4 mr-1" />
                Decline
              </Button>
            </div>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}

function PublicTeamViewer({ job }: { job: EnrichedJob }) {
  const leadFreelancer = job.collaboratorData?.find(c => c.id === job.freelancerId);
  const otherCollaborators = job.collaboratorData?.filter(c => c.id !== job.freelancerId) || [];

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Users className="w-5 h-5" />
          Team Members
        </CardTitle>
      </CardHeader>
      <CardContent>
        {(!job.collaboratorData || job.collaboratorData.length === 0) ? (
          <p className="text-muted-foreground text-center py-4">No team members assigned yet</p>
        ) : (
          <div className="space-y-3">
            {leadFreelancer && (
              <div
                className="flex items-center justify-between p-3 rounded-md bg-muted/50 border-l-4 border-primary"
                data-testid="team-lead-member"
              >
                <div className="flex items-center gap-3">
                  <Avatar className="h-10 w-10">
                    <AvatarImage src={leadFreelancer.avatar || undefined} />
                    <AvatarFallback>
                      {leadFreelancer.username.charAt(0).toUpperCase()}
                    </AvatarFallback>
                  </Avatar>
                  <div>
                    <p className="font-medium">{leadFreelancer.username}</p>
                    <Badge variant="secondary" className="text-xs">Lead Freelancer</Badge>
                  </div>
                </div>
                {job.profitSplits && (
                  <div className="text-right">
                    <p className="font-semibold">
                      ${job.profitSplits.find(s => s.userId === leadFreelancer.id)?.amount || '0'}
                    </p>
                    <p className="text-sm text-muted-foreground">
                      {job.profitSplits.find(s => s.userId === leadFreelancer.id)?.percentage || 0}%
                    </p>
                  </div>
                )}
              </div>
            )}
            {otherCollaborators.map((collaborator, index) => {
              const split = job.profitSplits?.find(s => s.userId === collaborator.id);
              return (
                <div
                  key={collaborator.id}
                  className="flex items-center justify-between p-3 rounded-md bg-muted/50"
                  data-testid={`team-collaborator-${index}`}
                >
                  <div className="flex items-center gap-3">
                    <Avatar className="h-10 w-10">
                      <AvatarImage src={collaborator.avatar || undefined} />
                      <AvatarFallback>
                        {collaborator.username.charAt(0).toUpperCase()}
                      </AvatarFallback>
                    </Avatar>
                    <div>
                      <p className="font-medium">{collaborator.username}</p>
                      {collaborator.specialization && (
                        <p className="text-sm text-muted-foreground">
                          {collaborator.specialization}
                        </p>
                      )}
                    </div>
                  </div>
                  {split && (
                    <div className="text-right">
                      <p className="font-semibold">${split.amount}</p>
                      <p className="text-sm text-muted-foreground">{split.percentage}%</p>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function TeamCollaboration({ jobId }: { jobId: string }) {
  const { user } = useAuth();
  const { toast } = useToast();
  const [newNote, setNewNote] = useState("");
  const [editingNoteId, setEditingNoteId] = useState<string | null>(null);
  const [editingNoteContent, setEditingNoteContent] = useState("");
  const [newTaskTitle, setNewTaskTitle] = useState("");
  const [newTaskDesc, setNewTaskDesc] = useState("");
  const [newMessage, setNewMessage] = useState("");

  const { data: notes = [], isLoading: notesLoading } = useQuery<TeamNote[]>({
    queryKey: ["/api/team-notes", jobId],
  });

  const { data: tasks = [], isLoading: tasksLoading } = useQuery<TeamTask[]>({
    queryKey: ["/api/team-tasks", jobId],
  });

  const { data: messages = [], isLoading: messagesLoading } = useQuery<TeamMessage[]>({
    queryKey: ["/api/jobs", jobId, "team-messages"],
    refetchInterval: 5000,
  });

  const createNoteMutation = useMutation({
    mutationFn: (content: string) =>
      apiRequest("POST", "/api/team-notes", { jobId, content }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/team-notes", jobId] });
      setNewNote("");
      toast({ title: "Note added successfully" });
    },
  });

  const updateNoteMutation = useMutation({
    mutationFn: ({ id, content }: { id: string; content: string }) =>
      apiRequest("PUT", `/api/team-notes/${id}`, { content }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/team-notes", jobId] });
      setEditingNoteId(null);
      toast({ title: "Note updated successfully" });
    },
  });

  const deleteNoteMutation = useMutation({
    mutationFn: (id: string) => apiRequest("DELETE", `/api/team-notes/${id}`, {}),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/team-notes", jobId] });
      toast({ title: "Note deleted successfully" });
    },
  });

  const createTaskMutation = useMutation({
    mutationFn: () =>
      apiRequest("POST", "/api/team-tasks", {
        jobId,
        title: newTaskTitle,
        description: newTaskDesc || null,
        status: "todo",
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/team-tasks", jobId] });
      setNewTaskTitle("");
      setNewTaskDesc("");
      toast({ title: "Task created successfully" });
    },
  });

  const updateTaskMutation = useMutation({
    mutationFn: ({ id, updates }: { id: string; updates: Partial<TeamTask> }) =>
      apiRequest("PUT", `/api/team-tasks/${id}`, updates),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/team-tasks", jobId] });
    },
  });

  const deleteTaskMutation = useMutation({
    mutationFn: (id: string) => apiRequest("DELETE", `/api/team-tasks/${id}`, {}),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/team-tasks", jobId] });
      toast({ title: "Task deleted successfully" });
    },
  });

  const createMessageMutation = useMutation({
    mutationFn: (content: string) =>
      apiRequest("POST", `/api/jobs/${jobId}/team-messages`, { content }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/jobs", jobId, "team-messages"] });
      setNewMessage("");
    },
  });

  const deleteMessageMutation = useMutation({
    mutationFn: (id: string) => apiRequest("DELETE", `/api/team-messages/${id}`, {}),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/jobs", jobId, "team-messages"] });
      toast({ title: "Message deleted successfully" });
    },
  });

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="flex items-center gap-2">
              <FileText className="w-5 h-5" />
              Team Notes
            </CardTitle>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Textarea
              placeholder="Add a note for the team..."
              value={newNote}
              onChange={(e) => setNewNote(e.target.value)}
              data-testid="textarea-new-note"
            />
            <Button
              onClick={() => createNoteMutation.mutate(newNote)}
              disabled={!newNote.trim() || createNoteMutation.isPending}
              size="sm"
              data-testid="button-create-note"
            >
              <Plus className="w-4 h-4 mr-2" />
              Add Note
            </Button>
          </div>

          {notesLoading ? (
            <div className="space-y-2">
              <Skeleton className="h-20 w-full" />
              <Skeleton className="h-20 w-full" />
            </div>
          ) : notes.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-8">
              No notes yet. Add the first one!
            </p>
          ) : (
            <div className="space-y-3">
              {notes.map((note) => (
                <div
                  key={note.id}
                  className="p-3 rounded-md bg-muted/50 space-y-2"
                  data-testid={`note-${note.id}`}
                >
                  {editingNoteId === note.id ? (
                    <div className="space-y-2">
                      <Textarea
                        value={editingNoteContent}
                        onChange={(e) => setEditingNoteContent(e.target.value)}
                        data-testid="textarea-edit-note"
                      />
                      <div className="flex gap-2">
                        <Button
                          size="sm"
                          onClick={() => {
                            updateNoteMutation.mutate({
                              id: note.id,
                              content: editingNoteContent,
                            });
                          }}
                          disabled={updateNoteMutation.isPending}
                          data-testid="button-save-note"
                        >
                          <Check className="w-4 h-4 mr-1" />
                          Save
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => setEditingNoteId(null)}
                          data-testid="button-cancel-edit-note"
                        >
                          <X className="w-4 h-4 mr-1" />
                          Cancel
                        </Button>
                      </div>
                    </div>
                  ) : (
                    <>
                      <p className="text-sm whitespace-pre-wrap">{note.content}</p>
                      <div className="flex items-center justify-between text-xs text-muted-foreground">
                        <span>
                          {note.authorUsername} •{" "}
                          {formatDistanceToNow(new Date(note.createdAt), {
                            addSuffix: true,
                          })}
                        </span>
                        {note.authorId === user?.id && (
                          <div className="flex gap-1">
                            <Button
                              size="icon"
                              variant="ghost"
                              className="h-6 w-6"
                              onClick={() => {
                                setEditingNoteId(note.id);
                                setEditingNoteContent(note.content);
                              }}
                              data-testid={`button-edit-note-${note.id}`}
                            >
                              <Edit2 className="w-3 h-3" />
                            </Button>
                            <Button
                              size="icon"
                              variant="ghost"
                              className="h-6 w-6"
                              onClick={() => deleteNoteMutation.mutate(note.id)}
                              data-testid={`button-delete-note-${note.id}`}
                            >
                              <Trash2 className="w-3 h-3" />
                            </Button>
                          </div>
                        )}
                      </div>
                    </>
                  )}
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <CheckSquare className="w-5 h-5" />
            Team Tasks
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Input
              placeholder="Task title..."
              value={newTaskTitle}
              onChange={(e) => setNewTaskTitle(e.target.value)}
              data-testid="input-new-task-title"
            />
            <Textarea
              placeholder="Task description (optional)..."
              value={newTaskDesc}
              onChange={(e) => setNewTaskDesc(e.target.value)}
              className="min-h-20"
              data-testid="textarea-new-task-desc"
            />
            <Button
              onClick={() => createTaskMutation.mutate()}
              disabled={!newTaskTitle.trim() || createTaskMutation.isPending}
              size="sm"
              data-testid="button-create-task"
            >
              <Plus className="w-4 h-4 mr-2" />
              Add Task
            </Button>
          </div>

          {tasksLoading ? (
            <div className="space-y-2">
              <Skeleton className="h-16 w-full" />
              <Skeleton className="h-16 w-full" />
            </div>
          ) : tasks.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-8">
              No tasks yet. Create the first one!
            </p>
          ) : (
            <div className="space-y-2">
              {tasks.map((task) => (
                <div
                  key={task.id}
                  className="flex items-start gap-3 p-3 rounded-md bg-muted/50"
                  data-testid={`task-${task.id}`}
                >
                  <Button
                    size="icon"
                    variant="ghost"
                    className="h-5 w-5 mt-0.5"
                    onClick={() => {
                      const newStatus =
                        task.status === "done"
                          ? "todo"
                          : task.status === "in_progress"
                          ? "done"
                          : "in_progress";
                      updateTaskMutation.mutate({
                        id: task.id,
                        updates: { status: newStatus },
                      });
                    }}
                    data-testid={`button-toggle-task-${task.id}`}
                  >
                    {task.status === "done" ? (
                      <CheckSquare className="w-4 h-4 text-green-600" />
                    ) : (
                      <div className="w-4 h-4 border-2 rounded" />
                    )}
                  </Button>
                  <div className="flex-1">
                    <p
                      className={`font-medium ${
                        task.status === "done" ? "line-through text-muted-foreground" : ""
                      }`}
                    >
                      {task.title}
                    </p>
                    {task.description && (
                      <p className="text-sm text-muted-foreground mt-1">
                        {task.description}
                      </p>
                    )}
                    <div className="flex items-center gap-2 mt-2">
                      <Badge
                        variant="secondary"
                        className={
                          task.status === "done"
                            ? "bg-green-500/10 text-green-700 dark:text-green-400"
                            : task.status === "in_progress"
                            ? "bg-blue-500/10 text-blue-700 dark:text-blue-400"
                            : "bg-gray-500/10 text-gray-700 dark:text-gray-400"
                        }
                      >
                        {task.status === "todo"
                          ? "To Do"
                          : task.status === "in_progress"
                          ? "In Progress"
                          : "Done"}
                      </Badge>
                    </div>
                  </div>
                  <Button
                    size="icon"
                    variant="ghost"
                    className="h-8 w-8"
                    onClick={() => deleteTaskMutation.mutate(task.id)}
                    data-testid={`button-delete-task-${task.id}`}
                  >
                    <Trash2 className="w-4 h-4" />
                  </Button>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <MessageSquare className="w-5 h-5" />
            Team Chat
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="h-64 overflow-y-auto space-y-3 border rounded-md p-3">
            {messagesLoading ? (
              <div className="space-y-2">
                <Skeleton className="h-12 w-full" />
                <Skeleton className="h-12 w-full" />
              </div>
            ) : messages.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-16">
                No messages yet. Start the conversation!
              </p>
            ) : (
              messages.map((message) => (
                <div
                  key={message.id}
                  className="flex items-start gap-2"
                  data-testid={`message-${message.id}`}
                >
                  <Avatar className="h-8 w-8">
                    <AvatarImage src={message.avatar || undefined} />
                    <AvatarFallback>
                      {message.username?.charAt(0).toUpperCase()}
                    </AvatarFallback>
                  </Avatar>
                  <div className="flex-1 space-y-1">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium">{message.username}</span>
                      <span className="text-xs text-muted-foreground">
                        {formatDistanceToNow(new Date(message.createdAt), {
                          addSuffix: true,
                        })}
                      </span>
                    </div>
                    <p className="text-sm">{message.message}</p>
                  </div>
                  {message.userId === user?.id && (
                    <Button
                      size="icon"
                      variant="ghost"
                      className="h-6 w-6"
                      onClick={() => deleteMessageMutation.mutate(message.id)}
                      data-testid={`button-delete-message-${message.id}`}
                    >
                      <Trash2 className="w-3 h-3" />
                    </Button>
                  )}
                </div>
              ))
            )}
          </div>
          <div className="flex gap-2">
            <Input
              placeholder="Type a message..."
              value={newMessage}
              onChange={(e) => setNewMessage(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && newMessage.trim() && !createMessageMutation.isPending) {
                  createMessageMutation.mutate(newMessage);
                }
              }}
              data-testid="input-team-message"
            />
            <Button
              onClick={() => createMessageMutation.mutate(newMessage)}
              disabled={!newMessage.trim() || createMessageMutation.isPending}
              data-testid="button-send-message"
            >
              <MessageSquare className="w-4 h-4" />
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

interface JobSubmission {
  id: string;
  jobId: string;
  freelancerId: string;
  proofFiles: string[];
  proofLinks: string[];
  notes: string | null;
  status: string;
  createdAt: Date;
}

export default function JobDetailPage() {
  const [, params] = useRoute("/jobs/:id");
  const [, setLocation] = useLocation();
  const { user } = useAuth();
  const { toast } = useToast();
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedUser, setSelectedUser] = useState<any>(null);
  const [isInviteDialogOpen, setIsInviteDialogOpen] = useState(false);
  const [isCancelDialogOpen, setIsCancelDialogOpen] = useState(false);
  const [proofFile, setProofFile] = useState<File | null>(null);
  const [isRatingDialogOpen, setIsRatingDialogOpen] = useState(false);
  const [ratingScore, setRatingScore] = useState(0);
  const [isReportDialogOpen, setIsReportDialogOpen] = useState(false);
  const [ratingReview, setRatingReview] = useState("");
  const [isSubmitWorkDialogOpen, setIsSubmitWorkDialogOpen] = useState(false);
  const [workProofLinks, setWorkProofLinks] = useState<string[]>([""]);
  const [workNotes, setWorkNotes] = useState("");
  const [isDisputeDialogOpen, setIsDisputeDialogOpen] = useState(false);
  const [disputeReason, setDisputeReason] = useState("");

  const cancellationFormSchema = z.object({
    reason: z.string().min(10, "Reason must be at least 10 characters"),
  });

  const cancellationForm = useForm<z.infer<typeof cancellationFormSchema>>({
    resolver: zodResolver(cancellationFormSchema),
    defaultValues: {
      reason: "",
    },
  });

  const jobId = params?.id;

  const { data: job, isLoading } = useQuery<EnrichedJob>({
    queryKey: ["/api/jobs", jobId],
    enabled: !!jobId,
  });

  const { data: searchResults = [] } = useQuery<any[]>({
    queryKey: ["/api/users/search", searchQuery],
    enabled: searchQuery.length > 2,
  });

  const { data: existingRating } = useQuery<any>({
    queryKey: ["/api/jobs", jobId, "rating"],
    queryFn: async () => {
      const response = await fetch(`/api/jobs/${jobId}/rating`, { credentials: "include" });
      if (response.status === 404) return null;
      if (!response.ok) throw new Error("Failed to fetch rating");
      return response.json();
    },
    enabled: !!jobId && job?.status === "completed",
  });

  const { data: submissions = [] } = useQuery<JobSubmission[]>({
    queryKey: ["/api/jobs", jobId, "submissions"],
    enabled: !!jobId && (job?.status === "awaiting_customer" || job?.status === "AWAITING_CUSTOMER"),
  });

  const submitWorkMutation = useMutation({
    mutationFn: () => apiRequest("POST", `/api/jobs/${jobId}/submit-work`, {
      proofFiles: [],
      proofLinks: workProofLinks.filter(link => link.trim()),
      notes: workNotes || null,
    }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/jobs", jobId] });
      queryClient.invalidateQueries({ queryKey: ["/api/jobs"] });
      queryClient.invalidateQueries({ queryKey: ["/api/jobs", jobId, "submissions"] });
      setIsSubmitWorkDialogOpen(false);
      setWorkProofLinks([""]);
      setWorkNotes("");
      toast({
        title: "Work submitted!",
        description: "The customer has been notified to review your work.",
      });
    },
    onError: (error: any) => {
      toast({
        title: "Failed to submit work",
        description: error.message || "Please try again later.",
        variant: "destructive",
      });
    },
  });

  const acceptWorkMutation = useMutation({
    mutationFn: () => apiRequest("POST", `/api/jobs/${jobId}/accept-work`, {}),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/jobs", jobId] });
      queryClient.invalidateQueries({ queryKey: ["/api/jobs"] });
      queryClient.invalidateQueries({ queryKey: ["/api/jobs", jobId, "submissions"] });
      queryClient.invalidateQueries({ queryKey: ["/api/wallet"] });
      queryClient.invalidateQueries({ queryKey: ["/api/my-jobs"] });
      toast({
        title: "Work accepted!",
        description: "The job is now complete and payment has been released.",
      });
    },
    onError: (error: any) => {
      toast({
        title: "Failed to accept work",
        description: error.message || "Please try again later.",
        variant: "destructive",
      });
    },
  });

  const rejectWorkMutation = useMutation({
    mutationFn: (feedback: string) => apiRequest("POST", `/api/jobs/${jobId}/reject-work`, { feedback }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/jobs", jobId] });
      queryClient.invalidateQueries({ queryKey: ["/api/jobs", jobId, "submissions"] });
      toast({
        title: "Work returned for revision",
        description: "The freelancer has been notified of your feedback.",
      });
    },
    onError: (error: any) => {
      toast({
        title: "Failed to reject work",
        description: error.message || "Please try again later.",
        variant: "destructive",
      });
    },
  });

  const openDisputeMutation = useMutation({
    mutationFn: () => apiRequest("POST", `/api/jobs/${jobId}/dispute`, { reason: disputeReason }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/jobs", jobId] });
      queryClient.invalidateQueries({ queryKey: ["/api/jobs"] });
      setIsDisputeDialogOpen(false);
      setDisputeReason("");
      toast({
        title: "Dispute opened",
        description: "A moderator will review your dispute and contact both parties.",
      });
    },
    onError: (error: any) => {
      toast({
        title: "Failed to open dispute",
        description: error.message || "Please try again later.",
        variant: "destructive",
      });
    },
  });

  const submitRatingMutation = useMutation({
    mutationFn: () => apiRequest("POST", `/api/jobs/${jobId}/rating`, {
      score: ratingScore,
      review: ratingReview,
    }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/jobs", jobId, "rating"] });
      queryClient.invalidateQueries({ queryKey: ["/api/jobs", jobId] });
      setIsRatingDialogOpen(false);
      setRatingScore(0);
      setRatingReview("");
      toast({
        title: "Rating submitted!",
        description: "Thank you for rating this freelancer.",
      });
    },
    onError: (error: any) => {
      toast({
        title: "Failed to submit rating",
        description: error.message || "Please try again later.",
        variant: "destructive",
      });
    },
  });

  const claimJobMutation = useMutation({
    mutationFn: () => apiRequest("POST", `/api/jobs/${jobId}/claim`, {}),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/jobs", jobId] });
      queryClient.invalidateQueries({ queryKey: ["/api/jobs"] });
      queryClient.invalidateQueries({ queryKey: ["/api/my-job-requests"] });
      toast({
        title: "Application submitted!",
        description: "The customer will review your application.",
      });
    },
    onError: (error: any) => {
      toast({
        title: "Failed to apply",
        description: error.message || "Please try again later.",
        variant: "destructive",
      });
    },
  });

  const inviteMutation = useMutation({
    mutationFn: (userId: string) =>
      apiRequest("POST", `/api/jobs/${jobId}/invite`, { userId }),
    onSuccess: () => {
      setIsInviteDialogOpen(false);
      setSearchQuery("");
      setSelectedUser(null);
      toast({
        title: "Team invitation sent!",
        description: "The freelancer will be notified of your offer.",
      });
    },
    onError: () => {
      toast({
        title: "Failed to send invitation",
        description: "Please try again later.",
        variant: "destructive",
      });
    },
  });

  const cancelJobMutation = useMutation({
    mutationFn: async (data: z.infer<typeof cancellationFormSchema>) => {
      let proofUrl = null;

      if (proofFile) {
        const reader = new FileReader();
        const fileData = await new Promise<string>((resolve) => {
          reader.onloadend = () => resolve(reader.result as string);
          reader.readAsDataURL(proofFile);
        });

        const uploadResponse = await apiRequest("POST", "/api/uploads", {
          fileName: proofFile.name,
          fileData,
        }) as { url: string };
        proofUrl = uploadResponse.url;
      }

      return apiRequest("POST", "/api/cancellation-requests", {
        jobId: jobId!,
        requesterId: user!.id,
        reason: data.reason,
        proofUrl,
      });
    },
    onSuccess: (data: any) => {
      setIsCancelDialogOpen(false);
      cancellationForm.reset();
      setProofFile(null);
      queryClient.invalidateQueries({ queryKey: ["/api/jobs", jobId] });
      queryClient.invalidateQueries({ queryKey: ["/api/jobs"] });
      toast({
        title: data.approvalRequired ? "Cancellation being reviewed" : "Job cancelled",
        description: data.message,
      });
    },
    onError: (error: any) => {
      toast({
        title: "Failed to submit cancellation request",
        description: error.message || "Please try again later.",
        variant: "destructive",
      });
    },
  });

  if (isLoading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-10 w-full" />
        <Skeleton className="h-64 w-full" />
        <Skeleton className="h-32 w-full" />
      </div>
    );
  }

  if (!job) {
    return (
      <div className="text-center py-12">
        <p className="text-muted-foreground">Job not found</p>
        <Button
          variant="outline"
          onClick={() => setLocation("/jobs")}
          className="mt-4"
          data-testid="button-back-to-jobs"
        >
          <ArrowLeft className="w-4 h-4 mr-2" />
          Back to Jobs
        </Button>
      </div>
    );
  }

  const isJobTaken = job.status === "claimed" || job.status === "in_progress";
  const isEligibleToClaim = job.status === "active" && user?.role === "freelancer";
  const isCustomer = job.customerId === user?.id;
  const isFreelancerOwner = job.freelancerId === user?.id;
  const canOfferTeam = isJobTaken && !isFreelancerOwner;
  const isTeamMember = 
    user?.id === job.customerId || 
    user?.id === job.freelancerId || 
    job.collaborators?.includes(user?.id || "") ||
    false;

  const isFreelancerOnJob = 
    (user?.id === job.freelancerId || job.collaborators?.includes(user?.id || "")) &&
    (job.status === "claimed" || job.status === "in_progress");

  const getTabGridCols = () => {
    const count = 1 + (isTeamMember ? 1 : 0) + (isFreelancerOnJob ? 1 : 0);
    if (count === 3) return 'grid-cols-3';
    if (count === 2) return 'grid-cols-2';
    return 'grid-cols-1';
  };

  const getStatusColor = (status: string) => {
    const statusLower = status.toLowerCase();
    switch (statusLower) {
      case "draft":
        return "bg-gray-500/10 text-gray-700 dark:text-gray-400";
      case "pending":
      case "pending_approval":
        return "bg-yellow-500/10 text-yellow-700 dark:text-yellow-400";
      case "active":
      case "pending_acceptance":
        return "bg-green-500/10 text-green-700 dark:text-green-400";
      case "claimed":
      case "in_progress":
        return "bg-blue-500/10 text-blue-700 dark:text-blue-400";
      case "awaiting_customer":
        return "bg-purple-500/10 text-purple-700 dark:text-purple-400";
      case "completed":
        return "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400";
      case "dispute":
        return "bg-red-500/10 text-red-700 dark:text-red-400";
      case "cancelled":
      case "expired":
        return "bg-gray-500/10 text-gray-700 dark:text-gray-400";
      default:
        return "bg-gray-500/10 text-gray-700 dark:text-gray-400";
    }
  };

  const getStatusLabel = (status: string) => {
    const statusLower = status.toLowerCase();
    switch (statusLower) {
      case "draft": return "Draft";
      case "pending": case "pending_approval": return "Pending Approval";
      case "active": case "pending_acceptance": return "Open for Applications";
      case "claimed": case "in_progress": return "In Progress";
      case "awaiting_customer": return "Awaiting Review";
      case "completed": return "Completed";
      case "dispute": return "In Dispute";
      case "cancelled": return "Cancelled";
      case "expired": return "Expired";
      default: return status;
    }
  };

  const isAwaitingCustomer = job.status.toLowerCase() === "awaiting_customer";
  const canSubmitWork = isFreelancerOnJob && !isAwaitingCustomer;
  const canReviewWork = isCustomer && isAwaitingCustomer;
  const canOpenDispute = (isCustomer || isFreelancerOwner) && 
    ["claimed", "in_progress", "awaiting_customer"].includes(job.status.toLowerCase());

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <Button
          variant="ghost"
          size="icon"
          onClick={() => setLocation("/jobs")}
          data-testid="button-back"
        >
          <ArrowLeft className="w-5 h-5" />
        </Button>
        <div className="flex-1">
          <h1 className="text-3xl font-bold" data-testid="text-job-title">
            {job.title}
          </h1>
          <div className="flex items-center gap-2 mt-2 flex-wrap">
            <Badge className={getStatusColor(job.status)} variant="secondary">
              {getStatusLabel(job.status)}
            </Badge>
            <Badge variant="outline">{job.category}</Badge>
            {job.isLocked && (
              <Badge variant="destructive">Locked</Badge>
            )}
          </div>
        </div>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => setIsReportDialogOpen(true)}
          className="text-muted-foreground hover:text-destructive"
          data-testid="button-report-job"
        >
          <Flag className="w-4 h-4 mr-1" />
          Report
        </Button>
      </div>

      <ReportDialog
        open={isReportDialogOpen}
        onOpenChange={setIsReportDialogOpen}
        targetId={job.id}
        reportType="job"
        targetName={job.title}
      />

      <div className="grid gap-6 md:grid-cols-3">
        <div className="md:col-span-2">
          <Tabs defaultValue="overview" className="w-full">
            <TabsList className={`grid w-full ${getTabGridCols()}`} data-testid="tabs-job-detail">
              <TabsTrigger value="overview" data-testid="tab-overview">
                <FileText className="w-4 h-4 mr-2" />
                Overview
              </TabsTrigger>
              {isTeamMember && (
                <TabsTrigger value="team" data-testid="tab-team">
                  <Users className="w-4 h-4 mr-2" />
                  Team
                </TabsTrigger>
              )}
              {isFreelancerOnJob && (
                <TabsTrigger value="workspace" data-testid="tab-workspace">
                  <Briefcase className="w-4 h-4 mr-2" />
                  Workspace
                </TabsTrigger>
              )}
            </TabsList>

            <TabsContent value="overview" className="space-y-6 mt-6">
              <Card>
                <CardHeader>
                  <CardTitle>Job Description</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <p className="text-muted-foreground whitespace-pre-wrap" data-testid="text-job-description">
                    {job.description}
                  </p>
                  {job.requirements && (
                    <>
                      <Separator />
                      <div>
                        <h3 className="font-semibold mb-2">Requirements</h3>
                        <p className="text-muted-foreground whitespace-pre-wrap">
                          {job.requirements}
                        </p>
                      </div>
                    </>
                  )}
                </CardContent>
              </Card>

              {job.profitSplits && job.profitSplits.length > 0 && (
                <Card>
                  <CardHeader>
                    <CardTitle>Team & Profit Sharing</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-3">
                      {job.collaboratorData?.map((collaborator, index) => {
                        const split = job.profitSplits?.find(
                          (s) => s.userId === collaborator.id
                        );
                        return (
                          <div
                            key={collaborator.id}
                            className="flex items-center justify-between p-3 rounded-md bg-muted/50"
                            data-testid={`team-member-${index}`}
                          >
                            <div className="flex items-center gap-3">
                              <Avatar className="h-10 w-10">
                                <AvatarImage src={collaborator.avatar || undefined} />
                                <AvatarFallback>
                                  {collaborator.username.charAt(0).toUpperCase()}
                                </AvatarFallback>
                              </Avatar>
                              <div>
                                <p className="font-medium">{collaborator.username}</p>
                                {collaborator.specialization && (
                                  <p className="text-sm text-muted-foreground">
                                    {collaborator.specialization}
                                  </p>
                                )}
                              </div>
                            </div>
                            <div className="text-right">
                              <p className="font-semibold">${split?.amount}</p>
                              <p className="text-sm text-muted-foreground">
                                {split?.percentage}%
                              </p>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </CardContent>
                </Card>
              )}

              {/* Show job requests queue for customers when job is active */}
              {isCustomer && job.status === "active" && (
                <JobRequestsViewer jobId={jobId!} isJobOwner={isCustomer} />
              )}
            </TabsContent>

            <TabsContent value="team" className="space-y-6 mt-6">
              <PublicTeamViewer job={job} />
            </TabsContent>

            {isFreelancerOnJob && (
              <TabsContent value="workspace" className="space-y-6 mt-6">
                <TeamCollaboration jobId={jobId!} />
              </TabsContent>
            )}
          </Tabs>
        </div>

        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Job Details</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center gap-2 text-muted-foreground">
                <DollarSign className="w-4 h-4" />
                <div>
                  <p className="text-sm">Budget</p>
                  <p className="text-lg font-semibold text-foreground" data-testid="text-budget">
                    ${job.budget}
                  </p>
                </div>
              </div>
              {job.deadline && (
                <div className="flex items-center gap-2 text-muted-foreground">
                  <Clock className="w-4 h-4" />
                  <div>
                    <p className="text-sm">Deadline (ET)</p>
                    <p className="text-sm text-foreground">
                      {formatEasternDate(job.deadline)} ({formatDistanceToNow(new Date(job.deadline), {
                        addSuffix: true,
                      })})
                    </p>
                  </div>
                </div>
              )}
              <div className="flex items-center gap-2 text-muted-foreground">
                <User className="w-4 h-4" />
                <div>
                  <p className="text-sm">Client</p>
                  <p className="text-sm text-foreground" data-testid="text-customer">
                    {job.customerUsername || "Unknown"}
                  </p>
                </div>
              </div>
              {job.collaboratorData && job.collaboratorData.length > 0 && (
                <div className="flex items-center gap-2 text-muted-foreground">
                  <Users className="w-4 h-4" />
                  <div>
                    <p className="text-sm">Team Size</p>
                    <p className="text-sm text-foreground">
                      {job.collaboratorData.length} member
                      {job.collaboratorData.length !== 1 ? "s" : ""}
                    </p>
                  </div>
                </div>
              )}
              <div className="flex items-center gap-2 text-muted-foreground">
                <Calendar className="w-4 h-4" />
                <div>
                  <p className="text-sm">Posted</p>
                  <p className="text-sm text-foreground">
                    {formatDistanceToNow(new Date(job.createdAt), {
                      addSuffix: true,
                    })}
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Actions</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {isEligibleToClaim && !isJobTaken && (
                <Button
                  className="w-full"
                  onClick={() => claimJobMutation.mutate()}
                  disabled={claimJobMutation.isPending}
                  data-testid="button-claim-job"
                >
                  {claimJobMutation.isPending ? "Applying..." : "Apply for Job"}
                </Button>
              )}
              {isJobTaken && (
                <Button
                  className="w-full"
                  variant="secondary"
                  disabled
                  data-testid="button-job-taken"
                >
                  Job Already Taken
                </Button>
              )}
              {canOfferTeam && (
                <Dialog open={isInviteDialogOpen} onOpenChange={setIsInviteDialogOpen}>
                  <DialogTrigger asChild>
                    <Button
                      className="w-full"
                      variant="outline"
                      data-testid="button-offer-team"
                    >
                      <Users className="w-4 h-4 mr-2" />
                      Offer Team
                    </Button>
                  </DialogTrigger>
                  <DialogContent>
                    <DialogHeader>
                      <DialogTitle>Invite Team Member</DialogTitle>
                      <DialogDescription>
                        Search for a freelancer to invite to this job. Profits will be
                        split equally among all team members.
                      </DialogDescription>
                    </DialogHeader>
                    <div className="space-y-4">
                      <div className="space-y-2">
                        <Label htmlFor="search">Search Freelancers</Label>
                        <Input
                          id="search"
                          placeholder="Search by username..."
                          value={searchQuery}
                          onChange={(e) => setSearchQuery(e.target.value)}
                          data-testid="input-search-freelancer"
                        />
                      </div>
                      {searchResults.length > 0 && (
                        <div className="space-y-2 max-h-64 overflow-y-auto">
                          {searchResults.map((result) => (
                            <div
                              key={result.id}
                              className={`flex items-center justify-between p-3 rounded-md border cursor-pointer hover-elevate ${
                                selectedUser?.id === result.id
                                  ? "bg-accent"
                                  : ""
                              }`}
                              onClick={() => setSelectedUser(result)}
                              data-testid={`freelancer-${result.id}`}
                            >
                              <div className="flex items-center gap-3">
                                <Avatar className="h-8 w-8">
                                  <AvatarImage src={result.avatar || undefined} />
                                  <AvatarFallback>
                                    {result.username.charAt(0).toUpperCase()}
                                  </AvatarFallback>
                                </Avatar>
                                <div>
                                  <p className="font-medium text-sm">
                                    {result.username}
                                  </p>
                                  {result.specialization && (
                                    <p className="text-xs text-muted-foreground">
                                      {result.specialization}
                                    </p>
                                  )}
                                </div>
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                    <DialogFooter>
                      <Button
                        onClick={() => {
                          if (selectedUser) {
                            inviteMutation.mutate(selectedUser.id);
                          }
                        }}
                        disabled={!selectedUser || inviteMutation.isPending}
                        data-testid="button-send-invitation"
                      >
                        {inviteMutation.isPending ? "Sending..." : "Send Invitation"}
                      </Button>
                    </DialogFooter>
                  </DialogContent>
                </Dialog>
              )}
              {/* Submit Work Button for Freelancers */}
              {canSubmitWork && (
                <Dialog open={isSubmitWorkDialogOpen} onOpenChange={setIsSubmitWorkDialogOpen}>
                  <DialogTrigger asChild>
                    <Button className="w-full" data-testid="button-submit-work">
                      <Send className="w-4 h-4 mr-2" />
                      Submit Work
                    </Button>
                  </DialogTrigger>
                  <DialogContent className="max-w-lg">
                    <DialogHeader>
                      <DialogTitle>Submit Your Work</DialogTitle>
                      <DialogDescription>
                        Provide proof of your completed work. The customer will have 4 days to review.
                      </DialogDescription>
                    </DialogHeader>
                    <div className="space-y-4">
                      <div className="space-y-2">
                        <Label>Proof Links</Label>
                        {workProofLinks.map((link, index) => (
                          <div key={index} className="flex gap-2">
                            <Input
                              placeholder="https://example.com/proof"
                              value={link}
                              onChange={(e) => {
                                const newLinks = [...workProofLinks];
                                newLinks[index] = e.target.value;
                                setWorkProofLinks(newLinks);
                              }}
                              data-testid={`input-proof-link-${index}`}
                            />
                            {workProofLinks.length > 1 && (
                              <Button
                                type="button"
                                variant="ghost"
                                size="icon"
                                onClick={() => setWorkProofLinks(workProofLinks.filter((_, i) => i !== index))}
                              >
                                <X className="w-4 h-4" />
                              </Button>
                            )}
                          </div>
                        ))}
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={() => setWorkProofLinks([...workProofLinks, ""])}
                          data-testid="button-add-proof-link"
                        >
                          <Plus className="w-4 h-4 mr-2" />
                          Add Another Link
                        </Button>
                      </div>
                      <div className="space-y-2">
                        <Label>Notes (Optional)</Label>
                        <Textarea
                          placeholder="Describe what you've completed, any special instructions..."
                          value={workNotes}
                          onChange={(e) => setWorkNotes(e.target.value)}
                          className="min-h-24"
                          data-testid="textarea-work-notes"
                        />
                      </div>
                    </div>
                    <DialogFooter>
                      <Button
                        type="button"
                        variant="outline"
                        onClick={() => setIsSubmitWorkDialogOpen(false)}
                      >
                        Cancel
                      </Button>
                      <Button
                        onClick={() => submitWorkMutation.mutate()}
                        disabled={submitWorkMutation.isPending || !workProofLinks.some(l => l.trim())}
                        data-testid="button-confirm-submit-work"
                      >
                        {submitWorkMutation.isPending ? "Submitting..." : "Submit Work"}
                      </Button>
                    </DialogFooter>
                  </DialogContent>
                </Dialog>
              )}

              {/* Customer Review Section */}
              {canReviewWork && submissions.length > 0 && (
                <Card className="border-purple-500/50 bg-purple-500/5">
                  <CardHeader className="pb-2">
                    <CardTitle className="text-base flex items-center gap-2">
                      <CheckSquare className="w-4 h-4 text-purple-500" />
                      Work Submitted for Review
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    {submissions[0]?.proofLinks?.length > 0 && (
                      <div>
                        <p className="text-sm font-medium mb-1">Proof Links:</p>
                        <div className="space-y-1">
                          {submissions[0].proofLinks.map((link: string, i: number) => (
                            <a
                              key={i}
                              href={link}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-sm text-primary hover:underline flex items-center gap-1"
                              data-testid={`link-proof-${i}`}
                            >
                              <Link className="w-3 h-3" />
                              {link}
                            </a>
                          ))}
                        </div>
                      </div>
                    )}
                    {submissions[0]?.notes && (
                      <div>
                        <p className="text-sm font-medium mb-1">Notes:</p>
                        <p className="text-sm text-muted-foreground">{submissions[0].notes}</p>
                      </div>
                    )}
                    <div className="flex gap-2 pt-2">
                      <Button
                        className="flex-1"
                        onClick={() => acceptWorkMutation.mutate()}
                        disabled={acceptWorkMutation.isPending}
                        data-testid="button-accept-work"
                      >
                        <CheckCircle2 className="w-4 h-4 mr-2" />
                        {acceptWorkMutation.isPending ? "Accepting..." : "Accept & Pay"}
                      </Button>
                      <Dialog>
                        <DialogTrigger asChild>
                          <Button variant="outline" className="flex-1" data-testid="button-request-revision">
                            Request Revision
                          </Button>
                        </DialogTrigger>
                        <DialogContent>
                          <DialogHeader>
                            <DialogTitle>Request Revision</DialogTitle>
                            <DialogDescription>
                              Explain what needs to be revised. The freelancer will be notified.
                            </DialogDescription>
                          </DialogHeader>
                          <Textarea
                            placeholder="Please describe what needs to be changed..."
                            className="min-h-24"
                            id="revision-feedback"
                            data-testid="textarea-revision-feedback"
                          />
                          <DialogFooter>
                            <Button
                              onClick={() => {
                                const feedback = (document.getElementById("revision-feedback") as HTMLTextAreaElement)?.value;
                                if (feedback) rejectWorkMutation.mutate(feedback);
                              }}
                              disabled={rejectWorkMutation.isPending}
                              data-testid="button-confirm-revision"
                            >
                              {rejectWorkMutation.isPending ? "Sending..." : "Send Feedback"}
                            </Button>
                          </DialogFooter>
                        </DialogContent>
                      </Dialog>
                    </div>
                  </CardContent>
                </Card>
              )}

              {/* Open Dispute Button */}
              {canOpenDispute && (
                <Dialog open={isDisputeDialogOpen} onOpenChange={setIsDisputeDialogOpen}>
                  <DialogTrigger asChild>
                    <Button className="w-full" variant="outline" data-testid="button-open-dispute">
                      <Gavel className="w-4 h-4 mr-2" />
                      Open Dispute
                    </Button>
                  </DialogTrigger>
                  <DialogContent>
                    <DialogHeader>
                      <DialogTitle className="flex items-center gap-2">
                        <AlertTriangle className="w-5 h-5 text-destructive" />
                        Open a Dispute
                      </DialogTitle>
                      <DialogDescription>
                        A moderator will review your dispute and contact both parties to resolve the issue.
                      </DialogDescription>
                    </DialogHeader>
                    <div className="space-y-4">
                      <Textarea
                        placeholder="Describe the issue in detail..."
                        value={disputeReason}
                        onChange={(e) => setDisputeReason(e.target.value)}
                        className="min-h-32"
                        data-testid="textarea-dispute-reason"
                      />
                    </div>
                    <DialogFooter>
                      <Button
                        type="button"
                        variant="outline"
                        onClick={() => setIsDisputeDialogOpen(false)}
                      >
                        Cancel
                      </Button>
                      <Button
                        variant="destructive"
                        onClick={() => openDisputeMutation.mutate()}
                        disabled={openDisputeMutation.isPending || disputeReason.length < 10}
                        data-testid="button-confirm-dispute"
                      >
                        {openDisputeMutation.isPending ? "Opening..." : "Open Dispute"}
                      </Button>
                    </DialogFooter>
                  </DialogContent>
                </Dialog>
              )}

              {isCustomer && (job.status === "claimed" || job.status === "in_progress") && (
                <Dialog open={isCancelDialogOpen} onOpenChange={setIsCancelDialogOpen}>
                  <DialogTrigger asChild>
                    <Button
                      className="w-full"
                      variant="destructive"
                      data-testid="button-request-cancellation"
                    >
                      <XCircle className="w-4 h-4 mr-2" />
                      Request Cancellation
                    </Button>
                  </DialogTrigger>
                  <DialogContent>
                    <DialogHeader>
                      <DialogTitle>Request Job Cancellation</DialogTitle>
                      <DialogDescription>
                        Submit a cancellation request with a reason and proof. An admin will review your request.
                      </DialogDescription>
                    </DialogHeader>
                    <Form {...cancellationForm}>
                      <form onSubmit={cancellationForm.handleSubmit((data) => cancelJobMutation.mutate(data))} className="space-y-4">
                        <FormField
                          control={cancellationForm.control}
                          name="reason"
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel>Reason for Cancellation *</FormLabel>
                              <FormControl>
                                <Textarea
                                  placeholder="Explain why you need to cancel this job..."
                                  className="min-h-24"
                                  data-testid="textarea-cancel-reason"
                                  {...field}
                                />
                              </FormControl>
                              <FormMessage />
                            </FormItem>
                          )}
                        />
                        <div className="space-y-2">
                          <Label htmlFor="proof">Proof (Optional)</Label>
                          <div className="flex gap-2">
                            <Input
                              id="proof"
                              type="file"
                              accept="image/*,.pdf"
                              onChange={(e) => setProofFile(e.target.files?.[0] || null)}
                              data-testid="input-proof-file"
                            />
                            {proofFile && (
                              <Button
                                type="button"
                                variant="ghost"
                                size="icon"
                                onClick={() => setProofFile(null)}
                                data-testid="button-remove-proof"
                              >
                                <XCircle className="w-4 h-4" />
                              </Button>
                            )}
                          </div>
                          {proofFile && (
                            <p className="text-sm text-muted-foreground">
                              Selected: {proofFile.name}
                            </p>
                          )}
                        </div>
                        <DialogFooter>
                          <Button
                            type="button"
                            variant="outline"
                            onClick={() => {
                              setIsCancelDialogOpen(false);
                              cancellationForm.reset();
                              setProofFile(null);
                            }}
                            data-testid="button-cancel-dialog"
                          >
                            Cancel
                          </Button>
                          <Button
                            type="submit"
                            disabled={cancelJobMutation.isPending}
                            data-testid="button-submit-cancellation"
                          >
                            {cancelJobMutation.isPending ? "Submitting..." : "Submit Request"}
                          </Button>
                        </DialogFooter>
                      </form>
                    </Form>
                  </DialogContent>
                </Dialog>
              )}
              
              {/* Rating UI for customers on completed jobs */}
              {user?.role === "customer" && job.status === "completed" && job.customerId === user.id && (
                <div className="border-t pt-3 mt-3">
                  {existingRating ? (
                    <div className="space-y-2">
                      <p className="text-sm font-medium">Your Rating</p>
                      <div className="flex gap-1">
                        {[1, 2, 3, 4, 5].map((star) => (
                          <Star
                            key={star}
                            className={`w-5 h-5 ${
                              star <= existingRating.score
                                ? "fill-yellow-400 text-yellow-400"
                                : "text-gray-300"
                            }`}
                          />
                        ))}
                      </div>
                      {existingRating.review && (
                        <p className="text-sm text-muted-foreground italic">
                          "{existingRating.review}"
                        </p>
                      )}
                    </div>
                  ) : (
                    <Dialog open={isRatingDialogOpen} onOpenChange={setIsRatingDialogOpen}>
                      <DialogTrigger asChild>
                        <Button
                          className="w-full"
                          variant="default"
                          data-testid="button-rate-job"
                        >
                          <Star className="w-4 h-4 mr-2" />
                          Rate This Job
                        </Button>
                      </DialogTrigger>
                      <DialogContent>
                        <DialogHeader>
                          <DialogTitle>Rate Freelancer</DialogTitle>
                          <DialogDescription>
                            Share your experience with this freelancer to help others make informed decisions.
                          </DialogDescription>
                        </DialogHeader>
                        <div className="space-y-4">
                          <div className="space-y-2">
                            <Label>Rating *</Label>
                            <div className="flex gap-2">
                              {[1, 2, 3, 4, 5].map((star) => (
                                <button
                                  key={star}
                                  type="button"
                                  onClick={() => setRatingScore(star)}
                                  className="transition-transform hover:scale-110"
                                  data-testid={`button-star-${star}`}
                                >
                                  <Star
                                    className={`w-8 h-8 ${
                                      star <= ratingScore
                                        ? "fill-yellow-400 text-yellow-400"
                                        : "text-gray-300 hover:text-yellow-200"
                                    }`}
                                  />
                                </button>
                              ))}
                            </div>
                          </div>
                          <div className="space-y-2">
                            <Label htmlFor="review">Review (Optional)</Label>
                            <Textarea
                              id="review"
                              placeholder="Share your experience working with this freelancer..."
                              className="min-h-24"
                              value={ratingReview}
                              onChange={(e) => setRatingReview(e.target.value)}
                              data-testid="textarea-rating-review"
                            />
                          </div>
                        </div>
                        <DialogFooter>
                          <Button
                            type="button"
                            variant="outline"
                            onClick={() => {
                              setIsRatingDialogOpen(false);
                              setRatingScore(0);
                              setRatingReview("");
                            }}
                            data-testid="button-cancel-rating"
                          >
                            Cancel
                          </Button>
                          <Button
                            onClick={() => submitRatingMutation.mutate()}
                            disabled={ratingScore === 0 || submitRatingMutation.isPending}
                            data-testid="button-submit-rating"
                          >
                            {submitRatingMutation.isPending ? "Submitting..." : "Submit Rating"}
                          </Button>
                        </DialogFooter>
                      </DialogContent>
                    </Dialog>
                  )}
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
