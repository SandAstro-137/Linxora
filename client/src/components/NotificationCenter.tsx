import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { Bell, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { apiRequest, queryClient } from "@/lib/queryClient";
import type { Notification, UserPreferences } from "@shared/schema";
import { formatDistanceToNow } from "date-fns";

export function NotificationCenter() {
  const [, setLocation] = useLocation();
  const [open, setOpen] = useState(false);
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [notificationToDelete, setNotificationToDelete] = useState<string | null>(null);
  const [dontShowAgain, setDontShowAgain] = useState(false);

  const { data: notifications = [] } = useQuery<Notification[]>({
    queryKey: ["/api/notifications"],
    enabled: true,
    refetchInterval: 10000,
  });

  const { data: unreadData } = useQuery<{ count: number }>({
    queryKey: ["/api/notifications/unread-count"],
    enabled: true,
    refetchInterval: 10000,
  });

  const { data: settings } = useQuery<UserPreferences>({
    queryKey: ["/api/settings"],
  });

  const markAsReadMutation = useMutation({
    mutationFn: (id: string) => apiRequest("PUT", `/api/notifications/${id}/read`, {}),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/notifications"] });
      queryClient.invalidateQueries({ queryKey: ["/api/notifications/unread-count"] });
    },
  });

  const markAllAsReadMutation = useMutation({
    mutationFn: () => apiRequest("PUT", "/api/notifications/mark-all-read", {}),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/notifications"] });
      queryClient.invalidateQueries({ queryKey: ["/api/notifications/unread-count"] });
    },
  });

  const deleteNotificationMutation = useMutation({
    mutationFn: (id: string) => apiRequest("DELETE", `/api/notifications/${id}`, {}),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/notifications"] });
      queryClient.invalidateQueries({ queryKey: ["/api/notifications/unread-count"] });
    },
  });

  const updateSettingsMutation = useMutation({
    mutationFn: (updates: Partial<UserPreferences>) => apiRequest("PUT", "/api/settings", updates),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/settings"] });
    },
  });

  const unreadCount = unreadData?.count ?? 0;
  const showDeleteConfirmation = settings?.deleteConfirmationEnabled ?? true;

  const messageNotifications = notifications.filter((n) => n.type === "chat_message");
  const approvalNotifications = notifications.filter((n) =>
    ["job_approved", "job_rejected", "cancellation_request", "invitation"].includes(n.type)
  );
  const systemNotifications = notifications.filter(
    (n) => !["chat_message", "job_approved", "job_rejected", "cancellation_request", "invitation"].includes(n.type)
  );

  const handleNotificationClick = (notification: Notification) => {
    if (!notification.read) {
      markAsReadMutation.mutate(notification.id);
    }
    
    setOpen(false);
    
    const notificationType = notification.type;
    const sourceType = notification.sourceType;
    const sourceId = notification.sourceId;
    
    // Route based on notification type first for more specific handling
    switch (notificationType) {
      // Job invitations and recommendations
      case "invitation":
      case "recommendation_accepted":
        setLocation("/job-invitations");
        return;
      
      // Recommendation notifications for recommender
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
      
      // Friend-related notifications
      case "friend_request":
      case "friend_accepted":
        setLocation("/friends");
        return;
      
      // Role upgrade notifications
      case "role_upgrade":
        setLocation("/profile");
        return;
      
      // Moderation notifications
      case "moderation":
        setLocation("/moderation");
        return;
      
      // Direct messages
      case "direct_message":
        if (sourceId) {
          setLocation(`/messages/${sourceId}`);
        } else {
          setLocation("/messages");
        }
        return;
      
      // Chat messages (job-related)
      case "chat_message":
        if (sourceId) {
          setLocation(`/jobs/${sourceId}`);
        } else if (notification.relatedId) {
          setLocation(`/jobs/${notification.relatedId}`);
        } else {
          setLocation("/current-job");
        }
        return;
      
      // Meeting notifications
      case "meeting_invitation":
      case "meeting_reminder":
      case "meeting_rsvp":
        setLocation("/meetings");
        return;
      
      // PTO notifications - moderators see requests, freelancers see their own
      case "pto_request":
        setLocation("/moderation");
        return;
      
      case "pto_approved":
      case "pto_rejected":
        setLocation("/pto");
        return;
      
      // Job status notifications
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
    
    // Fallback to sourceType-based routing
    if (sourceType && sourceId) {
      switch (sourceType) {
        case "job":
          setLocation(`/jobs/${sourceId}`);
          break;
        case "user":
          setLocation(`/user/${sourceId}`);
          break;
        case "dispute":
          setLocation(`/moderation`);
          break;
        case "system":
        default:
          if (notification.relatedId) {
            setLocation(`/jobs/${notification.relatedId}`);
          }
      }
    } else if (notification.relatedId) {
      setLocation(`/jobs/${notification.relatedId}`);
    }
  };

  const handleDeleteClick = (e: React.MouseEvent, notificationId: string) => {
    e.stopPropagation();
    if (showDeleteConfirmation) {
      setNotificationToDelete(notificationId);
      setDeleteConfirmOpen(true);
    } else {
      deleteNotificationMutation.mutate(notificationId);
    }
  };

  const confirmDelete = () => {
    if (notificationToDelete) {
      deleteNotificationMutation.mutate(notificationToDelete);
      if (dontShowAgain) {
        updateSettingsMutation.mutate({ deleteConfirmationEnabled: false });
      }
    }
    setDeleteConfirmOpen(false);
    setNotificationToDelete(null);
    setDontShowAgain(false);
  };

  const NotificationItem = ({ notification }: { notification: Notification }) => (
    <div
      className={`p-3 border-b hover-elevate active-elevate-2 cursor-pointer ${
        !notification.read ? "bg-accent/10" : ""
      }`}
      onClick={() => handleNotificationClick(notification)}
      data-testid={`notification-item-${notification.id}`}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <p className="text-sm font-medium truncate" data-testid="text-notification-title">
              {notification.title}
            </p>
            {!notification.read && (
              <Badge variant="default" className="shrink-0" data-testid="badge-unread">
                New
              </Badge>
            )}
          </div>
          <p className="text-sm text-muted-foreground mt-1" data-testid="text-notification-message">
            {notification.message}
          </p>
          <p className="text-xs text-muted-foreground mt-1" data-testid="text-notification-time">
            {formatDistanceToNow(new Date(notification.createdAt!), { addSuffix: true })}
          </p>
        </div>
        <Button
          variant="ghost"
          size="icon"
          className="shrink-0 h-8 w-8 text-muted-foreground hover:text-destructive"
          onClick={(e) => handleDeleteClick(e, notification.id)}
          data-testid={`button-delete-notification-${notification.id}`}
        >
          <Trash2 className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );

  const EmptyState = ({ message }: { message: string }) => (
    <div className="p-8 text-center text-muted-foreground" data-testid="text-empty-notifications">
      {message}
    </div>
  );

  return (
    <>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button variant="ghost" size="icon" className="relative" data-testid="button-notifications">
            <Bell className="h-5 w-5" />
            {unreadCount > 0 && (
              <Badge
                variant="destructive"
                className="absolute -top-1 -right-1 h-5 w-5 flex items-center justify-center p-0 text-xs"
                data-testid="badge-unread-count"
              >
                {unreadCount > 99 ? "99+" : unreadCount}
              </Badge>
            )}
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-96 p-0" align="end" data-testid="panel-notifications">
          <div className="p-4 border-b">
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-semibold" data-testid="text-notifications-title">
                Notifications
              </h3>
              {unreadCount > 0 && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => markAllAsReadMutation.mutate()}
                  data-testid="button-mark-all-read"
                >
                  Mark all read
                </Button>
              )}
            </div>
          </div>

          <Tabs defaultValue="all" className="w-full">
            <TabsList className="w-full grid grid-cols-4 rounded-none border-b" data-testid="tabs-notifications">
              <TabsTrigger value="all" data-testid="tab-all">
                All
                {unreadCount > 0 && (
                  <Badge variant="secondary" className="ml-1" data-testid="badge-all-count">
                    {unreadCount}
                  </Badge>
                )}
              </TabsTrigger>
              <TabsTrigger value="messages" data-testid="tab-messages">
                Messages
                {messageNotifications.filter((n) => !n.read).length > 0 && (
                  <Badge variant="secondary" className="ml-1" data-testid="badge-messages-count">
                    {messageNotifications.filter((n) => !n.read).length}
                  </Badge>
                )}
              </TabsTrigger>
              <TabsTrigger value="approvals" data-testid="tab-approvals">
                Approvals
                {approvalNotifications.filter((n) => !n.read).length > 0 && (
                  <Badge variant="secondary" className="ml-1" data-testid="badge-approvals-count">
                    {approvalNotifications.filter((n) => !n.read).length}
                  </Badge>
                )}
              </TabsTrigger>
              <TabsTrigger value="system" data-testid="tab-system">
                System
                {systemNotifications.filter((n) => !n.read).length > 0 && (
                  <Badge variant="secondary" className="ml-1" data-testid="badge-system-count">
                    {systemNotifications.filter((n) => !n.read).length}
                  </Badge>
                )}
              </TabsTrigger>
            </TabsList>

            <ScrollArea className="h-[400px]" data-testid="scroll-notifications">
              <TabsContent value="all" className="m-0">
                {notifications.length === 0 ? (
                  <EmptyState message="No notifications yet" />
                ) : (
                  notifications.map((notification) => (
                    <NotificationItem key={notification.id} notification={notification} />
                  ))
                )}
              </TabsContent>

              <TabsContent value="messages" className="m-0">
                {messageNotifications.length === 0 ? (
                  <EmptyState message="No message notifications" />
                ) : (
                  messageNotifications.map((notification) => (
                    <NotificationItem key={notification.id} notification={notification} />
                  ))
                )}
              </TabsContent>

              <TabsContent value="approvals" className="m-0">
                {approvalNotifications.length === 0 ? (
                  <EmptyState message="No approval notifications" />
                ) : (
                  approvalNotifications.map((notification) => (
                    <NotificationItem key={notification.id} notification={notification} />
                  ))
                )}
              </TabsContent>

              <TabsContent value="system" className="m-0">
                {systemNotifications.length === 0 ? (
                  <EmptyState message="No system notifications" />
                ) : (
                  systemNotifications.map((notification) => (
                    <NotificationItem key={notification.id} notification={notification} />
                  ))
                )}
              </TabsContent>
            </ScrollArea>
          </Tabs>
        </PopoverContent>
      </Popover>

      <AlertDialog open={deleteConfirmOpen} onOpenChange={setDeleteConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Notification?</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete this notification? This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="flex items-center space-x-2 py-2">
            <Checkbox
              id="dont-show-again"
              checked={dontShowAgain}
              onCheckedChange={(checked) => setDontShowAgain(checked === true)}
              data-testid="checkbox-dont-show-again"
            />
            <Label htmlFor="dont-show-again" className="text-sm text-muted-foreground">
              Don't show this prompt again
            </Label>
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel data-testid="button-cancel-delete">Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={confirmDelete}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              data-testid="button-confirm-delete"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
