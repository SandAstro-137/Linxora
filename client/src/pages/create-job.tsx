import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQuery } from "@tanstack/react-query";
import { insertJobSchema, Job } from "@shared/schema";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Form, FormControl, FormDescription, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { useLocation, useSearch } from "wouter";
import { useAuth } from "@/lib/auth-context";
import { useEffect } from "react";
import { Skeleton } from "@/components/ui/skeleton";

const formSchema = insertJobSchema.extend({
  budget: z.string().min(1, "Budget is required"),
  deadline: z.string().optional(),
});

const categories = [
  "Web Development",
  "Mobile Development",
  "Design",
  "Writing",
  "Marketing",
  "Data Science",
  "DevOps",
  "Other",
];

export default function CreateJobPage() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [, setLocation] = useLocation();
  const searchParams = useSearch();
  const editJobId = new URLSearchParams(searchParams).get("edit");
  const isEditMode = !!editJobId;

  const form = useForm<z.infer<typeof formSchema>>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      title: "",
      description: "",
      category: "",
      budget: "",
      requirements: "",
      deadline: "",
      customerId: user?.id || "",
      status: "pending",
    },
  });

  // Fetch job data when in edit mode
  const { data: existingJob, isLoading: isLoadingJob } = useQuery<Job>({
    queryKey: [`/api/jobs/${editJobId}`],
    enabled: isEditMode && !!editJobId,
  });

  // Prefill form when job data loads
  useEffect(() => {
    if (existingJob && isEditMode) {
      form.reset({
        title: existingJob.title,
        description: existingJob.description,
        category: existingJob.category,
        budget: existingJob.budget,
        requirements: existingJob.requirements || "",
        deadline: existingJob.deadline ? new Date(existingJob.deadline).toISOString().split('T')[0] : "",
        customerId: existingJob.customerId,
        status: existingJob.status,
      });
    }
  }, [existingJob, isEditMode, form]);

  const createJobMutation = useMutation({
    mutationFn: (data: z.infer<typeof formSchema>) => {
      const jobData = {
        ...data,
        budget: data.budget,
        deadline: data.deadline ? new Date(data.deadline).toISOString() : undefined,
      };
      
      if (isEditMode && editJobId) {
        return apiRequest("PUT", `/api/jobs/${editJobId}`, jobData);
      }
      return apiRequest("POST", "/api/jobs", jobData);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/jobs"] });
      queryClient.invalidateQueries({ queryKey: ["/api/my-jobs"] });
      queryClient.invalidateQueries({ queryKey: ["/api/moderation/pending"] });
      
      toast({
        title: isEditMode ? "Job updated successfully!" : "Job posted successfully!",
        description: isEditMode 
          ? "Your job has been resubmitted for review."
          : "Your job is now in the moderation queue.",
      });
      setLocation("/my-jobs");
    },
    onError: (error: any) => {
      toast({
        title: isEditMode ? "Failed to update job" : "Failed to post job",
        description: error.message || "Please try again later.",
        variant: "destructive",
      });
    },
  });

  function onSubmit(values: z.infer<typeof formSchema>) {
    createJobMutation.mutate(values);
  }

  if (isEditMode && isLoadingJob) {
    return (
      <div className="max-w-4xl mx-auto space-y-6">
        <Skeleton className="h-12 w-64" />
        <Card>
          <CardHeader>
            <Skeleton className="h-8 w-48" />
            <Skeleton className="h-4 w-96" />
          </CardHeader>
          <CardContent className="space-y-6">
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-32 w-full" />
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <div>
        <h2 className="text-3xl font-bold tracking-tight">
          {isEditMode ? "Edit & Resubmit Job" : "Post a New Job"}
        </h2>
        <p className="text-muted-foreground">
          {isEditMode 
            ? "Update your job details and resubmit for moderation"
            : "Create a job posting to find the perfect freelancer"}
        </p>
      </div>

      {isEditMode && existingJob?.moderatorFeedback && (
        <Card className="border-destructive">
          <CardHeader>
            <CardTitle className="text-destructive">Moderator Feedback</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm whitespace-pre-wrap">{existingJob.moderatorFeedback}</p>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Job Details</CardTitle>
          <CardDescription>
            All jobs go through a moderation process before being published
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
              <FormField
                control={form.control}
                name="title"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Job Title *</FormLabel>
                    <FormControl>
                      <Input placeholder="e.g., Build a React Dashboard" {...field} data-testid="input-job-title" />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="category"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Category *</FormLabel>
                    <Select onValueChange={field.onChange} defaultValue={field.value}>
                      <FormControl>
                        <SelectTrigger data-testid="select-job-category">
                          <SelectValue placeholder="Select a category" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {categories.map((category) => (
                          <SelectItem key={category} value={category}>
                            {category}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="budget"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Budget (USD) *</FormLabel>
                    <FormControl>
                      <Input type="number" placeholder="500" {...field} data-testid="input-job-budget" />
                    </FormControl>
                    <FormDescription>Enter the total budget in USD</FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="description"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Description *</FormLabel>
                    <FormControl>
                      <Textarea
                        placeholder="Describe the job requirements and expectations..."
                        className="min-h-32"
                        {...field}
                        data-testid="input-job-description"
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="requirements"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Requirements</FormLabel>
                    <FormControl>
                      <Textarea
                        placeholder="List any specific skills or requirements..."
                        {...field}
                        value={field.value || ""}
                        data-testid="input-job-requirements"
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="deadline"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Deadline (Optional)</FormLabel>
                    <FormControl>
                      <Input type="date" {...field} data-testid="input-job-deadline" />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <div className="flex gap-4 justify-end">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setLocation("/jobs")}
                  data-testid="button-cancel"
                >
                  Cancel
                </Button>
                <Button type="submit" disabled={createJobMutation.isPending} data-testid="button-submit-job">
                  {createJobMutation.isPending 
                    ? (isEditMode ? "Updating..." : "Submitting...") 
                    : (isEditMode ? "Update & Resubmit" : "Submit for Review")}
                </Button>
              </div>
            </form>
          </Form>
        </CardContent>
      </Card>
    </div>
  );
}
