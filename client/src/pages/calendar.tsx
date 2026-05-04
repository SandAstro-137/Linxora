import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useAuth } from "@/lib/auth-context";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { ChevronLeft, ChevronRight, Plus, X } from "lucide-react";

interface CalendarEvent {
  id: string;
  title: string;
  description: string;
  startTime: string;
  endTime: string;
  createdBy: string;
  type: "event" | "pto" | "meeting";
  ptoRequestId?: string;
  createdAt: string;
}

export default function CalendarPage() {
  const { user } = useAuth();
  const { toast } = useToast();

  const { data: calendarEvents = [] } = useQuery<CalendarEvent[]>({
    queryKey: ["/api/calendar/events"],
    refetchInterval: 30000,
  });

  const [calendarMonth, setCalendarMonth] = useState(() => {
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth(), 1);
  });
  const [showAddEvent, setShowAddEvent] = useState(false);
  const [selectedDay, setSelectedDay] = useState<Date | null>(null);
  const [newEventTitle, setNewEventTitle] = useState("");
  const [newEventDesc, setNewEventDesc] = useState("");
  const [newEventStart, setNewEventStart] = useState("");
  const [newEventEnd, setNewEventEnd] = useState("");
  const [viewingEvent, setViewingEvent] = useState<CalendarEvent | null>(null);

  const createEventMutation = useMutation({
    mutationFn: (data: { title: string; description: string; startTime: string; endTime: string }) =>
      apiRequest("POST", "/api/calendar/events", data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/calendar/events"] });
      setShowAddEvent(false);
      setNewEventTitle("");
      setNewEventDesc("");
      setNewEventStart("");
      setNewEventEnd("");
      toast({ title: "Event created", description: "Your event has been added to the shared calendar." });
    },
    onError: (error: any) => {
      toast({ title: "Failed to create event", description: error?.message || "Please try again.", variant: "destructive" });
    },
  });

  const deleteEventMutation = useMutation({
    mutationFn: (id: string) => apiRequest("DELETE", `/api/calendar/events/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/calendar/events"] });
      setViewingEvent(null);
      toast({ title: "Event deleted" });
    },
    onError: () => {
      toast({ title: "Failed to delete event", variant: "destructive" });
    },
  });

  const handleDayClick = (date: Date) => {
    setSelectedDay(date);
    const pad = (n: number) => String(n).padStart(2, "0");
    const dateStr = `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
    setNewEventStart(`${dateStr}T09:00`);
    setNewEventEnd(`${dateStr}T10:00`);
    setShowAddEvent(true);
  };

  const handleSubmitEvent = () => {
    if (!newEventTitle.trim() || !newEventStart || !newEventEnd) {
      toast({ title: "Missing fields", description: "Please fill in the title, start time, and end time.", variant: "destructive" });
      return;
    }
    createEventMutation.mutate({
      title: newEventTitle,
      description: newEventDesc,
      startTime: new Date(newEventStart).toISOString(),
      endTime: new Date(newEventEnd).toISOString(),
    });
  };

  const year = calendarMonth.getFullYear();
  const month = calendarMonth.getMonth();
  const firstDay = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const today = new Date();

  const cells: JSX.Element[] = [];
  for (let i = 0; i < firstDay; i++) {
    cells.push(
      <div key={`empty-${i}`} className="min-h-[100px] border-r border-b bg-muted/20" />
    );
  }
  for (let day = 1; day <= daysInMonth; day++) {
    const cellDate = new Date(year, month, day);
    const isToday =
      today.getFullYear() === year &&
      today.getMonth() === month &&
      today.getDate() === day;

    const dayEvents = calendarEvents.filter(ev => {
      const start = new Date(ev.startTime);
      const end = new Date(ev.endTime);
      const cell = new Date(year, month, day);
      const cellEnd = new Date(year, month, day, 23, 59, 59);
      return start <= cellEnd && end >= cell;
    });

    cells.push(
      <div
        key={day}
        className={`min-h-[100px] border-r border-b p-1 flex flex-col gap-1 cursor-pointer hover-elevate ${isToday ? "bg-primary/5" : ""}`}
        onClick={() => handleDayClick(cellDate)}
        data-testid={`cell-day-${day}`}
      >
        <span
          className={`text-xs font-medium self-end w-6 h-6 flex items-center justify-center rounded-full ${
            isToday ? "bg-primary text-primary-foreground" : "text-muted-foreground"
          }`}
        >
          {day}
        </span>
        {dayEvents.slice(0, 3).map(ev => (
          <div
            key={ev.id}
            className={`text-xs rounded px-1.5 py-0.5 truncate font-medium cursor-pointer ${
              ev.type === "pto"
                ? "bg-amber-500/20 text-amber-700 dark:text-amber-300"
                : ev.type === "meeting"
                ? "bg-green-500/20 text-green-700 dark:text-green-300"
                : "bg-blue-500/20 text-blue-700 dark:text-blue-300"
            }`}
            title={ev.title}
            data-testid={`chip-event-${ev.id}`}
            onClick={e => { e.stopPropagation(); setViewingEvent(ev); }}
          >
            {ev.title}
          </div>
        ))}
        {dayEvents.length > 3 && (
          <span className="text-xs text-muted-foreground pl-1">+{dayEvents.length - 3} more</span>
        )}
      </div>
    );
  }

  const total = firstDay + daysInMonth;
  const trailing = total % 7 === 0 ? 0 : 7 - (total % 7);
  for (let i = 0; i < trailing; i++) {
    cells.push(
      <div key={`trail-${i}`} className="min-h-[100px] border-r border-b bg-muted/20" />
    );
  }

  const rows: JSX.Element[][] = [];
  for (let i = 0; i < cells.length; i += 7) {
    rows.push(cells.slice(i, i + 7));
  }

  const monthStart = new Date(year, month, 1);
  const monthEnd = new Date(year, month + 1, 0, 23, 59, 59);
  const monthEvents = calendarEvents
    .filter(ev => new Date(ev.startTime) <= monthEnd && new Date(ev.endTime) >= monthStart)
    .sort((a, b) => new Date(a.startTime).getTime() - new Date(b.startTime).getTime());

  const canDelete = (ev: CalendarEvent) =>
    ev.createdBy === user?.id || ["head_of_moderation", "founder"].includes(user?.role || "");

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold">Team Calendar</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            Shared calendar for the moderation department
          </p>
        </div>
        <Button onClick={() => { setSelectedDay(new Date()); setShowAddEvent(true); }} data-testid="button-add-event">
          <Plus className="w-4 h-4 mr-2" />
          Add Event
        </Button>
      </div>

      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-2">
          <Button
            size="icon"
            variant="outline"
            onClick={() => setCalendarMonth(m => new Date(m.getFullYear(), m.getMonth() - 1, 1))}
            data-testid="button-calendar-prev"
          >
            <ChevronLeft className="w-4 h-4" />
          </Button>
          <h2 className="text-lg font-semibold min-w-[180px] text-center">
            {calendarMonth.toLocaleDateString("en-US", { month: "long", year: "numeric" })}
          </h2>
          <Button
            size="icon"
            variant="outline"
            onClick={() => setCalendarMonth(m => new Date(m.getFullYear(), m.getMonth() + 1, 1))}
            data-testid="button-calendar-next"
          >
            <ChevronRight className="w-4 h-4" />
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              const now = new Date();
              setCalendarMonth(new Date(now.getFullYear(), now.getMonth(), 1));
            }}
            data-testid="button-calendar-today"
          >
            Today
          </Button>
        </div>
        <div className="flex items-center gap-4 text-xs text-muted-foreground flex-wrap">
          <span className="flex items-center gap-1.5">
            <span className="inline-block w-3 h-3 rounded-sm bg-blue-500/80" />
            Team Event
          </span>
          <span className="flex items-center gap-1.5">
            <span className="inline-block w-3 h-3 rounded-sm bg-amber-500/80" />
            Approved PTO
          </span>
          <span className="flex items-center gap-1.5">
            <span className="inline-block w-3 h-3 rounded-sm bg-green-500/80" />
            Meeting
          </span>
        </div>
      </div>

      <Card>
        <CardContent className="p-0">
          <div className="grid grid-cols-7 border-b">
            {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map(d => (
              <div key={d} className="py-2.5 text-center text-xs font-medium text-muted-foreground">
                {d}
              </div>
            ))}
          </div>
          {rows.map((row, ri) => (
            <div key={ri} className="grid grid-cols-7">
              {row}
            </div>
          ))}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Events This Month</CardTitle>
        </CardHeader>
        <CardContent>
          {monthEvents.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-6">No events this month.</p>
          ) : (
            <div className="space-y-2">
              {monthEvents.map(ev => {
                const start = new Date(ev.startTime);
                const end = new Date(ev.endTime);
                return (
                  <div
                    key={ev.id}
                    className="flex items-start justify-between gap-3 p-3 rounded-md bg-muted/40 cursor-pointer hover-elevate"
                    data-testid={`row-event-${ev.id}`}
                    onClick={() => setViewingEvent(ev)}
                  >
                    <div className="flex items-start gap-3 flex-1 min-w-0">
                      <span
                        className={`mt-1.5 shrink-0 w-2.5 h-2.5 rounded-full ${
                          ev.type === "pto" ? "bg-amber-500" : ev.type === "meeting" ? "bg-green-500" : "bg-blue-500"
                        }`}
                      />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-medium truncate">{ev.title}</span>
                          {ev.type === "pto" && (
                            <Badge variant="outline" className="text-xs shrink-0">PTO</Badge>
                          )}
                          {ev.type === "meeting" && (
                            <Badge variant="outline" className="text-xs shrink-0">Meeting</Badge>
                          )}
                        </div>
                        {ev.description && (
                          <p className="text-xs text-muted-foreground mt-0.5 truncate">{ev.description}</p>
                        )}
                        <p className="text-xs text-muted-foreground mt-1">
                          {start.toLocaleDateString("en-US", { month: "short", day: "numeric" })}
                          {start.toDateString() !== end.toDateString() && (
                            <> &ndash; {end.toLocaleDateString("en-US", { month: "short", day: "numeric" })}</>
                          )}
                          {ev.type !== "pto" && (
                            <>
                              {" "}
                              &middot;{" "}
                              {start.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })} &ndash;{" "}
                              {end.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })}
                            </>
                          )}
                        </p>
                      </div>
                    </div>
                    {canDelete(ev) && (
                      <Button
                        size="icon"
                        variant="ghost"
                        className="shrink-0"
                        onClick={e => { e.stopPropagation(); deleteEventMutation.mutate(ev.id); }}
                        disabled={deleteEventMutation.isPending}
                        data-testid={`button-delete-event-${ev.id}`}
                      >
                        <X className="w-4 h-4" />
                      </Button>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Event Detail Popup */}
      <Dialog open={!!viewingEvent} onOpenChange={open => { if (!open) setViewingEvent(null); }}>
        {viewingEvent && (
          <DialogContent>
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2 pr-8">
                <span
                  className={`shrink-0 w-3 h-3 rounded-full ${
                    viewingEvent.type === "pto" ? "bg-amber-500" : viewingEvent.type === "meeting" ? "bg-green-500" : "bg-blue-500"
                  }`}
                />
                {viewingEvent.title}
              </DialogTitle>
              {viewingEvent.type !== "event" && (
                <div className="mt-1">
                  <Badge variant="outline" className="text-xs">
                    {viewingEvent.type === "pto" ? "PTO" : "Meeting"}
                  </Badge>
                </div>
              )}
            </DialogHeader>
            <div className="space-y-4 py-2">
              {viewingEvent.description && (
                <div className="space-y-1">
                  <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Description</p>
                  <p className="text-sm">{viewingEvent.description}</p>
                </div>
              )}
              <div className="space-y-1">
                <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Time</p>
                <p className="text-sm">
                  {new Date(viewingEvent.startTime).toLocaleDateString("en-US", { weekday: "short", month: "long", day: "numeric", year: "numeric" })}
                </p>
                <p className="text-sm text-muted-foreground">
                  {new Date(viewingEvent.startTime).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })}
                  {" "}&ndash;{" "}
                  {new Date(viewingEvent.endTime).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })}
                  {new Date(viewingEvent.startTime).toDateString() !== new Date(viewingEvent.endTime).toDateString() && (
                    <> ({new Date(viewingEvent.endTime).toLocaleDateString("en-US", { month: "short", day: "numeric" })})</>
                  )}
                </p>
              </div>
            </div>
            <DialogFooter className="gap-2">
              {canDelete(viewingEvent) && (
                <Button
                  variant="destructive"
                  onClick={() => deleteEventMutation.mutate(viewingEvent.id)}
                  disabled={deleteEventMutation.isPending}
                  data-testid="button-delete-event-dialog"
                >
                  {deleteEventMutation.isPending ? "Deleting..." : "Delete Event"}
                </Button>
              )}
              <Button variant="outline" onClick={() => setViewingEvent(null)}>
                Close
              </Button>
            </DialogFooter>
          </DialogContent>
        )}
      </Dialog>

      {/* Add Event Dialog */}
      <Dialog open={showAddEvent} onOpenChange={open => { setShowAddEvent(open); if (!open) { setNewEventTitle(""); setNewEventDesc(""); setNewEventStart(""); setNewEventEnd(""); } }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add Calendar Event</DialogTitle>
            <DialogDescription>
              This event will be visible to all moderators, the Head of Moderation, and the Founder.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-1.5">
              <Label htmlFor="cal-title">
                Title <span className="text-destructive">*</span>
              </Label>
              <Input
                id="cal-title"
                placeholder="Event title"
                value={newEventTitle}
                onChange={e => setNewEventTitle(e.target.value)}
                data-testid="input-event-title"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="cal-desc">Description</Label>
              <Textarea
                id="cal-desc"
                placeholder="Optional description"
                value={newEventDesc}
                onChange={e => setNewEventDesc(e.target.value)}
                rows={3}
                data-testid="input-event-description"
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="cal-start">
                  Start Time <span className="text-destructive">*</span>
                </Label>
                <Input
                  id="cal-start"
                  type="datetime-local"
                  value={newEventStart}
                  onChange={e => setNewEventStart(e.target.value)}
                  data-testid="input-event-start"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="cal-end">
                  End Time <span className="text-destructive">*</span>
                </Label>
                <Input
                  id="cal-end"
                  type="datetime-local"
                  value={newEventEnd}
                  onChange={e => setNewEventEnd(e.target.value)}
                  data-testid="input-event-end"
                />
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowAddEvent(false)}>
              Cancel
            </Button>
            <Button
              onClick={handleSubmitEvent}
              disabled={createEventMutation.isPending}
              data-testid="button-submit-event"
            >
              {createEventMutation.isPending ? "Creating..." : "Create Event"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
