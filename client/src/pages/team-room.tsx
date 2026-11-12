import { useState, useEffect, useRef, useCallback } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Separator } from "@/components/ui/separator";
import { useQuery } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/lib/auth-context";
import { format } from "date-fns";
import { toZonedTime } from "date-fns-tz";
import {
  MessageCircle,
  Send,
  Users,
  Phone,
  PhoneOff,
  Mic,
  MicOff,
  Shield,
  Circle,
  Volume2,
  VolumeX,
  X
} from "lucide-react";
import { useTeamRoomCall } from "@/lib/team-room-call-context";

interface VoiceCallParticipant {
  id: string;
  username: string;
  avatar: string | null;
  role: string | null;
}

interface VoiceCall {
  id: string;
  initiatorId: string;
  initiatorUsername: string;
  createdAt?: number;
  participants: VoiceCallParticipant[];
}

interface OnlineUser {
  id: string;
  username: string;
  avatar: string | null;
  role: string;
}

interface ChatMessage {
  id: string;
  senderId: string;
  content: string;
  createdAt: Date;
  sender: {
    id: string;
    username: string;
    avatar: string | null;
    role: string;
  } | null;
}

interface WebRTCPeer {
  userId: string;
  username: string;
  connection: RTCPeerConnection;
  stream?: MediaStream;
}

const ET_TIMEZONE = "America/New_York";

function formatToET(date: Date | string): string {
  const d = typeof date === "string" ? new Date(date) : date;
  const zonedDate = toZonedTime(d, ET_TIMEZONE);
  return format(zonedDate, "h:mm a") + " ET";
}

function getRoleBadgeVariant(role: string): "default" | "secondary" | "destructive" | "outline" {
  switch (role) {
    case "founder": return "destructive";
    case "head_of_moderation": return "default";
    default: return "secondary";
  }
}

function getRoleDisplay(role: string): string {
  switch (role) {
    case "founder": return "Founder";
    case "head_of_moderation": return "Head of Mod";
    case "moderator": return "Mod";
    default: return role;
  }
}

