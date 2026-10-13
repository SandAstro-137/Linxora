import { useState, useEffect, useRef } from "react";
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
import { useAuth } from "@/lib/auth-context";
import type { Notification, UserPreferences } from "@shared/schema";
import { formatDistanceToNow } from "date-fns";

const SPAM_TYPES = ["direct_message_unknown"];

function isSpamNotification(n: Notification, spamFilterEnabled: boolean): boolean {
  return spamFilterEnabled && SPAM_TYPES.includes(n.type);
}

export function NotificationCenter() {
  const [, setLocation] = useLocation();
  const { user } = useAuth();
  const [open, setOpen] = useState(false);
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [notificationToDelete, setNotificationToDelete] = useState<string | null>(null);
  const [dontShowAgain, setDontShowAgain] = useState(false);

  const { data: notifications = [] } = useQuery<Notification[]>({
    queryKey: ["/api/notifications"],
    enabled: true,
    refetchInterval: 5000, // Same cadence as the unread-count badge so the list never lags behind the number
  });

  const { data: unreadData } = useQuery<{ count: number }>({
    queryKey: ["/api/notifications/unread-count"],
    enabled: true,
    refetchInterval: 5000,
  });

  const prevUnreadCount = useRef<number | undefined>(undefined);
  const soundCtxRef = useRef<AudioContext | null>(null);

  // Small pleasant two-tone chime when a new notification arrives.
  const playNotificationSound = () => {
    try {
      const Ctx = window.AudioContext || (window as any).webkitAudioContext;
      if (!Ctx) return;
      if (!soundCtxRef.current) soundCtxRef.current = new Ctx();
      const ctx = soundCtxRef.current;
      if (ctx.state === "suspended") ctx.resume().catch(() => {});
      const now = ctx.currentTime;
      const makeTone = (start: number, end: number, freq: number) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = "sine";
        osc.frequency.setValueAtTime(freq, now);
        gain.gain.setValueAtTime(0.0001, now + start);
        gain.gain.exponentialRampToValueAtTime(0.08, now + start + 0.02);
        gain.gain.exponentialRampToValueAtTime(0.0001, now + end);
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start(now + start);
        osc.stop(now + end);
      };
      makeTone(0, 0.18, 880); // A5
      makeTone(0.12, 0.32, 1318.51); // E6 — soft rising finish
    } catch {
      // Audio unavailable (autoplay policy, missing API) — stay silent.
    }
  };

  const { data: settings } = useQuery<UserPreferences>({
    queryKey: ["/api/settings"],
  });

  useEffect(() => {
    const currentCount = unreadData?.count;
    if (prevUnreadCount.current !== undefined && currentCount !== undefined && currentCount > prevUnreadCount.current) {
      queryClient.invalidateQueries({ queryKey: ["/api/wallet"] });
      queryClient.invalidateQueries({ queryKey: ["/api/wallet/transactions"] });
      queryClient.invalidateQueries({ queryKey: ["/api/jobs"] });
      queryClient.invalidateQueries({ queryKey: ["/api/my-jobs"] });
      // Sound and visible pings only when the user has opted into them.
      // The master "Enable Notifications" switch silences arrival effects
      // (badge growth is suppressed separately); the dedicated "Notification
      // Sound" switch controls the chime itself. The inbox always receives
      // notifications regardless of either switch.
      if (
        (settings?.notificationsEnabled ?? true) &&
        (settings?.notificationSoundEnabled ?? true) &&
        unreadData &&
        currentCount !== undefined
      ) {
        playNotificationSound();
      }
    }
    prevUnreadCount.current = currentCount;
  }, [unreadData?.count, settings?.notificationsEnabled, settings?.notificationSoundEnabled]);

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

  const clearAllMutation = useMutation({
    mutationFn: () => apiRequest("PUT", "/api/notifications/dismiss-all", {}),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/notifications"] });
      queryClient.invalidateQueries({ queryKey: ["/api/notifications/unread-count"] });
    },
  });

  const deleteNotificationMutation = useMutation({
    mutationFn: (id: string) => apiRequest("PUT", `/api/notifications/${id}/dismiss`, {}),
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

  const spamFilterEnabled = settings?.spamFilterEnabled ?? false;

  // Partition notifications
  const spamNotifications = notifications.filter((n) => isSpamNotification(n, spamFilterEnabled));
  const activeNotifications = notifications.filter((n) => !isSpamNotification(n, spamFilterEnabled));

  const messageNotifications = activeNotifications.filter((n) => n.type === "chat_message");
  const approvalNotifications = activeNotifications.filter((n) =>
    ["job_approved", "job_rejected", "cancellation_request", "invitation"].includes(n.type)
  );
  const systemNotifications = activeNotifications.filter(
    (n) => !["chat_message", "job_approved", "job_rejected", "cancellation_request", "invitation"].includes(n.type)
  );

  // Unread count excludes spam
  const unreadCount = (unreadData?.count ?? 0) - spamNotifications.filter((n) => !n.read).length;
  const rawUnreadCount = Math.max(0, unreadCount);

  // The master "Enable Notifications" switch means "don't notify me" — it
  // does NOT stop notifications from arriving in the inbox. What it silences
  // is the red badge: while the switch is off, the displayed count is frozen
  // at the level seen when the switch was turned off (it can still drop when
  // the user reads notifications, but it never grows). Turning the switch
  // back on reveals the true count again.
  const badgeBaselineRef = useRef<number | null>(null);
  const notificationsOff = settings?.notificationsEnabled === false;
  if (notificationsOff) {
    if (badgeBaselineRef.current === null || rawUnreadCount < badgeBaselineRef.current) {
      badgeBaselineRef.current = rawUnreadCount;
    }
  } else {
    badgeBaselineRef.current = null;
  }
  const displayUnreadCount = notificationsOff ? (badgeBaselineRef.current ?? 0) : rawUnreadCount;

  const showDeleteConfirmation = settings?.deleteConfirmationEnabled ?? true;

  const handleNotificationClick = (notification: Notification) => {
    if (!notification.read) {
      markAsReadMutation.mutate(notification.id);
    }
    
    setOpen(false);
    
    if (notification.redirectUrl) {
      setLocation(notification.redirectUrl);
      return;
    }
    
    const notificationType = notification.type;
    const sourceType = notification.sourceType;
    const sourceId = notification.sourceId;
    
    if (notificationType === "role_upgrade") {
      const isStaff = user && ["moderator", "head_of_moderation", "founder"].includes(user.role);
      if (isStaff) {
        setLocation("/moderation?tab=upgrades");
      } else {
        setLocation("/profile");
      }
      return;
    }
    
    switch (notificationType) {
      case "invitation":
      case "recommendation_accepted":
      case "job_invitation":
        setLocation("/job-invitations");
        return;
      case "job_recommendation":
        if (user?.role === "customer" && sourceId) {
          setLocation(`/jobs/${sourceId}`);
        } else {
          setLocation("/incoming-recommendations");
        }
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
      case "moderation":
        setLocation("/moderation");
        return;
      case "report":
        setLocation("/moderation?tab=reports");
        return;
      case "forwarded_bug":
        setLocation("/moderation?tab=reports");
        return;
      case "direct_message":
      case "direct_message_unknown":
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
      case "meeting_scheduled":
        setLocation("/meetings");
        return;
      case "meeting_exemption_request":
        setLocation("/team-management?tab=exemptions");
        return;
      case "pto_request":
        setLocation("/moderation");
        return;
      case "pto_approved":
      case "pto_rejected":
        setLocation("/pto");
        return;
      case "job_left":
        if (sourceId) {
          setLocation(`/jobs/${sourceId}`);
        } else if (notification.relatedId) {
          setLocation(`/jobs/${notification.relatedId}`);
        }
        return;
      case "leadership_vote":
        if (sourceId) {
          setLocation(`/jobs/${sourceId}`);
        } else if (notification.relatedId) {
          setLocation(`/jobs/${notification.relatedId}`);
        } else {
          setLocation("/current-job");
        }
        return;
      case "meeting_started":
        if (notification.relatedId) {
          setLocation(`/meeting/${notification.relatedId}`);
        }
        return;
      case "dispute_opened":
        setLocation("/moderation?tab=disputes");
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
          setLocation(`/moderation?tab=disputes`);
          break;
        default:
          setLocation("/notifications");
      }
    } else {
      setLocation("/notifications");
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

  const tabCount = spamFilterEnabled ? 5 : 4;

  return (
    <>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            variant="ghost"
            size="icon"
            className="relative"
            aria-label="Notifications"
            data-testid="button-notifications"
          >
            <Bell className="h-5 w-5" />
            {displayUnreadCount > 0 && (
              <span
                className={`absolute top-0.5 right-0.5 flex h-[18px] items-center justify-center rounded-full bg-destructive text-destructive-foreground border-2 border-background text-[10px] font-bold leading-none tabular-nums shadow-sm ${
                  displayUnreadCount > 99 ? "min-w-[26px] px-1" : "w-[18px]"
                }`}
                data-testid="badge-unread-count"
              >
                {displayUnreadCount > 99 ? "99+" : displayUnreadCount}
              </span>
            )}
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-96 p-0" align="end" data-testid="panel-notifications">
          <div className="p-4 border-b">
            <div className="flex items-center justify-between gap-2 flex-wrap">
              <h3 className="text-lg font-semibold" data-testid="text-notifications-title">
                Notifications
              </h3>
              <div className="flex items-center gap-1">
                {displayUnreadCount > 0 && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => markAllAsReadMutation.mutate()}
                    disabled={markAllAsReadMutation.isPending}
                    data-testid="button-mark-all-read"
                  >
                    Mark all read
                  </Button>
                )}
                {activeNotifications.length > 0 && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => clearAllMutation.mutate()}
                    disabled={clearAllMutation.isPending}
                    data-testid="button-clear-all-notifications"
                  >
                    Clear all
                  </Button>
                )}
              </div>
            </div>
          </div>

          <Tabs defaultValue="all" className="w-full">
            <TabsList
              className={`w-full grid rounded-none border-b text-xs`}
              style={{ gridTemplateColumns: `repeat(${tabCount}, minmax(0, 1fr))` }}
              data-testid="tabs-notifications"
            >
              <TabsTrigger value="all" className="text-xs px-1" data-testid="tab-all">
                All
                {displayUnreadCount > 0 && (
                  <Badge variant="secondary" className="ml-1 text-[10px] px-1" data-testid="badge-all-count">
                    {displayUnreadCount}
                  </Badge>
                )}
              </TabsTrigger>
              <TabsTrigger value="messages" className="text-xs px-1" data-testid="tab-messages">
                Msgs
                {messageNotifications.filter((n) => !n.read).length > 0 && (
                  <Badge variant="secondary" className="ml-1 text-[10px] px-1" data-testid="badge-messages-count">
                    {messageNotifications.filter((n) => !n.read).length}
                  </Badge>
                )}
              </TabsTrigger>
              <TabsTrigger value="approvals" className="text-xs px-1" data-testid="tab-approvals">
                Jobs
                {approvalNotifications.filter((n) => !n.read).length > 0 && (
                  <Badge variant="secondary" className="ml-1 text-[10px] px-1" data-testid="badge-approvals-count">
                    {approvalNotifications.filter((n) => !n.read).length}
                  </Badge>
                )}
              </TabsTrigger>
              <TabsTrigger value="system" className="text-xs px-1" data-testid="tab-system">
                System
                {systemNotifications.filter((n) => !n.read).length > 0 && (
                  <Badge variant="secondary" className="ml-1 text-[10px] px-1" data-testid="badge-system-count">
                    {systemNotifications.filter((n) => !n.read).length}
                  </Badge>
                )}
              </TabsTrigger>
              {spamFilterEnabled && (
                <TabsTrigger value="spam" className="text-xs px-1" data-testid="tab-spam">
                  Spam
                  {spamNotifications.filter((n) => !n.read).length > 0 && (
                    <Badge variant="secondary" className="ml-1 text-[10px] px-1" data-testid="badge-spam-count">
                      {spamNotifications.filter((n) => !n.read).length}
                    </Badge>
                  )}
                </TabsTrigger>
              )}
            </TabsList>

            <ScrollArea className="h-[400px]" data-testid="scroll-notifications">
              <TabsContent value="all" className="m-0">
                {activeNotifications.length === 0 ? (
                  <EmptyState message="No notifications yet" />
                ) : (
                  activeNotifications.map((notification) => (
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
                  <EmptyState message="No job notifications" />
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

              {spamFilterEnabled && (
                <TabsContent value="spam" className="m-0">
                  {spamNotifications.length === 0 ? (
                    <EmptyState message="No spam notifications" />
                  ) : (
                    spamNotifications.map((notification) => (
                      <NotificationItem key={notification.id} notification={notification} />
                    ))
                  )}
                </TabsContent>
              )}
            </ScrollArea>
          </Tabs>
        </PopoverContent>
      </Popover>

      <AlertDialog open={deleteConfirmOpen} onOpenChange={setDeleteConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Dismiss Notification?</AlertDialogTitle>
            <AlertDialogDescription>
              This will hide the notification from your bell. It will still be visible in your Notifications log.
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
              data-testid="button-confirm-delete"
            >
              Dismiss
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
