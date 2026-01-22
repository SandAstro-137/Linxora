import { useQuery, useMutation } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Bell, Users, Briefcase } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { apiRequest, queryClient } from "@/lib/queryClient";

interface Notification {
  id: string;
  type: string;
  title?: string;
  message: string;
  read: boolean;
  createdAt: string;
  sourceType?: string | null;
  sourceId?: string | null;
  relatedId?: string | null;
  metadata?: any;
}

export default function NotificationsPage() {
  const [, setLocation] = useLocation();
  
  const { data: notifications } = useQuery<Notification[]>({
    queryKey: ["/api/notifications"],
  });

  const markAsReadMutation = useMutation({
    mutationFn: (id: string) => apiRequest("PUT", `/api/notifications/${id}/read`, {}),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/notifications"] });
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
        setLocation("/profile");
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
      case "pto_approved":
      case "pto_rejected":
        setLocation("/moderation");
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
          <CardTitle className="flex items-center justify-between">
            <span>Recent Activity</span>
            {notifications && notifications.filter((n) => !n.read).length > 0 && (
              <Badge variant="secondary">
                {notifications.filter((n) => !n.read).length} new
              </Badge>
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
                    !notification.read ? "bg-accent/5" : ""
                  }`}
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
                      {!notification.read && (
                        <Badge variant="secondary" className="h-fit">
                          New
                        </Badge>
                      )}
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
