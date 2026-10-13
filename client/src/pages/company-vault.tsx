import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Landmark, Users, Briefcase, Wallet, Scale, Clock, ShieldCheck, TrendingUp, CircleDollarSign, BarChart3 } from "lucide-react";
import { useState } from "react";
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip, BarChart, Bar, XAxis, YAxis, CartesianGrid } from "recharts";

interface CompanyVaultData {
  customerHeld: number;
  freelancerHeld: number;
  pendingEscrow: number;
  pendingEscrowCount: number;
  companyHeld: number;
  moderationVault: number;
  totalInPlatform: number;
  counts: {
    users: number;
    freelancers: number;
    customers: number;
    moderators: number;
    jobs: number;
    activeJobs: number;
    completedJobs: number;
    cancelledJobs: number;
    disputedJobs: number;
  };
  feeStructure: Record<string, string>;
  updatedAt: string;
  series: VaultSeries[];
}

interface VaultSeries {
  date: string;
  label: string;
  profit: number;
  completed: number;
  cancelled: number;
  disputes: number;
  active: number;
}

const SERIES_CONFIG = [
  { key: "profit", label: "Platform Profit", color: "#8b5cf6" },
  { key: "completed", label: "Completed Jobs", color: "#22c55e" },
  { key: "cancelled", label: "Cancelled Jobs", color: "#ef4444" },
  { key: "disputes", label: "Disputes", color: "#f59e0b" },
  { key: "active", label: "Active Jobs", color: "#3b82f6" },
] as const;

const PIE_COLORS = {
  customerHeld: "#3b82f6",
  freelancerHeld: "#22c55e",
  pendingEscrow: "#f59e0b",
  companyHeld: "#8b5cf6",
  moderationVault: "#ec4899",
};

