import { useState, useEffect } from "react";
import { useMutation } from "@tanstack/react-query";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Flag, AlertTriangle, Bug, Users, ArrowLeft } from "lucide-react";
import { Card } from "@/components/ui/card";

interface ReportDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  targetId: string;
  reportType: "job" | "user" | "message" | "bug";
  targetName?: string;
  allowTypeSelection?: boolean;
}

const BUG_REASONS = [
  { value: "ui_issue", label: "Visual or layout issue" },
  { value: "broken_feature", label: "Feature not working correctly" },
  { value: "performance", label: "Slow or unresponsive" },
  { value: "data_issue", label: "Incorrect or missing data" },
  { value: "other", label: "Other" },
];

const MEMBER_REASONS = [
  { value: "harassment", label: "Harassment or bullying" },
  { value: "threats", label: "Threats or intimidation" },
  { value: "hate_speech", label: "Hate speech or discrimination" },
  { value: "fraud", label: "Scam or fraudulent activity" },
  { value: "spam", label: "Spamming" },
  { value: "impersonation", label: "Impersonation" },
  { value: "inappropriate", label: "Inappropriate content" },
  { value: "other", label: "Other" },
];

const JOB_REASONS = [
  { value: "inappropriate", label: "Inappropriate content" },
  { value: "scam", label: "Suspected scam or fraud" },
  { value: "misleading", label: "Misleading information" },
  { value: "spam", label: "Spam or duplicate" },
  { value: "other", label: "Other" },
];

const MESSAGE_REASONS = [
  { value: "harassment", label: "Harassment or threats" },
  { value: "inappropriate", label: "Inappropriate content" },
  { value: "spam", label: "Spam" },
  { value: "other", label: "Other" },
];

const MEMBER_FOLLOWUP_QUESTIONS: Record<string, string> = {
  harassment: "Please describe what happened. Include specific examples of the harassment or bullying behavior.",
  threats: "Please describe the threatening behavior. Include any specific messages or actions.",
  hate_speech: "Please describe the discriminatory content or behavior you observed.",
  fraud: "Please describe the fraudulent activity. Include any evidence such as false promises or suspicious transactions.",
  spam: "Please describe the spamming behavior. How many times did this occur?",
  impersonation: "Who is this person impersonating? Please provide details.",
  inappropriate: "Please describe the inappropriate content or behavior.",
  other: "Please describe what happened in detail.",
};

const BUG_FOLLOWUP_QUESTIONS: Record<string, string> = {
  ui_issue: "Describe what looks wrong and where. What did you expect to see instead?",
  broken_feature: "Which feature isn't working? What happens when you try to use it?",
  performance: "Which part of the platform is slow? How long does it take?",
  data_issue: "What data is incorrect or missing? What do you expect to see?",
  other: "Please describe the issue in detail.",
};

