import { useQuery, useMutation } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Wallet as WalletIcon, ArrowDownCircle, ArrowUpCircle, Lock, CheckCircle, DollarSign } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
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
  solBalance: string;
  btcBalance: string;
  ltcBalance: string;
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

  const filteredTransactions = useMemo(() => {
    return transactions.filter((tx: any) => {
      const matchesType = filterType === "all" || tx.type === filterType;
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
                  <Label>Amount (USD)</Label>
                  <div className="flex gap-2">
                    <Input
                      type="number"
                      step="0.01"
                      min="0.01"
                      placeholder="0.00"
                      value={withdrawalAmount}
                      onChange={(e) => setWithdrawalAmount(e.target.value)}
                      data-testid="input-withdraw-amount"
                    />
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => setWithdrawalAmount(availableBalance.toFixed(2))}
                      disabled={availableBalance <= 0}
                      data-testid="button-max-withdraw"
                    >
                      Max
                    </Button>
                  </div>
                  <p className="text-xs text-muted-foreground mt-1">
                    Available: ${availableBalance.toFixed(2)}
                  </p>
                </div>
                <Button
                  onClick={handleWithdraw}
                  disabled={!withdrawalAmount || parseFloat(withdrawalAmount) > availableBalance || withdrawMutation.isPending}
                  className="w-full"
                  data-testid="button-confirm-withdraw"
                >
                  {withdrawMutation.isPending ? "Processing..." : "Confirm Withdrawal"}
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
            <p className="text-sm text-muted-foreground">USD</p>
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
                  <span className="text-sm font-medium">Total</span>
                  <span className="font-mono font-bold">
                    ${totalBalance.toFixed(2)}
                  </span>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

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
                        {tx.type === "deposit" ? (
                          <ArrowDownCircle className="w-4 h-4 text-green-500" />
                        ) : (
                          <ArrowUpCircle className="w-4 h-4 text-red-500" />
                        )}
                        <span className="capitalize">{tx.type}</span>
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
