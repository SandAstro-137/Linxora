import { useState, useEffect, useRef } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useAuth } from "@/lib/auth-context";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { MessageCircle, Send, Calendar, DollarSign, User, Briefcase } from "lucide-react";
import type { Job, ChatMessage } from "@shared/schema";
import { formatDistanceToNow } from "date-fns";

type EnrichedJob = Job & {
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
    username: string;
    amount: number;
    percentage: number;
  }>;
};

export default function CurrentJobPage() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [message, setMessage] = useState("");
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Get freelancer's assigned jobs (includes claimed, in_progress, completed)
  const { data: freelancerJobs = [] } = useQuery<Job[]>({
    queryKey: ["/api/freelancer/jobs"],
  });

  // Find the current active job
  const currentJob = freelancerJobs.find(
    (job) =>
      (job.freelancerId === user?.id || job.collaborators?.includes(user?.id || "")) &&
      (job.status === "claimed" || job.status === "in_progress")
  );

  // Get enriched job details
  const { data: enrichedJob } = useQuery<EnrichedJob>({
    queryKey: ["/api/jobs", currentJob?.id],
    enabled: !!currentJob?.id,
  });

  // Get chat messages
  const { data: messages = [] } = useQuery<ChatMessage[]>({
    queryKey: ["/api/jobs", currentJob?.id, "chat"],
    enabled: !!currentJob?.id,
    refetchInterval: 3000, // Poll for new messages every 3 seconds
  });

  // Mark messages as read when viewing
  useEffect(() => {
    if (currentJob?.id && messages.length > 0) {
      const hasUnread = messages.some(msg => msg.receiverId === user?.id && !msg.read);
      if (hasUnread) {
        apiRequest("PUT", `/api/jobs/${currentJob.id}/chat/mark-read`, {})
          .then(() => {
            queryClient.invalidateQueries({ queryKey: ["/api/notifications/unread-count"] });
            queryClient.invalidateQueries({ queryKey: ["/api/jobs", currentJob.id, "chat"] });
          })
          .catch((err) => {
            console.error("Failed to mark messages as read:", err);
          });
      }
    }
  }, [currentJob?.id, messages, user?.id]);

  const sendMessageMutation = useMutation({
    mutationFn: (text: string) =>
      apiRequest("POST", `/api/jobs/${currentJob?.id}/chat`, { message: text }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/jobs", currentJob?.id, "chat"] });
      setMessage("");
      toast({
        title: "Message sent",
        description: "Your message has been delivered",
      });
    },
    onError: () => {
      toast({
        title: "Failed to send message",
        description: "Please try again",
        variant: "destructive",
      });
    },
  });

  // Auto-scroll to bottom when new messages arrive
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const handleSendMessage = () => {
    if (!message.trim()) return;
    sendMessageMutation.mutate(message.trim());
  };

  if (!currentJob) {
    return (
      <div className="container mx-auto p-6 max-w-4xl">
        <Card data-testid="card-no-current-job">
          <CardHeader>
            <CardTitle>Current Job</CardTitle>
            <CardDescription>You don't have any active job at the moment</CardDescription>
          </CardHeader>
          <CardContent>
            <p className="text-muted-foreground">
              Browse available jobs in the marketplace to find your next project
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="container mx-auto p-6 max-w-7xl">
      <h1 className="text-3xl font-bold mb-6" data-testid="text-page-title">
        Current Job
      </h1>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Job Details */}
        <div className="lg:col-span-2 space-y-6">
          <Card data-testid="card-job-details">
            <CardHeader>
              <div className="flex items-start justify-between">
                <div>
                  <CardTitle data-testid="text-job-title">{enrichedJob?.title || currentJob.title}</CardTitle>
                  <CardDescription className="mt-1">
                    {enrichedJob?.category || currentJob.category}
                  </CardDescription>
                </div>
                <Badge data-testid={`badge-status-${currentJob.status}`}>
                  {currentJob.status}
                </Badge>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <h3 className="font-semibold mb-2">Description</h3>
                <p className="text-muted-foreground" data-testid="text-job-description">
                  {currentJob.description}
                </p>
              </div>

              {currentJob.requirements && (
                <div>
                  <h3 className="font-semibold mb-2">Requirements</h3>
                  <p className="text-muted-foreground" data-testid="text-job-requirements">
                    {currentJob.requirements}
                  </p>
                </div>
              )}

              <Separator />

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="flex items-center gap-2">
                  <DollarSign className="w-4 h-4 text-muted-foreground" />
                  <div>
                    <p className="text-sm text-muted-foreground">Budget</p>
                    <p className="font-semibold" data-testid="text-job-budget">
                      ${currentJob.budget}
                    </p>
                  </div>
                </div>

                {currentJob.deadline && (
                  <div className="flex items-center gap-2">
                    <Calendar className="w-4 h-4 text-muted-foreground" />
                    <div>
                      <p className="text-sm text-muted-foreground">Deadline</p>
                      <p className="font-semibold" data-testid="text-job-deadline">
                        {new Date(currentJob.deadline).toLocaleDateString()}
                      </p>
                    </div>
                  </div>
                )}
              </div>

              {enrichedJob?.profitSplits && enrichedJob.profitSplits.length > 0 && (
                <>
                  <Separator />
                  <div>
                    <h3 className="font-semibold mb-3">Your Earnings</h3>
                    <div className="space-y-2">
                      {enrichedJob.profitSplits.map((split) => (
                        <div
                          key={split.userId}
                          className="flex items-center justify-between p-2 bg-muted rounded"
                          data-testid={`profit-split-${split.userId}`}
                        >
                          <span className="font-medium">{split.username}</span>
                          <span className="text-sm">
                            ${split.amount.toFixed(2)} ({split.percentage.toFixed(0)}%)
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                </>
              )}
            </CardContent>
          </Card>

          {/* Chat Interface */}
          <Card data-testid="card-chat-interface">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <MessageCircle className="w-5 h-5" />
                Chat with Customer
              </CardTitle>
              <CardDescription>
                {enrichedJob?.customerUsername && `Chatting with ${enrichedJob.customerUsername}`}
              </CardDescription>
            </CardHeader>
            <CardContent>
              {/* Messages */}
              <div className="space-y-4 mb-4 max-h-96 overflow-y-auto" data-testid="chat-messages-container">
                {messages.length === 0 ? (
                  <p className="text-center text-muted-foreground py-8">
                    No messages yet. Start the conversation!
                  </p>
                ) : (
                  messages.map((msg) => {
                    const isSender = msg.senderId === user?.id;
                    return (
                      <div
                        key={msg.id}
                        className={`flex ${isSender ? "justify-end" : "justify-start"}`}
                        data-testid={`message-${msg.id}`}
                      >
                        <div
                          className={`max-w-[70%] rounded-lg p-3 ${
                            isSender
                              ? "bg-primary text-primary-foreground"
                              : "bg-muted"
                          }`}
                        >
                          <p className="text-sm">{msg.message}</p>
                          <p className="text-xs opacity-70 mt-1">
                            {formatDistanceToNow(new Date(msg.createdAt!), { addSuffix: true })}
                          </p>
                        </div>
                      </div>
                    );
                  })
                )}
                <div ref={messagesEndRef} />
              </div>

              {/* Message Input */}
              <div className="flex gap-2">
                <Input
                  placeholder="Type your message..."
                  value={message}
                  onChange={(e) => setMessage(e.target.value)}
                  onKeyPress={(e) => e.key === "Enter" && handleSendMessage()}
                  data-testid="input-chat-message"
                />
                <Button
                  onClick={handleSendMessage}
                  disabled={!message.trim() || sendMessageMutation.isPending}
                  data-testid="button-send-message"
                >
                  <Send className="w-4 h-4" />
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Sidebar */}
        <div className="space-y-4">
          <Card data-testid="card-customer-info">
            <CardHeader>
              <CardTitle className="text-lg">Customer</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex items-center gap-3 mb-4">
                <Avatar>
                  <AvatarImage src={`https://api.dicebear.com/7.x/avataaars/svg?seed=${enrichedJob?.customerUsername}`} />
                  <AvatarFallback>
                    {enrichedJob?.customerUsername?.[0]?.toUpperCase() || "C"}
                  </AvatarFallback>
                </Avatar>
                <div>
                  <p className="font-semibold" data-testid="text-customer-username">
                    {enrichedJob?.customerUsername || "Customer"}
                  </p>
                  <p className="text-sm text-muted-foreground" data-testid="text-customer-discord">
                    {enrichedJob?.customerDiscordId}
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>

          {enrichedJob?.collaboratorData && enrichedJob.collaboratorData.length > 0 && (
            <Card data-testid="card-team-members">
              <CardHeader>
                <CardTitle className="text-lg">Team Members</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  {enrichedJob.collaboratorData.map((collab) => (
                    <div
                      key={collab.id}
                      className="flex items-center gap-3"
                      data-testid={`team-member-${collab.id}`}
                    >
                      <Avatar className="w-8 h-8">
                        <AvatarImage src={collab.avatar || undefined} />
                        <AvatarFallback>{collab.username[0].toUpperCase()}</AvatarFallback>
                      </Avatar>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium truncate">{collab.username}</p>
                        {collab.specialization && (
                          <p className="text-xs text-muted-foreground truncate">
                            {collab.specialization}
                          </p>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}