export function ReportDialog({ open, onOpenChange, targetId, reportType, targetName, allowTypeSelection }: ReportDialogProps) {
  const { toast } = useToast();
  const [step, setStep] = useState<"type_select" | "details">(allowTypeSelection ? "type_select" : "details");
  const [selectedType, setSelectedType] = useState<"bug" | "user">(reportType === "bug" ? "bug" : "user");
  const [reason, setReason] = useState("");
  const [description, setDescription] = useState("");
  const [targetUsername, setTargetUsername] = useState("");

  useEffect(() => {
    if (open) {
      setStep(allowTypeSelection ? "type_select" : "details");
      setSelectedType(reportType === "bug" ? "bug" : "user");
      setReason("");
      setDescription("");
      setTargetUsername("");
    }
  }, [open, allowTypeSelection, reportType]);

  const effectiveType = allowTypeSelection ? selectedType : reportType;

  const resolvedTargetId = () => {
    if (effectiveType === "bug") return "platform";
    if (allowTypeSelection && effectiveType === "user") return targetUsername.trim() || "unknown";
    return targetId;
  };

  const submitReportMutation = useMutation({
    mutationFn: () => apiRequest("POST", "/api/reports", {
      reportType: effectiveType,
      targetId: resolvedTargetId(),
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
    if (effectiveType === "user" && allowTypeSelection && !targetUsername.trim()) {
      toast({
        title: "Please identify the user",
        description: "Enter the user ID of the person you're reporting",
        variant: "destructive",
      });
      return;
    }
    if (!reason) {
      toast({
        title: "Please select a reason",
        description: "Choose why you're reporting this",
        variant: "destructive",
      });
      return;
    }
    if (!description.trim()) {
      toast({
        title: "Please provide details",
        description: "We need more information to investigate this report",
        variant: "destructive",
      });
      return;
    }
    submitReportMutation.mutate();
  };

  const getReasons = () => {
    switch (effectiveType) {
      case "bug": return BUG_REASONS;
      case "user": return MEMBER_REASONS;
      case "job": return JOB_REASONS;
      case "message": return MESSAGE_REASONS;
      default: return MEMBER_REASONS;
    }
  };

  const getFollowupPrompt = () => {
    if (!reason) return "Provide any additional context that might help our moderators...";
    if (effectiveType === "bug") return BUG_FOLLOWUP_QUESTIONS[reason] || BUG_FOLLOWUP_QUESTIONS.other;
    if (effectiveType === "user") return MEMBER_FOLLOWUP_QUESTIONS[reason] || MEMBER_FOLLOWUP_QUESTIONS.other;
    return "Provide any additional context that might help our moderators...";
  };

  const reasons = getReasons();
  const typeLabel = effectiveType === "job" ? "Job" : effectiveType === "user" ? "Member" : effectiveType === "bug" ? "Bug" : "Message";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md" data-testid="modal-report">
        {step === "type_select" && (
          <>
            <DialogHeader>
              <div className="flex items-center gap-2">
                <div className="p-2 rounded-full bg-destructive/10">
                  <Flag className="h-5 w-5 text-destructive" />
                </div>
                <DialogTitle>Submit a Report</DialogTitle>
              </div>
              <DialogDescription>
                What would you like to report?
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-3 py-4">
              <Card
                className="p-4 cursor-pointer hover-elevate"
                onClick={() => {
                  setSelectedType("bug");
                  setStep("details");
                  setReason("");
                  setDescription("");
                }}
                data-testid="card-report-type-bug"
              >
                <div className="flex items-center gap-3">
                  <div className="p-2 rounded-full bg-muted">
                    <Bug className="h-5 w-5 text-muted-foreground" />
                  </div>
                  <div>
                    <p className="font-medium text-sm">Report a Bug</p>
                    <p className="text-xs text-muted-foreground">Something on the platform isn't working correctly</p>
                  </div>
                </div>
              </Card>

              <Card
                className="p-4 cursor-pointer hover-elevate"
                onClick={() => {
                  setSelectedType("user");
                  setStep("details");
                  setReason("");
                  setDescription("");
                }}
                data-testid="card-report-type-member"
              >
                <div className="flex items-center gap-3">
                  <div className="p-2 rounded-full bg-muted">
                    <Users className="h-5 w-5 text-muted-foreground" />
                  </div>
                  <div>
                    <p className="font-medium text-sm">Report a Member</p>
                    <p className="text-xs text-muted-foreground">Someone is behaving inappropriately or breaking rules</p>
                  </div>
                </div>
              </Card>
            </div>
          </>
        )}

        {step === "details" && (
          <>
            <DialogHeader>
              <div className="flex items-center gap-2">
                <div className="p-2 rounded-full bg-destructive/10">
                  <AlertTriangle className="h-5 w-5 text-destructive" />
                </div>
                <DialogTitle>Report {typeLabel}</DialogTitle>
              </div>
              <DialogDescription>
                {effectiveType === "bug"
                  ? "Help us improve Linxora by describing the issue you encountered."
                  : effectiveType === "user" && allowTypeSelection
                    ? "Tell us about the member's behavior so our moderators can investigate."
                    : targetName 
                      ? `Report "${targetName}" for violating our community guidelines.` 
                      : `Report this ${typeLabel.toLowerCase()} for violating our community guidelines.`}
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-4 py-4">
              {allowTypeSelection && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    setStep("type_select");
                    setReason("");
                    setDescription("");
                  }}
                  className="gap-1 -mt-2"
                  data-testid="button-back-to-type"
                >
                  <ArrowLeft className="w-3 h-3" />
                  Change report type
                </Button>
              )}

              {effectiveType === "user" && allowTypeSelection && (
                <div className="space-y-2">
                  <Label htmlFor="targetUsername">Who are you reporting? (their user ID)</Label>
                  <Textarea
                    id="targetUsername"
                    placeholder="Enter the user ID of the person you're reporting (found on their profile)..."
                    value={targetUsername}
                    onChange={(e) => setTargetUsername(e.target.value)}
                    rows={1}
                    className="resize-none"
                    data-testid="input-report-target"
                  />
                </div>
              )}

              <div className="space-y-2">
                <Label htmlFor="reason">
                  {effectiveType === "bug" ? "What kind of issue?" : "What did they do?"}
                </Label>
                <Select value={reason} onValueChange={(val) => { setReason(val); setDescription(""); }}>
                  <SelectTrigger data-testid="select-report-reason">
                    <SelectValue placeholder={effectiveType === "bug" ? "Select the type of issue" : "Select what happened"} />
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

              {reason && (
                <div className="space-y-2">
                  <Label htmlFor="description">
                    {effectiveType === "bug" ? "Describe the issue" : "Tell us what happened"}
                  </Label>
                  <Textarea
                    id="description"
                    placeholder={getFollowupPrompt()}
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    rows={4}
                    data-testid="input-report-description"
                  />
                </div>
              )}
            </div>

            <DialogFooter className="gap-2">
              <Button variant="outline" onClick={() => onOpenChange(false)} data-testid="button-cancel-report">
                Cancel
              </Button>
              <Button 
                onClick={handleSubmit} 
                disabled={submitReportMutation.isPending || !reason || !description.trim() || (effectiveType === "user" && allowTypeSelection && !targetUsername.trim())}
                variant="destructive"
                data-testid="button-submit-report"
              >
                <Flag className="h-4 w-4 mr-1" />
                {submitReportMutation.isPending ? "Submitting..." : "Submit Report"}
              </Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
