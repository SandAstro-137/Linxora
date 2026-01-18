import {
  type User,
  type InsertUser,
  type Job,
  type InsertJob,
  type Wallet,
  type InsertWallet,
  type Transaction,
  type InsertTransaction,
  type PTORequest,
  type InsertPTORequest,
  type Invitation,
  type InsertInvitation,
  type CancellationRequest,
  type InsertCancellationRequest,
  type ChatMessage,
  type InsertChatMessage,
  type DirectMessage,
  type InsertDirectMessage,
  type Notification,
  type InsertNotification,
  type TeamNote,
  type InsertTeamNote,
  type TeamTask,
  type InsertTeamTask,
  type TeamMessage,
  type InsertTeamMessage,
  type Rating,
  type InsertRating,
  type RoleUpgradeRequest,
  type InsertRoleUpgradeRequest,
  type Report,
  type InsertReport,
  type ModeratorTask,
  type InsertModeratorTask,
  type ModeratorMeeting,
  type InsertModeratorMeeting,
  type MeetingRsvp,
  type InsertMeetingRsvp,
  type MeetingExemption,
  type InsertMeetingExemption,
  type TeamRoomMessage,
  type InsertTeamRoomMessage,
  type UserPreferences,
  type InsertUserPreferences,
  type EmailVerificationToken,
  type InsertEmailVerificationToken,
  type JobRequest,
  type InsertJobRequest,
  type ModerationVault,
  type VaultTransaction,
  type InsertVaultTransaction,
  type Friend,
  type FriendRequest,
  type InsertFriendRequest,
  type JobRecommendation,
  type InsertJobRecommendation,
  MeetingExemptionStatus,
  // New types from spec
  type Escrow,
  type InsertEscrow,
  type JobFreelancer,
  type InsertJobFreelancer,
  type JobSubmission,
  type InsertJobSubmission,
  type Dispute,
  type InsertDispute,
  type ModerationLog,
  type InsertModerationLog,
  type ScheduledTask,
  type InsertScheduledTask,
  type UserBan,
  type InsertUserBan,
  type CustomerReview,
  type InsertCustomerReview,
  type CancellationNegotiation,
  type InsertCancellationNegotiation,
  EscrowStatus,
  JobFreelancerStatus,
  JobSubmissionStatus,
  DisputeStatus,
  ScheduledTaskStatus,
} from "@shared/schema";
import { randomUUID } from "crypto";

export interface IStorage {
  // User operations
  getUser(id: string): Promise<User | undefined>;
  getUsers(): Promise<User[]>;
  getUserByDiscordId(discordId: string): Promise<User | undefined>;
  getUserByUsername(username: string): Promise<User | undefined>;
  createUser(user: InsertUser, allowFounder?: boolean): Promise<User>;
  updateUser(id: string, user: Partial<User>): Promise<User | undefined>;

  // Job operations
  getJob(id: string): Promise<Job | undefined>;
  getJobs(filters?: { status?: string; customerId?: string; freelancerId?: string; category?: string }): Promise<Job[]>;
  getJobsByStatus(status: string): Promise<Job[]>;
  createJob(job: InsertJob): Promise<Job>;
  updateJob(id: string, job: Partial<Job>): Promise<Job | undefined>;
  claimJob(jobId: string, freelancerId: string): Promise<Job | undefined>;

  // Wallet operations
  getWallet(userId: string): Promise<Wallet | undefined>;
  createWallet(wallet: InsertWallet): Promise<Wallet>;
  updateWallet(userId: string, wallet: Partial<Wallet>): Promise<Wallet | undefined>;
  adjustPendingBalance(userId: string, amount: number): Promise<Wallet | undefined>;

  // Transaction operations
  getTransactions(walletId: string): Promise<Transaction[]>;
  createTransaction(transaction: InsertTransaction): Promise<Transaction>;

  // PTO Request operations
  getPTORequests(freelancerId: string): Promise<PTORequest[]>;
  getAllPTORequests(): Promise<PTORequest[]>;
  createPTORequest(request: InsertPTORequest): Promise<PTORequest>;
  updatePTORequest(id: string, request: Partial<PTORequest>): Promise<PTORequest | undefined>;

  // Invitation operations
  getInvitations(userId: string): Promise<Invitation[]>;
  createInvitation(invitation: InsertInvitation): Promise<Invitation>;
  updateInvitation(id: string, invitation: Partial<Invitation>): Promise<Invitation | undefined>;

  // Cancellation Request operations
  getCancellationRequest(id: string): Promise<CancellationRequest | undefined>;
  getCancellationRequests(filters?: { jobId?: string; requesterId?: string; status?: string }): Promise<CancellationRequest[]>;
  getAllCancellationRequests(): Promise<CancellationRequest[]>;
  createCancellationRequest(request: InsertCancellationRequest): Promise<CancellationRequest>;
  updateCancellationRequest(id: string, request: Partial<CancellationRequest>): Promise<CancellationRequest | undefined>;

  // Chat Message operations (job-specific)
  getChatMessages(jobId: string): Promise<ChatMessage[]>;
  createChatMessage(message: InsertChatMessage): Promise<ChatMessage>;
  markChatMessagesAsRead(jobId: string, userId: string): Promise<void>;

  // Direct Message operations (user-to-user)
  getUserByUserId(userId: number): Promise<User | undefined>;
  getDirectMessages(userId1: string, userId2: string): Promise<DirectMessage[]>;
  getConversations(userId: string): Promise<{ partnerId: string; lastMessage: DirectMessage; unreadCount: number }[]>;
  createDirectMessage(message: InsertDirectMessage): Promise<DirectMessage>;
  markDirectMessagesAsRead(senderId: string, receiverId: string): Promise<void>;

  // Notification operations
  getNotifications(userId: string): Promise<Notification[]>;
  getUnreadNotificationCount(userId: string): Promise<number>;
  createNotification(notification: InsertNotification): Promise<Notification>;
  markNotificationAsRead(id: string): Promise<Notification | undefined>;
  markAllNotificationsAsRead(userId: string): Promise<void>;
  deleteNotification(id: string): Promise<void>;

  // User Preferences operations
  getUserPreferences(userId: string): Promise<UserPreferences | undefined>;
  createUserPreferences(prefs: InsertUserPreferences): Promise<UserPreferences>;
  updateUserPreferences(userId: string, prefs: Partial<UserPreferences>): Promise<UserPreferences | undefined>;

  // Team Note operations
  getTeamNotes(jobId: string): Promise<TeamNote[]>;
  createTeamNote(note: InsertTeamNote): Promise<TeamNote>;
  updateTeamNote(id: string, note: Partial<TeamNote>): Promise<TeamNote | undefined>;
  deleteTeamNote(id: string): Promise<void>;

  // Team Task operations
  getTeamTasks(jobId: string): Promise<TeamTask[]>;
  createTeamTask(task: InsertTeamTask): Promise<TeamTask>;
  updateTeamTask(id: string, task: Partial<TeamTask>): Promise<TeamTask | undefined>;
  deleteTeamTask(id: string): Promise<void>;

  // Team Message operations
  getTeamMessages(jobId: string): Promise<TeamMessage[]>;
  createTeamMessage(message: InsertTeamMessage): Promise<TeamMessage>;
  deleteTeamMessage(id: string): Promise<void>;

  // Rating operations
  getRating(jobId: string): Promise<Rating | undefined>;
  getRatingsByFreelancer(freelancerId: string): Promise<Rating[]>;
  createRating(rating: InsertRating): Promise<Rating>;

  // Role Upgrade Request operations
  getRoleUpgradeRequest(id: string): Promise<RoleUpgradeRequest | undefined>;
  getRoleUpgradeRequests(filters?: { userId?: string; status?: string }): Promise<RoleUpgradeRequest[]>;
  getPendingRoleUpgradeRequests(): Promise<RoleUpgradeRequest[]>;
  createRoleUpgradeRequest(request: InsertRoleUpgradeRequest): Promise<RoleUpgradeRequest>;
  updateRoleUpgradeRequest(id: string, updates: Partial<RoleUpgradeRequest>): Promise<RoleUpgradeRequest | undefined>;

  // Report operations
  getReport(id: string): Promise<Report | undefined>;
  getReports(filters?: { reporterId?: string; status?: string; reportType?: string }): Promise<Report[]>;
  getPendingReports(): Promise<Report[]>;
  createReport(report: InsertReport): Promise<Report>;
  updateReport(id: string, updates: Partial<Report>): Promise<Report | undefined>;

  // Moderator Task operations
  getModeratorTask(id: string): Promise<ModeratorTask | undefined>;
  getModeratorTasks(assigneeId: string): Promise<ModeratorTask[]>;
  getModeratorTasksAssignedBy(assignedById: string): Promise<ModeratorTask[]>;
  createModeratorTask(task: InsertModeratorTask): Promise<ModeratorTask>;
  updateModeratorTask(id: string, updates: Partial<ModeratorTask>): Promise<ModeratorTask | undefined>;

  // Moderator Meeting operations
  getModeratorMeeting(id: string): Promise<ModeratorMeeting | undefined>;
  getModeratorMeetings(moderatorId: string): Promise<ModeratorMeeting[]>;
  getModeratorMeetingsScheduledBy(scheduledById: string): Promise<ModeratorMeeting[]>;
  createModeratorMeeting(meeting: InsertModeratorMeeting): Promise<ModeratorMeeting>;
  updateModeratorMeeting(id: string, updates: Partial<ModeratorMeeting>): Promise<ModeratorMeeting | undefined>;

