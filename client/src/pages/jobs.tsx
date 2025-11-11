import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Job } from "@shared/schema";
import { JobCard } from "@/components/job-card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Search, Filter } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { useLocation } from "wouter";

const categories = [
  "All Categories",
  "Web Development",
  "Mobile Development",
  "Design",
  "Writing",
  "Marketing",
  "Data Science",
  "DevOps",
  "Other",
];

export default function JobsPage() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedCategory, setSelectedCategory] = useState("All Categories");
  const [minBudget, setMinBudget] = useState("");
  const [maxBudget, setMaxBudget] = useState("");

  // Build query params for backend search
  const buildQueryParams = () => {
    const params = new URLSearchParams();
    if (searchQuery) params.set("search", searchQuery);
    if (selectedCategory && selectedCategory !== "All Categories") {
      params.set("category", selectedCategory);
    }
    if (minBudget) params.set("minBudget", minBudget);
    if (maxBudget) params.set("maxBudget", maxBudget);
    return params.toString();
  };

  const { data: jobs, isLoading } = useQuery<Job[]>({
    queryKey: ["/api/jobs", searchQuery, selectedCategory, minBudget, maxBudget],
    queryFn: async () => {
      const params = buildQueryParams();
      const url = `/api/jobs${params ? `?${params}` : ""}`;
      const response = await fetch(url, { credentials: "include" });
      if (!response.ok) throw new Error("Failed to fetch jobs");
      return response.json();
    },
  });

  const claimJobMutation = useMutation({
    mutationFn: (jobId: string) => apiRequest("POST", `/api/jobs/${jobId}/claim`, {}),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/jobs"] });
      toast({
        title: "Job claimed successfully!",
        description: "You can now start working on this job.",
      });
    },
    onError: () => {
      toast({
        title: "Failed to claim job",
        description: "Please try again later.",
        variant: "destructive",
      });
    },
  });

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-3xl font-bold tracking-tight">Browse Jobs</h2>
        <p className="text-muted-foreground">
          Find your next opportunity from available projects
        </p>
      </div>

      <div className="flex flex-col gap-4">
        <div className="flex flex-col sm:flex-row gap-4">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search jobs (supports fuzzy matching & synonyms)..."
              className="pl-10"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              data-testid="input-job-search"
            />
          </div>
          <Select value={selectedCategory} onValueChange={setSelectedCategory}>
            <SelectTrigger className="w-full sm:w-[200px]" data-testid="select-category">
              <Filter className="h-4 w-4 mr-2" />
              <SelectValue placeholder="Category" />
            </SelectTrigger>
            <SelectContent>
              {categories.map((category) => (
                <SelectItem key={category} value={category}>
                  {category}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        
        <div className="flex flex-col sm:flex-row gap-4 items-end">
          <div className="flex-1 space-y-2">
            <label className="text-sm font-medium">Budget Range</label>
            <div className="flex gap-2 items-center">
              <Input
                type="number"
                placeholder="Min ($)"
                value={minBudget}
                onChange={(e) => setMinBudget(e.target.value)}
                data-testid="input-min-budget"
                className="flex-1"
              />
              <span className="text-muted-foreground">to</span>
              <Input
                type="number"
                placeholder="Max ($)"
                value={maxBudget}
                onChange={(e) => setMaxBudget(e.target.value)}
                data-testid="input-max-budget"
                className="flex-1"
              />
            </div>
          </div>
          <Button
            variant="outline"
            onClick={() => {
              setSearchQuery("");
              setSelectedCategory("All Categories");
              setMinBudget("");
              setMaxBudget("");
            }}
            data-testid="button-clear-filters"
          >
            Clear All
          </Button>
        </div>
        
        {!isLoading && jobs && (
          <p className="text-sm text-muted-foreground" data-testid="text-result-count">
            {jobs.length} job{jobs.length !== 1 ? "s" : ""} found
          </p>
        )}
      </div>

      {isLoading ? (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {[1, 2, 3, 4, 5, 6].map((i) => (
            <Skeleton key={i} className="h-64 w-full" />
          ))}
        </div>
      ) : jobs && jobs.length > 0 ? (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {jobs.map((job) => (
            <JobCard
              key={job.id}
              job={job}
              onView={(job) => setLocation(`/jobs/${job.id}`)}
              onClaim={(job) => claimJobMutation.mutate(job.id)}
            />
          ))}
        </div>
      ) : (
        <div className="text-center py-12">
          <p className="text-muted-foreground">No jobs found matching your criteria</p>
          <p className="text-sm text-muted-foreground mt-2">
            Try adjusting your search terms or filters
          </p>
        </div>
      )}
    </div>
  );
}
