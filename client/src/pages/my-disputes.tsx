import { useQuery, useMutation } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { useToast } from "@/hooks/use-toast";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Gavel, ExternalLink, User, DollarSign, Clock, AlertTriangle, CheckCircle, MessageSquare, UserMinus, XCircle, ChevronDown } from "lucide-react";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { Link, useLocation } from "wouter";
import { formatDistanceToNow } from "date-fns";
import { useState } from "react";

interface Dispute {
  id: string;
  jobId: string;
  status: string;
  reason: string;
  category?: string | null;
  resolution: string | null;
  createdAt: string;
  resolvedAt: string | null;
  openedByUserId: string;
  moderatorId: string | null;
  freelancerAmount: string | null;
  customerRefund: string | null;
  jobTitle?: string;
  jobBudget?: string;
  openedByUsername?: string;
  openedByUserRole?: string | null;
  customerUsername?: string;
  freelancerUsername?: string;
  customerId?: string;
  freelancerId?: string;
}


function DisputeDetails({ reason }: { reason: string }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="mt-2">
      <button
        type="button"
        className="text-xs font-medium text-primary hover:underline inline-flex items-center gap-1"
        onClick={() => setOpen(o => !o)}
        data-testid="button-dispute-details"
      >
        {open ? "Hide details" : "View details"}
        <ChevronDown className={`w-3 h-3 transition-transform ${open ? "rotate-180" : ""}`} />
      </button>
      {open && (
        <p className="text-sm text-muted-foreground bg-muted p-3 rounded-md mt-1.5 whitespace-pre-wrap break-words" data-testid="dispute-details-text">
          {reason}
        </p>
      )}
    </div>
  );
}