  // Meeting RSVP operations
  getMeetingRsvps(meetingId: string): Promise<MeetingRsvp[]>;
  getMeetingRsvpByModerator(meetingId: string, moderatorId: string): Promise<MeetingRsvp | undefined>;
  createMeetingRsvp(rsvp: InsertMeetingRsvp): Promise<MeetingRsvp>;
  updateMeetingRsvp(id: string, updates: Partial<MeetingRsvp>): Promise<MeetingRsvp | undefined>;

  // Meeting Exemption operations
  getMeetingExemption(id: string): Promise<MeetingExemption | undefined>;
  getMeetingExemptionsByMeeting(meetingId: string): Promise<MeetingExemption[]>;
  getMeetingExemptionsByModerator(moderatorId: string): Promise<MeetingExemption[]>;
  getPendingMeetingExemptions(): Promise<MeetingExemption[]>;
  createMeetingExemption(exemption: InsertMeetingExemption): Promise<MeetingExemption>;
  updateMeetingExemption(id: string, updates: Partial<MeetingExemption>): Promise<MeetingExemption | undefined>;

  // Team Room Message operations
  getTeamRoomMessages(limit?: number): Promise<TeamRoomMessage[]>;
  createTeamRoomMessage(message: InsertTeamRoomMessage): Promise<TeamRoomMessage>;

  // Email verification token operations
  getEmailVerificationToken(token: string): Promise<EmailVerificationToken | undefined>;
  getEmailVerificationTokenByUserId(userId: string): Promise<EmailVerificationToken | undefined>;
  createEmailVerificationToken(token: InsertEmailVerificationToken): Promise<EmailVerificationToken>;
  markEmailVerificationTokenUsed(token: string): Promise<EmailVerificationToken | undefined>;
  deleteEmailVerificationTokensByUserId(userId: string): Promise<void>;

  // Job Request operations (freelancer applications to jobs)
  getJobRequest(id: string): Promise<JobRequest | undefined>;
  getJobRequestsByJob(jobId: string): Promise<JobRequest[]>;
  getJobRequestsByFreelancer(freelancerId: string, status?: string): Promise<JobRequest[]>;
  getPendingJobRequestsByFreelancer(freelancerId: string): Promise<JobRequest[]>;
  getJobRequestByJobAndFreelancer(jobId: string, freelancerId: string): Promise<JobRequest | undefined>;
  createJobRequest(request: InsertJobRequest): Promise<JobRequest>;
  updateJobRequest(id: string, updates: Partial<JobRequest>): Promise<JobRequest | undefined>;
  cancelPendingJobRequestsByFreelancer(freelancerId: string, exceptJobId?: string): Promise<void>;

  // Moderation Vault operations
  getModerationVault(): Promise<ModerationVault>;
  depositToVault(amount: number, fromUserId: string, note?: string): Promise<VaultTransaction>;
  distributeFromVault(amount: number, toUserId: string, distributedByUserId: string, note?: string): Promise<VaultTransaction>;
  getVaultTransactions(limit?: number): Promise<VaultTransaction[]>;

  // Friend operations
  getFriends(userId: string): Promise<Friend[]>;
  getFriendRequest(id: string): Promise<FriendRequest | undefined>;
  getFriendRequestsByUser(userId: string): Promise<FriendRequest[]>;
  getIncomingFriendRequests(userId: string): Promise<FriendRequest[]>;
  getFriendRequestBetweenUsers(userId1: string, userId2: string): Promise<FriendRequest | undefined>;
  areFriends(userId1: string, userId2: string): Promise<boolean>;
  areUsersConnected(userId1: string, userId2: string): Promise<boolean>;
  createFriendRequest(request: InsertFriendRequest): Promise<FriendRequest>;
  updateFriendRequest(id: string, updates: Partial<FriendRequest>): Promise<FriendRequest | undefined>;
  createFriendship(userId: string, friendId: string): Promise<void>;
  removeFriendship(userId: string, friendId: string): Promise<void>;
  searchUsersByUserId(userIdQuery: number): Promise<User[]>;

  // Job Recommendation operations
  getJobRecommendation(id: string): Promise<JobRecommendation | undefined>;
  getJobRecommendationsByCustomer(customerId: string): Promise<JobRecommendation[]>;
  getJobRecommendationsByRecommender(recommenderId: string): Promise<JobRecommendation[]>;
  getJobRecommendationsForFreelancer(freelancerId: string): Promise<JobRecommendation[]>;
  createJobRecommendation(recommendation: InsertJobRecommendation): Promise<JobRecommendation>;
  updateJobRecommendation(id: string, updates: Partial<JobRecommendation>): Promise<JobRecommendation | undefined>;

  // ============================================================
  // NEW OPERATIONS FROM SPEC - Escrow, Disputes, Job Lifecycle
  // ============================================================

  // Escrow operations
  getEscrow(id: string): Promise<Escrow | undefined>;
  getEscrowByJob(jobId: string): Promise<Escrow | undefined>;
  createEscrow(escrow: InsertEscrow): Promise<Escrow>;
  updateEscrow(id: string, updates: Partial<Escrow>): Promise<Escrow | undefined>;

  // Job Freelancer operations (multi-freelancer support)
  getJobFreelancers(jobId: string): Promise<JobFreelancer[]>;
  getJobFreelancersByFreelancer(freelancerId: string): Promise<JobFreelancer[]>;
  createJobFreelancer(jf: InsertJobFreelancer): Promise<JobFreelancer>;
  updateJobFreelancer(id: string, updates: Partial<JobFreelancer>): Promise<JobFreelancer | undefined>;

  // Job Submission operations
  getJobSubmission(id: string): Promise<JobSubmission | undefined>;
  getJobSubmissions(jobId: string): Promise<JobSubmission[]>;
  createJobSubmission(submission: InsertJobSubmission): Promise<JobSubmission>;
  updateJobSubmission(id: string, updates: Partial<JobSubmission>): Promise<JobSubmission | undefined>;

  // Dispute operations
  getDispute(id: string): Promise<Dispute | undefined>;
  getDisputeByJob(jobId: string): Promise<Dispute | undefined>;
  getDisputes(filters?: { status?: string; moderatorId?: string }): Promise<Dispute[]>;
  createDispute(dispute: InsertDispute): Promise<Dispute>;
  updateDispute(id: string, updates: Partial<Dispute>): Promise<Dispute | undefined>;

  // Moderation Log operations
  getModerationLogs(filters?: { moderatorId?: string; jobId?: string }): Promise<ModerationLog[]>;
  createModerationLog(log: InsertModerationLog): Promise<ModerationLog>;

  // Scheduled Task operations
  getScheduledTask(id: string): Promise<ScheduledTask | undefined>;
  getScheduledTasks(filters?: { jobId?: string; status?: string; taskType?: string }): Promise<ScheduledTask[]>;
  getPendingScheduledTasks(beforeDate: Date): Promise<ScheduledTask[]>;
  createScheduledTask(task: InsertScheduledTask): Promise<ScheduledTask>;
  updateScheduledTask(id: string, updates: Partial<ScheduledTask>): Promise<ScheduledTask | undefined>;

  // User Ban operations
  getUserBan(userId: string): Promise<UserBan | undefined>;
  getUserBans(): Promise<UserBan[]>;
  createUserBan(ban: InsertUserBan): Promise<UserBan>;

  // Customer Review operations
  getCustomerReview(id: string): Promise<CustomerReview | undefined>;
  getCustomerReviewBySubmission(submissionId: string): Promise<CustomerReview | undefined>;
  createCustomerReview(review: InsertCustomerReview): Promise<CustomerReview>;

  // Cancellation Negotiation operations
  getCancellationNegotiation(id: string): Promise<CancellationNegotiation | undefined>;
  getCancellationNegotiationByJob(jobId: string): Promise<CancellationNegotiation | undefined>;
  createCancellationNegotiation(negotiation: InsertCancellationNegotiation): Promise<CancellationNegotiation>;
  updateCancellationNegotiation(id: string, updates: Partial<CancellationNegotiation>): Promise<CancellationNegotiation | undefined>;
}

export class MemStorage implements IStorage {
  private users: Map<string, User>;
  private jobs: Map<string, Job>;
  private wallets: Map<string, Wallet>;
  private transactions: Map<string, Transaction>;
  private ptoRequests: Map<string, PTORequest>;
  private invitations: Map<string, Invitation>;
  private cancellationRequests: Map<string, CancellationRequest>;
  private chatMessages: Map<string, ChatMessage>;
  private notifications: Map<string, Notification>;
  private teamNotes: Map<string, TeamNote>;
  private teamTasks: Map<string, TeamTask>;
  private teamMessages: Map<string, TeamMessage>;
  private ratings: Map<string, Rating>;
  private roleUpgradeRequests: Map<string, RoleUpgradeRequest>;
  private reports: Map<string, Report>;
  private moderatorTasks: Map<string, ModeratorTask>;
  private moderatorMeetings: Map<string, ModeratorMeeting>;
  private meetingRsvps: Map<string, MeetingRsvp>;
  private teamRoomMessages: Map<string, TeamRoomMessage>;
  private directMessages: Map<string, DirectMessage>;
  private userPreferences: Map<string, UserPreferences>;
  private emailVerificationTokens: Map<string, EmailVerificationToken>;
  private jobRequests: Map<string, JobRequest>;
  private moderationVault: ModerationVault | null;
  private vaultTransactions: Map<string, VaultTransaction>;
  private friends: Map<string, Friend>;
  private friendRequests: Map<string, FriendRequest>;
  private jobRecommendations: Map<string, JobRecommendation>;
  private meetingExemptions: Map<string, MeetingExemption>;
  private userIdCounter: number;
  // New maps from spec
  private escrowRecords: Map<string, Escrow>;
  private jobFreelancersMap: Map<string, JobFreelancer>;
  private jobSubmissionsMap: Map<string, JobSubmission>;
  private disputesMap: Map<string, Dispute>;
  private moderationLogsMap: Map<string, ModerationLog>;
  private scheduledTasksMap: Map<string, ScheduledTask>;
  private userBansMap: Map<string, UserBan>;
  private customerReviewsMap: Map<string, CustomerReview>;
  private cancellationNegotiationsMap: Map<string, CancellationNegotiation>;

