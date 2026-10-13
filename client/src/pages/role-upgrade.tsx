import { useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/lib/auth-context";
import { ArrowUpCircle, Clock, CheckCircle, XCircle, Briefcase, Shield, Eye, DollarSign, Users, FileText, Star, ClipboardList, MessageSquare, Wallet } from "lucide-react";
import { formatEasternDateTime, TIMEZONE_LABEL } from "@/lib/timezone";
import type { RoleUpgradeRequest } from "@shared/schema";

function RolePreviewDialog({ targetRole }: { targetRole: "freelancer" | "moderator" }) {
  const freelancerFeatures = [
    { icon: <Briefcase className="w-5 h-5 text-primary" />, title: "Browse & Apply to Jobs", description: "Access the job board and apply to jobs posted by customers" },
    { icon: <Wallet className="w-5 h-5 text-green-500" />, title: "Wallet & Earnings", description: "Manage your earnings, view transactions, and request withdrawals" },
    { icon: <Star className="w-5 h-5 text-yellow-500" />, title: "Profile & Reviews", description: "Build your reputation with ratings and reviews from completed jobs" },
    { icon: <Users className="w-5 h-5 text-blue-500" />, title: "Team Collaboration", description: "Work with other freelancers on team jobs with automatic profit splitting" },
    { icon: <MessageSquare className="w-5 h-5 text-purple-500" />, title: "Direct Messaging", description: "Communicate directly with customers and team members" },
  ];

  const moderatorFeatures = [
    { icon: <Shield className="w-5 h-5 text-red-500" />, title: "Job Moderation Queue", description: "Review, approve, reject, or request changes to submitted jobs" },
    { icon: <Users className="w-5 h-5 text-blue-500" />, title: "Team Room Access", description: "Join the real-time moderator chat and voice channel" },
    { icon: <FileText className="w-5 h-5 text-primary" />, title: "Report Review", description: "Handle user reports for jobs, messages, and users" },
    { icon: <ClipboardList className="w-5 h-5 text-orange-500" />, title: "Task Assignments", description: "Receive and complete tasks assigned by Head of Moderation" },
    { icon: <Star className="w-5 h-5 text-yellow-500" />, title: "Meeting Scheduling", description: "Get invited to team meetings and participate in moderation discussions" },
    { icon: <DollarSign className="w-5 h-5 text-green-500" />, title: "Paid Position", description: "You will be paid for the work you do from the moderation department's team vault" },
  ];

  const features = targetRole === "freelancer" ? freelancerFeatures : moderatorFeatures;
  const roleTitle = targetRole === "freelancer" ? "Freelancer" : "Moderator";

  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm" data-testid={`button-preview-${targetRole}`}>
          <Eye className="w-4 h-4 mr-2" />
          Preview {roleTitle} Features
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-lg max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            {targetRole === "freelancer" ? <Briefcase className="w-5 h-5" /> : <Shield className="w-5 h-5" />}
            {roleTitle} Features Preview
          </DialogTitle>
          <DialogDescription>
            Here's what you'll get access to as a {roleTitle}
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4 mt-4">
          {features.map((feature, index) => (
            <div key={index} className="flex gap-3 p-3 bg-muted/50 rounded-lg">
              <div className="shrink-0">{feature.icon}</div>
              <div>
                <h4 className="font-medium text-sm">{feature.title}</h4>
                <p className="text-xs text-muted-foreground">{feature.description}</p>
              </div>
            </div>
          ))}
        </div>
        <div className="mt-4 p-3 bg-primary/5 border border-primary/20 rounded-lg">
          <p className="text-sm text-center">
            {targetRole === "freelancer" 
              ? "As a Freelancer, you'll lose some Customer features, but gain these new abilities to start earning!"
              : "As a Moderator, you'll no longer be able to take on freelance jobs, you will earn money through the Moderation team budget."
            }
          </p>
        </div>
      </DialogContent>
    </Dialog>
  );
}

