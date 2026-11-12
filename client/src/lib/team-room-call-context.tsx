import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/lib/auth-context";

export interface VoiceCallParticipant {
  id: string;
  username: string;
  avatar: string | null;
  role: string | null;
}

export interface VoiceCall {
  id: string;
  initiatorId: string;
  initiatorUsername: string;
  createdAt?: number;
  participants: VoiceCallParticipant[];
}

export interface OnlineUser {
  id: string;
  username: string;
  avatar: string | null;
  role: string;
}

export interface ChatMessage {
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

interface TeamRoomContextValue {
  isConnected: boolean;
  isLoading: boolean;
  messages: ChatMessage[];
  onlineUsers: OnlineUser[];
  typingUsers: Set<string>;
  calls: VoiceCall[];
  inCall: boolean;
  isMuted: boolean;
  isDeafened: boolean;
  activeCallId: string | null;
  sendMessage: (content: string) => void;
  sendTyping: () => void;
  startCall: () => Promise<void>;
  joinCall: (callId: string) => Promise<void>;
  endCall: () => void;
  closeCall: (callId: string) => void;
  toggleMute: () => void;
  toggleDeafen: () => void;
}

const STAFF_ROLES = ["moderator", "head_of_moderation", "founder"];

const TeamRoomContext = createContext<TeamRoomContextValue | null>(null);

export function useTeamRoomCall(): TeamRoomContextValue {
  const context = useContext(TeamRoomContext);
  if (!context) {
    throw new Error("useTeamRoomCall must be used inside TeamRoomCallProvider");
  }
  return context;
}

/**
 * Owns the team room WebSocket and the voice call itself.
 *
 * The socket lives above the router so navigating away from the team room page
 * no longer closes it — the server drops a user from their call when their last
 * connection closes, so the call used to end on any page change. Everything here
 * survives route changes and only tears down on sign-out.
 */
export function TeamRoomCallProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const { toast } = useToast();
  const isStaff = !!user && STAFF_ROLES.includes(user.role);

  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [onlineUsers, setOnlineUsers] = useState<OnlineUser[]>([]);
  const [isConnected, setIsConnected] = useState(false);
  const [typingUsers, setTypingUsers] = useState<Set<string>>(new Set());
  const [inCall, setInCall] = useState(false);
  const [isMuted, setIsMuted] = useState(false);
  const [isDeafened, setIsDeafened] = useState(false);
  const [calls, setCalls] = useState<VoiceCall[]>([]);
  const [activeCallId, setActiveCallId] = useState<string | null>(null);

  const inCallRef = useRef(false);
  const isDeafenedRef = useRef(false);
  const myCallIdRef = useRef<string | null>(null);
  // Set while waiting for our own voice_call_start/join to appear in the
  // broadcast list, so a transient list without us doesn't kill the local call.
  const pendingJoinRef = useRef(false);
  const wsRef = useRef<WebSocket | null>(null);
  const localStreamRef = useRef<MediaStream | null>(null);
  const peersRef = useRef<Map<string, WebRTCPeer>>(new Map());
  const audioElementsRef = useRef<Map<string, HTMLAudioElement>>(new Map());
  const typingTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const reconnectTimerRef = useRef<NodeJS.Timeout | null>(null);
  const shouldReconnectRef = useRef(false);

  const { data: initialMessages = [], isLoading } = useQuery<ChatMessage[]>({
    queryKey: ["/api/team-room/messages"],
    enabled: isStaff,
  });

  useEffect(() => {
    if (initialMessages.length > 0) {
      setMessages((prev) => (prev.length > 0 ? prev : initialMessages));
    }
  }, [initialMessages]);