  constructor() {
    this.users = new Map();
    this.jobs = new Map();
    this.userIdCounter = 1; // Sequential user IDs start at 1
    this.wallets = new Map();
    this.directMessages = new Map();
    this.transactions = new Map();
    this.ptoRequests = new Map();
    this.invitations = new Map();
    this.cancellationRequests = new Map();
    this.chatMessages = new Map();
    this.notifications = new Map();
    this.teamNotes = new Map();
    this.teamTasks = new Map();
    this.teamMessages = new Map();
    this.ratings = new Map();
    this.roleUpgradeRequests = new Map();
    this.reports = new Map();
    this.moderatorTasks = new Map();
    this.moderatorMeetings = new Map();
    this.meetingRsvps = new Map();
    this.teamRoomMessages = new Map();
    this.userPreferences = new Map();
    this.emailVerificationTokens = new Map();
    this.jobRequests = new Map();
    this.moderationVault = null;
    this.vaultTransactions = new Map();
    this.friends = new Map();
    this.friendRequests = new Map();
    this.jobRecommendations = new Map();
    this.meetingExemptions = new Map();
    // Initialize new maps from spec
    this.escrowRecords = new Map();
    this.jobFreelancersMap = new Map();
    this.jobSubmissionsMap = new Map();
    this.disputesMap = new Map();
    this.moderationLogsMap = new Map();
    this.scheduledTasksMap = new Map();
    this.userBansMap = new Map();
    this.customerReviewsMap = new Map();
    this.cancellationNegotiationsMap = new Map();
  }

  // User operations
  async getUser(id: string): Promise<User | undefined> {
    return this.users.get(id);
  }

  async getUsers(): Promise<User[]> {
    return Array.from(this.users.values());
  }

  async getUserByDiscordId(discordId: string): Promise<User | undefined> {
    return Array.from(this.users.values()).find((user) => user.discordId === discordId);
  }

  async getUserByUsername(username: string): Promise<User | undefined> {
    return Array.from(this.users.values()).find((user) => user.username === username);
  }

