import { useState, useRef, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useRoute, useLocation } from "wouter";
import { useAuth } from "@/lib/auth-context";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogDescription,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import {
  MessageSquare,
  Send,
  Plus,
  Search,
  User,
  Users,
  MoreVertical,
  UserPlus,
  UserMinus,
  LogOut,
  Pencil,
} from "lucide-react";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { format } from "date-fns";
import { toZonedTime } from "date-fns-tz";

interface UserInfo {
  id: string;
  userId: number;
  username: string;
  avatar: string | null;
  role: string;
}

interface DirectMessage {
  id: string;
  senderId: string;
  receiverId: string;
  message: string;
  read: boolean;
  createdAt: string;
  sender?: UserInfo;
}

interface Conversation {
  partnerId: string;
  lastMessage: DirectMessage;
  unreadCount: number;
  partner: UserInfo | null;
}

interface GroupChatMemberInfo {
  id: string;
  username: string;
  avatar: string | null;
  role?: string;
}

interface GroupChat {
  id: string;
  name: string;
  creatorId: string;
  createdAt: string;
  members: GroupChatMemberInfo[];
  lastMessage?: { message: string; createdAt: string } | null;
}

interface GroupChatMessage {
  id: string;
  groupId: string;
  senderId: string;
  message: string;
  isSystemMessage?: boolean;
  createdAt: string;
  senderUsername: string | null;
  senderAvatar: string | null;
}

function formatDateET(date: Date | string) {
  const d = typeof date === "string" ? new Date(date) : date;
  const et = toZonedTime(d, "America/New_York");
  return format(et, "MMM d, h:mm a") + " ET";
}

type ActiveChat =
  | { type: "dm"; partnerId: string }
  | { type: "group"; groupId: string };

