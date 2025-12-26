import type { Express } from "express";
import { createServer, type Server } from "http";
import { WebSocketServer, WebSocket } from "ws";
import { storage } from "./storage";
import { requireAuth, requireRole } from "./middleware/auth";
import { insertJobSchema, insertPTORequestSchema, insertInvitationSchema, insertCancellationRequestSchema, getLevelPayout, workingHoursSchema, insertTeamNoteSchema, insertTeamTaskSchema, insertTeamMessageSchema, insertRatingSchema, insertRoleUpgradeRequestSchema, RoleUpgradeStatus, RoleUpgradeType, UserRole, insertReportSchema, ReportStatus } from "@shared/schema";
import { getCryptoPrices } from "./lib/coingecko";
import { postToDiscordWebhook } from "./lib/discord-client";
import { getCryptoPriceService } from "./lib/crypto-price-ws";
import { filterContent, sanitizeText, isSpamLike } from "./lib/content-filter";
import { z } from "zod";

const uploadedFiles = new Map<string, string>();

declare module "express-session" {
  interface SessionData {
    userId?: string;
    userRole?: string;
    oauthState?: string;
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

  // Auth routes - Discord OAuth (Direct implementation)
  app.get("/api/auth/discord", async (req, res) => {
    try {
      const clientId = process.env.DISCORD_CLIENT_ID;
      const redirectUri = process.env.DISCORD_REDIRECT_URI;

      if (!clientId || !redirectUri) {
        console.error("Discord OAuth missing config:", { clientId: !!clientId, redirectUri: !!redirectUri });
        return res.status(500).json({ error: "Discord OAuth not configured" });
      }

      // Generate state for CSRF protection
      const state = Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15);
      req.session.oauthState = state;

      // Build Discord OAuth URL
      const params = new URLSearchParams({
        client_id: clientId,
        redirect_uri: redirectUri,
        response_type: 'code',
        scope: 'identify email',
        state: state,
      });

      const oauthUrl = `https://discord.com/oauth2/authorize?${params.toString()}`;
      res.redirect(oauthUrl);
    } catch (error) {
      console.error("Discord OAuth error:", error);
      res.status(500).json({ error: "Failed to initiate Discord login" });
    }
  });

