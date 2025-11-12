import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { CheckCircle2, ArrowRight, ArrowLeft } from "lucide-react";
import type { User } from "@shared/schema";

interface OnboardingStep {
  title: string;
  description: string;
  content: React.ReactNode;
}

interface OnboardingModalProps {
  user: User;
  open: boolean;
  onComplete: () => void;
}

const moderatorSteps: OnboardingStep[] = [
  {
    title: "Welcome to Moderator Tools",
    description: "As a moderator, you ensure quality and fairness on the platform.",
    content: (
      <div className="space-y-4">
        <p>Your role includes:</p>
        <ul className="list-disc pl-6 space-y-2">
          <li>Reviewing and approving new job posts</li>
          <li>Handling cancellation requests with fairness</li>
          <li>Reviewing PTO requests from freelancers</li>
          <li>Maintaining platform quality standards</li>
        </ul>
      </div>
    ),
  },
  {
    title: "Reviewing Job Posts",
    description: "Navigate to Moderation Queue to review pending jobs.",
    content: (
      <div className="space-y-4">
        <p>When reviewing jobs, you can:</p>
        <ul className="list-disc pl-6 space-y-2">
          <li><strong>Approve:</strong> Job goes live on the marketplace</li>
          <li><strong>Request Changes:</strong> Send feedback to the customer</li>
          <li><strong>Reject:</strong> Decline the job entirely</li>
        </ul>
        <p className="text-sm text-muted-foreground mt-4">
          Always provide clear feedback when requesting changes or rejecting.
        </p>
      </div>
    ),
  },
  {
    title: "Cancellation Requests",
    description: "Handle freelancer and customer cancellation requests.",
    content: (
      <div className="space-y-4">
        <p>Review cancellation requests carefully:</p>
        <ul className="list-disc pl-6 space-y-2">
          <li>Check the reason and evidence provided</li>
          <li>Jobs in certain statuses require your approval</li>
          <li>You can approve, decline, or request more evidence</li>
        </ul>
      </div>
    ),
  },
  {
    title: "PTO Approvals",
    description: "Manage freelancer paid time off requests.",
    content: (
      <div className="space-y-4">
        <p>Freelancers submit PTO requests for time away:</p>
        <ul className="list-disc pl-6 space-y-2">
          <li>Review the dates and reason</li>
          <li>Approve or reject based on workload and timing</li>
          <li>Freelancers are notified of your decision</li>
        </ul>
      </div>
    ),
  },
];

const freelancerSteps: OnboardingStep[] = [
  {
    title: "Welcome to Pixelcut!",
    description: "Start earning as a freelancer on our platform.",
    content: (
      <div className="space-y-4">
        <p>Here's how to get started:</p>
        <ul className="list-disc pl-6 space-y-2">
          <li>Browse available jobs in the Marketplace</li>
          <li>Request to take jobs that match your skills</li>
          <li>Work solo or collaborate on teams</li>
          <li>Receive crypto payments to your wallet for completed work</li>
        </ul>
      </div>
    ),
  },
  {
    title: "Finding Jobs",
    description: "Browse the marketplace and filter by category.",
    content: (
      <div className="space-y-4">
        <p>In the Marketplace:</p>
        <ul className="list-disc pl-6 space-y-2">
          <li>Use search and filter to find jobs</li>
          <li>Click on jobs to see full details and budget</li>
          <li>Click "Request to Take Job" if eligible</li>
          <li><strong>One job at a time:</strong> Finish your current job before claiming another</li>
          <li>Cancel jobs anytime but you'll need a good reson</li>
        </ul>
      </div>
    ),
  },
  {
    title: "Team Collaboration",
    description: "Work with other freelancers on larger projects.",
    content: (
      <div className="space-y-4">
        <p>If a job is already taken:</p>
        <ul className="list-disc pl-6 space-y-2">
          <li>Click "Offer Team" to request joining</li>
          <li>Or invite teammates to jobs you're working on</li>
          <li>Profits split equally among all team members</li>
          <li>Collaborate in the Team tab on job details</li>
        </ul>
      </div>
    ),
  },
  {
    title: "Working Hours & Payouts",
    description: "Configure your schedule and understand your earnings.",
    content: (
      <div className="space-y-4">
        <p>Set up your profile:</p>
        <ul className="list-disc pl-6 space-y-2">
          <li>Go to Profile to set your working hours</li>
          <li>Your level (1-5) determines payout percentage: Level 1 = 60%, Level 5 = 85%</li>
          <li>Level up by completing more jobs successfully</li>
          <li>Request PTO when you need time off</li>
        </ul>
      </div>
    ),
  },
];

