import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { Users, Search, UserPlus, UserMinus, Check, X, Clock, Send, User } from "lucide-react";
import { toZonedTime, format as formatTz } from "date-fns-tz";

function formatToET(date: Date | string): string {
  const d = typeof date === "string" ? new Date(date) : date;
  const eastern = toZonedTime(d, "America/New_York");
  return formatTz(eastern, "MMM d, yyyy 'at' h:mm a 'ET'", { timeZone: "America/New_York" });
}
import { Link } from "wouter";

interface FriendData {
  id: string;
  friendId: string;
  userId: number;
  username: string;
  avatar: string | null;
  role: string;
  createdAt: string;
}

interface FriendRequestData {
  id: string;
  fromUserId: string;
  toUserId: string;
  status: string;
  createdAt: string;
  fromUser?: {
    id: string;
    userId: number;
    username: string;
    avatar: string | null;
    role: string;
  };
  toUser?: {
    id: string;
    userId: number;
    username: string;
    avatar: string | null;
    role: string;
  };
}

interface SearchResult {
  id: string;
  userId: number;
  username: string;
  avatar: string | null;
  role: string;
  level: number;
  completedJobs: number;
  rating: string;
}

function getRoleBadgeVariant(role: string) {
  switch (role) {
    case "founder": return "default";
    case "head_of_moderation": return "default";
    case "moderator": return "secondary";
    case "staff": return "secondary";
    case "freelancer": return "outline";
    case "customer": return "outline";
    default: return "outline";
  }
}

function getRoleDisplay(role: string) {
  switch (role) {
    case "founder": return "Founder";
    case "head_of_moderation": return "Head of Moderation";
    case "moderator": return "Moderator";
    case "staff": return "Staff";
    case "freelancer": return "Freelancer";
    case "customer": return "Customer";
    default: return role;
  }
}

