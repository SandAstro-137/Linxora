import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Bell } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { apiRequest, queryClient } from "@/lib/queryClient";
import type { Notification } from "@shared/schema";
import { formatDistanceToNow } from "date-fns";

export function NotificationCenter() {
  const [open, setOpen] = useState(false);

  const { data: notifications = [] } = useQuery<Notification[]>({
    queryKey: ["/api/notifications"],
    enabled: true,
  });

  const { data: unreadData } = useQuery<{ count: number }>({
    queryKey: ["/api/notifications/unread-count"],
    enabled: true,
    refetchInterval: 10000, // Refresh every 10 seconds
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

  const unreadCount = unreadData?.count ?? 0;

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
    // Optionally navigate to related item
    if (notification.relatedId) {
      // Could add navigation logic here based on type
    }
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
      </div>
    </div>
  );

  const EmptyState = ({ message }: { message: string }) => (
    <div className="p-8 text-center text-muted-foreground" data-testid="text-empty-notifications">
      {message}
    </div>
  );

  return (
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
  );
}