const customerToFreelancerSchema = z.object({
  reason: z.string().min(10, "Please provide at least 10 characters explaining why you want to become a freelancer"),
  experience: z.string().optional(),
  portfolio: z.string().optional(),
});

const freelancerToModeratorSchema = z.object({
  reason: z.string().min(10, "Please explain why you want to become a moderator"),
  experience: z.string().min(10, "Please describe your experience as a freelancer"),
});

export default function RoleUpgradePage() {
  const { user } = useAuth();
  const { toast } = useToast();

  const { data: myRequests = [], isLoading } = useQuery<RoleUpgradeRequest[]>({
    queryKey: ["/api/role-upgrade-requests/my"],
  });

  const customerForm = useForm<z.infer<typeof customerToFreelancerSchema>>({
    resolver: zodResolver(customerToFreelancerSchema),
    defaultValues: {
      reason: "",
      experience: "",
      portfolio: "",
    },
  });

  const freelancerForm = useForm<z.infer<typeof freelancerToModeratorSchema>>({
    resolver: zodResolver(freelancerToModeratorSchema),
    defaultValues: {
      reason: "",
      experience: "",
    },
  });

  const submitMutation = useMutation({
    mutationFn: async (data: { upgradeType: string; reason: string; experience?: string; portfolio?: string }) => {
      return apiRequest("POST", "/api/role-upgrade-requests", data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/role-upgrade-requests/my"] });
      toast({
        title: "Request Submitted",
        description: "Your role upgrade request has been submitted for review.",
      });
      customerForm.reset();
      freelancerForm.reset();
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: error.message || "Failed to submit request",
        variant: "destructive",
      });
    },
  });

  const onCustomerSubmit = (data: z.infer<typeof customerToFreelancerSchema>) => {
    submitMutation.mutate({
      upgradeType: "customer_to_freelancer",
      ...data,
    });
  };

  const onFreelancerSubmit = (data: z.infer<typeof freelancerToModeratorSchema>) => {
    submitMutation.mutate({
      upgradeType: "freelancer_to_moderator",
      ...data,
    });
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "pending":
        return <Badge variant="secondary" className="bg-yellow-500/10 text-yellow-700 dark:text-yellow-400"><Clock className="w-3 h-3 mr-1" />Pending</Badge>;
      case "approved":
        return <Badge variant="secondary" className="bg-green-500/10 text-green-700 dark:text-green-400"><CheckCircle className="w-3 h-3 mr-1" />Approved</Badge>;
      case "rejected":
        return <Badge variant="secondary" className="bg-red-500/10 text-red-700 dark:text-red-400"><XCircle className="w-3 h-3 mr-1" />Rejected</Badge>;
      default:
        return <Badge variant="secondary">{status}</Badge>;
    }
  };

  const hasPendingRequest = myRequests.some(r => r.status === "pending");
  
  // Calculate account age requirements
  const accountCreatedAt = user?.createdAt ? new Date(user.createdAt) : new Date();
  const accountAgeMs = Date.now() - accountCreatedAt.getTime();
  const threeDaysMs = 3 * 24 * 60 * 60 * 1000;
  const fourMonthsMs = 120 * 24 * 60 * 60 * 1000;
  
  const customerAccountOldEnough = accountAgeMs >= threeDaysMs;
  const freelancerAccountOldEnough = accountAgeMs >= fourMonthsMs;
  
  const daysUntilFreelancerEligible = Math.max(0, Math.ceil((threeDaysMs - accountAgeMs) / (24 * 60 * 60 * 1000)));
  const daysUntilModeratorEligible = Math.max(0, Math.ceil((fourMonthsMs - accountAgeMs) / (24 * 60 * 60 * 1000)));
  
  // Freelancer to Moderator requirements
  const userLevel = user?.level || 1;
  const completionRate = parseFloat(user?.completionPercentage?.toString() || "0");
  const hasLevelRequirement = userLevel >= 5;
  const hasCompletionRequirement = completionRate >= 65;
  
  const canRequestFreelancer = user?.role === "customer" && !hasPendingRequest && customerAccountOldEnough;
  const canRequestModerator = user?.role === "freelancer" && !hasPendingRequest && freelancerAccountOldEnough && hasLevelRequirement && hasCompletionRequirement;
  
  const customerNeedsTime = user?.role === "customer" && !customerAccountOldEnough;
  const freelancerMissingRequirements = user?.role === "freelancer" && (!freelancerAccountOldEnough || !hasLevelRequirement || !hasCompletionRequirement);

  return (
    <div className="p-6 max-w-4xl mx-auto space-y-6">
      <div className="flex items-center gap-3">
        <ArrowUpCircle className="w-8 h-8 text-primary" />
        <div>
          <h1 className="text-2xl font-bold" data-testid="text-page-title">Role Upgrade</h1>
          <p className="text-muted-foreground">Request to upgrade your account role</p>
        </div>
      </div>

      {user?.role === "customer" && (
        <Card data-testid="card-customer-upgrade">
          <CardHeader>
            <div className="flex items-center gap-2">
              <Briefcase className="w-5 h-5 text-primary" />
              <CardTitle>Become a Freelancer</CardTitle>
            </div>
            <CardDescription>
              Upgrade from Customer to Freelancer to start taking on jobs and earning money.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="mb-4 p-4 bg-muted rounded-lg">
              <h4 className="font-medium mb-2">Requirements</h4>
              <ul className="space-y-1 text-sm">
                <li className={`flex items-center gap-2 ${customerAccountOldEnough ? 'text-green-600 dark:text-green-400' : 'text-muted-foreground'}`}>
                  {customerAccountOldEnough ? <CheckCircle className="w-4 h-4" /> : <Clock className="w-4 h-4" />}
                  Account must be at least 3 days old
                  {!customerAccountOldEnough && <span className="text-xs">({daysUntilFreelancerEligible} days remaining)</span>}
                </li>
              </ul>
            </div>
            <div className="mb-4">
              <RolePreviewDialog targetRole="freelancer" />
            </div>
            {customerNeedsTime ? (
              <p className="text-muted-foreground">Your account needs to be at least 3 days old before you can apply to become a freelancer.</p>
            ) : hasPendingRequest ? (
              <p className="text-muted-foreground">You have a pending upgrade request. Please wait for it to be reviewed.</p>
            ) : (
              <Form {...customerForm}>
                <form onSubmit={customerForm.handleSubmit(onCustomerSubmit)} className="space-y-4">
                  <FormField
                    control={customerForm.control}
                    name="reason"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Why do you want to become a freelancer?</FormLabel>
                        <FormControl>
                          <Textarea
                            placeholder="Tell us about your skills and why you want to offer services..."
                            className="min-h-[100px]"
                            data-testid="input-reason"
                            {...field}
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={customerForm.control}
                    name="experience"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Relevant Experience (optional)</FormLabel>
                        <FormControl>
                          <Textarea
                            placeholder="Describe any relevant work experience..."
                            data-testid="input-experience"
                            {...field}
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={customerForm.control}
                    name="portfolio"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Portfolio Link (optional)</FormLabel>
                        <FormControl>
                          <Input
                            placeholder="https://yourportfolio.com"
                            data-testid="input-portfolio"
                            {...field}
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <Button type="submit" disabled={submitMutation.isPending} data-testid="button-submit-upgrade">
                    {submitMutation.isPending ? "Submitting..." : "Submit Request"}
                  </Button>
                </form>
              </Form>
            )}
          </CardContent>
        </Card>
      )}

      {user?.role === "freelancer" && (
        <Card data-testid="card-freelancer-upgrade">
          <CardHeader>
            <div className="flex items-center gap-2">
              <Shield className="w-5 h-5 text-primary" />
              <CardTitle>Become a Moderator</CardTitle>
            </div>
            <CardDescription>
              Upgrade from Freelancer to Moderator to help manage the platform and review jobs.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="mb-4 p-4 bg-muted rounded-lg">
              <h4 className="font-medium mb-2">Requirements</h4>
              <ul className="space-y-1 text-sm">
                <li className={`flex items-center gap-2 ${freelancerAccountOldEnough ? 'text-green-600 dark:text-green-400' : 'text-muted-foreground'}`}>
                  {freelancerAccountOldEnough ? <CheckCircle className="w-4 h-4" /> : <Clock className="w-4 h-4" />}
                  Account must be at least 4 months old
                  {!freelancerAccountOldEnough && <span className="text-xs">({daysUntilModeratorEligible} days remaining)</span>}
                </li>
                <li className={`flex items-center gap-2 ${hasLevelRequirement ? 'text-green-600 dark:text-green-400' : 'text-muted-foreground'}`}>
                  {hasLevelRequirement ? <CheckCircle className="w-4 h-4" /> : <XCircle className="w-4 h-4" />}
                  Must be Level 5 (Currently Level {userLevel})
                </li>
                <li className={`flex items-center gap-2 ${hasCompletionRequirement ? 'text-green-600 dark:text-green-400' : 'text-muted-foreground'}`}>
                  {hasCompletionRequirement ? <CheckCircle className="w-4 h-4" /> : <XCircle className="w-4 h-4" />}
                  65% or higher completion rate (Currently {completionRate.toFixed(1)}%)
                </li>
              </ul>
            </div>
            <div className="mb-4">
              <RolePreviewDialog targetRole="moderator" />
            </div>
            {freelancerMissingRequirements ? (
              <p className="text-muted-foreground">You don't meet all the requirements yet. Keep working to reach your goals!</p>
            ) : hasPendingRequest ? (
              <p className="text-muted-foreground">You have a pending upgrade request. Please wait for it to be reviewed.</p>
            ) : (
              <Form {...freelancerForm}>
                <form onSubmit={freelancerForm.handleSubmit(onFreelancerSubmit)} className="space-y-4">
                  <FormField
                    control={freelancerForm.control}
                    name="reason"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Why do you want to become a moderator?</FormLabel>
                        <FormControl>
                          <Textarea
                            placeholder="Explain your motivation for helping moderate the platform..."
                            className="min-h-[100px]"
                            data-testid="input-mod-reason"
                            {...field}
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={freelancerForm.control}
                    name="experience"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Your Experience as a Freelancer</FormLabel>
                        <FormControl>
                          <Textarea
                            placeholder="Describe your experience on the platform and why you'd be a good moderator..."
                            className="min-h-[100px]"
                            data-testid="input-mod-experience"
                            {...field}
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <Button type="submit" disabled={submitMutation.isPending} data-testid="button-submit-mod-upgrade">
                    {submitMutation.isPending ? "Submitting..." : "Submit Request"}
                  </Button>
                </form>
              </Form>
            )}
          </CardContent>
        </Card>
      )}

      {user?.role === "moderator" && (
        <Card>
          <CardContent className="p-6">
            <p className="text-muted-foreground">You already have the highest available role (Moderator).</p>
          </CardContent>
        </Card>
      )}

      {myRequests.length > 0 && (
        <Card data-testid="card-request-history">
          <CardHeader>
            <CardTitle>Your Request History</CardTitle>
            <CardDescription>All times are in {TIMEZONE_LABEL}</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {myRequests.map((request) => (
                <div
                  key={request.id}
                  className="p-4 border rounded-md space-y-2"
                  data-testid={`card-request-${request.id}`}
                >
                  <div className="flex items-center justify-between gap-2 flex-wrap">
                    <div className="font-medium">
                      {request.upgradeType === "customer_to_freelancer"
                        ? "Customer → Freelancer"
                        : "Freelancer → Moderator"}
                    </div>
                    {getStatusBadge(request.status)}
                  </div>
                  <p className="text-sm text-muted-foreground">{request.reason}</p>
                  <p className="text-xs text-muted-foreground">
                    Submitted {formatEasternDateTime(request.createdAt!)} (ET)
                  </p>
                  {request.reviewNotes && (
                    <div className="mt-2 p-2 bg-muted rounded text-sm">
                      <span className="font-medium">Reviewer Notes:</span> {request.reviewNotes}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
