import type { Express } from "express";
import { createServer, type Server } from "http";
import { WebSocketServer, WebSocket } from "ws";
import { storage } from "./storage";
import { requireAuth, requireRole } from "./middleware/auth";
import { insertJobSchema, insertPTORequestSchema, insertInvitationSchema, insertCancellationRequestSchema, getLevelPayout, workingHoursSchema, insertTeamNoteSchema, insertTeamTaskSchema, insertTeamMessageSchema, insertRatingSchema, insertRoleUpgradeRequestSchema, RoleUpgradeStatus, RoleUpgradeType, UserRole, insertReportSchema, ReportStatus, insertModeratorTaskSchema, ModeratorTaskStatus, ModeratorTaskType, insertModeratorMeetingSchema, insertMeetingRsvpSchema, MeetingRsvpStatus, insertTeamRoomMessageSchema, JobStatus, EscrowStatus, ScheduledTaskStatus, DisputeStatus, insertJobSubmissionSchema, JobSubmissionStatus } from "@shared/schema";
import { getCryptoPrices } from "./lib/coingecko";
import { postToDiscordWebhook } from "./lib/discord-client";
import { getCryptoPriceService } from "./lib/crypto-price-ws";
import { filterContent, sanitizeText, isSpamLike } from "./lib/content-filter";
import { z } from "zod";

const uploadedFiles = new Map<string, string>();

// Team Room client tracking (moved here for scope visibility in API routes)
interface TeamRoomClient {
  ws: any;
  userId: string;
  username: string;
  avatar: string | null;
  role: string;
}

const teamRoomClients = new Map<string, TeamRoomClient>();

// Team Room WebSocket tokens - short-lived tokens for secure WS authentication
interface TeamRoomToken {
  userId: string;
  expiresAt: number;
}

const teamRoomTokens = new Map<string, TeamRoomToken>();

function generateTeamRoomToken(userId: string): string {
  // Use cryptographically strong random token
  const { randomBytes } = require("crypto");
  const token = randomBytes(32).toString("hex");
  teamRoomTokens.set(token, {
    userId,
    expiresAt: Date.now() + 60000 // Token valid for 60 seconds
  });
  // Clean up old expired tokens to prevent unbounded Map growth
  Array.from(teamRoomTokens.entries()).forEach(([key, data]) => {
    if (Date.now() > data.expiresAt) {
      teamRoomTokens.delete(key);
    }
  });
  return token;
}

