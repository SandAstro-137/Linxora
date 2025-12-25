import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Flag, AlertTriangle } from "lucide-react";

interface ReportDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  targetId: string;
  reportType: "job" | "user" | "message";
  targetName?: string;
}

const REPORT_REASONS = {
  job: [
    { value: "inappropriate", label: "Inappropriate content" },
    { value: "scam", label: "Suspected scam or fraud" },
    { value: "misleading", label: "Misleading information" },
    { value: "spam", label: "Spam or duplicate" },
    { value: "other", label: "Other" },
  ],
  user: [
    { value: "harassment", label: "Harassment or abuse" },
    { value: "fraud", label: "Fraudulent activity" },
    { value: "spam", label: "Spamming" },
    { value: "impersonation", label: "Impersonation" },
    { value: "other", label: "Other" },
  ],
  message: [
    { value: "harassment", label: "Harassment or threats" },
    { value: "inappropriate", label: "Inappropriate content" },
    { value: "spam", label: "Spam" },
    { value: "other", label: "Other" },
  ],
};

export function ReportDialog({ open, onOpenChange, targetId, reportType, targetName }: ReportDialogProps) {
  const { toast } = useToast();
  const [reason, setReason] = useState("");
  const [description, setDescription] = useState("");

  const submitReportMutation = useMutation({
    mutationFn: () => apiRequest("POST", "/api/reports", {
      reportType,
      targetId,
      reason,
      description: description.trim() || undefined,
    }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/my-reports"] });
      toast({
        title: "Report submitted",
        description: "Thank you for your report. Our moderators will review it.",
      });
      onOpenChange(false);
      setReason("");
      setDescription("");
    },
    onError: (error: any) => {
      toast({
        title: "Failed to submit report",
        description: error?.message || "Please try again later",
        variant: "destructive",
      });
    },
  });

  const handleSubmit = () => {
    if (!reason) {
      toast({
        title: "Please select a reason",
        description: "Choose why you're reporting this content",
        variant: "destructive",
      });
      return;
    }
    submitReportMutation.mutate();
  };

  const reasons = REPORT_REASONS[reportType];
  const typeLabel = reportType === "job" ? "Job" : reportType === "user" ? "User" : "Message";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md" data-testid="modal-report">
        <DialogHeader>
          <div className="flex items-center gap-2">
            <div className="p-2 rounded-full bg-destructive/10">
              <AlertTriangle className="h-5 w-5 text-destructive" />
            </div>
            <DialogTitle>Report {typeLabel}</DialogTitle>
          </div>
          <DialogDescription>
            {targetName 
              ? `Report "${targetName}" for violating our community guidelines.` 
              : `Report this ${typeLabel.toLowerCase()} for violating our community guidelines.`}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          <div className="space-y-2">
            <Label htmlFor="reason">Reason for report</Label>
            <Select value={reason} onValueChange={setReason}>
              <SelectTrigger data-testid="select-report-reason">
                <SelectValue placeholder="Select a reason" />
              </SelectTrigger>
              <SelectContent>
                {reasons.map((r) => (
                  <SelectItem key={r.value} value={r.value}>
                    {r.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="description">Additional details (optional)</Label>
            <Textarea
              id="description"
              placeholder="Provide any additional context that might help our moderators..."
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={3}
              data-testid="input-report-description"
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} data-testid="button-cancel-report">
            Cancel
          </Button>
          <Button 
            onClick={handleSubmit} 
            disabled={submitReportMutation.isPending}
            variant="destructive"
            data-testid="button-submit-report"
          >
            <Flag className="h-4 w-4 mr-1" />
            {submitReportMutation.isPending ? "Submitting..." : "Submit Report"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
