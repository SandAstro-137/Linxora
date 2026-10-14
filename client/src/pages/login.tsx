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
              <a href="/api/auth/google" className="block">
                <Button className="w-full h-12 text-base gap-3 bg-white text-foreground border hover:bg-muted" data-testid="button-google-login">
                  <svg viewBox="0 0 24 24" className="w-5 h-5" aria-hidden="true">
                    <path fill="#4285F4" d="M23.49 12.27c0-.79-.07-1.54-.19-2.27H12v4.51h6.47c-.29 1.48-1.14 2.73-2.4 3.58v3h3.86c2.26-2.09 3.56-5.17 3.56-8.82z"/>
                    <path fill="#34A853" d="M12 24c3.24 0 5.95-1.08 7.93-2.91l-3.86-3c-1.08.72-2.45 1.16-4.07 1.16-3.13 0-5.78-2.11-6.73-4.96H1.29v3.09C3.26 21.3 7.31 24 12 24z"/>
                    <path fill="#FBBC05" d="M5.27 14.29c-.25-.72-.38-1.49-.38-2.29s.14-1.57.38-2.29V6.62H1.29C.47 8.24 0 10.06 0 12s.47 3.76 1.29 5.38l3.98-3.09z"/>
                    <path fill="#EA4335" d="M12 4.75c1.77 0 3.35.61 4.6 1.8l3.42-3.42C17.95 1.19 15.24 0 12 0 7.31 0 3.26 2.7 1.29 6.62l3.98 3.09C6.22 6.86 8.87 4.75 12 4.75z"/>
                  </svg>
                  Continue with Google
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