  function sendRaw(payload: Record<string, unknown>) {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify(payload));
    }
  }

  function cleanupPeer(userId: string) {
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
  }

  function createPeerConnection(targetUserId: string, targetUsername: string): RTCPeerConnection {
    const config: RTCConfiguration = {
      iceServers: [
        { urls: "stun:stun.l.google.com:19302" },
        { urls: "stun:stun1.l.google.com:19302" },
      ],
    };

    const pc = new RTCPeerConnection(config);

    pc.onicecandidate = (event) => {
      if (event.candidate) {
        sendRaw({
          type: "webrtc_signal",
          targetUserId,
          signalType: "ice-candidate",
          signal: event.candidate,
        });
      }
    };

    pc.ontrack = (event) => {
      const stream = event.streams[0];
      if (!stream) return;
      let audio = audioElementsRef.current.get(targetUserId);
      if (!audio) {
        audio = new Audio();
        audio.autoplay = true;
        audioElementsRef.current.set(targetUserId, audio);
      }
      audio.srcObject = stream;
      audio.muted = isDeafenedRef.current;
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
      connection: pc,
    });

    return pc;
  }

  function addLocalTracksTo(pc: RTCPeerConnection) {
    if (!localStreamRef.current) return;
    localStreamRef.current.getTracks().forEach((track) => {
      if (!pc.getSenders().some((sender) => sender.track === track)) {
        pc.addTrack(track, localStreamRef.current!);
      }
    });
  }

  async function handleWebRTCSignal(data: {
    fromUserId: string;
    fromUsername: string;
    signalType: string;
    signal: RTCSessionDescriptionInit | RTCIceCandidateInit;
  }) {
    try {
      const peer = peersRef.current.get(data.fromUserId);

      if (data.signalType === "offer") {
        if (!inCallRef.current) return;
        if (!peer) createPeerConnection(data.fromUserId, data.fromUsername);
        const pc = peersRef.current.get(data.fromUserId)!.connection;

        // Glare: both sides may send offers at once. Roll ours back so we can
        // accept theirs instead of throwing.
        if (pc.signalingState === "have-local-offer") {
          await pc.setLocalDescription({ type: "rollback" });
        }

        await pc.setRemoteDescription(new RTCSessionDescription(data.signal as RTCSessionDescriptionInit));
        addLocalTracksTo(pc);

        const answer = await pc.createAnswer();
        await pc.setLocalDescription(answer);

        sendRaw({
          type: "webrtc_signal",
          targetUserId: data.fromUserId,
          signalType: "answer",
          signal: answer,
        });
      } else if (data.signalType === "answer") {
        // Only accept an answer when we actually sent an offer.
        if (peer && peer.connection.signalingState === "have-remote-offer") {
          await peer.connection.setRemoteDescription(new RTCSessionDescription(data.signal as RTCSessionDescriptionInit));
        }
      } else if (data.signalType === "ice-candidate") {
        if (peer) {
          await peer.connection.addIceCandidate(new RTCIceCandidate(data.signal as RTCIceCandidateInit));
        }
      }
    } catch (error) {
      // Transient negotiation races must not crash the app.
      console.error("[TeamRoom] WebRTC signal error:", error);
    }
  }

  function stopLocalCall() {
    if (localStreamRef.current) {
      localStreamRef.current.getTracks().forEach((track) => track.stop());
      localStreamRef.current = null;
    }
    peersRef.current.forEach((peer) => peer.connection.close());
    peersRef.current.clear();
    audioElementsRef.current.forEach((audio) => {
      audio.srcObject = null;
    });
    audioElementsRef.current.clear();
    setIsMuted(false);
    setIsDeafened(false);
    isDeafenedRef.current = false;
  }

  function clearLocalCallState() {
    setInCall(false);
    inCallRef.current = false;
    pendingJoinRef.current = false;
    myCallIdRef.current = null;
    setActiveCallId(null);
  }

  async function startCall() {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
      localStreamRef.current = stream;
      setInCall(true);
      inCallRef.current = true;
      pendingJoinRef.current = true;
      sendRaw({ type: "voice_call_start" });
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
  }

  function endCall() {
    const callId = myCallIdRef.current;
    stopLocalCall();
    clearLocalCallState();
    if (callId) sendRaw({ type: "voice_call_leave", callId });
    toast({
      title: "Voice Call Ended",
      description: "You have left the voice call",
    });
  }

  async function joinCall(callId: string) {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
      localStreamRef.current = stream;
      setInCall(true);
      inCallRef.current = true;
      pendingJoinRef.current = true;
      sendRaw({ type: "voice_call_join", callId });
      toast({
        title: "Joined Voice Call",
        description: "You are now in the voice call",
      });
    } catch (error) {
      console.error("[TeamRoom] Failed to join call:", error);
      toast({
        title: "Microphone Access Required",
        description: "Please allow microphone access to join voice calls",
        variant: "destructive",
      });
    }
  }

  async function offerToUser(targetUserId: string, targetUsername: string) {
    if (!localStreamRef.current || peersRef.current.has(targetUserId)) return;
    if (wsRef.current?.readyState !== WebSocket.OPEN) return;
    try {
      const pc = createPeerConnection(targetUserId, targetUsername);
      addLocalTracksTo(pc);
      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);
      sendRaw({
        type: "webrtc_signal",
        targetUserId,
        signalType: "offer",
        signal: offer,
      });
    } catch (error) {
      console.error("[TeamRoom] Failed to offer to", targetUsername, error);
    }
  }

  // Server-authoritative reconciliation: keeps the local call state and WebRTC
  // peers in sync with the broadcast list of active calls.
  function reconcileCalls(nextCalls: VoiceCall[]) {
    const myId = user?.id ?? "";
    const myCall = nextCalls.find((call) => call.participants.some((p) => p.id === myId)) ?? null;
    myCallIdRef.current = myCall ? myCall.id : null;
    if (myCall) pendingJoinRef.current = false;

    if (!myCall) {
      if (inCallRef.current && !pendingJoinRef.current) {
        stopLocalCall();
        setInCall(false);
        inCallRef.current = false;
      }
      setActiveCallId(null);
      return;
    }

    setActiveCallId(myCall.id);
    if (!inCallRef.current) return;

    for (const participant of myCall.participants) {
      if (participant.id !== myId && !peersRef.current.has(participant.id)) {
        offerToUser(participant.id, participant.username);
      }
    }
  }

  function closeCall(callId: string) {
    sendRaw({ type: "voice_call_close", callId });
  }

  function toggleMute() {
    const nextMuted = !isMuted;
    localStreamRef.current?.getAudioTracks().forEach((track) => {
      track.enabled = !nextMuted;
    });
    setIsMuted(nextMuted);
  }

  function toggleDeafen() {
    const nextDeafened = !isDeafened;
    isDeafenedRef.current = nextDeafened;
    audioElementsRef.current.forEach((audio) => {
      audio.muted = nextDeafened;
    });
    setIsDeafened(nextDeafened);
  }

  function sendMessage(content: string) {
    if (!content.trim()) return;
    sendRaw({ type: "chat_message", content: content.trim() });
  }

  function sendTyping() {
    if (wsRef.current?.readyState !== WebSocket.OPEN) return;
    if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
    wsRef.current.send(JSON.stringify({ type: "typing" }));
    typingTimeoutRef.current = setTimeout(() => {
      typingTimeoutRef.current = null;
    }, 1000);
  }

  async function connectWebSocket() {
    if (!user || wsRef.current?.readyState === WebSocket.OPEN) return;

    try {
      const tokenResponse = await fetch("/api/team-room/ws-token", { credentials: "include" });
      if (!tokenResponse.ok) {
        console.error("[TeamRoom] Failed to get WebSocket token");
        return;
      }
      const { token } = await tokenResponse.json();

      const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
      const wsUrl = `${protocol}//${window.location.host}/ws/team-room?token=${token}`;

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
            setOnlineUsers((prev) => (prev.find((u) => u.id === data.user.id) ? prev : [...prev, data.user]));
            break;
          case "user_left":
            setOnlineUsers((prev) => prev.filter((u) => u.id !== data.user.id));
            cleanupPeer(data.user.id);
            break;
          case "chat_message":
            setMessages((prev) => [...prev, data.message]);
            setTypingUsers((prev) => {
              const next = new Set(prev);
              next.delete(data.message.sender?.username || "");
              return next;
            });
            break;
          case "typing":
            setTypingUsers((prev) => {
              const next = new Set(prev);
              next.add(data.user.username);
              setTimeout(() => {
                setTypingUsers((curr) => {
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
            break;
          case "voice_calls_list":
            setCalls(data.calls ?? []);
            reconcileCalls(data.calls ?? []);
            break;
          case "voice_call_user_joined":
            if (data.user.id !== user.id && inCallRef.current && data.callId === myCallIdRef.current) {
              offerToUser(data.user.id, data.user.username);
            }
            break;
          case "voice_call_user_left":
            cleanupPeer(data.user.id);
            break;
          case "voice_call_ended":
            if (data.callId === myCallIdRef.current && inCallRef.current) {
              stopLocalCall();
              clearLocalCallState();
            }
            if (data.closedBy) {
              toast({
                title: "Voice Call Closed",
                description: `${data.closedBy.username} closed the voice call`,
              });
            }
            break;
          case "webrtc_signal":
            handleWebRTCSignal(data);
            break;
          case "error":
            toast({ title: "Error", description: data.message, variant: "destructive" });
            break;
        }
      };

      ws.onclose = () => {
        setIsConnected(false);
        wsRef.current = null;
        console.log("[TeamRoom] Disconnected from WebSocket");
        if (shouldReconnectRef.current) {
          reconnectTimerRef.current = setTimeout(() => connectWebSocket(), 3000);
        }
      };

      ws.onerror = (error) => {
        console.error("[TeamRoom] WebSocket error:", error);
      };
    } catch (error) {
      console.error("[TeamRoom] Connection error:", error);
    }
  }

  useEffect(() => {
    if (!isStaff) {
      setMessages([]);
      setOnlineUsers([]);
      setCalls([]);
      setTypingUsers(new Set());
      setInCall(false);
      inCallRef.current = false;
      return;
    }

    shouldReconnectRef.current = true;
    connectWebSocket();

    return () => {
      // Only runs on sign-out or a change of account, never on navigation.
      shouldReconnectRef.current = false;
      if (reconnectTimerRef.current) clearTimeout(reconnectTimerRef.current);
      if (wsRef.current) {
        wsRef.current.close();
        wsRef.current = null;
      }
      stopLocalCall();
      clearLocalCallState();
      setIsConnected(false);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isStaff, user?.id]);

  const value: TeamRoomContextValue = {
    isConnected,
    isLoading,
    messages,
    onlineUsers,
    typingUsers,
    calls,
    inCall,
    isMuted,
    isDeafened,
    activeCallId,
    sendMessage,
    sendTyping,
    startCall,
    joinCall,
    endCall,
    closeCall,
    toggleMute,
    toggleDeafen,
  };

  return <TeamRoomContext.Provider value={value}>{children}</TeamRoomContext.Provider>;
}
