import { Switch, Route, Redirect } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/app-sidebar";
import { ThemeProvider } from "@/lib/theme-provider";
import { AuthProvider, useAuth } from "@/lib/auth-context";
import { ThemeToggle } from "@/components/theme-toggle";
import { UserNav } from "@/components/user-nav";
import { OnboardingModal } from "@/components/OnboardingModal";
import { NotificationCenter } from "@/components/NotificationCenter";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { useState, useEffect } from "react";
import { TutorialModal } from "@/components/TutorialModal";
import { HelpCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import NotFound from "@/pages/not-found";
import LoginPage from "@/pages/login";
import DashboardPage from "@/pages/dashboard";
import JobsPage from "@/pages/jobs";
import JobDetailPage from "@/pages/job-detail";
import CreateJobPage from "@/pages/create-job";
import WalletPage from "@/pages/wallet";
import ProfilePage from "@/pages/profile";
import ModerationPage from "@/pages/moderation";
import PTOPage from "@/pages/pto";
import NotificationsPage from "@/pages/notifications";
import CurrentJobPage from "@/pages/current-job";
import MyJobsPage from "@/pages/my-jobs";
import RoleUpgradePage from "@/pages/role-upgrade";
import RoleUpgradeReviewPage from "@/pages/role-upgrade-review";
import AdminPage from "@/pages/admin";
import TeamManagementPage from "@/pages/team-management";
import MeetingsPage from "@/pages/meetings";
import TeamRoomPage from "@/pages/team-room";
import MessagesPage from "@/pages/messages";
import SettingsPage from "@/pages/settings";
import VerifyEmailPage from "@/pages/verify-email";
import VaultPage from "@/pages/vault";
import logoLight from "@assets/logo-light.png";
import logoDark from "@assets/logo-dark.png";

function ProtectedRoute({ children, allowedRoles }: { children: React.ReactNode; allowedRoles?: string[] }) {
  const { user, isLoading } = useAuth();

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="animate-pulse text-muted-foreground">Loading...</div>
      </div>
    );
  }

  if (!user) {
    return <Redirect to="/" />;
  }

  if (allowedRoles && !allowedRoles.includes(user.role)) {
    return <Redirect to="/dashboard" />;
  }

  return <>{children}</>;
}

function Router() {
  const { user } = useAuth();

  if (!user) {
    return (
      <Switch>
        <Route path="/" component={LoginPage} />
        <Route path="/verify-email" component={VerifyEmailPage} />
        <Route>
          <Redirect to="/" />
        </Route>
      </Switch>
    );
  }

  return (
    <Switch>
      <Route path="/">
        <Redirect to="/dashboard" />
      </Route>
      <Route path="/dashboard">
        <ProtectedRoute>
          <DashboardPage />
        </ProtectedRoute>
      </Route>
      <Route path="/jobs/create">
        <ProtectedRoute allowedRoles={["customer"]}>
          <CreateJobPage />
        </ProtectedRoute>
      </Route>
      <Route path="/jobs/:id">
        <ProtectedRoute>
          <JobDetailPage />
        </ProtectedRoute>
      </Route>
      <Route path="/jobs">
        <ProtectedRoute>
          <JobsPage />
        </ProtectedRoute>
      </Route>
      <Route path="/wallet">
        <ProtectedRoute>
          <WalletPage />
        </ProtectedRoute>
      </Route>
      <Route path="/profile">
        <ProtectedRoute>
          <ProfilePage />
        </ProtectedRoute>
      </Route>
      <Route path="/current-job">
        <ProtectedRoute allowedRoles={["freelancer"]}>
          <CurrentJobPage />
        </ProtectedRoute>
      </Route>
      <Route path="/my-jobs">
        <ProtectedRoute allowedRoles={["customer"]}>
          <MyJobsPage />
        </ProtectedRoute>
      </Route>
      <Route path="/moderation">
        <ProtectedRoute allowedRoles={["staff", "moderator", "head_of_moderation", "founder"]}>
          <ModerationPage />
        </ProtectedRoute>
      </Route>
      <Route path="/pto">
        <ProtectedRoute allowedRoles={["freelancer"]}>
          <PTOPage />
        </ProtectedRoute>
      </Route>
      <Route path="/notifications">
        <ProtectedRoute allowedRoles={["freelancer"]}>
          <NotificationsPage />
        </ProtectedRoute>
      </Route>
      <Route path="/role-upgrade">
        <ProtectedRoute allowedRoles={["customer", "freelancer"]}>
          <RoleUpgradePage />
        </ProtectedRoute>
      </Route>
      <Route path="/role-upgrade-review">
        <ProtectedRoute allowedRoles={["moderator", "head_of_moderation", "founder"]}>
          <RoleUpgradeReviewPage />
        </ProtectedRoute>
      </Route>
      <Route path="/admin">
        <ProtectedRoute allowedRoles={["founder"]}>
          <AdminPage />
        </ProtectedRoute>
      </Route>
      <Route path="/team-management">
        <ProtectedRoute allowedRoles={["head_of_moderation", "founder"]}>
          <TeamManagementPage />
        </ProtectedRoute>
      </Route>
      <Route path="/meetings">
        <ProtectedRoute allowedRoles={["moderator", "head_of_moderation", "founder"]}>
          <MeetingsPage />
        </ProtectedRoute>
      </Route>
      <Route path="/team-room">
        <ProtectedRoute allowedRoles={["moderator", "head_of_moderation", "founder"]}>
          <TeamRoomPage />
        </ProtectedRoute>
      </Route>
      <Route path="/vault">
        <ProtectedRoute allowedRoles={["head_of_moderation", "founder"]}>
          <VaultPage />
        </ProtectedRoute>
      </Route>
      <Route path="/messages">
        <ProtectedRoute>
          <MessagesPage />
        </ProtectedRoute>
      </Route>
      <Route path="/settings">
        <ProtectedRoute>
          <SettingsPage />
        </ProtectedRoute>
      </Route>
      <Route path="/verify-email" component={VerifyEmailPage} />
      <Route component={NotFound} />
    </Switch>
  );
}

