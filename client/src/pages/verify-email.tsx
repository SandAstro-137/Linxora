import { useEffect, useState } from "react";
import { useLocation } from "wouter";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { CheckCircle, XCircle, Loader2, Mail } from "lucide-react";
import { queryClient } from "@/lib/queryClient";

export default function VerifyEmailPage() {
  const [, setLocation] = useLocation();
  const [status, setStatus] = useState<"loading" | "success" | "error">("loading");
  const [message, setMessage] = useState("");
  const [email, setEmail] = useState("");

  useEffect(() => {
    const verifyEmail = async () => {
      const params = new URLSearchParams(window.location.search);
      const token = params.get("token");

      if (!token) {
        setStatus("error");
        setMessage("Invalid verification link. Please request a new one from Settings.");
        return;
      }

      try {
        const response = await fetch(`/api/profile/email-verify?token=${token}`);
        const data = await response.json();

        if (response.ok && data.success) {
          setStatus("success");
          setMessage(data.message || "Your email has been verified successfully!");
          setEmail(data.email || "");
          await queryClient.invalidateQueries({ queryKey: ["/api/auth/me"] });
        } else {
          setStatus("error");
          setMessage(data.error || "Failed to verify email. The link may be expired or already used.");
        }
      } catch {
        setStatus("error");
        setMessage("An error occurred while verifying your email. Please try again.");
      }
    };

    verifyEmail();
  }, []);

  return (
    <div className="min-h-screen flex items-center justify-center p-4 bg-background">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <div className="mx-auto mb-4">
            {status === "loading" && (
              <div className="h-16 w-16 rounded-full bg-primary/10 flex items-center justify-center">
                <Loader2 className="h-8 w-8 text-primary animate-spin" />
              </div>
            )}
            {status === "success" && (
              <div className="h-16 w-16 rounded-full bg-green-100 dark:bg-green-900/20 flex items-center justify-center">
                <CheckCircle className="h-8 w-8 text-green-600" />
              </div>
            )}
            {status === "error" && (
              <div className="h-16 w-16 rounded-full bg-destructive/10 flex items-center justify-center">
                <XCircle className="h-8 w-8 text-destructive" />
              </div>
            )}
          </div>
          <CardTitle>
            {status === "loading" && "Verifying Email..."}
            {status === "success" && "Email Verified!"}
            {status === "error" && "Verification Failed"}
          </CardTitle>
          <CardDescription>{message}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {status === "success" && email && (
            <div className="flex items-center justify-center gap-2 p-3 bg-muted rounded-lg">
              <Mail className="h-4 w-4 text-muted-foreground" />
              <span className="font-medium">{email}</span>
            </div>
          )}
          <div className="flex flex-col gap-2">
            <Button onClick={() => setLocation("/settings")} data-testid="button-go-to-settings">
              Go to Settings
            </Button>
            <Button variant="outline" onClick={() => setLocation("/")} data-testid="button-go-home">
              Go to Home
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
