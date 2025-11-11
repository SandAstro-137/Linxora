import type { Express } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import { requireAuth, requireRole } from "./middleware/auth";
import { insertJobSchema, insertPTORequestSchema, insertInvitationSchema, insertCancellationRequestSchema, getLevelPayout, workingHoursSchema, insertTeamNoteSchema, insertTeamTaskSchema } from "@shared/schema";
import { getCryptoPrices } from "./lib/coingecko";
import { postToDiscordWebhook } from "./lib/discord-client";
import { z } from "zod";

const uploadedFiles = new Map<string, string>();

declare module "express-session" {
  interface SessionData {
    userId?: string;
    userRole?: string;
  }
}

export async function registerRoutes(app: Express): Promise<Server> {
  // Development: Simple login for testing (remove in production)
  app.post("/api/auth/dev-login", async (req, res) => {
    try {
      const { discordId } = req.body;
      let user = await storage.getUserByDiscordId(discordId);
      
      if (!user) {
        // Create demo user
        user = await storage.createUser({
          discordId,
          username: discordId.includes('freelancer') ? 'Demo Freelancer' : 
                    discordId.includes('customer') ? 'Demo Customer' :
                    discordId.includes('moderator') ? 'Demo Moderator' : 'Demo User',
          role: discordId.includes('freelancer') ? 'freelancer' : 
                discordId.includes('customer') ? 'customer' :
                discordId.includes('moderator') ? 'moderator' : 'freelancer',
          email: `${discordId}@demo.com`,
        });
        
        // Create wallet for user
        await storage.createWallet({
          userId: user.id,
          walletAddress: `0x${Math.random().toString(36).substring(2, 15)}`,
        });
      }
      
      req.session.userId = user.id;
      req.session.userRole = user.role;
      res.json(user);
    } catch (error) {
      res.status(500).json({ error: "Login failed" });
    }
  });

  // Auth routes - Discord OAuth
  app.get("/api/auth/discord", async (req, res) => {
    try {
      // Get Discord OAuth URL from connector
      const hostname = process.env.REPLIT_CONNECTORS_HOSTNAME;
      const xReplitToken = process.env.REPL_IDENTITY 
        ? 'repl ' + process.env.REPL_IDENTITY 
        : process.env.WEB_REPL_RENEWAL 
        ? 'depl ' + process.env.WEB_REPL_RENEWAL 
        : null;

      if (!xReplitToken || !hostname) {
        return res.status(500).json({ error: "OAuth configuration missing" });
      }

      const response = await fetch(
        'https://' + hostname + '/api/v2/connection?connector_names=discord',
        {
          headers: {
            'Accept': 'application/json',
            'X_REPLIT_TOKEN': xReplitToken
          }
        }
      );

      const data = await response.json();
      const connectionSettings = data.items?.[0];
      
      if (!connectionSettings?.settings?.oauth) {
        return res.status(500).json({ error: "Discord OAuth not configured" });
      }

      // Redirect to Discord OAuth
      const oauthUrl = connectionSettings.settings.oauth.authorization_url;
      res.redirect(oauthUrl);
    } catch (error) {
      console.error("Discord OAuth error:", error);
      res.status(500).json({ error: "Failed to initiate Discord login" });
    }
  });

  app.get("/api/auth/callback", async (req, res) => {
    try {
      const { code } = req.query;
      
      if (!code) {
        return res.redirect("/?error=no_code");
      }

      // Exchange code for access token
      const hostname = process.env.REPLIT_CONNECTORS_HOSTNAME;
      const xReplitToken = process.env.REPL_IDENTITY 
        ? 'repl ' + process.env.REPL_IDENTITY 
        : process.env.WEB_REPL_RENEWAL 
        ? 'depl ' + process.env.WEB_REPL_RENEWAL 
        : null;

      if (!xReplitToken || !hostname) {
        return res.redirect("/?error=config_missing");
      }

      // Get user info from Discord
      const connectionResponse = await fetch(
        'https://' + hostname + '/api/v2/connection?include_secrets=true&connector_names=discord',
        {
          headers: {
            'Accept': 'application/json',
            'X_REPLIT_TOKEN': xReplitToken
          }
        }
      );

      const connectionData = await connectionResponse.json();
      const accessToken = connectionData.items?.[0]?.settings?.access_token;

      if (!accessToken) {
        return res.redirect("/?error=no_token");
      }

      // Get Discord user data
      const userResponse = await fetch('https://discord.com/api/users/@me', {
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
      });

      const discordUser = await userResponse.json();

      // Find or create user
      let user = await storage.getUserByDiscordId(discordUser.id);
      
      if (!user) {
        user = await storage.createUser({
          discordId: discordUser.id,
          username: discordUser.username,
          email: discordUser.email,
          avatar: discordUser.avatar 
            ? `https://cdn.discordapp.com/avatars/${discordUser.id}/${discordUser.avatar}.png` 
            : null,
          role: "freelancer", // Default role
        });

        // Create wallet for new user
        await storage.createWallet({
          userId: user.id,
          walletAddress: `0x${Math.random().toString(36).substring(2, 15)}`,
        });
      }

      // Set session
      req.session.userId = user.id;
      req.session.userRole = user.role;

      res.redirect("/dashboard");
    } catch (error) {
      console.error("OAuth callback error:", error);
      res.redirect("/?error=callback_failed");
    }
  });

  app.get("/api/auth/me", requireAuth, async (req, res) => {
    try {
      const user = await storage.getUser(req.session.userId!);
      if (!user) {
        return res.status(404).json({ error: "User not found" });
      }
      res.json(user);
    } catch (error) {
      res.status(500).json({ error: "Internal server error" });
    }
  });

  app.post("/api/auth/logout", (req, res) => {
    req.session.destroy(() => {
      res.json({ success: true });
    });
  });

  // Mark onboarding as completed
  app.post("/api/auth/complete-onboarding", requireAuth, async (req, res) => {
    try {
      const user = await storage.updateUser(req.session.userId!, {
        onboardingCompleted: true,
      });
      if (!user) {
        return res.status(404).json({ error: "User not found" });
      }
      res.json(user);
    } catch (error) {
      res.status(500).json({ error: "Internal server error" });
    }
  });

  // Dashboard stats
  app.get("/api/dashboard/stats", requireAuth, async (req, res) => {
    try {
      const user = await storage.getUser(req.session.userId!);
      if (!user) {
        return res.status(404).json({ error: "User not found" });
      }

      const stats: any = {};

      if (user.role === "freelancer") {
        const activeJobs = await storage.getJobs({ freelancerId: user.id, status: "in_progress" });
        stats.activeJobs = activeJobs.length;
      } else if (user.role === "customer") {
        const allJobs = await storage.getJobs({ customerId: user.id });
        stats.postedJobs = allJobs.length;
        stats.activeJobs = allJobs.filter(j => j.status === "active" || j.status === "in_progress").length;
        stats.pendingJobs = allJobs.filter(j => j.status === "pending").length;
        stats.totalSpent = allJobs.reduce((sum, j) => sum + parseFloat(j.budget), 0).toFixed(2);
      } else if (user.role === "staff" || user.role === "moderator") {
        const pendingJobs = await storage.getJobsByStatus("pending");
        const allJobs = await storage.getJobs();
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        
        stats.pendingJobs = pendingJobs.length;
        stats.totalJobs = allJobs.length;
        stats.activeJobs = allJobs.filter(j => j.status === "active").length;
        stats.approvedToday = allJobs.filter(j => 
          j.status === "active" && 
          j.updatedAt && 
          new Date(j.updatedAt) >= today
        ).length;
      }

      res.json(stats);
    } catch (error) {
      res.status(500).json({ error: "Internal server error" });
    }
  });

  // Job routes
  app.get("/api/jobs", requireAuth, async (req, res) => {
    try {
      const jobs = await storage.getJobs({ status: "active" });
      res.json(jobs);
    } catch (error) {
      res.status(500).json({ error: "Internal server error" });
    }
  });

  app.get("/api/jobs/recent", requireAuth, async (req, res) => {
    try {
      const jobs = await storage.getJobs({ status: "active" });
      res.json(jobs.slice(0, 10));
    } catch (error) {
      res.status(500).json({ error: "Internal server error" });
    }
  });

  app.get("/api/my-jobs", requireRole("customer"), async (req, res) => {
    try {
      const jobs = await storage.getJobs({ customerId: req.session.userId! });
      res.json(jobs);
    } catch (error) {
      res.status(500).json({ error: "Internal server error" });
    }
  });

  app.get("/api/jobs/:id", requireAuth, async (req, res) => {
    try {
      const job = await storage.getJob(req.params.id);
      if (!job) {
        return res.status(404).json({ error: "Job not found" });
      }

      // Enrich job data with customer info
      const customer = await storage.getUser(job.customerId);
      
      // Enrich with collaborator info
      const collaboratorIds = job.collaborators || [];
      const allMemberIds = job.freelancerId 
        ? [job.freelancerId, ...collaboratorIds]
        : collaboratorIds;
      
      const collaboratorData = await Promise.all(
        allMemberIds.map(async (id) => {
          const user = await storage.getUser(id);
          return user ? {
            id: user.id,
            username: user.username,
            avatar: user.avatar,
            specialization: user.specialization,
          } : null;
        })
      );

      // Calculate profit splits
      const profitSplits = allMemberIds.length > 0 ? await calculateProfitSplits(job, allMemberIds) : [];

      const enrichedJob = {
        ...job,
        customerUsername: customer?.username,
        customerDiscordId: customer?.discordId,
        collaboratorData: collaboratorData.filter(Boolean),
        profitSplits,
      };

      res.json(enrichedJob);
    } catch (error) {
      res.status(500).json({ error: "Internal server error" });
    }
  });

  async function calculateProfitSplits(job: any, memberIds: string[]) {
    const budget = parseFloat(job.budget);
    const totalMembers = memberIds.length;
    const basePercentage = 100 / totalMembers;
    const baseShareAmount = budget / totalMembers;

    const splits = await Promise.all(
      memberIds.map(async (userId) => {
        const user = await storage.getUser(userId);
        const level = user?.level || 1;
        const levelPayout = getLevelPayout(level);
        const actualAmount = baseShareAmount * levelPayout;

        return {
          userId,
          level,
          percentage: parseFloat(basePercentage.toFixed(2)),
          baseAmount: baseShareAmount.toFixed(2),
          levelPayout: (levelPayout * 100).toFixed(0) + "%",
          amount: actualAmount.toFixed(2),
        };
      })
    );

    return splits;
  }

  app.post("/api/jobs", requireAuth, async (req, res) => {
    try {
      const user = await storage.getUser(req.session.userId!);
      if (!user) {
        return res.status(404).json({ error: "User not found" });
      }

      if (user.role !== "customer") {
        return res.status(403).json({ error: "Only customers can post jobs" });
      }

      const validated = insertJobSchema.parse(req.body);
      
      const wallet = await storage.getWallet(req.session.userId!);
      if (!wallet) {
        return res.status(400).json({ error: "Wallet not found" });
      }

      const budget = parseFloat(validated.budget);
      const walletBalance = parseFloat(wallet.usdtBalance || "0");

      if (budget > walletBalance) {
        return res.status(400).json({ error: "Budget cannot exceed your wallet balance" });
      }

      const job = await storage.createJob({
        ...validated,
        customerId: req.session.userId!,
        status: "pending",
      });
      res.json(job);
    } catch (error: any) {
      res.status(400).json({ error: error.message || "Invalid job data" });
    }
  });

  app.put("/api/jobs/:id", requireRole("customer"), async (req, res) => {
    try {
      const job = await storage.getJob(req.params.id);
      if (!job) {
        return res.status(404).json({ error: "Job not found" });
      }

      // Only the job owner can edit
      if (job.customerId !== req.session.userId!) {
        return res.status(403).json({ error: "You can only edit your own jobs" });
      }

      // Only allow editing if job is pending, changes_requested, or rejected
      if (!["pending", "changes_requested", "rejected"].includes(job.status)) {
        return res.status(400).json({ error: "Cannot edit jobs that are active or in progress" });
      }

      const validated = insertJobSchema.parse(req.body);
      
      // Check wallet balance
      const wallet = await storage.getWallet(req.session.userId!);
      if (!wallet) {
        return res.status(400).json({ error: "Wallet not found" });
      }

      const budget = parseFloat(validated.budget);
      const walletBalance = parseFloat(wallet.usdtBalance || "0");

      if (budget > walletBalance) {
        return res.status(400).json({ error: "Budget cannot exceed your wallet balance" });
      }

      // Update job, reset status to pending, and clear moderator feedback
      const updatedJob = await storage.updateJob(req.params.id, {
        ...validated,
        status: "pending",
        moderatorFeedback: null,
      });

      res.json(updatedJob);
    } catch (error: any) {
      res.status(400).json({ error: error.message || "Invalid job data" });
    }
  });

  app.post("/api/jobs/:id/claim", requireAuth, async (req, res) => {
    try {
      const user = await storage.getUser(req.session.userId!);
      if (!user) {
        return res.status(404).json({ error: "User not found" });
      }

      if (user.role !== "freelancer") {
        return res.status(403).json({ error: "Only freelancers can request jobs" });
      }

      // Check for one-job-at-a-time restriction
      const activeJobs = await storage.getJobs({ 
        freelancerId: req.session.userId!, 
        status: "in_progress" 
      });
      const claimedJobs = await storage.getJobs({ 
        freelancerId: req.session.userId!, 
        status: "claimed" 
      });
      const requestedJobs = await storage.getJobs({ 
        freelancerId: req.session.userId!, 
        status: "freelancer_requested" 
      });

      if (activeJobs.length > 0 || claimedJobs.length > 0 || requestedJobs.length > 0) {
        return res.status(400).json({ error: "You can only have one job at a time. Complete or cancel your current job first." });
      }

      const job = await storage.getJob(req.params.id);
      if (!job || job.status !== "active") {
        return res.status(400).json({ error: "This job is not available" });
      }

      // Set job to freelancer_requested status
      const updatedJob = await storage.updateJob(req.params.id, {
        status: "freelancer_requested",
        freelancerId: req.session.userId!,
      });

      // Create notification for customer
      await storage.createNotification({
        userId: job.customerId,
        type: "job_request",
        title: "New job request",
        message: `${user.username} has requested to work on your job: ${job.title}`,
        relatedId: job.id,
      });

      res.json(updatedJob);
    } catch (error) {
      console.error("Error requesting job:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  // Customer approve/reject freelancer request
  app.post("/api/jobs/:id/approve-freelancer", requireAuth, async (req, res) => {
    try {
      const user = await storage.getUser(req.session.userId!);
      if (!user) {
        return res.status(404).json({ error: "User not found" });
      }

      const job = await storage.getJob(req.params.id);
      if (!job) {
        return res.status(404).json({ error: "Job not found" });
      }

      if (job.customerId !== req.session.userId!) {
        return res.status(403).json({ error: "Only the job owner can approve freelancers" });
      }

      if (job.status !== "freelancer_requested") {
        return res.status(400).json({ error: "No pending freelancer request for this job" });
      }

      // Check if customer has enough available balance (total - pending)
      const customerWallet = await storage.getWallet(req.session.userId!);
      if (!customerWallet) {
        return res.status(404).json({ error: "Customer wallet not found" });
      }

      const jobBudget = parseFloat(job.budget);
      const customerUSDT = parseFloat(customerWallet.usdtBalance || "0");
      const customerPending = parseFloat(customerWallet.pendingUsdtBalance || "0");
      const availableBalance = customerUSDT - customerPending;

      if (availableBalance < jobBudget) {
        return res.status(400).json({ error: "Insufficient available USDT balance to approve this job" });
      }

      // Add to customer's pending balance (funds are now locked for this job)
      await storage.adjustPendingBalance(req.session.userId!, jobBudget);

      // Update job status to claimed
      const updatedJob = await storage.updateJob(req.params.id, {
        status: "claimed",
      });

      // Notify freelancer
      if (job.freelancerId) {
        await storage.createNotification({
          userId: job.freelancerId,
          type: "job_approved",
          title: "Job request approved!",
          message: `Your request for "${job.title}" has been approved. You can now start working!`,
          relatedId: job.id,
        });
      }

      res.json(updatedJob);
    } catch (error) {
      console.error("Error approving freelancer:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  app.post("/api/jobs/:id/reject-freelancer", requireAuth, async (req, res) => {
    try {
      const user = await storage.getUser(req.session.userId!);
      if (!user) {
        return res.status(404).json({ error: "User not found" });
      }

      const job = await storage.getJob(req.params.id);
      if (!job) {
        return res.status(404).json({ error: "Job not found" });
      }

      if (job.customerId !== req.session.userId!) {
        return res.status(403).json({ error: "Only the job owner can reject freelancers" });
      }

      if (job.status !== "freelancer_requested") {
        return res.status(400).json({ error: "No pending freelancer request for this job" });
      }

      const freelancerId = job.freelancerId;

      // Update job status back to active and clear freelancer
      const updatedJob = await storage.updateJob(req.params.id, {
        status: "active",
        freelancerId: null,
      });

      // Notify freelancer
      if (freelancerId) {
        await storage.createNotification({
          userId: freelancerId,
          type: "job_rejected",
          title: "Job request declined",
          message: `Your request for "${job.title}" was not accepted.`,
          relatedId: job.id,
        });
      }

      res.json(updatedJob);
    } catch (error) {
      console.error("Error rejecting freelancer:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  // Job completion route
  app.post("/api/jobs/:id/complete", requireAuth, async (req, res) => {
    try {
      const job = await storage.getJob(req.params.id);
      if (!job) {
        return res.status(404).json({ error: "Job not found" });
      }

      // Only customer or admin can mark job as complete
      const user = await storage.getUser(req.session.userId!);
      if (job.customerId !== req.session.userId! && user?.role !== "staff" && user?.role !== "moderator") {
        return res.status(403).json({ error: "Only the customer or admin can complete this job" });
      }

      if (job.status !== "claimed" && job.status !== "in_progress") {
        return res.status(400).json({ error: "Job must be claimed or in progress to complete" });
      }

      if (!job.freelancerId) {
        return res.status(400).json({ error: "No freelancer assigned to this job" });
      }

      // Release pending funds from customer
      const jobBudget = parseFloat(job.budget);
      await storage.adjustPendingBalance(job.customerId, -jobBudget);

      // Get customer wallet to deduct funds
      const customerWallet = await storage.getWallet(job.customerId);
      if (customerWallet) {
        const customerUSDT = parseFloat(customerWallet.usdtBalance || "0");
        await storage.updateWallet(job.customerId, {
          usdtBalance: (customerUSDT - jobBudget).toFixed(8),
        });

        // Create customer transaction
        await storage.createTransaction({
          walletId: customerWallet.id,
          type: "withdrawal",
          currency: "USDT",
          amount: jobBudget.toFixed(8),
          usdAmount: jobBudget.toFixed(2),
          status: "completed",
          transactionHash: `job-payment-${job.id}`,
        });
      }

      // Transfer funds to freelancer
      const freelancerWallet = await storage.getWallet(job.freelancerId);
      if (freelancerWallet) {
        const freelancerUSDT = parseFloat(freelancerWallet.usdtBalance || "0");
        await storage.updateWallet(job.freelancerId, {
          usdtBalance: (freelancerUSDT + jobBudget).toFixed(8),
        });

        // Create freelancer transaction
        await storage.createTransaction({
          walletId: freelancerWallet.id,
          type: "deposit",
          currency: "USDT",
          amount: jobBudget.toFixed(8),
          usdAmount: jobBudget.toFixed(2),
          status: "completed",
          transactionHash: `job-payment-${job.id}`,
        });
      }

      // Mark job as completed
      const updatedJob = await storage.updateJob(req.params.id, { status: "completed" });

      // Notify freelancer
      await storage.createNotification({
        userId: job.freelancerId,
        type: "job_completed",
        title: "Job completed!",
        message: `The job "${job.title}" has been completed and payment of $${jobBudget} USDT has been transferred to your wallet.`,
        relatedId: job.id,
      });

      res.json(updatedJob);
    } catch (error) {
      console.error("Error completing job:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  // Team collaboration routes - Team Notes
  app.get("/api/team-notes/:jobId", requireAuth, async (req, res) => {
    try {
      const job = await storage.getJob(req.params.jobId);
      if (!job) {
        return res.status(404).json({ error: "Job not found" });
      }

      // Check if user is part of the team (freelancer, collaborator, or customer)
      const isPartOfTeam = 
        job.customerId === req.session.userId ||
        job.freelancerId === req.session.userId ||
        job.collaborators?.includes(req.session.userId!);

      if (!isPartOfTeam) {
        return res.status(403).json({ error: "You are not part of this job's team" });
      }

      const notes = await storage.getTeamNotes(req.params.jobId);
      res.json(notes);
    } catch (error) {
      console.error("Error fetching team notes:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  app.post("/api/team-notes", requireAuth, async (req, res) => {
    try {
      // Validate without authorId (will be set from session)
      const { jobId, content } = insertTeamNoteSchema.omit({ authorId: true }).parse(req.body);
      
      const job = await storage.getJob(jobId);
      if (!job) {
        return res.status(404).json({ error: "Job not found" });
      }

      // Check if user is part of the team
      const isPartOfTeam = 
        job.customerId === req.session.userId ||
        job.freelancerId === req.session.userId ||
        job.collaborators?.includes(req.session.userId!);

      if (!isPartOfTeam) {
        return res.status(403).json({ error: "You are not part of this job's team" });
      }

      const note = await storage.createTeamNote({
        jobId,
        content,
        authorId: req.session.userId!,
      });

      res.status(201).json(note);
    } catch (error) {
      console.error("Error creating team note:", error);
      res.status(400).json({ error: "Invalid note data" });
    }
  });

  app.put("/api/team-notes/:id", requireAuth, async (req, res) => {
    try {
      // Fetch ALL team notes to find this specific note
      // This is inefficient but necessary with current storage interface
      let existingNote: any = null;
      
      // Try to find the note by checking all jobs (not ideal, but works with current API)
      // In production, we'd add a getTeamNoteById method to IStorage
      const allJobs = await storage.getAllJobs();
      for (const job of allJobs) {
        const notes = await storage.getTeamNotes(job.id);
        const found = notes.find(n => n.id === req.params.id);
        if (found) {
          existingNote = found;
          break;
        }
      }
      
      if (!existingNote) {
        return res.status(404).json({ error: "Note not found" });
      }

      // Now verify user is part of the team using the REAL jobId from the note
      const job = await storage.getJob(existingNote.jobId);
      if (!job) {
        return res.status(404).json({ error: "Job not found" });
      }

      const isPartOfTeam = 
        job.customerId === req.session.userId ||
        job.freelancerId === req.session.userId ||
        job.collaborators?.includes(req.session.userId!);

      if (!isPartOfTeam) {
        return res.status(403).json({ error: "You are not part of this job's team" });
      }

      // Only allow updating content
      const note = await storage.updateTeamNote(req.params.id, { 
        content: req.body.content 
      });
      
      res.json(note);
    } catch (error) {
      console.error("Error updating team note:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  app.delete("/api/team-notes/:id", requireAuth, async (req, res) => {
    try {
      // Fetch the note first to get its real jobId
      let existingNote: any = null;
      const allJobs = await storage.getAllJobs();
      for (const job of allJobs) {
        const notes = await storage.getTeamNotes(job.id);
        const found = notes.find(n => n.id === req.params.id);
        if (found) {
          existingNote = found;
          break;
        }
      }
      
      if (!existingNote) {
        return res.status(404).json({ error: "Note not found" });
      }

      // Verify user is part of the team using the REAL jobId
      const job = await storage.getJob(existingNote.jobId);
      if (!job) {
        return res.status(404).json({ error: "Job not found" });
      }

      const isPartOfTeam = 
        job.customerId === req.session.userId ||
        job.freelancerId === req.session.userId ||
        job.collaborators?.includes(req.session.userId!);

      if (!isPartOfTeam) {
        return res.status(403).json({ error: "You are not part of this job's team" });
      }

      await storage.deleteTeamNote(req.params.id);
      res.status(204).send();
    } catch (error) {
      console.error("Error deleting team note:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  // Team collaboration routes - Team Tasks
  app.get("/api/team-tasks/:jobId", requireAuth, async (req, res) => {
    try {
      const job = await storage.getJob(req.params.jobId);
      if (!job) {
        return res.status(404).json({ error: "Job not found" });
      }

      // Check if user is part of the team
      const isPartOfTeam = 
        job.customerId === req.session.userId ||
        job.freelancerId === req.session.userId ||
        job.collaborators?.includes(req.session.userId!);

      if (!isPartOfTeam) {
        return res.status(403).json({ error: "You are not part of this job's team" });
      }

      const tasks = await storage.getTeamTasks(req.params.jobId);
      res.json(tasks);
    } catch (error) {
      console.error("Error fetching team tasks:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  app.post("/api/team-tasks", requireAuth, async (req, res) => {
    try {
      const validatedTask = insertTeamTaskSchema.parse(req.body);
      
      const job = await storage.getJob(validatedTask.jobId);
      if (!job) {
        return res.status(404).json({ error: "Job not found" });
      }

      // Check if user is part of the team
      const isPartOfTeam = 
        job.customerId === req.session.userId ||
        job.freelancerId === req.session.userId ||
        job.collaborators?.includes(req.session.userId!);

      if (!isPartOfTeam) {
        return res.status(403).json({ error: "You are not part of this job's team" });
      }

      const task = await storage.createTeamTask(validatedTask);
      res.status(201).json(task);
    } catch (error) {
      console.error("Error creating team task:", error);
      res.status(400).json({ error: "Invalid task data" });
    }
  });

  app.put("/api/team-tasks/:id", requireAuth, async (req, res) => {
    try {
      // Validate update payload  
      const updates = z.object({
        title: z.string().optional(),
        description: z.string().optional(),
        assigneeId: z.string().optional(),
        status: z.enum(["todo", "in_progress", "done"]).optional(),
      }).parse(req.body);

      // Fetch the existing task to get its real jobId
      let existingTask: any = null;
      const allJobs = await storage.getAllJobs();
      for (const job of allJobs) {
        const tasks = await storage.getTeamTasks(job.id);
        const found = tasks.find(t => t.id === req.params.id);
        if (found) {
          existingTask = found;
          break;
        }
      }
      
      if (!existingTask) {
        return res.status(404).json({ error: "Task not found" });
      }

      // Verify user is part of the team using the REAL jobId
      const job = await storage.getJob(existingTask.jobId);
      if (!job) {
        return res.status(404).json({ error: "Job not found" });
      }

      const isPartOfTeam = 
        job.customerId === req.session.userId ||
        job.freelancerId === req.session.userId ||
        job.collaborators?.includes(req.session.userId!);

      if (!isPartOfTeam) {
        return res.status(403).json({ error: "You are not part of this job's team" });
      }

      const task = await storage.updateTeamTask(req.params.id, updates);
      res.json(task);
    } catch (error) {
      console.error("Error updating team task:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  app.delete("/api/team-tasks/:id", requireAuth, async (req, res) => {
    try {
      // Fetch the task first to get its real jobId
      let existingTask: any = null;
      const allJobs = await storage.getAllJobs();
      for (const job of allJobs) {
        const tasks = await storage.getTeamTasks(job.id);
        const found = tasks.find(t => t.id === req.params.id);
        if (found) {
          existingTask = found;
          break;
        }
      }
      
      if (!existingTask) {
        return res.status(404).json({ error: "Task not found" });
      }

      // Verify user is part of the team using the REAL jobId
      const job = await storage.getJob(existingTask.jobId);
      if (!job) {
        return res.status(404).json({ error: "Job not found" });
      }

      const isPartOfTeam = 
        job.customerId === req.session.userId ||
        job.freelancerId === req.session.userId ||
        job.collaborators?.includes(req.session.userId!);

      if (!isPartOfTeam) {
        return res.status(403).json({ error: "You are not part of this job's team" });
      }

      await storage.deleteTeamTask(req.params.id);
      res.status(204).send();
    } catch (error) {
      console.error("Error deleting team task:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  // Moderation routes
  app.get("/api/moderation/pending", requireRole("staff", "moderator"), async (req, res) => {
    try {
      const pendingJobs = await storage.getJobsByStatus("pending");
      res.json(pendingJobs);
    } catch (error) {
      res.status(500).json({ error: "Internal server error" });
    }
  });

  app.post("/api/moderation/:id/approve", requireRole("staff", "moderator"), async (req, res) => {
    try {
      const job = await storage.updateJob(req.params.id, { status: "active" });
      if (!job) {
        return res.status(404).json({ error: "Job not found" });
      }

      // Notify customer that their job was approved
      await storage.createNotification({
        userId: job.customerId,
        type: "job_approved",
        title: "Job approved!",
        message: `Your job "${job.title}" has been approved and is now live on the marketplace.`,
        relatedId: job.id,
      });

      // Post to Discord webhook
      await postToDiscordWebhook(
        `🎉 New job approved: **${job.title}**\nBudget: $${job.budget}\nCategory: ${job.category}\n${job.description.slice(0, 100)}...`
      );

      res.json(job);
    } catch (error) {
      res.status(500).json({ error: "Internal server error" });
    }
  });

  app.post("/api/moderation/:id/reject", requireRole("staff", "moderator"), async (req, res) => {
    try {
      const job = await storage.updateJob(req.params.id, { status: "rejected" });
      if (!job) {
        return res.status(404).json({ error: "Job not found" });
      }

      // Notify customer that their job was rejected
      await storage.createNotification({
        userId: job.customerId,
        type: "job_rejected",
        title: "Job rejected",
        message: `Your job "${job.title}" was not approved. Please review our guidelines and try again.`,
        relatedId: job.id,
      });

      res.json(job);
    } catch (error) {
      res.status(500).json({ error: "Internal server error" });
    }
  });

  app.post("/api/moderation/:id/request-changes", requireRole("staff", "moderator"), async (req, res) => {
    try {
      const { feedback } = req.body;
      
      if (!feedback || !feedback.trim()) {
        return res.status(400).json({ error: "Feedback is required" });
      }

      const job = await storage.getJob(req.params.id);
      if (!job) {
        return res.status(404).json({ error: "Job not found" });
      }

      // Update job status to changes_requested and store feedback
      const updatedJob = await storage.updateJob(req.params.id, { 
        status: "changes_requested",
        moderatorFeedback: feedback 
      });

      // Notify the customer with the feedback
      if (job.customerId) {
        await storage.createNotification({
          userId: job.customerId,
          type: "job_changes_requested",
          title: "Changes requested for your job",
          message: `Your job "${job.title}" requires the following changes:\n\n${feedback}`,
          relatedId: job.id,
        });
      }

      res.json(updatedJob);
    } catch (error) {
      console.error("Error requesting changes:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  // File upload endpoint (stub for proof uploads)
  app.post("/api/uploads", requireAuth, async (req, res) => {
    try {
      const { fileName, fileData } = req.body;
      
      if (!fileName || !fileData) {
        return res.status(400).json({ error: "File name and data required" });
      }

      const fileId = `${Date.now()}-${Math.random().toString(36).substring(2, 15)}`;
      const fileUrl = `/uploads/${fileId}-${fileName}`;
      
      uploadedFiles.set(fileUrl, fileData);
      
      res.json({ url: fileUrl });
    } catch (error) {
      res.status(500).json({ error: "File upload failed" });
    }
  });

  // Cancellation request routes
  app.post("/api/cancellation-requests", requireAuth, async (req, res) => {
    try {
      const user = await storage.getUser(req.session.userId!);
      if (!user) {
        return res.status(404).json({ error: "User not found" });
      }

      const { jobId, reason, proofUrl } = req.body;
      
      if (!jobId) {
        return res.status(400).json({ error: "Job ID is required" });
      }

      const job = await storage.getJob(jobId);
      if (!job) {
        return res.status(404).json({ error: "Job not found" });
      }

      // Role-based access control
      const isFreelancer = user.role === "freelancer" && job.freelancerId === user.id;
      const isCustomer = user.role === "customer" && job.customerId === user.id;

      if (!isFreelancer && !isCustomer) {
        return res.status(403).json({ error: "You can only cancel your own jobs" });
      }

      // Determine if approval is required based on role and job status
      let approvalRequired = false;
      let newJobStatus: string = job.status;

      if (isFreelancer) {
        // Freelancer: always requires admin approval if job is taken/in-progress
        if (job.status === "claimed" || job.status === "in_progress") {
          approvalRequired = true;
          if (!reason || reason.trim().length < 10) {
            return res.status(400).json({ error: "Reason must be at least 10 characters" });
          }
        }
      } else if (isCustomer) {
        // Customer: immediate cancellation for active/pending, approval required for taken jobs
        if (job.status === "pending" || job.status === "active") {
          // Immediate cancellation - no approval needed
          approvalRequired = false;
          newJobStatus = "active"; // Reset to active (or could use a "cancelled" status)
        } else if (job.status === "claimed" || job.status === "in_progress") {
          // Requires admin approval
          approvalRequired = true;
        }
      }

      // Create cancellation request record for audit
      const cancellationRequest = await storage.createCancellationRequest({
        jobId,
        requesterId: user.id,
        reason: reason || "No reason provided",
        proofUrl: proofUrl || null,
        status: approvalRequired ? "pending" : "approved",
        reviewerId: approvalRequired ? null : user.id,
        reviewNotes: approvalRequired ? null : "Auto-approved: immediate customer cancellation",
      });

      // If no approval required, update job status immediately
      let updatedJob = job;
      if (!approvalRequired && isCustomer) {
        updatedJob = await storage.updateJob(jobId, {
          status: "active",
          freelancerId: null,
          collaborators: [],
        }) || job;

        // Create notification for admin/moderators
        await storage.createNotification({
          userId: user.id,
          type: "cancellation_request",
          title: "Job cancelled",
          message: `Your job "${job.title}" has been cancelled`,
          relatedId: jobId,
        });
      }

      res.json({
        cancellationRequest,
        approvalRequired,
        jobStatus: updatedJob.status,
        message: approvalRequired 
          ? "Cancellation request submitted for admin review" 
          : "Job cancelled successfully",
      });
    } catch (error: any) {
      console.error("Cancellation request error:", error);
      res.status(400).json({ error: error.message || "Invalid cancellation request" });
    }
  });

  app.get("/api/cancellation-requests", requireRole("staff", "moderator"), async (req, res) => {
    try {
      const requests = await storage.getAllCancellationRequests();
      res.json(requests);
    } catch (error) {
      res.status(500).json({ error: "Internal server error" });
    }
  });

  app.get("/api/cancellation-requests/my", requireAuth, async (req, res) => {
    try {
      const requests = await storage.getCancellationRequests({ requesterId: req.session.userId! });
      res.json(requests);
    } catch (error) {
      res.status(500).json({ error: "Internal server error" });
    }
  });

  app.get("/api/cancellation-requests/job/:jobId", requireAuth, async (req, res) => {
    try {
      const requests = await storage.getCancellationRequests({ jobId: req.params.jobId });
      res.json(requests);
    } catch (error) {
      res.status(500).json({ error: "Internal server error" });
    }
  });

  app.post("/api/cancellation-requests/:id/approve", requireRole("staff", "moderator"), async (req, res) => {
    try {
      const request = await storage.getCancellationRequest(req.params.id);
      if (!request) {
        return res.status(404).json({ error: "Cancellation request not found" });
      }

      const job = await storage.getJob(request.jobId);
      if (!job) {
        return res.status(404).json({ error: "Job not found" });
      }

      const updatedRequest = await storage.updateCancellationRequest(req.params.id, {
        status: "approved",
        reviewerId: req.session.userId!,
        reviewNotes: req.body.reviewNotes || null,
      });

      // Release pending funds back to customer (make them available again)
      const jobBudget = parseFloat(job.budget);
      await storage.adjustPendingBalance(job.customerId, -jobBudget);

      const updatedJob = await storage.updateJob(request.jobId, { 
        status: "active",
        freelancerId: null,
      });

      res.json({ request: updatedRequest, job: updatedJob });
    } catch (error) {
      res.status(500).json({ error: "Internal server error" });
    }
  });

  app.post("/api/cancellation-requests/:id/decline", requireRole("staff", "moderator"), async (req, res) => {
    try {
      const request = await storage.updateCancellationRequest(req.params.id, {
        status: "declined",
        reviewerId: req.session.userId!,
        reviewNotes: req.body.reviewNotes || null,
      });

      if (!request) {
        return res.status(404).json({ error: "Cancellation request not found" });
      }

      res.json(request);
    } catch (error) {
      res.status(500).json({ error: "Internal server error" });
    }
  });

  app.post("/api/cancellation-requests/:id/request-evidence", requireRole("staff", "moderator"), async (req, res) => {
    try {
      const request = await storage.updateCancellationRequest(req.params.id, {
        status: "needs_more_evidence",
        reviewerId: req.session.userId!,
        reviewNotes: req.body.reviewNotes || "Additional evidence required",
      });

      if (!request) {
        return res.status(404).json({ error: "Cancellation request not found" });
      }

      res.json(request);
    } catch (error) {
      res.status(500).json({ error: "Internal server error" });
    }
  });

  // Wallet routes
  app.get("/api/wallet", requireAuth, async (req, res) => {
    try {
      let wallet = await storage.getWallet(req.session.userId!);
      if (!wallet) {
        wallet = await storage.createWallet({
          userId: req.session.userId!,
          walletAddress: `0x${Math.random().toString(36).substring(2, 15)}`,
        });
      }
      
      // Calculate available balance
      const totalBalance = parseFloat(wallet.usdtBalance || "0");
      const pendingBalance = parseFloat(wallet.pendingUsdtBalance || "0");
      const availableBalance = totalBalance - pendingBalance;
      
      // Return wallet with calculated available balance
      res.json({
        ...wallet,
        availableUsdtBalance: availableBalance.toFixed(8),
      });
    } catch (error) {
      res.status(500).json({ error: "Internal server error" });
    }
  });

  app.get("/api/wallet/prices", async (req, res) => {
    try {
      const prices = await getCryptoPrices();
      res.json(prices);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch prices" });
    }
  });

  app.get("/api/wallet/transactions", requireAuth, async (req, res) => {
    try {
      const wallet = await storage.getWallet(req.session.userId!);
      if (!wallet) {
        return res.json([]);
      }
      const transactions = await storage.getTransactions(wallet.id);
      res.json(transactions);
    } catch (error) {
      res.status(500).json({ error: "Internal server error" });
    }
  });

  app.post("/api/wallet/withdraw", requireAuth, async (req, res) => {
    try {
      const { currency, amount, address } = req.body;
      
      const wallet = await storage.getWallet(req.session.userId!);
      if (!wallet) {
        return res.status(404).json({ error: "Wallet not found" });
      }

      // Simulate withdrawal (in production, this would interact with blockchain)
      const currencyKey = `${currency.toLowerCase()}Balance` as keyof typeof wallet;
      const currentBalance = parseFloat(wallet[currencyKey] as string);
      const withdrawAmount = parseFloat(amount);

      // For USDT, check available balance (total - pending)
      if (currency.toUpperCase() === "USDT") {
        const pendingBalance = parseFloat(wallet.pendingUsdtBalance || "0");
        const availableBalance = currentBalance - pendingBalance;
        
        if (availableBalance < withdrawAmount) {
          return res.status(400).json({ 
            error: "Insufficient available balance",
            details: `You have ${availableBalance.toFixed(2)} USDT available (${pendingBalance.toFixed(2)} USDT locked in active jobs)`
          });
        }
      } else if (currentBalance < withdrawAmount) {
        return res.status(400).json({ error: "Insufficient balance" });
      }

      // Update wallet balance
      await storage.updateWallet(req.session.userId!, {
        [currencyKey]: (currentBalance - withdrawAmount).toString(),
      });

      // Get current price
      const prices = await getCryptoPrices();
      const price = prices[currency.toLowerCase()]?.usd || 0;

      // Create transaction record
      const transaction = await storage.createTransaction({
        walletId: wallet.id,
        type: "withdrawal",
        currency,
        amount: withdrawAmount.toString(),
        usdAmount: (withdrawAmount * price).toString(),
        status: "completed",
        transactionHash: `0x${Math.random().toString(36).substring(2, 15)}${Math.random().toString(36).substring(2, 15)}`,
      });

      res.json(transaction);
    } catch (error) {
      res.status(500).json({ error: "Internal server error" });
    }
  });

  // Profile routes
  app.get("/api/profile/completed-jobs", requireAuth, async (req, res) => {
    try {
      const jobs = await storage.getJobs({ 
        freelancerId: req.session.userId!, 
        status: "completed" 
      });
      res.json(jobs);
    } catch (error) {
      res.status(500).json({ error: "Internal server error" });
    }
  });

  // PTO routes
  app.get("/api/pto", requireAuth, async (req, res) => {
    try {
      const requests = await storage.getPTORequests(req.session.userId!);
      res.json(requests);
    } catch (error) {
      res.status(500).json({ error: "Internal server error" });
    }
  });

  app.post("/api/pto", requireAuth, async (req, res) => {
    try {
      const validated = insertPTORequestSchema.parse(req.body);
      const user = await storage.getUser(req.session.userId!);
      
      const request = await storage.createPTORequest({
        ...validated,
        freelancerId: req.session.userId!,
      });

      // Get all admins and moderators
      const allUsers = await storage.getUsers();
      const admins = allUsers.filter(u => u.role === "staff" || u.role === "moderator");

      // Send notification to each admin/moderator
      for (const admin of admins) {
        await storage.createNotification({
          userId: admin.id,
          type: "pto_request",
          title: "New PTO Request",
          message: `${user?.username || "A freelancer"} has requested PTO from ${validated.startDate} to ${validated.endDate}`,
          relatedId: request.id,
        });
      }

      res.json(request);
    } catch (error: any) {
      res.status(400).json({ error: error.message || "Invalid PTO request data" });
    }
  });

  // Invitation routes
  app.post("/api/jobs/:jobId/invite", requireAuth, async (req, res) => {
    try {
      const { userId } = req.body;
      const jobId = req.params.jobId;

      const job = await storage.getJob(jobId);
      if (!job) {
        return res.status(404).json({ error: "Job not found" });
      }

      // Check if requester owns or works on the job
      if (job.customerId !== req.session.userId && job.freelancerId !== req.session.userId) {
        return res.status(403).json({ error: "Not authorized" });
      }

      const invitation = await storage.createInvitation({
        jobId,
        fromUserId: req.session.userId!,
        toUserId: userId,
        status: "pending",
      });

      // Send in-app notification to invited user
      const sender = await storage.getUser(req.session.userId!);
      await storage.createNotification({
        userId,
        type: "invitation",
        title: "Team invitation",
        message: `${sender?.username} has invited you to collaborate on "${job.title}". Check your invitations to respond.`,
        relatedId: invitation.id,
      });

      // Send Discord notification
      const invitedUser = await storage.getUser(userId);
      if (invitedUser) {
        await postToDiscordWebhook(
          `🤝 ${invitedUser.username}, you've been invited to collaborate on: **${job.title}**`
        );
      }

      res.json(invitation);
    } catch (error) {
      res.status(500).json({ error: "Internal server error" });
    }
  });

  app.get("/api/invitations", requireAuth, async (req, res) => {
    try {
      const invitations = await storage.getInvitations(req.session.userId!);
      res.json(invitations);
    } catch (error) {
      res.status(500).json({ error: "Internal server error" });
    }
  });

  app.post("/api/invitations/:id/accept", requireAuth, async (req, res) => {
    try {
      const invitation = await storage.updateInvitation(req.params.id, { 
        status: "accepted" 
      });
      
      if (!invitation) {
        return res.status(404).json({ error: "Invitation not found" });
      }

      // Add user to job collaborators
      const job = await storage.getJob(invitation.jobId);
      if (job) {
        const collaborators = job.collaborators || [];
        if (!collaborators.includes(req.session.userId!)) {
          collaborators.push(req.session.userId!);
          await storage.updateJob(job.id, { collaborators });
        }
      }

      // Notify sender that invitation was accepted
      const accepter = await storage.getUser(req.session.userId!);
      await storage.createNotification({
        userId: invitation.fromUserId,
        type: "invitation",
        title: "Invitation accepted",
        message: `${accepter?.username} accepted your invitation to collaborate on "${job?.title}".`,
        relatedId: invitation.jobId,
      });

      res.json(invitation);
    } catch (error) {
      res.status(500).json({ error: "Internal server error" });
    }
  });

  app.post("/api/invitations/:id/reject", requireAuth, async (req, res) => {
    try {
      const invitation = await storage.updateInvitation(req.params.id, { 
        status: "rejected" 
      });
      
      if (!invitation) {
        return res.status(404).json({ error: "Invitation not found" });
      }

      // Notify sender that invitation was rejected
      const job = await storage.getJob(invitation.jobId);
      const rejecter = await storage.getUser(req.session.userId!);
      await storage.createNotification({
        userId: invitation.fromUserId,
        type: "invitation",
        title: "Invitation declined",
        message: `${rejecter?.username} declined your invitation to collaborate on "${job?.title}".`,
        relatedId: invitation.jobId,
      });

      res.json(invitation);
    } catch (error) {
      res.status(500).json({ error: "Internal server error" });
    }
  });

  // Working Hours routes
  app.get("/api/profile/working-hours", requireAuth, async (req, res) => {
    try {
      const user = await storage.getUser(req.session.userId!);
      if (!user) {
        return res.status(404).json({ error: "User not found" });
      }
      res.json(user.workingHours || {});
    } catch (error) {
      res.status(500).json({ error: "Internal server error" });
    }
  });

  app.put("/api/profile/working-hours", requireAuth, async (req, res) => {
    try {
      const validatedHours = workingHoursSchema.parse(req.body);
      const user = await storage.updateUser(req.session.userId!, {
        workingHours: validatedHours,
      });
      if (!user) {
        return res.status(404).json({ error: "User not found" });
      }
      res.json(user.workingHours);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: "Invalid working hours format", details: error.errors });
      }
      res.status(500).json({ error: "Internal server error" });
    }
  });

  app.put("/api/profile/avatar", requireAuth, async (req, res) => {
    try {
      const { avatar } = req.body;
      
      if (!avatar || typeof avatar !== "string") {
        return res.status(400).json({ error: "Invalid avatar data" });
      }

      if (!avatar.startsWith("data:image/")) {
        return res.status(400).json({ error: "Avatar must be a valid image data URL" });
      }

      const user = await storage.updateUser(req.session.userId!, { avatar });
      if (!user) {
        return res.status(404).json({ error: "User not found" });
      }

      res.json({ avatar: user.avatar });
    } catch (error) {
      res.status(500).json({ error: "Internal server error" });
    }
  });

  // Chat Message routes
  app.get("/api/jobs/:jobId/chat", requireAuth, async (req, res) => {
    try {
      const job = await storage.getJob(req.params.jobId);
      if (!job) {
        return res.status(404).json({ error: "Job not found" });
      }

      // Verify user is part of the job (freelancer, collaborator, or customer)
      const userId = req.session.userId!;
      const isCustomer = job.customerId === userId;
      const isFreelancer = job.freelancerId === userId;
      const isCollaborator = job.collaborators?.includes(userId);

      if (!isCustomer && !isFreelancer && !isCollaborator) {
        return res.status(403).json({ error: "Access denied" });
      }

      const messages = await storage.getChatMessages(req.params.jobId);
      
      // Mark messages as read for current user
      await storage.markChatMessagesAsRead(req.params.jobId, userId);

      res.json(messages);
    } catch (error) {
      res.status(500).json({ error: "Internal server error" });
    }
  });

  app.post("/api/jobs/:jobId/chat", requireAuth, async (req, res) => {
    try {
      const job = await storage.getJob(req.params.jobId);
      if (!job) {
        return res.status(404).json({ error: "Job not found" });
      }

      const userId = req.session.userId!;
      const { message } = req.body;

      if (!message || typeof message !== 'string' || message.trim().length === 0) {
        return res.status(400).json({ error: "Message is required" });
      }

      // Verify user is part of the job
      const isCustomer = job.customerId === userId;
      const isFreelancer = job.freelancerId === userId;
      const isCollaborator = job.collaborators?.includes(userId);

      if (!isCustomer && !isFreelancer && !isCollaborator) {
        return res.status(403).json({ error: "Access denied" });
      }

      // Determine receiver (customer if sender is freelancer/collaborator, freelancer if sender is customer)
      const receiverId = isCustomer ? job.freelancerId! : job.customerId;

      const chatMessage = await storage.createChatMessage({
        jobId: req.params.jobId,
        senderId: userId,
        receiverId,
        message: message.trim(),
      });

      // Create notification for receiver
      const sender = await storage.getUser(userId);
      await storage.createNotification({
        userId: receiverId,
        type: "chat_message",
        title: "New message",
        message: `${sender?.username} sent you a message`,
        relatedId: job.id,
      });

      res.json(chatMessage);
    } catch (error) {
      res.status(500).json({ error: "Internal server error" });
    }
  });

  // Notifications routes
  app.get("/api/notifications", requireAuth, async (req, res) => {
    try {
      const notifications = await storage.getNotifications(req.session.userId!);
      res.json(notifications);
    } catch (error) {
      res.status(500).json({ error: "Internal server error" });
    }
  });

  app.get("/api/notifications/unread-count", requireAuth, async (req, res) => {
    try {
      const count = await storage.getUnreadNotificationCount(req.session.userId!);
      res.json({ count });
    } catch (error) {
      res.status(500).json({ error: "Internal server error" });
    }
  });

  app.put("/api/notifications/:id/read", requireAuth, async (req, res) => {
    try {
      const notification = await storage.markNotificationAsRead(req.params.id);
      if (!notification) {
        return res.status(404).json({ error: "Notification not found" });
      }
      res.json(notification);
    } catch (error) {
      res.status(500).json({ error: "Internal server error" });
    }
  });

  app.put("/api/notifications/mark-all-read", requireAuth, async (req, res) => {
    try {
      await storage.markAllNotificationsAsRead(req.session.userId!);
      res.json({ success: true });
    } catch (error) {
      res.status(500).json({ error: "Internal server error" });
    }
  });

  // User search for invitations
  app.get("/api/users/search", requireAuth, async (req, res) => {
    try {
      const { query } = req.query;
      
      if (!query || typeof query !== 'string') {
        return res.json([]);
      }

      // Simple search by username - in production would use proper search
      const allUsers = Array.from((storage as any).users.values());
      const results = allUsers
        .filter((user: any) => 
          user.username.toLowerCase().includes(query.toLowerCase()) &&
          user.id !== req.session.userId &&
          user.role === "freelancer"
        )
        .slice(0, 10)
        .map((user: any) => ({
          id: user.id,
          username: user.username,
          avatar: user.avatar,
          specialization: user.specialization,
        }));

      res.json(results);
    } catch (error) {
      res.status(500).json({ error: "Internal server error" });
    }
  });

  const httpServer = createServer(app);
  return httpServer;
}
