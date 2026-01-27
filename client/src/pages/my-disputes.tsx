import { useQuery, useMutation } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Gavel, ExternalLink, User, DollarSign, Clock, AlertTriangle, CheckCircle } from "lucide-react";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { Link } from "wouter";
import { formatDistanceToNow } from "date-fns";
import { useState } from "react";

interface Dispute {
  id: string;
  jobId: string;
  status: string;
  reason: string;
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
  customerUsername?: string;
  freelancerUsername?: string;
  customerId?: string;
  freelancerId?: string;
}

export default function MyDisputesPage() {
  const { toast } = useToast();
  const [selectedDispute, setSelectedDispute] = useState<Dispute | null>(null);
  const [resolveDialogOpen, setResolveDialogOpen] = useState(false);
  const [freelancerAmount, setFreelancerAmount] = useState("");
  const [customerRefund, setCustomerRefund] = useState("");
  const [resolution, setResolution] = useState("");

  const { data: disputes = [], isLoading } = useQuery<Dispute[]>({
    queryKey: ["/api/disputes/mine"],
  });

  const resolveDisputeMutation = useMutation({
    mutationFn: async (data: { disputeId: string; resolution: string; freelancerAmount: string; customerRefund: string }) => {
      const res = await apiRequest("POST", `/api/disputes/${data.disputeId}/resolve`, {
        resolution: data.resolution,
        freelancerAmount: data.freelancerAmount,
        customerRefund: data.customerRefund,
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

  const inProgressDisputes = disputes.filter(d => d.status === "in_progress");
  const resolvedDisputes = disputes.filter(d => d.status === "resolved");

  if (isLoading) {
    return (
      <div className="p-6 max-w-4xl mx-auto space-y-6">
        <Skeleton className="h-10 w-48" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

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
                      {dispute.openedByUsername && ` by ${dispute.openedByUsername}`}
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
                      In Progress
                    </Badge>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                <div>
                  <h4 className="font-semibold mb-2">Dispute Reason</h4>
                  <p className="text-sm text-muted-foreground bg-muted p-3 rounded-md">
                    {dispute.reason}
                  </p>
                </div>

                <div className="grid grid-cols-2 gap-4 text-sm">
                  {dispute.customerUsername && (
                    <div>
                      <span className="text-muted-foreground">Customer:</span>{" "}
                      <Link href={`/profile/${dispute.customerId}`} className="hover:underline" data-testid={`link-customer-${dispute.id}`}>
                        {dispute.customerUsername}
                      </Link>
                    </div>
                  )}
                  {dispute.freelancerUsername && (
                    <div>
                      <span className="text-muted-foreground">Freelancer:</span>{" "}
                      <Link href={`/profile/${dispute.freelancerId}`} className="hover:underline" data-testid={`link-freelancer-${dispute.id}`}>
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
                    size="sm"
                    onClick={() => {
                      setSelectedDispute(dispute);
                      setFreelancerAmount(dispute.jobBudget || "0");
                      setCustomerRefund("0");
                      setResolution("");
                      setResolveDialogOpen(true);
                    }}
                    data-testid={`button-resolve-${dispute.id}`}
                  >
                    <Gavel className="w-4 h-4 mr-1" />
                    Resolve Dispute
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
              <p className="text-sm text-muted-foreground">
                Total: ${(parseFloat(freelancerAmount || "0") + parseFloat(customerRefund || "0")).toFixed(2)} / ${selectedDispute.jobBudget || "0"}
              </p>
            )}
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
                
                if (freelancerAmt + customerAmt > budget) {
                  toast({
                    title: "Amounts exceed budget",
                    description: `Total distribution cannot exceed the job budget of $${budget}.`,
                    variant: "destructive",
                  });
                  return;
                }
                
                resolveDisputeMutation.mutate({
                  disputeId: selectedDispute.id,
                  resolution,
                  freelancerAmount: freelancerAmt.toString(),
                  customerRefund: customerAmt.toString(),
                });
              }}
              disabled={!resolution.trim() || resolveDisputeMutation.isPending}
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
