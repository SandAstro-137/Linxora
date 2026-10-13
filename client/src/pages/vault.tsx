import { useQuery, useMutation } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Vault, ArrowUpCircle, ArrowDownCircle, DollarSign, Users, History, Send } from "lucide-react";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Skeleton } from "@/components/ui/skeleton";
import { formatDistanceToNow } from "date-fns";
import { useState } from "react";
import type { User, ModerationVault, VaultTransaction } from "@shared/schema";

interface EnrichedVaultTransaction extends VaultTransaction {
  fromUser?: { id: string; username: string } | null;
  toUser?: { id: string; username: string } | null;
  distributedBy?: { id: string; username: string } | null;
}

export default function VaultPage() {
  const { toast } = useToast();
  const [depositAmount, setDepositAmount] = useState("");
  const [depositNote, setDepositNote] = useState("");
  const [distributeAmount, setDistributeAmount] = useState("");
  const [distributeNote, setDistributeNote] = useState("");
  const [selectedModeratorId, setSelectedModeratorId] = useState("");

  const { data: user } = useQuery<User>({
    queryKey: ["/api/auth/me"],
  });

  const { data: vault, isLoading: vaultLoading } = useQuery<ModerationVault>({
    queryKey: ["/api/vault"],
  });

  const { data: transactions, isLoading: transactionsLoading } = useQuery<EnrichedVaultTransaction[]>({
    queryKey: ["/api/vault/transactions"],
  });

  const { data: moderators } = useQuery<User[]>({
    queryKey: ["/api/team/moderators"],
  });

  const depositMutation = useMutation({
    mutationFn: (data: { amount: string; note?: string }) =>
      apiRequest("POST", "/api/vault/deposit", data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/vault"] });
      queryClient.invalidateQueries({ queryKey: ["/api/vault/transactions"] });
      setDepositAmount("");
      setDepositNote("");
      toast({
        title: "Deposit successful",
        description: "Funds have been added to the moderation vault.",
      });
    },
    onError: (error: any) => {
      toast({
        title: "Deposit failed",
        description: error.message || "Failed to deposit funds",
        variant: "destructive",
      });
    },
  });

  const distributeMutation = useMutation({
    mutationFn: (data: { amount: string; toUserId: string; note?: string }) =>
      apiRequest("POST", "/api/vault/distribute", data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/vault"] });
      queryClient.invalidateQueries({ queryKey: ["/api/vault/transactions"] });
      setDistributeAmount("");
      setDistributeNote("");
      setSelectedModeratorId("");
      toast({
        title: "Distribution successful",
        description: "Funds have been sent to the moderator.",
      });
    },
    onError: (error: any) => {
      toast({
        title: "Distribution failed",
        description: error.message || "Failed to distribute funds",
        variant: "destructive",
      });
    },
  });

  const isFounder = user?.role === "founder";
  const isHeadOfModeration = user?.role === "head_of_moderation";
  const vaultBalance = parseFloat(vault?.balance || "0");

  // How much the company actually holds to move into the vault (founder only)
  const { data: companyVault } = useQuery<{ companyHeld: number }>({
    queryKey: ["/api/company-vault"],
    enabled: isFounder,
  });
  const companyAvailable = companyVault?.companyHeld ?? 0;
  const depositExceedsAvailable = isFounder && depositAmount && parseFloat(depositAmount) > companyAvailable;

  if (vaultLoading) {
    return (
      <div className="p-6 space-y-6">
        <Skeleton className="h-8 w-48" />
        <div className="grid gap-4 md:grid-cols-3">
          <Skeleton className="h-32" />
          <Skeleton className="h-32" />
          <Skeleton className="h-32" />
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center gap-3">
        <Vault className="w-8 h-8 text-primary" />
        <div>
          <h1 className="text-2xl font-bold">Moderation Vault</h1>
          <p className="text-muted-foreground">
            {isFounder ? "Deposit funds for the moderation team" : "Manage and distribute team funds"}
          </p>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <Card data-testid="card-vault-balance">
          <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Current Balance</CardTitle>
            <DollarSign className="w-4 h-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-green-600">${vaultBalance.toFixed(2)}</div>
            <p className="text-xs text-muted-foreground">Available for distribution</p>
          </CardContent>
        </Card>

        <Card data-testid="card-total-deposited">
          <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Deposited</CardTitle>
            <ArrowUpCircle className="w-4 h-4 text-green-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">${parseFloat(vault?.totalDeposited || "0").toFixed(2)}</div>
            <p className="text-xs text-muted-foreground">All time deposits</p>
          </CardContent>
        </Card>

        <Card data-testid="card-total-distributed">
          <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Distributed</CardTitle>
            <ArrowDownCircle className="w-4 h-4 text-blue-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">${parseFloat(vault?.totalDistributed || "0").toFixed(2)}</div>
            <p className="text-xs text-muted-foreground">Paid to moderators</p>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        {isFounder && (
          <Card data-testid="card-deposit-form">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <ArrowUpCircle className="w-5 h-5 text-green-500" />
                Deposit to Vault
              </CardTitle>
              <CardDescription>Add funds to the moderation team vault</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="depositAmount">Amount (USD)</Label>
                <Input
                  id="depositAmount"
                  type="number"
                  min="1"
                  step="0.01"
                  placeholder="100.00"
                  value={depositAmount}
                  onChange={(e) => setDepositAmount(e.target.value)}
                  data-testid="input-deposit-amount"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="depositNote">Note (optional)</Label>
                <Textarea
                  id="depositNote"
                  placeholder="e.g., Monthly team bonus"
                  value={depositNote}
                  onChange={(e) => setDepositNote(e.target.value)}
                  rows={2}
                  data-testid="textarea-deposit-note"
                />
              </div>
              <div className="rounded-lg bg-muted/40 p-3 text-sm">
                <p className="text-xs text-muted-foreground">Deposits draw from the company's held funds</p>
                <p className="font-semibold">Available: ${companyAvailable.toFixed(2)}</p>
              </div>
              {depositExceedsAvailable && (
                <p className="text-xs text-destructive">
                  Amount exceeds the company's available funds (${companyAvailable.toFixed(2)}).
                </p>
              )}
              <Button
                onClick={() => depositMutation.mutate({ amount: depositAmount, note: depositNote })}
                disabled={!depositAmount || parseFloat(depositAmount) < 1 || depositMutation.isPending || !!depositExceedsAvailable}
                className="w-full"
                data-testid="button-deposit"
              >
                <DollarSign className="w-4 h-4 mr-2" />
                Deposit Funds
              </Button>
            </CardContent>
          </Card>
        )}

        {isHeadOfModeration && (
          <Card data-testid="card-distribute-form">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Send className="w-5 h-5 text-blue-500" />
                Distribute Funds
              </CardTitle>
              <CardDescription>Send funds to a moderator or staff member</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="recipient">Recipient</Label>
                <Select value={selectedModeratorId} onValueChange={setSelectedModeratorId}>
                  <SelectTrigger id="recipient" data-testid="select-recipient">
                    <SelectValue placeholder="Select a moderator..." />
                  </SelectTrigger>
                  <SelectContent>
                    {moderators?.filter(m => m.role === "moderator" || m.role === "staff").map((mod) => (
                      <SelectItem key={mod.id} value={mod.id}>
                        <div className="flex items-center gap-2">
                          <Users className="w-4 h-4" />
                          <span>{mod.username}</span>
                          <Badge variant="outline" className="text-xs">{mod.role}</Badge>
                        </div>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="distributeAmount">Amount (USD)</Label>
                <Input
                  id="distributeAmount"
                  type="number"
                  min="0.01"
                  step="0.01"
                  max={vaultBalance}
                  placeholder="50.00"
                  value={distributeAmount}
                  onChange={(e) => setDistributeAmount(e.target.value)}
                  data-testid="input-distribute-amount"
                />
                <p className="text-xs text-muted-foreground">
                  Available: ${vaultBalance.toFixed(2)}
                </p>
              </div>
              <div className="space-y-2">
                <Label htmlFor="distributeNote">Reason (optional)</Label>
                <Textarea
                  id="distributeNote"
                  placeholder="e.g., Excellent moderation work this week"
                  value={distributeNote}
                  onChange={(e) => setDistributeNote(e.target.value)}
                  rows={2}
                  data-testid="textarea-distribute-note"
                />
              </div>
              <Button
                onClick={() => distributeMutation.mutate({ 
                  amount: distributeAmount, 
                  toUserId: selectedModeratorId, 
                  note: distributeNote 
                })}
                disabled={
                  !selectedModeratorId || 
                  !distributeAmount || 
                  parseFloat(distributeAmount) <= 0 || 
                  parseFloat(distributeAmount) > vaultBalance ||
                  distributeMutation.isPending
                }
                className="w-full"
                data-testid="button-distribute"
              >
                <Send className="w-4 h-4 mr-2" />
                Send Funds
              </Button>
            </CardContent>
          </Card>
        )}

        <Card className={!isFounder && !isHeadOfModeration ? "lg:col-span-2" : ""} data-testid="card-transaction-history">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <History className="w-5 h-5" />
              Transaction History
            </CardTitle>
            <CardDescription>Recent vault activity</CardDescription>
          </CardHeader>
          <CardContent>
            {transactionsLoading ? (
              <div className="space-y-3">
                {[1, 2, 3].map((i) => (
                  <Skeleton key={i} className="h-16 w-full" />
                ))}
              </div>
            ) : transactions && transactions.length > 0 ? (
              <div className="space-y-3 max-h-96 overflow-y-auto">
                {transactions.map((t) => (
                  <div
                    key={t.id}
                    className="flex items-center justify-between p-3 rounded-lg bg-muted/50"
                    data-testid={`transaction-${t.id}`}
                  >
                    <div className="flex items-center gap-3">
                      {t.type === "deposit" ? (
                        <div className="p-2 rounded-full bg-green-500/10">
                          <ArrowUpCircle className="w-4 h-4 text-green-500" />
                        </div>
                      ) : (
                        <div className="p-2 rounded-full bg-blue-500/10">
                          <ArrowDownCircle className="w-4 h-4 text-blue-500" />
                        </div>
                      )}
                      <div>
                        <p className="font-medium">
                          {t.type === "deposit" 
                            ? `Deposit from ${t.fromUser?.username || "Founder"}`
                            : `Distribution to ${t.toUser?.username || "Unknown"}`
                          }
                        </p>
                        {t.note && (
                          <p className="text-sm text-muted-foreground">{t.note}</p>
                        )}
                        <p className="text-xs text-muted-foreground">
                          {t.createdAt ? formatDistanceToNow(new Date(t.createdAt), { addSuffix: true }) : "Unknown"}
                        </p>
                      </div>
                    </div>
                    <div className={`font-bold ${t.type === "deposit" ? "text-green-600" : "text-blue-600"}`}>
                      {t.type === "deposit" ? "+" : "-"}${parseFloat(t.amount).toFixed(2)}
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-center py-8 text-muted-foreground">
                <History className="w-12 h-12 mx-auto mb-2 opacity-50" />
                <p>No transactions yet</p>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}