import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/lib/auth-context";
import { ArrowUpCircle, Clock, CheckCircle, XCircle, Briefcase, Shield } from "lucide-react";
import { formatEasternDateTime, TIMEZONE_LABEL } from "@/lib/timezone";
import type { RoleUpgradeRequest } from "@shared/schema";

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
  const canRequestFreelancer = user?.role === "customer" && !hasPendingRequest;
  const canRequestModerator = user?.role === "freelancer" && !hasPendingRequest && (user.completedJobs || 0) >= 5;
  const needsMoreJobs = user?.role === "freelancer" && (user.completedJobs || 0) < 5;

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
            {hasPendingRequest ? (
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
              Requires at least 5 completed jobs.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {needsMoreJobs ? (
              <div className="text-muted-foreground space-y-2">
                <p>You need to complete at least 5 jobs to apply for moderator.</p>
                <p>Current completed jobs: <span className="font-bold">{user.completedJobs || 0}/5</span></p>
              </div>
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