  app.get("/api/auth/callback", async (req, res) => {
    try {
      const { code, state, error: oauthError } = req.query;
      
      // Handle OAuth errors
      if (oauthError) {
        console.error("Discord OAuth error:", oauthError);
        return res.redirect("/?error=oauth_denied");
      }

      if (!code) {
        return res.redirect("/?error=no_code");
      }

      // Verify state for CSRF protection
      if (!state || state !== req.session.oauthState) {
        console.error("State mismatch:", { received: state, expected: req.session.oauthState });
        return res.redirect("/?error=invalid_state");
      }

      // Clear the state from session
      delete req.session.oauthState;

      const clientId = process.env.DISCORD_CLIENT_ID;
      const clientSecret = process.env.DISCORD_CLIENT_SECRET;
      const redirectUri = process.env.DISCORD_REDIRECT_URI;

      if (!clientId || !clientSecret || !redirectUri) {
        console.error("Discord OAuth missing credentials");
        return res.redirect("/?error=config_missing");
      }

      // Exchange code for access token
      const tokenResponse = await fetch('https://discord.com/api/oauth2/token', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: new URLSearchParams({
          client_id: clientId,
          client_secret: clientSecret,
          grant_type: 'authorization_code',
          code: code as string,
          redirect_uri: redirectUri,
        }),
      });

      const tokenData = await tokenResponse.json();

      if (!tokenData.access_token) {
        console.error("Failed to get access token:", tokenData);
        return res.redirect("/?error=token_exchange_failed");
      }

      // Get Discord user data
      const userResponse = await fetch('https://discord.com/api/users/@me', {
        headers: {
          Authorization: `Bearer ${tokenData.access_token}`,
        },
      });

      const discordUser = await userResponse.json();
      
      if (!discordUser.id) {
        console.error("Failed to get Discord user:", discordUser);
        return res.redirect("/?error=user_fetch_failed");
      }

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

  // Levenshtein distance for fuzzy matching (typo tolerance)
  function levenshteinDistance(a: string, b: string): number {
    const matrix: number[][] = [];
    
    for (let i = 0; i <= b.length; i++) {
      matrix[i] = [i];
    }
    for (let j = 0; j <= a.length; j++) {
      matrix[0][j] = j;
    }
    
    for (let i = 1; i <= b.length; i++) {
      for (let j = 1; j <= a.length; j++) {
        if (b.charAt(i - 1) === a.charAt(j - 1)) {
          matrix[i][j] = matrix[i - 1][j - 1];
        } else {
          matrix[i][j] = Math.min(
            matrix[i - 1][j - 1] + 1, // substitution
            matrix[i][j - 1] + 1,     // insertion
            matrix[i - 1][j] + 1      // deletion
          );
        }
      }
    }
    
    return matrix[b.length][a.length];
  }
  
  // Fuzzy match check (returns true if strings are similar enough)
  function fuzzyMatch(search: string, target: string, threshold: number = 0.7): boolean {
    search = search.toLowerCase();
    target = target.toLowerCase();
    
    // Exact match or substring match
    if (target.includes(search) || search.includes(target)) {
      return true;
    }
    
    // Check if search starts with target or vice versa (partial word matching)
    if (target.startsWith(search) || search.startsWith(target)) {
      return true;
    }
    
    // Levenshtein distance for typo tolerance
    const distance = levenshteinDistance(search, target);
    const maxLength = Math.max(search.length, target.length);
    const similarity = 1 - (distance / maxLength);
    
    return similarity >= threshold;
  }

  // Synonym mapping for smarter search
  const SYNONYMS: Record<string, string[]> = {
    "developer": ["programmer", "coder", "engineer", "dev", "software"],
    "designer": ["artist", "creative", "ui", "ux", "graphic"],
    "writer": ["author", "content", "copywriter", "blogger", "journalist"],
    "marketing": ["seo", "advertising", "promotion", "social", "digital"],
    "website": ["web", "site", "webapp", "portal", "page"],
    "mobile": ["app", "ios", "android", "application", "smartphone"],
    "data": ["analytics", "statistics", "analysis", "database", "science"],
    "backend": ["server", "api", "database", "infrastructure"],
    "frontend": ["ui", "interface", "client", "responsive"],
    "fullstack": ["full-stack", "full stack", "end-to-end"],
  };

  // Job routes with enhanced fuzzy search
  app.get("/api/jobs", requireAuth, async (req, res) => {
    try {
      const { search, category, minBudget, maxBudget } = req.query;
      
      // Get all active jobs first
      let jobs = await storage.getJobs({ status: "active" });
      
      // Apply category filter
      if (category && category !== "All Categories") {
        jobs = jobs.filter(j => j.category === category);
      }
      
      // Apply fuzzy search with synonym expansion
      if (search && typeof search === "string" && search.trim()) {
        const searchTerm = search.toLowerCase().trim();
        
        // Expand search with synonyms
        const expandedTerms = [searchTerm];
        Object.entries(SYNONYMS).forEach(([key, synonyms]) => {
          // Add synonyms if search term fuzzy matches the key or any synonym
          if (fuzzyMatch(searchTerm, key, 0.75) || 
              synonyms.some(s => fuzzyMatch(searchTerm, s, 0.75))) {
            expandedTerms.push(key, ...synonyms);
          }
        });
        
        jobs = jobs.filter(job => {
          const searchableText = `${job.title} ${job.description} ${job.category}`.toLowerCase();
          const words = searchableText.split(/\s+/);
          
          // Check if any expanded term fuzzy matches any word in the searchable text
          return expandedTerms.some(term => 
            words.some(word => fuzzyMatch(term, word, 0.7)) ||
            searchableText.includes(term)
          );
        });
      }
      
      // Apply budget range filter
      if (minBudget || maxBudget) {
        jobs = jobs.filter(job => {
          const budget = parseFloat(job.budget);
          if (isNaN(budget)) return false;
          
          const min = minBudget ? parseFloat(minBudget as string) : 0;
          const max = maxBudget ? parseFloat(maxBudget as string) : Infinity;
          
          return budget >= min && budget <= max;
        });
      }
      
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

  // Get freelancer's current/assigned jobs (claimed, in_progress, completed)
  app.get("/api/freelancer/jobs", requireRole("freelancer"), async (req, res) => {
    try {
      const userId = req.session.userId!;
      
      // Get all jobs where this user is the freelancer or a collaborator
      const allJobs = await storage.getJobs({});
      
      const freelancerJobs = allJobs.filter(job => 
        job.freelancerId === userId || 
        (job.collaborators && job.collaborators.includes(userId))
      );
      
      res.json(freelancerJobs);
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
      
      // Content filtering for job posts
      const contentToCheck = `${validated.title} ${validated.description} ${validated.requirements || ""}`;
      const filterResult = filterContent(contentToCheck);
      
      if (!filterResult.isClean && filterResult.severity === "high") {
        return res.status(400).json({ 
          error: "Job posting contains inappropriate content",
          flags: filterResult.flags
        });
      }
      
      if (isSpamLike(contentToCheck)) {
        return res.status(400).json({ error: "Job posting appears to contain spam content" });
      }
      
      // Sanitize text fields
      validated.title = sanitizeText(validated.title);
      validated.description = sanitizeText(validated.description);
      if (validated.requirements) {
        validated.requirements = sanitizeText(validated.requirements);
      }
      
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
        return res.status(404).json({ error: "Your account could not be found. Please log in again." });
      }

      if (user.role !== "freelancer") {
        return res.status(403).json({ error: "Only freelancers can claim jobs. Please upgrade your account to become a freelancer." });
      }

      // Check account eligibility
      if (!user.createdAt) {
        // Account age check - this would need createdAt field
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

      if (activeJobs.length > 0) {
        return res.status(400).json({ error: "You already have a job in progress. Complete or cancel it before claiming another." });
      }
      
      if (claimedJobs.length > 0) {
        return res.status(400).json({ error: "You already have a claimed job waiting to start. Complete or cancel it first." });
      }
      
      if (requestedJobs.length > 0) {
        return res.status(400).json({ error: "You have a pending job request. Wait for the customer's response or cancel it first." });
      }

      const job = await storage.getJob(req.params.id);
      if (!job) {
        return res.status(404).json({ error: "This job no longer exists. It may have been removed by the customer." });
      }
      
      if (job.status === "completed") {
        return res.status(400).json({ error: "This job has already been completed." });
      }
      
      if (job.status === "cancelled") {
        return res.status(400).json({ error: "This job has been cancelled by the customer." });
      }
      
      if (job.status === "in_progress" || job.status === "claimed" || job.status === "freelancer_requested") {
        return res.status(400).json({ error: "This job has already been claimed by another freelancer." });
      }
      
      if (job.status !== "active") {
        return res.status(400).json({ error: "This job is not currently available for claiming." });
      }

      // Check if job has expired
      if (job.deadline) {
        const deadline = new Date(job.deadline);
        if (deadline < new Date()) {
          return res.status(400).json({ error: "This job has expired. The deadline has passed." });
        }
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

      // Update freelancer stats (completed jobs, completion %, level)
      const freelancer = await storage.getUser(job.freelancerId);
      if (freelancer) {
        // Get all jobs and filter for those assigned to this freelancer
        // Include jobs where they are primary OR collaborator, deduplicated by job ID
        const allJobs = await storage.getJobs();
        const assignedJobsMap = new Map();
        
        for (const j of allJobs) {
          // Include if freelancer is primary assignee or in collaborators array
          if (j.freelancerId === job.freelancerId || 
              j.collaborators?.includes(job.freelancerId!)) {
            // Only count jobs that represent actual assignments (claimed, in progress, or completed)
            // Exclude: pending (not approved), active (not claimed), freelancer_requested (not approved),
            // rejected (moderator rejected), changes_requested (needs revision)
            if (j.status === "claimed" || j.status === "in_progress" || j.status === "completed") {
              assignedJobsMap.set(j.id, j);
            }
          }
        }
        
        const assignedJobs = Array.from(assignedJobsMap.values());
        
        // Count completed jobs
        const completedJobs = assignedJobs.filter(j => j.status === "completed").length;
        
        // Calculate completion percentage (avoid division by zero)
        const totalJobs = assignedJobs.length;
        const completionPercentage = totalJobs > 0 
          ? ((completedJobs / totalJobs) * 100).toFixed(2)
          : "0.00";
        
        // Determine level based on completed jobs
        let newLevel = 1;
        if (completedJobs >= 50) newLevel = 5;
        else if (completedJobs >= 30) newLevel = 4;
        else if (completedJobs >= 15) newLevel = 3;
        else if (completedJobs >= 5) newLevel = 2;
        
        // Update user with new stats
        await storage.updateUser(job.freelancerId, {
          completedJobs,
          completionPercentage,
          level: newLevel,
        });
      }

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
      const allJobs = await storage.getJobs();
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
      const allJobs = await storage.getJobs();
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
      const allJobs = await storage.getJobs();
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
      const allJobs = await storage.getJobs();
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

  // Team Messages routes
  app.get("/api/jobs/:id/team-messages", requireAuth, async (req, res) => {
    try {
      const job = await storage.getJob(req.params.id);
      if (!job) {
        return res.status(404).json({ error: "Job not found" });
      }

      // Check if user is part of the team (customer, freelancer, or collaborator)
      const isPartOfTeam = 
        job.customerId === req.session.userId ||
        job.freelancerId === req.session.userId ||
        job.collaborators?.includes(req.session.userId!);

      if (!isPartOfTeam) {
        return res.status(403).json({ error: "You are not part of this job's team" });
      }

      const messages = await storage.getTeamMessages(req.params.id);
      res.json(messages);
    } catch (error) {
      console.error("Error fetching team messages:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  app.post("/api/jobs/:id/team-messages", requireAuth, async (req, res) => {
    try {
      // Validate with extended schema that includes max length
      const validatedMessage = insertTeamMessageSchema
        .omit({ senderId: true })
        .extend({
          content: z.string().min(1, "Content is required").max(1000, "Content must be 1000 characters or less"),
        })
        .parse({ ...req.body, jobId: req.params.id });
      
      const job = await storage.getJob(req.params.id);
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

      const message = await storage.createTeamMessage({
        jobId: validatedMessage.jobId,
        senderId: req.session.userId!,
        content: validatedMessage.content,
      });

      res.status(201).json(message);
    } catch (error) {
      console.error("Error creating team message:", error);
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: error.errors[0].message });
      }
      res.status(500).json({ error: "Internal server error" });
    }
  });

  app.delete("/api/team-messages/:id", requireAuth, async (req, res) => {
    try {
      // Fetch the message first to get its details
      let existingMessage: any = null;
      const allJobs = await storage.getJobs();
      for (const job of allJobs) {
        const messages = await storage.getTeamMessages(job.id);
        const found = messages.find(m => m.id === req.params.id);
        if (found) {
          existingMessage = found;
          break;
        }
      }
      
      if (!existingMessage) {
        return res.status(404).json({ error: "Message not found" });
      }

      // Get current user
      const user = await storage.getUser(req.session.userId!);
      if (!user) {
        return res.status(401).json({ error: "User not found" });
      }

      // Verify user is the author or a moderator
      const isAuthor = existingMessage.senderId === req.session.userId;
      const isModerator = user.role === "moderator" || user.role === "staff";

      if (!isAuthor && !isModerator) {
        return res.status(403).json({ error: "You can only delete your own messages or must be a moderator" });
      }

      await storage.deleteTeamMessage(req.params.id);
      res.status(204).send();
    } catch (error) {
      console.error("Error deleting team message:", error);
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
      // Get real-time prices from polling service
      const priceService = getCryptoPriceService();
      const currentPrices = priceService.getCurrentPrices();
      
      // Return in the format expected by frontend
      const prices = {
        btc: { usd: currentPrices.btc, usd_24h_change: 0 },
        sol: { usd: currentPrices.sol, usd_24h_change: 0 },
        ltc: { usd: currentPrices.ltc, usd_24h_change: 0 },
        usdt: { usd: currentPrices.usdt, usd_24h_change: 0 },
      };
      
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

      // Validate wallet address
      if (!address || typeof address !== 'string' || address.trim().length < 10) {
        return res.status(400).json({ error: "Invalid wallet address" });
      }

      const withdrawAmount = parseFloat(amount);
      
      // CRITICAL: Validate amount - prevent negative and zero withdrawals
      if (isNaN(withdrawAmount) || withdrawAmount <= 0) {
        return res.status(400).json({ error: "Withdrawal amount must be greater than $0" });
      }
      
      // Minimum withdrawal is $0.01
      if (withdrawAmount < 0.01) {
        return res.status(400).json({ error: "Minimum withdrawal is $0.01" });
      }

      // Simulate withdrawal (in production, this would interact with blockchain)
      const currencyKey = `${currency.toLowerCase()}Balance` as keyof typeof wallet;
      const currentBalance = parseFloat(wallet[currencyKey] as string);

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

  // Deposit endpoint
  app.post("/api/wallet/deposit", requireAuth, async (req, res) => {
    try {
      const { currency, amount } = req.body;
      
      const wallet = await storage.getWallet(req.session.userId!);
      if (!wallet) {
        return res.status(404).json({ error: "Wallet not found" });
      }

      const depositAmount = parseFloat(amount);
      
      // Validate amount - prevent negative and zero deposits
      if (isNaN(depositAmount) || depositAmount <= 0) {
        return res.status(400).json({ error: "Deposit amount must be greater than $0" });
      }
      
      // Minimum deposit is $1.00
      if (depositAmount < 1.00) {
        return res.status(400).json({ error: "Minimum deposit is $1.00" });
      }

      const currencyKey = `${currency.toLowerCase()}Balance` as keyof typeof wallet;
      const currentBalance = parseFloat(wallet[currencyKey] as string || "0");

      // Update wallet balance
      await storage.updateWallet(req.session.userId!, {
        [currencyKey]: (currentBalance + depositAmount).toString(),
      });

      // Get current price
      const prices = await getCryptoPrices();
      const price = prices[currency.toLowerCase()]?.usd || 1;

      // Create transaction record
      const transaction = await storage.createTransaction({
        walletId: wallet.id,
        type: "deposit",
        currency,
        amount: depositAmount.toString(),
        usdAmount: (depositAmount * price).toString(),
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

  // Rating routes
  app.post("/api/jobs/:jobId/rating", requireRole("customer"), async (req, res) => {
    try {
      const { jobId } = req.params;
      const job = await storage.getJob(jobId);
      
      if (!job) {
        return res.status(404).json({ error: "Job not found" });
      }
      
      // Verify customer owns the job
      if (job.customerId !== req.session.userId) {
        return res.status(403).json({ error: "Only the job owner can rate this job" });
      }
      
      // Verify job is completed
      if (job.status !== "completed") {
        return res.status(400).json({ error: "Can only rate completed jobs" });
      }
      
      // Verify job has a freelancer
      if (!job.freelancerId) {
        return res.status(400).json({ error: "No freelancer to rate for this job" });
      }
      
      // Check if rating already exists
      const existingRating = await storage.getRating(jobId);
      if (existingRating) {
        return res.status(400).json({ error: "Rating already submitted for this job" });
      }
      
      // Validate rating data
      const validatedData = insertRatingSchema.parse({
        jobId,
        customerId: req.session.userId!,
        freelancerId: job.freelancerId,
        score: req.body.score,
        review: req.body.review,
      });
      
      // Create rating
      const rating = await storage.createRating(validatedData);
      
      // Update freelancer's average rating and total ratings
      const freelancer = await storage.getUser(job.freelancerId);
      if (freelancer) {
        const currentRating = parseFloat(freelancer.rating || "0");
        const currentTotal = freelancer.totalRatings || 0;
        const newAverage = ((currentRating * currentTotal) + rating.score) / (currentTotal + 1);
        
        await storage.updateUser(job.freelancerId, {
          rating: newAverage.toFixed(2),
          totalRatings: currentTotal + 1,
        });
      }
      
      res.json(rating);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: error.errors });
      }
      res.status(500).json({ error: "Internal server error" });
    }
  });
  
  app.get("/api/jobs/:jobId/rating", requireAuth, async (req, res) => {
    try {
      const rating = await storage.getRating(req.params.jobId);
      if (!rating) {
        return res.status(404).json({ error: "Rating not found" });
      }
      res.json(rating);
    } catch (error) {
      res.status(500).json({ error: "Internal server error" });
    }
  });
  
  app.get("/api/freelancers/:freelancerId/ratings", requireAuth, async (req, res) => {
    try {
      const ratings = await storage.getRatingsByFreelancer(req.params.freelancerId);
      res.json(ratings);
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
      
      // Validate PTO constraints
      const startDate = new Date(validated.startDate);
      const endDate = new Date(validated.endDate);
      const now = new Date();
      
      // End date must be on or after start date (allow same-day PTO)
      if (endDate < startDate) {
        return res.status(400).json({ error: "End date must be on or after start date" });
      }
      
      // PTO duration cannot exceed 21 days (3 weeks) - inclusive count
      const diffDays = Math.ceil((endDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24)) + 1;
      if (diffDays > 21) {
        return res.status(400).json({ error: "PTO duration cannot exceed 3 weeks (21 days)" });
      }
      
      // Start date cannot be more than 3 years in the future
      const maxDate = new Date();
      maxDate.setFullYear(maxDate.getFullYear() + 3);
      if (startDate > maxDate) {
        return res.status(400).json({ error: "Start date cannot be more than 3 years in the future" });
      }
      
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
      
      // Validate end time is after start time for each day
      const days = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'];
      for (const day of days) {
        const dayHours = validatedHours[day as keyof typeof validatedHours];
        if (dayHours?.start && dayHours?.end) {
          const [startHour, startMin] = dayHours.start.split(':').map(Number);
          const [endHour, endMin] = dayHours.end.split(':').map(Number);
          const startMinutes = startHour * 60 + startMin;
          const endMinutes = endHour * 60 + endMin;
          
          if (endMinutes <= startMinutes) {
            return res.status(400).json({ 
              error: `End time must be after start time for ${day.charAt(0).toUpperCase() + day.slice(1)}` 
            });
          }
        }
      }
      
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
        return res.status(400).json({ error: "No image data provided. Please select an image file." });
      }

      if (!avatar.startsWith("data:image/")) {
        return res.status(400).json({ error: "Invalid file format. Please upload an image file." });
      }

      // Validate specific image formats
      const validFormats = ["data:image/png", "data:image/jpeg", "data:image/jpg", "data:image/gif", "data:image/webp"];
      const isValidFormat = validFormats.some(format => avatar.startsWith(format));
      
      if (!isValidFormat) {
        return res.status(400).json({ 
          error: "Unsupported image format. Please use PNG, JPG, GIF, or WebP." 
        });
      }

      // Check for reasonable file size (base64 is ~33% larger than original)
      // 5MB original = ~6.7MB base64
      const maxBase64Size = 7 * 1024 * 1024;
      if (avatar.length > maxBase64Size) {
        return res.status(400).json({ 
          error: "Image file is too large. Maximum size is 5MB." 
        });
      }

      const user = await storage.updateUser(req.session.userId!, { avatar });
      if (!user) {
        return res.status(404).json({ error: "User not found" });
      }

      res.json({ avatar: user.avatar });
    } catch (error) {
      console.error("Avatar upload error:", error);
      res.status(500).json({ error: "Failed to upload image. Please try again." });
    }
  });

  app.put("/api/profile/specialization", requireRole("freelancer"), async (req, res) => {
    try {
      const { specialization } = req.body;
      
      if (!specialization || typeof specialization !== "string") {
        return res.status(400).json({ error: "Invalid specialization" });
      }

      const trimmed = specialization.trim();
      if (!trimmed) {
        return res.status(400).json({ error: "Specialization cannot be empty" });
      }

      if (trimmed.length > 100) {
        return res.status(400).json({ error: "Specialization must be 100 characters or less" });
      }

      const user = await storage.updateUser(req.session.userId!, { specialization: trimmed });
      if (!user) {
        return res.status(404).json({ error: "User not found" });
      }

      res.json({ specialization: user.specialization });
    } catch (error) {
      res.status(500).json({ error: "Internal server error" });
    }
  });

  app.get("/api/profile/stats", requireAuth, async (req, res) => {
    try {
      const user = await storage.getUser(req.session.userId!);
      if (!user) {
        return res.status(404).json({ error: "User not found" });
      }

      if (user.role === "customer") {
        const allJobs = await storage.getJobs({ customerId: user.id });
        const completedJobs = allJobs.filter(j => j.status === "completed");
        const cancelledJobs = allJobs.filter(j => j.status === "cancelled");
        const totalSpent = completedJobs.reduce((sum, j) => sum + (Number(j.budget) || 0), 0);
        
        // Calculate cancellation rate
        const totalFinishedJobs = completedJobs.length + cancelledJobs.length;
        const cancellationRate = totalFinishedJobs > 0 
          ? (cancelledJobs.length / totalFinishedJobs * 100).toFixed(1)
          : "0.0";
        
        // Calculate reliability score (based on completion rate and job history)
        let reliabilityScore = 10;
        if (totalFinishedJobs > 0) {
          const completionRatio = completedJobs.length / totalFinishedJobs;
          reliabilityScore = Math.round(completionRatio * 10);
        }
        
        // Calculate account age in days
        const accountAge = user.createdAt 
          ? Math.floor((Date.now() - new Date(user.createdAt).getTime()) / (24 * 60 * 60 * 1000))
          : 0;
        
        res.json({
          totalJobsPosted: allJobs.length,
          completedJobs: completedJobs.length,
          activeJobs: allJobs.filter(j => ["active", "in_progress", "claimed"].includes(j.status)).length,
          pendingJobs: allJobs.filter(j => j.status === "pending").length,
          totalSpent,
          cancellationRate: parseFloat(cancellationRate),
          reliabilityScore,
          accountAgeDays: accountAge,
          isVerified: (completedJobs.length >= 3 && reliabilityScore >= 7),
        });
      } else if (user.role === "moderator" || user.role === "staff") {
        const allJobs = await storage.getJobs({});
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        
        const approvedJobs = allJobs.filter(j => j.status === "active" || j.status === "completed" || j.status === "in_progress" || j.status === "claimed");
        const approvedToday = approvedJobs.filter(j => {
          if (!j.updatedAt) return false;
          const updatedDate = new Date(j.updatedAt);
          updatedDate.setHours(0, 0, 0, 0);
          return updatedDate.getTime() === today.getTime();
        }).length;
        
        // Get reports reviewed by this moderator
        const allReports = await storage.getReports({ status: "resolved" });
        const casesReviewed = allReports.filter(r => r.reviewerId === user.id).length;
        
        // Calculate account age in days
        const accountAge = user.createdAt 
          ? Math.floor((Date.now() - new Date(user.createdAt).getTime()) / (24 * 60 * 60 * 1000))
          : 0;
        
        // Calculate moderator tier based on cases reviewed
        let moderatorTier = "Bronze";
        if (casesReviewed >= 100) moderatorTier = "Diamond";
        else if (casesReviewed >= 50) moderatorTier = "Gold";
        else if (casesReviewed >= 20) moderatorTier = "Silver";
        
        res.json({
          totalJobsModerated: approvedJobs.length,
          pendingQueue: allJobs.filter(j => j.status === "pending").length,
          approvedToday,
          casesReviewed,
          moderatorTier,
          accountAgeDays: accountAge,
          accuracyScore: 95, // Placeholder - would need appeal tracking
          isVerified: true,
          moderatorStatus: "Active",
        });
      } else {
        res.json({
          completedJobs: user.completedJobs || 0,
          level: user.level || 1,
          rating: user.rating,
          completionPercentage: user.completionPercentage || 0,
        });
      }
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

  // === ROLE UPGRADE REQUEST ROUTES ===

  // Get current user's role upgrade requests
  app.get("/api/role-upgrade-requests/my", requireAuth, async (req, res) => {
    try {
      const requests = await storage.getRoleUpgradeRequests({ userId: req.session.userId });
      res.json(requests);
    } catch (error) {
      res.status(500).json({ error: "Internal server error" });
    }
  });

  // Get pending role upgrade requests (moderators only)
  app.get("/api/role-upgrade-requests/pending", requireRole("moderator"), async (req, res) => {
    try {
      const requests = await storage.getPendingRoleUpgradeRequests();
      
      // Enrich with user data
      const enrichedRequests = await Promise.all(
        requests.map(async (request) => {
          const user = await storage.getUser(request.userId);
          return {
            ...request,
            user: user ? {
              id: user.id,
              username: user.username,
              avatar: user.avatar,
              role: user.role,
              completedJobs: user.completedJobs,
              level: user.level,
              rating: user.rating,
            } : null,
          };
        })
      );
      
      res.json(enrichedRequests);
    } catch (error) {
      res.status(500).json({ error: "Internal server error" });
    }
  });

  // Submit a role upgrade request
  app.post("/api/role-upgrade-requests", requireAuth, async (req, res) => {
    try {
      const user = await storage.getUser(req.session.userId!);
      if (!user) {
        return res.status(404).json({ error: "User not found" });
      }

      const validatedData = insertRoleUpgradeRequestSchema.parse({
        ...req.body,
        userId: user.id,
      });

      // Validate upgrade type matches current role
      if (validatedData.upgradeType === RoleUpgradeType.CUSTOMER_TO_FREELANCER) {
        if (user.role !== UserRole.CUSTOMER) {
          return res.status(400).json({ error: "Only customers can request freelancer upgrade" });
        }
        
        // Customer to Freelancer: Account must be at least 2 weeks old
        if (user.createdAt) {
          const accountAge = Date.now() - new Date(user.createdAt).getTime();
          const twoWeeksMs = 14 * 24 * 60 * 60 * 1000;
          if (accountAge < twoWeeksMs) {
            const daysRemaining = Math.ceil((twoWeeksMs - accountAge) / (24 * 60 * 60 * 1000));
            return res.status(400).json({ 
              error: `Your account must be at least 2 weeks old to become a freelancer. ${daysRemaining} day(s) remaining.` 
            });
          }
        }
      } else if (validatedData.upgradeType === RoleUpgradeType.FREELANCER_TO_MODERATOR) {
        if (user.role !== UserRole.FREELANCER) {
          return res.status(400).json({ error: "Only freelancers can request moderator upgrade" });
        }
        
        // Freelancer to Moderator requirements:
        // 1. Account must be at least 4 months old
        if (user.createdAt) {
          const accountAge = Date.now() - new Date(user.createdAt).getTime();
          const fourMonthsMs = 120 * 24 * 60 * 60 * 1000; // ~4 months
          if (accountAge < fourMonthsMs) {
            const daysRemaining = Math.ceil((fourMonthsMs - accountAge) / (24 * 60 * 60 * 1000));
            return res.status(400).json({ 
              error: `Your account must be at least 4 months old to become a moderator. ${daysRemaining} day(s) remaining.` 
            });
          }
        }
        
        // 2. Must be level 5
        if ((user.level || 1) < 5) {
          return res.status(400).json({ 
            error: `You must reach Level 5 to become a moderator. You are currently Level ${user.level || 1}.` 
          });
        }
        
        // 3. Must have 65%+ completion rate
        const completionRate = parseFloat(user.completionPercentage?.toString() || "0");
        if (completionRate < 65) {
          return res.status(400).json({ 
            error: `You need a 65% or higher completion rate to become a moderator. Your current rate is ${completionRate.toFixed(1)}%.` 
          });
        }
      }

      // Check for existing pending request
      const existingRequests = await storage.getRoleUpgradeRequests({ 
        userId: user.id, 
        status: RoleUpgradeStatus.PENDING 
      });
      if (existingRequests.length > 0) {
        return res.status(400).json({ error: "You already have a pending upgrade request" });
      }

      const request = await storage.createRoleUpgradeRequest(validatedData);

      // Create notification for moderators
      const moderators = (await storage.getUsers()).filter(u => u.role === "moderator");
      for (const mod of moderators) {
        await storage.createNotification({
          userId: mod.id,
          type: "role_upgrade",
          title: "New Role Upgrade Request",
          message: `${user.username} has requested to become a ${validatedData.upgradeType === RoleUpgradeType.CUSTOMER_TO_FREELANCER ? 'freelancer' : 'moderator'}`,
          relatedId: request.id,
        });
      }

      res.status(201).json(request);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: error.errors[0].message });
      }
      res.status(500).json({ error: "Internal server error" });
    }
  });

  // Approve or reject a role upgrade request (moderators only)
  app.patch("/api/role-upgrade-requests/:id", requireRole("moderator"), async (req, res) => {
    try {
      const { id } = req.params;
      const { status, reviewNotes } = req.body;

      if (!status || !["approved", "rejected"].includes(status)) {
        return res.status(400).json({ error: "Invalid status. Must be 'approved' or 'rejected'" });
      }

      const request = await storage.getRoleUpgradeRequest(id);
      if (!request) {
        return res.status(404).json({ error: "Request not found" });
      }

      if (request.status !== RoleUpgradeStatus.PENDING) {
        return res.status(400).json({ error: "This request has already been processed" });
      }

      // Update the request
      const updatedRequest = await storage.updateRoleUpgradeRequest(id, {
        status,
        reviewerId: req.session.userId,
        reviewNotes: reviewNotes || null,
      });

      // If approved, update the user's role
      if (status === "approved") {
        const newRole = request.upgradeType === RoleUpgradeType.CUSTOMER_TO_FREELANCER 
          ? UserRole.FREELANCER 
          : UserRole.MODERATOR;
        
        await storage.updateUser(request.userId, { role: newRole });

        // Notify the user
        await storage.createNotification({
          userId: request.userId,
          type: "role_upgrade",
          title: "Role Upgrade Approved!",
          message: `Congratulations! Your request to become a ${newRole} has been approved.`,
          relatedId: request.id,
        });
      } else {
        // Notify the user of rejection
        await storage.createNotification({
          userId: request.userId,
          type: "role_upgrade",
          title: "Role Upgrade Request Declined",
          message: `Your role upgrade request was declined. ${reviewNotes ? `Reason: ${reviewNotes}` : 'Please contact support for more information.'}`,
          relatedId: request.id,
        });
      }

      res.json(updatedRequest);
    } catch (error) {
      res.status(500).json({ error: "Internal server error" });
    }
  });

  // Report routes
  app.post("/api/reports", requireAuth, async (req, res) => {
    try {
      const validatedData = insertReportSchema.parse({
        ...req.body,
        reporterId: req.session.userId,
      });

      // Check for spam-like content
      const contentToCheck = `${validatedData.reason} ${validatedData.description || ""}`;
      if (isSpamLike(contentToCheck)) {
        return res.status(400).json({ error: "Report appears to contain spam content" });
      }

      // Check for suspicious/inappropriate content
      const filterResult = filterContent(contentToCheck);
      if (filterResult.severity === "high") {
        return res.status(400).json({ 
          error: "Report contains inappropriate content and cannot be submitted" 
        });
      }

      // Sanitize report content before storage to prevent XSS
      const sanitizedData = {
        ...validatedData,
        reason: sanitizeText(validatedData.reason),
        description: validatedData.description ? sanitizeText(validatedData.description) : null,
      };

      const report = await storage.createReport(sanitizedData);

      // Notify moderators about new report
      const users = await storage.getUsers();
      const moderators = users.filter(u => u.role === "moderator" || u.role === "staff");
      for (const mod of moderators) {
        await storage.createNotification({
          userId: mod.id,
          type: "report",
          title: "New Report Submitted",
          message: `A new ${validatedData.reportType} report has been submitted and requires review.`,
          relatedId: report.id,
        });
      }

      res.status(201).json(report);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: "Invalid report data", details: error.errors });
      }
      res.status(500).json({ error: "Internal server error" });
    }
  });

  app.get("/api/reports", requireRole("moderator"), async (req, res) => {
    try {
      const { status, reportType } = req.query;
      const filters: any = {};
      if (status) filters.status = status as string;
      if (reportType) filters.reportType = reportType as string;
      
      const reports = await storage.getReports(filters);
      res.json(reports);
    } catch (error) {
      res.status(500).json({ error: "Internal server error" });
    }
  });

  app.get("/api/reports/pending", requireRole("moderator"), async (req, res) => {
    try {
      const reports = await storage.getPendingReports();
      res.json(reports);
    } catch (error) {
      res.status(500).json({ error: "Internal server error" });
    }
  });

  app.get("/api/my-reports", requireAuth, async (req, res) => {
    try {
      const reports = await storage.getReports({ reporterId: req.session.userId });
      res.json(reports);
    } catch (error) {
      res.status(500).json({ error: "Internal server error" });
    }
  });

  app.patch("/api/reports/:id", requireRole("moderator"), async (req, res) => {
    try {
      const { id } = req.params;
      const { status, reviewNotes } = req.body;

      if (!status || !["reviewed", "resolved", "dismissed"].includes(status)) {
        return res.status(400).json({ error: "Invalid status" });
      }

      const report = await storage.getReport(id);
      if (!report) {
        return res.status(404).json({ error: "Report not found" });
      }

      // Sanitize review notes before storage
      const sanitizedNotes = reviewNotes ? sanitizeText(reviewNotes) : null;
      
      const updatedReport = await storage.updateReport(id, {
        status,
        reviewerId: req.session.userId,
        reviewNotes: sanitizedNotes,
      });

      // Notify the reporter
      await storage.createNotification({
        userId: report.reporterId,
        type: "report",
        title: "Report Updated",
        message: `Your report has been ${status}. ${sanitizedNotes ? `Notes: ${sanitizedNotes}` : ''}`,
        relatedId: report.id,
      });

      res.json(updatedReport);
    } catch (error) {
      res.status(500).json({ error: "Internal server error" });
    }
  });

  const httpServer = createServer(app);
  
  // Set up WebSocket server for real-time price broadcasts
  const wss = new WebSocketServer({ server: httpServer, path: "/ws/prices" });
  
  // Initialize crypto price service
  const priceService = getCryptoPriceService();
  
  wss.on('connection', (ws: WebSocket) => {
    console.log('[WebSocket] Client connected to price feed');
    
    // Send current prices immediately on connection
    const currentPrices = priceService.getCurrentPrices();
    ws.send(JSON.stringify({
      type: 'prices',
      data: currentPrices
    }));
    
    ws.on('error', (error) => {
      console.error('[WebSocket] Client error:', error.message);
    });
    
    ws.on('close', () => {
      console.log('[WebSocket] Client disconnected from price feed');
    });
  });
  
  // Broadcast price updates every 3 seconds to all connected clients
  setInterval(() => {
    const currentPrices = priceService.getCurrentPrices();
    const priceData = {
      type: 'prices',
      data: currentPrices
    };
    
    wss.clients.forEach((client) => {
      if (client.readyState === WebSocket.OPEN) {
        client.send(JSON.stringify(priceData));
      }
    });
  }, 3000); // Broadcast every 3 seconds
  
  return httpServer;
}