export default function CompanyVaultPage() {
  const [selectedSeries, setSelectedSeries] = useState<Set<string>>(new Set(SERIES_CONFIG.map(c => c.key)));

  const toggleSeries = (key: string) => {
    setSelectedSeries(prev => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const { data, isLoading } = useQuery<CompanyVaultData>({
    queryKey: ["/api/company-vault"],
    refetchInterval: 15000,
  });

  if (isLoading || !data) {
    return (
      <div className="p-6 space-y-6">
        <Skeleton className="h-8 w-48" />
        <div className="grid gap-4 md:grid-cols-3">
          <Skeleton className="h-32" />
          <Skeleton className="h-32" />
          <Skeleton className="h-32" />
        </div>
        <Skeleton className="h-80" />
      </div>
    );
  }
  const pieData = [
    { name: "Customer Held", value: data.customerHeld, color: PIE_COLORS.customerHeld },
    { name: "Freelancer Held", value: data.freelancerHeld, color: PIE_COLORS.freelancerHeld },
    { name: "Pending (In Escrow)", value: data.pendingEscrow, color: PIE_COLORS.pendingEscrow },
    { name: "Company Held", value: data.companyHeld, color: PIE_COLORS.companyHeld },
    { name: "Moderation Vault", value: data.moderationVault, color: PIE_COLORS.moderationVault },
  ].filter(d => d.value > 0);

  const fmt = (n: number) =>
    n.toLocaleString("en-US", { style: "currency", currency: "USD", minimumFractionDigits: 2 });

  const statCards = [
    { title: "Customer Held", value: data.customerHeld, icon: Users, color: "text-blue-500", desc: "In customer wallets" },
    { title: "Freelancer Held", value: data.freelancerHeld, icon: Wallet, color: "text-green-500", desc: "In freelancer wallets" },
    { title: "Pending / In Escrow", value: data.pendingEscrow, icon: Clock, color: "text-amber-500", desc: data.pendingEscrowCount + " active job escrow(s)" },
    { title: "Company Held", value: data.companyHeld, icon: TrendingUp, color: "text-violet-500", desc: "Platform fees from completed work" },
    { title: "Moderation Vault", value: data.moderationVault, icon: ShieldCheck, color: "text-pink-500", desc: "Moderation team funds" },
  ];

  const jobCards = [
    { label: "Active Jobs", value: data.counts.activeJobs },
    { label: "Completed", value: data.counts.completedJobs },
    { label: "Cancelled", value: data.counts.cancelledJobs },
    { label: "Disputed", value: data.counts.disputedJobs },
  ];
  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center gap-3">
        <Landmark className="w-8 h-8 text-primary" />
        <div>
          <h1 className="text-2xl font-bold">Company Vault</h1>
          <p className="text-muted-foreground">Every dollar in the Linxova platform, live</p>
        </div>
        <Badge variant="outline" className="ml-auto text-xs">
          Updated {new Date(data.updatedAt).toLocaleTimeString()}
        </Badge>
      </div>

      <Card className="border-primary/30 bg-gradient-to-br from-primary/10 via-background to-background">
        <CardContent className="py-6">
          <div className="flex items-center justify-between flex-wrap gap-4">
            <div>
              <p className="text-sm font-medium text-muted-foreground flex items-center gap-2">
                <CircleDollarSign className="w-4 h-4" /> Total Money in Platform
              </p>
              <p className="text-4xl font-bold mt-1" data-testid="text-total-in-platform">
                {fmt(data.totalInPlatform)}
              </p>
              <p className="text-xs text-muted-foreground mt-1">
                Customer + Freelancer wallets + Pending escrow + Company fees + Moderation vault
              </p>
            </div>
            <div className="flex gap-6 flex-wrap">
              <div>
                <p className="text-2xl font-semibold">{data.counts.users}</p>
                <p className="text-xs text-muted-foreground">Users</p>
              </div>
              <div>
                <p className="text-2xl font-semibold">{data.counts.jobs}</p>
                <p className="text-xs text-muted-foreground">Jobs</p>
              </div>
              <div>
                <p className="text-2xl font-semibold">{data.counts.freelancers}</p>
                <p className="text-xs text-muted-foreground">Freelancers</p>
              </div>
              <div>
                <p className="text-2xl font-semibold">{data.counts.customers}</p>
                <p className="text-xs text-muted-foreground">Customers</p>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>
      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Scale className="w-5 h-5" /> Fund Distribution
            </CardTitle>
            <CardDescription>Where the money is right now</CardDescription>
          </CardHeader>
          <CardContent>
            {pieData.length === 0 ? (
              <p className="text-muted-foreground text-sm py-12 text-center">No funds in the platform yet.</p>
            ) : (
              <>
                <div className="h-64">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie
                        data={pieData}
                        dataKey="value"
                        nameKey="name"
                        cx="50%"
                        cy="50%"
                        outerRadius={100}
                        innerRadius={50}
                        paddingAngle={2}
                        data-testid="pie-fund-distribution"
                      >
                        {pieData.map((entry) => (
                          <Cell key={entry.name} fill={entry.color} />
                        ))}
                      </Pie>
                      <Tooltip formatter={(value: number | string) => fmt(Number(value))} />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
                <div className="flex flex-wrap gap-x-4 gap-y-2 mt-2">
                  {pieData.map((entry) => (
                    <div key={entry.name} className="flex items-center gap-2 text-sm">
                      <span className="w-3 h-3 rounded-full shrink-0" style={{ backgroundColor: entry.color }} />
                      <span className="text-muted-foreground">{entry.name}</span>
                      <span className="font-medium">{fmt(entry.value)}</span>
                    </div>
                  ))}
                </div>
              </>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Briefcase className="w-5 h-5" /> Platform Snapshot
            </CardTitle>
            <CardDescription>Live health of the marketplace</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              {jobCards.map((c) => (
                <div key={c.label} className="rounded-lg border p-4">
                  <p className="text-2xl font-semibold">{c.value}</p>
                  <p className="text-xs text-muted-foreground">{c.label}</p>
                </div>
              ))}
            </div>
            <div className="rounded-lg border p-4">
              <p className="text-sm font-medium mb-2 flex items-center gap-2">
                <TrendingUp className="w-4 h-4" /> Platform Fee Structure (per freelancer level)
              </p>
              <div className="grid grid-cols-5 gap-2 text-center">
                {Object.entries(data.feeStructure).map(([level, fee]) => (
                  <div key={level} className="rounded bg-muted/40 p-2">
                    <p className="text-sm font-semibold capitalize">{level.replace("level", "Lv ")}</p>
                    <p className="text-xs text-muted-foreground">{fee}</p>
                  </div>
                ))}
              </div>
              <p className="text-xs text-muted-foreground mt-3">
                Freelancers keep 60-97% of each job depending on level; the rest stays with Linxova.
              </p>
            </div>
          </CardContent>
        </Card>
      </div>

      <Card data-testid="card-activity-chart">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <BarChart3 className="w-5 h-5" /> Marketplace Activity &amp; Profit
          </CardTitle>
          <CardDescription>
            Last 14 days. Toggle the series you want to compare — jobs completed, cancelled, disputed, active, and platform profit.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap gap-2 mb-4">
            {SERIES_CONFIG.map((c) => {
              const active = selectedSeries.has(c.key);
              return (
                <Button
                  key={c.key}
                  size="sm"
                  variant={active ? "default" : "outline"}
                  onClick={() => toggleSeries(c.key)}
                  className="gap-2"
                  data-testid={"toggle-series-" + c.key}
                >
                  <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: c.color }} />
                  {c.label}
                </Button>
              );
            })}
          </div>
          {selectedSeries.size === 0 ? (
            <p className="text-muted-foreground text-sm py-16 text-center">Select at least one series to compare.</p>
          ) : (
            <div className="h-80">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={data.series} barGap={2}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                  <XAxis dataKey="label" tick={{ fontSize: 11 }} stroke="hsl(var(--muted-foreground))" />
                  <YAxis
                    yAxisId="money"
                    tick={{ fontSize: 11 }}
                    stroke="hsl(var(--muted-foreground))"
                    tickFormatter={(v: number) => "$" + (v >= 1000 ? (v / 1000).toFixed(1) + "k" : v)}
                  />
                  <YAxis
                    yAxisId="count"
                    orientation="right"
                    tick={{ fontSize: 11 }}
                    stroke="hsl(var(--muted-foreground))"
                    allowDecimals={false}
                  />
                  <Tooltip
                    formatter={(value: any, name: any) => {
                      const cfg = SERIES_CONFIG.find(c => c.label === name);
                      if (cfg?.key === "profit") return [fmt(Number(value)), name];
                      return [value, name];
                    }}
                    labelFormatter={(label: any) => "Day: " + label}
                  />
                  {SERIES_CONFIG.filter(c => selectedSeries.has(c.key)).map(c => (
                    <Bar
                      key={c.key}
                      yAxisId={c.key === "profit" ? "money" : "count"}
                      dataKey={c.key}
                      name={c.label}
                      fill={c.color}
                      radius={[3, 3, 0, 0]}
                    />
                  ))}
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </CardContent>
      </Card>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-5">
        {statCards.map((s) => (
          <Card key={s.title} data-testid={"card-" + s.title.toLowerCase().replace(/[^a-z0-9]+/g, "-")}>
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle className="text-sm font-medium">{s.title}</CardTitle>
                <s.icon className={"w-5 h-5 " + s.color} />
              </div>
            </CardHeader>
            <CardContent>
              <p className="text-2xl font-bold">{fmt(s.value)}</p>
              <p className="text-xs text-muted-foreground mt-1">{s.desc}</p>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