  async createUser(insertUser: InsertUser, allowFounder: boolean = false): Promise<User> {
    // Security: Only allow Founder role creation during initial seed
    if (insertUser.role === "founder" && !allowFounder) {
      throw new Error("Cannot create user with Founder role");
    }
    
    // Security: Only one Founder can exist
    if (insertUser.role === "founder") {
      const existingFounder = Array.from(this.users.values()).find(u => u.role === "founder");
      if (existingFounder) {
        throw new Error("Founder already exists");
      }
    }
    
    const id = randomUUID();
    const userId = this.userIdCounter++; // Assign sequential permanent User ID
    
    // Founder role doesn't need onboarding tutorial - auto-complete for them
    const skipOnboarding = insertUser.role === "founder";
    
    const user: User = {
      ...insertUser,
      id,
      userId,
      email: insertUser.email ?? null,
      emailVerified: insertUser.emailVerified ?? false,
      pendingEmail: insertUser.pendingEmail ?? null,
      avatar: insertUser.avatar ?? null,
      specialization: insertUser.specialization ?? null,
      role: insertUser.role ?? "freelancer",
      level: insertUser.level ?? 1,
      completedJobs: insertUser.completedJobs ?? 0,
      rating: insertUser.rating ?? "0",
      onboardingCompleted: insertUser.onboardingCompleted ?? skipOnboarding,
      totalRatings: insertUser.totalRatings ?? 0,
      completionPercentage: insertUser.completionPercentage ?? "0",
      workingHours: insertUser.workingHours ?? {},
      blacklistedFreelancers: insertUser.blacklistedFreelancers ?? [],
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    this.users.set(id, user);
    return user;
  }

  async updateUser(id: string, updates: Partial<User>): Promise<User | undefined> {
    const user = this.users.get(id);
    if (!user) return undefined;
    
    // Security: Prevent role escalation to Founder via any update
    // Founder role can only be set during initial seed
    if (updates.role === "founder") {
      throw new Error("Cannot assign Founder role via user update");
    }
    
    // Security: If user is already Founder, prevent role changes
    if (user.role === "founder" && updates.role && updates.role !== "founder") {
      throw new Error("Cannot change Founder's role");
    }
    
    const updated = { ...user, ...updates, updatedAt: new Date() };
    this.users.set(id, updated);
    return updated;
  }

  // Job operations
  async getJob(id: string): Promise<Job | undefined> {
    return this.jobs.get(id);
  }

  async getJobs(filters?: { status?: string; customerId?: string; freelancerId?: string; category?: string }): Promise<Job[]> {
    let jobs = Array.from(this.jobs.values());
    
    if (filters?.status) {
      jobs = jobs.filter((job) => job.status === filters.status);
    }
    if (filters?.customerId) {
      jobs = jobs.filter((job) => job.customerId === filters.customerId);
    }
    if (filters?.freelancerId) {
      jobs = jobs.filter((job) => job.freelancerId === filters.freelancerId);
    }
    if (filters?.category) {
      jobs = jobs.filter((job) => job.category === filters.category);
    }
    
    return jobs.sort((a, b) => new Date(b.createdAt!).getTime() - new Date(a.createdAt!).getTime());
  }

  async getJobsByStatus(status: string): Promise<Job[]> {
    return Array.from(this.jobs.values())
      .filter((job) => job.status === status)
      .sort((a, b) => new Date(b.createdAt!).getTime() - new Date(a.createdAt!).getTime());
  }

  async createJob(insertJob: InsertJob): Promise<Job> {
    const id = randomUUID();
    const job: Job = {
      ...insertJob,
      id,
      status: insertJob.status ?? "draft",
      freelancerId: insertJob.freelancerId ?? null,
      requirements: insertJob.requirements ?? null,
      deadline: insertJob.deadline ?? null,
      collaborators: insertJob.collaborators ?? [],
      moderatorFeedback: insertJob.moderatorFeedback ?? null,
      expiresAt: null,
      approvedAt: null,
      submittedAt: null,
      autoCompleteAt: null,
      maxFreelancers: insertJob.maxFreelancers ?? 1,
      isLocked: false,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    this.jobs.set(id, job);
    return job;
  }

  async updateJob(id: string, updates: Partial<Job>): Promise<Job | undefined> {
    const job = this.jobs.get(id);
    if (!job) return undefined;
    const updated = { ...job, ...updates, updatedAt: new Date() };
    this.jobs.set(id, updated);
    return updated;
  }

  async claimJob(jobId: string, freelancerId: string): Promise<Job | undefined> {
    const job = this.jobs.get(jobId);
    if (!job || job.status !== "active") return undefined;
    return this.updateJob(jobId, { freelancerId, status: "claimed" });
  }

  // Wallet operations
  async getWallet(userId: string): Promise<Wallet | undefined> {
    return Array.from(this.wallets.values()).find((wallet) => wallet.userId === userId);
  }

  async createWallet(insertWallet: InsertWallet): Promise<Wallet> {
    const id = randomUUID();
    const wallet: Wallet = {
      ...insertWallet,
      id,
      walletAddress: insertWallet.walletAddress ?? null,
      usdtBalance: insertWallet.usdtBalance ?? "0",
      pendingUsdtBalance: insertWallet.pendingUsdtBalance ?? "0",
      solBalance: insertWallet.solBalance ?? "0",
      btcBalance: insertWallet.btcBalance ?? "0",
      ltcBalance: insertWallet.ltcBalance ?? "0",
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    this.wallets.set(id, wallet);
    return wallet;
  }

  async updateWallet(userId: string, updates: Partial<Wallet>): Promise<Wallet | undefined> {
    const wallet = await this.getWallet(userId);
    if (!wallet) return undefined;
    const updated = { ...wallet, ...updates, updatedAt: new Date() };
    this.wallets.set(wallet.id, updated);
    return updated;
  }

  async adjustPendingBalance(userId: string, amount: number): Promise<Wallet | undefined> {
    const wallet = await this.getWallet(userId);
    if (!wallet) return undefined;
    const currentPending = parseFloat(wallet.pendingUsdtBalance ?? "0");
    const newPending = Math.max(0, currentPending + amount); // Never go below 0
    return this.updateWallet(userId, { pendingUsdtBalance: newPending.toString() });
  }

  // Transaction operations
  async getTransactions(walletId: string): Promise<Transaction[]> {
    return Array.from(this.transactions.values())
      .filter((tx) => tx.walletId === walletId)
      .sort((a, b) => new Date(b.createdAt!).getTime() - new Date(a.createdAt!).getTime());
  }

  async createTransaction(insertTransaction: InsertTransaction): Promise<Transaction> {
    const id = randomUUID();
    const transaction: Transaction = {
      ...insertTransaction,
      id,
      status: insertTransaction.status ?? null,
      usdAmount: insertTransaction.usdAmount ?? null,
      transactionHash: insertTransaction.transactionHash ?? null,
      createdAt: new Date(),
    };
    this.transactions.set(id, transaction);
    return transaction;
  }

  // PTO Request operations
  async getPTORequests(freelancerId: string): Promise<PTORequest[]> {
    return Array.from(this.ptoRequests.values())
      .filter((request) => request.freelancerId === freelancerId)
      .sort((a, b) => new Date(b.createdAt!).getTime() - new Date(a.createdAt!).getTime());
  }

  async getAllPTORequests(): Promise<PTORequest[]> {
    return Array.from(this.ptoRequests.values())
      .sort((a, b) => new Date(b.createdAt!).getTime() - new Date(a.createdAt!).getTime());
  }

  async createPTORequest(insertRequest: InsertPTORequest): Promise<PTORequest> {
    const id = randomUUID();
    const request: PTORequest = {
      ...insertRequest,
      id,
      status: insertRequest.status ?? "pending",
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    this.ptoRequests.set(id, request);
    return request;
  }

  async updatePTORequest(id: string, updates: Partial<PTORequest>): Promise<PTORequest | undefined> {
    const request = this.ptoRequests.get(id);
    if (!request) return undefined;
    const updated = { ...request, ...updates, updatedAt: new Date() };
    this.ptoRequests.set(id, updated);
    return updated;
  }

  // Invitation operations
  async getInvitations(userId: string): Promise<Invitation[]> {
    return Array.from(this.invitations.values())
      .filter((inv) => inv.toUserId === userId || inv.fromUserId === userId)
      .sort((a, b) => new Date(b.createdAt!).getTime() - new Date(a.createdAt!).getTime());
  }

  async createInvitation(insertInvitation: InsertInvitation): Promise<Invitation> {
    const id = randomUUID();
    const invitation: Invitation = {
      ...insertInvitation,
      id,
      status: insertInvitation.status ?? null,
      createdAt: new Date(),
    };
    this.invitations.set(id, invitation);
    return invitation;
  }

  async updateInvitation(id: string, updates: Partial<Invitation>): Promise<Invitation | undefined> {
    const invitation = this.invitations.get(id);
    if (!invitation) return undefined;
    const updated = { ...invitation, ...updates };
    this.invitations.set(id, updated);
    return updated;
  }

  // Cancellation Request operations
  async getCancellationRequest(id: string): Promise<CancellationRequest | undefined> {
    return this.cancellationRequests.get(id);
  }

  async getCancellationRequests(filters?: { jobId?: string; requesterId?: string; status?: string }): Promise<CancellationRequest[]> {
    let requests = Array.from(this.cancellationRequests.values());
    
    if (filters?.jobId) {
      requests = requests.filter((req) => req.jobId === filters.jobId);
    }
    if (filters?.requesterId) {
      requests = requests.filter((req) => req.requesterId === filters.requesterId);
    }
    if (filters?.status) {
      requests = requests.filter((req) => req.status === filters.status);
    }
    
    return requests.sort((a, b) => new Date(b.createdAt!).getTime() - new Date(a.createdAt!).getTime());
  }

  async getAllCancellationRequests(): Promise<CancellationRequest[]> {
    return Array.from(this.cancellationRequests.values())
      .sort((a, b) => new Date(b.createdAt!).getTime() - new Date(a.createdAt!).getTime());
  }

  async createCancellationRequest(insertRequest: InsertCancellationRequest): Promise<CancellationRequest> {
    const id = randomUUID();
    const request: CancellationRequest = {
      ...insertRequest,
      id,
      proofUrl: insertRequest.proofUrl ?? null,
      status: insertRequest.status ?? "pending",
      reviewerId: insertRequest.reviewerId ?? null,
      reviewNotes: insertRequest.reviewNotes ?? null,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    this.cancellationRequests.set(id, request);
    return request;
  }

  async updateCancellationRequest(id: string, updates: Partial<CancellationRequest>): Promise<CancellationRequest | undefined> {
    const request = this.cancellationRequests.get(id);
    if (!request) return undefined;
    const updated = { ...request, ...updates, updatedAt: new Date() };
    this.cancellationRequests.set(id, updated);
    return updated;
  }

  // Chat Message operations
  async getChatMessages(jobId: string): Promise<ChatMessage[]> {
    return Array.from(this.chatMessages.values())
      .filter((msg) => msg.jobId === jobId)
      .sort((a, b) => new Date(a.createdAt!).getTime() - new Date(b.createdAt!).getTime());
  }

  async createChatMessage(insertMessage: InsertChatMessage): Promise<ChatMessage> {
    const id = randomUUID();
    const message: ChatMessage = {
      ...insertMessage,
      id,
      read: insertMessage.read ?? false,
      createdAt: new Date(),
    };
    this.chatMessages.set(id, message);
    return message;
  }

  async markChatMessagesAsRead(jobId: string, userId: string): Promise<void> {
    const entries = Array.from(this.chatMessages.entries());
    for (const [id, message] of entries) {
      if (message.jobId === jobId && message.receiverId === userId && !message.read) {
        this.chatMessages.set(id, { ...message, read: true });
      }
    }
  }

  // Direct Message operations (user-to-user)
  async getUserByUserId(userId: number): Promise<User | undefined> {
    return Array.from(this.users.values()).find(
      (user) => user.userId === userId
    );
  }

  async getDirectMessages(userId1: string, userId2: string): Promise<DirectMessage[]> {
    return Array.from(this.directMessages.values())
      .filter(
        (msg) =>
          (msg.senderId === userId1 && msg.receiverId === userId2) ||
          (msg.senderId === userId2 && msg.receiverId === userId1)
      )
      .sort((a, b) => new Date(a.createdAt!).getTime() - new Date(b.createdAt!).getTime());
  }

  async getConversations(userId: string): Promise<{ partnerId: string; lastMessage: DirectMessage; unreadCount: number }[]> {
    const messages = Array.from(this.directMessages.values()).filter(
      (msg) => msg.senderId === userId || msg.receiverId === userId
    );

    const partnerMap = new Map<string, { lastMessage: DirectMessage; unreadCount: number }>();

    for (const msg of messages) {
      const partnerId = msg.senderId === userId ? msg.receiverId : msg.senderId;
      const existing = partnerMap.get(partnerId);
      
      if (!existing || new Date(msg.createdAt!).getTime() > new Date(existing.lastMessage.createdAt!).getTime()) {
        const unreadCount = messages.filter(
          (m) => m.senderId === partnerId && m.receiverId === userId && !m.read
        ).length;
        partnerMap.set(partnerId, { lastMessage: msg, unreadCount });
      }
    }

    return Array.from(partnerMap.entries())
      .map(([partnerId, data]) => ({ partnerId, ...data }))
      .sort((a, b) => new Date(b.lastMessage.createdAt!).getTime() - new Date(a.lastMessage.createdAt!).getTime());
  }

  async createDirectMessage(message: InsertDirectMessage): Promise<DirectMessage> {
    const id = randomUUID();
    const directMessage: DirectMessage = {
      ...message,
      id,
      read: false,
      createdAt: new Date(),
    };
    this.directMessages.set(id, directMessage);
    return directMessage;
  }

  async markDirectMessagesAsRead(senderId: string, receiverId: string): Promise<void> {
    const entries = Array.from(this.directMessages.entries());
    for (const [id, msg] of entries) {
      if (msg.senderId === senderId && msg.receiverId === receiverId && !msg.read) {
        this.directMessages.set(id, { ...msg, read: true });
      }
    }
  }

  // Notification operations
  async getNotifications(userId: string): Promise<Notification[]> {
    return Array.from(this.notifications.values())
      .filter((notif) => notif.userId === userId)
      .sort((a, b) => new Date(b.createdAt!).getTime() - new Date(a.createdAt!).getTime());
  }

  async getUnreadNotificationCount(userId: string): Promise<number> {
    return Array.from(this.notifications.values())
      .filter((notif) => notif.userId === userId && !notif.read)
      .length;
  }

  async createNotification(insertNotification: InsertNotification): Promise<Notification> {
    const id = randomUUID();
    const notification: Notification = {
      ...insertNotification,
      id,
      relatedId: insertNotification.relatedId ?? null,
      read: insertNotification.read ?? false,
      sourceType: insertNotification.sourceType ?? null,
      sourceId: insertNotification.sourceId ?? null,
      createdAt: new Date(),
    };
    this.notifications.set(id, notification);
    return notification;
  }

  async markNotificationAsRead(id: string): Promise<Notification | undefined> {
    const notification = this.notifications.get(id);
    if (!notification) return undefined;
    const updated = { ...notification, read: true };
    this.notifications.set(id, updated);
    return updated;
  }

  async markAllNotificationsAsRead(userId: string): Promise<void> {
    const entries = Array.from(this.notifications.entries());
    for (const [id, notification] of entries) {
      if (notification.userId === userId && !notification.read) {
        this.notifications.set(id, { ...notification, read: true });
      }
    }
  }

  async deleteNotification(id: string): Promise<void> {
    this.notifications.delete(id);
  }

  // User Preferences operations
  async getUserPreferences(userId: string): Promise<UserPreferences | undefined> {
    return Array.from(this.userPreferences.values()).find((p) => p.userId === userId);
  }

  async createUserPreferences(prefs: InsertUserPreferences): Promise<UserPreferences> {
    const id = randomUUID();
    const preferences: UserPreferences = {
      ...prefs,
      id,
      notificationsEnabled: prefs.notificationsEnabled ?? true,
      notificationSoundEnabled: prefs.notificationSoundEnabled ?? true,
      deleteConfirmationEnabled: prefs.deleteConfirmationEnabled ?? true,
      showOnlineStatus: prefs.showOnlineStatus ?? true,
      allowDirectMessages: prefs.allowDirectMessages ?? true,
      allowMessagesFromUnknown: prefs.allowMessagesFromUnknown ?? true,
      accountDeactivated: prefs.accountDeactivated ?? false,
      deactivatedAt: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    this.userPreferences.set(id, preferences);
    return preferences;
  }

  async updateUserPreferences(userId: string, updates: Partial<UserPreferences>): Promise<UserPreferences | undefined> {
    const existing = await this.getUserPreferences(userId);
    if (!existing) return undefined;
    const updated = { ...existing, ...updates, updatedAt: new Date() };
    this.userPreferences.set(existing.id, updated);
    return updated;
  }

  // Team Note operations
  async getTeamNotes(jobId: string): Promise<TeamNote[]> {
    return Array.from(this.teamNotes.values())
      .filter((note) => note.jobId === jobId)
      .sort((a, b) => new Date(b.createdAt!).getTime() - new Date(a.createdAt!).getTime());
  }

  async createTeamNote(insertNote: InsertTeamNote): Promise<TeamNote> {
    const id = randomUUID();
    const note: TeamNote = {
      ...insertNote,
      id,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    this.teamNotes.set(id, note);
    return note;
  }

  async updateTeamNote(id: string, updates: Partial<TeamNote>): Promise<TeamNote | undefined> {
    const note = this.teamNotes.get(id);
    if (!note) return undefined;
    const updated = { ...note, ...updates, updatedAt: new Date() };
    this.teamNotes.set(id, updated);
    return updated;
  }

  async deleteTeamNote(id: string): Promise<void> {
    this.teamNotes.delete(id);
  }

  // Team Task operations
  async getTeamTasks(jobId: string): Promise<TeamTask[]> {
    return Array.from(this.teamTasks.values())
      .filter((task) => task.jobId === jobId)
      .sort((a, b) => new Date(b.createdAt!).getTime() - new Date(a.createdAt!).getTime());
  }

  async createTeamTask(insertTask: InsertTeamTask): Promise<TeamTask> {
    const id = randomUUID();
    const task: TeamTask = {
      ...insertTask,
      id,
      description: insertTask.description ?? null,
      assigneeId: insertTask.assigneeId ?? null,
      status: insertTask.status ?? "todo",
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    this.teamTasks.set(id, task);
    return task;
  }

  async updateTeamTask(id: string, updates: Partial<TeamTask>): Promise<TeamTask | undefined> {
    const task = this.teamTasks.get(id);
    if (!task) return undefined;
    const updated = { ...task, ...updates, updatedAt: new Date() };
    this.teamTasks.set(id, updated);
    return updated;
  }

  async deleteTeamTask(id: string): Promise<void> {
    this.teamTasks.delete(id);
  }

  // Team Message operations
  async getTeamMessages(jobId: string): Promise<TeamMessage[]> {
    return Array.from(this.teamMessages.values())
      .filter((msg) => msg.jobId === jobId)
      .sort((a, b) => new Date(a.createdAt!).getTime() - new Date(b.createdAt!).getTime());
  }

  async createTeamMessage(insertMessage: InsertTeamMessage): Promise<TeamMessage> {
    const id = randomUUID();
    const message: TeamMessage = {
      ...insertMessage,
      id,
      createdAt: new Date(),
    };
    this.teamMessages.set(id, message);
    return message;
  }

  async deleteTeamMessage(id: string): Promise<void> {
    this.teamMessages.delete(id);
  }

  // Rating operations
  async getRating(jobId: string): Promise<Rating | undefined> {
    return Array.from(this.ratings.values()).find((rating) => rating.jobId === jobId);
  }

  async getRatingsByFreelancer(freelancerId: string): Promise<Rating[]> {
    return Array.from(this.ratings.values())
      .filter((rating) => rating.freelancerId === freelancerId)
      .sort((a, b) => new Date(b.createdAt!).getTime() - new Date(a.createdAt!).getTime());
  }

  async createRating(insertRating: InsertRating): Promise<Rating> {
    const existing = await this.getRating(insertRating.jobId);
    if (existing) {
      throw new Error(`Rating already exists for job ${insertRating.jobId}`);
    }
    const id = randomUUID();
    const rating: Rating = {
      ...insertRating,
      id,
      review: insertRating.review ?? null,
      createdAt: new Date(),
    };
    this.ratings.set(id, rating);
    return rating;
  }

  // Role Upgrade Request operations
  async getRoleUpgradeRequest(id: string): Promise<RoleUpgradeRequest | undefined> {
    return this.roleUpgradeRequests.get(id);
  }

  async getRoleUpgradeRequests(filters?: { userId?: string; status?: string }): Promise<RoleUpgradeRequest[]> {
    let requests = Array.from(this.roleUpgradeRequests.values());
    if (filters?.userId) {
      requests = requests.filter((r) => r.userId === filters.userId);
    }
    if (filters?.status) {
      requests = requests.filter((r) => r.status === filters.status);
    }
    return requests.sort((a, b) => new Date(b.createdAt!).getTime() - new Date(a.createdAt!).getTime());
  }

  async getPendingRoleUpgradeRequests(): Promise<RoleUpgradeRequest[]> {
    return this.getRoleUpgradeRequests({ status: "pending" });
  }

  async createRoleUpgradeRequest(insertRequest: InsertRoleUpgradeRequest): Promise<RoleUpgradeRequest> {
    const id = randomUUID();
    const request: RoleUpgradeRequest = {
      ...insertRequest,
      id,
      status: "pending",
      experience: insertRequest.experience ?? null,
      portfolio: insertRequest.portfolio ?? null,
      reviewerId: null,
      reviewNotes: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    this.roleUpgradeRequests.set(id, request);
    return request;
  }

  async updateRoleUpgradeRequest(id: string, updates: Partial<RoleUpgradeRequest>): Promise<RoleUpgradeRequest | undefined> {
    const request = this.roleUpgradeRequests.get(id);
    if (!request) return undefined;
    const updated = { ...request, ...updates, updatedAt: new Date() };
    this.roleUpgradeRequests.set(id, updated);
    return updated;
  }

  async getReport(id: string): Promise<Report | undefined> {
    return this.reports.get(id);
  }

  async getReports(filters?: { reporterId?: string; status?: string; reportType?: string }): Promise<Report[]> {
    let reports = Array.from(this.reports.values());
    if (filters?.reporterId) {
      reports = reports.filter((r) => r.reporterId === filters.reporterId);
    }
    if (filters?.status) {
      reports = reports.filter((r) => r.status === filters.status);
    }
    if (filters?.reportType) {
      reports = reports.filter((r) => r.reportType === filters.reportType);
    }
    return reports.sort((a, b) => new Date(b.createdAt!).getTime() - new Date(a.createdAt!).getTime());
  }

  async getPendingReports(): Promise<Report[]> {
    return this.getReports({ status: "pending" });
  }

  async createReport(insertReport: InsertReport): Promise<Report> {
    const id = randomUUID();
    const report: Report = {
      ...insertReport,
      id,
      status: "pending",
      description: insertReport.description ?? null,
      reviewerId: null,
      reviewNotes: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    this.reports.set(id, report);
    return report;
  }

  async updateReport(id: string, updates: Partial<Report>): Promise<Report | undefined> {
    const report = this.reports.get(id);
    if (!report) return undefined;
    const updated = { ...report, ...updates, updatedAt: new Date() };
    this.reports.set(id, updated);
    return updated;
  }

  // Moderator Task operations
  async getModeratorTask(id: string): Promise<ModeratorTask | undefined> {
    return this.moderatorTasks.get(id);
  }

  async getModeratorTasks(assigneeId: string): Promise<ModeratorTask[]> {
    const tasks = Array.from(this.moderatorTasks.values()).filter(
      (t) => t.assigneeId === assigneeId || (t.teamMembers && t.teamMembers.includes(assigneeId))
    );
    return tasks.sort((a, b) => new Date(b.createdAt!).getTime() - new Date(a.createdAt!).getTime());
  }

  async getModeratorTasksAssignedBy(assignedById: string): Promise<ModeratorTask[]> {
    const tasks = Array.from(this.moderatorTasks.values()).filter(
      (t) => t.assignedById === assignedById
    );
    return tasks.sort((a, b) => new Date(b.createdAt!).getTime() - new Date(a.createdAt!).getTime());
  }

  async createModeratorTask(insertTask: InsertModeratorTask): Promise<ModeratorTask> {
    const id = randomUUID();
    const task: ModeratorTask = {
      ...insertTask,
      id,
      description: insertTask.description ?? null,
      taskType: insertTask.taskType ?? "personal",
      teamMembers: insertTask.teamMembers ?? null,
      status: insertTask.status ?? "pending",
      priority: insertTask.priority ?? "medium",
      dueDate: insertTask.dueDate ?? null,
      completedAt: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    this.moderatorTasks.set(id, task);
    return task;
  }

  async updateModeratorTask(id: string, updates: Partial<ModeratorTask>): Promise<ModeratorTask | undefined> {
    const task = this.moderatorTasks.get(id);
    if (!task) return undefined;
    const updated = { ...task, ...updates, updatedAt: new Date() };
    this.moderatorTasks.set(id, updated);
    return updated;
  }

  // Moderator Meeting operations
  async getModeratorMeeting(id: string): Promise<ModeratorMeeting | undefined> {
    return this.moderatorMeetings.get(id);
  }

  async getModeratorMeetings(moderatorId: string): Promise<ModeratorMeeting[]> {
    const meetings = Array.from(this.moderatorMeetings.values()).filter(
      (m) => m.invitedModeratorIds?.includes(moderatorId) || m.isTeamMeeting
    );
    return meetings.sort((a, b) => new Date(b.scheduledDate).getTime() - new Date(a.scheduledDate).getTime());
  }

  async getModeratorMeetingsScheduledBy(scheduledById: string): Promise<ModeratorMeeting[]> {
    const meetings = Array.from(this.moderatorMeetings.values()).filter(
      (m) => m.scheduledById === scheduledById
    );
    return meetings.sort((a, b) => new Date(b.scheduledDate).getTime() - new Date(a.scheduledDate).getTime());
  }

  async createModeratorMeeting(insertMeeting: InsertModeratorMeeting): Promise<ModeratorMeeting> {
    const id = randomUUID();
    const meeting: ModeratorMeeting = {
      ...insertMeeting,
      id,
      description: insertMeeting.description ?? null,
      duration: insertMeeting.duration ?? 60,
      isTeamMeeting: insertMeeting.isTeamMeeting ?? false,
      invitedModeratorIds: insertMeeting.invitedModeratorIds ?? null,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    this.moderatorMeetings.set(id, meeting);
    return meeting;
  }

  async updateModeratorMeeting(id: string, updates: Partial<ModeratorMeeting>): Promise<ModeratorMeeting | undefined> {
    const meeting = this.moderatorMeetings.get(id);
    if (!meeting) return undefined;
    const updated = { ...meeting, ...updates, updatedAt: new Date() };
    this.moderatorMeetings.set(id, updated);
    return updated;
  }

  // Meeting RSVP operations
  async getMeetingRsvps(meetingId: string): Promise<MeetingRsvp[]> {
    return Array.from(this.meetingRsvps.values()).filter((r) => r.meetingId === meetingId);
  }

  async getMeetingRsvpByModerator(meetingId: string, moderatorId: string): Promise<MeetingRsvp | undefined> {
    return Array.from(this.meetingRsvps.values()).find(
      (r) => r.meetingId === meetingId && r.moderatorId === moderatorId
    );
  }

  async createMeetingRsvp(insertRsvp: InsertMeetingRsvp): Promise<MeetingRsvp> {
    const id = randomUUID();
    const rsvp: MeetingRsvp = {
      ...insertRsvp,
      id,
      status: insertRsvp.status ?? "pending",
      respondedAt: null,
      createdAt: new Date(),
    };
    this.meetingRsvps.set(id, rsvp);
    return rsvp;
  }

  async updateMeetingRsvp(id: string, updates: Partial<MeetingRsvp>): Promise<MeetingRsvp | undefined> {
    const rsvp = this.meetingRsvps.get(id);
    if (!rsvp) return undefined;
    const updated = { ...rsvp, ...updates };
    this.meetingRsvps.set(id, updated);
    return updated;
  }

  // Meeting Exemption operations
  async getMeetingExemption(id: string): Promise<MeetingExemption | undefined> {
    return this.meetingExemptions.get(id);
  }

  async getMeetingExemptionsByMeeting(meetingId: string): Promise<MeetingExemption[]> {
    return Array.from(this.meetingExemptions.values()).filter((e) => e.meetingId === meetingId);
  }

  async getMeetingExemptionsByModerator(moderatorId: string): Promise<MeetingExemption[]> {
    return Array.from(this.meetingExemptions.values()).filter((e) => e.moderatorId === moderatorId);
  }

  async getPendingMeetingExemptions(): Promise<MeetingExemption[]> {
    return Array.from(this.meetingExemptions.values()).filter(
      (e) => e.status === MeetingExemptionStatus.PENDING
    );
  }

  async createMeetingExemption(insertExemption: InsertMeetingExemption): Promise<MeetingExemption> {
    const id = randomUUID();
    const exemption: MeetingExemption = {
      ...insertExemption,
      id,
      status: MeetingExemptionStatus.PENDING,
      reviewedById: null,
      reviewNote: null,
      createdAt: new Date(),
      reviewedAt: null,
    };
    this.meetingExemptions.set(id, exemption);
    return exemption;
  }

  async updateMeetingExemption(id: string, updates: Partial<MeetingExemption>): Promise<MeetingExemption | undefined> {
    const exemption = this.meetingExemptions.get(id);
    if (!exemption) return undefined;
    const updated = { ...exemption, ...updates };
    this.meetingExemptions.set(id, updated);
    return updated;
  }

  // Team Room Message operations
  async getTeamRoomMessages(limit: number = 100): Promise<TeamRoomMessage[]> {
    const messages = Array.from(this.teamRoomMessages.values());
    return messages
      .sort((a, b) => new Date(a.createdAt!).getTime() - new Date(b.createdAt!).getTime())
      .slice(-limit);
  }

  async createTeamRoomMessage(insertMessage: InsertTeamRoomMessage): Promise<TeamRoomMessage> {
    const id = randomUUID();
    const message: TeamRoomMessage = {
      ...insertMessage,
      id,
      createdAt: new Date(),
    };
    this.teamRoomMessages.set(id, message);
    return message;
  }

  // Email verification token operations
  async getEmailVerificationToken(token: string): Promise<EmailVerificationToken | undefined> {
    return Array.from(this.emailVerificationTokens.values()).find((t) => t.token === token);
  }

  async getEmailVerificationTokenByUserId(userId: string): Promise<EmailVerificationToken | undefined> {
    return Array.from(this.emailVerificationTokens.values())
      .filter((t) => t.userId === userId && !t.usedAt)
      .sort((a, b) => new Date(b.createdAt!).getTime() - new Date(a.createdAt!).getTime())[0];
  }

  async createEmailVerificationToken(insertToken: InsertEmailVerificationToken): Promise<EmailVerificationToken> {
    const id = randomUUID();
    const token: EmailVerificationToken = {
      ...insertToken,
      id,
      usedAt: null,
      createdAt: new Date(),
    };
    this.emailVerificationTokens.set(id, token);
    return token;
  }

  async markEmailVerificationTokenUsed(tokenValue: string): Promise<EmailVerificationToken | undefined> {
    const token = await this.getEmailVerificationToken(tokenValue);
    if (!token) return undefined;
    const updated = { ...token, usedAt: new Date() };
    this.emailVerificationTokens.set(token.id, updated);
    return updated;
  }

  async deleteEmailVerificationTokensByUserId(userId: string): Promise<void> {
    const entries = Array.from(this.emailVerificationTokens.entries());
    for (const [id, token] of entries) {
      if (token.userId === userId) {
        this.emailVerificationTokens.delete(id);
      }
    }
  }

  // Job Request operations
  async getJobRequest(id: string): Promise<JobRequest | undefined> {
    return this.jobRequests.get(id);
  }

  async getJobRequestsByJob(jobId: string): Promise<JobRequest[]> {
    return Array.from(this.jobRequests.values())
      .filter((r) => r.jobId === jobId)
      .sort((a, b) => new Date(a.createdAt!).getTime() - new Date(b.createdAt!).getTime());
  }

  async getJobRequestsByFreelancer(freelancerId: string, status?: string): Promise<JobRequest[]> {
    return Array.from(this.jobRequests.values())
      .filter((r) => r.freelancerId === freelancerId && (!status || r.status === status))
      .sort((a, b) => new Date(b.createdAt!).getTime() - new Date(a.createdAt!).getTime());
  }

  async getPendingJobRequestsByFreelancer(freelancerId: string): Promise<JobRequest[]> {
    return this.getJobRequestsByFreelancer(freelancerId, "pending");
  }

  async getJobRequestByJobAndFreelancer(jobId: string, freelancerId: string): Promise<JobRequest | undefined> {
    return Array.from(this.jobRequests.values()).find(
      (r) => r.jobId === jobId && r.freelancerId === freelancerId
    );
  }

  async createJobRequest(insertRequest: InsertJobRequest): Promise<JobRequest> {
    const id = randomUUID();
    const request: JobRequest = {
      ...insertRequest,
      id,
      status: insertRequest.status ?? "pending",
      message: insertRequest.message ?? null,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    this.jobRequests.set(id, request);
    return request;
  }

  async updateJobRequest(id: string, updates: Partial<JobRequest>): Promise<JobRequest | undefined> {
    const request = this.jobRequests.get(id);
    if (!request) return undefined;
    const updated = { ...request, ...updates, updatedAt: new Date() };
    this.jobRequests.set(id, updated);
    return updated;
  }

  async cancelPendingJobRequestsByFreelancer(freelancerId: string, exceptJobId?: string): Promise<void> {
    const entries = Array.from(this.jobRequests.entries());
    for (const [id, request] of entries) {
      if (request.freelancerId === freelancerId && request.status === "pending") {
        if (!exceptJobId || request.jobId !== exceptJobId) {
          this.jobRequests.set(id, { ...request, status: "cancelled", updatedAt: new Date() });
        }
      }
    }
  }

  // Moderation Vault operations
  async getModerationVault(): Promise<ModerationVault> {
    if (!this.moderationVault) {
      this.moderationVault = {
        id: randomUUID(),
        balance: "0",
        totalDeposited: "0",
        totalDistributed: "0",
        updatedAt: new Date(),
      };
    }
    return this.moderationVault;
  }

  async depositToVault(amount: number, fromUserId: string, note?: string): Promise<VaultTransaction> {
    const vault = await this.getModerationVault();
    const currentBalance = parseFloat(vault.balance || "0");
    const totalDeposited = parseFloat(vault.totalDeposited || "0");
    
    this.moderationVault = {
      ...vault,
      balance: (currentBalance + amount).toString(),
      totalDeposited: (totalDeposited + amount).toString(),
      updatedAt: new Date(),
    };

    const id = randomUUID();
    const transaction: VaultTransaction = {
      id,
      type: "deposit",
      amount: amount.toString(),
      fromUserId,
      toUserId: null,
      distributedByUserId: null,
      note: note || null,
      createdAt: new Date(),
    };
    this.vaultTransactions.set(id, transaction);
    return transaction;
  }

  async distributeFromVault(amount: number, toUserId: string, distributedByUserId: string, note?: string): Promise<VaultTransaction> {
    const vault = await this.getModerationVault();
    const currentBalance = parseFloat(vault.balance || "0");
    const totalDistributed = parseFloat(vault.totalDistributed || "0");
    
    if (currentBalance < amount) {
      throw new Error("Insufficient vault balance");
    }
    
    this.moderationVault = {
      ...vault,
      balance: (currentBalance - amount).toString(),
      totalDistributed: (totalDistributed + amount).toString(),
      updatedAt: new Date(),
    };

    const id = randomUUID();
    const transaction: VaultTransaction = {
      id,
      type: "distribution",
      amount: amount.toString(),
      fromUserId: null,
      toUserId,
      distributedByUserId,
      note: note || null,
      createdAt: new Date(),
    };
    this.vaultTransactions.set(id, transaction);
    return transaction;
  }

  async getVaultTransactions(limit: number = 50): Promise<VaultTransaction[]> {
    return Array.from(this.vaultTransactions.values())
      .sort((a, b) => new Date(b.createdAt!).getTime() - new Date(a.createdAt!).getTime())
      .slice(0, limit);
  }

  // Friend operations
  async getFriends(userId: string): Promise<Friend[]> {
    return Array.from(this.friends.values())
      .filter(f => f.userId === userId || f.friendId === userId);
  }

  async getFriendRequest(id: string): Promise<FriendRequest | undefined> {
    return this.friendRequests.get(id);
  }

  async getFriendRequestsByUser(userId: string): Promise<FriendRequest[]> {
    return Array.from(this.friendRequests.values())
      .filter(r => r.fromUserId === userId || r.toUserId === userId)
      .sort((a, b) => new Date(b.createdAt!).getTime() - new Date(a.createdAt!).getTime());
  }

  async getIncomingFriendRequests(userId: string): Promise<FriendRequest[]> {
    return Array.from(this.friendRequests.values())
      .filter(r => r.toUserId === userId && r.status === "pending")
      .sort((a, b) => new Date(b.createdAt!).getTime() - new Date(a.createdAt!).getTime());
  }

  async getFriendRequestBetweenUsers(userId1: string, userId2: string): Promise<FriendRequest | undefined> {
    return Array.from(this.friendRequests.values())
      .find(r => 
        (r.fromUserId === userId1 && r.toUserId === userId2) ||
        (r.fromUserId === userId2 && r.toUserId === userId1)
      );
  }

  async areFriends(userId1: string, userId2: string): Promise<boolean> {
    return Array.from(this.friends.values())
      .some(f => 
        (f.userId === userId1 && f.friendId === userId2) ||
        (f.userId === userId2 && f.friendId === userId1)
      );
  }

  async areUsersConnected(userId1: string, userId2: string): Promise<boolean> {
    if (userId1 === userId2) return true;

    if (await this.areFriends(userId1, userId2)) {
      return true;
    }

    const jobs = Array.from(this.jobs.values());
    for (const job of jobs) {
      const isUser1Involved = job.customerId === userId1 || 
                              job.freelancerId === userId1 || 
                              job.collaborators?.includes(userId1);
      const isUser2Involved = job.customerId === userId2 || 
                              job.freelancerId === userId2 || 
                              job.collaborators?.includes(userId2);
      if (isUser1Involved && isUser2Involved) {
        return true;
      }
    }

    const existingMessages = Array.from(this.directMessages.values())
      .some(msg => 
        (msg.senderId === userId1 && msg.receiverId === userId2) ||
        (msg.senderId === userId2 && msg.receiverId === userId1)
      );
    if (existingMessages) {
      return true;
    }

    return false;
  }

  async createFriendRequest(request: InsertFriendRequest): Promise<FriendRequest> {
    const id = randomUUID();
    const friendRequest: FriendRequest = {
      id,
      ...request,
      status: request.status || "pending",
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    this.friendRequests.set(id, friendRequest);
    return friendRequest;
  }

  async updateFriendRequest(id: string, updates: Partial<FriendRequest>): Promise<FriendRequest | undefined> {
    const request = this.friendRequests.get(id);
    if (!request) return undefined;
    const updated = { ...request, ...updates, updatedAt: new Date() };
    this.friendRequests.set(id, updated);
    return updated;
  }

  async createFriendship(userId: string, friendId: string): Promise<void> {
    const id = randomUUID();
    const friendship: Friend = {
      id,
      userId,
      friendId,
      createdAt: new Date(),
    };
    this.friends.set(id, friendship);
  }

  async removeFriendship(userId: string, friendId: string): Promise<void> {
    const entries = Array.from(this.friends.entries());
    for (const [id, f] of entries) {
      if ((f.userId === userId && f.friendId === friendId) ||
          (f.userId === friendId && f.friendId === userId)) {
        this.friends.delete(id);
      }
    }
  }

  async searchUsersByUserId(userIdQuery: number): Promise<User[]> {
    return Array.from(this.users.values())
      .filter(u => u.userId === userIdQuery);
  }

  // Job Recommendation operations
  async getJobRecommendation(id: string): Promise<JobRecommendation | undefined> {
    return this.jobRecommendations.get(id);
  }

  async getJobRecommendationsByCustomer(customerId: string): Promise<JobRecommendation[]> {
    return Array.from(this.jobRecommendations.values())
      .filter(r => r.customerId === customerId)
      .sort((a, b) => new Date(b.createdAt!).getTime() - new Date(a.createdAt!).getTime());
  }

  async getJobRecommendationsByRecommender(recommenderId: string): Promise<JobRecommendation[]> {
    return Array.from(this.jobRecommendations.values())
      .filter(r => r.recommenderId === recommenderId)
      .sort((a, b) => new Date(b.createdAt!).getTime() - new Date(a.createdAt!).getTime());
  }

  async getJobRecommendationsForFreelancer(freelancerId: string): Promise<JobRecommendation[]> {
    return Array.from(this.jobRecommendations.values())
      .filter(r => r.recommendedFreelancerId === freelancerId)
      .sort((a, b) => new Date(b.createdAt!).getTime() - new Date(a.createdAt!).getTime());
  }

  async createJobRecommendation(recommendation: InsertJobRecommendation): Promise<JobRecommendation> {
    const id = randomUUID();
    const jobRecommendation: JobRecommendation = {
      id,
      ...recommendation,
      status: recommendation.status || "pending",
      recommenderMessage: recommendation.recommenderMessage ?? null,
      freelancerMessage: recommendation.freelancerMessage ?? null,
      customerNote: recommendation.customerNote ?? null,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    this.jobRecommendations.set(id, jobRecommendation);
    return jobRecommendation;
  }

  async updateJobRecommendation(id: string, updates: Partial<JobRecommendation>): Promise<JobRecommendation | undefined> {
    const recommendation = this.jobRecommendations.get(id);
    if (!recommendation) return undefined;
    const updated = { ...recommendation, ...updates, updatedAt: new Date() };
    this.jobRecommendations.set(id, updated);
    return updated;
  }

  // ============================================================
  // NEW OPERATIONS FROM SPEC - Escrow, Disputes, Job Lifecycle
  // ============================================================

  // Escrow operations
  async getEscrow(id: string): Promise<Escrow | undefined> {
    return this.escrowRecords.get(id);
  }

  async getEscrowByJob(jobId: string): Promise<Escrow | undefined> {
    return Array.from(this.escrowRecords.values()).find(e => e.jobId === jobId);
  }

  async createEscrow(insertEscrow: InsertEscrow): Promise<Escrow> {
    const id = randomUUID();
    const escrowRecord: Escrow = {
      id,
      jobId: insertEscrow.jobId,
      customerId: insertEscrow.customerId,
      totalAmount: insertEscrow.totalAmount,
      status: insertEscrow.status ?? EscrowStatus.HELD,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    this.escrowRecords.set(id, escrowRecord);
    return escrowRecord;
  }

  async updateEscrow(id: string, updates: Partial<Escrow>): Promise<Escrow | undefined> {
    const escrowRecord = this.escrowRecords.get(id);
    if (!escrowRecord) return undefined;
    const updated = { ...escrowRecord, ...updates, updatedAt: new Date() };
    this.escrowRecords.set(id, updated);
    return updated;
  }

  // Job Freelancer operations
  async getJobFreelancers(jobId: string): Promise<JobFreelancer[]> {
    return Array.from(this.jobFreelancersMap.values())
      .filter(jf => jf.jobId === jobId);
  }

  async getJobFreelancersByFreelancer(freelancerId: string): Promise<JobFreelancer[]> {
    return Array.from(this.jobFreelancersMap.values())
      .filter(jf => jf.freelancerId === freelancerId);
  }

  async createJobFreelancer(insertJF: InsertJobFreelancer): Promise<JobFreelancer> {
    const id = randomUUID();
    const jf: JobFreelancer = {
      id,
      jobId: insertJF.jobId,
      freelancerId: insertJF.freelancerId,
      shareAmount: insertJF.shareAmount,
      levelAtTime: insertJF.levelAtTime,
      payoutAmount: insertJF.payoutAmount ?? null,
      status: insertJF.status ?? JobFreelancerStatus.ACCEPTED,
      createdAt: new Date(),
    };
    this.jobFreelancersMap.set(id, jf);
    return jf;
  }

  async updateJobFreelancer(id: string, updates: Partial<JobFreelancer>): Promise<JobFreelancer | undefined> {
    const jf = this.jobFreelancersMap.get(id);
    if (!jf) return undefined;
    const updated = { ...jf, ...updates };
    this.jobFreelancersMap.set(id, updated);
    return updated;
  }

  // Job Submission operations
  async getJobSubmission(id: string): Promise<JobSubmission | undefined> {
    return this.jobSubmissionsMap.get(id);
  }

  async getJobSubmissions(jobId: string): Promise<JobSubmission[]> {
    return Array.from(this.jobSubmissionsMap.values())
      .filter(s => s.jobId === jobId)
      .sort((a, b) => new Date(b.submittedAt!).getTime() - new Date(a.submittedAt!).getTime());
  }

  async createJobSubmission(insertSub: InsertJobSubmission): Promise<JobSubmission> {
    const id = randomUUID();
    const submission: JobSubmission = {
      id,
      jobId: insertSub.jobId,
      freelancerId: insertSub.freelancerId,
      proofFiles: insertSub.proofFiles ?? [],
      proofLinks: insertSub.proofLinks ?? [],
      notes: insertSub.notes ?? null,
      status: insertSub.status ?? JobSubmissionStatus.SUBMITTED,
      submittedAt: new Date(),
    };
    this.jobSubmissionsMap.set(id, submission);
    return submission;
  }

  async updateJobSubmission(id: string, updates: Partial<JobSubmission>): Promise<JobSubmission | undefined> {
    const submission = this.jobSubmissionsMap.get(id);
    if (!submission) return undefined;
    const updated = { ...submission, ...updates };
    this.jobSubmissionsMap.set(id, updated);
    return updated;
  }

  // Dispute operations
  async getDispute(id: string): Promise<Dispute | undefined> {
    return this.disputesMap.get(id);
  }

  async getDisputeByJob(jobId: string): Promise<Dispute | undefined> {
    return Array.from(this.disputesMap.values()).find(d => d.jobId === jobId);
  }

  async getDisputes(filters?: { status?: string; moderatorId?: string }): Promise<Dispute[]> {
    return Array.from(this.disputesMap.values())
      .filter(d => {
        if (filters?.status && d.status !== filters.status) return false;
        if (filters?.moderatorId && d.moderatorId !== filters.moderatorId) return false;
        return true;
      })
      .sort((a, b) => new Date(b.createdAt!).getTime() - new Date(a.createdAt!).getTime());
  }

  async createDispute(insertDispute: InsertDispute): Promise<Dispute> {
    const id = randomUUID();
    const dispute: Dispute = {
      id,
      jobId: insertDispute.jobId,
      openedByUserId: insertDispute.openedByUserId,
      reason: insertDispute.reason,
      status: DisputeStatus.OPEN,
      moderatorId: null,
      resolutionNotes: null,
      freelancerAmount: null,
      customerRefund: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    this.disputesMap.set(id, dispute);
    return dispute;
  }

  async updateDispute(id: string, updates: Partial<Dispute>): Promise<Dispute | undefined> {
    const dispute = this.disputesMap.get(id);
    if (!dispute) return undefined;
    const updated = { ...dispute, ...updates, updatedAt: new Date() };
    this.disputesMap.set(id, updated);
    return updated;
  }

  // Moderation Log operations
  async getModerationLogs(filters?: { moderatorId?: string; jobId?: string }): Promise<ModerationLog[]> {
    return Array.from(this.moderationLogsMap.values())
      .filter(log => {
        if (filters?.moderatorId && log.moderatorId !== filters.moderatorId) return false;
        if (filters?.jobId && log.jobId !== filters.jobId) return false;
        return true;
      })
      .sort((a, b) => new Date(b.createdAt!).getTime() - new Date(a.createdAt!).getTime());
  }

  async createModerationLog(insertLog: InsertModerationLog): Promise<ModerationLog> {
    const id = randomUUID();
    const log: ModerationLog = {
      id,
      moderatorId: insertLog.moderatorId,
      actionType: insertLog.actionType,
      targetUserId: insertLog.targetUserId ?? null,
      jobId: insertLog.jobId ?? null,
      disputeId: insertLog.disputeId ?? null,
      notes: insertLog.notes ?? null,
      createdAt: new Date(),
    };
    this.moderationLogsMap.set(id, log);
    return log;
  }

  // Scheduled Task operations
  async getScheduledTask(id: string): Promise<ScheduledTask | undefined> {
    return this.scheduledTasksMap.get(id);
  }

  async getScheduledTasks(filters?: { jobId?: string; status?: string; taskType?: string }): Promise<ScheduledTask[]> {
    return Array.from(this.scheduledTasksMap.values())
      .filter(task => {
        if (filters?.jobId && task.jobId !== filters.jobId) return false;
        if (filters?.status && task.status !== filters.status) return false;
        if (filters?.taskType && task.taskType !== filters.taskType) return false;
        return true;
      })
      .sort((a, b) => new Date(a.runAt).getTime() - new Date(b.runAt).getTime());
  }

  async getPendingScheduledTasks(beforeDate: Date): Promise<ScheduledTask[]> {
    return Array.from(this.scheduledTasksMap.values())
      .filter(task => task.status === ScheduledTaskStatus.PENDING && new Date(task.runAt) <= beforeDate)
      .sort((a, b) => new Date(a.runAt).getTime() - new Date(b.runAt).getTime());
  }

  async createScheduledTask(insertTask: InsertScheduledTask): Promise<ScheduledTask> {
    const id = randomUUID();
    const task: ScheduledTask = {
      id,
      jobId: insertTask.jobId ?? null,
      taskType: insertTask.taskType,
      runAt: insertTask.runAt,
      status: insertTask.status ?? ScheduledTaskStatus.PENDING,
      metadata: insertTask.metadata ?? {},
      createdAt: new Date(),
    };
    this.scheduledTasksMap.set(id, task);
    return task;
  }

  async updateScheduledTask(id: string, updates: Partial<ScheduledTask>): Promise<ScheduledTask | undefined> {
    const task = this.scheduledTasksMap.get(id);
    if (!task) return undefined;
    const updated = { ...task, ...updates };
    this.scheduledTasksMap.set(id, updated);
    return updated;
  }

  // User Ban operations
  async getUserBan(userId: string): Promise<UserBan | undefined> {
    return Array.from(this.userBansMap.values()).find(b => b.userId === userId);
  }

  async getUserBans(): Promise<UserBan[]> {
    return Array.from(this.userBansMap.values())
      .sort((a, b) => new Date(b.createdAt!).getTime() - new Date(a.createdAt!).getTime());
  }

  async createUserBan(insertBan: InsertUserBan): Promise<UserBan> {
    const id = randomUUID();
    const ban: UserBan = {
      id,
      userId: insertBan.userId,
      reason: insertBan.reason,
      bannedById: insertBan.bannedById,
      fundsWithheld: insertBan.fundsWithheld ?? false,
      withheldAmount: insertBan.withheldAmount ?? null,
      createdAt: new Date(),
    };
    this.userBansMap.set(id, ban);
    return ban;
  }

  // Customer Review operations
  async getCustomerReview(id: string): Promise<CustomerReview | undefined> {
    return this.customerReviewsMap.get(id);
  }

  async getCustomerReviewBySubmission(submissionId: string): Promise<CustomerReview | undefined> {
    return Array.from(this.customerReviewsMap.values()).find(r => r.submissionId === submissionId);
  }

  async createCustomerReview(insertReview: InsertCustomerReview): Promise<CustomerReview> {
    const id = randomUUID();
    const review: CustomerReview = {
      id,
      jobId: insertReview.jobId,
      submissionId: insertReview.submissionId,
      customerId: insertReview.customerId,
      accepted: insertReview.accepted,
      rejectionReason: insertReview.rejectionReason ?? null,
      createdAt: new Date(),
    };
    this.customerReviewsMap.set(id, review);
    return review;
  }

  // Cancellation Negotiation operations
  async getCancellationNegotiation(id: string): Promise<CancellationNegotiation | undefined> {
    return this.cancellationNegotiationsMap.get(id);
  }

  async getCancellationNegotiationByJob(jobId: string): Promise<CancellationNegotiation | undefined> {
    return Array.from(this.cancellationNegotiationsMap.values()).find(n => n.jobId === jobId);
  }

  async createCancellationNegotiation(insertNeg: InsertCancellationNegotiation): Promise<CancellationNegotiation> {
    const id = randomUUID();
    const negotiation: CancellationNegotiation = {
      id,
      jobId: insertNeg.jobId,
      initiatedById: insertNeg.initiatedById,
      proposedFreelancerAmount: insertNeg.proposedFreelancerAmount ?? null,
      proposedCustomerRefund: insertNeg.proposedCustomerRefund ?? null,
      agreedByCustomer: insertNeg.agreedByCustomer ?? false,
      agreedByFreelancer: insertNeg.agreedByFreelancer ?? false,
      expiresAt: insertNeg.expiresAt,
      status: insertNeg.status ?? "negotiating",
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    this.cancellationNegotiationsMap.set(id, negotiation);
    return negotiation;
  }

  async updateCancellationNegotiation(id: string, updates: Partial<CancellationNegotiation>): Promise<CancellationNegotiation | undefined> {
    const negotiation = this.cancellationNegotiationsMap.get(id);
    if (!negotiation) return undefined;
    const updated = { ...negotiation, ...updates, updatedAt: new Date() };
    this.cancellationNegotiationsMap.set(id, updated);
    return updated;
  }
}

export let storage: IStorage = new MemStorage();

export function setStorage(newStorage: IStorage) {
  storage = newStorage;
}
