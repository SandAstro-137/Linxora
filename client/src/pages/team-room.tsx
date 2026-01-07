import { useState, useEffect, useRef, useCallback } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { ScrollArea } from "@/components/ui/scroll-area";
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
  VolumeX
} from "lucide-react";

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
  const { toast } = useToast();
  const { user } = useAuth();
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [onlineUsers, setOnlineUsers] = useState<OnlineUser[]>([]);
  const [inputMessage, setInputMessage] = useState("");
  const [isConnected, setIsConnected] = useState(false);
  const [typingUsers, setTypingUsers] = useState<Set<string>>(new Set());
  const [inCall, setInCall] = useState(false);
  const [isMuted, setIsMuted] = useState(false);
  const [isDeafened, setIsDeafened] = useState(false);
  const [callParticipants, setCallParticipants] = useState<string[]>([]);
  const wsRef = useRef<WebSocket | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const localStreamRef = useRef<MediaStream | null>(null);
  const peersRef = useRef<Map<string, WebRTCPeer>>(new Map());
  const audioElementsRef = useRef<Map<string, HTMLAudioElement>>(new Map());
  const typingTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  const { data: initialMessages = [], isLoading } = useQuery<ChatMessage[]>({
    queryKey: ["/api/team-room/messages"],
    enabled: !!user && ["moderator", "head_of_moderation", "founder"].includes(user.role),
  });

  useEffect(() => {
    if (initialMessages.length > 0 && messages.length === 0) {
      setMessages(initialMessages);
    }
  }, [initialMessages, messages.length]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const connectWebSocket = useCallback(() => {
    if (!user || wsRef.current?.readyState === WebSocket.OPEN) return;

    const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
    const wsUrl = `${protocol}//${window.location.host}/ws/team-room?userId=${user.id}`;
    
    const ws = new WebSocket(wsUrl);
    wsRef.current = ws;

    ws.onopen = () => {
      setIsConnected(true);
      console.log("[TeamRoom] Connected to WebSocket");
    };

    ws.onmessage = async (event) => {
      const data = JSON.parse(event.data);

      switch (data.type) {
        case "online_users":
          setOnlineUsers(data.users);
          break;
        case "user_joined":
          setOnlineUsers(prev => {
            if (prev.find(u => u.id === data.user.id)) return prev;
            return [...prev, data.user];
          });
          break;
        case "user_left":
          setOnlineUsers(prev => prev.filter(u => u.id !== data.user.id));
          setCallParticipants(prev => prev.filter(id => id !== data.user.id));
          cleanupPeer(data.user.id);
          break;
        case "chat_message":
          setMessages(prev => [...prev, data.message]);
          setTypingUsers(prev => {
            const next = new Set(prev);
            next.delete(data.message.sender?.username || "");
            return next;
          });
          break;
        case "typing":
          setTypingUsers(prev => {
            const next = new Set(prev);
            next.add(data.user.username);
            setTimeout(() => {
              setTypingUsers(curr => {
                const updated = new Set(curr);
                updated.delete(data.user.username);
                return updated;
              });
            }, 2000);
            return next;
          });
          break;
        case "voice_call_start":
          if (data.initiator.id !== user.id) {
            toast({
              title: "Voice Call Started",
              description: `${data.initiator.username} started a voice call`,
            });
          }
          setCallParticipants(prev => {
            if (prev.includes(data.initiator.id)) return prev;
            return [...prev, data.initiator.id];
          });
          break;
        case "voice_call_end":
          setCallParticipants(prev => prev.filter(id => id !== data.user.id));
          cleanupPeer(data.user.id);
          break;
        case "webrtc_signal":
          handleWebRTCSignal(data);
          break;
        case "error":
          toast({
            title: "Error",
            description: data.message,
            variant: "destructive",
          });
          break;
      }
    };

    ws.onclose = () => {
      setIsConnected(false);
      console.log("[TeamRoom] Disconnected from WebSocket");
      setTimeout(connectWebSocket, 3000);
    };

    ws.onerror = (error) => {
      console.error("[TeamRoom] WebSocket error:", error);
    };
  }, [user, toast]);

  useEffect(() => {
    if (user && ["moderator", "head_of_moderation", "founder"].includes(user.role)) {
      connectWebSocket();
    }

    return () => {
      if (wsRef.current) {
        wsRef.current.close();
      }
      if (localStreamRef.current) {
        localStreamRef.current.getTracks().forEach(track => track.stop());
      }
      peersRef.current.forEach((peer) => {
        peer.connection.close();
      });
    };
  }, [user, connectWebSocket]);

  const sendMessage = () => {
    if (!inputMessage.trim() || !wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) return;

    wsRef.current.send(JSON.stringify({
      type: "chat_message",
      content: inputMessage.trim()
    }));

    setInputMessage("");
  };

  const sendTypingIndicator = () => {
    if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) return;

    if (typingTimeoutRef.current) {
      clearTimeout(typingTimeoutRef.current);
    }

    wsRef.current.send(JSON.stringify({ type: "typing" }));

    typingTimeoutRef.current = setTimeout(() => {
      typingTimeoutRef.current = null;
    }, 1000);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

  const createPeerConnection = (targetUserId: string, targetUsername: string): RTCPeerConnection => {
    const config: RTCConfiguration = {
      iceServers: [
        { urls: "stun:stun.l.google.com:19302" },
        { urls: "stun:stun1.l.google.com:19302" },
      ]
    };

    const pc = new RTCPeerConnection(config);

    pc.onicecandidate = (event) => {
      if (event.candidate && wsRef.current?.readyState === WebSocket.OPEN) {
        wsRef.current.send(JSON.stringify({
          type: "webrtc_signal",
          targetUserId,
          signalType: "ice-candidate",
          signal: event.candidate
        }));
      }
    };

    pc.ontrack = (event) => {
      const stream = event.streams[0];
      if (stream) {
        let audio = audioElementsRef.current.get(targetUserId);
        if (!audio) {
          audio = new Audio();
          audio.autoplay = true;
          audioElementsRef.current.set(targetUserId, audio);
        }
        audio.srcObject = stream;
        audio.muted = isDeafened;
      }
    };

    pc.onconnectionstatechange = () => {
      console.log(`[WebRTC] Connection state with ${targetUsername}: ${pc.connectionState}`);
      if (pc.connectionState === "failed" || pc.connectionState === "disconnected") {
        cleanupPeer(targetUserId);
      }
    };

    peersRef.current.set(targetUserId, {
      userId: targetUserId,
      username: targetUsername,
      connection: pc
    });

    return pc;
  };

  const cleanupPeer = (userId: string) => {
    const peer = peersRef.current.get(userId);
    if (peer) {
      peer.connection.close();
      peersRef.current.delete(userId);
    }
    const audio = audioElementsRef.current.get(userId);
    if (audio) {
      audio.srcObject = null;
      audioElementsRef.current.delete(userId);
    }
  };

  const handleWebRTCSignal = async (data: { fromUserId: string; fromUsername: string; signalType: string; signal: RTCSessionDescriptionInit | RTCIceCandidateInit }) => {
    let peer = peersRef.current.get(data.fromUserId);

    if (data.signalType === "offer") {
      if (!peer) {
        const pc = createPeerConnection(data.fromUserId, data.fromUsername);
        peer = peersRef.current.get(data.fromUserId)!;
      }
      
      await peer.connection.setRemoteDescription(new RTCSessionDescription(data.signal as RTCSessionDescriptionInit));
      
      if (localStreamRef.current) {
        localStreamRef.current.getTracks().forEach(track => {
          peer!.connection.addTrack(track, localStreamRef.current!);
        });
      }
      
      const answer = await peer.connection.createAnswer();
      await peer.connection.setLocalDescription(answer);
      
      if (wsRef.current?.readyState === WebSocket.OPEN) {
        wsRef.current.send(JSON.stringify({
          type: "webrtc_signal",
          targetUserId: data.fromUserId,
          signalType: "answer",
          signal: answer
        }));
      }
    } else if (data.signalType === "answer") {
      if (peer) {
        await peer.connection.setRemoteDescription(new RTCSessionDescription(data.signal as RTCSessionDescriptionInit));
      }
    } else if (data.signalType === "ice-candidate") {
      if (peer) {
        await peer.connection.addIceCandidate(new RTCIceCandidate(data.signal as RTCIceCandidateInit));
      }
    }
  };

  const startCall = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
      localStreamRef.current = stream;
      setInCall(true);
      setCallParticipants(prev => {
        if (!user?.id) return prev;
        if (prev.includes(user.id)) return prev;
        return [...prev, user.id];
      });

      if (wsRef.current?.readyState === WebSocket.OPEN) {
        wsRef.current.send(JSON.stringify({ type: "voice_call_start" }));
      }

      for (const participant of onlineUsers.filter(u => u.id !== user?.id)) {
        const pc = createPeerConnection(participant.id, participant.username);
        
        stream.getTracks().forEach(track => {
          pc.addTrack(track, stream);
        });

        const offer = await pc.createOffer();
        await pc.setLocalDescription(offer);

        if (wsRef.current?.readyState === WebSocket.OPEN) {
          wsRef.current.send(JSON.stringify({
            type: "webrtc_signal",
            targetUserId: participant.id,
            signalType: "offer",
            signal: offer
          }));
        }
      }

      toast({
        title: "Voice Call Started",
        description: "You are now in a voice call with the team",
      });
    } catch (error) {
      console.error("[TeamRoom] Failed to start call:", error);
      toast({
        title: "Microphone Access Required",
        description: "Please allow microphone access to join voice calls",
        variant: "destructive",
      });
    }
  };

  const endCall = () => {
    if (localStreamRef.current) {
      localStreamRef.current.getTracks().forEach(track => track.stop());
      localStreamRef.current = null;
    }

    peersRef.current.forEach((peer) => {
      peer.connection.close();
    });
    peersRef.current.clear();

    audioElementsRef.current.forEach((audio) => {
      audio.srcObject = null;
    });
    audioElementsRef.current.clear();

    setInCall(false);
    setCallParticipants(prev => prev.filter(id => id !== user?.id));

    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({ type: "voice_call_end" }));
    }

    toast({
      title: "Voice Call Ended",
      description: "You have left the voice call",
    });
  };

  const toggleMute = () => {
    if (localStreamRef.current) {
      localStreamRef.current.getAudioTracks().forEach(track => {
        track.enabled = isMuted;
      });
      setIsMuted(!isMuted);
    }
  };

  const toggleDeafen = () => {
    const newDeafened = !isDeafened;
    audioElementsRef.current.forEach((audio) => {
      audio.muted = newDeafened;
    });
    setIsDeafened(newDeafened);
    if (newDeafened && !isMuted) {
      toggleMute();
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
                  <Button
                    variant="default"
                    onClick={startCall}
                    disabled={!isConnected}
                    data-testid="button-start-call"
                  >
                    <Phone className="w-4 h-4 mr-2" /> Start Voice Call
                  </Button>
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
                        <p className="text-sm whitespace-pre-wrap">{msg.content}</p>
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
                    sendTypingIndicator();
                  }}
                  onKeyDown={handleKeyDown}
                  placeholder="Type a message..."
                  disabled={!isConnected}
                  data-testid="input-chat-message"
                />
                <Button
                  onClick={sendMessage}
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
                    {callParticipants.includes(u.id) && (
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

        {callParticipants.length > 0 && (
          <Card>
            <CardHeader className="py-3 px-4">
              <CardTitle className="text-sm flex items-center gap-2">
                <Phone className="w-4 h-4 text-green-500" />
                In Voice Call ({callParticipants.length})
              </CardTitle>
            </CardHeader>
            <CardContent className="p-2">
              <div className="space-y-2">
                {callParticipants.map((participantId) => {
                  const participant = onlineUsers.find(u => u.id === participantId) ||
                    (participantId === user.id ? { id: user.id, username: user.username, avatar: user.avatar, role: user.role } : null);
                  if (!participant) return null;
                  return (
                    <div
                      key={participantId}
                      className="flex items-center gap-2 p-2 rounded-md bg-green-500/10"
                      data-testid={`call-participant-${participantId}`}
                    >
                      <Avatar className="w-6 h-6">
                        <AvatarImage src={participant.avatar || undefined} />
                        <AvatarFallback>
                          {participant.username?.charAt(0).toUpperCase() || "?"}
                        </AvatarFallback>
                      </Avatar>
                      <span className="text-sm truncate">
                        {participant.username}
                        {participantId === user.id && " (You)"}
                      </span>
                      {participantId === user.id && isMuted && (
                        <MicOff className="w-3 h-3 text-red-500" />
                      )}
                    </div>
                  );
                })}
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}
