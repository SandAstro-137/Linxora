import { useQuery, useMutation } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Wallet as WalletIcon, ArrowDownCircle, ArrowUpCircle, Lock, CheckCircle, DollarSign, Send, Receipt, UserSearch, X, Check } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { useState, useMemo } from "react";
import { formatDistanceToNow } from "date-fns";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

interface WalletData {
  id: string;
  userId: string;
  usdtBalance: string;
  pendingUsdtBalance: string;
  availableUsdtBalance: string;
  walletAddress: string;
}

export default function WalletPage() {
  const { toast } = useToast();
  const [withdrawalOpen, setWithdrawalOpen] = useState(false);
  const [withdrawalAmount, setWithdrawalAmount] = useState("");
  
  const [depositOpen, setDepositOpen] = useState(false);
  const [depositAmount, setDepositAmount] = useState("");
  
  const [filterType, setFilterType] = useState<string>("all");
  const [filterStatus, setFilterStatus] = useState<string>("all");

  // Transfer state
  const [transferOpen, setTransferOpen] = useState(false);
  const [transferAmount, setTransferAmount] = useState("");
  const [transferUserIdInput, setTransferUserIdInput] = useState("");
  const [transferRecipient, setTransferRecipient] = useState<any>(null);
  const [transferLookupError, setTransferLookupError] = useState("");

  // Request state
  const [requestOpen, setRequestOpen] = useState(false);
  const [requestAmount, setRequestAmount] = useState("");
  const [requestUserIdInput, setRequestUserIdInput] = useState("");
  const [requestRecipient, setRequestRecipient] = useState<any>(null);
  const [requestMessage, setRequestMessage] = useState("");
  const [requestLookupError, setRequestLookupError] = useState("");

  const { data: wallet, isLoading: walletLoading } = useQuery<WalletData>({
    queryKey: ["/api/wallet"],
    refetchOnWindowFocus: true,
    refetchInterval: 15000,
  });

  const { data: transactions = [] } = useQuery<any[]>({
    queryKey: ["/api/wallet/transactions"],
    refetchOnWindowFocus: true,
    refetchInterval: 15000,
  });

  const { data: moneyRequests = [] } = useQuery<any[]>({
    queryKey: ["/api/wallet/requests"],
    refetchOnWindowFocus: true,
    refetchInterval: 15000,
  });

  const filteredTransactions = useMemo(() => {
    return transactions.filter((tx: any) => {
      const matchesType =
        filterType === "all" ||
        tx.type === filterType ||
        (filterType === "transfer" && (tx.type === "transfer_out" || tx.type === "transfer_in"));
      const matchesStatus = filterStatus === "all" || tx.status === filterStatus;
      return matchesType && matchesStatus;
    });
  }, [transactions, filterType, filterStatus]);

  const withdrawMutation = useMutation({
    mutationFn: (data: { currency: string; amount: string; address: string }) =>
      apiRequest("POST", "/api/wallet/withdraw", data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/wallet"] });
      queryClient.invalidateQueries({ queryKey: ["/api/wallet/transactions"] });
      toast({
        title: "Withdrawal initiated",
        description: "Your withdrawal request has been processed.",
      });
      setWithdrawalOpen(false);
      setWithdrawalAmount("");
    },
    onError: (error: any) => {
      toast({
        title: "Withdrawal failed",
        description: error?.message || "Please try again later.",
        variant: "destructive",
      });
    },
  });

  const depositMutation = useMutation({
    mutationFn: (data: { currency: string; amount: string }) =>
      apiRequest("POST", "/api/wallet/deposit", data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/wallet"] });
      queryClient.invalidateQueries({ queryKey: ["/api/wallet/transactions"] });
      toast({
        title: "Deposit successful",
        description: "Your deposit has been processed.",
      });
      setDepositOpen(false);
      setDepositAmount("");
    },
    onError: (error: any) => {
      toast({
        title: "Deposit failed",
        description: error?.message || "Please try again later.",
        variant: "destructive",
      });
    },
  });

  const getErrorMessage = (error: any) => {
    if (!error?.message) return "Please try again later.";
    const match = String(error.message).match(/\{"error":"([^"]+)"\}/);
    return match ? match[1] : error.message;
  };

  const lookupUser = async (
    input: string,
    setRecipient: (u: any) => void,
    setError: (e: string) => void
  ) => {
    const numericId = parseInt(input);
    if (!input || isNaN(numericId)) {
      setError("Enter a valid User ID");
      setRecipient(null);
      return;
    }
    try {
      const res = await fetch(`/api/users/by-userid/${numericId}`, { credentials: "include" });
      if (!res.ok) {
        const data = await res.json().catch(() => ({ error: "User not found" }));
        setError(data.error || "User not found");
        setRecipient(null);
      } else {
        const user = await res.json();
        setRecipient(user);
        setError("");
      }
    } catch {
      setError("Failed to look up user");
      setRecipient(null);
    }
  };

  const transferMutation = useMutation({
    mutationFn: (data: { toUserId: string; amount: string }) =>
      apiRequest("POST", "/api/wallet/transfer", data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/wallet"] });
      queryClient.invalidateQueries({ queryKey: ["/api/wallet/transactions"] });
      toast({ title: "Transfer sent", description: "The money has been sent." });
      setTransferOpen(false);
      setTransferAmount("");
      setTransferUserIdInput("");
      setTransferRecipient(null);
    },
    onError: (error: any) => {
      toast({ title: "Transfer failed", description: getErrorMessage(error), variant: "destructive" });
    },
  });

  const requestMutation = useMutation({
    mutationFn: (data: { toUserId: string; amount: string; message?: string }) =>
      apiRequest("POST", "/api/wallet/request", data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/wallet/requests"] });
      toast({ title: "Request sent", description: "Your money request has been sent." });
      setRequestOpen(false);
      setRequestAmount("");
      setRequestUserIdInput("");
      setRequestRecipient(null);
      setRequestMessage("");
    },
    onError: (error: any) => {
      toast({ title: "Request failed", description: getErrorMessage(error), variant: "destructive" });
    },
  });

  const acceptRequestMutation = useMutation({
    mutationFn: (id: string) => apiRequest("POST", `/api/wallet/requests/${id}/accept`, {}),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/wallet/requests"] });
      queryClient.invalidateQueries({ queryKey: ["/api/wallet"] });
      queryClient.invalidateQueries({ queryKey: ["/api/wallet/transactions"] });
      toast({ title: "Request paid", description: "The money has been sent." });
    },
    onError: (error: any) => {
      toast({ title: "Payment failed", description: getErrorMessage(error), variant: "destructive" });
    },
  });

  const declineRequestMutation = useMutation({
    mutationFn: (id: string) => apiRequest("POST", `/api/wallet/requests/${id}/decline`, {}),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/wallet/requests"] });
      toast({ title: "Request declined" });
    },
    onError: (error: any) => {
      toast({ title: "Could not decline request", description: getErrorMessage(error), variant: "destructive" });
    },
  });

  const cancelRequestMutation = useMutation({
    mutationFn: (id: string) => apiRequest("POST", `/api/wallet/requests/${id}/cancel`, {}),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/wallet/requests"] });
      toast({ title: "Request cancelled" });
    },
    onError: (error: any) => {
      toast({ title: "Could not cancel request", description: getErrorMessage(error), variant: "destructive" });
    },
  });

  const handleWithdraw = () => {
    withdrawMutation.mutate({
      currency: "USDT",
      amount: withdrawalAmount,
      address: "test-withdrawal",
    });
  };

  const handleDeposit = () => {
    depositMutation.mutate({
      currency: "USDT",
      amount: depositAmount,
    });
  };

  const totalBalance = wallet ? parseFloat(wallet.usdtBalance || "0") : 0;
  const availableBalance = wallet ? parseFloat(wallet.availableUsdtBalance || "0") : 0;
  const pendingBalance = wallet ? parseFloat(wallet.pendingUsdtBalance || "0") : 0;
  const withdrawalBalance = availableBalance;

  if (walletLoading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-12 w-64" />
        <div className="grid gap-4 md:grid-cols-2">
          <Skeleton className="h-40 w-full" />
          <Skeleton className="h-40 w-full" />
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <h2 className="text-3xl font-bold tracking-tight">Wallet</h2>
          <p className="text-muted-foreground">
            Manage your wallet balance
          </p>
        </div>
        <div className="flex gap-2">
          <Dialog open={depositOpen} onOpenChange={setDepositOpen}>
            <DialogTrigger asChild>
              <Button variant="outline" data-testid="button-deposit">
                <ArrowDownCircle className="w-4 h-4 mr-2" />
                Deposit
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Deposit Funds</DialogTitle>
                <DialogDescription>
                  Add funds to your wallet (minimum $1.00)
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-4">
                <div>
                  <Label>Amount (USD)</Label>
                  <Input
                    type="number"
                    step="0.01"
                    min="1"
                    placeholder="1.00"
                    value={depositAmount}
                    onChange={(e) => setDepositAmount(e.target.value)}
                    data-testid="input-deposit-amount"
                  />
                  <p className="text-xs text-muted-foreground mt-1">Minimum deposit: $1.00</p>
                </div>
                <Button
                  onClick={handleDeposit}
                  disabled={!depositAmount || parseFloat(depositAmount) < 1 || depositMutation.isPending}
                  className="w-full"
                  data-testid="button-confirm-deposit"
                >
                  {depositMutation.isPending ? "Processing..." : "Confirm Deposit"}
                </Button>
              </div>
            </DialogContent>
          </Dialog>

          <Dialog open={withdrawalOpen} onOpenChange={setWithdrawalOpen}>
            <DialogTrigger asChild>
              <Button data-testid="button-withdraw">
                <ArrowUpCircle className="w-4 h-4 mr-2" />
                Withdraw
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Withdraw Funds</DialogTitle>
                <DialogDescription>
                  Enter the amount to withdraw
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-4">
                <div>
                  <Label>Amount (USDT)</Label>
                  <div className="flex gap-2">
                    <Input
                      type="number"
                      step="0.00000001"
                      min="0.00000001"
                      placeholder="0.00000000"
                      value={withdrawalAmount}
                      onChange={(e) => setWithdrawalAmount(e.target.value)}
                      data-testid="input-withdraw-amount"
                    />
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => setWithdrawalAmount(withdrawalBalance.toFixed(8))}
                      disabled={withdrawalBalance <= 0}
                      data-testid="button-max-withdraw"
                    >
                      Max
                    </Button>
                  </div>
                  <p className="text-xs text-muted-foreground mt-1">
                    Available: ${withdrawalBalance.toFixed(8)} USDT
                    {withdrawalBalance >= 0.01 && withdrawalBalance < 1 && " (minimum withdrawal is $0.01 unless withdrawing the full balance)"}
                  </p>
                  {withdrawalBalance > 0 && withdrawalBalance < 0.01 && (
                    <p className="text-xs text-muted-foreground">This remaining balance can be withdrawn in full using Max.</p>
                  )}
                </div>
                <Button
                  onClick={handleWithdraw}
                  disabled={!withdrawalAmount || parseFloat(withdrawalAmount) > withdrawalBalance || withdrawMutation.isPending}
                  className="w-full"
                  data-testid="button-confirm-withdraw"
                >
                  {withdrawMutation.isPending ? "Processing..." : "Confirm Withdrawal"}
                </Button>
              </div>
            </DialogContent>
          </Dialog>

          <Dialog open={transferOpen} onOpenChange={setTransferOpen}>
            <DialogTrigger asChild>
              <Button variant="outline" data-testid="button-transfer">
                <Send className="w-4 h-4 mr-2" />
                Transfer
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Transfer Money</DialogTitle>
                <DialogDescription>Send money to another user's wallet</DialogDescription>
              </DialogHeader>
              <div className="space-y-4">
                <div className="space-y-2">
                  <Label>Recipient User ID</Label>
                  <div className="flex gap-2">
                    <Input
                      type="number"
                      placeholder="Enter User ID (e.g., 2)"
                      value={transferUserIdInput}
                      onChange={(e) => {
                        setTransferUserIdInput(e.target.value);
                        setTransferRecipient(null);
                        setTransferLookupError("");
                      }}
                      data-testid="input-transfer-user-id"
                    />
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => lookupUser(transferUserIdInput, setTransferRecipient, setTransferLookupError)}
                      data-testid="button-transfer-lookup"
                    >
                      <UserSearch className="w-4 h-4" />
                    </Button>
                  </div>
                  {transferLookupError && <p className="text-sm text-destructive">{transferLookupError}</p>}
                  {transferRecipient && (
                    <div className="p-3 rounded-md border bg-accent/50 flex items-center gap-2">
                      <Avatar className="w-8 h-8">
                        <AvatarImage src={transferRecipient.avatar || undefined} />
                        <AvatarFallback>{transferRecipient.username?.[0]?.toUpperCase() || "?"}</AvatarFallback>
                      </Avatar>
                      <div>
                        <p className="text-sm font-medium">{transferRecipient.username}</p>
                        <p className="text-xs text-muted-foreground">User ID: {transferRecipient.userId}</p>
                      </div>
                    </div>
                  )}
                </div>
                <div className="space-y-2">
                  <Label>Amount (USDT)</Label>
                  <Input
                    type="number"
                    step="0.01"
                    min="0.01"
                    placeholder="0.00"
                    value={transferAmount}
                    onChange={(e) => setTransferAmount(e.target.value)}
                    data-testid="input-transfer-amount"
                  />
                  <p className="text-xs text-muted-foreground">Available: ${availableBalance.toFixed(2)}</p>
                </div>
                <Button
                  onClick={() => transferMutation.mutate({ toUserId: transferRecipient.id, amount: transferAmount })}
                  disabled={!transferRecipient || !transferAmount || parseFloat(transferAmount) <= 0 || transferMutation.isPending}
                  className="w-full"
                  data-testid="button-confirm-transfer"
                >
                  {transferMutation.isPending ? "Sending..." : "Send Money"}
                </Button>
              </div>
            </DialogContent>
          </Dialog>

          <Dialog open={requestOpen} onOpenChange={setRequestOpen}>
            <DialogTrigger asChild>
              <Button variant="outline" data-testid="button-request">
                <Receipt className="w-4 h-4 mr-2" />
                Request
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Request Money</DialogTitle>
                <DialogDescription>Request money from another user</DialogDescription>
              </DialogHeader>
              <div className="space-y-4">
                <div className="space-y-2">
                  <Label>From User ID</Label>
                  <div className="flex gap-2">
                    <Input
                      type="number"
                      placeholder="Enter User ID (e.g., 3)"
                      value={requestUserIdInput}
                      onChange={(e) => {
                        setRequestUserIdInput(e.target.value);
                        setRequestRecipient(null);
                        setRequestLookupError("");
                      }}
                      data-testid="input-request-user-id"
                    />
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => lookupUser(requestUserIdInput, setRequestRecipient, setRequestLookupError)}
                      data-testid="button-request-lookup"
                    >
                      <UserSearch className="w-4 h-4" />
                    </Button>
                  </div>
                  {requestLookupError && <p className="text-sm text-destructive">{requestLookupError}</p>}
                  {requestRecipient && (
                    <div className="p-3 rounded-md border bg-accent/50 flex items-center gap-2">
                      <Avatar className="w-8 h-8">
                        <AvatarImage src={requestRecipient.avatar || undefined} />
                        <AvatarFallback>{requestRecipient.username?.[0]?.toUpperCase() || "?"}</AvatarFallback>
                      </Avatar>
                      <div>
                        <p className="text-sm font-medium">{requestRecipient.username}</p>
                        <p className="text-xs text-muted-foreground">User ID: {requestRecipient.userId}</p>
                      </div>
                    </div>
                  )}
                </div>
                <div className="space-y-2">
                  <Label>Amount (USDT)</Label>
                  <Input
                    type="number"
                    step="0.01"
                    min="0.01"
                    placeholder="0.00"
                    value={requestAmount}
                    onChange={(e) => setRequestAmount(e.target.value)}
                    data-testid="input-request-amount"
                  />
                </div>
                <div className="space-y-2">
                  <Label>Message (optional)</Label>
                  <Textarea
                    placeholder="What's this for?"
                    value={requestMessage}
                    onChange={(e) => setRequestMessage(e.target.value)}
                    data-testid="input-request-message"
                  />
                </div>
                <Button
                  onClick={() => requestMutation.mutate({ toUserId: requestRecipient.id, amount: requestAmount, message: requestMessage })}
                  disabled={!requestRecipient || !requestAmount || parseFloat(requestAmount) <= 0 || requestMutation.isPending}
                  className="w-full"
                  data-testid="button-confirm-request"
                >
                  {requestMutation.isPending ? "Sending..." : "Send Request"}
                </Button>
              </div>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <Card className="bg-gradient-to-br from-primary/10 via-background to-accent/5">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <WalletIcon className="w-5 h-5" />
              Total Balance
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-5xl font-bold mb-2" data-testid="text-total-balance">
              ${totalBalance.toFixed(2)}
            </div>
            <p className="text-sm text-muted-foreground">USDT</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <DollarSign className="w-5 h-5" />
              Balance Breakdown
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <CheckCircle className="w-4 h-4 text-green-500" />
                  <span className="text-sm">Available</span>
                </div>
                <span className="font-mono font-semibold" data-testid="text-available-balance">
                  ${availableBalance.toFixed(2)}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Lock className="w-4 h-4 text-orange-500" />
                  <span className="text-sm">Pending (Locked)</span>
                </div>
                <span className="font-mono text-muted-foreground" data-testid="text-pending-balance">
                  ${pendingBalance.toFixed(2)}
                </span>
              </div>
              <div className="pt-2 border-t">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium">Total USDT</span>
                  <span className="font-mono font-bold">
                    ${totalBalance.toFixed(2)}
                  </span>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      <Card data-testid="card-money-requests">
        <CardHeader>
          <CardTitle>Money Requests</CardTitle>
          <CardDescription>Incoming and outgoing cash requests</CardDescription>
        </CardHeader>
        <CardContent>
          {moneyRequests.length === 0 ? (
            <p className="text-center text-muted-foreground py-6">No money requests yet</p>
          ) : (
            <div className="space-y-3">
              {moneyRequests.map((req: any) => {
                const incoming = req.direction === "incoming";
                return (
                  <div
                    key={req.id}
                    className="flex items-center justify-between gap-3 p-3 rounded-md bg-muted/40 flex-wrap"
                    data-testid={`money-request-${req.id}`}
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <Avatar className="w-8 h-8">
                        <AvatarImage src={req.counterpartAvatar || undefined} />
                        <AvatarFallback>{req.counterpartUsername?.[0]?.toUpperCase() || "?"}</AvatarFallback>
                      </Avatar>
                      <div className="min-w-0">
                        <p className="text-sm font-medium">
                          {incoming
                            ? `${req.counterpartUsername} requested from you`
                            : `You requested from ${req.counterpartUsername}`}
                        </p>
                        <p className="text-sm text-muted-foreground break-words">
                          ${parseFloat(req.amount).toFixed(2)}
                          {req.message && <span> &middot; {req.message}</span>}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      {req.status === "pending" && incoming && (
                        <>
                          <Button
                            size="sm"
                            onClick={() => acceptRequestMutation.mutate(req.id)}
                            disabled={acceptRequestMutation.isPending}
                            data-testid={`button-pay-request-${req.id}`}
                          >
                            <Check className="w-4 h-4 mr-1" />
                            Pay
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => declineRequestMutation.mutate(req.id)}
                            disabled={declineRequestMutation.isPending}
                            data-testid={`button-decline-request-${req.id}`}
                          >
                            <X className="w-4 h-4 mr-1" />
                            Decline
                          </Button>
                        </>
                      )}
                      {req.status === "pending" && !incoming && (
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => cancelRequestMutation.mutate(req.id)}
                          disabled={cancelRequestMutation.isPending}
                          data-testid={`button-cancel-request-${req.id}`}
                        >
                          Cancel
                        </Button>
                      )}
                      <Badge variant="outline">{req.status}</Badge>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <div className="flex items-center justify-between flex-wrap gap-4">
            <div>
              <CardTitle>Transaction History</CardTitle>
              <CardDescription>Recent deposits and withdrawals</CardDescription>
            </div>
            <div className="flex gap-2">
              <Select value={filterType} onValueChange={setFilterType}>
                <SelectTrigger className="w-32" data-testid="select-filter-type">
                  <SelectValue placeholder="Type" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Types</SelectItem>
                  <SelectItem value="deposit">Deposits</SelectItem>
                  <SelectItem value="withdrawal">Withdrawals</SelectItem>
                  <SelectItem value="transfer">Transfers</SelectItem>
                </SelectContent>
              </Select>
              <Select value={filterStatus} onValueChange={setFilterStatus}>
                <SelectTrigger className="w-32" data-testid="select-filter-status">
                  <SelectValue placeholder="Status" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Status</SelectItem>
                  <SelectItem value="completed">Completed</SelectItem>
                  <SelectItem value="pending">Pending</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Type</TableHead>
                <TableHead>Amount</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Date</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredTransactions && filteredTransactions.length > 0 ? (
                filteredTransactions.map((tx: any) => (
                  <TableRow key={tx.id}>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        {tx.type === "deposit" || tx.type === "transfer_in" ? (
                          <ArrowDownCircle className="w-4 h-4 text-green-500" />
                        ) : (
                          <ArrowUpCircle className="w-4 h-4 text-red-500" />
                        )}
                        <span className="capitalize">
                          {tx.type === "transfer_out"
                            ? "Transfer Out"
                            : tx.type === "transfer_in"
                            ? "Transfer In"
                            : tx.type}
                        </span>
                      </div>
                    </TableCell>
                    <TableCell className="font-mono">
                      ${parseFloat(tx.amount).toFixed(2)}
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline">{tx.status}</Badge>
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {formatDistanceToNow(new Date(tx.createdAt), { addSuffix: true })}
                    </TableCell>
                  </TableRow>
                ))
              ) : (
                <TableRow>
                  <TableCell colSpan={4} className="text-center py-8 text-muted-foreground">
                    No transactions yet
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