function validateTeamRoomToken(token: string): string | null {
  const tokenData = teamRoomTokens.get(token);
  if (!tokenData) return null;
  
  // Delete token after use (one-time use)
  teamRoomTokens.delete(token);
  
  // Check if expired
  if (Date.now() > tokenData.expiresAt) return null;
  
  return tokenData.userId;
}

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
        const getRoleAndName = (id: string) => {
          if (id.includes('founder')) return { role: 'founder', name: 'Demo Founder' };
          if (id.includes('head-mod')) return { role: 'head_of_moderation', name: 'Demo Head of Moderation' };
          if (id.includes('moderator')) return { role: 'moderator', name: 'Demo Moderator' };
          if (id.includes('customer')) return { role: 'customer', name: 'Demo Customer' };
          if (id.includes('freelancer')) return { role: 'freelancer', name: 'Demo Freelancer' };
          return { role: 'freelancer', name: 'Demo User' };
        };
        const { role, name } = getRoleAndName(discordId);
        user = await storage.createUser({
          discordId,
          username: name,
          role,
          email: `${discordId}@demo.com`,
        }, role === 'founder');
        
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
        // Active job statuses for freelancers - jobs currently being worked on
        const activeStatuses = ["claimed", "in_progress", "submitted", "awaiting_customer"];
        const allFreelancerJobs = await storage.getJobs({ freelancerId: user.id });
        
        // Also count jobs from jobFreelancers table (multi-freelancer assignments)
        const freelancerAssignments = await storage.getJobFreelancersByFreelancer(user.id);
        const assignedJobIds = new Set(freelancerAssignments.map(jf => jf.jobId));
        const allJobs = await storage.getJobs({});
        const assignedJobs = allJobs.filter(j => assignedJobIds.has(j.id) && j.freelancerId !== user.id);
        
        // Combine primary jobs and assigned jobs, avoiding duplicates
        const combinedJobs = [...allFreelancerJobs, ...assignedJobs];
        stats.activeJobs = combinedJobs.filter(j => activeStatuses.includes(j.status)).length;
      } else if (user.role === "customer") {
        const allJobs = await storage.getJobs({ customerId: user.id });
        stats.postedJobs = allJobs.length;
        // Customer's active jobs include: open for applications, claimed, and in progress
        stats.activeJobs = allJobs.filter(j => 
          ["active", "claimed", "in_progress", "submitted", "awaiting_customer"].includes(j.status)
        ).length;
        stats.pendingJobs = allJobs.filter(j => j.status === "pending").length;
        stats.totalSpent = allJobs.reduce((sum, j) => sum + parseFloat(j.budget) + parseFloat(j.premiumAmount || "0"), 0).toFixed(2);
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
      } else if (user.role === "head_of_moderation") {
        const allUsers = await storage.getUsers();
        const pendingJobs = await storage.getJobsByStatus("pending");
        const allJobs = await storage.getJobs();
        const reports = await storage.getReports();
        const upgradeRequests = await storage.getRoleUpgradeRequests();
        
        // Count team members (moderators + staff)
        stats.teamMembers = allUsers.filter(u => 
          u.role === "moderator" || u.role === "staff"
        ).length;
        stats.pendingReports = reports.filter(r => r.status === "pending").length;
        stats.upgradeRequests = upgradeRequests.filter(r => r.status === "pending").length;
        stats.pendingJobs = pendingJobs.length;
        stats.totalJobs = allJobs.length;
        stats.activeJobs = allJobs.filter(j => j.status === "active").length;
      } else if (user.role === "founder") {
        const allUsers = await storage.getUsers();
        const allJobs = await storage.getJobs();
        
        stats.totalUsers = allUsers.length;
        stats.totalJobs = allJobs.length;
        stats.activeJobs = allJobs.filter(j => 
          j.status === "active" || j.status === "in_progress" || j.status === "claimed"
        ).length;
        // Calculate platform revenue from completed jobs
        const completedJobs = allJobs.filter(j => j.status === "completed");
        stats.platformRevenue = completedJobs.reduce((sum, j) => sum + parseFloat(j.budget), 0).toFixed(2);
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
      
      // Get jobs available for freelancers to apply (pending_acceptance or legacy "active" status)
      const allJobs = await storage.getJobs({});
      let jobs = allJobs.filter(j => 
        j.status === JobStatus.PENDING_ACCEPTANCE || j.status === "active"
      );
      
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
      
      jobs.sort((a, b) => {
        const aPremium = parseFloat(a.premiumAmount || "0");
        const bPremium = parseFloat(b.premiumAmount || "0");
        return bPremium - aPremium;
      });
      
      res.json(jobs);
    } catch (error) {
      res.status(500).json({ error: "Internal server error" });
    }
  });

  app.get("/api/jobs/recent", requireAuth, async (req, res) => {
    try {
      const allJobs = await storage.getJobs({});
      const jobs = allJobs.filter(j => 
        j.status === JobStatus.PENDING_ACCEPTANCE || j.status === "active"
      );
      jobs.sort((a, b) => {
        const aPremium = parseFloat(a.premiumAmount || "0");
        const bPremium = parseFloat(b.premiumAmount || "0");
        return bPremium - aPremium;
      });
      res.json(jobs.slice(0, 10));
    } catch (error) {
      res.status(500).json({ error: "Internal server error" });
    }
  });

  app.get("/api/my-jobs", requireRole("customer"), async (req, res) => {
    try {
      const jobs = await storage.getJobs({ customerId: req.session.userId! });
      // Filter out archived jobs unless specifically requested
      const includeArchived = req.query.includeArchived === "true";
      const filteredJobs = includeArchived ? jobs : jobs.filter(j => !j.customerArchived);
      
      // Add hasRating info for completed jobs
      const enrichedJobs = await Promise.all(filteredJobs.map(async (job) => {
        if (job.status === "completed" && job.freelancerId) {
          const rating = await storage.getRating(job.id);
          return { ...job, hasRating: !!rating };
        }
        return { ...job, hasRating: false };
      }));
      
      res.json(enrichedJobs);
    } catch (error) {
      res.status(500).json({ error: "Internal server error" });
    }
  });

  // Archive a completed job (customer clears it from their list)
  app.post("/api/jobs/:id/archive", requireRole("customer"), async (req, res) => {
    try {
      const job = await storage.getJob(req.params.id);
      if (!job) {
        return res.status(404).json({ error: "Job not found" });
      }

      if (job.customerId !== req.session.userId) {
        return res.status(403).json({ error: "Only the job owner can archive this job" });
      }

      if (job.status !== "completed" && job.status !== "cancelled") {
        return res.status(400).json({ error: "Only completed or cancelled jobs can be archived" });
      }

      // For completed jobs with a freelancer, require rating before archiving
      if (job.status === "completed" && job.freelancerId) {
        const rating = await storage.getRating(job.id);
        if (!rating) {
          return res.status(400).json({ error: "Please rate the freelancer before clearing this job" });
        }
      }

      const updatedJob = await storage.updateJob(job.id, { customerArchived: true });
      res.json(updatedJob);
    } catch (error) {
      console.error("Error archiving job:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  // Get freelancer's current/assigned jobs (claimed, in_progress, completed)
  app.get("/api/freelancer/jobs", requireRole("freelancer"), async (req, res) => {
    try {
      const userId = req.session.userId!;
      
      // Get all jobs where this user is the freelancer or a collaborator
      const allJobs = await storage.getJobs({});
      
      // Also check jobFreelancers table for multi-freelancer assignments
      const freelancerAssignments = await storage.getJobFreelancersByFreelancer(userId);
      const assignedJobIds = new Set(freelancerAssignments.map(jf => jf.jobId));
      
      const freelancerJobs = allJobs.filter(job => 
        job.freelancerId === userId || 
        (job.collaborators && job.collaborators.includes(userId)) ||
        assignedJobIds.has(job.id)
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
      
      // Enrich with collaborator info - include jobFreelancers table for multi-freelancer jobs
      const collaboratorIds = job.collaborators || [];
      const jobFreelancerRecords = await storage.getJobFreelancers(job.id);
      const jobFreelancerIds = jobFreelancerRecords.map(jf => jf.freelancerId);
      
      // Combine all member IDs (primary freelancer + collaborators + jobFreelancers), removing duplicates
      const allMemberIdSet = new Set([
        ...(job.freelancerId ? [job.freelancerId] : []),
        ...collaboratorIds,
        ...jobFreelancerIds
      ]);
      const allMemberIds = Array.from(allMemberIdSet);
      
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

      const existingJobs = await storage.getJobs({ customerId: req.session.userId! });
      const hasPendingReview = existingJobs.find(
        j => j.status === JobStatus.PENDING_APPROVAL || j.status === "pending"
      );
      if (hasPendingReview) {
        return res.status(400).json({
          error: `You already have a job pending review ("${hasPendingReview.title}"). Please wait for it to be reviewed before submitting another.`
        });
      }

      const wallet = await storage.getWallet(req.session.userId!);
      if (!wallet) {
        return res.status(400).json({ error: "Wallet not found" });
      }

      const budget = parseFloat(validated.budget);
      const premiumFee = parseFloat(validated.premiumAmount || "0");
      if (validated.isPremium && premiumFee < 100) {
        return res.status(400).json({ error: "Premium amount must be at least $100" });
      }
      const totalCost = budget + (validated.isPremium ? premiumFee : 0);
      const walletBalance = parseFloat(wallet.usdtBalance || "0");

      if (totalCost > walletBalance) {
        return res.status(400).json({ 
          error: `Insufficient funds. Need $${totalCost.toFixed(2)} (budget${premiumFee > 0 ? ` + $${premiumFee.toFixed(2)} premium` : ""}). Balance: $${walletBalance.toFixed(2)}.`
        });
      }

      // Charge wallet immediately when creating job for review
      await storage.updateWallet(req.session.userId!, {
        usdtBalance: (walletBalance - totalCost).toFixed(8),
      });

      await storage.createTransaction({
        walletId: wallet.id,
        type: "escrow_lock",
        currency: "USDT",
        amount: totalCost.toFixed(8),
        usdAmount: totalCost.toFixed(2),
        status: "completed",
        transactionHash: `escrow-lock-newjob-${Date.now()}`,
      });

      const job = await storage.createJob({
        ...validated,
        premiumAmount: validated.isPremium ? (premiumFee || 0).toString() : "0",
        customerId: req.session.userId!,
        status: "pending",
        submittedForReviewAt: new Date(),
      });

      // Create escrow record
      await storage.createEscrow({
        jobId: job.id,
        customerId: req.session.userId!,
        totalAmount: totalCost.toFixed(2),
        status: EscrowStatus.HELD,
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
      
      // Check wallet balance covers budget + premium fee
      const wallet = await storage.getWallet(req.session.userId!);
      if (!wallet) {
        return res.status(400).json({ error: "Wallet not found" });
      }

      const budget = parseFloat(validated.budget);
      const premiumFee = parseFloat(validated.premiumAmount || "0");
      if (validated.isPremium && premiumFee < 100) {
        return res.status(400).json({ error: "Premium amount must be at least $100" });
      }
      const totalCost = budget + (validated.isPremium ? premiumFee : 0);
      const availableBalance = parseFloat(wallet.usdtBalance || "0") - parseFloat(wallet.pendingUsdtBalance || "0");

      if (totalCost > availableBalance) {
        return res.status(400).json({ 
          error: `Insufficient funds. Need $${totalCost.toFixed(2)} (budget${premiumFee > 0 ? ` + $${premiumFee.toFixed(2)} premium` : ""}). Available: $${availableBalance.toFixed(2)}.`
        });
      }

      const updatedJob = await storage.updateJob(req.params.id, {
        ...validated,
        premiumAmount: validated.isPremium ? (premiumFee || 0).toString() : "0",
        status: "pending",
        moderatorFeedback: null,
      });

      res.json(updatedJob);
    } catch (error: any) {
      res.status(400).json({ error: error.message || "Invalid job data" });
    }
  });

  // Get job requests for a specific job (for customers to see applicants)
  app.get("/api/jobs/:id/requests", requireAuth, async (req, res) => {
    try {
      const job = await storage.getJob(req.params.id);
      if (!job) {
        return res.status(404).json({ error: "Job not found" });
      }

      // Only job owner or moderators can see requests
      const user = await storage.getUser(req.session.userId!);
      if (job.customerId !== req.session.userId! && 
          !["staff", "moderator", "head_of_moderation", "founder"].includes(user?.role || "")) {
        return res.status(403).json({ error: "Not authorized to view job requests" });
      }

      const requests = await storage.getJobRequestsByJob(req.params.id);
      
      // Enrich with freelancer data
      const enrichedRequests = await Promise.all(
        requests.map(async (request) => {
          const freelancer = await storage.getUser(request.freelancerId);
          return {
            ...request,
            freelancer: freelancer ? {
              id: freelancer.id,
              userId: freelancer.userId,
              username: freelancer.username,
              avatar: freelancer.avatar,
              level: freelancer.level,
              rating: freelancer.rating,
              completedJobs: freelancer.completedJobs,
              completionPercentage: freelancer.completionPercentage,
            } : null,
          };
        })
      );

      res.json(enrichedRequests);
    } catch (error) {
      console.error("Error getting job requests:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  // Get freelancer's job requests (all statuses)
  app.get("/api/my-job-requests", requireAuth, async (req, res) => {
    try {
      const user = await storage.getUser(req.session.userId!);
      if (!user || user.role !== "freelancer") {
        return res.status(403).json({ error: "Only freelancers can view their job requests" });
      }

      // Get all job requests for this freelancer (no status filter)
      const requests = await storage.getJobRequestsByFreelancer(req.session.userId!);
      
      // Enrich with job data
      const enrichedRequests = await Promise.all(
        requests.map(async (request) => {
          const job = await storage.getJob(request.jobId);
          return {
            ...request,
            job: job ? {
              id: job.id,
              title: job.title,
              budget: job.budget,
              category: job.category,
              status: job.status,
              customerId: job.customerId,
              deadline: job.deadline,
            } : null,
          };
        })
      );

      res.json(enrichedRequests);
    } catch (error) {
      console.error("Error getting my job requests:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  app.post("/api/jobs/:id/claim", requireAuth, async (req, res) => {
    try {
      const user = await storage.getUser(req.session.userId!);
      if (!user) {
        return res.status(404).json({ error: "Your account could not be found. Please log in again." });
      }

      if (user.role !== "freelancer") {
        return res.status(403).json({ error: "Only freelancers can apply for jobs. Please upgrade your account to become a freelancer." });
      }

      // Check if freelancer already has an active/claimed job (as primary, team member, collaborator, or via jobFreelancers)
      const allJobs = await storage.getJobs({});
      const userId = req.session.userId!;
      const activeStatuses = ["in_progress", "claimed", "awaiting_customer", "submitted"];
      
      // Check if user is assigned to any active job (as freelancerId, teamMembers, or collaborators)
      const assignedActiveJobs = allJobs.filter(j => {
        if (!activeStatuses.includes(j.status)) return false;
        // Check primary freelancer
        if (j.freelancerId === userId) return true;
        // Check team members array
        if (j.teamMembers?.includes(userId)) return true;
        // Check collaborators array (from invitation acceptance)
        if (j.collaborators?.includes(userId)) return true;
        return false;
      });

      if (assignedActiveJobs.length > 0) {
        return res.status(400).json({ error: "You are already assigned to an active job. Complete it before applying to new jobs." });
      }

      // Also check jobFreelancers table for multi-freelancer assignments (recommendation system)
      const jobFreelancerAssignments = await storage.getJobFreelancersByFreelancer(userId);
      for (const jf of jobFreelancerAssignments) {
        const assignedJob = await storage.getJob(jf.jobId);
        if (assignedJob && activeStatuses.includes(assignedJob.status)) {
          return res.status(400).json({ error: "You are already assigned to an active job. Complete it before applying to new jobs." });
        }
      }

      // Check pending request limit (max 5)
      const pendingRequests = await storage.getPendingJobRequestsByFreelancer(req.session.userId!);
      if (pendingRequests.length >= 5) {
        return res.status(400).json({ error: "You have reached the maximum of 5 pending job applications. Cancel one to apply to another." });
      }

      const job = await storage.getJob(req.params.id);
      if (!job) {
        return res.status(404).json({ error: "This job no longer exists. It may have been removed by the customer." });
      }

      // Check if freelancer is blacklisted by this customer
      const customer = await storage.getUser(job.customerId);
      if (customer?.blacklistedFreelancers?.includes(req.session.userId!)) {
        return res.status(403).json({ error: "You are not eligible to apply for this customer's jobs." });
      }
      
      if (job.status === "completed") {
        return res.status(400).json({ error: "This job has already been completed." });
      }
      
      if (job.status === "cancelled") {
        return res.status(400).json({ error: "This job has been cancelled by the customer." });
      }
      
      if (job.status === "in_progress" || job.status === "claimed") {
        return res.status(400).json({ error: "This job has already been assigned to another freelancer." });
      }
      
      if (job.status !== "active") {
        return res.status(400).json({ error: "This job is not currently available for applications." });
      }

      // Check if freelancer already applied to this job
      const existingRequest = await storage.getJobRequestByJobAndFreelancer(req.params.id, req.session.userId!);
      if (existingRequest && existingRequest.status === "pending") {
        return res.status(400).json({ error: "You have already applied to this job." });
      }

      // Check if job has expired
      if (job.deadline) {
        const deadline = new Date(job.deadline);
        if (deadline < new Date()) {
          return res.status(400).json({ error: "This job has expired. The deadline has passed." });
        }
      }

      // Create job request (not directly assigning to job)
      const jobRequest = await storage.createJobRequest({
        jobId: req.params.id,
        freelancerId: req.session.userId!,
        status: "pending",
        message: req.body.message || null,
      });

      // Create notification for customer
      await storage.createNotification({
        userId: job.customerId,
        type: "job_request",
        title: "New job application",
        message: `${user.username} has applied to work on your job: ${job.title}`,
        relatedId: job.id,
        sourceType: "job",
        sourceId: job.id,
      });

      res.json({ success: true, request: jobRequest });
    } catch (error) {
      console.error("Error applying for job:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  // Cancel a job application
  app.post("/api/jobs/:id/cancel-request", requireAuth, async (req, res) => {
    try {
      const user = await storage.getUser(req.session.userId!);
      if (!user) {
        return res.status(404).json({ error: "User not found" });
      }

      const jobRequest = await storage.getJobRequestByJobAndFreelancer(req.params.id, req.session.userId!);
      if (!jobRequest) {
        return res.status(404).json({ error: "No application found for this job" });
      }

      if (jobRequest.status !== "pending") {
        return res.status(400).json({ error: "Can only cancel pending applications" });
      }

      await storage.updateJobRequest(jobRequest.id, { status: "withdrawn" });

      res.json({ success: true });
    } catch (error) {
      console.error("Error cancelling job request:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  // Customer approve a freelancer from the request queue
  app.post("/api/jobs/:id/approve-freelancer", requireAuth, async (req, res) => {
    try {
      const { freelancerId } = req.body;
      if (!freelancerId) {
        return res.status(400).json({ error: "Freelancer ID is required" });
      }

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

      if (job.status !== "active") {
        return res.status(400).json({ error: "This job is not available for assignment" });
      }

      // Find the pending request for this freelancer
      const jobRequest = await storage.getJobRequestByJobAndFreelancer(req.params.id, freelancerId);
      if (!jobRequest || jobRequest.status !== "pending") {
        return res.status(404).json({ error: "No pending application found from this freelancer" });
      }

      // Check if freelancer is still eligible (no active jobs)
      const freelancerActiveJobs = await storage.getJobs({ freelancerId, status: "in_progress" });
      const freelancerClaimedJobs = await storage.getJobs({ freelancerId, status: "claimed" });
      if (freelancerActiveJobs.length > 0 || freelancerClaimedJobs.length > 0) {
        // Mark the request as cancelled since freelancer is busy
        await storage.updateJobRequest(jobRequest.id, { status: "cancelled" });
        return res.status(400).json({ error: "This freelancer already has an active job and cannot accept new jobs" });
      }

      // Funds already deducted from customer wallet at job submission time
      // No need for additional balance check or pending balance adjustment

      // Update job - assign to freelancer and set status to claimed
      const updatedJob = await storage.updateJob(req.params.id, {
        status: "claimed",
        freelancerId: freelancerId,
      });

      // Mark this request as accepted
      await storage.updateJobRequest(jobRequest.id, { status: "accepted" });

      // Cancel all other pending requests for this job
      const allRequests = await storage.getJobRequestsByJob(req.params.id);
      for (const request of allRequests) {
        if (request.id !== jobRequest.id && request.status === "pending") {
          await storage.updateJobRequest(request.id, { status: "rejected" });
          // Notify rejected freelancers
          await storage.createNotification({
            userId: request.freelancerId,
            type: "job_rejected",
            title: "Application not selected",
            message: `Another freelancer was selected for "${job.title}".`,
            relatedId: job.id,
            sourceType: "job",
            sourceId: job.id,
          });
        }
      }

      // Cancel all other pending requests from this freelancer (they now have a job)
      await storage.cancelPendingJobRequestsByFreelancer(freelancerId, req.params.id);

      // Notify the accepted freelancer
      await storage.createNotification({
        userId: freelancerId,
        type: "job_approved",
        title: "Application accepted!",
        message: `Your application for "${job.title}" has been accepted. You can now start working!`,
        relatedId: job.id,
        sourceType: "job",
        sourceId: job.id,
      });

      res.json(updatedJob);
    } catch (error) {
      console.error("Error approving freelancer:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  // Customer reject a freelancer from the request queue
  app.post("/api/jobs/:id/reject-freelancer", requireAuth, async (req, res) => {
    try {
      const { freelancerId } = req.body;
      if (!freelancerId) {
        return res.status(400).json({ error: "Freelancer ID is required" });
      }

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

      // Find the pending request for this freelancer
      const jobRequest = await storage.getJobRequestByJobAndFreelancer(req.params.id, freelancerId);
      if (!jobRequest || jobRequest.status !== "pending") {
        return res.status(404).json({ error: "No pending application found from this freelancer" });
      }

      // Mark request as rejected
      await storage.updateJobRequest(jobRequest.id, { status: "rejected" });

      // Notify freelancer
      await storage.createNotification({
        userId: freelancerId,
        type: "job_rejected",
        title: "Application declined",
        message: `Your application for "${job.title}" was not selected.`,
        relatedId: job.id,
        sourceType: "job",
        sourceId: job.id,
      });

      res.json({ success: true });
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

      // Funds already deducted from customer wallet at submission time
      // Just mark escrow as released and pay the freelancer
      const jobBudget = parseFloat(job.budget);
      const escrow = await storage.getEscrowByJob(job.id);
      if (escrow && escrow.status === EscrowStatus.HELD) {
        await storage.updateEscrow(escrow.id, { status: EscrowStatus.RELEASED });
      }

      // Transfer level-based portion of budget to freelancer (premium stays with Linxora)
      const freelancer2 = await storage.getUser(job.freelancerId);
      const level = freelancer2?.level || 1;
      const levelPayout = getLevelPayout(level);
      const payoutAmount = jobBudget * levelPayout;

      const freelancerWallet = await storage.getWallet(job.freelancerId);
      if (freelancerWallet) {
        const freelancerUSDT = parseFloat(freelancerWallet.usdtBalance || "0");
        await storage.updateWallet(job.freelancerId, {
          usdtBalance: (freelancerUSDT + payoutAmount).toFixed(8),
        });

        await storage.createTransaction({
          walletId: freelancerWallet.id,
          type: "deposit",
          currency: "USDT",
          amount: payoutAmount.toFixed(8),
          usdAmount: payoutAmount.toFixed(2),
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
        sourceType: "job",
        sourceId: job.id,
      });

      res.json(updatedJob);
    } catch (error) {
      console.error("Error completing job:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  // ============================================================
  // NEW JOB LIFECYCLE ROUTES (From Spec)
  // ============================================================

  // Submit job for approval (Customer submits DRAFT -> PENDING_APPROVAL)
  app.post("/api/jobs/:id/submit-for-approval", requireAuth, async (req, res) => {
    try {
      const job = await storage.getJob(req.params.id);
      if (!job) {
        return res.status(404).json({ error: "Job not found" });
      }

      if (job.customerId !== req.session.userId) {
        return res.status(403).json({ error: "Only the job owner can submit for approval" });
      }

      // Only draft, changes_requested, or rejected jobs can be submitted
      if (![JobStatus.DRAFT, "changes_requested", "rejected"].includes(job.status)) {
        return res.status(400).json({ error: "Only draft jobs can be submitted for approval" });
      }

      // Prevent submitting more than one job for review at a time (including this job itself)
      const customerJobs = await storage.getJobs({ customerId: job.customerId });
      const pendingReviewJob = customerJobs.find(
        j => (j.status === JobStatus.PENDING_APPROVAL || j.status === "pending")
      );
      if (pendingReviewJob) {
        return res.status(400).json({ 
          error: `You already have a job pending review ("${pendingReviewJob.title}"). Please wait for it to be reviewed before submitting another.`
        });
      }


      // Validate wallet balance covers budget + premium fee
      const wallet = await storage.getWallet(job.customerId);
      if (!wallet) {
        return res.status(400).json({ error: "Wallet not found" });
      }

      const budget = parseFloat(job.budget);
      const premiumFee = parseFloat(job.premiumAmount || "0");
      const totalCost = budget + premiumFee;
      const walletBalance = parseFloat(wallet.usdtBalance || "0");

      if (totalCost > walletBalance) {
        return res.status(400).json({ 
          error: `Insufficient balance. Need $${totalCost.toFixed(2)} (budget${premiumFee > 0 ? ` + $${premiumFee.toFixed(2)} premium fee` : ""}). Balance: $${walletBalance.toFixed(2)}.` 
        });
      }

      // Charge wallet immediately when submitting for review
      await storage.updateWallet(job.customerId, {
        usdtBalance: (walletBalance - totalCost).toFixed(8),
      });

      // Create transaction record for the charge
      await storage.createTransaction({
        walletId: wallet.id,
        type: "escrow_lock",
        currency: "USDT",
        amount: totalCost.toFixed(8),
        usdAmount: totalCost.toFixed(2),
        status: "completed",
        transactionHash: `escrow-lock-${job.id}-${Date.now()}`,
      });

      // Create escrow record
      await storage.createEscrow({
        jobId: job.id,
        customerId: job.customerId,
        totalAmount: totalCost.toFixed(2),
        status: EscrowStatus.HELD,
      });

      // Update job status to pending approval and record submission time
      const updatedJob = await storage.updateJob(req.params.id, {
        status: JobStatus.PENDING_APPROVAL,
        moderatorFeedback: null,
        submittedForReviewAt: new Date(),
      });

      // Notify moderators
      const moderators = await storage.getUsers();
      const modRoles = ["staff", "moderator", "head_of_moderation", "founder"];
      for (const mod of moderators.filter(u => modRoles.includes(u.role))) {
        await storage.createNotification({
          userId: mod.id,
          type: "moderation",
          title: "New job pending approval",
          message: `Job "${job.title}"${parseFloat(job.premiumAmount || "0") > 0 ? ` [PREMIUM $${job.premiumAmount}]` : ""} is waiting for moderation review.`,
          relatedId: job.id,
          sourceType: "system",
          sourceId: job.id,
        });
      }

      res.json(updatedJob);
    } catch (error) {
      console.error("Error submitting job for approval:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  // Moderator approves job (PENDING_APPROVAL -> PENDING_ACCEPTANCE)
  app.post("/api/jobs/:id/approve", requireRole("moderator", "staff", "head_of_moderation", "founder"), async (req, res) => {
    try {
      const job = await storage.getJob(req.params.id);
      if (!job) {
        return res.status(404).json({ error: "Job not found" });
      }

      if (job.status !== JobStatus.PENDING_APPROVAL && job.status !== "pending") {
        return res.status(400).json({ error: "Job is not pending approval" });
      }

      // Funds are already locked in escrow at submission time - no need to lock again here

      // Set job expiration (2 months from approval)
      const twoMonthsFromNow = new Date();
      twoMonthsFromNow.setMonth(twoMonthsFromNow.getMonth() + 2);

      // Update job status
      const updatedJob = await storage.updateJob(req.params.id, {
        status: JobStatus.PENDING_ACCEPTANCE,
        approvedAt: new Date(),
        expiresAt: twoMonthsFromNow,
        moderatorFeedback: null,
      });

      // Schedule expiration task
      await storage.createScheduledTask({
        jobId: job.id,
        taskType: "job_expiration",
        runAt: twoMonthsFromNow,
        status: ScheduledTaskStatus.PENDING,
      });

      // Log moderation action
      await storage.createModerationLog({
        moderatorId: req.session.userId!,
        actionType: "job_approved",
        jobId: job.id,
      });

      // Notify customer
      await storage.createNotification({
        userId: job.customerId,
        type: "job_approved",
        title: "Job approved!",
        message: `Your job "${job.title}" has been approved and is now live.`,
        relatedId: job.id,
        sourceType: "job",
        sourceId: job.id,
      });

      // Post to Discord webhook
      try {
        await postToDiscordWebhook(
          `New job approved: "${job.title}" | Budget: $${job.budget} | Category: ${job.category}`
        );
      } catch (e) {
        console.error("Discord webhook error:", e);
      }

      res.json(updatedJob);
    } catch (error) {
      console.error("Error approving job:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  // Moderator rejects job
  app.post("/api/jobs/:id/reject", requireRole("moderator", "staff", "head_of_moderation", "founder"), async (req, res) => {
    try {
      const job = await storage.getJob(req.params.id);
      if (!job) {
        return res.status(404).json({ error: "Job not found" });
      }

      if (job.status !== JobStatus.PENDING_APPROVAL && job.status !== "pending") {
        return res.status(400).json({ error: "Job is not pending approval" });
      }

      const { feedback } = req.body;
      if (!feedback || typeof feedback !== "string" || feedback.trim().length < 10) {
        return res.status(400).json({ error: "Please provide feedback (at least 10 characters)" });
      }

      // Refund charged funds back to wallet since job was rejected
      const escrow = await storage.getEscrowByJob(job.id);
      if (escrow && escrow.status === EscrowStatus.HELD) {
        const refundAmount = parseFloat(escrow.totalAmount);
        const customerWallet = await storage.getWallet(job.customerId);
        if (customerWallet) {
          const currentBalance = parseFloat(customerWallet.usdtBalance || "0");
          await storage.updateWallet(job.customerId, {
            usdtBalance: (currentBalance + refundAmount).toFixed(8),
          });
          await storage.createTransaction({
            walletId: customerWallet.id,
            type: "refund",
            currency: "USDT",
            amount: refundAmount.toFixed(8),
            usdAmount: refundAmount.toFixed(2),
            status: "completed",
            transactionHash: `rejection-refund-${job.id}-${Date.now()}`,
          });
        }
        await storage.updateEscrow(escrow.id, { status: EscrowStatus.REFUNDED });
      }

      const updatedJob = await storage.updateJob(req.params.id, {
        status: "rejected",
        moderatorFeedback: feedback.trim(),
      });

      // Log moderation action
      await storage.createModerationLog({
        moderatorId: req.session.userId!,
        actionType: "job_rejected",
        jobId: job.id,
        notes: feedback,
      });

      // Notify customer
      await storage.createNotification({
        userId: job.customerId,
        type: "job_rejected",
        title: "Job rejected - funds refunded",
        message: `Your job "${job.title}" was not approved. Your funds have been released back to your wallet. Please review the feedback.`,
        relatedId: job.id,
        sourceType: "job",
        sourceId: job.id,
      });

      res.json(updatedJob);
    } catch (error) {
      console.error("Error rejecting job:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  // Request changes to job (PENDING_APPROVAL -> changes_requested)
  app.post("/api/jobs/:id/request-changes", requireRole("moderator", "staff", "head_of_moderation", "founder"), async (req, res) => {
    try {
      const job = await storage.getJob(req.params.id);
      if (!job) {
        return res.status(404).json({ error: "Job not found" });
      }

      if (job.status !== JobStatus.PENDING_APPROVAL && job.status !== "pending") {
        return res.status(400).json({ error: "Job is not pending approval" });
      }

      const { feedback } = req.body;
      if (!feedback || typeof feedback !== "string" || feedback.trim().length < 10) {
        return res.status(400).json({ error: "Please provide feedback (at least 10 characters)" });
      }

      // Refund charged funds back to wallet - customer will re-pay when resubmitting
      const escrow = await storage.getEscrowByJob(job.id);
      if (escrow && escrow.status === EscrowStatus.HELD) {
        const refundAmount = parseFloat(escrow.totalAmount);
        const customerWallet = await storage.getWallet(job.customerId);
        if (customerWallet) {
          const currentBalance = parseFloat(customerWallet.usdtBalance || "0");
          await storage.updateWallet(job.customerId, {
            usdtBalance: (currentBalance + refundAmount).toFixed(8),
          });
          await storage.createTransaction({
            walletId: customerWallet.id,
            type: "refund",
            currency: "USDT",
            amount: refundAmount.toFixed(8),
            usdAmount: refundAmount.toFixed(2),
            status: "completed",
            transactionHash: `changes-refund-${job.id}-${Date.now()}`,
          });
        }
        await storage.updateEscrow(escrow.id, { status: EscrowStatus.REFUNDED });
      }

      const updatedJob = await storage.updateJob(req.params.id, {
        status: "changes_requested",
        moderatorFeedback: feedback.trim(),
      });

      // Log moderation action
      await storage.createModerationLog({
        moderatorId: req.session.userId!,
        actionType: "job_changes_requested",
        jobId: job.id,
        notes: feedback,
      });

      // Notify customer
      await storage.createNotification({
        userId: job.customerId,
        type: "job_changes_requested",
        title: "Job changes requested - funds refunded",
        message: `A moderator has requested changes to your job "${job.title}". Your funds have been released back to your wallet.`,
        relatedId: job.id,
        sourceType: "job",
        sourceId: job.id,
      });

      res.json(updatedJob);
    } catch (error) {
      console.error("Error requesting changes:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  // Freelancer submits work (creates submission with proof)
  app.post("/api/jobs/:id/submit-work", requireAuth, async (req, res) => {
    try {
      const job = await storage.getJob(req.params.id);
      if (!job) {
        return res.status(404).json({ error: "Job not found" });
      }

      // Check if user is assigned to this job
      const user = await storage.getUser(req.session.userId!);
      if (!user || user.role !== "freelancer") {
        return res.status(403).json({ error: "Only freelancers can submit work" });
      }

      // Check if this freelancer is assigned (primary or via jobFreelancers)
      const isAssigned = job.freelancerId === req.session.userId ||
        (await storage.getJobFreelancers(job.id)).some(jf => jf.freelancerId === req.session.userId);

      if (!isAssigned) {
        return res.status(403).json({ error: "You are not assigned to this job" });
      }

      // Job must be in progress (legacy: claimed, in_progress or new: IN_PROGRESS)
      const inProgressStatuses = ["claimed", "in_progress", JobStatus.IN_PROGRESS];
      if (!inProgressStatuses.includes(job.status)) {
        return res.status(400).json({ error: "Job must be in progress to submit work" });
      }

      const { proofFiles, proofLinks, notes } = req.body;

      // Require at least some proof
      const hasProof = (proofFiles && proofFiles.length > 0) || (proofLinks && proofLinks.length > 0) || notes;
      if (!hasProof) {
        return res.status(400).json({ error: "Please provide proof of work (files, links, or notes)" });
      }

      // Create job submission
      const submission = await storage.createJobSubmission({
        jobId: job.id,
        freelancerId: req.session.userId!,
        proofFiles: proofFiles || [],
        proofLinks: proofLinks || [],
        notes: notes || null,
        status: JobSubmissionStatus.SUBMITTED,
      });

      // Set 4-day auto-complete timer
      const autoCompleteDate = new Date();
      autoCompleteDate.setDate(autoCompleteDate.getDate() + 4);

      // Update job status
      await storage.updateJob(job.id, {
        status: JobStatus.AWAITING_CUSTOMER,
        submittedAt: new Date(),
        autoCompleteAt: autoCompleteDate,
      });

      // Schedule auto-complete task
      await storage.createScheduledTask({
        jobId: job.id,
        taskType: "auto_complete",
        runAt: autoCompleteDate,
        status: ScheduledTaskStatus.PENDING,
        metadata: { submissionId: submission.id },
      });

      // Schedule 8-hour reminder
      const reminderDate = new Date();
      reminderDate.setHours(reminderDate.getHours() + 8);
      await storage.createScheduledTask({
        jobId: job.id,
        taskType: "customer_reminder",
        runAt: reminderDate,
        status: ScheduledTaskStatus.PENDING,
      });

      // Notify customer
      await storage.createNotification({
        userId: job.customerId,
        type: "work_submitted",
        title: "Work submitted for review",
        message: `Freelancer has submitted work for "${job.title}". Please review within 4 days.`,
        relatedId: job.id,
        sourceType: "job",
        sourceId: job.id,
      });

      res.json(submission);
    } catch (error) {
      console.error("Error submitting work:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  // Get job submissions
  app.get("/api/jobs/:id/submissions", requireAuth, async (req, res) => {
    try {
      const job = await storage.getJob(req.params.id);
      if (!job) {
        return res.status(404).json({ error: "Job not found" });
      }

      // Only job owner, assigned freelancer, or moderators can see submissions
      const user = await storage.getUser(req.session.userId!);
      const isAssigned = job.freelancerId === req.session.userId ||
        job.customerId === req.session.userId ||
        ["staff", "moderator", "head_of_moderation", "founder"].includes(user?.role || "");

      if (!isAssigned) {
        return res.status(403).json({ error: "Not authorized to view submissions" });
      }

      const submissions = await storage.getJobSubmissions(job.id);
      res.json(submissions);
    } catch (error) {
      console.error("Error getting submissions:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  // Customer accepts work (AWAITING_CUSTOMER -> COMPLETED)
  app.post("/api/jobs/:id/accept-work", requireAuth, async (req, res) => {
    try {
      const job = await storage.getJob(req.params.id);
      if (!job) {
        return res.status(404).json({ error: "Job not found" });
      }

      if (job.customerId !== req.session.userId) {
        return res.status(403).json({ error: "Only the job owner can accept work" });
      }

      if (job.status !== JobStatus.AWAITING_CUSTOMER) {
        return res.status(400).json({ error: "Job is not awaiting customer review" });
      }

      // Get latest submission
      const submissions = await storage.getJobSubmissions(job.id);
      if (submissions.length === 0) {
        return res.status(400).json({ error: "No submission found" });
      }

      const latestSubmission = submissions[0];

      // Create customer review record
      await storage.createCustomerReview({
        jobId: job.id,
        submissionId: latestSubmission.id,
        customerId: req.session.userId!,
        accepted: true,
      });

      // Update submission status
      await storage.updateJobSubmission(latestSubmission.id, {
        status: "accepted",
      });

      // Cancel scheduled auto-complete task
      const scheduledTasks = await storage.getScheduledTasks({ jobId: job.id, taskType: "auto_complete" });
      for (const task of scheduledTasks) {
        await storage.updateScheduledTask(task.id, { status: "cancelled" });
      }

      // Release escrow and pay freelancers
      const escrow = await storage.getEscrowByJob(job.id);
      if (escrow) {
        await storage.updateEscrow(escrow.id, { status: EscrowStatus.RELEASED });
      }

      // Get all freelancers on this job
      const jobFreelancers = await storage.getJobFreelancers(job.id);
      const allFreelancerIds = jobFreelancers.length > 0 
        ? jobFreelancers.map(jf => jf.freelancerId)
        : job.freelancerId ? [job.freelancerId] : [];

      const budget = parseFloat(job.budget);
      const jobPremium = parseFloat(job.premiumAmount || "0");
      const totalCost = budget + jobPremium;
      const numFreelancers = allFreelancerIds.length;
      const sharePerFreelancer = numFreelancers > 0 ? budget / numFreelancers : 0;

      // Funds already deducted from customer wallet at submission time
      // Just release escrow and pay freelancers
      const escrow2 = await storage.getEscrowByJob(job.id);
      if (escrow2 && escrow2.status === EscrowStatus.HELD) {
        await storage.updateEscrow(escrow2.id, { status: EscrowStatus.RELEASED });
      }

      // Pay each freelancer based on their level
      for (const freelancerId of allFreelancerIds) {
        const freelancer = await storage.getUser(freelancerId);
        if (!freelancer) continue;

        const level = freelancer.level || 1;
        const levelPayout = getLevelPayout(level); // Returns 0.60 to 0.85
        const payoutAmount = sharePerFreelancer * levelPayout;
        const platformFee = sharePerFreelancer - payoutAmount;

        const freelancerWallet = await storage.getWallet(freelancerId);
        if (freelancerWallet) {
          const freelancerBalance = parseFloat(freelancerWallet.usdtBalance || "0");
          await storage.updateWallet(freelancerId, {
            usdtBalance: (freelancerBalance + payoutAmount).toFixed(8),
          });

          await storage.createTransaction({
            walletId: freelancerWallet.id,
            type: "deposit",
            currency: "USDT",
            amount: payoutAmount.toFixed(8),
            usdAmount: payoutAmount.toFixed(2),
            status: "completed",
            transactionHash: `job-payment-${job.id}-${freelancerId}`,
          });
        }

        // Update job freelancer record if exists
        const jfRecords = await storage.getJobFreelancers(job.id);
        const jfRecord = jfRecords.find(jf => jf.freelancerId === freelancerId);
        if (jfRecord) {
          await storage.updateJobFreelancer(jfRecord.id, {
            payoutAmount: payoutAmount.toFixed(2),
            status: "paid",
          });
        }

        // Notify freelancer
        await storage.createNotification({
          userId: freelancerId,
          type: "job_completed",
          title: "Payment received!",
          message: `You received $${payoutAmount.toFixed(2)} for completing "${job.title}".`,
          relatedId: job.id,
          sourceType: "job",
          sourceId: job.id,
        });
      }

      // Mark job as completed FIRST (before updating stats)
      const updatedJob = await storage.updateJob(job.id, {
        status: JobStatus.COMPLETED,
      });

      // NOW update freelancer stats after job is marked completed (increment completed count)
      for (const freelancerId of allFreelancerIds) {
        await updateFreelancerStats(freelancerId, true);
      }

      res.json(updatedJob);
    } catch (error) {
      console.error("Error accepting work:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  // Customer rejects work (AWAITING_CUSTOMER -> SUBMITTED with rejection)
  app.post("/api/jobs/:id/reject-work", requireAuth, async (req, res) => {
    try {
      const job = await storage.getJob(req.params.id);
      if (!job) {
        return res.status(404).json({ error: "Job not found" });
      }

      if (job.customerId !== req.session.userId) {
        return res.status(403).json({ error: "Only the job owner can reject work" });
      }

      if (job.status !== JobStatus.AWAITING_CUSTOMER) {
        return res.status(400).json({ error: "Job is not awaiting customer review" });
      }

      const { reason } = req.body;
      if (!reason || typeof reason !== "string" || reason.trim().length < 10) {
        return res.status(400).json({ error: "Please provide a reason for rejection (at least 10 characters)" });
      }

      // Get latest submission
      const submissions = await storage.getJobSubmissions(job.id);
      if (submissions.length === 0) {
        return res.status(400).json({ error: "No submission found" });
      }

      const latestSubmission = submissions[0];

      // Create customer review record
      await storage.createCustomerReview({
        jobId: job.id,
        submissionId: latestSubmission.id,
        customerId: req.session.userId!,
        accepted: false,
        rejectionReason: reason.trim(),
      });

      // Update submission status
      await storage.updateJobSubmission(latestSubmission.id, {
        status: "rejected",
      });

      // Cancel scheduled auto-complete task
      const scheduledTasks = await storage.getScheduledTasks({ jobId: job.id, taskType: "auto_complete" });
      for (const task of scheduledTasks) {
        await storage.updateScheduledTask(task.id, { status: "cancelled" });
      }

      // Update job back to in_progress
      await storage.updateJob(job.id, {
        status: "in_progress",
        autoCompleteAt: null,
      });

      // Notify freelancer
      if (job.freelancerId) {
        await storage.createNotification({
          userId: job.freelancerId,
          type: "work_rejected",
          title: "Work not accepted",
          message: `Your work for "${job.title}" was not accepted. Reason: ${reason.trim().substring(0, 100)}`,
          relatedId: job.id,
          sourceType: "job",
          sourceId: job.id,
        });
      }

      res.json({ success: true, message: "Work rejected. Freelancer can resubmit." });
    } catch (error) {
      console.error("Error rejecting work:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  // Helper function to update freelancer stats
  async function updateFreelancerStats(freelancerId: string, incrementCompleted: boolean = false) {
    const freelancer = await storage.getUser(freelancerId);
    if (!freelancer) return;

    // Get current stats - preserve existing completedJobs count
    let completedJobs = freelancer.completedJobs || 0;
    
    // If incrementing (job just completed), add 1 to existing count
    if (incrementCompleted) {
      completedJobs = completedJobs + 1;
    }

    // Calculate level based on completed jobs
    let newLevel = 1;
    if (completedJobs >= 50) newLevel = 5;
    else if (completedJobs >= 30) newLevel = 4;
    else if (completedJobs >= 15) newLevel = 3;
    else if (completedJobs >= 5) newLevel = 2;

    // Calculate completion percentage from actual job records for display
    const allJobs = await storage.getJobs();
    const assignedJobsMap = new Map();

    for (const j of allJobs) {
      if (j.freelancerId === freelancerId || j.collaborators?.includes(freelancerId)) {
        if (["claimed", "in_progress", "completed"].includes(j.status)) {
          assignedJobsMap.set(j.id, j);
        }
      }
    }

    const assignedJobs = Array.from(assignedJobsMap.values());
    const activeJobsCount = assignedJobs.length;
    const completedInActiveJobs = assignedJobs.filter(j => j.status === "completed").length;
    const completionPercentage = activeJobsCount > 0 ? ((completedInActiveJobs / activeJobsCount) * 100).toFixed(2) : "100.00";

    await storage.updateUser(freelancerId, {
      completedJobs,
      completionPercentage,
      level: newLevel,
    });
  }

  // ============================================================
  // DISPUTE ROUTES
  // ============================================================

  // Open a dispute
  app.post("/api/jobs/:id/dispute", requireAuth, async (req, res) => {
    try {
      const job = await storage.getJob(req.params.id);
      if (!job) {
        return res.status(404).json({ error: "Job not found" });
      }

      // Only customer or assigned freelancer can open dispute
      const isAuthorized = job.customerId === req.session.userId || 
        job.freelancerId === req.session.userId;
      
      if (!isAuthorized) {
        return res.status(403).json({ error: "Only job participants can open disputes" });
      }

      // Job must be in an active state
      const activeStatuses = ["claimed", "in_progress", JobStatus.AWAITING_CUSTOMER, JobStatus.SUBMITTED];
      if (!activeStatuses.includes(job.status)) {
        return res.status(400).json({ error: "Cannot open dispute for job in current state" });
      }

      // Check if dispute already exists
      const existingDispute = await storage.getDisputeByJob(job.id);
      if (existingDispute && existingDispute.status !== DisputeStatus.RESOLVED) {
        return res.status(400).json({ error: "A dispute is already open for this job" });
      }

      const { reason } = req.body;
      if (!reason || typeof reason !== "string" || reason.trim().length < 20) {
        return res.status(400).json({ error: "Please provide a detailed reason for the dispute (at least 20 characters)" });
      }

      // Create dispute
      const dispute = await storage.createDispute({
        jobId: job.id,
        openedByUserId: req.session.userId!,
        reason: reason.trim(),
      });

      // Lock the job
      await storage.updateJob(job.id, {
        status: JobStatus.DISPUTE,
        isLocked: true,
      });

      // Cancel any pending scheduled tasks
      const scheduledTasks = await storage.getScheduledTasks({ jobId: job.id });
      for (const task of scheduledTasks) {
        if (task.status === ScheduledTaskStatus.PENDING) {
          await storage.updateScheduledTask(task.id, { status: "cancelled" });
        }
      }

      // Notify the other party
      const otherPartyId = job.customerId === req.session.userId ? job.freelancerId : job.customerId;
      if (otherPartyId) {
        await storage.createNotification({
          userId: otherPartyId,
          type: "dispute_opened",
          title: "Dispute opened",
          message: `A dispute has been opened for "${job.title}". A moderator will review.`,
          relatedId: job.id,
          sourceType: "dispute",
          sourceId: dispute.id,
        });
      }

      // Notify moderators
      const moderators = await storage.getUsers();
      const modRoles = ["staff", "moderator", "head_of_moderation", "founder"];
      for (const mod of moderators.filter(u => modRoles.includes(u.role))) {
        await storage.createNotification({
          userId: mod.id,
          type: "dispute_opened",
          title: "New dispute requires attention",
          message: `A dispute has been opened for job "${job.title}".`,
          relatedId: dispute.id,
          sourceType: "dispute",
          sourceId: dispute.id,
        });
      }

      res.json(dispute);
    } catch (error) {
      console.error("Error opening dispute:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  // Get disputes (for moderators)
  // Get disputes claimed by the current moderator
  app.get("/api/disputes/mine", requireRole("moderator", "staff", "head_of_moderation", "founder"), async (req, res) => {
    try {
      const allDisputes = await storage.getDisputes();
      const myDisputes = allDisputes.filter(d => d.moderatorId === req.session.userId);

      // Enrich with job and user data
      const enrichedDisputes = await Promise.all(
        myDisputes.map(async (dispute) => {
          const job = await storage.getJob(dispute.jobId);
          const openedBy = await storage.getUser(dispute.openedByUserId);
          const customer = job ? await storage.getUser(job.customerId) : null;
          const freelancer = job?.freelancerId ? await storage.getUser(job.freelancerId) : null;

          return {
            ...dispute,
            jobTitle: job?.title,
            jobBudget: job?.budget,
            openedByUsername: openedBy?.username,
            customerUsername: customer?.username,
            customerId: job?.customerId,
            freelancerUsername: freelancer?.username,
            freelancerId: job?.freelancerId,
          };
        })
      );

      res.json(enrichedDisputes);
    } catch (error) {
      console.error("Error getting my disputes:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  app.get("/api/disputes", requireRole("moderator", "staff", "head_of_moderation", "founder"), async (req, res) => {
    try {
      const { status } = req.query;
      const disputes = await storage.getDisputes(status ? { status: status as string } : undefined);

      // Enrich with job and user data
      const enrichedDisputes = await Promise.all(
        disputes.map(async (dispute) => {
          const job = await storage.getJob(dispute.jobId);
          const openedBy = await storage.getUser(dispute.openedByUserId);
          const moderator = dispute.moderatorId ? await storage.getUser(dispute.moderatorId) : null;

          return {
            ...dispute,
            job: job ? { id: job.id, title: job.title, budget: job.budget, customerId: job.customerId, freelancerId: job.freelancerId } : null,
            openedBy: openedBy ? { id: openedBy.id, username: openedBy.username, role: openedBy.role } : null,
            moderator: moderator ? { id: moderator.id, username: moderator.username } : null,
          };
        })
      );

      res.json(enrichedDisputes);
    } catch (error) {
      console.error("Error getting disputes:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  // Claim dispute (moderator takes ownership)
  app.post("/api/disputes/:id/claim", requireRole("moderator", "staff", "head_of_moderation", "founder"), async (req, res) => {
    try {
      const dispute = await storage.getDispute(req.params.id);
      if (!dispute) {
        return res.status(404).json({ error: "Dispute not found" });
      }

      if (dispute.status !== DisputeStatus.OPEN) {
        return res.status(400).json({ error: "Dispute is not open" });
      }

      if (dispute.moderatorId) {
        return res.status(400).json({ error: "Dispute already claimed by another moderator" });
      }

      const updatedDispute = await storage.updateDispute(req.params.id, {
        moderatorId: req.session.userId!,
        status: DisputeStatus.UNDER_REVIEW,
      });

      // Log moderation action
      await storage.createModerationLog({
        moderatorId: req.session.userId!,
        actionType: "dispute_claimed",
        disputeId: dispute.id,
        jobId: dispute.jobId,
      });

      res.json(updatedDispute);
    } catch (error) {
      console.error("Error claiming dispute:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  // Resolve dispute
  app.post("/api/disputes/:id/resolve", requireRole("moderator", "staff", "head_of_moderation", "founder"), async (req, res) => {
    try {
      const dispute = await storage.getDispute(req.params.id);
      if (!dispute) {
        return res.status(404).json({ error: "Dispute not found" });
      }

      if (dispute.status === DisputeStatus.RESOLVED) {
        return res.status(400).json({ error: "Dispute already resolved" });
      }

      const { freelancerAmount, customerRefund, resolutionNotes } = req.body;

      if (typeof freelancerAmount !== "number" || typeof customerRefund !== "number") {
        return res.status(400).json({ error: "Please specify freelancer and customer amounts" });
      }

      if (!resolutionNotes || typeof resolutionNotes !== "string" || resolutionNotes.trim().length < 10) {
        return res.status(400).json({ error: "Please provide resolution notes (at least 10 characters)" });
      }

      const job = await storage.getJob(dispute.jobId);
      if (!job) {
        return res.status(404).json({ error: "Job not found" });
      }

      const budget = parseFloat(job.budget);
      const jobPremium = parseFloat(job.premiumAmount || "0");
      const totalCost = budget + jobPremium;

      // Validate amounts don't exceed budget (premium always goes to Linxora)
      if (freelancerAmount + customerRefund > budget) {
        return res.status(400).json({ error: "Total distribution cannot exceed job budget" });
      }

      // Get escrow
      const escrow = await storage.getEscrowByJob(job.id);
      if (!escrow) {
        return res.status(400).json({ error: "Escrow not found" });
      }

      // Update dispute
      const updatedDispute = await storage.updateDispute(req.params.id, {
        status: DisputeStatus.RESOLVED,
        freelancerAmount: freelancerAmount.toFixed(2),
        customerRefund: customerRefund.toFixed(2),
        resolutionNotes: resolutionNotes.trim(),
      });

      // Funds already deducted from customer wallet at submission time
      // Only refund the customerRefund portion back to wallet (premium stays with Linxora)
      if (customerRefund > 0) {
        const customerWallet = await storage.getWallet(job.customerId);
        if (customerWallet) {
          const customerBalance = parseFloat(customerWallet.usdtBalance || "0");
          await storage.updateWallet(job.customerId, {
            usdtBalance: (customerBalance + customerRefund).toFixed(8),
          });

          await storage.createTransaction({
            walletId: customerWallet.id,
            type: "refund",
            currency: "USDT",
            amount: customerRefund.toFixed(8),
            usdAmount: customerRefund.toFixed(2),
            status: "completed",
            transactionHash: `dispute-refund-${dispute.id}`,
          });
        }
      }

      // Pay freelancer if they get anything
      if (job.freelancerId && freelancerAmount > 0) {
        const freelancerWallet = await storage.getWallet(job.freelancerId);
        if (freelancerWallet) {
          const freelancerBalance = parseFloat(freelancerWallet.usdtBalance || "0");
          await storage.updateWallet(job.freelancerId, {
            usdtBalance: (freelancerBalance + freelancerAmount).toFixed(8),
          });

          await storage.createTransaction({
            walletId: freelancerWallet.id,
            type: "deposit",
            currency: "USDT",
            amount: freelancerAmount.toFixed(8),
            usdAmount: freelancerAmount.toFixed(2),
            status: "completed",
            transactionHash: `dispute-payout-${dispute.id}`,
          });
        }
      }

      // Update escrow
      await storage.updateEscrow(escrow.id, { status: EscrowStatus.RELEASED });

      // Update job status
      await storage.updateJob(job.id, {
        status: JobStatus.CANCELLED,
        isLocked: false,
      });

      // Log moderation action
      await storage.createModerationLog({
        moderatorId: req.session.userId!,
        actionType: "dispute_resolved",
        disputeId: dispute.id,
        jobId: job.id,
        notes: `Freelancer: $${freelancerAmount}, Customer refund: $${customerRefund}`,
      });

      // Notify both parties
      await storage.createNotification({
        userId: job.customerId,
        type: "dispute_resolved",
        title: "Dispute resolved",
        message: `The dispute for "${job.title}" has been resolved. You received a refund of $${customerRefund}.`,
        relatedId: job.id,
        sourceType: "dispute",
        sourceId: dispute.id,
      });

      if (job.freelancerId) {
        await storage.createNotification({
          userId: job.freelancerId,
          type: "dispute_resolved",
          title: "Dispute resolved",
          message: `The dispute for "${job.title}" has been resolved. You received $${freelancerAmount}.`,
          relatedId: job.id,
          sourceType: "dispute",
          sourceId: dispute.id,
        });
      }

      res.json(updatedDispute);
    } catch (error) {
      console.error("Error resolving dispute:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  // ============================================================
  // CANCELLATION ROUTES
  // ============================================================

  // Cancel job before freelancer acceptance (full refund)
  app.post("/api/jobs/:id/cancel-before-acceptance", requireAuth, async (req, res) => {
    try {
      const job = await storage.getJob(req.params.id);
      if (!job) {
        return res.status(404).json({ error: "Job not found" });
      }

      if (job.customerId !== req.session.userId) {
        return res.status(403).json({ error: "Only the job owner can cancel" });
      }

      // Can only cancel before freelancer accepts (PENDING_ACCEPTANCE, or old "active" status)
      if (job.status !== JobStatus.PENDING_ACCEPTANCE && job.status !== "active") {
        return res.status(400).json({ error: "Job can only be cancelled before a freelancer accepts" });
      }

      // Refund escrow
      const escrow = await storage.getEscrowByJob(job.id);
      if (escrow) {
        await storage.updateEscrow(escrow.id, { status: EscrowStatus.REFUNDED });
      }

      // Credit full refund back to wallet (budget + premium)
      const budget = parseFloat(job.budget);
      const jobPremium = parseFloat(job.premiumAmount || "0");
      const totalRefund = budget + jobPremium;

      const customerWallet = await storage.getWallet(job.customerId);
      if (customerWallet) {
        const currentBalance = parseFloat(customerWallet.usdtBalance || "0");
        await storage.updateWallet(job.customerId, {
          usdtBalance: (currentBalance + totalRefund).toFixed(8),
        });
        await storage.createTransaction({
          walletId: customerWallet.id,
          type: "refund",
          currency: "USDT",
          amount: totalRefund.toFixed(8),
          usdAmount: totalRefund.toFixed(2),
          status: "completed",
          transactionHash: `job-cancel-refund-${job.id}`,
        });
      }

      // Cancel any pending scheduled tasks
      const scheduledTasks = await storage.getScheduledTasks({ jobId: job.id });
      for (const task of scheduledTasks) {
        if (task.status === ScheduledTaskStatus.PENDING) {
          await storage.updateScheduledTask(task.id, { status: "cancelled" });
        }
      }

      // Update job status
      const updatedJob = await storage.updateJob(job.id, {
        status: JobStatus.CANCELLED,
      });

      // Notify customer
      await storage.createNotification({
        userId: job.customerId,
        type: "job_cancelled",
        title: "Job cancelled",
        message: `Your job "${job.title}" has been cancelled. Full refund of $${totalRefund.toFixed(2)} processed.`,
        relatedId: job.id,
        sourceType: "job",
        sourceId: job.id,
      });

      res.json(updatedJob);
    } catch (error) {
      console.error("Error cancelling job:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  // Initiate cancellation after freelancer acceptance (starts 7-day negotiation)
  app.post("/api/jobs/:id/initiate-cancellation", requireAuth, async (req, res) => {
    try {
      const job = await storage.getJob(req.params.id);
      if (!job) {
        return res.status(404).json({ error: "Job not found" });
      }

      // Only customer or freelancer can initiate
      const isParticipant = job.customerId === req.session.userId || job.freelancerId === req.session.userId;
      if (!isParticipant) {
        return res.status(403).json({ error: "Only job participants can initiate cancellation" });
      }

      // Must be after acceptance (claimed or in_progress)
      if (job.status !== "claimed" && job.status !== "in_progress") {
        return res.status(400).json({ error: "Job must be in progress to initiate cancellation" });
      }

      // Check for existing negotiation
      const existing = await storage.getCancellationNegotiationByJob(job.id);
      if (existing && existing.status === "negotiating") {
        return res.status(400).json({ error: "Cancellation negotiation already in progress" });
      }

      const { proposedFreelancerAmount, proposedCustomerRefund } = req.body;
      const budget = parseFloat(job.budget);

      // Validate amounts
      if (typeof proposedFreelancerAmount !== "number" || typeof proposedCustomerRefund !== "number") {
        return res.status(400).json({ error: "Please specify proposed amounts" });
      }

      if (proposedFreelancerAmount + proposedCustomerRefund > budget) {
        return res.status(400).json({ error: "Total amounts cannot exceed job budget" });
      }

      // Create negotiation with 7-day expiry
      const expiresAt = new Date();
      expiresAt.setDate(expiresAt.getDate() + 7);

      const initiatorIsCustomer = job.customerId === req.session.userId;

      const negotiation = await storage.createCancellationNegotiation({
        jobId: job.id,
        initiatedById: req.session.userId!,
        proposedFreelancerAmount: proposedFreelancerAmount.toFixed(2),
        proposedCustomerRefund: proposedCustomerRefund.toFixed(2),
        agreedByCustomer: initiatorIsCustomer,
        agreedByFreelancer: !initiatorIsCustomer,
        expiresAt,
        status: "negotiating",
      });

      // Schedule escalation task
      await storage.createScheduledTask({
        jobId: job.id,
        taskType: "cancellation_escalation",
        runAt: expiresAt,
        status: ScheduledTaskStatus.PENDING,
        metadata: { negotiationId: negotiation.id },
      });

      // Notify other party
      const otherPartyId = initiatorIsCustomer ? job.freelancerId : job.customerId;
      if (otherPartyId) {
        await storage.createNotification({
          userId: otherPartyId,
          type: "cancellation_proposed",
          title: "Cancellation proposed",
          message: `A cancellation has been proposed for "${job.title}". You have 7 days to agree or negotiate.`,
          relatedId: job.id,
          sourceType: "job",
          sourceId: job.id,
        });
      }

      res.json(negotiation);
    } catch (error) {
      console.error("Error initiating cancellation:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  // Agree to cancellation proposal
  app.post("/api/jobs/:id/agree-cancellation", requireAuth, async (req, res) => {
    try {
      const job = await storage.getJob(req.params.id);
      if (!job) {
        return res.status(404).json({ error: "Job not found" });
      }

      const negotiation = await storage.getCancellationNegotiationByJob(job.id);
      if (!negotiation || negotiation.status !== "negotiating") {
        return res.status(400).json({ error: "No active cancellation negotiation" });
      }

      const isCustomer = job.customerId === req.session.userId;
      const isFreelancer = job.freelancerId === req.session.userId;

      if (!isCustomer && !isFreelancer) {
        return res.status(403).json({ error: "Only job participants can agree to cancellation" });
      }

      // Update agreement
      const updates: any = {
        agreedByCustomer: negotiation.agreedByCustomer || isCustomer,
        agreedByFreelancer: negotiation.agreedByFreelancer || isFreelancer,
      };

      // Check if both parties agree
      if (updates.agreedByCustomer && updates.agreedByFreelancer) {
        updates.status = "agreed";

        // Process the cancellation
        const freelancerAmount = parseFloat(negotiation.proposedFreelancerAmount || "0");
        const customerRefund = parseFloat(negotiation.proposedCustomerRefund || "0");
        const budget = parseFloat(job.budget);

        // Update escrow
        const escrow = await storage.getEscrowByJob(job.id);
        if (escrow) {
          await storage.updateEscrow(escrow.id, { status: EscrowStatus.RELEASED });
        }

        // Funds already deducted at submission time
        // Only refund the customerRefund portion back to wallet
        if (customerRefund > 0) {
          const customerWallet = await storage.getWallet(job.customerId);
          if (customerWallet) {
            const customerBalance = parseFloat(customerWallet.usdtBalance || "0");
            await storage.updateWallet(job.customerId, {
              usdtBalance: (customerBalance + customerRefund).toFixed(8),
            });

            await storage.createTransaction({
              walletId: customerWallet.id,
              type: "refund",
              currency: "USDT",
              amount: customerRefund.toFixed(8),
              usdAmount: customerRefund.toFixed(2),
              status: "completed",
              transactionHash: `cancel-refund-${job.id}`,
            });
          }
        }

        if (job.freelancerId && freelancerAmount > 0) {
          const freelancerWallet = await storage.getWallet(job.freelancerId);
          if (freelancerWallet) {
            const freelancerBalance = parseFloat(freelancerWallet.usdtBalance || "0");
            await storage.updateWallet(job.freelancerId, {
              usdtBalance: (freelancerBalance + freelancerAmount).toFixed(8),
            });

            await storage.createTransaction({
              walletId: freelancerWallet.id,
              type: "deposit",
              currency: "USDT",
              amount: freelancerAmount.toFixed(8),
              usdAmount: freelancerAmount.toFixed(2),
              status: "completed",
              transactionHash: `cancel-payout-${job.id}`,
            });
          }
        }

        // Cancel scheduled tasks
        const scheduledTasks = await storage.getScheduledTasks({ jobId: job.id });
        for (const task of scheduledTasks) {
          if (task.status === ScheduledTaskStatus.PENDING) {
            await storage.updateScheduledTask(task.id, { status: "cancelled" });
          }
        }

        // Update job
        await storage.updateJob(job.id, {
          status: JobStatus.CANCELLED,
        });

        // Notify both parties
        await storage.createNotification({
          userId: job.customerId,
          type: "job_cancelled",
          title: "Job cancelled by agreement",
          message: `"${job.title}" has been cancelled. You received $${customerRefund}.`,
          relatedId: job.id,
          sourceType: "job",
          sourceId: job.id,
        });

        if (job.freelancerId) {
          await storage.createNotification({
            userId: job.freelancerId,
            type: "job_cancelled",
            title: "Job cancelled by agreement",
            message: `"${job.title}" has been cancelled. You received $${freelancerAmount}.`,
            relatedId: job.id,
            sourceType: "job",
            sourceId: job.id,
          });
        }
      }

      const updatedNegotiation = await storage.updateCancellationNegotiation(negotiation.id, updates);
      res.json(updatedNegotiation);
    } catch (error) {
      console.error("Error agreeing to cancellation:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  // Get cancellation negotiation for a job
  app.get("/api/jobs/:id/cancellation-negotiation", requireAuth, async (req, res) => {
    try {
      const job = await storage.getJob(req.params.id);
      if (!job) {
        return res.status(404).json({ error: "Job not found" });
      }

      // Only participants or moderators can view
      const user = await storage.getUser(req.session.userId!);
      const isParticipant = job.customerId === req.session.userId || job.freelancerId === req.session.userId;
      const isModerator = ["staff", "moderator", "head_of_moderation", "founder"].includes(user?.role || "");

      if (!isParticipant && !isModerator) {
        return res.status(403).json({ error: "Not authorized" });
      }

      const negotiation = await storage.getCancellationNegotiationByJob(job.id);
      res.json(negotiation || null);
    } catch (error) {
      console.error("Error getting cancellation negotiation:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  // Get escrow for a job
  app.get("/api/jobs/:id/escrow", requireAuth, async (req, res) => {
    try {
      const job = await storage.getJob(req.params.id);
      if (!job) {
        return res.status(404).json({ error: "Job not found" });
      }

      // Only participants or moderators can view escrow
      const user = await storage.getUser(req.session.userId!);
      const isParticipant = job.customerId === req.session.userId || job.freelancerId === req.session.userId;
      const isModerator = ["staff", "moderator", "head_of_moderation", "founder"].includes(user?.role || "");

      if (!isParticipant && !isModerator) {
        return res.status(403).json({ error: "Not authorized" });
      }

      const escrow = await storage.getEscrowByJob(job.id);
      res.json(escrow || null);
    } catch (error) {
      console.error("Error getting escrow:", error);
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

      // Check if user is part of the team (customer, freelancer, collaborator, or jobFreelancers member)
      const jobFreelancerRecords = await storage.getJobFreelancers(req.params.id);
      const isJobFreelancerMember = jobFreelancerRecords.some(jf => jf.freelancerId === req.session.userId);
      
      const isPartOfTeam = 
        job.customerId === req.session.userId ||
        job.freelancerId === req.session.userId ||
        job.collaborators?.includes(req.session.userId!) ||
        isJobFreelancerMember;

      if (!isPartOfTeam) {
        return res.status(403).json({ error: "You are not part of this job's team" });
      }

      const messages = await storage.getTeamMessages(req.params.id);
      
      // Enrich messages with user role
      const enrichedMessages = await Promise.all(
        messages.map(async (msg) => {
          const sender = await storage.getUser(msg.senderId);
          return {
            ...msg,
            role: sender?.role || null,
          };
        })
      );
      
      res.json(enrichedMessages);
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

      // Check if user is part of the team (including jobFreelancers members)
      const jobFreelancerRecords = await storage.getJobFreelancers(req.params.id);
      const isJobFreelancerMember = jobFreelancerRecords.some(jf => jf.freelancerId === req.session.userId);
      
      const isPartOfTeam = 
        job.customerId === req.session.userId ||
        job.freelancerId === req.session.userId ||
        job.collaborators?.includes(req.session.userId!) ||
        isJobFreelancerMember;

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
        sourceType: "job",
        sourceId: job.id,
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
      const job = await storage.getJob(req.params.id);
      if (!job) {
        return res.status(404).json({ error: "Job not found" });
      }

      // Refund charged funds back to wallet since job was rejected
      const escrow = await storage.getEscrowByJob(job.id);
      if (escrow && escrow.status === EscrowStatus.HELD) {
        const refundAmount = parseFloat(escrow.totalAmount);
        const customerWallet = await storage.getWallet(job.customerId);
        if (customerWallet) {
          const currentBalance = parseFloat(customerWallet.usdtBalance || "0");
          await storage.updateWallet(job.customerId, {
            usdtBalance: (currentBalance + refundAmount).toFixed(8),
          });
          await storage.createTransaction({
            walletId: customerWallet.id,
            type: "refund",
            currency: "USDT",
            amount: refundAmount.toFixed(8),
            usdAmount: refundAmount.toFixed(2),
            status: "completed",
            transactionHash: `mod-rejection-refund-${job.id}-${Date.now()}`,
          });
        }
        await storage.updateEscrow(escrow.id, { status: EscrowStatus.REFUNDED });
      }

      const updatedJob = await storage.updateJob(req.params.id, { status: "rejected" });

      // Notify customer that their job was rejected
      await storage.createNotification({
        userId: job.customerId,
        type: "job_rejected",
        title: "Job rejected - funds refunded",
        message: `Your job "${job.title}" was not approved. Your funds have been refunded to your wallet.`,
        relatedId: job.id,
        sourceType: "job",
        sourceId: job.id,
      });

      res.json(updatedJob);
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

      // Refund charged funds back to wallet - customer will re-pay when resubmitting
      const escrow = await storage.getEscrowByJob(job.id);
      if (escrow && escrow.status === EscrowStatus.HELD) {
        const refundAmount = parseFloat(escrow.totalAmount);
        const customerWallet = await storage.getWallet(job.customerId);
        if (customerWallet) {
          const currentBalance = parseFloat(customerWallet.usdtBalance || "0");
          await storage.updateWallet(job.customerId, {
            usdtBalance: (currentBalance + refundAmount).toFixed(8),
          });
          await storage.createTransaction({
            walletId: customerWallet.id,
            type: "refund",
            currency: "USDT",
            amount: refundAmount.toFixed(8),
            usdAmount: refundAmount.toFixed(2),
            status: "completed",
            transactionHash: `mod-changes-refund-${job.id}-${Date.now()}`,
          });
        }
        await storage.updateEscrow(escrow.id, { status: EscrowStatus.REFUNDED });
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
          title: "Changes requested - funds refunded",
          message: `Your job "${job.title}" requires changes. Your funds have been refunded. Changes needed:\n\n${feedback}`,
          relatedId: job.id,
          sourceType: "job",
          sourceId: job.id,
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

      // If no approval required, update job status immediately and refund
      let updatedJob = job;
      if (!approvalRequired && isCustomer) {
        // Refund escrow funds back to wallet
        const escrow = await storage.getEscrowByJob(jobId);
        if (escrow && escrow.status === EscrowStatus.HELD) {
          const refundAmount = parseFloat(escrow.totalAmount);
          const customerWallet = await storage.getWallet(job.customerId);
          if (customerWallet) {
            const currentBalance = parseFloat(customerWallet.usdtBalance || "0");
            await storage.updateWallet(job.customerId, {
              usdtBalance: (currentBalance + refundAmount).toFixed(8),
            });
            await storage.createTransaction({
              walletId: customerWallet.id,
              type: "refund",
              currency: "USDT",
              amount: refundAmount.toFixed(8),
              usdAmount: refundAmount.toFixed(2),
              status: "completed",
              transactionHash: `cancel-refund-${job.id}-${Date.now()}`,
            });
          }
          await storage.updateEscrow(escrow.id, { status: EscrowStatus.REFUNDED });
        }

        updatedJob = await storage.updateJob(jobId, {
          status: JobStatus.CANCELLED,
          freelancerId: null,
          collaborators: [],
        }) || job;

        const refundTotal = parseFloat(job.budget) + parseFloat(job.premiumAmount || "0");
        await storage.createNotification({
          userId: user.id,
          type: "cancellation_request",
          title: "Job cancelled - funds refunded",
          message: `Your job "${job.title}" has been cancelled. $${refundTotal.toFixed(2)} has been refunded to your wallet.`,
          relatedId: jobId,
          sourceType: "job",
          sourceId: jobId,
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

      // Refund charged funds back to customer wallet
      const jobBudget = parseFloat(job.budget);
      const jobPremium = parseFloat(job.premiumAmount || "0");
      const totalRefund = jobBudget + jobPremium;

      const escrow = await storage.getEscrowByJob(job.id);
      if (escrow && escrow.status === EscrowStatus.HELD) {
        const customerWallet = await storage.getWallet(job.customerId);
        if (customerWallet) {
          const currentBalance = parseFloat(customerWallet.usdtBalance || "0");
          await storage.updateWallet(job.customerId, {
            usdtBalance: (currentBalance + totalRefund).toFixed(8),
          });
          await storage.createTransaction({
            walletId: customerWallet.id,
            type: "refund",
            currency: "USDT",
            amount: totalRefund.toFixed(8),
            usdAmount: totalRefund.toFixed(2),
            status: "completed",
            transactionHash: `cancel-approve-refund-${job.id}-${Date.now()}`,
          });
        }
        await storage.updateEscrow(escrow.id, { status: EscrowStatus.REFUNDED });
      }

      const updatedJob = await storage.updateJob(request.jobId, { 
        status: JobStatus.CANCELLED,
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
      const pendingUsdtBalance = parseFloat(wallet.pendingUsdtBalance || "0");
      const availableBalance = totalBalance - pendingUsdtBalance;
      
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
        const pendingUsdtBalance = parseFloat(wallet.pendingUsdtBalance || "0");
        const availableBalance = currentBalance - pendingUsdtBalance;
        
        if (availableBalance < withdrawAmount) {
          return res.status(400).json({ 
            error: "Insufficient available balance",
            details: `You have ${availableBalance.toFixed(2)} USDT available (${pendingUsdtBalance.toFixed(2)} USDT locked in active jobs)`
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

  // Moderation Vault routes
  app.get("/api/vault", requireRole("head_of_moderation", "founder"), async (req, res) => {
    try {
      const vault = await storage.getModerationVault();
      res.json(vault);
    } catch (error) {
      res.status(500).json({ error: "Internal server error" });
    }
  });

  app.get("/api/vault/transactions", requireRole("head_of_moderation", "founder"), async (req, res) => {
    try {
      const transactions = await storage.getVaultTransactions();
      
      // Enrich with user info
      const enrichedTransactions = await Promise.all(transactions.map(async (t) => {
        let fromUser = null;
        let toUser = null;
        let distributedBy = null;
        
        if (t.fromUserId) {
          const user = await storage.getUser(t.fromUserId);
          fromUser = user ? { id: user.id, username: user.username } : null;
        }
        if (t.toUserId) {
          const user = await storage.getUser(t.toUserId);
          toUser = user ? { id: user.id, username: user.username } : null;
        }
        if (t.distributedByUserId) {
          const user = await storage.getUser(t.distributedByUserId);
          distributedBy = user ? { id: user.id, username: user.username } : null;
        }
        
        return {
          ...t,
          fromUser,
          toUser,
          distributedBy,
        };
      }));
      
      res.json(enrichedTransactions);
    } catch (error) {
      res.status(500).json({ error: "Internal server error" });
    }
  });

  app.post("/api/vault/deposit", requireRole("founder"), async (req, res) => {
    try {
      const { amount, note } = req.body;
      const depositAmount = parseFloat(amount);
      
      if (isNaN(depositAmount) || depositAmount <= 0) {
        return res.status(400).json({ error: "Deposit amount must be greater than $0" });
      }
      
      if (depositAmount < 1.00) {
        return res.status(400).json({ error: "Minimum deposit is $1.00" });
      }

      const transaction = await storage.depositToVault(depositAmount, req.session.userId!, note);
      
      // Notify Head of Moderation about the deposit
      const users = await storage.getUsers();
      const homUsers = users.filter(u => u.role === "head_of_moderation");
      for (const hom of homUsers) {
        await storage.createNotification({
          userId: hom.id,
          type: "vault_deposit",
          title: "Vault Deposit",
          message: `The Founder deposited $${depositAmount.toFixed(2)} to the moderation vault.`,
          relatedId: transaction.id,
          sourceType: "system",
          sourceId: transaction.id,
        });
      }
      
      res.json(transaction);
    } catch (error) {
      res.status(500).json({ error: "Internal server error" });
    }
  });

  app.post("/api/vault/distribute", requireRole("head_of_moderation"), async (req, res) => {
    try {
      const { amount, toUserId, note } = req.body;
      const distributeAmount = parseFloat(amount);
      
      if (isNaN(distributeAmount) || distributeAmount <= 0) {
        return res.status(400).json({ error: "Distribution amount must be greater than $0" });
      }

      if (!toUserId) {
        return res.status(400).json({ error: "Recipient user ID is required" });
      }

      // Verify recipient is a moderator or staff
      const recipient = await storage.getUser(toUserId);
      if (!recipient) {
        return res.status(404).json({ error: "Recipient not found" });
      }
      
      if (!["moderator", "staff"].includes(recipient.role)) {
        return res.status(400).json({ error: "Can only distribute funds to moderators or staff" });
      }

      // Check vault balance
      const vault = await storage.getModerationVault();
      const vaultBalance = parseFloat(vault.balance || "0");
      if (vaultBalance < distributeAmount) {
        return res.status(400).json({ error: "Insufficient vault balance" });
      }

      // Perform distribution
      const transaction = await storage.distributeFromVault(
        distributeAmount,
        toUserId,
        req.session.userId!,
        note
      );

      // Add funds to recipient's wallet
      let recipientWallet = await storage.getWallet(toUserId);
      if (!recipientWallet) {
        recipientWallet = await storage.createWallet({
          userId: toUserId,
          walletAddress: `0x${Math.random().toString(36).substring(2, 15)}`,
        });
      }
      const currentBalance = parseFloat(recipientWallet.usdtBalance || "0");
      await storage.updateWallet(toUserId, {
        usdtBalance: (currentBalance + distributeAmount).toString(),
      });

      // Notify the recipient
      await storage.createNotification({
        userId: toUserId,
        type: "vault_distribution",
        title: "Funds Received",
        message: `You received $${distributeAmount.toFixed(2)} from the moderation vault${note ? `: ${note}` : ""}.`,
        relatedId: transaction.id,
        sourceType: "system",
        sourceId: transaction.id,
      });
      
      res.json(transaction);
    } catch (error) {
      console.error("Vault distribution error:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  // Friend routes
  app.get("/api/friends", requireAuth, async (req, res) => {
    try {
      const friendships = await storage.getFriends(req.session.userId!);
      
      // Enrich with user info
      const friends = await Promise.all(friendships.map(async (f) => {
        const friendId = f.userId === req.session.userId ? f.friendId : f.userId;
        const user = await storage.getUser(friendId);
        return user ? {
          id: f.id,
          friendId: user.id,
          userId: user.userId,
          username: user.username,
          avatar: user.avatar,
          role: user.role,
          createdAt: f.createdAt,
        } : null;
      }));
      
      res.json(friends.filter(Boolean));
    } catch (error) {
      res.status(500).json({ error: "Internal server error" });
    }
  });

  app.get("/api/friend-requests", requireAuth, async (req, res) => {
    try {
      const incoming = await storage.getIncomingFriendRequests(req.session.userId!);
      
      // Enrich with user info
      const enrichedRequests = await Promise.all(incoming.map(async (r) => {
        const fromUser = await storage.getUser(r.fromUserId);
        return {
          ...r,
          fromUser: fromUser ? {
            id: fromUser.id,
            userId: fromUser.userId,
            username: fromUser.username,
            avatar: fromUser.avatar,
            role: fromUser.role,
          } : null,
        };
      }));
      
      res.json(enrichedRequests);
    } catch (error) {
      res.status(500).json({ error: "Internal server error" });
    }
  });

  app.get("/api/friend-requests/outgoing", requireAuth, async (req, res) => {
    try {
      const allRequests = await storage.getFriendRequestsByUser(req.session.userId!);
      const outgoing = allRequests.filter(r => r.fromUserId === req.session.userId && r.status === "pending");
      
      // Enrich with user info
      const enrichedRequests = await Promise.all(outgoing.map(async (r) => {
        const toUser = await storage.getUser(r.toUserId);
        return {
          ...r,
          toUser: toUser ? {
            id: toUser.id,
            userId: toUser.userId,
            username: toUser.username,
            avatar: toUser.avatar,
            role: toUser.role,
          } : null,
        };
      }));
      
      res.json(enrichedRequests);
    } catch (error) {
      res.status(500).json({ error: "Internal server error" });
    }
  });

  app.post("/api/friend-requests", requireAuth, async (req, res) => {
    try {
      const { toUserId } = req.body;
      
      if (!toUserId) {
        return res.status(400).json({ error: "Target user ID is required" });
      }
      
      // Can't send friend request to yourself
      if (toUserId === req.session.userId) {
        return res.status(400).json({ error: "Cannot send friend request to yourself" });
      }
      
      // Check if target user exists
      const targetUser = await storage.getUser(toUserId);
      if (!targetUser) {
        return res.status(404).json({ error: "User not found" });
      }
      
      // Check if already friends
      const alreadyFriends = await storage.areFriends(req.session.userId!, toUserId);
      if (alreadyFriends) {
        return res.status(400).json({ error: "Already friends with this user" });
      }
      
      // Check if there's already a pending request between these users
      const existingRequest = await storage.getFriendRequestBetweenUsers(req.session.userId!, toUserId);
      if (existingRequest && existingRequest.status === "pending") {
        return res.status(400).json({ error: "A friend request already exists between you and this user" });
      }
      
      const request = await storage.createFriendRequest({
        fromUserId: req.session.userId!,
        toUserId,
        status: "pending",
      });
      
      // Notify the target user
      const sender = await storage.getUser(req.session.userId!);
      await storage.createNotification({
        userId: toUserId,
        type: "friend_request",
        title: "Friend Request",
        message: `${sender?.username || "Someone"} sent you a friend request.`,
        relatedId: request.id,
        sourceType: "user",
        sourceId: req.session.userId!,
      });
      
      res.json(request);
    } catch (error) {
      res.status(500).json({ error: "Internal server error" });
    }
  });

  app.post("/api/friend-requests/:id/accept", requireAuth, async (req, res) => {
    try {
      const request = await storage.getFriendRequest(req.params.id);
      
      if (!request) {
        return res.status(404).json({ error: "Friend request not found" });
      }
      
      if (request.toUserId !== req.session.userId) {
        return res.status(403).json({ error: "Can only accept requests sent to you" });
      }
      
      if (request.status !== "pending") {
        return res.status(400).json({ error: "This request has already been processed" });
      }
      
      // Update request status
      await storage.updateFriendRequest(request.id, { status: "accepted" });
      
      // Create the friendship
      await storage.createFriendship(request.fromUserId, request.toUserId);
      
      // Notify the sender
      const accepter = await storage.getUser(req.session.userId!);
      await storage.createNotification({
        userId: request.fromUserId,
        type: "friend_accepted",
        title: "Friend Request Accepted",
        message: `${accepter?.username || "Someone"} accepted your friend request.`,
        relatedId: request.id,
        sourceType: "user",
        sourceId: req.session.userId!,
      });
      
      res.json({ success: true });
    } catch (error) {
      res.status(500).json({ error: "Internal server error" });
    }
  });

  app.post("/api/friend-requests/:id/decline", requireAuth, async (req, res) => {
    try {
      const request = await storage.getFriendRequest(req.params.id);
      
      if (!request) {
        return res.status(404).json({ error: "Friend request not found" });
      }
      
      if (request.toUserId !== req.session.userId) {
        return res.status(403).json({ error: "Can only decline requests sent to you" });
      }
      
      if (request.status !== "pending") {
        return res.status(400).json({ error: "This request has already been processed" });
      }
      
      await storage.updateFriendRequest(request.id, { status: "declined" });
      
      res.json({ success: true });
    } catch (error) {
      res.status(500).json({ error: "Internal server error" });
    }
  });

  app.post("/api/friend-requests/:id/cancel", requireAuth, async (req, res) => {
    try {
      const request = await storage.getFriendRequest(req.params.id);
      
      if (!request) {
        return res.status(404).json({ error: "Friend request not found" });
      }
      
      if (request.fromUserId !== req.session.userId) {
        return res.status(403).json({ error: "Can only cancel requests you sent" });
      }
      
      if (request.status !== "pending") {
        return res.status(400).json({ error: "This request has already been processed" });
      }
      
      await storage.updateFriendRequest(request.id, { status: "declined" });
      
      res.json({ success: true });
    } catch (error) {
      res.status(500).json({ error: "Internal server error" });
    }
  });

  app.delete("/api/friends/:friendId", requireAuth, async (req, res) => {
    try {
      const areFriends = await storage.areFriends(req.session.userId!, req.params.friendId);
      
      if (!areFriends) {
        return res.status(400).json({ error: "Not friends with this user" });
      }
      
      await storage.removeFriendship(req.session.userId!, req.params.friendId);
      
      res.json({ success: true });
    } catch (error) {
      res.status(500).json({ error: "Internal server error" });
    }
  });

  app.get("/api/users/search", requireAuth, async (req, res) => {
    try {
      const { userId } = req.query;
      
      if (!userId) {
        return res.status(400).json({ error: "User ID query is required" });
      }
      
      const userIdNum = parseInt(userId as string);
      if (isNaN(userIdNum)) {
        return res.status(400).json({ error: "Invalid user ID" });
      }
      
      const users = await storage.searchUsersByUserId(userIdNum);
      
      // Return safe user info
      const results = users.map(u => ({
        id: u.id,
        userId: u.userId,
        username: u.username,
        avatar: u.avatar,
        role: u.role,
        level: u.level,
        completedJobs: u.completedJobs,
        rating: u.rating,
      }));
      
      res.json(results);
    } catch (error) {
      res.status(500).json({ error: "Internal server error" });
    }
  });

  app.get("/api/users/:id/friend-status", requireAuth, async (req, res) => {
    try {
      const targetUserId = req.params.id;
      
      if (targetUserId === req.session.userId) {
        return res.json({ status: "self" });
      }
      
      const areFriends = await storage.areFriends(req.session.userId!, targetUserId);
      if (areFriends) {
        return res.json({ status: "friends" });
      }
      
      const existingRequest = await storage.getFriendRequestBetweenUsers(req.session.userId!, targetUserId);
      if (existingRequest && existingRequest.status === "pending") {
        if (existingRequest.fromUserId === req.session.userId) {
          return res.json({ status: "pending_outgoing", requestId: existingRequest.id });
        } else {
          return res.json({ status: "pending_incoming", requestId: existingRequest.id });
        }
      }
      
      res.json({ status: "none" });
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

  // Get all pending PTO requests for moderators
  app.get("/api/pto/pending", requireRole("moderator", "staff", "head_of_moderation", "founder"), async (req, res) => {
    try {
      const allRequests = await storage.getAllPTORequests();
      const pendingRequests = allRequests.filter(r => r.status === "pending");
      
      // Enrich with freelancer info
      const enrichedRequests = await Promise.all(pendingRequests.map(async (request) => {
        const freelancer = await storage.getUser(request.freelancerId);
        return {
          ...request,
          freelancerUsername: freelancer?.username || "Unknown",
          freelancerAvatar: freelancer?.avatar || null,
        };
      }));
      
      res.json(enrichedRequests);
    } catch (error) {
      res.status(500).json({ error: "Internal server error" });
    }
  });

  // Approve PTO request
  app.post("/api/pto/:id/approve", requireRole("moderator", "staff", "head_of_moderation", "founder"), async (req, res) => {
    try {
      const request = await storage.updatePTORequest(req.params.id, { status: "approved" });
      if (!request) {
        return res.status(404).json({ error: "PTO request not found" });
      }
      
      // Notify freelancer
      await storage.createNotification({
        userId: request.freelancerId,
        type: "pto_approved",
        title: "PTO Request Approved",
        message: `Your PTO request from ${request.startDate} to ${request.endDate} has been approved.`,
        relatedId: request.id,
        sourceType: "system",
        sourceId: request.id,
      });
      
      res.json(request);
    } catch (error) {
      res.status(500).json({ error: "Internal server error" });
    }
  });

  // Reject PTO request
  app.post("/api/pto/:id/reject", requireRole("moderator", "staff", "head_of_moderation", "founder"), async (req, res) => {
    try {
      const request = await storage.updatePTORequest(req.params.id, { status: "rejected" });
      if (!request) {
        return res.status(404).json({ error: "PTO request not found" });
      }
      
      // Notify freelancer
      await storage.createNotification({
        userId: request.freelancerId,
        type: "pto_rejected",
        title: "PTO Request Rejected",
        message: `Your PTO request from ${request.startDate} to ${request.endDate} has been rejected.`,
        relatedId: request.id,
        sourceType: "system",
        sourceId: request.id,
      });
      
      res.json(request);
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
          sourceType: "system",
          sourceId: request.id,
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
        sourceType: "job",
        sourceId: job.id,
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

  // Get enriched direct team invitations for freelancer (pending invitations from Offer Team feature)
  app.get("/api/invitations/pending", requireAuth, async (req, res) => {
    try {
      const user = await storage.getUser(req.session.userId!);
      if (!user) {
        return res.status(401).json({ error: "Unauthorized" });
      }

      if (user.role !== "freelancer") {
        return res.status(403).json({ error: "Only freelancers can view pending invitations" });
      }

      const allInvitations = await storage.getInvitations(user.id);
      // Filter to only pending invitations where user is the recipient
      // Include both "pending" status and null status (for backwards compatibility)
      const pendingInvitations = allInvitations.filter(
        inv => inv.toUserId === user.id && (inv.status === "pending" || inv.status === null)
      );

      // Enrich with user and job data
      const enrichedPromises = pendingInvitations.map(async (inv) => {
        const fromUser = await storage.getUser(inv.fromUserId);
        const job = await storage.getJob(inv.jobId);
        
        // Skip invitations with missing job data
        if (!job) return null;
        
        // Get customer from job (not from sender)
        const customer = await storage.getUser(job.customerId);
        
        // Get current team members for this job
        let teamMembers: Array<{id: string; username: string; avatar: string | null; level: number}> = [];
        if (job.freelancerId) {
          const mainFreelancer = await storage.getUser(job.freelancerId);
          if (mainFreelancer) {
            teamMembers.push({
              id: mainFreelancer.id,
              username: mainFreelancer.username,
              avatar: mainFreelancer.avatar,
              level: mainFreelancer.level || 1,
            });
          }
        }
        const jobFreelancers = await storage.getJobFreelancers(job.id);
        for (const jf of jobFreelancers) {
          const fl = await storage.getUser(jf.freelancerId);
          if (fl && !teamMembers.find(tm => tm.id === fl.id)) {
            teamMembers.push({
              id: fl.id,
              username: fl.username,
              avatar: fl.avatar,
              level: fl.level || 1,
            });
          }
        }
        
        // Calculate estimated split
        const currentTeamSize = teamMembers.length;
        const estimatedSplitCount = currentTeamSize + 1;
        const jobBudget = parseFloat(job.budget) || 0;
        const baseShare = estimatedSplitCount > 0 ? jobBudget / estimatedSplitCount : 0;
        const invitedLevel = user.level || 1;
        const levelPayout = getLevelPayout(invitedLevel);
        const estimatedShare = baseShare * levelPayout;
        
        return {
          id: inv.id,
          type: "direct_invitation" as const,
          status: inv.status || "pending",
          createdAt: inv.createdAt,
          inviter: fromUser ? {
            id: fromUser.id,
            username: fromUser.username,
            avatar: fromUser.avatar,
          } : null,
          customer: customer ? {
            id: customer.id,
            username: customer.username,
            avatar: customer.avatar,
          } : null,
          job: {
            id: job.id,
            title: job.title,
            description: job.description,
            budget: job.budget,
            category: job.category,
            deadline: job.deadline,
          },
          teamMembers,
          currentTeamSize,
          estimatedShare: estimatedShare.toFixed(2),
        };
      });
      
      const enrichedResults = await Promise.all(enrichedPromises);
      // Filter out null results (missing job data)
      const enriched = enrichedResults.filter(item => item !== null);

      res.json(enriched);
    } catch (error) {
      res.status(500).json({ error: "Internal server error" });
    }
  });

  app.post("/api/invitations/:id/accept", requireAuth, async (req, res) => {
    try {
      // First check if freelancer is already assigned to an active job
      const allJobs = await storage.getJobs({});
      const userId = req.session.userId!;
      const activeStatuses = ["in_progress", "claimed", "awaiting_customer", "submitted"];
      
      const assignedActiveJobs = allJobs.filter(j => {
        if (!activeStatuses.includes(j.status)) return false;
        if (j.freelancerId === userId) return true;
        if (j.teamMembers?.includes(userId)) return true;
        if (j.collaborators?.includes(userId)) return true;
        return false;
      });

      if (assignedActiveJobs.length > 0) {
        return res.status(400).json({ error: "You are already assigned to an active job. Complete it before accepting new invitations." });
      }

      // Also check jobFreelancers table for multi-freelancer assignments
      const jobFreelancerAssignments = await storage.getJobFreelancersByFreelancer(userId);
      for (const jf of jobFreelancerAssignments) {
        const assignedJob = await storage.getJob(jf.jobId);
        if (assignedJob && activeStatuses.includes(assignedJob.status)) {
          return res.status(400).json({ error: "You are already assigned to an active job. Complete it before accepting new invitations." });
        }
      }

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
        sourceType: "job",
        sourceId: job?.id || null,
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
        sourceType: "job",
        sourceId: job?.id || null,
      });

      res.json(invitation);
    } catch (error) {
      res.status(500).json({ error: "Internal server error" });
    }
  });

  // Profile update route (username only - email requires verification)
  app.put("/api/profile", requireAuth, async (req, res) => {
    try {
      const { username } = req.body;
      
      const updates: { username?: string } = {};
      
      if (username && typeof username === "string") {
        const trimmedUsername = username.trim();
        if (trimmedUsername.length < 2 || trimmedUsername.length > 50) {
          return res.status(400).json({ error: "Username must be between 2 and 50 characters" });
        }
        updates.username = trimmedUsername;
      }
      
      if (Object.keys(updates).length === 0) {
        return res.status(400).json({ error: "No valid fields to update" });
      }
      
      const user = await storage.updateUser(req.session.userId!, updates);
      if (!user) {
        return res.status(404).json({ error: "User not found" });
      }
      
      res.json({ username: user.username, email: user.email });
    } catch (error) {
      console.error("Profile update error:", error);
      res.status(500).json({ error: "Failed to update profile" });
    }
  });

  // Email change request - sends verification email
  app.post("/api/profile/email-change", requireAuth, async (req, res) => {
    try {
      const { email } = req.body;
      
      if (!email || typeof email !== "string") {
        return res.status(400).json({ error: "Email is required" });
      }
      
      const trimmedEmail = email.trim().toLowerCase();
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      
      if (!emailRegex.test(trimmedEmail)) {
        return res.status(400).json({ error: "Invalid email format" });
      }
      
      const user = await storage.getUser(req.session.userId!);
      if (!user) {
        return res.status(404).json({ error: "User not found" });
      }
      
      // Check if email is same as current
      if (user.email === trimmedEmail) {
        return res.status(400).json({ error: "This is already your current email" });
      }
      
      // Check rate limiting - 10 minute cooldown
      const existingToken = await storage.getEmailVerificationTokenByUserId(user.id);
      if (existingToken) {
        const tokenAge = Date.now() - new Date(existingToken.createdAt!).getTime();
        const cooldownMs = 10 * 60 * 1000; // 10 minutes
        if (tokenAge < cooldownMs) {
          const remainingMinutes = Math.ceil((cooldownMs - tokenAge) / 60000);
          return res.status(429).json({ 
            error: `Please wait ${remainingMinutes} minute(s) before requesting another email change` 
          });
        }
      }
      
      // Delete any existing tokens for this user
      await storage.deleteEmailVerificationTokensByUserId(user.id);
      
      // Generate secure token
      const crypto = await import('crypto');
      const token = crypto.randomBytes(32).toString('hex');
      
      // Store token with 24 hour expiration
      const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);
      await storage.createEmailVerificationToken({
        userId: user.id,
        token,
        newEmail: trimmedEmail,
        expiresAt,
      });
      
      // Update user with pending email
      await storage.updateUser(user.id, { pendingEmail: trimmedEmail });
      
      // Send verification email
      try {
        const { sendVerificationEmail } = await import('./lib/resend-client');
        await sendVerificationEmail(trimmedEmail, token, user.username);
      } catch (emailError) {
        console.error('Failed to send verification email:', emailError);
        return res.status(500).json({ error: "Failed to send verification email. Please try again later." });
      }
      
      res.json({ 
        message: "Verification email sent", 
        pendingEmail: trimmedEmail 
      });
    } catch (error) {
      console.error("Email change request error:", error);
      res.status(500).json({ error: "Failed to process email change request" });
    }
  });

  // Email verification - confirms the new email
  app.get("/api/profile/email-verify", async (req, res) => {
    try {
      const { token } = req.query;
      
      if (!token || typeof token !== "string") {
        return res.status(400).json({ error: "Invalid verification link" });
      }
      
      const verificationToken = await storage.getEmailVerificationToken(token);
      
      // Don't reveal whether token exists or is expired (security)
      if (!verificationToken) {
        return res.status(400).json({ error: "Invalid or expired verification link" });
      }
      
      // Check if token is expired
      if (new Date() > new Date(verificationToken.expiresAt)) {
        return res.status(400).json({ error: "Invalid or expired verification link" });
      }
      
      // Check if token was already used
      if (verificationToken.usedAt) {
        return res.status(400).json({ error: "This verification link has already been used" });
      }
      
      // Mark token as used
      await storage.markEmailVerificationTokenUsed(token);
      
      // Update user's email
      const user = await storage.updateUser(verificationToken.userId, {
        email: verificationToken.newEmail,
        emailVerified: true,
        pendingEmail: null,
      });
      
      if (!user) {
        return res.status(404).json({ error: "User not found" });
      }
      
      // Create notification for user
      await storage.createNotification({
        userId: user.id,
        type: "system",
        title: "Email verified",
        message: `Your email has been successfully changed to ${verificationToken.newEmail}`,
        sourceType: "system",
        sourceId: null,
      });
      
      res.json({ 
        success: true, 
        message: "Email verified successfully",
        email: verificationToken.newEmail 
      });
    } catch (error) {
      console.error("Email verification error:", error);
      res.status(500).json({ error: "Failed to verify email" });
    }
  });

  // Cancel pending email change
  app.delete("/api/profile/email-change", requireAuth, async (req, res) => {
    try {
      const user = await storage.getUser(req.session.userId!);
      if (!user) {
        return res.status(404).json({ error: "User not found" });
      }
      
      // Delete any pending tokens
      await storage.deleteEmailVerificationTokensByUserId(user.id);
      
      // Clear pending email
      await storage.updateUser(user.id, { pendingEmail: null });
      
      res.json({ message: "Email change cancelled" });
    } catch (error) {
      console.error("Cancel email change error:", error);
      res.status(500).json({ error: "Failed to cancel email change" });
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

  app.put("/api/profile/bio", requireAuth, async (req, res) => {
    try {
      const { bio } = req.body;
      
      if (bio !== undefined && typeof bio !== "string") {
        return res.status(400).json({ error: "Invalid bio format" });
      }

      const trimmed = bio ? bio.trim() : "";
      const sanitized = sanitizeText(trimmed);
      
      if (sanitized.length > 500) {
        return res.status(400).json({ error: "Bio must be 500 characters or less" });
      }

      const user = await storage.updateUser(req.session.userId!, { bio: sanitized || null });
      if (!user) {
        return res.status(404).json({ error: "User not found" });
      }

      res.json({ bio: user.bio });
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
        const totalSpent = completedJobs.reduce((sum, j) => sum + (Number(j.budget) || 0) + (Number(j.premiumAmount) || 0), 0);
        
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

  // Job Team Members endpoint (for chat partner selection)
  app.get("/api/jobs/:jobId/team-members", requireAuth, async (req, res) => {
    try {
      const job = await storage.getJob(req.params.jobId);
      if (!job) {
        return res.status(404).json({ error: "Job not found" });
      }

      const teamMembers: Array<{ id: string; username: string; avatar: string | null }> = [];

      // Add lead freelancer
      if (job.freelancerId) {
        const lead = await storage.getUser(job.freelancerId);
        if (lead) {
          teamMembers.push({ id: lead.id, username: lead.username, avatar: lead.avatar });
        }
      }

      // Add collaborators
      if (job.collaborators) {
        for (const collabId of job.collaborators) {
          if (!teamMembers.find(tm => tm.id === collabId)) {
            const collab = await storage.getUser(collabId);
            if (collab) {
              teamMembers.push({ id: collab.id, username: collab.username, avatar: collab.avatar });
            }
          }
        }
      }

      // Add from jobFreelancers table (multi-freelancer assignments)
      const jobFreelancers = await storage.getJobFreelancers(req.params.jobId);
      for (const jf of jobFreelancers) {
        if (!teamMembers.find(tm => tm.id === jf.freelancerId)) {
          const fl = await storage.getUser(jf.freelancerId);
          if (fl) {
            teamMembers.push({ id: fl.id, username: fl.username, avatar: fl.avatar });
          }
        }
      }

      res.json(teamMembers);
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

      // Verify user is part of the job (freelancer, collaborator, team member, or customer)
      const userId = req.session.userId!;
      const isCustomer = job.customerId === userId;
      const isFreelancer = job.freelancerId === userId;
      const isCollaborator = job.collaborators?.includes(userId);
      
      // Also check jobFreelancers table for multi-freelancer team members
      const jobFreelancerRecords = await storage.getJobFreelancers(req.params.jobId);
      const isTeamMember = jobFreelancerRecords.some(jf => jf.freelancerId === userId);

      if (!isCustomer && !isFreelancer && !isCollaborator && !isTeamMember) {
        return res.status(403).json({ error: "Access denied" });
      }

      // Get the partner ID from query param (for 1-on-1 private chats)
      const partnerId = req.query.partnerId as string | undefined;
      
      const allMessages = await storage.getChatMessages(req.params.jobId);
      
      // Filter to only show messages between current user and their chat partner
      let messages = allMessages;
      if (partnerId) {
        // Show only messages between userId and partnerId
        messages = allMessages.filter(
          (msg) =>
            (msg.senderId === userId && msg.receiverId === partnerId) ||
            (msg.senderId === partnerId && msg.receiverId === userId)
        );
      } else {
        // If no partner specified, show messages where current user is sender or receiver
        messages = allMessages.filter(
          (msg) => msg.senderId === userId || msg.receiverId === userId
        );
      }
      
      // Mark messages as read for current user
      await storage.markChatMessagesAsRead(req.params.jobId, userId);

      // Enrich messages with sender info
      const enrichedMessages = await Promise.all(
        messages.map(async (msg) => {
          const sender = await storage.getUser(msg.senderId);
          return {
            ...msg,
            senderUsername: sender?.username || "Unknown",
            senderAvatar: sender?.avatar || null,
            senderRole: sender?.role || null,
          };
        })
      );

      res.json(enrichedMessages);
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
      const { message, receiverId: specifiedReceiverId } = req.body;

      if (!message || typeof message !== 'string' || message.trim().length === 0) {
        return res.status(400).json({ error: "Message is required" });
      }

      // Verify user is part of the job (including team members from jobFreelancers)
      const isCustomer = job.customerId === userId;
      const isFreelancer = job.freelancerId === userId;
      const isCollaborator = job.collaborators?.includes(userId);
      
      // Also check jobFreelancers table for multi-freelancer team members
      const jobFreelancerRecords = await storage.getJobFreelancers(req.params.jobId);
      const isTeamMember = jobFreelancerRecords.some(jf => jf.freelancerId === userId);

      if (!isCustomer && !isFreelancer && !isCollaborator && !isTeamMember) {
        return res.status(403).json({ error: "Access denied" });
      }

      // Determine receiver - use specified receiverId if provided, otherwise default logic
      let receiverId: string;
      if (specifiedReceiverId) {
        receiverId = specifiedReceiverId;
      } else {
        // Default: customer sends to lead freelancer, freelancer sends to customer
        receiverId = isCustomer ? job.freelancerId! : job.customerId;
      }

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
        sourceType: "job",
        sourceId: job.id,
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

  app.delete("/api/notifications/:id", requireAuth, async (req, res) => {
    try {
      await storage.deleteNotification(req.params.id);
      res.json({ success: true });
    } catch (error) {
      res.status(500).json({ error: "Internal server error" });
    }
  });

  // === USER PREFERENCES ROUTES ===

  app.get("/api/settings", requireAuth, async (req, res) => {
    try {
      let prefs = await storage.getUserPreferences(req.session.userId!);
      if (!prefs) {
        prefs = await storage.createUserPreferences({ userId: req.session.userId! });
      }
      res.json(prefs);
    } catch (error) {
      res.status(500).json({ error: "Internal server error" });
    }
  });

  app.put("/api/settings", requireAuth, async (req, res) => {
    try {
      const updates = req.body;
      let prefs = await storage.getUserPreferences(req.session.userId!);
      if (!prefs) {
        prefs = await storage.createUserPreferences({ userId: req.session.userId!, ...updates });
      } else {
        prefs = await storage.updateUserPreferences(req.session.userId!, updates);
      }
      res.json(prefs);
    } catch (error) {
      res.status(500).json({ error: "Internal server error" });
    }
  });

  app.post("/api/settings/deactivate-account", requireAuth, async (req, res) => {
    try {
      const prefs = await storage.updateUserPreferences(req.session.userId!, {
        accountDeactivated: true,
        deactivatedAt: new Date(),
      });
      req.session.destroy((err) => {
        if (err) {
          return res.status(500).json({ error: "Failed to log out" });
        }
        res.json({ success: true, message: "Account deactivated" });
      });
    } catch (error) {
      res.status(500).json({ error: "Internal server error" });
    }
  });

  app.get("/api/settings/download-data", requireAuth, async (req, res) => {
    try {
      const user = await storage.getUser(req.session.userId!);
      const wallet = await storage.getWallet(req.session.userId!);
      const jobs = await storage.getJobs({ freelancerId: req.session.userId });
      const notifications = await storage.getNotifications(req.session.userId!);
      const prefs = await storage.getUserPreferences(req.session.userId!);
      
      const userData = {
        user: user ? { ...user } : null,
        wallet,
        jobs,
        notifications,
        preferences: prefs,
        exportedAt: new Date().toISOString(),
      };
      
      res.setHeader('Content-Type', 'application/json');
      res.setHeader('Content-Disposition', `attachment; filename="linxora-data-${req.session.userId}.json"`);
      res.json(userData);
    } catch (error) {
      res.status(500).json({ error: "Internal server error" });
    }
  });

  // User search for job invitations (search freelancers by name)
  app.get("/api/users/search-freelancers", requireAuth, async (req, res) => {
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

  // === CUSTOMER BLACKLIST ROUTES ===

  // Get customer's blacklist
  app.get("/api/blacklist", requireAuth, async (req, res) => {
    try {
      const user = await storage.getUser(req.session.userId!);
      if (!user || user.role !== "customer") {
        return res.status(403).json({ error: "Only customers can manage blacklists" });
      }

      const blacklistedIds = user.blacklistedFreelancers || [];
      
      // Enrich with freelancer details
      const blacklistedUsers = await Promise.all(
        blacklistedIds.map(async (freelancerId: string) => {
          const freelancer = await storage.getUser(freelancerId);
          return freelancer ? {
            id: freelancer.id,
            userId: freelancer.userId,
            username: freelancer.username,
            avatar: freelancer.avatar,
            level: freelancer.level,
            rating: freelancer.rating,
          } : null;
        })
      );

      res.json(blacklistedUsers.filter(Boolean));
    } catch (error) {
      res.status(500).json({ error: "Internal server error" });
    }
  });

  // Add freelancer to blacklist
  app.post("/api/blacklist/:freelancerId", requireAuth, async (req, res) => {
    try {
      const user = await storage.getUser(req.session.userId!);
      if (!user || user.role !== "customer") {
        return res.status(403).json({ error: "Only customers can manage blacklists" });
      }

      const freelancer = await storage.getUser(req.params.freelancerId);
      if (!freelancer) {
        return res.status(404).json({ error: "Freelancer not found" });
      }
      if (freelancer.role !== "freelancer") {
        return res.status(400).json({ error: "Can only blacklist freelancers" });
      }

      const currentBlacklist = user.blacklistedFreelancers || [];
      if (currentBlacklist.includes(req.params.freelancerId)) {
        return res.status(400).json({ error: "Freelancer is already blacklisted" });
      }

      await storage.updateUser(req.session.userId!, {
        blacklistedFreelancers: [...currentBlacklist, req.params.freelancerId],
      });

      res.json({ success: true, message: `${freelancer.username} has been blacklisted` });
    } catch (error) {
      res.status(500).json({ error: "Internal server error" });
    }
  });

  // Remove freelancer from blacklist
  app.delete("/api/blacklist/:freelancerId", requireAuth, async (req, res) => {
    try {
      const user = await storage.getUser(req.session.userId!);
      if (!user || user.role !== "customer") {
        return res.status(403).json({ error: "Only customers can manage blacklists" });
      }

      const currentBlacklist = user.blacklistedFreelancers || [];
      if (!currentBlacklist.includes(req.params.freelancerId)) {
        return res.status(400).json({ error: "Freelancer is not in your blacklist" });
      }

      await storage.updateUser(req.session.userId!, {
        blacklistedFreelancers: currentBlacklist.filter((id: string) => id !== req.params.freelancerId),
      });

      res.json({ success: true, message: "Freelancer has been removed from blacklist" });
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
  app.get("/api/role-upgrade-requests/pending", requireRole("moderator", "head_of_moderation", "founder"), async (req, res) => {
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
          sourceType: "user",
          sourceId: user.id,
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

  // Approve or reject a role upgrade request
  // Moderators can only approve customer-to-freelancer upgrades
  // Founder/Head of Moderation can approve all upgrades including freelancer-to-moderator
  app.patch("/api/role-upgrade-requests/:id", requireRole("moderator", "head_of_moderation", "founder"), async (req, res) => {
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

      // Check if this is a freelancer-to-moderator upgrade
      // Only Founder and Head of Moderation can approve these
      if (request.upgradeType === RoleUpgradeType.FREELANCER_TO_MODERATOR) {
        const reviewer = await storage.getUser(req.session.userId!);
        if (!reviewer || (reviewer.role !== UserRole.FOUNDER && reviewer.role !== UserRole.HEAD_OF_MODERATION)) {
          return res.status(403).json({ 
            error: "Only the Founder or Head of Moderation can approve moderator promotions" 
          });
        }
      }

      // Update the request
      const updatedRequest = await storage.updateRoleUpgradeRequest(id, {
        status,
        reviewerId: req.session.userId,
        reviewNotes: reviewNotes || null,
      });

      // If approved, update the user's role
      if (status === "approved") {
        // Role upgrade can only result in FREELANCER or MODERATOR
        // NEVER Founder or Head of Moderation (those are assigned differently)
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
          sourceType: "user",
          sourceId: request.userId,
        });
      } else {
        // Notify the user of rejection
        await storage.createNotification({
          userId: request.userId,
          type: "role_upgrade",
          title: "Role Upgrade Request Declined",
          message: `Your role upgrade request was declined. ${reviewNotes ? `Reason: ${reviewNotes}` : 'Please contact support for more information.'}`,
          relatedId: request.id,
          sourceType: "user",
          sourceId: request.userId,
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

      // Check for suspicious/inappropriate content (using "report" context to allow words like "scam")
      const filterResult = filterContent(contentToCheck, "report");
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
          sourceType: "system",
          sourceId: report.id,
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

  app.get("/api/reports", requireRole("moderator", "head_of_moderation", "founder"), async (req, res) => {
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

  app.get("/api/reports/pending", requireRole("moderator", "head_of_moderation", "founder"), async (req, res) => {
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

  app.patch("/api/reports/:id", requireRole("moderator", "head_of_moderation", "founder"), async (req, res) => {
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
        sourceType: "system",
        sourceId: report.id,
      });

      res.json(updatedReport);
    } catch (error) {
      res.status(500).json({ error: "Internal server error" });
    }
  });

  // Moderator Task routes
  app.get("/api/moderator-tasks", requireRole("moderator", "head_of_moderation", "founder"), async (req, res) => {
    try {
      const tasks = await storage.getModeratorTasks(req.session.userId!);
      res.json(tasks);
    } catch (error) {
      res.status(500).json({ error: "Internal server error" });
    }
  });

  app.get("/api/moderator-tasks/assigned-by-me", requireRole("head_of_moderation", "founder"), async (req, res) => {
    try {
      const tasks = await storage.getModeratorTasksAssignedBy(req.session.userId!);
      res.json(tasks);
    } catch (error) {
      res.status(500).json({ error: "Internal server error" });
    }
  });

  app.post("/api/moderator-tasks", requireRole("head_of_moderation", "founder"), async (req, res) => {
    try {
      const validationResult = insertModeratorTaskSchema.safeParse({
        ...req.body,
        assignedById: req.session.userId!,
      });

      if (!validationResult.success) {
        return res.status(400).json({ 
          error: "Validation failed", 
          details: validationResult.error.errors 
        });
      }

      const { title, description, assigneeId, taskType, teamMembers, priority, dueDate } = validationResult.data;

      const assignee = await storage.getUser(assigneeId);
      if (!assignee || (assignee.role !== "moderator" && assignee.role !== "head_of_moderation")) {
        return res.status(400).json({ error: "Assignee must be a moderator" });
      }

      const task = await storage.createModeratorTask({
        title,
        description,
        assignedById: req.session.userId!,
        assigneeId,
        taskType: taskType || "personal",
        teamMembers: teamMembers || null,
        priority: priority || "medium",
        dueDate: dueDate ? new Date(dueDate) : null,
      });

      // Notify the assignee
      await storage.createNotification({
        userId: assigneeId,
        type: "system",
        title: "New Task Assigned",
        message: `You have been assigned a new ${taskType === "team" ? "team" : "personal"} task: ${title}`,
        relatedId: task.id,
        sourceType: "system",
        sourceId: task.id,
      });

      res.status(201).json(task);
    } catch (error) {
      res.status(500).json({ error: "Internal server error" });
    }
  });

  app.patch("/api/moderator-tasks/:id", requireRole("moderator", "head_of_moderation", "founder"), async (req, res) => {
    try {
      const { id } = req.params;
      const { status, title, description, priority } = req.body;

      // Validate status if provided
      const validStatuses = [ModeratorTaskStatus.PENDING, ModeratorTaskStatus.IN_PROGRESS, ModeratorTaskStatus.COMPLETED];
      if (status && !validStatuses.includes(status)) {
        return res.status(400).json({ error: "Invalid status. Must be one of: pending, in_progress, completed" });
      }

      // Validate priority if provided
      const validPriorities = ["low", "medium", "high"];
      if (priority && !validPriorities.includes(priority)) {
        return res.status(400).json({ error: "Invalid priority. Must be one of: low, medium, high" });
      }

      const task = await storage.getModeratorTask(id);
      if (!task) {
        return res.status(404).json({ error: "Task not found" });
      }

      // Only assignee or assigner can update
      const userId = req.session.userId!;
      const isAssignee = task.assigneeId === userId || (task.teamMembers && task.teamMembers.includes(userId));
      const isAssigner = task.assignedById === userId;
      
      if (!isAssignee && !isAssigner) {
        return res.status(403).json({ error: "Not authorized to update this task" });
      }

      const updates: any = {};
      if (status) {
        updates.status = status;
        if (status === ModeratorTaskStatus.COMPLETED) {
          updates.completedAt = new Date();
        } else {
          // Clear completedAt if reverting from completed status
          updates.completedAt = null;
        }
      }
      if (title !== undefined && isAssigner) {
        if (typeof title !== "string" || title.trim().length === 0 || title.length > 200) {
          return res.status(400).json({ error: "Title must be a non-empty string (max 200 characters)" });
        }
        updates.title = title.trim();
      }
      if (description !== undefined && isAssigner) {
        if (description !== null && (typeof description !== "string" || description.length > 1000)) {
          return res.status(400).json({ error: "Description must be a string (max 1000 characters)" });
        }
        updates.description = description;
      }
      if (priority && isAssigner) updates.priority = priority;

      const updatedTask = await storage.updateModeratorTask(id, updates);
      res.json(updatedTask);
    } catch (error) {
      res.status(500).json({ error: "Internal server error" });
    }
  });

  // Moderator Meeting routes - scheduled by Head of Moderation or Founder
  app.get("/api/moderator-meetings", requireRole("moderator", "head_of_moderation", "founder"), async (req, res) => {
    try {
      const userId = req.session.userId!;
      // Get meetings user is invited to
      const invitedMeetings = await storage.getModeratorMeetings(userId);
      // Also get meetings user scheduled (for HoM/Founder to see their own meetings)
      const scheduledMeetings = await storage.getModeratorMeetingsScheduledBy(userId);
      
      // Combine and deduplicate
      const meetingMap = new Map<string, any>();
      [...invitedMeetings, ...scheduledMeetings].forEach(m => meetingMap.set(m.id, m));
      const allMeetings = Array.from(meetingMap.values()).sort(
        (a, b) => new Date(b.scheduledDate).getTime() - new Date(a.scheduledDate).getTime()
      );
      
      res.json(allMeetings);
    } catch (error) {
      res.status(500).json({ error: "Internal server error" });
    }
  });

  app.get("/api/moderator-meetings/scheduled-by-me", requireRole("head_of_moderation", "founder"), async (req, res) => {
    try {
      const meetings = await storage.getModeratorMeetingsScheduledBy(req.session.userId!);
      res.json(meetings);
    } catch (error) {
      res.status(500).json({ error: "Internal server error" });
    }
  });

  app.get("/api/moderator-meetings/:id", requireRole("moderator", "head_of_moderation", "founder"), async (req, res) => {
    try {
      const meeting = await storage.getModeratorMeeting(req.params.id);
      if (!meeting) {
        return res.status(404).json({ error: "Meeting not found" });
      }
      res.json(meeting);
    } catch (error) {
      res.status(500).json({ error: "Internal server error" });
    }
  });

  app.get("/api/moderator-meetings/:id/rsvps", requireRole("moderator", "head_of_moderation", "founder"), async (req, res) => {
    try {
      const meeting = await storage.getModeratorMeeting(req.params.id);
      if (!meeting) {
        return res.status(404).json({ error: "Meeting not found" });
      }
      
      const rsvps = await storage.getMeetingRsvps(req.params.id);
      
      // Enrich with user data
      const enrichedRsvps = await Promise.all(
        rsvps.map(async (rsvp) => {
          const user = await storage.getUser(rsvp.moderatorId);
          return { ...rsvp, moderator: user };
        })
      );
      
      res.json(enrichedRsvps);
    } catch (error) {
      res.status(500).json({ error: "Internal server error" });
    }
  });

  app.post("/api/moderator-meetings", requireRole("head_of_moderation", "founder"), async (req, res) => {
    try {
      const { title, description, scheduledDate, duration, isTeamMeeting, invitedModeratorIds } = req.body;

      // Validate required fields
      if (!title || typeof title !== "string" || title.trim().length === 0) {
        return res.status(400).json({ error: "Title is required" });
      }
      if (title.length > 200) {
        return res.status(400).json({ error: "Title must be 200 characters or less" });
      }
      if (!scheduledDate) {
        return res.status(400).json({ error: "Scheduled date is required" });
      }

      const parsedDate = new Date(scheduledDate);
      if (isNaN(parsedDate.getTime())) {
        return res.status(400).json({ error: "Invalid scheduled date" });
      }

      // Validate date is within allowed range (today to 6 months from now)
      const now = new Date();
      const sixMonthsFromNow = new Date();
      sixMonthsFromNow.setMonth(sixMonthsFromNow.getMonth() + 6);
      
      if (parsedDate < now) {
        return res.status(400).json({ error: "Meeting date cannot be in the past" });
      }
      if (parsedDate > sixMonthsFromNow) {
        return res.status(400).json({ error: "Meeting date cannot be more than 6 months in the future" });
      }

      // Validate duration if provided
      if (duration !== undefined) {
        const durationNum = Number(duration);
        if (isNaN(durationNum) || durationNum < 15 || durationNum > 480) {
          return res.status(400).json({ error: "Duration must be between 15 and 480 minutes" });
        }
      }

      // If it's a team meeting, get all moderators
      let moderatorsToInvite: string[] = [];
      if (isTeamMeeting) {
        const users = await storage.getUsers();
        moderatorsToInvite = users
          .filter(u => u.role === UserRole.MODERATOR || u.role === UserRole.HEAD_OF_MODERATION)
          .map(u => u.id);
      } else if (invitedModeratorIds && Array.isArray(invitedModeratorIds)) {
        // Validate that all invited users exist and are moderators
        for (const id of invitedModeratorIds) {
          const user = await storage.getUser(id);
          if (!user) {
            return res.status(400).json({ error: `User with ID ${id} not found` });
          }
          if (user.role !== UserRole.MODERATOR && user.role !== UserRole.HEAD_OF_MODERATION) {
            return res.status(400).json({ error: `User ${user.username} is not a moderator` });
          }
        }
        moderatorsToInvite = invitedModeratorIds;
      } else {
        return res.status(400).json({ error: "Must specify invited moderators or mark as team meeting" });
      }

      const meeting = await storage.createModeratorMeeting({
        title: title.trim(),
        description: description?.trim() || null,
        scheduledById: req.session.userId!,
        scheduledDate: parsedDate,
        duration: duration || 60,
        isTeamMeeting: isTeamMeeting || false,
        invitedModeratorIds: moderatorsToInvite,
      });

      // Create RSVPs for all invited moderators
      for (const moderatorId of moderatorsToInvite) {
        await storage.createMeetingRsvp({
          meetingId: meeting.id,
          moderatorId,
          status: MeetingRsvpStatus.PENDING,
        });

        // Notify each moderator
        await storage.createNotification({
          userId: moderatorId,
          type: "system",
          title: "Meeting Scheduled",
          message: `You have been invited to a meeting: ${title}`,
          relatedId: meeting.id,
          sourceType: "system",
          sourceId: meeting.id,
        });
      }

      res.status(201).json(meeting);
    } catch (error) {
      console.error("Error creating meeting:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  app.post("/api/moderator-meetings/:id/rsvp", requireRole("moderator", "head_of_moderation", "founder"), async (req, res) => {
    try {
      const { id } = req.params;
      const { status } = req.body;
      const userId = req.session.userId!;

      // Validate status
      const validStatuses = [MeetingRsvpStatus.ACCEPTED, MeetingRsvpStatus.DECLINED];
      if (!validStatuses.includes(status)) {
        return res.status(400).json({ error: "Status must be 'accepted' or 'declined'" });
      }

      const meeting = await storage.getModeratorMeeting(id);
      if (!meeting) {
        return res.status(404).json({ error: "Meeting not found" });
      }

      // Check if user is invited
      const isInvited = meeting.isTeamMeeting || meeting.invitedModeratorIds?.includes(userId);
      if (!isInvited) {
        return res.status(403).json({ error: "You are not invited to this meeting" });
      }

      // Find or create RSVP
      let rsvp = await storage.getMeetingRsvpByModerator(id, userId);
      if (!rsvp) {
        rsvp = await storage.createMeetingRsvp({
          meetingId: id,
          moderatorId: userId,
          status,
        });
      } else {
        rsvp = await storage.updateMeetingRsvp(rsvp.id, {
          status,
          respondedAt: new Date(),
        });
      }

      // Notify the scheduler of the response
      const user = await storage.getUser(userId);
      await storage.createNotification({
        userId: meeting.scheduledById,
        type: "system",
        title: "Meeting RSVP",
        message: `${user?.username || "A moderator"} has ${status} the meeting: ${meeting.title}`,
        relatedId: meeting.id,
        sourceType: "system",
        sourceId: meeting.id,
      });

      res.json(rsvp);
    } catch (error) {
      console.error("Error responding to meeting:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  app.patch("/api/moderator-meetings/:id", requireRole("head_of_moderation", "founder"), async (req, res) => {
    try {
      const { id } = req.params;
      const { title, description, scheduledDate, duration } = req.body;

      const meeting = await storage.getModeratorMeeting(id);
      if (!meeting) {
        return res.status(404).json({ error: "Meeting not found" });
      }

      // Only the scheduler can update
      if (meeting.scheduledById !== req.session.userId) {
        return res.status(403).json({ error: "Only the meeting scheduler can update it" });
      }

      const updates: any = {};
      if (title !== undefined) {
        if (typeof title !== "string" || title.trim().length === 0 || title.length > 200) {
          return res.status(400).json({ error: "Title must be a non-empty string (max 200 characters)" });
        }
        updates.title = title.trim();
      }
      if (description !== undefined) {
        updates.description = description?.trim() || null;
      }
      if (scheduledDate !== undefined) {
        const parsedDate = new Date(scheduledDate);
        if (isNaN(parsedDate.getTime())) {
          return res.status(400).json({ error: "Invalid scheduled date" });
        }
        updates.scheduledDate = parsedDate;
      }
      if (duration !== undefined) {
        const durationNum = Number(duration);
        if (isNaN(durationNum) || durationNum < 15 || durationNum > 480) {
          return res.status(400).json({ error: "Duration must be between 15 and 480 minutes" });
        }
        updates.duration = durationNum;
      }

      const updatedMeeting = await storage.updateModeratorMeeting(id, updates);
      res.json(updatedMeeting);
    } catch (error) {
      res.status(500).json({ error: "Internal server error" });
    }
  });

  // Meeting Exemption routes - moderators can request exemption from required meetings
  app.get("/api/meeting-exemptions", requireRole("moderator", "head_of_moderation", "founder"), async (req, res) => {
    try {
      const user = await storage.getUser(req.session.userId!);
      if (!user) {
        return res.status(401).json({ error: "User not found" });
      }

      // HoM/Founder can see all pending exemptions, moderators see only their own
      if (user.role === UserRole.HEAD_OF_MODERATION || user.role === UserRole.FOUNDER) {
        const exemptions = await storage.getPendingMeetingExemptions();
        // Enrich with user and meeting data
        const enrichedExemptions = await Promise.all(
          exemptions.map(async (e) => {
            const moderator = await storage.getUser(e.moderatorId);
            const meeting = await storage.getModeratorMeeting(e.meetingId);
            return { ...e, moderator, meeting };
          })
        );
        res.json(enrichedExemptions);
      } else {
        const exemptions = await storage.getMeetingExemptionsByModerator(req.session.userId!);
        const enrichedExemptions = await Promise.all(
          exemptions.map(async (e) => {
            const meeting = await storage.getModeratorMeeting(e.meetingId);
            return { ...e, meeting };
          })
        );
        res.json(enrichedExemptions);
      }
    } catch (error) {
      res.status(500).json({ error: "Internal server error" });
    }
  });

  app.post("/api/meeting-exemptions", requireRole("moderator"), async (req, res) => {
    try {
      const { meetingId, reason } = req.body;
      const userId = req.session.userId!;

      if (!meetingId || !reason) {
        return res.status(400).json({ error: "Meeting ID and reason are required" });
      }

      if (typeof reason !== "string" || reason.trim().length < 10 || reason.length > 500) {
        return res.status(400).json({ error: "Reason must be between 10 and 500 characters" });
      }

      // Verify meeting exists
      const meeting = await storage.getModeratorMeeting(meetingId);
      if (!meeting) {
        return res.status(404).json({ error: "Meeting not found" });
      }

      // Check if user is invited to this meeting
      const isInvited = meeting.isTeamMeeting || meeting.invitedModeratorIds?.includes(userId);
      if (!isInvited) {
        return res.status(403).json({ error: "You are not invited to this meeting" });
      }

      // Check for existing pending exemption
      const existingExemptions = await storage.getMeetingExemptionsByModerator(userId);
      const hasPending = existingExemptions.some(
        e => e.meetingId === meetingId && e.status === "pending"
      );
      if (hasPending) {
        return res.status(400).json({ error: "You already have a pending exemption request for this meeting" });
      }

      const exemption = await storage.createMeetingExemption({
        meetingId,
        moderatorId: userId,
        reason: reason.trim(),
      });

      // Notify HoM/Founder
      const users = await storage.getUsers();
      const admins = users.filter(u => 
        u.role === UserRole.HEAD_OF_MODERATION || u.role === UserRole.FOUNDER
      );
      const requester = await storage.getUser(userId);
      for (const admin of admins) {
        await storage.createNotification({
          userId: admin.id,
          type: "system",
          title: "Meeting Exemption Request",
          message: `${requester?.username || "A moderator"} has requested an exemption from "${meeting.title}"`,
          relatedId: exemption.id,
          sourceType: "system",
          sourceId: exemption.id,
        });
      }

      res.status(201).json(exemption);
    } catch (error) {
      console.error("Error creating exemption:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  app.post("/api/meeting-exemptions/:id/respond", requireRole("head_of_moderation", "founder"), async (req, res) => {
    try {
      const { id } = req.params;
      const { approved, note } = req.body;
      const userId = req.session.userId!;

      if (typeof approved !== "boolean") {
        return res.status(400).json({ error: "Approved must be true or false" });
      }

      const exemption = await storage.getMeetingExemption(id);
      if (!exemption) {
        return res.status(404).json({ error: "Exemption request not found" });
      }

      if (exemption.status !== "pending") {
        return res.status(400).json({ error: "This exemption request has already been reviewed" });
      }

      const updatedExemption = await storage.updateMeetingExemption(id, {
        status: approved ? "approved" : "denied",
        reviewedById: userId,
        reviewNote: note?.trim() || null,
        reviewedAt: new Date(),
      });

      // Notify the moderator
      const meeting = await storage.getModeratorMeeting(exemption.meetingId);
      await storage.createNotification({
        userId: exemption.moderatorId,
        type: "system",
        title: approved ? "Exemption Approved" : "Exemption Denied",
        message: approved
          ? `Your exemption request for "${meeting?.title || "a meeting"}" has been approved`
          : `Your exemption request for "${meeting?.title || "a meeting"}" has been denied${note ? `: ${note}` : ""}`,
        relatedId: exemption.id,
        sourceType: "system",
        sourceId: exemption.id,
      });

      res.json(updatedExemption);
    } catch (error) {
      res.status(500).json({ error: "Internal server error" });
    }
  });

  // Founder-only routes for managing Head of Moderation
  app.get("/api/admin/heads-of-moderation", requireRole("founder"), async (req, res) => {
    try {
      const users = await storage.getUsers();
      const headsOfModeration = users.filter(u => u.role === UserRole.HEAD_OF_MODERATION);
      res.json(headsOfModeration);
    } catch (error) {
      res.status(500).json({ error: "Internal server error" });
    }
  });

  app.post("/api/admin/assign-head-of-moderation/:userId", requireRole("founder"), async (req, res) => {
    try {
      const { userId } = req.params;
      
      // Get current heads of moderation count
      const users = await storage.getUsers();
      const headsOfModeration = users.filter(u => u.role === UserRole.HEAD_OF_MODERATION);
      
      if (headsOfModeration.length >= 3) {
        return res.status(400).json({ 
          error: "Maximum of 3 Heads of Moderation allowed. Remove one before assigning another." 
        });
      }
      
      const targetUser = await storage.getUser(userId);
      if (!targetUser) {
        return res.status(404).json({ error: "User not found" });
      }
      
      if (targetUser.role === UserRole.FOUNDER) {
        return res.status(400).json({ error: "Cannot change the Founder's role" });
      }
      
      if (targetUser.role === UserRole.HEAD_OF_MODERATION) {
        return res.status(400).json({ error: "User is already a Head of Moderation" });
      }
      
      // Must be at least a moderator to be promoted
      if (targetUser.role !== UserRole.MODERATOR) {
        return res.status(400).json({ error: "Only moderators can be promoted to Head of Moderation" });
      }
      
      await storage.updateUser(userId, { role: UserRole.HEAD_OF_MODERATION });
      
      // Notify the user
      await storage.createNotification({
        userId,
        type: "role_upgrade",
        title: "Promoted to Head of Moderation",
        message: "Congratulations! You have been promoted to Head of Moderation by the Founder.",
        relatedId: userId,
        sourceType: "user",
        sourceId: userId,
      });
      
      const updatedUser = await storage.getUser(userId);
      res.json(updatedUser);
    } catch (error) {
      res.status(500).json({ error: "Internal server error" });
    }
  });

  app.post("/api/admin/remove-head-of-moderation/:userId", requireRole("founder"), async (req, res) => {
    try {
      const { userId } = req.params;
      
      const targetUser = await storage.getUser(userId);
      if (!targetUser) {
        return res.status(404).json({ error: "User not found" });
      }
      
      if (targetUser.role !== UserRole.HEAD_OF_MODERATION) {
        return res.status(400).json({ error: "User is not a Head of Moderation" });
      }
      
      // Demote back to moderator
      await storage.updateUser(userId, { role: UserRole.MODERATOR });
      
      // Notify the user
      await storage.createNotification({
        userId,
        type: "role_upgrade",
        title: "Role Changed",
        message: "Your role has been changed from Head of Moderation to Moderator by the Founder.",
        relatedId: userId,
        sourceType: "user",
        sourceId: userId,
      });
      
      const updatedUser = await storage.getUser(userId);
      res.json(updatedUser);
    } catch (error) {
      res.status(500).json({ error: "Internal server error" });
    }
  });

  // Get all moderators (for Founder and Head of Moderation to manage team)
  app.get("/api/admin/moderators", requireRole("head_of_moderation", "founder"), async (req, res) => {
    try {
      const users = await storage.getUsers();
      const moderators = users.filter(u => 
        u.role === UserRole.MODERATOR || u.role === UserRole.HEAD_OF_MODERATION
      );
      res.json(moderators);
    } catch (error) {
      res.status(500).json({ error: "Internal server error" });
    }
  });

  // ============ PUBLIC PROFILE API ============

  // Helper function to calculate user status
  async function calculateUserStatus(user: any) {
    const now = new Date();
    const lastActive = user.lastActive ? new Date(user.lastActive) : new Date(user.createdAt);
    const timeSinceActive = now.getTime() - lastActive.getTime();
    const oneMonth = 30 * 24 * 60 * 60 * 1000; // 30 days in ms
    const fiveMinutes = 5 * 60 * 1000; // 5 minutes in ms
    
    // Online status: active within last 5 minutes
    const isOnline = timeSinceActive < fiveMinutes;
    const onlineStatus = isOnline ? "online" : "offline";
    
    // Inactive: no activity for over a month (applies to all roles)
    if (timeSinceActive > oneMonth) {
      return { 
        onlineStatus: "offline", 
        workStatus: "inactive",
        displayStatus: "Inactive"
      };
    }
    
    // For non-freelancers, just return online/offline status
    if (user.role !== "freelancer") {
      return { 
        onlineStatus, 
        workStatus: null,
        displayStatus: isOnline ? "Online" : "Offline"
      };
    }
    
    // Freelancer-specific status calculation
    const jobs = await storage.getJobs();
    
    // Active job statuses include all states where work is ongoing or pending review
    const activeJobStatuses = [
      "in_progress", 
      "awaiting_customer", 
      "pending_acceptance",
      "submitted",
      "claimed",
      "dispute"
    ];
    
    // Check if currently has an active job
    const activeJobs = jobs.filter(j => 
      (j.freelancerId === user.id || j.collaborators?.includes(user.id)) &&
      activeJobStatuses.includes(j.status)
    );
    
    // Also check jobFreelancers table for team assignments (only accepted status)
    const freelancerAssignments = await storage.getJobFreelancersByFreelancer(user.id);
    const assignedActiveJobs = freelancerAssignments.filter(jf => {
      // Only count if freelancer is still active on the job (status = accepted)
      if (jf.status && jf.status !== "accepted") return false;
      const job = jobs.find(j => j.id === jf.jobId);
      return job && activeJobStatuses.includes(job.status);
    });
    
    const hasActiveJob = activeJobs.length > 0 || assignedActiveJobs.length > 0;
    
    // Check if on PTO
    const ptoRequests = await storage.getPTORequests(user.id);
    const onPTO = ptoRequests.some(pto => {
      if (pto.status !== "approved") return false;
      const startDate = new Date(pto.startDate);
      const endDate = new Date(pto.endDate);
      startDate.setHours(0, 0, 0, 0);
      endDate.setHours(23, 59, 59, 999);
      return now >= startDate && now <= endDate;
    });
    
    // Check if outside working hours
    let outsideWorkingHours = false;
    const workingHours = user.workingHours as any;
    if (workingHours && Object.keys(workingHours).length > 0) {
      const dayNames = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"];
      const currentDay = dayNames[now.getDay()];
      const daySchedule = workingHours[currentDay];
      
      if (daySchedule && daySchedule.start && daySchedule.end) {
        const currentTime = now.getHours() * 60 + now.getMinutes();
        const [startHour, startMin] = daySchedule.start.split(":").map(Number);
        const [endHour, endMin] = daySchedule.end.split(":").map(Number);
        const startTime = startHour * 60 + startMin;
        const endTime = endHour * 60 + endMin;
        
        outsideWorkingHours = currentTime < startTime || currentTime > endTime;
      }
    }
    
    // Determine freelancer work status
    let workStatus: string;
    if (hasActiveJob) {
      workStatus = "working";
    } else if (onPTO || outsideWorkingHours) {
      workStatus = "on-break";
    } else {
      workStatus = "unemployed";
    }
    
    return { 
      onlineStatus, 
      workStatus,
      displayStatus: isOnline ? "Online" : "Offline"
    };
  }

  // Get public profile of any user
  app.get("/api/users/:id/profile", requireAuth, async (req, res) => {
    try {
      const user = await storage.getUser(req.params.id);
      if (!user) {
        return res.status(404).json({ error: "User not found" });
      }

      // Calculate user status
      const status = await calculateUserStatus(user);

      // Return public profile info with safe defaults
      const ratingValue = parseFloat(user.rating?.toString() || "0");
      const safeRating = isNaN(ratingValue) ? 0 : ratingValue;
      
      const publicProfile: any = {
        id: user.id,
        userId: user.userId,
        username: user.username,
        avatar: user.avatar || null,
        role: user.role,
        level: user.level || 1,
        rating: safeRating > 0 ? safeRating.toFixed(1) : "N/A",
        ratingCount: user.totalRatings || 0,
        completedJobs: user.completedJobs || 0,
        createdAt: user.createdAt,
        specialization: user.specialization || null,
        bio: user.bio || null,
        status: status,
      };

      // For freelancers, include their completed job history
      if (user.role === "freelancer" || user.role === "moderator") {
        const jobs = await storage.getJobs();
        const completedJobsList = jobs.filter(
          j => j.freelancerId === user.id && j.status === "completed"
        ).slice(0, 10).map(j => ({
          id: j.id,
          title: j.title,
          category: j.category,
          completedAt: j.updatedAt,
        }));
        publicProfile.recentCompletedJobs = completedJobsList;
      }

      res.json(publicProfile);
    } catch (error) {
      res.status(500).json({ error: "Internal server error" });
    }
  });

  // Get customer statistics for job details page
  app.get("/api/users/:id/customer-stats", requireAuth, async (req, res) => {
    try {
      const user = await storage.getUser(req.params.id);
      if (!user) {
        return res.status(404).json({ error: "User not found" });
      }

      // Get all jobs posted by this customer
      const jobs = await storage.getJobs();
      const customerJobs = jobs.filter(j => j.customerId === req.params.id);
      
      const totalPostedJobs = customerJobs.length;
      const completedJobs = customerJobs.filter(j => 
        j.status === "completed" || j.status === "COMPLETED"
      ).length;
      const cancelledJobs = customerJobs.filter(j => 
        j.status === "cancelled" || j.status === "CANCELLED"
      ).length;
      const inProgressJobs = customerJobs.filter(j => 
        ["in_progress", "IN_PROGRESS", "awaiting_customer", "AWAITING_CUSTOMER", "submitted", "SUBMITTED"].includes(j.status)
      ).length;
      
      // Calculate credibility score (0-100)
      // Credibility starts at 100% and decreases based on cancellation rate
      // No cancellations = 100% credibility (trustworthy customer)
      let credibility = 100;
      if (totalPostedJobs > 0 && cancelledJobs > 0) {
        // Only reduce credibility if there are cancellations
        const cancellationRate = (cancelledJobs / totalPostedJobs) * 100;
        // Each cancellation reduces credibility significantly
        credibility = Math.max(0, 100 - (cancellationRate * 2));
      }
      // New customers or customers with no cancellations get 100% credibility

      res.json({
        totalPostedJobs,
        completedJobs,
        cancelledJobs,
        inProgressJobs,
        credibility: Math.round(credibility),
        memberSince: user.createdAt,
      });
    } catch (error) {
      res.status(500).json({ error: "Internal server error" });
    }
  });

  // Get freelancer recommendations
  app.get("/api/freelancers/recommendations", requireAuth, async (req, res) => {
    try {
      const currentUser = await storage.getUser(req.session.userId!);
      if (!currentUser) {
        return res.status(401).json({ error: "Unauthorized" });
      }

      const users = await storage.getUsers();
      
      // Get customer's blacklist if they are a customer
      const customerBlacklist = currentUser.role === "customer" 
        ? (currentUser.blacklistedFreelancers || []) 
        : [];
      
      const freelancers = users.filter(u => 
        u.role === "freelancer" && 
        u.id !== req.session.userId &&
        !customerBlacklist.includes(u.id) // Exclude blacklisted freelancers
      );

      // Score freelancers based on various factors
      const scoredFreelancers = freelancers.map(f => {
        let score = 0;
        
        // Rating bonus (up to 50 points) - safely parse rating
        const ratingValue = parseFloat(f.rating?.toString() || "0");
        const safeRating = isNaN(ratingValue) ? 0 : ratingValue;
        score += safeRating * 10;
        
        // Level bonus (up to 50 points)
        const level = f.level || 1;
        score += level * 5;
        
        // Completed jobs bonus (up to 30 points)
        const completedJobs = f.completedJobs || 0;
        score += Math.min(completedJobs * 2, 30);
        
        // Rating count bonus (more reviews = more trustworthy)
        const totalRatings = f.totalRatings || 0;
        score += Math.min(totalRatings * 2, 20);

        return {
          id: f.id,
          userId: f.userId,
          username: f.username,
          avatar: f.avatar,
          level: level,
          rating: safeRating > 0 ? safeRating.toFixed(1) : "N/A",
          ratingCount: totalRatings,
          completedJobs: completedJobs,
          specialization: f.specialization || null,
          score,
        };
      });

      // Sort by score and return top 10
      scoredFreelancers.sort((a, b) => b.score - a.score);
      res.json(scoredFreelancers.slice(0, 10));
    } catch (error) {
      res.status(500).json({ error: "Internal server error" });
    }
  });

  // ============ JOB RECOMMENDATIONS API ============

  // Create a job recommendation (Freelancer A recommends Freelancer B for a job)
  app.post("/api/recommendations", requireAuth, async (req, res) => {
    try {
      const recommender = await storage.getUser(req.session.userId!);
      if (!recommender) {
        return res.status(401).json({ error: "Unauthorized" });
      }

      // Only freelancers can recommend other freelancers
      if (recommender.role !== "freelancer") {
        return res.status(403).json({ error: "Only freelancers can recommend other freelancers" });
      }

      const { recommendedFreelancerId, jobId, customerMessage, freelancerMessage } = req.body;

      if (!recommendedFreelancerId || !jobId) {
        return res.status(400).json({ error: "Freelancer ID and Job ID are required" });
      }

      // Verify the recommended freelancer exists and is a freelancer
      const recommendedFreelancer = await storage.getUser(recommendedFreelancerId);
      if (!recommendedFreelancer || recommendedFreelancer.role !== "freelancer") {
        return res.status(404).json({ error: "Freelancer not found" });
      }

      // Can't recommend yourself
      if (recommendedFreelancerId === recommender.id) {
        return res.status(400).json({ error: "You cannot recommend yourself" });
      }

      // Verify the job exists and is in a working state
      const job = await storage.getJob(jobId);
      if (!job) {
        return res.status(404).json({ error: "Job not found" });
      }

      // Job must be in a working state (claimed, in_progress, or awaiting_customer)
      const validStatuses = ["claimed", "in_progress", "awaiting_customer"];
      if (!validStatuses.includes(job.status)) {
        return res.status(400).json({ error: "This job is not available for recommendations" });
      }

      // Verify the recommender is assigned to this job
      const freelancerAssignments = await storage.getJobFreelancersByFreelancer(recommender.id);
      const isAssignedViaTable = freelancerAssignments.some(jf => jf.jobId === jobId);
      if (job.freelancerId !== recommender.id && !isAssignedViaTable) {
        return res.status(403).json({ error: "You can only recommend for jobs you are working on" });
      }

      // Check if this recommendation already exists
      const existingRecs = await storage.getJobRecommendationsByRecommender(recommender.id);
      const alreadyRecommended = existingRecs.find(
        r => r.recommendedFreelancerId === recommendedFreelancerId && 
             r.jobId === jobId && 
             r.status === "pending"
      );
      if (alreadyRecommended) {
        return res.status(400).json({ error: "You have already recommended this freelancer for this job" });
      }

      // Create the recommendation
      const recommendation = await storage.createJobRecommendation({
        recommenderId: recommender.id,
        recommendedFreelancerId,
        jobId,
        customerId: job.customerId,
        recommenderMessage: customerMessage || null,
        freelancerMessage: freelancerMessage || null,
      });

      // Notify the customer
      await storage.createNotification({
        userId: job.customerId,
        type: "job_recommendation",
        title: "Freelancer Recommendation",
        message: `${recommender.username} recommends ${recommendedFreelancer.username} for your job: ${job.title}`,
        relatedId: recommendation.id,
        sourceType: "job",
        sourceId: job.id,
      });

      res.json({ success: true, recommendation });
    } catch (error) {
      console.error("Error creating recommendation:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  // Get recommendations for customer (incoming recommendations)
  app.get("/api/recommendations/customer", requireAuth, async (req, res) => {
    try {
      const user = await storage.getUser(req.session.userId!);
      if (!user) {
        return res.status(401).json({ error: "Unauthorized" });
      }

      if (user.role !== "customer") {
        return res.status(403).json({ error: "Only customers can view incoming recommendations" });
      }

      const recommendations = await storage.getJobRecommendationsByCustomer(user.id);

      // Enrich with user and job data
      const enriched = await Promise.all(recommendations.map(async (rec) => {
        const recommender = await storage.getUser(rec.recommenderId);
        const recommendedFreelancer = await storage.getUser(rec.recommendedFreelancerId);
        const job = await storage.getJob(rec.jobId);
        return {
          ...rec,
          recommender: recommender ? { 
            id: recommender.id, 
            username: recommender.username, 
            avatar: recommender.avatar,
            level: recommender.level,
            rating: recommender.rating
          } : null,
          recommendedFreelancer: recommendedFreelancer ? {
            id: recommendedFreelancer.id,
            username: recommendedFreelancer.username,
            avatar: recommendedFreelancer.avatar,
            level: recommendedFreelancer.level || 1,
            rating: recommendedFreelancer.rating,
            ratingCount: recommendedFreelancer.totalRatings || 0,
            completedJobs: recommendedFreelancer.completedJobs || 0,
            specialization: recommendedFreelancer.specialization,
          } : null,
          job: job ? { id: job.id, title: job.title, budget: job.budget, category: job.category } : null,
        };
      }));

      res.json(enriched);
    } catch (error) {
      res.status(500).json({ error: "Internal server error" });
    }
  });

  // Get job invitations for freelancer (recommendations that were accepted by customer)
  app.get("/api/recommendations/invitations", requireAuth, async (req, res) => {
    try {
      const user = await storage.getUser(req.session.userId!);
      if (!user) {
        return res.status(401).json({ error: "Unauthorized" });
      }

      if (user.role !== "freelancer") {
        return res.status(403).json({ error: "Only freelancers can view job invitations" });
      }

      const recommendations = await storage.getJobRecommendationsForFreelancer(user.id);
      const invitations = recommendations.filter(r => r.status === "customer_accepted");

      // Enrich with user and job data, including team info
      const enriched = await Promise.all(invitations.map(async (rec) => {
        const recommender = await storage.getUser(rec.recommenderId);
        const customer = await storage.getUser(rec.customerId);
        const job = await storage.getJob(rec.jobId);
        
        // Get current team members for this job
        let teamMembers: Array<{id: string; username: string; avatar: string | null; level: number}> = [];
        if (job) {
          // Check main freelancer assignment
          if (job.freelancerId) {
            const mainFreelancer = await storage.getUser(job.freelancerId);
            if (mainFreelancer) {
              teamMembers.push({
                id: mainFreelancer.id,
                username: mainFreelancer.username,
                avatar: mainFreelancer.avatar,
                level: mainFreelancer.level || 1,
              });
            }
          }
          // Check jobFreelancers table for multi-freelancer jobs
          const jobFreelancers = await storage.getJobFreelancers(job.id);
          for (const jf of jobFreelancers) {
            const fl = await storage.getUser(jf.freelancerId);
            if (fl && !teamMembers.find(tm => tm.id === fl.id)) {
              teamMembers.push({
                id: fl.id,
                username: fl.username,
                avatar: fl.avatar,
                level: fl.level || 1,
              });
            }
          }
        }
        
        // Calculate estimated split (budget divided by current team size + 1 for the invited person)
        // Then apply level-based payout percentage
        const currentTeamSize = teamMembers.length;
        const estimatedSplitCount = currentTeamSize + 1;
        const jobBudget = job ? parseFloat(job.budget) : 0;
        const baseShare = jobBudget / estimatedSplitCount;
        
        // Apply the invited freelancer's level percentage
        const invitedFreelancer = await storage.getUser(rec.recommendedFreelancerId);
        const invitedLevel = invitedFreelancer?.level || 1;
        const levelPayout = getLevelPayout(invitedLevel);
        const estimatedShare = baseShare * levelPayout;
        
        return {
          ...rec,
          recommender: recommender ? { 
            id: recommender.id, 
            username: recommender.username, 
            avatar: recommender.avatar 
          } : null,
          customer: customer ? {
            id: customer.id,
            username: customer.username,
            avatar: customer.avatar,
          } : null,
          job: job ? { 
            id: job.id, 
            title: job.title, 
            description: job.description,
            budget: job.budget, 
            category: job.category,
            deadline: job.deadline
          } : null,
          teamMembers,
          currentTeamSize,
          estimatedShare: estimatedShare.toFixed(2),
        };
      }));

      res.json(enriched);
    } catch (error) {
      res.status(500).json({ error: "Internal server error" });
    }
  });

  // Customer accepts/declines a recommendation
  app.post("/api/recommendations/:id/respond", requireAuth, async (req, res) => {
    try {
      const user = await storage.getUser(req.session.userId!);
      if (!user) {
        return res.status(401).json({ error: "Unauthorized" });
      }

      const recommendation = await storage.getJobRecommendation(req.params.id);
      if (!recommendation) {
        return res.status(404).json({ error: "Recommendation not found" });
      }

      // Only the customer of the job can respond
      if (recommendation.customerId !== user.id) {
        return res.status(403).json({ error: "You are not authorized to respond to this recommendation" });
      }

      if (recommendation.status !== "pending") {
        return res.status(400).json({ error: "This recommendation has already been processed" });
      }

      const { accept, note } = req.body;

      if (accept) {
        // Customer accepts - send invitation to freelancer
        await storage.updateJobRecommendation(recommendation.id, {
          status: "customer_accepted",
          customerNote: note || null,
        });

        // Notify the freelancer about the invitation
        const job = await storage.getJob(recommendation.jobId);
        const recommender = await storage.getUser(recommendation.recommenderId);
        await storage.createNotification({
          userId: recommendation.recommendedFreelancerId,
          type: "job_invitation",
          title: "Job Invitation",
          message: `${user.username} has invited you to work on: ${job?.title || "a job"} (recommended by ${recommender?.username || "a friend"})`,
          relatedId: recommendation.id,
          sourceType: "job",
          sourceId: job?.id || null,
        });

        // Notify the recommender that their recommendation was accepted
        await storage.createNotification({
          userId: recommendation.recommenderId,
          type: "recommendation_accepted",
          title: "Recommendation Accepted",
          message: `Your recommendation was accepted! ${user.username} has invited your friend to work on: ${job?.title || "a job"}`,
          relatedId: recommendation.id,
          sourceType: "job",
          sourceId: job?.id || null,
        });

        res.json({ success: true, message: "Invitation sent to freelancer" });
      } else {
        // Customer declines
        await storage.updateJobRecommendation(recommendation.id, {
          status: "customer_declined",
          customerNote: note || null,
        });

        // Notify the recommender
        const job = await storage.getJob(recommendation.jobId);
        await storage.createNotification({
          userId: recommendation.recommenderId,
          type: "recommendation_declined",
          title: "Recommendation Declined",
          message: `Your recommendation for ${job?.title || "a job"} was declined by the customer`,
          relatedId: recommendation.id,
          sourceType: "job",
          sourceId: job?.id || null,
        });

        res.json({ success: true, message: "Recommendation declined" });
      }
    } catch (error) {
      console.error("Error responding to recommendation:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  // Freelancer accepts/declines a job invitation
  app.post("/api/recommendations/:id/invitation-respond", requireAuth, async (req, res) => {
    try {
      const user = await storage.getUser(req.session.userId!);
      if (!user) {
        return res.status(401).json({ error: "Unauthorized" });
      }

      const recommendation = await storage.getJobRecommendation(req.params.id);
      if (!recommendation) {
        return res.status(404).json({ error: "Invitation not found" });
      }

      // Only the recommended freelancer can respond
      if (recommendation.recommendedFreelancerId !== user.id) {
        return res.status(403).json({ error: "You are not authorized to respond to this invitation" });
      }

      if (recommendation.status !== "customer_accepted") {
        return res.status(400).json({ error: "This invitation is no longer valid" });
      }

      const { accept } = req.body;
      const job = await storage.getJob(recommendation.jobId);
      const recommender = await storage.getUser(recommendation.recommenderId);
      const customer = await storage.getUser(recommendation.customerId);

      if (accept) {
        // Check if freelancer already has an active job (as primary, team member, collaborator, or via jobFreelancers)
        const allJobs = await storage.getJobs({});
        const activeStatuses = ["in_progress", "claimed", "awaiting_customer", "submitted"];
        
        const assignedActiveJobs = allJobs.filter(j => {
          if (!activeStatuses.includes(j.status)) return false;
          if (j.freelancerId === user.id) return true;
          if (j.teamMembers?.includes(user.id)) return true;
          if (j.collaborators?.includes(user.id)) return true;
          return false;
        });

        if (assignedActiveJobs.length > 0) {
          return res.status(400).json({ error: "You are already assigned to an active job. Complete it before accepting new invitations." });
        }

        // Also check jobFreelancers table for multi-freelancer assignments
        const jobFreelancerAssignments = await storage.getJobFreelancersByFreelancer(user.id);
        for (const jf of jobFreelancerAssignments) {
          const assignedJob = await storage.getJob(jf.jobId);
          if (assignedJob && activeStatuses.includes(assignedJob.status)) {
            return res.status(400).json({ error: "You are already assigned to an active job. Complete it before accepting new invitations." });
          }
        }

        // Check if job is still available - allow joining for active, claimed, or in_progress jobs
        const acceptableStatuses = ["active", "claimed", "in_progress"];
        if (!job || !acceptableStatuses.includes(job.status)) {
          return res.status(400).json({ error: "This job is no longer available" });
        }

        // Check if already assigned to this job
        const existingAssignments = await storage.getJobFreelancers(job.id);
        const alreadyAssigned = job.freelancerId === user.id || 
                               existingAssignments.some(jf => jf.freelancerId === user.id);
        if (alreadyAssigned) {
          return res.status(400).json({ error: "You are already assigned to this job" });
        }

        // Check 5-person team limit
        const currentTeamSize = job.freelancerId ? 1 + existingAssignments.length : existingAssignments.length;
        if (currentTeamSize >= 5) {
          return res.status(400).json({ error: "This job already has the maximum of 5 team members" });
        }

        // For multi-freelancer jobs, add to jobFreelancers table
        // If job has no freelancer yet, assign directly
        if (!job.freelancerId) {
          await storage.updateJob(job.id, {
            freelancerId: user.id,
            status: "claimed",
          });
        } else {
          // Add as additional team member
          // Calculate equal share among existing team + new member
          const existingFreelancerCount = existingAssignments.length + 1; // +1 for main freelancer
          const newTeamSize = existingFreelancerCount + 1;
          const sharePerMember = (parseFloat(job.budget) / newTeamSize).toFixed(2);
          
          await storage.createJobFreelancer({
            jobId: job.id,
            freelancerId: user.id,
            shareAmount: sharePerMember,
            levelAtTime: user.level || 1,
            status: "active",
          });
        }

        await storage.updateJobRecommendation(recommendation.id, {
          status: "invitation_accepted",
        });

        // Cancel other pending requests for this job
        const pendingRequests = await storage.getJobRequestsByJob(job.id);
        for (const request of pendingRequests) {
          if (request.status === "pending") {
            await storage.updateJobRequest(request.id, { status: "cancelled" });
          }
        }

        // Notify customer
        await storage.createNotification({
          userId: recommendation.customerId,
          type: "invitation_accepted",
          title: "Invitation Accepted",
          message: `${user.username} has accepted your job invitation for: ${job.title}`,
          relatedId: job.id,
          sourceType: "job",
          sourceId: job.id,
        });

        // Notify recommender
        await storage.createNotification({
          userId: recommendation.recommenderId,
          type: "recommendation_success",
          title: "Recommendation Successful",
          message: `Your friend ${user.username} accepted the job: ${job.title}`,
          relatedId: job.id,
          sourceType: "job",
          sourceId: job.id,
        });

        res.json({ success: true, message: "You have been assigned to the job" });
      } else {
        // Freelancer declines
        await storage.updateJobRecommendation(recommendation.id, {
          status: "invitation_declined",
        });

        // Notify customer
        await storage.createNotification({
          userId: recommendation.customerId,
          type: "invitation_declined",
          title: "Invitation Declined",
          message: `${user.username} has declined your job invitation for: ${job?.title || "a job"}`,
          relatedId: recommendation.id,
          sourceType: "job",
          sourceId: job?.id || null,
        });

        // Notify recommender
        await storage.createNotification({
          userId: recommendation.recommenderId,
          type: "invitation_declined",
          title: "Invitation Declined",
          message: `Your friend ${user.username} declined the job invitation for: ${job?.title || "a job"}`,
          relatedId: recommendation.id,
          sourceType: "job",
          sourceId: job?.id || null,
        });

        res.json({ success: true, message: "Invitation declined" });
      }
    } catch (error) {
      console.error("Error responding to invitation:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  // Get jobs that a freelancer can recommend others for (only jobs where the freelancer is assigned)
  app.get("/api/recommendations/available-jobs", requireAuth, async (req, res) => {
    try {
      const user = await storage.getUser(req.session.userId!);
      if (!user) {
        return res.status(401).json({ error: "Unauthorized" });
      }

      if (user.role !== "freelancer") {
        return res.status(403).json({ error: "Only freelancers can view available jobs for recommendation" });
      }

      // Get all jobs and filter for ones where this freelancer is assigned
      const allJobs = await storage.getJobs();
      const freelancerJobAssignments = await storage.getJobFreelancersByFreelancer(user.id);
      const assignedJobIds = new Set(freelancerJobAssignments.map(jf => jf.jobId));
      
      // Filter for jobs where freelancer is assigned (via freelancerId or jobFreelancers table)
      // and job is in a working state (claimed, in_progress, awaiting_customer)
      const myJobs = allJobs.filter(j => 
        (j.freelancerId === user.id || assignedJobIds.has(j.id)) &&
        (j.status === "claimed" || j.status === "in_progress" || j.status === "awaiting_customer")
      );

      // Return basic job info
      const jobsWithCustomerInfo = await Promise.all(myJobs.map(async (job) => {
        const customer = await storage.getUser(job.customerId);
        return {
          id: job.id,
          title: job.title,
          budget: job.budget,
          category: job.category,
          customer: customer ? {
            id: customer.id,
            username: customer.username,
            avatar: customer.avatar,
          } : null,
        };
      }));

      res.json(jobsWithCustomerInfo);
    } catch (error) {
      res.status(500).json({ error: "Internal server error" });
    }
  });

  // ============ DIRECT MESSAGES API ============

  // Find user by User ID (globally unique)
  app.get("/api/users/find", requireAuth, async (req, res) => {
    try {
      const userId = parseInt(req.query.userId as string);

      if (isNaN(userId)) {
        return res.status(400).json({ error: "User ID is required" });
      }

      const user = await storage.getUserByUserId(userId);
      if (!user) {
        return res.status(404).json({ error: "User not found with this ID" });
      }

      // Don't let users message themselves
      if (user.id === req.session.userId) {
        return res.status(400).json({ error: "You cannot message yourself" });
      }

      res.json({
        id: user.id,
        userId: user.userId,
        username: user.username,
        avatar: user.avatar,
        role: user.role,
      });
    } catch (error) {
      res.status(500).json({ error: "Internal server error" });
    }
  });

  // Get all conversations for current user
  app.get("/api/messages/conversations", requireAuth, async (req, res) => {
    try {
      const userId = req.session.userId!;
      const conversations = await storage.getConversations(userId);

      // Enrich with partner details
      const enrichedConversations = await Promise.all(
        conversations.map(async (conv) => {
          const partner = await storage.getUser(conv.partnerId);
          return {
            ...conv,
            partner: partner ? {
              id: partner.id,
              userId: partner.userId,
              username: partner.username,
              avatar: partner.avatar,
              role: partner.role,
            } : null,
          };
        })
      );

      res.json(enrichedConversations);
    } catch (error) {
      res.status(500).json({ error: "Internal server error" });
    }
  });

  // Get messages between current user and another user
  app.get("/api/messages/:partnerId", requireAuth, async (req, res) => {
    try {
      const userId = req.session.userId!;
      const partnerId = req.params.partnerId;

      const messages = await storage.getDirectMessages(userId, partnerId);

      // Mark messages as read
      await storage.markDirectMessagesAsRead(partnerId, userId);

      // Enrich with sender info
      const enrichedMessages = await Promise.all(
        messages.map(async (msg) => {
          const sender = await storage.getUser(msg.senderId);
          return {
            ...msg,
            sender: sender ? {
              id: sender.id,
              userId: sender.userId,
              username: sender.username,
              avatar: sender.avatar,
              role: sender.role,
            } : null,
          };
        })
      );

      res.json(enrichedMessages);
    } catch (error) {
      res.status(500).json({ error: "Internal server error" });
    }
  });

  // Send a direct message
  app.post("/api/messages/:receiverId", requireAuth, async (req, res) => {
    try {
      const senderId = req.session.userId!;
      const receiverId = req.params.receiverId;
      const { message } = req.body;

      if (!message || typeof message !== "string" || !message.trim()) {
        return res.status(400).json({ error: "Message is required" });
      }

      // Verify receiver exists
      const receiver = await storage.getUser(receiverId);
      if (!receiver) {
        return res.status(404).json({ error: "Recipient not found" });
      }

      // Check receiver's privacy settings
      const receiverPrefs = await storage.getUserPreferences(receiverId);
      if (receiverPrefs && receiverPrefs.allowMessagesFromUnknown === false) {
        const areConnected = await storage.areUsersConnected(senderId, receiverId);
        if (!areConnected) {
          return res.status(403).json({ error: "This user is not accepting messages from unknown users." });
        }
      }

      // Content filtering
      const contentResult = filterContent(message);
      if (!contentResult.isClean || isSpamLike(message)) {
        return res.status(400).json({ error: "Message contains inappropriate content" });
      }

      const directMessage = await storage.createDirectMessage({
        senderId,
        receiverId,
        message: sanitizeText(message.trim()),
      });

      // Create notification for receiver
      const sender = await storage.getUser(senderId);
      await storage.createNotification({
        userId: receiverId,
        type: "direct_message",
        title: "New Message",
        message: `${sender?.username || "Someone"} sent you a message`,
        relatedId: senderId,
        sourceType: "user",
        sourceId: senderId,
      });

      res.json({
        ...directMessage,
        sender: sender ? {
          id: sender.id,
          userId: sender.userId,
          username: sender.username,
          avatar: sender.avatar,
          role: sender.role,
        } : null,
      });
    } catch (error) {
      res.status(500).json({ error: "Internal server error" });
    }
  });

  // ============ TEAM ROOM API ============
  
  // Get team room messages (moderators only)
  app.get("/api/team-room/messages", requireRole("moderator", "head_of_moderation", "founder"), async (req, res) => {
    try {
      const limit = parseInt(req.query.limit as string) || 100;
      const messages = await storage.getTeamRoomMessages(limit);
      
      // Attach sender info to each message
      const messagesWithSenders = await Promise.all(
        messages.map(async (msg) => {
          const sender = await storage.getUser(msg.senderId);
          return {
            ...msg,
            sender: sender ? { id: sender.id, username: sender.username, avatar: sender.avatar, role: sender.role } : null
          };
        })
      );
      
      res.json(messagesWithSenders);
    } catch (error) {
      res.status(500).json({ error: "Internal server error" });
    }
  });
  
  // Send team room message
  app.post("/api/team-room/messages", requireRole("moderator", "head_of_moderation", "founder"), async (req, res) => {
    try {
      const userId = req.session.userId!;
      const result = insertTeamRoomMessageSchema.safeParse({ ...req.body, senderId: userId });
      
      if (!result.success) {
        return res.status(400).json({ error: result.error.issues[0]?.message || "Invalid message" });
      }
      
      // Content filtering
      const contentResult = filterContent(result.data.content);
      if (!contentResult.isClean || isSpamLike(result.data.content)) {
        return res.status(400).json({ error: "Message contains inappropriate content" });
      }
      
      const message = await storage.createTeamRoomMessage({
        senderId: userId,
        content: sanitizeText(result.data.content)
      });
      
      const sender = await storage.getUser(userId);
      res.json({
        ...message,
        sender: sender ? { id: sender.id, username: sender.username, avatar: sender.avatar, role: sender.role } : null
      });
    } catch (error) {
      res.status(500).json({ error: "Internal server error" });
    }
  });
  
  // Get online moderators in team room
  app.get("/api/team-room/online", requireRole("moderator", "head_of_moderation", "founder"), async (_req, res) => {
    try {
      // Return list of users currently connected to team room WebSocket
      const onlineUsers = Array.from(teamRoomClients.values()).map(client => ({
        id: client.userId,
        username: client.username,
        avatar: client.avatar,
        role: client.role
      }));
      res.json(onlineUsers);
    } catch (error) {
      res.status(500).json({ error: "Internal server error" });
    }
  });
  
  // Get WebSocket token for team room (authenticated endpoint)
  app.get("/api/team-room/ws-token", requireRole("moderator", "head_of_moderation", "founder"), async (req, res) => {
    try {
      const userId = req.session.userId!;
      const token = generateTeamRoomToken(userId);
      res.json({ token });
    } catch (error) {
      res.status(500).json({ error: "Internal server error" });
    }
  });

  const httpServer = createServer(app);
  
  // ============ TEAM ROOM WEBSOCKET ============
  
  // WebSocket server for team room real-time chat
  const teamRoomWss = new WebSocketServer({ server: httpServer, path: "/ws/team-room" });
  
  teamRoomWss.on('connection', async (ws: WebSocket, req) => {
    // Parse token from URL query (client gets token from authenticated endpoint)
    const url = new URL(req.url!, `http://${req.headers.host}`);
    const token = url.searchParams.get('token');
    
    if (!token) {
      ws.close(4001, 'Authentication required');
      return;
    }
    
    // Validate the one-time token
    const userId = validateTeamRoomToken(token);
    if (!userId) {
      ws.close(4001, 'Invalid or expired token');
      return;
    }
    
    // Verify user exists and is a moderator
    const user = await storage.getUser(userId);
    if (!user || !['moderator', 'head_of_moderation', 'founder'].includes(user.role)) {
      ws.close(4003, 'Access denied');
      return;
    }
    
    // Store client connection
    const client: TeamRoomClient = {
      ws,
      userId: user.id,
      username: user.username,
      avatar: user.avatar,
      role: user.role
    };
    teamRoomClients.set(userId, client);
    
    console.log(`[TeamRoom] ${user.username} joined the team room`);
    
    // Broadcast user joined to all clients
    broadcastTeamRoom({
      type: 'user_joined',
      user: { id: user.id, username: user.username, avatar: user.avatar, role: user.role }
    });
    
    // Send current online users to new client
    ws.send(JSON.stringify({
      type: 'online_users',
      users: Array.from(teamRoomClients.values()).map(c => ({
        id: c.userId,
        username: c.username,
        avatar: c.avatar,
        role: c.role
      }))
    }));
    
    ws.on('message', async (data) => {
      try {
        const message = JSON.parse(data.toString());
        
        if (message.type === 'chat_message') {
          // Validate and filter content
          const contentResult = filterContent(message.content || '');
          if (!contentResult.isClean || isSpamLike(message.content || '')) {
            ws.send(JSON.stringify({ type: 'error', message: 'Message contains inappropriate content' }));
            return;
          }
          
          // Save to storage
          const savedMessage = await storage.createTeamRoomMessage({
            senderId: userId,
            content: sanitizeText(message.content)
          });
          
          // Broadcast to all clients
          broadcastTeamRoom({
            type: 'chat_message',
            message: {
              ...savedMessage,
              sender: { id: user.id, username: user.username, avatar: user.avatar, role: user.role }
            }
          });
        } else if (message.type === 'typing') {
          // Broadcast typing indicator
          broadcastTeamRoom({
            type: 'typing',
            user: { id: user.id, username: user.username }
          }, userId);
        } else if (message.type === 'webrtc_signal') {
          // Forward WebRTC signaling to target user
          const targetClient = teamRoomClients.get(message.targetUserId);
          if (targetClient && targetClient.ws.readyState === WebSocket.OPEN) {
            targetClient.ws.send(JSON.stringify({
              type: 'webrtc_signal',
              fromUserId: userId,
              fromUsername: user.username,
              signal: message.signal,
              signalType: message.signalType
            }));
          }
        } else if (message.type === 'voice_call_start') {
          // Broadcast voice call invitation to all clients
          broadcastTeamRoom({
            type: 'voice_call_start',
            initiator: { id: user.id, username: user.username, avatar: user.avatar }
          });
        } else if (message.type === 'voice_call_end') {
          // Broadcast voice call ended
          broadcastTeamRoom({
            type: 'voice_call_end',
            user: { id: user.id, username: user.username }
          });
        }
      } catch (error) {
        console.error('[TeamRoom] Message error:', error);
      }
    });
    
    ws.on('close', () => {
      teamRoomClients.delete(userId);
      console.log(`[TeamRoom] ${user.username} left the team room`);
      
      // Broadcast user left
      broadcastTeamRoom({
        type: 'user_left',
        user: { id: user.id, username: user.username }
      });
    });
    
    ws.on('error', (error) => {
      console.error('[TeamRoom] WebSocket error:', error.message);
      teamRoomClients.delete(userId);
    });
  });
  
  function broadcastTeamRoom(data: object, excludeUserId?: string) {
    const message = JSON.stringify(data);
    teamRoomClients.forEach((client, id) => {
      if (id !== excludeUserId && client.ws.readyState === WebSocket.OPEN) {
        client.ws.send(message);
      }
    });
  }
  
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
