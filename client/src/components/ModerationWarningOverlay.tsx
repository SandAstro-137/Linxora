import { useMutation, useQuery } from "@tanstack/react-query";
import { AlertTriangle } from "lucide-react";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";

interface PendingWarning {
  id: string;
  issuedAt: string | null;
  moderatorMessage: string;
  reportReason: string | null;
  reportText: string | null;
  moderator: { username: string } | null;
}

/**
 * Official warnings are not notifications. Anyone with an unacknowledged
 * warning gets this blocking screen — at login, and within a few seconds if it
 * is issued while they are already online — until they acknowledge it.
 */
export function ModerationWarningOverlay() {
  const { data: warnings = [] } = useQuery<PendingWarning[]>({
    queryKey: ["/api/moderation/warnings/pending"],
    // Poll so a warning issued to someone already online appears immediately.
    refetchInterval: 10000,
    staleTime: 0,
    retry: false,
  });

  const acknowledgeMutation = useMutation({
    mutationFn: (id: string) => apiRequest("POST", `/api/moderation/warnings/${id}/acknowledge`, {}),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/moderation/warnings/pending"] });
      queryClient.invalidateQueries({ queryKey: ["/api/notifications"] });
      queryClient.invalidateQueries({ queryKey: ["/api/notifications/unread-count"] });
    },
  });

  const warning = warnings[0];
  if (!warning) return null;

  const reasonLabel = warning.reportReason
    ? warning.reportReason.replace(/_/g, " ").replace(/^\w/, (c) => c.toUpperCase())
    : "Not specified";
  const issuedAt = warning.issuedAt ? new Date(warning.issuedAt).toLocaleString() : null;

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/80 p-4"
      role="alertdialog"
      aria-modal="true"
      aria-labelledby="moderation-warning-title"
      data-testid="overlay-moderation-warning"
    >
      <div className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-xl border-2 border-destructive bg-background p-6 shadow-2xl">
        <div className="flex items-start gap-3">
          <div className="mt-0.5 rounded-full bg-destructive/10 p-2">
            <AlertTriangle className="h-6 w-6 text-destructive" />
          </div>
          <div>
            <h2 id="moderation-warning-title" className="text-xl font-bold" data-testid="text-warning-title">
              Official Warning
            </h2>
            <p className="text-sm text-muted-foreground">
              The moderation team has issued you a warning
              {issuedAt ? ` on ${issuedAt}` : ""}
              {warning.moderator?.username ? ` (${warning.moderator.username})` : ""}.
            </p>
          </div>
        </div>

        <div className="mt-5 space-y-4">
          <section>
            <h3 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">Reason</h3>
            <p className="mt-1 font-medium" data-testid="text-warning-reason">{reasonLabel}</p>
          </section>

          <section>
            <h3 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
              What was reported
            </h3>
            <p className="mt-1 whitespace-pre-wrap rounded-md bg-muted p-3 text-sm" data-testid="text-warning-report">
              {warning.reportText?.trim() || "No description was included with the report."}
            </p>
          </section>

          <section>
            <h3 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
              Message from the moderation team
            </h3>
            <p className="mt-1 whitespace-pre-wrap rounded-md border border-destructive/30 bg-destructive/5 p-3 text-sm" data-testid="text-warning-message">
              {warning.moderatorMessage}
            </p>
          </section>
        </div>

        <p className="mt-5 text-sm text-muted-foreground">
          Please review the platform rules. Further violations can lead to suspension or a permanent ban.
        </p>

        <Button
          className="mt-4 w-full"
          onClick={() => acknowledgeMutation.mutate(warning.id)}
          disabled={acknowledgeMutation.isPending}
          data-testid="button-acknowledge-warning"
        >
          {acknowledgeMutation.isPending ? "Confirming..." : "I understand"}
        </Button>
      </div>
    </div>
  );
}
