import { useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Ban, Loader2, Search, ShieldAlert, ShieldCheck } from "lucide-react";

interface ManagedUser {
  id: string;
  userId: number;
  username: string;
  role: string;
  accountStatus: string | null;
  suspendedUntil: string | null;
  suspendedReason: string | null;
}

const roleLabels: Record<string, string> = {
  customer: "Customer",
  freelancer: "Freelancer",
  moderator: "Moderator",
  head_of_moderation: "Head of Moderation",
  founder: "Founder",
};

function isSuspended(user: ManagedUser) {
  return (
    user.accountStatus === "suspended" &&
    !!user.suspendedUntil &&
    new Date(user.suspendedUntil) > new Date()
  );
}

function statusLabel(user: ManagedUser) {
  if (user.accountStatus === "banned") return "Banned";
  if (isSuspended(user)) {
    return `Suspended until ${new Date(user.suspendedUntil!).toLocaleDateString()}`;
  }
  return "Active";
}

export function AccountStatusManager() {
  const { toast } = useToast();
  const [searchInput, setSearchInput] = useState("");
  const [submittedSearch, setSubmittedSearch] = useState("");
  const [suspendTarget, setSuspendTarget] = useState<ManagedUser | null>(null);
  const [banTarget, setBanTarget] = useState<ManagedUser | null>(null);
  const [reason, setReason] = useState("");
  const [duration, setDuration] = useState("7");

  const searchQuery = useQuery<ManagedUser[]>({
    queryKey: ["/api/moderation/users", submittedSearch],
    queryFn: async () => {
      const response = await fetch(
        `/api/moderation/users?search=${encodeURIComponent(submittedSearch)}`,
        { credentials: "include" }
      );
      if (!response.ok) throw new Error("Search failed");
      return response.json();
    },
    enabled: submittedSearch.length > 0,
    staleTime: 0,
  });

  const statusMutation = useMutation({
    mutationFn: async (payload: {
      id: string;
      action: "restore" | "suspend" | "ban";
      reason?: string;
      duration?: number;
    }) => {
      const response = await apiRequest(
        "POST",
        `/api/moderation/users/${payload.id}/status`,
        payload
      );
      return response.json();
    },
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: ["/api/moderation/users"] });
      setSuspendTarget(null);
      setBanTarget(null);
      setReason("");
      const data = _data as {
        cancelledJobRequests?: number;
        removedFromJobs?: number;
        cancelledFriendRequests?: number;
      } | undefined;
      const parts: string[] = [];
      if (data?.removedFromJobs) parts.push(`removed from ${data.removedFromJobs} job(s)`);
      if (data?.cancelledJobRequests) parts.push(`${data.cancelledJobRequests} job request(s) cancelled`);
      if (data?.cancelledFriendRequests) parts.push(`${data.cancelledFriendRequests} friend request(s) cancelled`);

      toast({
        title:
          variables.action === "restore"
            ? "Restrictions lifted"
            : variables.action === "suspend"
            ? "Account suspended"
            : "Account banned",
        description: parts.length
          ? `The account status has been updated: ${parts.join(", ")}.`
          : "The account status has been updated.",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Could not update status",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const submitSearch = (event: React.FormEvent) => {
    event.preventDefault();
    setSubmittedSearch(searchInput.trim());
  };

  const results = searchQuery.data ?? [];

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle className="text-lg flex items-center gap-2">
            <ShieldAlert className="w-5 h-5" />
            User Status
          </CardTitle>
          <CardDescription>
            Look up an account to suspend, ban, or lift an existing suspension or ban.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <form onSubmit={submitSearch} className="flex gap-2">
            <Input
              value={searchInput}
              onChange={(event) => setSearchInput(event.target.value)}
              placeholder="Search by username or user ID"
              data-testid="input-status-search"
            />
            <Button type="submit" className="gap-2" data-testid="button-status-search">
              <Search className="w-4 h-4" />
              Search
            </Button>
          </form>

          {searchQuery.isLoading && (
            <div className="space-y-2">
              <Skeleton className="h-20 w-full" />
              <Skeleton className="h-20 w-full" />
            </div>
          )}

          {!searchQuery.isLoading && submittedSearch && results.length === 0 && (
            <p className="text-sm text-muted-foreground" data-testid="text-status-no-results">
              No accounts matched "{submittedSearch}".
            </p>
          )}

          {results.map((user) => {
            const restricted = statusLabel(user) !== "Active";
            return (
              <div
                key={user.id}
                className="flex flex-col gap-3 rounded-md border p-4 sm:flex-row sm:items-center sm:justify-between"
                data-testid={`row-status-${user.userId}`}
              >
                <div className="space-y-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-medium">{user.username}</span>
                    <Badge variant="secondary">{roleLabels[user.role] ?? user.role}</Badge>
                    <Badge
                      variant={
                        user.accountStatus === "banned"
                          ? "destructive"
                          : isSuspended(user)
                          ? "outline"
                          : "secondary"
                      }
                      data-testid={`badge-status-${user.userId}`}
                    >
                      {statusLabel(user)}
                    </Badge>
                  </div>
                  <p className="text-xs text-muted-foreground">User ID: {user.userId}</p>
                  {user.suspendedReason && restricted && (
                    <p className="text-xs text-muted-foreground">
                      Reason: {user.suspendedReason}
                    </p>
                  )}
                </div>

                <div className="flex flex-wrap gap-2">
                  {restricted && (
                    <Button
                      size="sm"
                      variant="outline"
                      className="gap-1"
                      disabled={statusMutation.isPending}
                      onClick={() => statusMutation.mutate({ id: user.id, action: "restore" })}
                      data-testid={`button-restore-${user.userId}`}
                    >
                      <ShieldCheck className="w-4 h-4" />
                      Lift restriction
                    </Button>
                  )}
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => {
                      setSuspendTarget(user);
                      setReason("");
                      setDuration("7");
                    }}
                    data-testid={`button-suspend-${user.userId}`}
                  >
                    Suspend
                  </Button>
                  <Button
                    size="sm"
                    variant="destructive"
                    className="gap-1"
                    onClick={() => {
                      setBanTarget(user);
                      setReason("");
                    }}
                    data-testid={`button-ban-${user.userId}`}
                  >
                    <Ban className="w-4 h-4" />
                    Ban
                  </Button>
                </div>
              </div>
            );
          })}
        </CardContent>
      </Card>

      <Dialog
        open={suspendTarget !== null}
        onOpenChange={(open) => {
          if (!open) setSuspendTarget(null);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Suspend {suspendTarget?.username}</DialogTitle>
            <DialogDescription>
              The account will be blocked from signing in until the suspension ends.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Length</Label>
              <Select value={duration} onValueChange={setDuration}>
                <SelectTrigger data-testid="select-suspend-duration">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="1">1 day</SelectItem>
                  <SelectItem value="3">3 days</SelectItem>
                  <SelectItem value="7">7 days</SelectItem>
                  <SelectItem value="14">14 days</SelectItem>
                  <SelectItem value="30">30 days</SelectItem>
                  <SelectItem value="90">90 days</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Reason</Label>
              <Textarea
                value={reason}
                onChange={(event) => setReason(event.target.value)}
                placeholder="Shown to the user on their suspension screen"
                className="min-h-[80px]"
                data-testid="textarea-suspend-reason"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setSuspendTarget(null)}>
              Cancel
            </Button>
            <Button
              disabled={statusMutation.isPending || reason.trim().length < 5}
              onClick={() =>
                suspendTarget &&
                statusMutation.mutate({
                  id: suspendTarget.id,
                  action: "suspend",
                  reason: reason.trim(),
                  duration: Number(duration),
                })
              }
              data-testid="button-confirm-suspend"
            >
              {statusMutation.isPending && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              Suspend account
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={banTarget !== null}
        onOpenChange={(open) => {
          if (!open) setBanTarget(null);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Ban {banTarget?.username}</DialogTitle>
            <DialogDescription>
              A ban is permanent and blocks the account from signing in. It can be lifted from this
              page later.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <Label>Reason</Label>
            <Textarea
              value={reason}
              onChange={(event) => setReason(event.target.value)}
              placeholder="Shown to the user on their ban screen"
              className="min-h-[80px]"
              data-testid="textarea-ban-reason"
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setBanTarget(null)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              disabled={statusMutation.isPending || reason.trim().length < 5}
              onClick={() =>
                banTarget &&
                statusMutation.mutate({
                  id: banTarget.id,
                  action: "ban",
                  reason: reason.trim(),
                })
              }
              data-testid="button-confirm-ban"
            >
              {statusMutation.isPending && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              Ban account
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