function AppContent() {
  const { user, refetchUser } = useAuth();
  const { toast } = useToast();
  const [showOnboarding, setShowOnboarding] = useState(false);
  const [showTutorial, setShowTutorial] = useState(false);

  useEffect(() => {
    if (user && !user.onboardingCompleted) {
      setShowOnboarding(true);
    }
  }, [user]);

  const handleCompleteOnboarding = async () => {
    try {
      await apiRequest("POST", "/api/auth/complete-onboarding", {});
      setShowOnboarding(false);
      refetchUser();
      toast({
        title: "Welcome to Linxora!",
        description: "You're all set to get started.",
      });
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to complete onboarding. Please try again.",
        variant: "destructive",
      });
    }
  };

  const style = {
    "--sidebar-width": "16rem",
    "--sidebar-width-icon": "3rem",
  };

  if (!user) {
    return <Router />;
  }

  return (
    <>
      <SidebarProvider style={style as React.CSSProperties}>
        <div className="flex h-screen w-full">
          <AppSidebar />
          <div className="flex flex-col flex-1 overflow-hidden">
            <header className="flex flex-wrap items-center justify-between gap-4 p-4 border-b bg-background">
              <div className="flex flex-wrap items-center gap-4">
                <SidebarTrigger data-testid="button-sidebar-toggle" />
                <div className="flex flex-wrap items-center gap-2">
                  <img 
                    src={logoLight} 
                    alt="Linxora Logo" 
                    className="h-10 max-h-12 dark:hidden"
                    style={{ objectFit: "contain" }}
                    data-testid="img-logo-light"
                  />
                  <img 
                    src={logoDark} 
                    alt="Linxora Logo" 
                    className="h-10 max-h-12 hidden dark:block"
                    style={{ objectFit: "contain" }}
                    data-testid="img-logo-dark"
                  />
                  <span className="text-lg font-semibold" data-testid="text-app-name">Linxora</span>
                </div>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => setShowTutorial(true)}
                      data-testid="button-help"
                    >
                      <HelpCircle className="h-5 w-5" />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>
                    <p>View Tutorial</p>
                  </TooltipContent>
                </Tooltip>
                <NotificationCenter />
                <ThemeToggle />
                <UserNav />
              </div>
            </header>
            <main className="flex-1 overflow-y-auto p-6">
              <Router />
            </main>
          </div>
        </div>
      </SidebarProvider>
      <OnboardingModal
        user={user}
        open={showOnboarding}
        onComplete={handleCompleteOnboarding}
      />
      <TutorialModal
        open={showTutorial}
        onOpenChange={setShowTutorial}
      />
    </>
  );
}

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <ThemeProvider>
        <AuthProvider>
          <TooltipProvider>
            <AppContent />
            <Toaster />
          </TooltipProvider>
        </AuthProvider>
      </ThemeProvider>
    </QueryClientProvider>
  );
}