export default function FriendsPage() {
  const { toast } = useToast();
  const [searchId, setSearchId] = useState("");
  const [searchResults, setSearchResults] = useState<SearchResult[]>([]);
  const [isSearching, setIsSearching] = useState(false);

  const { data: friends = [], isLoading: friendsLoading } = useQuery<FriendData[]>({
    queryKey: ["/api/friends"],
  });

  const { data: incomingRequests = [], isLoading: incomingLoading } = useQuery<FriendRequestData[]>({
    queryKey: ["/api/friend-requests"],
  });

  const { data: outgoingRequests = [], isLoading: outgoingLoading } = useQuery<FriendRequestData[]>({
    queryKey: ["/api/friend-requests/outgoing"],
  });

  const searchMutation = useMutation({
    mutationFn: async (userId: string) => {
      const res = await fetch(`/api/users/search?userId=${userId}`);
      if (!res.ok) throw new Error("Search failed");
      return res.json();
    },
    onSuccess: (data) => {
      setSearchResults(data);
      setIsSearching(false);
    },
    onError: () => {
      toast({ title: "Error", description: "Failed to search users", variant: "destructive" });
      setIsSearching(false);
    },
  });

  const sendRequestMutation = useMutation({
    mutationFn: async (toUserId: string) => {
      return apiRequest("POST", "/api/friend-requests", { toUserId });
    },
    onSuccess: () => {
      toast({ title: "Friend Request Sent", description: "Your friend request has been sent." });
      queryClient.invalidateQueries({ queryKey: ["/api/friend-requests/outgoing"] });
      setSearchResults([]);
      setSearchId("");
    },
    onError: (error: Error) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });

  const acceptRequestMutation = useMutation({
    mutationFn: async (requestId: string) => {
      return apiRequest("POST", `/api/friend-requests/${requestId}/accept`, {});
    },
    onSuccess: () => {
      toast({ title: "Friend Request Accepted", description: "You are now friends!" });
      queryClient.invalidateQueries({ queryKey: ["/api/friends"] });
      queryClient.invalidateQueries({ queryKey: ["/api/friend-requests"] });
    },
    onError: () => {
      toast({ title: "Error", description: "Failed to accept request", variant: "destructive" });
    },
  });

  const declineRequestMutation = useMutation({
    mutationFn: async (requestId: string) => {
      return apiRequest("POST", `/api/friend-requests/${requestId}/decline`, {});
    },
    onSuccess: () => {
      toast({ title: "Friend Request Declined" });
      queryClient.invalidateQueries({ queryKey: ["/api/friend-requests"] });
    },
    onError: () => {
      toast({ title: "Error", description: "Failed to decline request", variant: "destructive" });
    },
  });

  const cancelRequestMutation = useMutation({
    mutationFn: async (requestId: string) => {
      return apiRequest("POST", `/api/friend-requests/${requestId}/cancel`, {});
    },
    onSuccess: () => {
      toast({ title: "Friend Request Cancelled" });
      queryClient.invalidateQueries({ queryKey: ["/api/friend-requests/outgoing"] });
    },
    onError: () => {
      toast({ title: "Error", description: "Failed to cancel request", variant: "destructive" });
    },
  });

  const removeFriendMutation = useMutation({
    mutationFn: async (friendId: string) => {
      return apiRequest("DELETE", `/api/friends/${friendId}`, {});
    },
    onSuccess: () => {
      toast({ title: "Friend Removed" });
      queryClient.invalidateQueries({ queryKey: ["/api/friends"] });
    },
    onError: () => {
      toast({ title: "Error", description: "Failed to remove friend", variant: "destructive" });
    },
  });

  const handleSearch = () => {
    if (!searchId.trim()) return;
    setIsSearching(true);
    searchMutation.mutate(searchId);
  };

  if (friendsLoading) {
    return (
      <div className="p-6 max-w-4xl mx-auto space-y-6">
        <Skeleton className="h-10 w-48" />
        <Skeleton className="h-96 w-full" />
      </div>
    );
  }

  return (
    <div className="p-6 max-w-4xl mx-auto space-y-6">
      <div className="flex items-center gap-3">
        <Users className="w-8 h-8 text-primary" />
        <div>
          <h1 className="text-2xl font-bold" data-testid="text-friends-title">Friends</h1>
          <p className="text-muted-foreground">Manage your friends and friend requests</p>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Search className="w-5 h-5" />
            Find Users by ID
          </CardTitle>
          <CardDescription>
            Search for users by their unique ID number to send friend requests
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex gap-2">
            <Input
              type="number"
              placeholder="Enter User ID (e.g., 12345)"
              value={searchId}
              onChange={(e) => setSearchId(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleSearch()}
              data-testid="input-search-user-id"
            />
            <Button onClick={handleSearch} disabled={isSearching || !searchId.trim()} data-testid="button-search-user">
              <Search className="w-4 h-4 mr-2" />
              Search
            </Button>
          </div>

          {searchResults.length > 0 && (
            <div className="space-y-2">
              <h3 className="text-sm font-medium text-muted-foreground">Search Results</h3>
              {searchResults.map((user) => (
                <div
                  key={user.id}
                  className="flex items-center justify-between p-3 border rounded-lg"
                  data-testid={`search-result-${user.id}`}
                >
                  <div className="flex items-center gap-3">
                    <Avatar>
                      <AvatarImage src={user.avatar || undefined} />
                      <AvatarFallback>{user.username.charAt(0).toUpperCase()}</AvatarFallback>
                    </Avatar>
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-medium">{user.username}</span>
                        <Badge variant={getRoleBadgeVariant(user.role)} className="text-xs">
                          {getRoleDisplay(user.role)}
                        </Badge>
                      </div>
                      <p className="text-sm text-muted-foreground">ID: {user.userId}</p>
                    </div>
                  </div>
                  <Button
                    size="sm"
                    onClick={() => sendRequestMutation.mutate(user.id)}
                    disabled={sendRequestMutation.isPending}
                    data-testid={`button-add-friend-${user.id}`}
                  >
                    <UserPlus className="w-4 h-4 mr-2" />
                    Add Friend
                  </Button>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <Tabs defaultValue="friends">
        <TabsList className="grid w-full grid-cols-3">
          <TabsTrigger value="friends" data-testid="tab-friends">
            Friends ({friends.length})
          </TabsTrigger>
          <TabsTrigger value="incoming" data-testid="tab-incoming">
            Incoming ({incomingRequests.length})
          </TabsTrigger>
          <TabsTrigger value="outgoing" data-testid="tab-outgoing">
            Outgoing ({outgoingRequests.length})
          </TabsTrigger>
        </TabsList>

        <TabsContent value="friends" className="mt-4">
          <Card>
            <CardHeader>
              <CardTitle>Your Friends</CardTitle>
            </CardHeader>
            <CardContent>
              {friends.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  <User className="w-12 h-12 mx-auto mb-4 opacity-50" />
                  <p>You haven't added any friends yet.</p>
                  <p className="text-sm">Search for users by their ID to send friend requests.</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {friends.map((friend) => (
                    <div
                      key={friend.id}
                      className="flex items-center justify-between p-3 border rounded-lg"
                      data-testid={`friend-${friend.friendId}`}
                    >
                      <div className="flex items-center gap-3">
                        <Avatar>
                          <AvatarImage src={friend.avatar || undefined} />
                          <AvatarFallback>{friend.username.charAt(0).toUpperCase()}</AvatarFallback>
                        </Avatar>
                        <div>
                          <div className="flex items-center gap-2">
                            <Link href={`/profile/${friend.friendId}`} className="font-medium hover:underline">
                              {friend.username}
                            </Link>
                            <Badge variant={getRoleBadgeVariant(friend.role)} className="text-xs">
                              {getRoleDisplay(friend.role)}
                            </Badge>
                          </div>
                          <p className="text-sm text-muted-foreground">ID: {friend.userId}</p>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <Link href={`/messages/${friend.friendId}`}>
                          <Button size="sm" variant="outline" data-testid={`button-message-${friend.friendId}`}>
                            <Send className="w-4 h-4" />
                          </Button>
                        </Link>
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => removeFriendMutation.mutate(friend.friendId)}
                          disabled={removeFriendMutation.isPending}
                          data-testid={`button-remove-friend-${friend.friendId}`}
                        >
                          <UserMinus className="w-4 h-4" />
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="incoming" className="mt-4">
          <Card>
            <CardHeader>
              <CardTitle>Incoming Friend Requests</CardTitle>
            </CardHeader>
            <CardContent>
              {incomingLoading ? (
                <Skeleton className="h-20 w-full" />
              ) : incomingRequests.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  <Clock className="w-12 h-12 mx-auto mb-4 opacity-50" />
                  <p>No pending friend requests.</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {incomingRequests.map((request) => (
                    <div
                      key={request.id}
                      className="flex items-center justify-between p-3 border rounded-lg"
                      data-testid={`incoming-request-${request.id}`}
                    >
                      <div className="flex items-center gap-3">
                        <Avatar>
                          <AvatarImage src={request.fromUser?.avatar || undefined} />
                          <AvatarFallback>
                            {request.fromUser?.username?.charAt(0).toUpperCase() || "?"}
                          </AvatarFallback>
                        </Avatar>
                        <div>
                          <div className="flex items-center gap-2">
                            <span className="font-medium">{request.fromUser?.username || "Unknown"}</span>
                            {request.fromUser?.role && (
                              <Badge variant={getRoleBadgeVariant(request.fromUser.role)} className="text-xs">
                                {getRoleDisplay(request.fromUser.role)}
                              </Badge>
                            )}
                          </div>
                          <p className="text-sm text-muted-foreground">
                            ID: {request.fromUser?.userId} | {formatToET(request.createdAt)}
                          </p>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <Button
                          size="sm"
                          onClick={() => acceptRequestMutation.mutate(request.id)}
                          disabled={acceptRequestMutation.isPending}
                          data-testid={`button-accept-${request.id}`}
                        >
                          <Check className="w-4 h-4 mr-1" />
                          Accept
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => declineRequestMutation.mutate(request.id)}
                          disabled={declineRequestMutation.isPending}
                          data-testid={`button-decline-${request.id}`}
                        >
                          <X className="w-4 h-4 mr-1" />
                          Decline
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="outgoing" className="mt-4">
          <Card>
            <CardHeader>
              <CardTitle>Outgoing Friend Requests</CardTitle>
            </CardHeader>
            <CardContent>
              {outgoingLoading ? (
                <Skeleton className="h-20 w-full" />
              ) : outgoingRequests.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  <Send className="w-12 h-12 mx-auto mb-4 opacity-50" />
                  <p>No pending outgoing requests.</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {outgoingRequests.map((request) => (
                    <div
                      key={request.id}
                      className="flex items-center justify-between p-3 border rounded-lg"
                      data-testid={`outgoing-request-${request.id}`}
                    >
                      <div className="flex items-center gap-3">
                        <Avatar>
                          <AvatarImage src={request.toUser?.avatar || undefined} />
                          <AvatarFallback>
                            {request.toUser?.username?.charAt(0).toUpperCase() || "?"}
                          </AvatarFallback>
                        </Avatar>
                        <div>
                          <div className="flex items-center gap-2">
                            <span className="font-medium">{request.toUser?.username || "Unknown"}</span>
                            {request.toUser?.role && (
                              <Badge variant={getRoleBadgeVariant(request.toUser.role)} className="text-xs">
                                {getRoleDisplay(request.toUser.role)}
                              </Badge>
                            )}
                          </div>
                          <p className="text-sm text-muted-foreground">
                            ID: {request.toUser?.userId} | Sent: {formatToET(request.createdAt)}
                          </p>
                        </div>
                      </div>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => cancelRequestMutation.mutate(request.id)}
                        disabled={cancelRequestMutation.isPending}
                        data-testid={`button-cancel-${request.id}`}
                      >
                        <X className="w-4 h-4 mr-1" />
                        Cancel
                      </Button>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