export default function MyDisputesPage() {
  // Whether resolving this dispute should count against the freelancer(s)
  // completion rate. Defaults to ON (affect the rate).
  const [affectCompletionRate, setAffectCompletionRate] = useState(true);
  const { toast } = useToast();
  const [, setLocation] = useLocation();
  const [selectedDispute, setSelectedDispute] = useState<Dispute | null>(null);
  const [resolveDialogOpen, setResolveDialogOpen] = useState(false);
  const [freelancerAmount, setFreelancerAmount] = useState("");
  const [customerRefund, setCustomerRefund] = useState("");
  const [resolution, setResolution] = useState("");

  const { data: disputes = [], isLoading } = useQuery<Dispute[]>({
    queryKey: ["/api/disputes/mine"],
  });

  const createMeetingMutation = useMutation({
    mutationFn: async (jobId: string) => {
      const res = await apiRequest("POST", "/api/meetings", { jobId });
      return res.json();
    },
    onSuccess: (meeting: any) => {
      toast({ title: "Meeting opened", description: "A court-room meeting has been created for this job." });
      if (meeting?.id) setLocation(`/meeting/${meeting.id}`);
    },
    onError: (error: Error) => {
      toast({ title: "Could not open meeting", description: error.message || "Please try again.", variant: "destructive" });
    },
  });

  const relinquishDisputeMutation = useMutation({
    mutationFn: async (disputeId: string) => {
      const res = await apiRequest("POST", `/api/disputes/${disputeId}/relinquish`, {});
      return res.json();
    },
    onSuccess: () => {
      toast({ title: "Dispute relinquished", description: "The dispute has been returned to the moderation queue." });
      queryClient.invalidateQueries({ queryKey: ["/api/disputes/mine"] });
      queryClient.invalidateQueries({ queryKey: ["/api/disputes"] });
    },
    onError: (error: Error) => {
      toast({ title: "Could not relinquish dispute", description: error.message || "Please try again.", variant: "destructive" });
    },
  });

  const closeDisputeMutation = useMutation({
    mutationFn: async (disputeId: string) => {
      const res = await apiRequest("POST", `/api/disputes/${disputeId}/close`, { resolutionNotes: "Dispute closed without action — job continues as normal." });
      return res.json();
    },
    onSuccess: () => {
      toast({ title: "Dispute closed", description: "The dispute has been closed. The job continues as normal." });
      queryClient.invalidateQueries({ queryKey: ["/api/disputes/mine"] });
      queryClient.invalidateQueries({ queryKey: ["/api/disputes"] });
    },
    onError: (error: Error) => {
      toast({ title: "Could not close dispute", description: error.message || "Please try again.", variant: "destructive" });
    },
  });

  const resolveDisputeMutation = useMutation({
    mutationFn: async (data: { disputeId: string; resolution: string; freelancerAmount: string; customerRefund: string; affectCompletionRate: boolean }) => {
      const res = await apiRequest("POST", `/api/disputes/${data.disputeId}/resolve`, {
        resolutionNotes: data.resolution,
        freelancerAmount: parseFloat(data.freelancerAmount),
        customerRefund: parseFloat(data.customerRefund),
        affectCompletionRate: data.affectCompletionRate,
      });
      return res.json();
    },
    onSuccess: () => {
      toast({
        title: "Dispute resolved",
        description: "The dispute has been resolved and funds distributed.",
      });
      queryClient.invalidateQueries({ queryKey: ["/api/disputes/mine"] });
      queryClient.invalidateQueries({ queryKey: ["/api/disputes"] });
      setResolveDialogOpen(false);
      setSelectedDispute(null);
      setResolution("");
      setFreelancerAmount("");
      setCustomerRefund("");
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const inProgressDisputes = disputes.filter(d => d.status === "under_review" || d.status === "in_progress");
  const resolvedDisputes = disputes.filter(d => d.status === "resolved");

  if (isLoading) {
    return (
      <div className="p-6 max-w-4xl mx-auto space-y-6">
        <Skeleton className="h-10 w-48" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  const resolveBudget = parseFloat(selectedDispute?.jobBudget || "0");
  const resolveTotal = parseFloat(freelancerAmount || "0") + parseFloat(customerRefund || "0");
  const resolveTotalMatches = Math.abs(resolveTotal - resolveBudget) < 0.001;

  return (
    <div className="p-6 max-w-4xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <Gavel className="w-6 h-6" />
          My Disputes
        </h1>
        <p className="text-muted-foreground">
          Manage disputes you've claimed as a moderator
        </p>
      </div>

      {inProgressDisputes.length > 0 && (
        <div className="space-y-4">
          <h2 className="text-lg font-semibold flex items-center gap-2">
            <AlertTriangle className="w-5 h-5 text-yellow-500" />
            Active Disputes ({inProgressDisputes.length})
          </h2>
          {inProgressDisputes.map((dispute) => (
            <Card key={dispute.id} className="border-2 border-yellow-500/30" data-testid={`card-active-dispute-${dispute.id}`}>
              <CardHeader>
                <div className="flex items-start justify-between gap-4 flex-wrap">
                  <div className="flex-1">
                    <CardTitle className="mb-2">{dispute.jobTitle || "Dispute"}</CardTitle>
                    <CardDescription>
                      Opened {formatDistanceToNow(new Date(dispute.createdAt), { addSuffix: true })}
                      {dispute.openedByUsername && ` by ${dispute.openedByUsername}${dispute.openedByUserRole ? ` (${dispute.openedByUserRole === "customer" ? "Customer" : "Freelancer"})` : ""}`}
                    </CardDescription>
                  </div>
                  <div className="flex gap-2 flex-wrap">
                    {dispute.jobBudget && (
                      <Badge variant="secondary">
                        <DollarSign className="w-3 h-3 mr-1" />
                        ${dispute.jobBudget}
                      </Badge>
                    )}
                    <Badge variant="outline">
                      <Clock className="w-3 h-3 mr-1" />
                      Under Review
                    </Badge>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                <div>
                  <h4 className="font-semibold mb-2">Dispute Reason</h4>
                  <p className="text-sm font-medium">{dispute.category || "Other / Custom Issue"}</p>
                  <DisputeDetails reason={dispute.reason} />
                </div>

                <div className="grid grid-cols-2 gap-4 text-sm">
                  {dispute.customerUsername && (
                    <div>
                      <span className="text-muted-foreground">Customer:</span>{" "}
                      <Link href={`/user/${dispute.customerId}`} className="hover:underline" data-testid={`link-customer-${dispute.id}`}>
                        {dispute.customerUsername}
                      </Link>
                    </div>
                  )}
                  {dispute.freelancerUsername && (
                    <div>
                      <span className="text-muted-foreground">Freelancer:</span>{" "}
                      <Link href={`/user/${dispute.freelancerId}`} className="hover:underline" data-testid={`link-freelancer-${dispute.id}`}>
                        {dispute.freelancerUsername}
                      </Link>
                    </div>
                  )}
                </div>

                <div className="flex gap-2 flex-wrap pt-2">
                  <Link href={`/jobs/${dispute.jobId}`}>
                    <Button variant="outline" size="sm" data-testid={`button-view-job-${dispute.id}`}>
                      <ExternalLink className="w-4 h-4 mr-1" />
                      View Job Details
                    </Button>
                  </Link>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => createMeetingMutation.mutate(dispute.jobId)}
                    disabled={createMeetingMutation.isPending}
                    data-testid={`button-meeting-${dispute.id}`}
                  >
                    <MessageSquare className="w-4 h-4 mr-1" />
                    Meeting
                  </Button>
                  <Button
                    size="sm"
                    onClick={() => {
                      setSelectedDispute(dispute);
                      setFreelancerAmount(dispute.jobBudget || "0");
                      setCustomerRefund("0");
                      setResolution("");
                      setAffectCompletionRate(true);
                      setResolveDialogOpen(true);
                    }}
                    data-testid={`button-resolve-${dispute.id}`}
                  >
                    <Gavel className="w-4 h-4 mr-1" />
                    Resolve Dispute
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => relinquishDisputeMutation.mutate(dispute.id)}
                    disabled={relinquishDisputeMutation.isPending}
                    data-testid={`button-relinquish-${dispute.id}`}
                  >
                    <UserMinus className="w-4 h-4 mr-1" />
                    Relinquish
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => closeDisputeMutation.mutate(dispute.id)}
                    disabled={closeDisputeMutation.isPending}>
                    <XCircle className="w-4 h-4 mr-1" />
                    Close Dispute
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {resolvedDisputes.length > 0 && (
        <div className="space-y-4">
          <h2 className="text-lg font-semibold flex items-center gap-2">
            <CheckCircle className="w-5 h-5 text-green-500" />
            Resolved Disputes ({resolvedDisputes.length})
          </h2>
          {resolvedDisputes.map((dispute) => (
            <Card key={dispute.id} className="opacity-75" data-testid={`card-resolved-dispute-${dispute.id}`}>
              <CardHeader>
                <div className="flex items-start justify-between gap-4 flex-wrap">
                  <div className="flex-1">
                    <CardTitle className="mb-2">{dispute.jobTitle || "Dispute"}</CardTitle>
                    <CardDescription>
                      Resolved {dispute.resolvedAt && formatDistanceToNow(new Date(dispute.resolvedAt), { addSuffix: true })}
                    </CardDescription>
                  </div>
                  <Badge variant="secondary">
                    <CheckCircle className="w-3 h-3 mr-1" />
                    Resolved
                  </Badge>
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                {dispute.resolution && (
                  <div>
                    <h4 className="font-semibold mb-2">Resolution</h4>
                    <p className="text-sm text-muted-foreground">{dispute.resolution}</p>
                  </div>
                )}
                <div className="flex gap-4 text-sm">
                  {dispute.freelancerAmount && (
                    <span>
                      <span className="text-muted-foreground">Freelancer received:</span>{" "}
                      <span className="font-medium">${dispute.freelancerAmount}</span>
                    </span>
                  )}
                  {dispute.customerRefund && parseFloat(dispute.customerRefund) > 0 && (
                    <span>
                      <span className="text-muted-foreground">Customer refunded:</span>{" "}
                      <span className="font-medium">${dispute.customerRefund}</span>
                    </span>
                  )}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {disputes.length === 0 && (
        <Card>
          <CardContent className="pt-6 text-center">
            <Gavel className="w-12 h-12 mx-auto text-muted-foreground mb-4" />
            <h2 className="text-xl font-semibold mb-2">No Claimed Disputes</h2>
            <p className="text-muted-foreground mb-4">
              You haven't claimed any disputes yet. Visit the Moderation page to claim open disputes.
            </p>
            <Link href="/moderation">
              <Button variant="outline" data-testid="button-go-to-moderation">
                Go to Moderation Queue
              </Button>
            </Link>
          </CardContent>
        </Card>
      )}

      <Dialog open={resolveDialogOpen} onOpenChange={setResolveDialogOpen}>
        <DialogContent data-testid="dialog-resolve-dispute">
          <DialogHeader>
            <DialogTitle>Resolve Dispute</DialogTitle>
            <DialogDescription>
              As a moderator, decide how to split the escrowed funds between the freelancer and customer.
              Total budget: ${selectedDispute?.jobBudget || "0"}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="freelancerAmount">Amount to Freelancer ($)</Label>
              <Input
                type="number"
                id="freelancerAmount"
                value={freelancerAmount}
                onChange={(e) => setFreelancerAmount(e.target.value)}
                step="0.01"
                min="0"
                data-testid="input-freelancer-amount"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="customerRefund">Refund to Customer ($)</Label>
              <Input
                type="number"
                id="customerRefund"
                value={customerRefund}
                onChange={(e) => setCustomerRefund(e.target.value)}
                step="0.01"
                min="0"
                data-testid="input-customer-refund"
              />
            </div>
            {selectedDispute && (
              <>
                <p className={resolveTotalMatches ? "text-sm text-green-600 dark:text-green-400" : "text-sm text-red-600 dark:text-red-400"}>
                  Total distributed: ${resolveTotal.toFixed(2)} / ${resolveBudget.toFixed(2)}
                  {resolveTotalMatches ? " ✓" : ` — must total exactly $${resolveBudget.toFixed(2)}`}
                </p>
                <p className="text-xs text-muted-foreground">
                  The full budget must be distributed between the freelancer and customer. The freelancer's payout is reduced by the platform fee based on their level.
                </p>
              </>
            )}
            <div className="flex items-center justify-between gap-3 rounded-md border p-3">
              <div className="space-y-0.5">
                <Label className="text-sm font-medium">Affect freelancer completion rate</Label>
                <p className="text-xs text-muted-foreground">
                  On: this resolution counts against the assigned freelancer(s) completion rate.
                </p>
              </div>
              <Switch
                checked={affectCompletionRate}
                onCheckedChange={setAffectCompletionRate}
                data-testid="switch-affect-completion"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="resolution">Resolution Notes</Label>
              <Textarea
                id="resolution"
                placeholder="Explain your decision and reasoning..."
                value={resolution}
                onChange={(e) => setResolution(e.target.value)}
                rows={4}
                data-testid="textarea-resolution"
              />
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setResolveDialogOpen(false);
                setSelectedDispute(null);
                setResolution("");
                setFreelancerAmount("");
                setCustomerRefund("");
              }}
              data-testid="button-cancel-resolve"
            >
              Cancel
            </Button>
            <Button
              onClick={() => {
                if (!selectedDispute || !resolution.trim()) return;
                
                const freelancerAmt = parseFloat(freelancerAmount || "0");
                const customerAmt = parseFloat(customerRefund || "0");
                const budget = parseFloat(selectedDispute.jobBudget || "0");
                
                if (isNaN(freelancerAmt) || isNaN(customerAmt) || freelancerAmt < 0 || customerAmt < 0) {
                  toast({
                    title: "Invalid amounts",
                    description: "Please enter valid positive numbers for both amounts.",
                    variant: "destructive",
                  });
                  return;
                }
                
                if (Math.abs(freelancerAmt + customerAmt - budget) > 0.001) {
                  toast({
                    title: "Full amount must be distributed",
                    description: `Freelancer amount + customer refund must total exactly $${budget.toFixed(2)}.`,
                    variant: "destructive",
                  });
                  return;
                }
                
                resolveDisputeMutation.mutate({
                  disputeId: selectedDispute.id,
                  resolution,
                  freelancerAmount: freelancerAmt.toString(),
                  customerRefund: customerAmt.toString(),
                  affectCompletionRate,
                });
              }}
              disabled={!resolution.trim() || !resolveTotalMatches || parseFloat(freelancerAmount || "0") < 0 || parseFloat(customerRefund || "0") < 0 || resolveDisputeMutation.isPending}
              data-testid="button-confirm-resolve"
            >
              {resolveDisputeMutation.isPending ? "Resolving..." : "Resolve Dispute"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