export default function MessagesPage() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [, navigate] = useLocation();
  const [, params] = useRoute("/messages/:userId");
  const urlUserId = params?.userId;

  const [activeChat, setActiveChat] = useState<ActiveChat | null>(
    urlUserId ? { type: "dm", partnerId: urlUserId } : null
  );
  const [newMessage, setNewMessage] = useState("");

  // Compose DM dialog
  const [composeOpen, setComposeOpen] = useState(false);
  const [searchUserId, setSearchUserId] = useState("");
  const [foundUser, setFoundUser] = useState<UserInfo | null>(null);
  const [searchError, setSearchError] = useState("");

  // Create group chat dialog
  const [createGroupOpen, setCreateGroupOpen] = useState(false);
  const [groupName, setGroupName] = useState("");
  const [groupMemberIdInput, setGroupMemberIdInput] = useState("");
  const [groupMemberIdError, setGroupMemberIdError] = useState("");
  const [pendingGroupMembers, setPendingGroupMembers] = useState<UserInfo[]>([]);

  // Manage group (add/kick/rename)
  const [manageGroupOpen, setManageGroupOpen] = useState(false);
  const [addMemberInput, setAddMemberInput] = useState("");
  const [addMemberError, setAddMemberError] = useState("");
  const [renameGroupName, setRenameGroupName] = useState("");

  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (urlUserId) {
      setActiveChat({ type: "dm", partnerId: urlUserId });
    }
  }, [urlUserId]);

  // ────────── Queries ──────────

  const { data: conversations = [], isLoading: conversationsLoading } = useQuery<Conversation[]>({
    queryKey: ["/api/messages/conversations"],
  });

  const { data: groupChats = [], isLoading: groupChatsLoading } = useQuery<GroupChat[]>({
    queryKey: ["/api/group-chats"],
  });

  const dmPartnerId = activeChat?.type === "dm" ? activeChat.partnerId : null;
  const groupId = activeChat?.type === "group" ? activeChat.groupId : null;

  const { data: dmMessages = [], isLoading: dmLoading } = useQuery<DirectMessage[]>({
    queryKey: ["/api/messages", dmPartnerId],
    enabled: !!dmPartnerId,
    refetchInterval: 3000,
  });

  const { data: groupMessages = [], isLoading: groupMessagesLoading } = useQuery<GroupChatMessage[]>({
    queryKey: ["/api/group-chats", groupId, "messages"],
    queryFn: async () => {
      if (!groupId) return [];
      const res = await fetch(`/api/group-chats/${groupId}/messages`, { credentials: "include" });
      if (!res.ok) return [];
      return res.json();
    },
    enabled: !!groupId,
    refetchInterval: 3000,
  });

  const { data: activeGroupDetails } = useQuery<GroupChat & { members: GroupChatMemberInfo[] }>({
    queryKey: ["/api/group-chats", groupId, "details"],
    queryFn: async () => {
      if (!groupId) return null;
      const res = await fetch(`/api/group-chats/${groupId}`, { credentials: "include" });
      if (!res.ok) return null;
      return res.json();
    },
    enabled: !!groupId,
  });

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [dmMessages, groupMessages]);

  // ────────── Mutations ──────────

  const sendDMMutation = useMutation({
    mutationFn: async ({ receiverId, message }: { receiverId: string; message: string }) => {
      const res = await apiRequest("POST", `/api/messages/${receiverId}`, { message });
      return res.json();
    },
    onSuccess: () => {
      setNewMessage("");
      queryClient.invalidateQueries({ queryKey: ["/api/messages", dmPartnerId] });
      queryClient.invalidateQueries({ queryKey: ["/api/messages/conversations"] });
    },
    onError: (error: any) => {
      toast({
        title: "Failed to send message",
        description: error?.message || "Please try again",
        variant: "destructive",
      });
    },
  });

  const sendGroupMessageMutation = useMutation({
    mutationFn: async ({ groupId, message }: { groupId: string; message: string }) => {
      const res = await apiRequest("POST", `/api/group-chats/${groupId}/messages`, { message });
      return res.json();
    },
    onSuccess: () => {
      setNewMessage("");
      queryClient.invalidateQueries({ queryKey: ["/api/group-chats", groupId, "messages"] });
      queryClient.invalidateQueries({ queryKey: ["/api/group-chats"] });
    },
    onError: (error: any) => {
      toast({
        title: "Failed to send message",
        description: error?.message || "Please try again",
        variant: "destructive",
      });
    },
  });

  const searchUserMutation = useMutation({
    mutationFn: async (userId: string) => {
      const res = await fetch(`/api/users/find?userId=${userId}`, { credentials: "include" });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "User not found");
      }
      return res.json();
    },
    onSuccess: (data) => {
      setFoundUser(data);
      setSearchError("");
    },
    onError: (error: any) => {
      setFoundUser(null);
      setSearchError(error?.message || "User not found");
    },
  });

  const searchGroupMemberMutation = useMutation({
    mutationFn: async (userId: string) => {
      const res = await fetch(`/api/users/find?userId=${userId}`, { credentials: "include" });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "User not found");
      }
      return res.json();
    },
    onSuccess: (data: UserInfo) => {
      setGroupMemberIdError("");
      if (pendingGroupMembers.find(m => m.id === data.id)) {
        setGroupMemberIdError("User already added");
        return;
      }
      if (data.id === user?.id) {
        setGroupMemberIdError("You are already included as the creator");
        return;
      }
      setPendingGroupMembers(prev => [...prev, data]);
      setGroupMemberIdInput("");
    },
    onError: (error: any) => {
      setGroupMemberIdError(error?.message || "User not found");
    },
  });

  const createGroupMutation = useMutation({
    mutationFn: async ({ name, memberIds }: { name: string; memberIds: string[] }) => {
      const res = await apiRequest("POST", "/api/group-chats", { name, memberIds });
      return res.json();
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["/api/group-chats"] });
      setCreateGroupOpen(false);
      setGroupName("");
      setPendingGroupMembers([]);
      setGroupMemberIdInput("");
      setActiveChat({ type: "group", groupId: data.id });
    },
    onError: () => {
      toast({ title: "Failed to create group chat", variant: "destructive" });
    },
  });

  const addMemberMutation = useMutation({
    mutationFn: async ({ groupId, userId }: { groupId: string; userId: string }) => {
      const res = await apiRequest("POST", `/api/group-chats/${groupId}/members`, { userId });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/group-chats", groupId, "details"] });
      queryClient.invalidateQueries({ queryKey: ["/api/group-chats"] });
      setAddMemberInput("");
      setAddMemberError("");
      toast({ title: "Member added" });
    },
    onError: (error: any) => {
      setAddMemberError(error?.message || "Failed to add member");
    },
  });

  const removeMemberMutation = useMutation({
    mutationFn: async ({ groupId, userId }: { groupId: string; userId: string }) => {
      const res = await apiRequest("DELETE", `/api/group-chats/${groupId}/members/${userId}`, {});
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/group-chats", groupId, "details"] });
      queryClient.invalidateQueries({ queryKey: ["/api/group-chats"] });
      toast({ title: "Member removed" });
    },
    onError: () => {
      toast({ title: "Failed to remove member", variant: "destructive" });
    },
  });

  const leaveGroupMutation = useMutation({
    mutationFn: async (groupId: string) => {
      const res = await apiRequest("DELETE", `/api/group-chats/${groupId}/leave`, {});
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/group-chats"] });
      setActiveChat(null);
      toast({ title: "Left group chat" });
    },
    onError: () => {
      toast({ title: "Failed to leave group", variant: "destructive" });
    },
  });

  const renameGroupMutation = useMutation({
    mutationFn: async ({ groupId, name }: { groupId: string; name: string }) => {
      const res = await apiRequest("PATCH", `/api/group-chats/${groupId}`, { name });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/group-chats", groupId, "details"] });
      queryClient.invalidateQueries({ queryKey: ["/api/group-chats"] });
      setRenameGroupName("");
      toast({ title: "Group renamed" });
    },
    onError: () => {
      toast({ title: "Failed to rename group", variant: "destructive" });
    },
  });

  // ────────── Handlers ──────────

  const handleSearch = () => {
    if (!searchUserId) {
      setSearchError("Please enter a User ID");
      return;
    }
    searchUserMutation.mutate(searchUserId);
  };

  const handleStartDM = () => {
    if (foundUser) {
      setActiveChat({ type: "dm", partnerId: foundUser.id });
      setComposeOpen(false);
      setFoundUser(null);
      setSearchUserId("");
      queryClient.invalidateQueries({ queryKey: ["/api/messages/conversations"] });
    }
  };

  const handleSendMessage = () => {
    if (!newMessage.trim()) return;
    if (activeChat?.type === "dm" && activeChat.partnerId) {
      sendDMMutation.mutate({ receiverId: activeChat.partnerId, message: newMessage.trim() });
    } else if (activeChat?.type === "group" && activeChat.groupId) {
      sendGroupMessageMutation.mutate({ groupId: activeChat.groupId, message: newMessage.trim() });
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSendMessage();
    }
  };

  const handleCreateGroup = () => {
    if (!groupName.trim()) {
      toast({ title: "Please enter a group name", variant: "destructive" });
      return;
    }
    if (pendingGroupMembers.length === 0) {
      toast({ title: "Please add at least one member", variant: "destructive" });
      return;
    }
    createGroupMutation.mutate({
      name: groupName.trim(),
      memberIds: pendingGroupMembers.map(m => m.id),
    });
  };

  const handleAddGroupMember = () => {
    if (!addMemberInput.trim()) return;
    if (!groupId) return;
    // Try to find user first
    fetch(`/api/users/find?userId=${addMemberInput.trim()}`, { credentials: "include" })
      .then(res => res.json())
      .then(data => {
        if (data.error) { setAddMemberError(data.error); return; }
        addMemberMutation.mutate({ groupId, userId: data.id });
      })
      .catch(() => setAddMemberError("User not found"));
  };

  const selectedPartner = conversations.find(
    c => activeChat?.type === "dm" && c.partnerId === activeChat.partnerId
  )?.partner;

  const activeGroup = groupChats.find(
    g => activeChat?.type === "group" && g.id === activeChat.groupId
  );

  if (!user) return null;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div>
          <h2 className="text-3xl font-bold tracking-tight">Messages</h2>
          <p className="text-muted-foreground">Direct messages and group chats</p>
        </div>
        <div className="flex gap-2">
          {/* New DM */}
          <Dialog open={composeOpen} onOpenChange={setComposeOpen}>
            <DialogTrigger asChild>
              <Button data-testid="button-new-message">
                <Plus className="w-4 h-4 mr-2" />
                New Message
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Start New Conversation</DialogTitle>
                <DialogDescription>Find a user by their numeric User ID.</DialogDescription>
              </DialogHeader>
              <div className="space-y-4 py-4">
                <div className="space-y-2">
                  <Label htmlFor="userId">Recipient's User ID</Label>
                  <Input
                    id="userId"
                    type="number"
                    placeholder="Enter User ID (e.g., 1, 2, 3...)"
                    value={searchUserId}
                    onChange={(e) => setSearchUserId(e.target.value)}
                    data-testid="input-user-id"
                  />
                </div>
                <p className="text-xs text-muted-foreground">
                  User IDs are shown on profile pages.
                </p>
                <Button
                  onClick={handleSearch}
                  disabled={searchUserMutation.isPending}
                  className="w-full"
                  data-testid="button-search-user"
                >
                  <Search className="w-4 h-4 mr-2" />
                  {searchUserMutation.isPending ? "Searching..." : "Find User"}
                </Button>
                {searchError && (
                  <p className="text-sm text-destructive" data-testid="text-search-error">
                    {searchError}
                  </p>
                )}
                {foundUser && (
                  <Card className="mt-4">
                    <CardContent className="p-4">
                      <div className="flex items-center gap-3">
                        <Avatar>
                          <AvatarImage src={foundUser.avatar || undefined} />
                          <AvatarFallback>{foundUser.username.slice(0, 2).toUpperCase()}</AvatarFallback>
                        </Avatar>
                        <div className="flex-1">
                          <p className="font-medium" data-testid="text-found-username">{foundUser.username}</p>
                          <div className="flex items-center gap-2">
                            <span className="text-sm text-muted-foreground">ID: {foundUser.userId}</span>
                            <Badge variant="secondary" className="text-xs">{foundUser.role}</Badge>
                          </div>
                        </div>
                      </div>
                      <Button onClick={handleStartDM} className="w-full mt-3" data-testid="button-start-conversation">
                        <MessageSquare className="w-4 h-4 mr-2" />
                        Start Conversation
                      </Button>
                    </CardContent>
                  </Card>
                )}
              </div>
            </DialogContent>
          </Dialog>

          {/* New Group Chat */}
          <Dialog open={createGroupOpen} onOpenChange={setCreateGroupOpen}>
            <DialogTrigger asChild>
              <Button variant="outline" data-testid="button-new-group">
                <Users className="w-4 h-4 mr-2" />
                New Group
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Create Group Chat</DialogTitle>
                <DialogDescription>Give your group a name and add members.</DialogDescription>
              </DialogHeader>
              <div className="space-y-4 py-4">
                <div className="space-y-2">
                  <Label>Group Name</Label>
                  <Input
                    placeholder="e.g. Project Alpha Team"
                    value={groupName}
                    onChange={(e) => setGroupName(e.target.value)}
                    data-testid="input-group-name"
                  />
                </div>
                <div className="space-y-2">
                  <Label>Add Members by User ID</Label>
                  <div className="flex gap-2">
                    <Input
                      type="number"
                      placeholder="Enter User ID"
                      value={groupMemberIdInput}
                      onChange={(e) => setGroupMemberIdInput(e.target.value)}
                      data-testid="input-group-member-id"
                    />
                    <Button
                      size="default"
                      variant="outline"
                      onClick={() => {
                        if (groupMemberIdInput.trim()) searchGroupMemberMutation.mutate(groupMemberIdInput.trim());
                      }}
                      disabled={searchGroupMemberMutation.isPending}
                      data-testid="button-add-group-member"
                    >
                      <UserPlus className="w-4 h-4" />
                    </Button>
                  </div>
                  {groupMemberIdError && (
                    <p className="text-sm text-destructive">{groupMemberIdError}</p>
                  )}
                </div>
                {pendingGroupMembers.length > 0 && (
                  <div className="space-y-2">
                    <p className="text-sm font-medium">Members to add:</p>
                    {pendingGroupMembers.map((m) => (
                      <div key={m.id} className="flex items-center justify-between py-1">
                        <div className="flex items-center gap-2">
                          <Avatar className="h-7 w-7">
                            <AvatarImage src={m.avatar || undefined} />
                            <AvatarFallback>{m.username.slice(0, 2).toUpperCase()}</AvatarFallback>
                          </Avatar>
                          <span className="text-sm">{m.username}</span>
                        </div>
                        <Button
                          size="icon"
                          variant="ghost"
                          onClick={() => setPendingGroupMembers(prev => prev.filter(x => x.id !== m.id))}
                        >
                          <UserMinus className="w-4 h-4" />
                        </Button>
                      </div>
                    ))}
                  </div>
                )}
                <Button
                  onClick={handleCreateGroup}
                  disabled={createGroupMutation.isPending || !groupName.trim() || pendingGroupMembers.length === 0}
                  className="w-full"
                  data-testid="button-create-group"
                >
                  {createGroupMutation.isPending ? "Creating..." : "Create Group Chat"}
                </Button>
              </div>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      <div className="grid gap-6 md:grid-cols-3 h-[calc(100vh-220px)]">
        {/* ── Left panel: conversations + groups ── */}
        <Card className="md:col-span-1 flex flex-col overflow-hidden">
          <CardHeader className="pb-3 shrink-0">
            <CardTitle className="text-lg">Conversations</CardTitle>
          </CardHeader>
          <CardContent className="p-0 flex-1 overflow-hidden">
            <ScrollArea className="h-full">
              {/* Direct Messages */}
              <div className="px-3 py-1">
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide px-1 mb-1">
                  Direct Messages
                </p>
              </div>
              {conversationsLoading ? (
                <div className="p-4 text-center text-muted-foreground text-sm">Loading...</div>
              ) : conversations.length === 0 ? (
                <div className="p-4 text-center text-muted-foreground text-sm">
                  <User className="w-6 h-6 mx-auto mb-1 opacity-50" />
                  No DMs yet
                </div>
              ) : (
                conversations.map((conv) => (
                  <button
                    key={conv.partnerId}
                    onClick={() => setActiveChat({ type: "dm", partnerId: conv.partnerId })}
                    className={`w-full p-3 flex items-center gap-3 hover-elevate text-left border-b ${
                      activeChat?.type === "dm" && activeChat.partnerId === conv.partnerId
                        ? "bg-accent"
                        : ""
                    }`}
                    data-testid={`button-conversation-${conv.partnerId}`}
                  >
                    <Avatar className="shrink-0">
                      <AvatarImage src={conv.partner?.avatar || undefined} />
                      <AvatarFallback>
                        {conv.partner?.username?.slice(0, 2).toUpperCase() || "??"}
                      </AvatarFallback>
                    </Avatar>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between gap-2">
                        <p className="font-medium truncate">
                          {conv.partner?.username || "Unknown User"}
                        </p>
                        {conv.unreadCount > 0 && (
                          <Badge variant="default" className="text-xs shrink-0">
                            {conv.unreadCount}
                          </Badge>
                        )}
                      </div>
                      <p className="text-xs text-muted-foreground truncate">
                        {conv.lastMessage.message}
                      </p>
                    </div>
                  </button>
                ))
              )}

              {/* Group Chats */}
              <div className="px-3 py-2 mt-1">
                <Separator className="mb-2" />
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide px-1 mb-1">
                  Group Chats
                </p>
              </div>
              {groupChatsLoading ? (
                <div className="p-4 text-center text-muted-foreground text-sm">Loading...</div>
              ) : groupChats.length === 0 ? (
                <div className="p-4 text-center text-muted-foreground text-sm">
                  <Users className="w-6 h-6 mx-auto mb-1 opacity-50" />
                  No group chats yet
                </div>
              ) : (
                groupChats.map((group) => (
                  <button
                    key={group.id}
                    onClick={() => setActiveChat({ type: "group", groupId: group.id })}
                    className={`w-full p-3 flex items-center gap-3 hover-elevate text-left border-b ${
                      activeChat?.type === "group" && activeChat.groupId === group.id
                        ? "bg-accent"
                        : ""
                    }`}
                    data-testid={`button-group-${group.id}`}
                  >
                    <div className="h-9 w-9 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                      <Users className="w-5 h-5 text-primary" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="font-medium truncate">{group.name}</p>
                      <p className="text-xs text-muted-foreground truncate">
                        {group.members.length} member{group.members.length !== 1 ? "s" : ""}
                        {group.lastMessage ? ` · ${group.lastMessage.message.slice(0, 30)}` : ""}
                      </p>
                    </div>
                  </button>
                ))
              )}
            </ScrollArea>
          </CardContent>
        </Card>

        {/* ── Right panel: chat area ── */}
        <Card className="md:col-span-2 flex flex-col overflow-hidden">
          {activeChat === null ? (
            <div className="flex-1 flex items-center justify-center text-muted-foreground">
              <div className="text-center">
                <MessageSquare className="w-12 h-12 mx-auto mb-4 opacity-50" />
                <p>Select a conversation or start a new one</p>
              </div>
            </div>
          ) : activeChat.type === "dm" ? (
            <>
              {/* DM Header */}
              <CardHeader className="pb-3 border-b shrink-0">
                <div className="flex items-center gap-3">
                  <button
                    onClick={() => selectedPartner && navigate(`/user/${activeChat.partnerId}`)}
                    className="cursor-pointer"
                    data-testid="button-partner-avatar"
                  >
                    <Avatar>
                      <AvatarImage src={selectedPartner?.avatar || undefined} />
                      <AvatarFallback>
                        {selectedPartner?.username?.slice(0, 2).toUpperCase() || "??"}
                      </AvatarFallback>
                    </Avatar>
                  </button>
                  <div>
                    <button
                      onClick={() => selectedPartner && navigate(`/user/${activeChat.partnerId}`)}
                      className="font-semibold text-base hover:underline cursor-pointer text-left"
                      data-testid="link-partner-username"
                    >
                      {selectedPartner?.username || "Unknown User"}
                    </button>
                    <div className="flex items-center gap-2">
                      <span className="text-sm text-muted-foreground">
                        ID: {selectedPartner?.userId}
                      </span>
                      {selectedPartner?.role && (
                        <Badge variant="secondary" className="text-xs">
                          {selectedPartner.role}
                        </Badge>
                      )}
                    </div>
                  </div>
                </div>
              </CardHeader>

              {/* DM Messages */}
              <ScrollArea className="flex-1 p-4">
                {dmLoading ? (
                  <div className="text-center text-muted-foreground">Loading messages...</div>
                ) : dmMessages.length === 0 ? (
                  <div className="text-center text-muted-foreground">
                    <MessageSquare className="w-8 h-8 mx-auto mb-2 opacity-50" />
                    <p>No messages yet</p>
                    <p className="text-sm">Send the first message!</p>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {dmMessages.map((msg) => {
                      const isMe = msg.senderId === user.id;
                      const senderInfo = isMe ? user : msg.sender;
                      return (
                        <div
                          key={msg.id}
                          className={`flex gap-3 ${isMe ? "flex-row-reverse" : "flex-row"}`}
                          data-testid={`message-${msg.id}`}
                        >
                          <button
                            onClick={() => navigate(`/user/${msg.senderId}`)}
                            className="shrink-0 mt-1"
                            data-testid={`avatar-${msg.senderId}`}
                          >
                            <Avatar className="h-8 w-8">
                              <AvatarImage src={senderInfo?.avatar || undefined} />
                              <AvatarFallback>
                                {(senderInfo?.username || "?").slice(0, 2).toUpperCase()}
                              </AvatarFallback>
                            </Avatar>
                          </button>
                          <div className={`max-w-[65%] space-y-1 ${isMe ? "items-end" : "items-start"} flex flex-col`}>
                            <div className={`flex items-center gap-2 ${isMe ? "flex-row-reverse" : "flex-row"}`}>
                              <button
                                onClick={() => navigate(`/user/${msg.senderId}`)}
                                className="text-xs font-medium hover:underline"
                                data-testid={`username-${msg.id}`}
                              >
                                {senderInfo?.username || "Unknown"}
                              </button>
                              <span className="text-xs text-muted-foreground">
                                {formatDateET(msg.createdAt)}
                              </span>
                            </div>
                            <div
                              className={`rounded-lg px-3 py-2 ${
                                isMe
                                  ? "bg-primary text-primary-foreground"
                                  : "bg-muted"
                              }`}
                            >
                              <p className="text-sm break-words">{msg.message}</p>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                    <div ref={messagesEndRef} />
                  </div>
                )}
              </ScrollArea>

              {/* DM Input */}
              <div className="p-4 border-t shrink-0">
                <div className="flex gap-2">
                  <Textarea
                    placeholder="Type a message..."
                    value={newMessage}
                    onChange={(e) => setNewMessage(e.target.value)}
                    onKeyDown={handleKeyDown}
                    className="min-h-[60px] resize-none"
                    data-testid="textarea-message"
                  />
                  <Button
                    onClick={handleSendMessage}
                    disabled={!newMessage.trim() || sendDMMutation.isPending}
                    size="icon"
                    className="h-auto"
                    data-testid="button-send-message"
                  >
                    <Send className="w-5 h-5" />
                  </Button>
                </div>
              </div>
            </>
          ) : (
            <>
              {/* Group Header */}
              <CardHeader className="pb-3 border-b shrink-0">
                <div className="flex items-center justify-between gap-2 flex-wrap">
                  <div className="flex items-center gap-3">
                    <div className="h-9 w-9 rounded-full bg-primary/10 flex items-center justify-center">
                      <Users className="w-5 h-5 text-primary" />
                    </div>
                    <div>
                      <p className="font-semibold text-base">
                        {activeGroup?.name || activeGroupDetails?.name || "Group Chat"}
                      </p>
                      <p className="text-sm text-muted-foreground">
                        {(activeGroupDetails?.members || activeGroup?.members || []).length} members
                      </p>
                    </div>
                  </div>

                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button size="icon" variant="ghost" data-testid="button-group-options">
                        <MoreVertical className="w-4 h-4" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem onClick={() => setManageGroupOpen(true)} data-testid="button-manage-group">
                        <Pencil className="w-4 h-4 mr-2" />
                        Manage Group
                      </DropdownMenuItem>
                      <DropdownMenuSeparator />
                      <DropdownMenuItem
                        className="text-destructive"
                        onClick={() => activeChat.type === "group" && leaveGroupMutation.mutate(activeChat.groupId)}
                        data-testid="button-leave-group"
                      >
                        <LogOut className="w-4 h-4 mr-2" />
                        Leave Group
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
              </CardHeader>

              {/* Group Messages */}
              <ScrollArea className="flex-1 p-4">
                {groupMessagesLoading ? (
                  <div className="text-center text-muted-foreground">Loading messages...</div>
                ) : groupMessages.length === 0 ? (
                  <div className="text-center text-muted-foreground">
                    <MessageSquare className="w-8 h-8 mx-auto mb-2 opacity-50" />
                    <p>No messages yet</p>
                    <p className="text-sm">Start the conversation!</p>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {groupMessages.map((msg) => {
                      if (msg.isSystemMessage) {
                        return (
                          <div
                            key={msg.id}
                            className="flex justify-center"
                            data-testid={`group-system-msg-${msg.id}`}
                          >
                            <span className="text-xs text-muted-foreground bg-muted rounded-full px-3 py-1">
                              {msg.message}
                            </span>
                          </div>
                        );
                      }
                      const isMe = msg.senderId === user.id;
                      return (
                        <div
                          key={msg.id}
                          className={`flex gap-3 ${isMe ? "flex-row-reverse" : "flex-row"}`}
                          data-testid={`group-message-${msg.id}`}
                        >
                          <button
                            onClick={() => navigate(`/user/${msg.senderId}`)}
                            className="shrink-0 mt-1"
                            data-testid={`avatar-sender-${msg.senderId}`}
                          >
                            <Avatar className="h-8 w-8">
                              <AvatarImage src={msg.senderAvatar || undefined} />
                              <AvatarFallback>
                                {(msg.senderUsername || "?").slice(0, 2).toUpperCase()}
                              </AvatarFallback>
                            </Avatar>
                          </button>
                          <div className={`max-w-[65%] space-y-1 ${isMe ? "items-end" : "items-start"} flex flex-col`}>
                            <div className={`flex items-center gap-2 ${isMe ? "flex-row-reverse" : "flex-row"}`}>
                              <button
                                onClick={() => navigate(`/user/${msg.senderId}`)}
                                className="text-xs font-medium hover:underline"
                              >
                                {msg.senderUsername || "Unknown"}
                              </button>
                              <span className="text-xs text-muted-foreground">
                                {formatDateET(msg.createdAt)}
                              </span>
                            </div>
                            <div
                              className={`rounded-lg px-3 py-2 ${
                                isMe ? "bg-primary text-primary-foreground" : "bg-muted"
                              }`}
                            >
                              <p className="text-sm break-words">{msg.message}</p>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                    <div ref={messagesEndRef} />
                  </div>
                )}
              </ScrollArea>

              {/* Group Input */}
              <div className="p-4 border-t shrink-0">
                <div className="flex gap-2">
                  <Textarea
                    placeholder="Type a message..."
                    value={newMessage}
                    onChange={(e) => setNewMessage(e.target.value)}
                    onKeyDown={handleKeyDown}
                    className="min-h-[60px] resize-none"
                    data-testid="textarea-group-message"
                  />
                  <Button
                    onClick={handleSendMessage}
                    disabled={!newMessage.trim() || sendGroupMessageMutation.isPending}
                    size="icon"
                    className="h-auto"
                    data-testid="button-send-group-message"
                  >
                    <Send className="w-5 h-5" />
                  </Button>
                </div>
              </div>
            </>
          )}
        </Card>
      </div>

      {/* ── Manage Group Dialog ── */}
      <Dialog open={manageGroupOpen} onOpenChange={setManageGroupOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Manage Group</DialogTitle>
          </DialogHeader>
          <div className="space-y-5 py-2">
            {/* Rename – creator only */}
            {activeGroupDetails?.creatorId === user.id && (
              <div className="space-y-2">
                <p className="text-sm font-medium">Rename Group</p>
                <div className="flex gap-2">
                  <Input
                    placeholder={activeGroupDetails?.name || "New name..."}
                    value={renameGroupName}
                    onChange={(e) => setRenameGroupName(e.target.value)}
                    data-testid="input-rename-group"
                  />
                  <Button
                    variant="outline"
                    onClick={() => groupId && renameGroupMutation.mutate({ groupId, name: renameGroupName })}
                    disabled={!renameGroupName.trim() || renameGroupMutation.isPending}
                    data-testid="button-rename-group"
                  >
                    Save
                  </Button>
                </div>
              </div>
            )}

            {/* Members list */}
            <div className="space-y-2">
              <p className="text-sm font-medium">Members</p>
              <div className="space-y-2">
                {(activeGroupDetails?.members || []).map((m) => (
                  <div key={m.id} className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <button onClick={() => navigate(`/user/${m.id}`)}>
                        <Avatar className="h-7 w-7">
                          <AvatarImage src={m.avatar || undefined} />
                          <AvatarFallback>{m.username.slice(0, 2).toUpperCase()}</AvatarFallback>
                        </Avatar>
                      </button>
                      <button onClick={() => navigate(`/user/${m.id}`)} className="text-sm hover:underline">
                        {m.username}
                      </button>
                      {m.id === activeGroupDetails?.creatorId && (
                        <Badge variant="secondary" className="text-xs">Creator</Badge>
                      )}
                    </div>
                    {activeGroupDetails?.creatorId === user.id && m.id !== user.id && (
                      <Button
                        size="icon"
                        variant="ghost"
                        onClick={() => groupId && removeMemberMutation.mutate({ groupId, userId: m.id })}
                        disabled={removeMemberMutation.isPending}
                        data-testid={`button-kick-${m.id}`}
                      >
                        <UserMinus className="w-4 h-4" />
                      </Button>
                    )}
                  </div>
                ))}
              </div>
            </div>

            {/* Add member – creator only */}
            {activeGroupDetails?.creatorId === user.id && (
              <div className="space-y-2">
                <p className="text-sm font-medium">Add Member</p>
                <div className="flex gap-2">
                  <Input
                    type="number"
                    placeholder="Enter User ID"
                    value={addMemberInput}
                    onChange={(e) => setAddMemberInput(e.target.value)}
                    data-testid="input-add-member"
                  />
                  <Button
                    variant="outline"
                    onClick={handleAddGroupMember}
                    disabled={addMemberMutation.isPending}
                    data-testid="button-add-member"
                  >
                    <UserPlus className="w-4 h-4" />
                  </Button>
                </div>
                {addMemberError && <p className="text-sm text-destructive">{addMemberError}</p>}
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
