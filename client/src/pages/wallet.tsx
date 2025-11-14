import { useQuery, useMutation } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Wallet as WalletIcon, TrendingUp, ArrowDownCircle, ArrowUpCircle, Lock, CheckCircle } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { useState, useMemo, useEffect, useRef } from "react";
import { formatDistanceToNow } from "date-fns";

interface CryptoPrice {
  usd: number;
  usd_24h_change: number;
}

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
  const [withdrawalCurrency, setWithdrawalCurrency] = useState("USDT");
  const [withdrawalAmount, setWithdrawalAmount] = useState("");
  const [withdrawalAddress, setWithdrawalAddress] = useState("");
  
  // Transaction filters
  const [filterType, setFilterType] = useState<string>("all");
  const [filterCurrency, setFilterCurrency] = useState<string>("all");
  const [filterStatus, setFilterStatus] = useState<string>("all");
  
  // Real-time prices from WebSocket
  const [realtimePrices, setRealtimePrices] = useState<Record<string, { usd: number; usd_24h_change: number }>>({});
  const wsRef = useRef<WebSocket | null>(null);

  const { data: wallet, isLoading: walletLoading } = useQuery<WalletData>({
    queryKey: ["/api/wallet"],
  });

  // Fallback REST API for initial prices (WebSocket will override)
  const { data: initialPrices, isLoading: pricesLoading } = useQuery<Record<string, CryptoPrice>>({
    queryKey: ["/api/wallet/prices"],
    refetchInterval: 30000,
  });
  
  // Use real-time prices if available, otherwise fall back to REST API prices
  const prices = Object.keys(realtimePrices).length > 0 ? realtimePrices : initialPrices;

  const { data: transactions = [] } = useQuery<any[]>({
    queryKey: ["/api/wallet/transactions"],
  });
  
  // WebSocket connection for real-time price updates
  useEffect(() => {
    const connectWebSocket = () => {
      const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      const wsUrl = `${protocol}//${window.location.host}/ws/prices`;
      
      console.log('[Wallet] Connecting to WebSocket:', wsUrl);
      const ws = new WebSocket(wsUrl);
      
      ws.onopen = () => {
        console.log('[Wallet] WebSocket connected - receiving real-time crypto prices');
      };
      
      ws.onmessage = (event) => {
        try {
          const message = JSON.parse(event.data);
          if (message.type === 'prices' && message.data) {
            // Convert backend price format to frontend format
            const formattedPrices: Record<string, { usd: number; usd_24h_change: number }> = {};
            Object.entries(message.data).forEach(([key, value]) => {
              formattedPrices[key] = {
                usd: typeof value === 'number' ? value : 0,
                usd_24h_change: 0, // WebSocket doesn't provide 24h change yet
              };
            });
            setRealtimePrices(formattedPrices);
          }
        } catch (error) {
          console.error('[Wallet] Error parsing WebSocket message:', error);
        }
      };
      
      ws.onerror = (error) => {
        console.error('[Wallet] WebSocket error:', error);
      };
      
      ws.onclose = () => {
        console.log('[Wallet] WebSocket disconnected. Reconnecting in 5 seconds...');
        setTimeout(connectWebSocket, 5000);
      };
      
      wsRef.current = ws;
    };
    
    connectWebSocket();
    
    // Cleanup on unmount
    return () => {
      if (wsRef.current) {
        wsRef.current.close();
      }
    };
  }, []);

  // Filter transactions
  const filteredTransactions = useMemo(() => {
    return transactions.filter((tx: any) => {
      const matchesType = filterType === "all" || tx.type === filterType;
      const matchesCurrency = filterCurrency === "all" || tx.currency === filterCurrency;
      const matchesStatus = filterStatus === "all" || tx.status === filterStatus;
      return matchesType && matchesCurrency && matchesStatus;
    });
  }, [transactions, filterType, filterCurrency, filterStatus]);

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
      setWithdrawalAddress("");
    },
    onError: () => {
      toast({
        title: "Withdrawal failed",
        description: "Please try again later.",
        variant: "destructive",
      });
    },
  });

  const calculateTotalUSD = () => {
    if (!wallet || !prices) return 0;
    
    const usdt = parseFloat(wallet.usdtBalance) * (prices.usdt?.usd || 1);
    const sol = parseFloat(wallet.solBalance) * (prices.sol?.usd || 0);
    const btc = parseFloat(wallet.btcBalance) * (prices.btc?.usd || 0);
    const ltc = parseFloat(wallet.ltcBalance) * (prices.ltc?.usd || 0);
    
    return usdt + sol + btc + ltc;
  };

  const renderCurrencyCard = (
    currency: string,
    balance: string,
    symbol: string,
    logo: string
  ) => {
    const price = prices?.[symbol.toLowerCase()]?.usd || 0;
    const usdValue = parseFloat(balance) * price;
    const change24h = prices?.[symbol.toLowerCase()]?.usd_24h_change || 0;

    return (
      <Card className="hover-elevate" key={currency}>
        <CardContent className="p-6">
          <div className="flex items-start justify-between mb-4">
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center text-lg font-bold">
                {symbol}
              </div>
              <div>
                <h3 className="font-semibold text-lg">{currency}</h3>
                <p className="text-sm text-muted-foreground">{symbol}</p>
              </div>
            </div>
            <Badge variant={change24h >= 0 ? "default" : "destructive"} className="text-xs">
              {change24h >= 0 ? "+" : ""}{change24h.toFixed(2)}%
            </Badge>
          </div>
          <div>
            <div className="text-2xl font-bold mb-1" data-testid={`text-balance-${symbol.toLowerCase()}`}>
              {parseFloat(balance).toFixed(8)} {symbol}
            </div>
            <p className="text-sm text-muted-foreground">
              ≈ ${usdValue.toFixed(2)} USD
            </p>
          </div>
        </CardContent>
      </Card>
    );
  };

  const handleWithdraw = () => {
    withdrawMutation.mutate({
      currency: withdrawalCurrency,
      amount: withdrawalAmount,
      address: withdrawalAddress,
    });
  };

  if (walletLoading || pricesLoading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-12 w-64" />
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          {[1, 2, 3, 4].map((i) => (
            <Skeleton key={i} className="h-40 w-full" />
          ))}
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
                Enter the details for your withdrawal
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4">
              <div>
                <Label>Currency</Label>
                <Select value={withdrawalCurrency} onValueChange={setWithdrawalCurrency}>
                  <SelectTrigger data-testid="select-withdraw-currency">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="USDT">USDT</SelectItem>
                    <SelectItem value="SOL">SOL</SelectItem>
                    <SelectItem value="BTC">BTC</SelectItem>
                    <SelectItem value="LTC">LTC</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Amount</Label>
                <Input
                  type="number"
                  step="0.00000001"
                  placeholder="0.00"
                  value={withdrawalAmount}
                  onChange={(e) => setWithdrawalAmount(e.target.value)}
                  data-testid="input-withdraw-amount"
                />
              </div>
              <div>
                <Label>Wallet Address</Label>
                <Input
                  placeholder="Enter destination address"
                  value={withdrawalAddress}
                  onChange={(e) => setWithdrawalAddress(e.target.value)}
                  data-testid="input-withdraw-address"
                  className="font-mono text-sm"
                />
              </div>
              <Button
                onClick={handleWithdraw}
                disabled={!withdrawalAmount || !withdrawalAddress || withdrawMutation.isPending}
                className="w-full"
                data-testid="button-confirm-withdraw"
              >
                {withdrawMutation.isPending ? "Processing..." : "Confirm Withdrawal"}
              </Button>
            </div>
          </DialogContent>
        </Dialog>
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
              ${calculateTotalUSD().toFixed(2)}
            </div>
            <p className="text-sm text-muted-foreground">USD Equivalent</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              USDT Balance Breakdown
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
                  {wallet && parseFloat(wallet.availableUsdtBalance || "0").toFixed(2)} USDT
                </span>
              </div>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Lock className="w-4 h-4 text-orange-500" />
                  <span className="text-sm">Pending (Locked)</span>
                </div>
                <span className="font-mono text-muted-foreground" data-testid="text-pending-balance">
                  {wallet && parseFloat(wallet.pendingUsdtBalance || "0").toFixed(2)} USDT
                </span>
              </div>
              <div className="pt-2 border-t">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium">Total USDT</span>
                  <span className="font-mono font-bold">
                    {wallet && parseFloat(wallet.usdtBalance || "0").toFixed(2)} USDT
                  </span>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        {wallet && renderCurrencyCard("Tether", wallet.usdtBalance, "USDT", "💵")}
        {wallet && renderCurrencyCard("Solana", wallet.solBalance, "SOL", "◎")}
        {wallet && renderCurrencyCard("Bitcoin", wallet.btcBalance, "BTC", "₿")}
        {wallet && renderCurrencyCard("Litecoin", wallet.ltcBalance, "LTC", "Ł")}
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
              <Select value={filterCurrency} onValueChange={setFilterCurrency}>
                <SelectTrigger className="w-32" data-testid="select-filter-currency">
                  <SelectValue placeholder="Currency" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Currencies</SelectItem>
                  <SelectItem value="USDT">USDT</SelectItem>
                  <SelectItem value="SOL">SOL</SelectItem>
                  <SelectItem value="BTC">BTC</SelectItem>
                  <SelectItem value="LTC">LTC</SelectItem>
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
                <TableHead>Currency</TableHead>
                <TableHead>Amount</TableHead>
                <TableHead>USD Value</TableHead>
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
                    <TableCell className="font-medium">{tx.currency}</TableCell>
                    <TableCell className="font-mono text-sm">{parseFloat(tx.amount).toFixed(8)}</TableCell>
                    <TableCell>${tx.usdAmount || "0.00"}</TableCell>
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
                  <TableCell colSpan={6} className="text-center py-8 text-muted-foreground">
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
