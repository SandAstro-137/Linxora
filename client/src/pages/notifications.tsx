import { useQuery, useMutation } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Bell, Users, Briefcase, CheckCheck } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { apiRequest, queryClient } from "@/lib/queryClient";

interface Notification {
  id: string;
  type: string;
  title?: string;
  message: string;
  read: boolean;
  dismissed?: boolean;
  createdAt: string;
  sourceType?: string | null;
  sourceId?: string | null;
  relatedId?: string | null;
  redirectUrl?: string | null;
  metadata?: any;
}

export default function NotificationsPage() {
  const [, setLocation] = useLocation();
  
  const { data: notifications } = useQuery<Notification[]>({
    queryKey: ["/api/notifications/log"],
    queryFn: async () => {
      const res = await fetch("/api/notifications?all=true", { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch");
      return res.json();
    },
  });

  const markAsReadMutation = useMutation({
    mutationFn: (id: string) => apiRequest("PUT", `/api/notifications/${id}/read`, {}),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/notifications/log"] });
      queryClient.invalidateQueries({ queryKey: ["/api/notifications/unread-count"] });
    },
  });

  const markAllAsReadMutation = useMutation({
    mutationFn: () => apiRequest("PUT", "/api/notifications/mark-all-read", {}),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/notifications/log"] });
      queryClient.invalidateQueries({ queryKey: ["/api/notifications/unread-count"] });
    },
  });

  const getIcon = (type: string) => {
    switch (type) {
      case "job_invite":
      case "invitation":
        return <Users className="w-5 h-5 text-primary" />;
      case "job_update":
      case "job_approved":
      case "job_rejected":
        return <Briefcase className="w-5 h-5 text-blue-500" />;
      default:
        return <Bell className="w-5 h-5 text-muted-foreground" />;
    }
  };

  const handleNotificationClick = (notification: Notification) => {
    if (!notification.read) {
      markAsReadMutation.mutate(notification.id);
    }
    
    if (notification.redirectUrl) {
      setLocation(notification.redirectUrl);
      return;
    }
    
    const notificationType = notification.type;
    const sourceType = notification.sourceType;
    const sourceId = notification.sourceId;
    
    switch (notificationType) {
      case "invitation":
      case "recommendation_accepted":
        setLocation("/job-invitations");
        return;
      
      case "recommendation_declined":
      case "recommendation_success":
      case "invitation_accepted":
      case "invitation_declined":
        if (sourceId) {
          setLocation(`/jobs/${sourceId}`);
        } else {
          setLocation("/current-job");
        }
        return;
      
      case "friend_request":
      case "friend_accepted":
        setLocation("/friends");
        return;
      
      case "role_upgrade":
        setLocation("/moderation?tab=upgrades");
        return;
      
      case "moderation":
        setLocation("/moderation");
        return;
      
      case "direct_message":
        if (sourceId) {
          setLocation(`/messages/${sourceId}`);
        } else {
          setLocation("/messages");
        }
        return;
      
      case "chat_message":
        if (sourceId) {
          setLocation(`/jobs/${sourceId}`);
        } else if (notification.relatedId) {
          setLocation(`/jobs/${notification.relatedId}`);
        } else {
          setLocation("/current-job");
        }
        return;
      
      case "meeting_invitation":
      case "meeting_reminder":
      case "meeting_rsvp":
        setLocation("/meetings");
        return;
      
      case "pto_request":
        setLocation("/moderation");
        return;
      
      case "pto_approved":
      case "pto_rejected":
        setLocation("/pto");
        return;
      
      case "job_approved":
      case "job_rejected":
      case "job_request":
      case "job_completed":
      case "job_changes_requested":
      case "work_submitted":
      case "cancellation_request":
        if (sourceId) {
          setLocation(`/jobs/${sourceId}`);
        } else if (notification.relatedId) {
          setLocation(`/jobs/${notification.relatedId}`);
        }
        return;
    }
    
    if (sourceType && sourceId) {
      switch (sourceType) {
        case "job":
          setLocation(`/jobs/${sourceId}`);
          break;
        case "user":
          setLocation(`/user/${sourceId}`);
          break;
        case "dispute":
          setLocation("/moderation");
          break;
        default:
          if (notification.relatedId) {
            setLocation(`/jobs/${notification.relatedId}`);
          }
      }
    } else if (notification.relatedId) {
      setLocation(`/jobs/${notification.relatedId}`);
    }
  };

  return (
    <div className="space-y-6 max-w-4xl mx-auto">
      <div>
        <h2 className="text-3xl font-bold tracking-tight">Notifications</h2>
        <p className="text-muted-foreground">
          Stay updated with your activity and invitations
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center justify-between flex-wrap gap-2">
            <div className="flex items-center gap-2">
              <span>Notification Log</span>
              {notifications && notifications.filter((n) => !n.read).length > 0 && (
                <Badge variant="secondary">
                  {notifications.filter((n) => !n.read).length} unread
                </Badge>
              )}
            </div>
            {notifications && notifications.filter((n) => !n.read).length > 0 && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => markAllAsReadMutation.mutate()}
                disabled={markAllAsReadMutation.isPending}
                data-testid="button-mark-all-read-log"
              >
                <CheckCheck className="w-4 h-4 mr-2" />
                Mark all read
              </Button>
            )}
          </CardTitle>
        </CardHeader>
        <CardContent>
          {notifications && notifications.length > 0 ? (
            <div className="space-y-3">
              {notifications.map((notification) => (
                <Card
                  key={notification.id}
                  className={`border transition-colors cursor-pointer hover-elevate active-elevate-2 ${
                    !notification.read && !notification.dismissed ? "bg-accent/5" : ""
                  } ${notification.dismissed ? "opacity-60" : ""}`}
                  onClick={() => handleNotificationClick(notification)}
                  data-testid={`notification-${notification.id}`}
                >
                  <CardContent className="p-4">
                    <div className="flex gap-4">
                      <div className="bg-primary/10 p-2 rounded-lg h-fit">
                        {getIcon(notification.type)}
                      </div>
                      <div className="flex-1 min-w-0">
                        {notification.title && (
                          <p className="text-sm font-medium mb-1">{notification.title}</p>
                        )}
                        <p className="text-sm text-muted-foreground mb-1">{notification.message}</p>
                        <p className="text-xs text-muted-foreground">
                          {formatDistanceToNow(new Date(notification.createdAt), {
                            addSuffix: true,
                          })}
                        </p>
                      </div>
                      <div className="flex flex-col items-end gap-1 shrink-0">
                        {!notification.read && !notification.dismissed && (
                          <Badge variant="secondary" className="h-fit">
                            New
                          </Badge>
                        )}
                        {notification.dismissed && (
                          <Badge variant="outline" className="h-fit text-xs text-muted-foreground">
                            Cleared
                          </Badge>
                        )}
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          ) : (
            <div className="text-center py-12">
              <Bell className="w-12 h-12 mx-auto mb-4 text-muted-foreground" />
              <h3 className="text-lg font-semibold mb-2">No notifications</h3>
              <p className="text-muted-foreground">
                You're all caught up! Check back later for updates
              </p>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