export default function TeamRoomPage() {
  const { user } = useAuth();
  const [inputMessage, setInputMessage] = useState("");
  const [showCallOptionsDialog, setShowCallOptionsDialog] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // The socket and the voice call live in TeamRoomCallProvider, above the
  // router, so staying in a call no longer depends on this page being mounted.
  const {
    isConnected,
    isLoading,
    messages,
    onlineUsers,
    typingUsers,
    calls,
    inCall,
    isMuted,
    isDeafened,
    sendMessage,
    sendTyping,
    startCall,
    joinCall,
    endCall,
    closeCall,
    toggleMute,
    toggleDeafen,
  } = useTeamRoomCall();

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const handleSendMessage = () => {
    if (!inputMessage.trim()) return;
    sendMessage(inputMessage.trim());
    setInputMessage("");
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSendMessage();
    }
  };

  const handleStartCallClick = () => {
    // If there are calls we're not in, let the user choose between joining
    // one or starting a brand-new call alongside it. Otherwise start one.
    const joinable = calls.filter((call) => !call.participants.some((p) => p.id === user?.id));
    if (joinable.length > 0) {
      setShowCallOptionsDialog(true);
    } else {
      startCall();
    }
  };

  if (!user || !["moderator", "head_of_moderation", "founder"].includes(user.role)) {
    return (
      <div className="p-6 max-w-4xl mx-auto">
        <Card>
          <CardContent className="p-6 text-center">
            <Shield className="w-12 h-12 mx-auto text-muted-foreground mb-4" />
            <p className="text-muted-foreground">This page is only accessible to the moderation team</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="h-full flex gap-4 p-4">
        <Skeleton className="flex-1 h-full" />
        <Skeleton className="w-64 h-full" />
      </div>
    );
  }

  return (
    <div className="h-full flex gap-4 p-4 overflow-hidden">
      <div className="flex-1 flex flex-col min-w-0">
        <Card className="flex-1 flex flex-col overflow-hidden">
          <CardHeader className="border-b py-3 px-4">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <MessageCircle className="w-5 h-5 text-primary" />
                <CardTitle className="text-lg" data-testid="text-team-room-title">Team Room Chat</CardTitle>
                {isConnected ? (
                  <Badge variant="outline" className="text-green-600">
                    <Circle className="w-2 h-2 mr-1 fill-green-600" /> Connected
                  </Badge>
                ) : (
                  <Badge variant="outline" className="text-yellow-600">
                    <Circle className="w-2 h-2 mr-1 fill-yellow-600" /> Connecting...
                  </Badge>
                )}
              </div>
              <div className="flex items-center gap-2">
                {inCall ? (
                  <>
                    <Button
                      size="icon"
                      variant={isMuted ? "destructive" : "secondary"}
                      onClick={toggleMute}
                      data-testid="button-toggle-mute"
                    >
                      {isMuted ? <MicOff className="w-4 h-4" /> : <Mic className="w-4 h-4" />}
                    </Button>
                    <Button
                      size="icon"
                      variant={isDeafened ? "destructive" : "secondary"}
                      onClick={toggleDeafen}
                      data-testid="button-toggle-deafen"
                    >
                      {isDeafened ? <VolumeX className="w-4 h-4" /> : <Volume2 className="w-4 h-4" />}
                    </Button>
                    <Button
                      variant="destructive"
                      onClick={endCall}
                      data-testid="button-end-call"
                    >
                      <PhoneOff className="w-4 h-4 mr-2" /> Leave Call
                    </Button>
                  </>
                ) : (
                  <>
                    {calls.some(c => !c.participants.some(p => p.id === user?.id)) && (
                      <Button
                        variant="secondary"
                        onClick={() => setShowCallOptionsDialog(true)}
                        disabled={!isConnected}
                        data-testid="button-join-call"
                      >
                        <Phone className="w-4 h-4 mr-2" /> Join Call
                      </Button>
                    )}
                    <Button
                      variant="default"
                      onClick={handleStartCallClick}
                      disabled={!isConnected}
                      data-testid="button-start-call"
                    >
                      <Phone className="w-4 h-4 mr-2" /> Start Voice Call
                    </Button>
                  </>
                )}
              </div>
            </div>
          </CardHeader>

          <CardContent className="flex-1 p-0 flex flex-col overflow-hidden">
            <ScrollArea className="flex-1 p-4">
              <div className="space-y-4">
                {messages.map((msg) => (
                  <div
                    key={msg.id}
                    className={`flex gap-3 ${msg.senderId === user.id ? "justify-end" : ""}`}
                    data-testid={`message-${msg.id}`}
                  >
                    {msg.senderId !== user.id && (
                      <Avatar className="w-8 h-8">
                        <AvatarImage src={msg.sender?.avatar || undefined} />
                        <AvatarFallback>
                          {msg.sender?.username?.charAt(0).toUpperCase() || "?"}
                        </AvatarFallback>
                      </Avatar>
                    )}
                    <div className={`max-w-[70%] ${msg.senderId === user.id ? "text-right" : ""}`}>
                      <div className="flex items-center gap-2 mb-1">
                        {msg.senderId !== user.id && (
                          <>
                            <span className="text-sm font-medium">{msg.sender?.username || "Unknown"}</span>
                            {msg.sender?.role && (
                              <Badge variant={getRoleBadgeVariant(msg.sender.role)} className="text-xs">
                                {getRoleDisplay(msg.sender.role)}
                              </Badge>
                            )}
                          </>
                        )}
                        <span className="text-xs text-muted-foreground">
                          {formatToET(msg.createdAt)}
                        </span>
                      </div>
                      <div
                        className={`inline-block rounded-lg px-3 py-2 ${
                          msg.senderId === user.id
                            ? "bg-primary text-primary-foreground"
                            : "bg-muted"
                        }`}
                      >
                        <p className="text-sm whitespace-pre-wrap break-words">{msg.content}</p>
                      </div>
                    </div>
                    {msg.senderId === user.id && (
                      <Avatar className="w-8 h-8">
                        <AvatarImage src={user.avatar || undefined} />
                        <AvatarFallback>
                          {user.username?.charAt(0).toUpperCase() || "?"}
                        </AvatarFallback>
                      </Avatar>
                    )}
                  </div>
                ))}
                <div ref={messagesEndRef} />
              </div>
            </ScrollArea>

            {typingUsers.size > 0 && (
              <div className="px-4 py-2 text-sm text-muted-foreground">
                {Array.from(typingUsers).join(", ")} {typingUsers.size === 1 ? "is" : "are"} typing...
              </div>
            )}

            <div className="p-4 border-t">
              <div className="flex gap-2">
                <Input
                  value={inputMessage}
                  onChange={(e) => {
                    setInputMessage(e.target.value);
                    sendTyping();
                  }}
                  onKeyDown={handleKeyDown}
                  placeholder="Type a message..."
                  disabled={!isConnected}
                  data-testid="input-chat-message"
                />
                <Button
                  onClick={handleSendMessage}
                  disabled={!isConnected || !inputMessage.trim()}
                  data-testid="button-send-message"
                >
                  <Send className="w-4 h-4" />
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="w-64 flex flex-col gap-4">
        <Card>
          <CardHeader className="py-3 px-4">
            <CardTitle className="text-sm flex items-center gap-2">
              <Users className="w-4 h-4" />
              Online ({onlineUsers.length})
            </CardTitle>
          </CardHeader>
          <CardContent className="p-2">
            <ScrollArea className="h-48">
              <div className="space-y-2">
                {onlineUsers.map((u) => (
                  <div
                    key={u.id}
                    className="flex items-center gap-2 p-2 rounded-md hover-elevate"
                    data-testid={`user-online-${u.id}`}
                  >
                    <div className="relative">
                      <Avatar className="w-8 h-8">
                        <AvatarImage src={u.avatar || undefined} />
                        <AvatarFallback>
                          {u.username?.charAt(0).toUpperCase() || "?"}
                        </AvatarFallback>
                      </Avatar>
                      <Circle className="w-2 h-2 absolute -bottom-0.5 -right-0.5 fill-green-500 text-green-500" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate">
                        {u.username}
                        {u.id === user.id && " (You)"}
                      </p>
                      <Badge variant={getRoleBadgeVariant(u.role)} className="text-xs">
                        {getRoleDisplay(u.role)}
                      </Badge>
                    </div>
                    {calls.some(c => c.participants.some(p => p.id === u.id)) && (
                      <Phone className="w-4 h-4 text-green-500" />
                    )}
                  </div>
                ))}
                {onlineUsers.length === 0 && (
                  <p className="text-sm text-muted-foreground text-center py-4">
                    No one else online
                  </p>
                )}
              </div>
            </ScrollArea>
          </CardContent>
        </Card>

        {calls.length > 0 && (
          <Card>
            <CardHeader className="py-3 px-4">
              <CardTitle className="text-sm flex items-center gap-2">
                <Phone className="w-4 h-4 text-green-500" />
                Voice Calls ({calls.length})
              </CardTitle>
            </CardHeader>
            <CardContent className="p-2 space-y-3">
              {calls.map((call) => {
                const amIn = call.participants.some(p => p.id === user?.id);
                return (
                  <div
                    key={call.id}
                    className="rounded-md border p-2"
                    data-testid={`call-card-${call.id}`}
                  >
                    <div className="flex items-center justify-between gap-2 mb-1">
                      <p className="text-xs font-medium truncate">
                        {call.initiatorUsername}'s Call
                      </p>
                      {(user?.role === "founder" || user?.role === "head_of_moderation") && (
                        <Button
                          size="icon"
                          variant="ghost"
                          className="h-5 w-5"
                          onClick={() => closeCall(call.id)}
                          title="Close call for everyone"
                          data-testid={`button-close-call-${call.id}`}
                        >
                          <X className="w-3 h-3" />
                        </Button>
                      )}
                    </div>
                    <div className="space-y-1">
                      {call.participants.map((participant) => (
                        <div
                          key={participant.id}
                          className="flex items-center gap-2 text-sm"
                          data-testid={`call-participant-${participant.id}`}
                        >
                          <Avatar className="w-5 h-5">
                            <AvatarImage src={participant.avatar || undefined} />
                            <AvatarFallback className="text-[10px]">
                              {participant.username?.charAt(0).toUpperCase() || "?"}
                            </AvatarFallback>
                          </Avatar>
                          <span className="truncate">
                            {participant.username}
                            {participant.id === user?.id && " (You)"}
                          </span>
                          {participant.id === user?.id && isMuted && (
                            <MicOff className="w-3 h-3 text-red-500" />
                          )}
                        </div>
                      ))}
                    </div>
                    {!amIn && (
                      <Button
                        size="sm"
                        variant="outline"
                        className="w-full mt-2"
                        onClick={() => {
                    setShowCallOptionsDialog(false);
                    joinCall(call.id);
                  }}
                        data-testid={`button-join-call-${call.id}`}
                      >
                        <Phone className="w-3 h-3 mr-1" /> Join Call
                      </Button>
                    )}
                  </div>
                );
              })}
            </CardContent>
          </Card>
        )}
      </div>

      <Dialog open={showCallOptionsDialog} onOpenChange={setShowCallOptionsDialog}>
        <DialogContent data-testid="dialog-call-options">
          <DialogHeader>
            <DialogTitle>Voice Calls Active</DialogTitle>
            <DialogDescription>
              There {calls.length === 1 ? "is" : "are"} {calls.length} active voice call
              {calls.length === 1 ? "" : "s"}. Join one, or start a brand new call alongside it.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2 max-h-64 overflow-y-auto">
            {calls.map((call) => (
              <div
                key={call.id}
                className="flex items-center justify-between gap-2 rounded-md border p-2"
                data-testid={`dialog-call-${call.id}`}
              >
                <div className="min-w-0">
                  <p className="text-sm font-medium truncate">{call.initiatorUsername}'s Call</p>
                  <p className="text-xs text-muted-foreground">
                    {call.participants.length} participant{call.participants.length === 1 ? "" : "s"}
                  </p>
                </div>
                <Button
                  size="sm"
                  variant="secondary"
                  onClick={() => {
                    setShowCallOptionsDialog(false);
                    joinCall(call.id);
                  }}
                  data-testid={`button-dialog-join-${call.id}`}
                >
                  <Phone className="w-3 h-3 mr-1" /> Join
                </Button>
              </div>
            ))}
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setShowCallOptionsDialog(false)}>
              Cancel
            </Button>
            <Button
              onClick={() => {
                setShowCallOptionsDialog(false);
                startCall();
              }}
              data-testid="button-start-new-call"
            >
              <Phone className="w-4 h-4 mr-2" /> Start New Call
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
