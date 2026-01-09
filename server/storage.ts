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
  type TeamRoomMessage,
  type InsertTeamRoomMessage,
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

  // Chat Message operations
  getChatMessages(jobId: string): Promise<ChatMessage[]>;
  createChatMessage(message: InsertChatMessage): Promise<ChatMessage>;
  markChatMessagesAsRead(jobId: string, userId: string): Promise<void>;

  // Notification operations
  getNotifications(userId: string): Promise<Notification[]>;
  getUnreadNotificationCount(userId: string): Promise<number>;
  createNotification(notification: InsertNotification): Promise<Notification>;
  markNotificationAsRead(id: string): Promise<Notification | undefined>;
  markAllNotificationsAsRead(userId: string): Promise<void>;

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

  // Team Room Message operations
  getTeamRoomMessages(limit?: number): Promise<TeamRoomMessage[]>;
  createTeamRoomMessage(message: InsertTeamRoomMessage): Promise<TeamRoomMessage>;
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
  private userIdCounter: number;

  constructor() {
    this.users = new Map();
    this.jobs = new Map();
    this.userIdCounter = 1; // Sequential user IDs start at 1
    this.wallets = new Map();
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
    const user: User = {
      ...insertUser,
      id,
      userId,
      email: insertUser.email ?? null,
      avatar: insertUser.avatar ?? null,
      specialization: insertUser.specialization ?? null,
      role: insertUser.role ?? "freelancer",
      level: insertUser.level ?? 1,
      completedJobs: insertUser.completedJobs ?? 0,
      rating: insertUser.rating ?? "0",
      onboardingCompleted: insertUser.onboardingCompleted ?? false,
      totalRatings: insertUser.totalRatings ?? 0,
      completionPercentage: insertUser.completionPercentage ?? "0",
      workingHours: insertUser.workingHours ?? {},
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
      status: insertJob.status ?? "pending",
      freelancerId: insertJob.freelancerId ?? null,
      requirements: insertJob.requirements ?? null,
      deadline: insertJob.deadline ?? null,
      collaborators: insertJob.collaborators ?? [],
      moderatorFeedback: insertJob.moderatorFeedback ?? null,
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
}

export let storage: IStorage = new MemStorage();

export function setStorage(newStorage: IStorage) {
  storage = newStorage;
}
