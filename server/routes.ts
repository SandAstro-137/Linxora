import type { Express } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import { requireAuth, requireRole } from "./middleware/auth";
import { insertJobSchema, insertPTORequestSchema, insertInvitationSchema, insertCancellationRequestSchema, getLevelPayout } from "@shared/schema";
import { getCryptoPrices } from "./lib/coingecko";
import { postToDiscordWebhook } from "./lib/discord-client";

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

  app.post("/api/jobs/:id/claim", requireAuth, async (req, res) => {
    try {
      const user = await storage.getUser(req.session.userId!);
      if (!user) {
        return res.status(404).json({ error: "User not found" });
      }

      if (user.role !== "freelancer") {
        return res.status(403).json({ error: "Only freelancers can claim jobs" });
      }

      const activeJobs = await storage.getJobs({ 
        freelancerId: req.session.userId!, 
        status: "in_progress" 
      });
      const claimedJobs = await storage.getJobs({ 
        freelancerId: req.session.userId!, 
        status: "claimed" 
      });

      if (activeJobs.length > 0 || claimedJobs.length > 0) {
        return res.status(400).json({ error: "You can only take one job at a time. Complete or cancel your current job first." });
      }

      const job = await storage.claimJob(req.params.id, req.session.userId!);
      if (!job) {
        return res.status(400).json({ error: "Cannot claim this job" });
      }
      res.json(job);
    } catch (error) {
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
      res.json(job);
    } catch (error) {
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
      if (!user || user.role !== "freelancer") {
        return res.status(403).json({ error: "Only freelancers can submit cancellation requests" });
      }

      const validated = insertCancellationRequestSchema.parse(req.body);
      
      const job = await storage.getJob(validated.jobId);
      if (!job) {
        return res.status(404).json({ error: "Job not found" });
      }

      if (job.freelancerId !== req.session.userId) {
        return res.status(403).json({ error: "You can only cancel jobs assigned to you" });
      }

      const request = await storage.createCancellationRequest({
        ...validated,
        requesterId: req.session.userId!,
      });

      res.json(request);
    } catch (error: any) {
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

      const updatedRequest = await storage.updateCancellationRequest(req.params.id, {
        status: "approved",
        reviewerId: req.session.userId!,
        reviewNotes: req.body.reviewNotes || null,
      });

      const job = await storage.updateJob(request.jobId, { 
        status: "active",
        freelancerId: null,
      });

      res.json({ request: updatedRequest, job });
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
      res.json(wallet);
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

      if (currentBalance < withdrawAmount) {
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
      const request = await storage.createPTORequest({
        ...validated,
        freelancerId: req.session.userId!,
      });
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

      res.json(invitation);
    } catch (error) {
      res.status(500).json({ error: "Internal server error" });
    }
  });

  // Notifications routes
  app.get("/api/notifications", requireAuth, async (req, res) => {
    try {
      const invitations = await storage.getInvitations(req.session.userId!);
      
      const notifications = invitations
        .filter(inv => inv.toUserId === req.session.userId)
        .map(inv => ({
          id: inv.id,
          type: "job_invite",
          message: `You've been invited to collaborate on a job`,
          read: inv.status !== "pending",
          createdAt: inv.createdAt,
          metadata: { invitationId: inv.id, jobId: inv.jobId },
        }));

      res.json(notifications);
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
