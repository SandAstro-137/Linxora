import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { PTORequest } from "@shared/schema";
import { z } from "zod";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Badge } from "@/components/ui/badge";
import { Calendar, Clock } from "lucide-react";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/lib/auth-context";
import { formatDistanceToNow } from "date-fns";

const formSchema = z.object({
  freelancerId: z.string(),
  startDate: z.string().min(1, "Start date is required"),
  endDate: z.string().min(1, "End date is required"),
  reason: z.string().min(10, "Reason must be at least 10 characters"),
  status: z.string().optional(),
});

export default function PTOPage() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [showForm, setShowForm] = useState(false);

  const { data: ptoRequests } = useQuery<PTORequest[]>({
    queryKey: ["/api/pto"],
  });

  const form = useForm<z.infer<typeof formSchema>>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      freelancerId: user?.id || "",
      startDate: "",
      endDate: "",
      reason: "",
    },
  });

  const createPTOMutation = useMutation({
    mutationFn: (data: z.infer<typeof formSchema>) => {
      const ptoData = {
        ...data,
        startDate: new Date(data.startDate).toISOString(),
        endDate: new Date(data.endDate).toISOString(),
      };
      return apiRequest("POST", "/api/pto", ptoData);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/pto"] });
      toast({
        title: "PTO request submitted",
        description: "Your request has been sent for approval.",
      });
      setShowForm(false);
      form.reset();
    },
    onError: () => {
      toast({
        title: "Failed to submit request",
        description: "Please try again later.",
        variant: "destructive",
      });
    },
  });

  function onSubmit(values: z.infer<typeof formSchema>) {
    createPTOMutation.mutate(values);
  }

  const getStatusColor = (status: string) => {
    switch (status) {
      case "pending":
        return "bg-yellow-500/10 text-yellow-700 dark:text-yellow-400";
      case "approved":
        return "bg-green-500/10 text-green-700 dark:text-green-400";
      case "rejected":
        return "bg-red-500/10 text-red-700 dark:text-red-400";
      default:
        return "bg-gray-500/10 text-gray-700 dark:text-gray-400";
    }
  };

  return (
    <div className="space-y-6 max-w-4xl mx-auto">
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <h2 className="text-3xl font-bold tracking-tight">PTO Requests</h2>
          <p className="text-muted-foreground">
            Manage your paid time off requests
          </p>
        </div>
        <Button onClick={() => setShowForm(!showForm)} data-testid="button-new-pto">
          <Calendar className="w-4 h-4 mr-2" />
          {showForm ? "Cancel" : "New Request"}
        </Button>
      </div>

      {showForm && (
        <Card>
          <CardHeader>
            <CardTitle>Submit PTO Request</CardTitle>
            <CardDescription>
              Request time off for vacation, personal matters, or other reasons
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Form {...form}>
              <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
                <div className="grid gap-4 sm:grid-cols-2">
                  <FormField
                    control={form.control}
                    name="startDate"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Start Date</FormLabel>
                        <FormControl>
                          <Input type="date" {...field} data-testid="input-pto-start" />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="endDate"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>End Date</FormLabel>
                        <FormControl>
                          <Input type="date" {...field} data-testid="input-pto-end" />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>

                <FormField
                  control={form.control}
                  name="reason"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Reason</FormLabel>
                      <FormControl>
                        <Textarea
                          placeholder="Briefly explain the reason for your request..."
                          {...field}
                          data-testid="input-pto-reason"
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <Button type="submit" disabled={createPTOMutation.isPending} data-testid="button-submit-pto">
                  {createPTOMutation.isPending ? "Submitting..." : "Submit Request"}
                </Button>
              </form>
            </Form>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Your PTO Requests</CardTitle>
          <CardDescription>View all your time-off requests and their status</CardDescription>
        </CardHeader>
        <CardContent>
          {ptoRequests && ptoRequests.length > 0 ? (
            <div className="space-y-4">
              {ptoRequests.map((request) => (
                <Card key={request.id} className="border" data-testid={`card-pto-${request.id}`}>
                  <CardContent className="p-4">
                    <div className="flex items-start justify-between gap-4 mb-3">
                      <div className="flex items-center gap-2">
                        <Clock className="w-4 h-4 text-muted-foreground" />
                        <span className="font-medium">
                          {new Date(request.startDate).toLocaleDateString()} -{" "}
                          {new Date(request.endDate).toLocaleDateString()}
                        </span>
                      </div>
                      <Badge className={getStatusColor(request.status)} variant="secondary">
                        {request.status}
                      </Badge>
                    </div>
                    <p className="text-sm text-muted-foreground mb-2">{request.reason}</p>
                    <p className="text-xs text-muted-foreground">
                      Submitted {formatDistanceToNow(new Date(request.createdAt!), { addSuffix: true })}
                    </p>
                  </CardContent>
                </Card>
              ))}
            </div>
          ) : (
            <p className="text-center py-8 text-muted-foreground">
              No PTO requests yet
            </p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