const customerSteps: OnboardingStep[] = [
  {
    title: "Welcome, Customer!",
    description: "Post jobs and hire talented freelancers.",
    content: (
      <div className="space-y-4">
        <p>Getting started as a customer:</p>
        <ul className="list-disc pl-6 space-y-2">
          <li>Create job posts with clear requirements</li>
          <li>Jobs are reviewed by moderators before going live</li>
          <li>Review freelancer requests to take your jobs</li>
          <li>Pay securely with crypto wallets</li>
        </ul>
      </div>
    ),
  },
  {
    title: "Creating Job Posts",
    description: "Navigate to Create Job to post a new opportunity.",
    content: (
      <div className="space-y-4">
        <p>When creating a job:</p>
        <ul className="list-disc pl-6 space-y-2">
          <li>Write a clear title and detailed description</li>
          <li>Set a fair budget in USD</li>
          <li>Choose the appropriate category</li>
          <li>Set a deadline (minimum 3 weeks out)</li>
        </ul>
        <p className="text-sm text-muted-foreground mt-4">
          Jobs must be approved by moderators before going live.
        </p>
      </div>
    ),
  },
  {
    title: "Job Review Process",
    description: "Moderators review your jobs for quality.",
    content: (
      <div className="space-y-4">
        <p>After you submit a job:</p>
        <ul className="list-disc pl-6 space-y-2">
          <li><strong>Pending:</strong> Awaiting moderator review</li>
          <li><strong>Changes Requested:</strong> Moderator feedback provided - edit and resubmit</li>
          <li><strong>Approved:</strong> Job is live on the marketplace</li>
          <li><strong>Rejected:</strong> Job did not meet quality standards</li>
        </ul>
      </div>
    ),
  },
  {
    title: "Managing Your Jobs",
    description: "Track and manage jobs in My Jobs.",
    content: (
      <div className="space-y-4">
        <p>In My Jobs you can:</p>
        <ul className="list-disc pl-6 space-y-2">
          <li>View all your jobs and their statuses</li>
          <li>Edit jobs that need changes</li>
          <li>Review freelancer requests</li>
          <li>Track job progress and completion</li>
        </ul>
      </div>
    ),
  },
];

export function OnboardingModal({ user, open, onComplete }: OnboardingModalProps) {
  const [currentStep, setCurrentStep] = useState(0);

  const steps =
    user.role === "moderator" || user.role === "staff"
      ? moderatorSteps
      : user.role === "customer"
        ? customerSteps
        : freelancerSteps;

  const progress = ((currentStep + 1) / steps.length) * 100;

  const handleNext = () => {
    if (currentStep < steps.length - 1) {
      setCurrentStep(currentStep + 1);
    } else {
      onComplete();
    }
  };

  const handleBack = () => {
    if (currentStep > 0) {
      setCurrentStep(currentStep - 1);
    }
  };

  return (
    <Dialog open={open} onOpenChange={() => {}}>
      <DialogContent className="max-w-2xl" data-testid="dialog-onboarding">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2" data-testid="text-onboarding-title">
            {steps[currentStep].title}
          </DialogTitle>
          <DialogDescription data-testid="text-onboarding-description">
            {steps[currentStep].description}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-6">
          <Progress value={progress} className="w-full" data-testid="progress-onboarding" />

          <div className="min-h-[200px]" data-testid="content-onboarding-step">
            {steps[currentStep].content}
          </div>

          <div className="text-sm text-muted-foreground text-center" data-testid="text-step-indicator">
            Step {currentStep + 1} of {steps.length}
          </div>
        </div>

        <DialogFooter className="flex justify-between gap-2">
          <Button
            variant="outline"
            onClick={handleBack}
            disabled={currentStep === 0}
            data-testid="button-onboarding-back"
          >
            <ArrowLeft className="w-4 h-4 mr-2" />
            Back
          </Button>

          <Button onClick={handleNext} data-testid="button-onboarding-next">
            {currentStep === steps.length - 1 ? (
              <>
                <CheckCircle2 className="w-4 h-4 mr-2" />
                Get Started
              </>
            ) : (
              <>
                Next
                <ArrowRight className="w-4 h-4 ml-2" />
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
