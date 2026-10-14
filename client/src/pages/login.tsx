import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useAuth } from "@/lib/auth-context";
import { Briefcase, Wallet, Shield, Users } from "lucide-react";
import { useEffect, useState } from "react";
import logoLight from "@assets/logo-light.png";
import logoDark from "@assets/logo-dark.png";

export default function LoginPage() {
  const { login } = useAuth();
  // Real (Discord) sign-in is always shown. Demo accounts are only visible when
  // the server actually offers them (disabled on production deployments). The
  // endpoint is polled once in 30s intervals because the dev server configuration
  // can change at runtime.
  const [demoAccounts, setDemoAccounts] = useState<{ id: string; label: string; description: string }[] | null>(null);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        const res = await fetch("/api/auth/demo-accounts");
        if (!res.ok) throw new Error("demo disabled");
        const data = await res.json();
        const labels: Record<string, { label: string; description: string }> = {
          "demo-freelancer-1": { label: "Demo Freelancer", description: "Alex Chen - Web Developer" },
          "demo-customer-1": { label: "Demo Customer", description: "Tech Startup Inc" },
          "demo-moderator-1": { label: "Demo Moderator", description: "Admin User" },
          "demo-head-mod-1": { label: "Demo Head of Moderation", description: "Head Moderator" },
          "demo-founder-1": { label: "Demo Founder", description: "Founder - Full Access" },
          "demo-freelancer-2": { label: "Demo Freelancer II", description: "Sarah Johnson - Designer" },
        };
        const mapped = (Array.isArray(data) ? data : [])
          .filter((a: any) => labels[a.id])
          .map((a: any) => ({ id: a.id, ...labels[a.id] }));
        if (!cancelled) setDemoAccounts(mapped);
      } catch {
        if (!cancelled) setDemoAccounts([]);
      }
    };
    load();
    return () => { cancelled = true; };
  }, []);

  const showDemo = Array.isArray(demoAccounts) && demoAccounts.length > 0;

  return (
    <div className="min-h-screen bg-gradient-to-br from-primary/5 via-background to-accent/5 flex items-center justify-center p-4">
      <div className="w-full max-w-6xl">
        <div className="text-center mb-8">
          <div className="flex items-center justify-center gap-3 mb-4">
            <img 
              src={logoLight} 
              alt="Linxova" 
              className="w-12 h-12 dark:hidden"
            />
            <img 
              src={logoDark} 
              alt="Linxova" 
              className="w-12 h-12 hidden dark:block"
            />
            <h1 className="text-4xl md:text-5xl font-bold bg-gradient-to-r from-primary to-purple-600 bg-clip-text text-transparent">
              Linxova
            </h1>
          </div>
          <p className="text-xl text-muted-foreground">
            Professional Freelancer Marketplace
          </p>
        </div>

        <div className="grid md:grid-cols-2 gap-8 items-start">
          <Card className="border-2">
            <CardHeader className="text-center">
              <CardTitle className="text-2xl">Welcome Back</CardTitle>
              <CardDescription>
                Sign in to access your account
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <a href="/api/auth/discord" className="block">
                <Button className="w-full h-12 text-base gap-2" data-testid="button-discord-login">
                  <svg viewBox="0 0 24 24" className="w-5 h-5" fill="currentColor" aria-hidden="true">
                    <path d="M20.317 4.37a19.79 19.79 0 00-4.885-1.515.074.074 0 00-.079.037c-.21.375-.444.864-.608 1.25a18.27 18.27 0 00-5.487 0 12.64 12.64 0 00-.617-1.25.077.077 0 00-.079-.037A19.736 19.736 0 003.677 4.37a.07.07 0 00-.032.027C.533 9.046-.32 13.58.099 18.057a.082.082 0 00.031.056 19.9 19.9 0 005.993 3.03.078.078 0 00.084-.028c.462-.63.874-1.295 1.226-1.994a.076.076 0 00-.041-.106 13.107 13.107 0 01-1.872-.892.077.077 0 01-.008-.128c.126-.094.249-.192.369-.291a.074.074 0 01.077-.01c3.928 1.793 8.18 1.793 12.062 0a.074.074 0 01.078.01c.12.099.243.198.369.291a.077.077 0 01-.006.127 12.3 12.3 0 01-1.873.892.077.077 0 00-.041.107c.36.698.772 1.362 1.225 1.993a.076.076 0 00.084.028 19.84 19.84 0 006.002-3.03.077.077 0 00.032-.054c.5-5.177-.838-9.674-3.549-13.66a.06.06 0 00-.031-.029zM8.02 15.33c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.956-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.956 2.418-2.157 2.418zm7.975 0c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.955-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.947 2.418-2.157 2.418z"/>
                  </svg>
                  Sign in with Discord
                </Button>
              </a>

              {showDemo && (
                <>
                  <p className="text-sm text-muted-foreground text-center uppercase tracking-wide">
                    Or choose a demo account
                  </p>
                  <div className="space-y-2">
                    {demoAccounts!.map((account) => (
                      <Button
                        key={account.id}
                        onClick={() => login(account.id)}
                        variant="outline"
                        className="w-full justify-start gap-3 h-auto py-3"
                        data-testid={`button-demo-${account.id}`}
                      >
                        <div className="flex flex-col items-start">
                          <div className="font-medium">{account.label}</div>
                          <div className="text-xs text-muted-foreground">{account.description}</div>
                        </div>
                      </Button>
                    ))}
                  </div>
                  <p className="text-xs text-center text-muted-foreground">
                    Demo accounts are for testing purposes only
                  </p>
                </>
              )}
            </CardContent>
          </Card>

          <div className="space-y-4">
            <h3 className="text-lg font-semibold mb-4">Platform Features</h3>
            <Card className="hover-elevate">
              <CardContent className="p-4 flex gap-4">
                <div className="bg-primary/10 p-3 rounded-lg">
                  <Briefcase className="w-6 h-6 text-primary" />
                </div>
                <div>
                  <h4 className="font-semibold mb-1">Job Marketplace</h4>
                  <p className="text-sm text-muted-foreground">
                    Post jobs or find opportunities with smart matching
                  </p>
                </div>
              </CardContent>
            </Card>

            <Card className="hover-elevate">
              <CardContent className="p-4 flex gap-4">
                <div className="bg-primary/10 p-3 rounded-lg">
                  <Wallet className="w-6 h-6 text-primary" />
                </div>
                <div>
                  <h4 className="font-semibold mb-1">Crypto Wallet</h4>
                  <p className="text-sm text-muted-foreground">
                    Track and manage USDT, BTC, SOL, and LTC payments
                  </p>
                </div>
              </CardContent>
            </Card>

            <Card className="hover-elevate">
              <CardContent className="p-4 flex gap-4">
                <div className="bg-primary/10 p-3 rounded-lg">
                  <Users className="w-6 h-6 text-primary" />
                </div>
                <div>
                  <h4 className="font-semibold mb-1">Team Collaboration</h4>
                  <p className="text-sm text-muted-foreground">
                    Invite freelancers and work together on projects
                  </p>
                </div>
              </CardContent>
            </Card>

            <Card className="hover-elevate">
              <CardContent className="p-4 flex gap-4">
                <div className="bg-primary/10 p-3 rounded-lg">
                  <Shield className="w-6 h-6 text-primary" />
                </div>
                <div>
                  <h4 className="font-semibold mb-1">Secure & Moderated</h4>
                  <p className="text-sm text-muted-foreground">
                    All jobs reviewed before publication for quality
                  </p>
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </div>
  );
}
