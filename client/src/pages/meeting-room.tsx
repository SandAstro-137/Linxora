import { useEffect, useRef, useState } from "react";
import { useLocation, useRoute } from "wouter";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useAuth } from "@/lib/auth-context";
import { useToast } from "@/hooks/use-toast";
import { Gavel, Send, MicOff, Mic, DoorOpen, ShieldCheck, Trash2 } from "lucide-react";
import { formatDistanceToNow } from "date-fns";

interface MeetingMessage {
  id: string;
  groupId: string;
  senderId: string;
  message: string;
  isSystemMessage: boolean;
  createdAt: Date;
  senderUsername?: string | null;
  senderAvatar?: string | null;
}

interface MeetingParticipant {
  id: string;
  username: string;
  avatar: string | null;
  role: string;
}

interface MeetingDetails {
  id: string;
  jobId: string;
  groupChatId: string;
  moderatorId: string;
  status: string;
  mutedUserIds: string[];
  jobTitle: string | null;
  jobStatus: string | null;
  group: { id: string; name: string } | null;
  participants: MeetingParticipant[];
  canControl: boolean;
  amMuted: boolean;
}

export default function MeetingRoomPage() {
  const [, params] = useRoute("/meeting/:id");
  const [, setLocation] = useLocation();
  const meetingId = params?.id;
  const { user } = useAuth();
  const { toast } = useToast();
  const [message, setMessage] = useState("");
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const { data: meeting, isLoading: meetingLoading, isError: meetingError } = useQuery<MeetingDetails>({
    queryKey: ["/api/meetings", meetingId],
    enabled: !!meetingId,
    refetchInterval: 5000, // Closing/deleting propagates to open tabs without a manual refresh
  });

  const { data: messages = [], isLoading: messagesLoading } = useQuery<MeetingMessage[]>({
    queryKey: ["/api/meetings", meetingId, "messages"],
    enabled: !!meeting?.groupChatId,
    refetchInterval: 3000,
    queryFn: async () => {
      const res = await fetch(`/api/group-chats/${meeting!.groupChatId}/messages`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to load messages");
      return res.json();
    },
  });

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const sendMessageMutation = useMutation({
    mutationFn: (text: string) =>
      apiRequest("POST", `/api/group-chats/${meeting!.groupChatId}/messages`, { message: text }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/meetings", meetingId, "messages"] });
      setMessage("");
    },
    onError: (error: any) => {
      toast({
        title: "Could not send message",
        description: error?.message || "Please try again.",
        variant: "destructive",
      });
    },
  });

  const toggleMuteMutation = useMutation({
    mutationFn: (userId: string) =>
      apiRequest("POST", `/api/meetings/${meetingId}/toggle-mute`, { userId }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/meetings", meetingId] });
    },
    onError: (error: any) => {
      toast({ title: "Could not update speaker", description: error?.message, variant: "destructive" });
    },
  });

  const closeMeetingMutation = useMutation({
    mutationFn: () => apiRequest("POST", `/api/meetings/${meetingId}/close`, {}),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/meetings", meetingId] });
      toast({
        title: "Meeting closed",
        description: "The meeting is no longer visible to participants. You can review it here or delete it.",
      });
    },
    onError: (error: any) => {
      toast({ title: "Could not close meeting", description: error?.message, variant: "destructive" });
    },
  });

  const deleteMeetingMutation = useMutation({
    mutationFn: () => apiRequest("DELETE", `/api/meetings/${meetingId}`, {}),
    onSuccess: () => {
      toast({ title: "Meeting deleted", description: "The meeting has been permanently removed." });
      setLocation("/moderation");
    },
    onError: (error: any) => {
      toast({ title: "Could not delete meeting", description: error?.message, variant: "destructive" });
    },
  });

  const handleSend = () => {
    if (!message.trim()) return;
    sendMessageMutation.mutate(message.trim());
  };

  if (meetingLoading) {
    return (
      <div className="container mx-auto p-6 max-w-5xl">
        <Card>
          <CardContent className="py-12 text-center text-muted-foreground">Loading meeting…</CardContent>
        </Card>
      </div>
    );
  }

  if (meetingError || !meeting) {
    return (
      <div className="container mx-auto p-6 max-w-5xl">
        <Card>
          <CardContent className="py-12 text-center text-muted-foreground">
            This meeting could not be found or you do not have access.
          </CardContent>
        </Card>
      </div>
    );
  }

  const isClosed = meeting.status === "closed";
  const canType = !isClosed && !meeting.amMuted;

  return (
    <div className="container mx-auto p-6 max-w-5xl">
      <div className="flex items-center justify-between gap-4 mb-6 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2" data-testid="text-meeting-title">
            <Gavel className="w-6 h-6 text-amber-500" />
            {meeting.group?.name || meeting.jobTitle || "Meeting"}
          </h1>
          <p className="text-sm text-muted-foreground">
            Moderator-led discussion for “{meeting.jobTitle || "job"}”
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Badge variant={isClosed ? "outline" : "secondary"}>
            {isClosed ? "Closed" : "In Session"}
          </Badge>
          {meeting.canControl && !isClosed && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => closeMeetingMutation.mutate()}
              disabled={closeMeetingMutation.isPending}
              data-testid="button-close-meeting"
            >
              <DoorOpen className="w-4 h-4 mr-1" />
              Close Meeting
            </Button>
          )}
          {meeting.canControl && isClosed && (
            <Button
              variant="destructive"
              size="sm"
              onClick={() => deleteMeetingMutation.mutate()}
              disabled={deleteMeetingMutation.isPending}
              data-testid="button-delete-meeting"
            >
              <Trash2 className="w-4 h-4 mr-1" />
              Delete Meeting
            </Button>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Participants */}
        <Card data-testid="card-participants">
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <ShieldCheck className="w-4 h-4 text-amber-500" />
              Court Room
            </CardTitle>
            <CardDescription>
              The moderator controls who may speak.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            {meeting.participants.map((p) => {
              const isModerator = p.id === meeting.moderatorId;
              const isMuted = meeting.mutedUserIds.includes(p.id);
              return (
                <div
                  key={p.id}
                  className="flex items-center gap-2 p-2 rounded-md bg-muted/40"
                  data-testid={`participant-${p.id}`}
                >
                  <Avatar className="w-8 h-8">
                    <AvatarImage src={p.avatar || `https://api.dicebear.com/7.x/avataaars/svg?seed=${p.id}`} />
                    <AvatarFallback>{p.username.charAt(0).toUpperCase()}</AvatarFallback>
                  </Avatar>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">
                      {p.username}
                      {p.id === user?.id && <span className="text-muted-foreground"> (you)</span>}
                    </p>
                    <p className="text-xs text-muted-foreground capitalize">{p.role.replace(/_/g, " ")}</p>
                  </div>
                  {isModerator ? (
                    <Badge variant="secondary" className="text-xs">Moderator</Badge>
                  ) : (
                    <Badge variant="outline" className="text-xs">
                      {isMuted ? (
                        <span className="flex items-center gap-1"><MicOff className="w-3 h-3" /> Muted</span>
                      ) : (
                        <span className="flex items-center gap-1"><Mic className="w-3 h-3" /> Can Speak</span>
                      )}
                    </Badge>
                  )}
                  {meeting.canControl && !isModerator && !isClosed && (
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => toggleMuteMutation.mutate(p.id)}
                      disabled={toggleMuteMutation.isPending}
                      data-testid={`button-toggle-mute-${p.id}`}
                      title={isMuted ? "Allow to speak" : "Mute"}
                    >
                      {isMuted ? <Mic className="w-4 h-4" /> : <MicOff className="w-4 h-4" />}
                    </Button>
                  )}
                </div>
              );
            })}
          </CardContent>
        </Card>

        {/* Chat */}
        <Card className="lg:col-span-2" data-testid="card-meeting-chat">
          <CardContent className="pt-6 flex flex-col h-[60vh]">
            <div className="flex-1 overflow-y-auto space-y-4 mb-4 pr-1" data-testid="meeting-messages">
              {messagesLoading && messages.length === 0 ? (
                <p className="text-center text-muted-foreground py-8">Loading discussion…</p>
              ) : messages.length === 0 ? (
                <p className="text-center text-muted-foreground py-8">No messages yet.</p>
              ) : (
                messages.map((msg) => {
                  if (msg.isSystemMessage) {
                    return (
                      <div key={msg.id} className="text-center text-xs text-muted-foreground py-1 px-3 max-w-full break-words">
                        {msg.message}
                      </div>
                    );
                  }
                  const isSender = msg.senderId === user?.id;
                  return (
                    <div key={msg.id} className={`flex ${isSender ? "justify-end" : "justify-start"}`}>
                      <div className={`max-w-[75%] ${isSender ? "" : "flex gap-2"}`}>
                        {!isSender && (
                          <Avatar className="w-8 h-8 flex-shrink-0">
                            <AvatarImage src={msg.senderAvatar || `https://api.dicebear.com/7.x/avataaars/svg?seed=${msg.senderId}`} />
                            <AvatarFallback>{(msg.senderUsername?.[0] || "?").toUpperCase()}</AvatarFallback>
                          </Avatar>
                        )}
                        <div>
                          {!isSender && (
                            <p className="text-xs font-medium mb-1">{msg.senderUsername || "Participant"}</p>
                          )}
                          <div className={`rounded-lg p-3 ${isSender ? "bg-primary text-primary-foreground" : "bg-muted"}`}>
                            <p className="text-sm whitespace-pre-wrap break-words">{msg.message}</p>
                          </div>
                          <p className="text-xs opacity-70 mt-1">
                            {formatDistanceToNow(new Date(msg.createdAt), { addSuffix: true })}
                          </p>
                        </div>
                      </div>
                    </div>
                  );
                })
              )}
              <div ref={messagesEndRef} />
            </div>

            {isClosed ? (
              <p className="text-center text-sm text-muted-foreground py-3">This meeting has ended.</p>
            ) : meeting.amMuted ? (
              <p className="text-center text-sm text-muted-foreground py-3 flex items-center justify-center gap-2">
                <MicOff className="w-4 h-4" />
                You are muted. The moderator controls who may speak.
              </p>
            ) : (
              <div className="flex gap-2">
                <Input
                  placeholder="Type your statement…"
                  value={message}
                  onChange={(e) => setMessage(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && handleSend()}
                  disabled={!canType || sendMessageMutation.isPending}
                  data-testid="input-meeting-message"
                />
                <Button
                  onClick={handleSend}
                  disabled={!message.trim() || !canType || sendMessageMutation.isPending}
                  data-testid="button-send-meeting-message"
                >
                  <Send className="w-4 h-4" />
                </Button>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
