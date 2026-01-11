import { useState, useRef, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useAuth } from "@/lib/auth-context";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { MessageSquare, Send, Plus, Search, User } from "lucide-react";
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

function formatDateET(date: Date | string) {
  const d = typeof date === "string" ? new Date(date) : date;
  const et = toZonedTime(d, "America/New_York");
  return format(et, "MMM d, h:mm a") + " ET";
}

export default function MessagesPage() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [selectedConversation, setSelectedConversation] = useState<string | null>(null);
  const [newMessage, setNewMessage] = useState("");
  const [composeOpen, setComposeOpen] = useState(false);
  const [searchUserId, setSearchUserId] = useState("");
  const [foundUser, setFoundUser] = useState<UserInfo | null>(null);
  const [searchError, setSearchError] = useState("");
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const { data: conversations = [], isLoading: conversationsLoading } = useQuery<Conversation[]>({
    queryKey: ["/api/messages/conversations"],
  });

  const { data: messages = [], isLoading: messagesLoading } = useQuery<DirectMessage[]>({
    queryKey: ["/api/messages", selectedConversation],
    enabled: !!selectedConversation,
  });

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const sendMessageMutation = useMutation({
    mutationFn: async ({ receiverId, message }: { receiverId: string; message: string }) => {
      const res = await apiRequest("POST", `/api/messages/${receiverId}`, { message });
      return res.json();
    },
    onSuccess: () => {
      setNewMessage("");
      queryClient.invalidateQueries({ queryKey: ["/api/messages", selectedConversation] });
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

  const searchUserMutation = useMutation({
    mutationFn: async (userId: string) => {
      const res = await fetch(`/api/users/find?userId=${userId}`, {
        credentials: "include",
      });
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

  const handleSearch = () => {
    if (!searchUserId) {
      setSearchError("Please enter a User ID");
      return;
    }
    searchUserMutation.mutate(searchUserId);
  };

  const handleStartConversation = () => {
    if (foundUser) {
      setSelectedConversation(foundUser.id);
      setComposeOpen(false);
      setFoundUser(null);
      setSearchUserId("");
      queryClient.invalidateQueries({ queryKey: ["/api/messages/conversations"] });
    }
  };

  const handleSendMessage = () => {
    if (!newMessage.trim() || !selectedConversation) return;
    sendMessageMutation.mutate({
      receiverId: selectedConversation,
      message: newMessage.trim(),
    });
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSendMessage();
    }
  };

  const selectedPartner = conversations.find((c) => c.partnerId === selectedConversation)?.partner;

  if (!user) return null;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-3xl font-bold tracking-tight">Messages</h2>
          <p className="text-muted-foreground">Send and receive direct messages</p>
        </div>
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
                User IDs are globally unique across all roles. You can find a user's ID on their profile.
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
                        <AvatarFallback>
                          {foundUser.username.slice(0, 2).toUpperCase()}
                        </AvatarFallback>
                      </Avatar>
                      <div className="flex-1">
                        <p className="font-medium" data-testid="text-found-username">
                          {foundUser.username}
                        </p>
                        <div className="flex items-center gap-2">
                          <span className="text-sm text-muted-foreground">
                            ID: {foundUser.userId}
                          </span>
                          <Badge variant="secondary" className="text-xs">
                            {foundUser.role}
                          </Badge>
                        </div>
                      </div>
                    </div>
                    <Button
                      onClick={handleStartConversation}
                      className="w-full mt-3"
                      data-testid="button-start-conversation"
                    >
                      <MessageSquare className="w-4 h-4 mr-2" />
                      Start Conversation
                    </Button>
                  </CardContent>
                </Card>
              )}
            </div>
          </DialogContent>
        </Dialog>
      </div>

      <div className="grid gap-6 md:grid-cols-3 h-[calc(100vh-220px)]">
        <Card className="md:col-span-1">
          <CardHeader className="pb-3">
            <CardTitle className="text-lg">Conversations</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <ScrollArea className="h-[calc(100vh-320px)]">
              {conversationsLoading ? (
                <div className="p-4 text-center text-muted-foreground">Loading...</div>
              ) : conversations.length === 0 ? (
                <div className="p-4 text-center text-muted-foreground">
                  <User className="w-8 h-8 mx-auto mb-2 opacity-50" />
                  <p>No conversations yet</p>
                  <p className="text-sm">Start a new message!</p>
                </div>
              ) : (
                conversations.map((conv) => (
                  <button
                    key={conv.partnerId}
                    onClick={() => setSelectedConversation(conv.partnerId)}
                    className={`w-full p-4 flex items-center gap-3 hover-elevate text-left border-b ${
                      selectedConversation === conv.partnerId ? "bg-accent" : ""
                    }`}
                    data-testid={`button-conversation-${conv.partnerId}`}
                  >
                    <Avatar>
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
                          <Badge variant="default" className="text-xs">
                            {conv.unreadCount}
                          </Badge>
                        )}
                      </div>
                      <p className="text-sm text-muted-foreground truncate">
                        {conv.lastMessage.message}
                      </p>
                    </div>
                  </button>
                ))
              )}
            </ScrollArea>
          </CardContent>
        </Card>

        <Card className="md:col-span-2 flex flex-col">
          {selectedConversation ? (
            <>
              <CardHeader className="pb-3 border-b">
                <div className="flex items-center gap-3">
                  <Avatar>
                    <AvatarImage src={selectedPartner?.avatar || undefined} />
                    <AvatarFallback>
                      {selectedPartner?.username?.slice(0, 2).toUpperCase() || "??"}
                    </AvatarFallback>
                  </Avatar>
                  <div>
                    <CardTitle className="text-lg">
                      {selectedPartner?.username || "Unknown User"}
                    </CardTitle>
                    <div className="flex items-center gap-2">
                      <span className="text-sm text-muted-foreground">
                        ID: {selectedPartner?.userId}
                      </span>
                      <Badge variant="secondary" className="text-xs">
                        {selectedPartner?.role}
                      </Badge>
                    </div>
                  </div>
                </div>
              </CardHeader>
              <ScrollArea className="flex-1 p-4">
                {messagesLoading ? (
                  <div className="text-center text-muted-foreground">Loading messages...</div>
                ) : messages.length === 0 ? (
                  <div className="text-center text-muted-foreground">
                    <MessageSquare className="w-8 h-8 mx-auto mb-2 opacity-50" />
                    <p>No messages yet</p>
                    <p className="text-sm">Send the first message!</p>
                  </div>
                ) : (
                  <div className="space-y-4">
                    {messages.map((msg) => {
                      const isMe = msg.senderId === user.id;
                      return (
                        <div
                          key={msg.id}
                          className={`flex ${isMe ? "justify-end" : "justify-start"}`}
                          data-testid={`message-${msg.id}`}
                        >
                          <div
                            className={`max-w-[70%] rounded-lg p-3 ${
                              isMe
                                ? "bg-primary text-primary-foreground"
                                : "bg-muted"
                            }`}
                          >
                            <p className="break-words">{msg.message}</p>
                            <p
                              className={`text-xs mt-1 ${
                                isMe ? "text-primary-foreground/70" : "text-muted-foreground"
                              }`}
                            >
                              {formatDateET(msg.createdAt)}
                            </p>
                          </div>
                        </div>
                      );
                    })}
                    <div ref={messagesEndRef} />
                  </div>
                )}
              </ScrollArea>
              <div className="p-4 border-t">
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
                    disabled={!newMessage.trim() || sendMessageMutation.isPending}
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
            <div className="flex-1 flex items-center justify-center text-muted-foreground">
              <div className="text-center">
                <MessageSquare className="w-12 h-12 mx-auto mb-4 opacity-50" />
                <p>Select a conversation or start a new one</p>
              </div>
            </div>
          )}
        </Card>
      </div>
    </div>
  );
}
