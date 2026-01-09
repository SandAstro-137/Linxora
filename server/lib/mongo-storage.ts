import { MongoClient, Db, Collection, ObjectId } from 'mongodb';
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
} from "@shared/schema";
import type { IStorage } from "../storage";

export class MongoStorage implements IStorage {
  private client: MongoClient;
  private db: Db;
  private users: Collection;
  private jobs: Collection;
  private wallets: Collection;
  private transactions: Collection;
  private ptoRequests: Collection;
  private invitations: Collection;
  private cancellationRequests: Collection;
  private chatMessages: Collection;
  private notifications: Collection;
  private teamNotes: Collection;
  private teamTasks: Collection;
  private teamMessages: Collection;
  private ratings: Collection;
  private counters: Collection;

  constructor(mongoUri: string) {
    // Add connection options if not already in URI
    const hasOptions = mongoUri.includes('?');
    const connectionString = hasOptions 
      ? mongoUri 
      : `${mongoUri}${mongoUri.includes('mongodb+srv://') ? '?' : '&'}retryWrites=true&w=majority`;
    
    this.client = new MongoClient(connectionString, {
      serverSelectionTimeoutMS: 5000,
      connectTimeoutMS: 10000,
    });
    this.db = this.client.db();
    this.users = this.db.collection('users');
    this.jobs = this.db.collection('jobs');
    this.wallets = this.db.collection('wallets');
    this.transactions = this.db.collection('transactions');
    this.ptoRequests = this.db.collection('ptoRequests');
    this.invitations = this.db.collection('invitations');
    this.cancellationRequests = this.db.collection('cancellationRequests');
    this.chatMessages = this.db.collection('chatMessages');
    this.notifications = this.db.collection('notifications');
    this.teamNotes = this.db.collection('teamNotes');
    this.teamTasks = this.db.collection('teamTasks');
    this.teamMessages = this.db.collection('teamMessages');
    this.ratings = this.db.collection('ratings');
    this.counters = this.db.collection('counters');
  }

  async connect(): Promise<void> {
    await this.client.connect();
    await this.db.command({ ping: 1 });
    await this.createIndexes();
    // Initialize userId counter if it doesn't exist
    await this.counters.updateOne(
      { _id: 'userId' as any },
      { $setOnInsert: { sequence: 0 } },
      { upsert: true }
    );
    console.log('✓ Connected to MongoDB successfully');
  }

  private async getNextUserId(): Promise<number> {
    const result = await this.counters.findOneAndUpdate(
      { _id: 'userId' as any },
      { $inc: { sequence: 1 } },
      { returnDocument: 'after', upsert: true }
    );
    if (!result) {
      throw new Error("Failed to generate user ID");
    }
    return result.sequence as number;
  }

  async close(): Promise<void> {
    await this.client.close();
  }

  private async createIndexes(): Promise<void> {
    await this.users.createIndex({ discordId: 1 }, { unique: true });
    await this.users.createIndex({ userId: 1 }, { unique: true });
    await this.users.createIndex({ username: 1 });
    await this.jobs.createIndex({ status: 1 });
    await this.jobs.createIndex({ customerId: 1 });
    await this.jobs.createIndex({ freelancerId: 1 });
    await this.jobs.createIndex({ category: 1 });
    await this.wallets.createIndex({ userId: 1 }, { unique: true });
    await this.transactions.createIndex({ walletId: 1 });
    await this.ptoRequests.createIndex({ freelancerId: 1 });
    await this.invitations.createIndex({ jobId: 1 });
    await this.invitations.createIndex({ toUserId: 1 });
    await this.invitations.createIndex({ fromUserId: 1 });
    await this.cancellationRequests.createIndex({ jobId: 1 });
    await this.cancellationRequests.createIndex({ requesterId: 1 });
    await this.cancellationRequests.createIndex({ status: 1 });
    await this.chatMessages.createIndex({ jobId: 1 });
    await this.chatMessages.createIndex({ senderId: 1 });
    await this.chatMessages.createIndex({ receiverId: 1 });
    await this.notifications.createIndex({ userId: 1 });
    await this.notifications.createIndex({ read: 1 });
    await this.teamNotes.createIndex({ jobId: 1 });
    await this.teamNotes.createIndex({ authorId: 1 });
    await this.teamTasks.createIndex({ jobId: 1 });
    await this.teamTasks.createIndex({ assigneeId: 1 });
    await this.teamTasks.createIndex({ status: 1 });
    await this.teamMessages.createIndex({ jobId: 1 });
    await this.teamMessages.createIndex({ senderId: 1 });
    await this.ratings.createIndex({ jobId: 1 }, { unique: true });
    await this.ratings.createIndex({ freelancerId: 1 });
    await this.ratings.createIndex({ customerId: 1 });
  }

  private toUser(doc: any): User {
    return {
      id: doc._id.toString(),
      userId: doc.userId,
      discordId: doc.discordId,
      username: doc.username,
      email: doc.email ?? null,
      avatar: doc.avatar ?? null,
      role: doc.role,
      level: doc.level ?? null,
      specialization: doc.specialization ?? null,
      workingHours: doc.workingHours ?? null,
      completedJobs: doc.completedJobs ?? null,
      rating: doc.rating ?? null,
      onboardingCompleted: doc.onboardingCompleted ?? false,
      totalRatings: doc.totalRatings ?? 0,
      completionPercentage: doc.completionPercentage ?? "0",
      createdAt: doc.createdAt,
      updatedAt: doc.updatedAt,
    };
  }

  private toJob(doc: any): Job {
    return {
      id: doc._id.toString(),
      customerId: doc.customerId,
      title: doc.title,
      description: doc.description,
      category: doc.category,
      budget: doc.budget,
      requirements: doc.requirements ?? null,
      deadline: doc.deadline ?? null,
      status: doc.status,
      freelancerId: doc.freelancerId ?? null,
      collaborators: doc.collaborators ?? [],
      moderatorFeedback: doc.moderatorFeedback ?? null,
      createdAt: doc.createdAt,
      updatedAt: doc.updatedAt,
    };
  }

  private toWallet(doc: any): Wallet {
    return {
      id: doc._id.toString(),
      userId: doc.userId,
      usdtBalance: doc.usdtBalance ?? null,
      pendingUsdtBalance: doc.pendingUsdtBalance ?? "0",
      solBalance: doc.solBalance ?? null,
      btcBalance: doc.btcBalance ?? null,
      ltcBalance: doc.ltcBalance ?? null,
      walletAddress: doc.walletAddress ?? null,
      createdAt: doc.createdAt,
      updatedAt: doc.updatedAt,
    };
  }

  private toTransaction(doc: any): Transaction {
    return {
      id: doc._id.toString(),
      walletId: doc.walletId,
      type: doc.type,
      currency: doc.currency,
      amount: doc.amount,
      usdAmount: doc.usdAmount ?? null,
      status: doc.status ?? null,
      transactionHash: doc.transactionHash ?? null,
      createdAt: doc.createdAt,
    };
  }

  private toPTORequest(doc: any): PTORequest {
    return {
      id: doc._id.toString(),
      freelancerId: doc.freelancerId,
      startDate: doc.startDate,
      endDate: doc.endDate,
      reason: doc.reason,
      status: doc.status,
      createdAt: doc.createdAt,
      updatedAt: doc.updatedAt,
    };
  }

  private toInvitation(doc: any): Invitation {
    return {
      id: doc._id.toString(),
      jobId: doc.jobId,
      fromUserId: doc.fromUserId,
      toUserId: doc.toUserId,
      status: doc.status ?? null,
      createdAt: doc.createdAt,
    };
  }

  private toCancellationRequest(doc: any): CancellationRequest {
    return {
      id: doc._id.toString(),
      jobId: doc.jobId,
      requesterId: doc.requesterId,
      reason: doc.reason,
      proofUrl: doc.proofUrl ?? null,
      status: doc.status,
      reviewerId: doc.reviewerId ?? null,
      reviewNotes: doc.reviewNotes ?? null,
      createdAt: doc.createdAt,
      updatedAt: doc.updatedAt,
    };
  }

  private toChatMessage(doc: any): ChatMessage {
    return {
      id: doc._id.toString(),
      jobId: doc.jobId,
      senderId: doc.senderId,
      receiverId: doc.receiverId,
      message: doc.message,
      read: doc.read ?? false,
      createdAt: doc.createdAt,
    };
  }

  private toNotification(doc: any): Notification {
    return {
      id: doc._id.toString(),
      userId: doc.userId,
      type: doc.type,
      title: doc.title,
      message: doc.message,
      relatedId: doc.relatedId ?? null,
      read: doc.read ?? false,
      createdAt: doc.createdAt,
    };
  }

  private toTeamNote(doc: any): TeamNote {
    return {
      id: doc._id.toString(),
      jobId: doc.jobId,
      authorId: doc.authorId,
      content: doc.content,
      createdAt: doc.createdAt,
      updatedAt: doc.updatedAt,
    };
  }

  private toTeamTask(doc: any): TeamTask {
    return {
      id: doc._id.toString(),
      jobId: doc.jobId,
      title: doc.title,
      description: doc.description ?? null,
      assigneeId: doc.assigneeId ?? null,
      status: doc.status,
      createdAt: doc.createdAt,
      updatedAt: doc.updatedAt,
    };
  }

  private toTeamMessage(doc: any): TeamMessage {
    return {
      id: doc._id.toString(),
      jobId: doc.jobId,
      senderId: doc.senderId,
      content: doc.content,
      createdAt: doc.createdAt,
    };
  }

  private toRating(doc: any): Rating {
    return {
      id: doc._id.toString(),
      jobId: doc.jobId,
      customerId: doc.customerId,
      freelancerId: doc.freelancerId,
      score: doc.score,
      review: doc.review ?? null,
      createdAt: doc.createdAt,
    };
  }

  async getUser(id: string): Promise<User | undefined> {
    const doc = await this.users.findOne({ _id: new ObjectId(id) });
    return doc ? this.toUser(doc) : undefined;
  }

  async getUserByDiscordId(discordId: string): Promise<User | undefined> {
    const doc = await this.users.findOne({ discordId });
    return doc ? this.toUser(doc) : undefined;
  }

  async getUserByUsername(username: string): Promise<User | undefined> {
    const doc = await this.users.findOne({ username });
    return doc ? this.toUser(doc) : undefined;
  }

  async getUsers(): Promise<User[]> {
    const docs = await this.users.find({}).sort({ createdAt: 1 }).toArray();
    return docs.map(doc => this.toUser(doc));
  }

  async createUser(insertUser: InsertUser, allowFounder: boolean = false): Promise<User> {
    // Security: Only allow Founder role creation during initial seed
    if (insertUser.role === "founder" && !allowFounder) {
      throw new Error("Cannot create user with Founder role");
    }
    
    // Security: Only one Founder can exist
    if (insertUser.role === "founder") {
      const existingFounder = await this.users.findOne({ role: "founder" });
      if (existingFounder) {
        throw new Error("Founder already exists");
      }
    }
    
    const now = new Date();
    const userId = await this.getNextUserId(); // Get sequential permanent User ID
    const doc = {
      userId,
      discordId: insertUser.discordId,
      username: insertUser.username,
      email: insertUser.email ?? null,
      avatar: insertUser.avatar ?? null,
      role: insertUser.role ?? "freelancer",
      level: insertUser.level ?? 1,
      specialization: insertUser.specialization ?? null,
      workingHours: insertUser.workingHours ?? {},
      completedJobs: insertUser.completedJobs ?? 0,
      rating: insertUser.rating ?? "0",
      onboardingCompleted: insertUser.onboardingCompleted ?? false,
      totalRatings: insertUser.totalRatings ?? 0,
      completionPercentage: insertUser.completionPercentage ?? "0",
      createdAt: now,
      updatedAt: now,
    };
    const result = await this.users.insertOne(doc);
    return this.toUser({ ...doc, _id: result.insertedId });
  }

  async updateUser(id: string, updates: Partial<User>): Promise<User | undefined> {
    // Security: Prevent role escalation to Founder via any update
    // Founder role can only be set during initial seed
    if (updates.role === "founder") {
      throw new Error("Cannot assign Founder role via user update");
    }
    
    // Security: If user is already Founder, prevent role changes
    const existingUser = await this.users.findOne({ _id: new ObjectId(id) });
    if (existingUser?.role === "founder" && updates.role && updates.role !== "founder") {
      throw new Error("Cannot change Founder's role");
    }
    
    const { id: _, ...updateDoc } = updates as any;
    const result = await this.users.findOneAndUpdate(
      { _id: new ObjectId(id) },
      { $set: { ...updateDoc, updatedAt: new Date() } },
      { returnDocument: 'after' }
    );
    return result ? this.toUser(result) : undefined;
  }

  async getJob(id: string): Promise<Job | undefined> {
    const doc = await this.jobs.findOne({ _id: new ObjectId(id) });
    return doc ? this.toJob(doc) : undefined;
  }

  async getJobs(filters?: { status?: string; customerId?: string; freelancerId?: string; category?: string }): Promise<Job[]> {
    const query: any = {};
    if (filters?.status) query.status = filters.status;
    if (filters?.customerId) query.customerId = filters.customerId;
    if (filters?.freelancerId) query.freelancerId = filters.freelancerId;
    if (filters?.category) query.category = filters.category;

    const docs = await this.jobs.find(query).sort({ createdAt: -1 }).toArray();
    return docs.map(doc => this.toJob(doc));
  }

  async getJobsByStatus(status: string): Promise<Job[]> {
    const docs = await this.jobs.find({ status }).sort({ createdAt: -1 }).toArray();
    return docs.map(doc => this.toJob(doc));
  }

  async createJob(insertJob: InsertJob): Promise<Job> {
    const now = new Date();
    const doc = {
      customerId: insertJob.customerId,
      title: insertJob.title,
      description: insertJob.description,
      category: insertJob.category,
      budget: insertJob.budget,
      requirements: insertJob.requirements ?? null,
      deadline: insertJob.deadline ?? null,
      status: insertJob.status ?? "pending",
      freelancerId: insertJob.freelancerId ?? null,
      collaborators: insertJob.collaborators ?? [],
      createdAt: now,
      updatedAt: now,
    };
    const result = await this.jobs.insertOne(doc);
    return this.toJob({ ...doc, _id: result.insertedId });
  }

  async updateJob(id: string, updates: Partial<Job>): Promise<Job | undefined> {
    const { id: _, ...updateDoc } = updates as any;
    const result = await this.jobs.findOneAndUpdate(
      { _id: new ObjectId(id) },
      { $set: { ...updateDoc, updatedAt: new Date() } },
      { returnDocument: 'after' }
    );
    return result ? this.toJob(result) : undefined;
  }

  async claimJob(jobId: string, freelancerId: string): Promise<Job | undefined> {
    const result = await this.jobs.findOneAndUpdate(
      { _id: new ObjectId(jobId), status: "active" },
      { $set: { freelancerId, status: "claimed", updatedAt: new Date() } },
      { returnDocument: 'after' }
    );
    return result ? this.toJob(result) : undefined;
  }

  async getWallet(userId: string): Promise<Wallet | undefined> {
    const doc = await this.wallets.findOne({ userId });
    return doc ? this.toWallet(doc) : undefined;
  }

  async createWallet(insertWallet: InsertWallet): Promise<Wallet> {
    const now = new Date();
    const doc = {
      userId: insertWallet.userId,
      usdtBalance: insertWallet.usdtBalance ?? "0",
      solBalance: insertWallet.solBalance ?? "0",
      btcBalance: insertWallet.btcBalance ?? "0",
      ltcBalance: insertWallet.ltcBalance ?? "0",
      walletAddress: insertWallet.walletAddress ?? null,
      createdAt: now,
      updatedAt: now,
    };
    const result = await this.wallets.insertOne(doc);
    return this.toWallet({ ...doc, _id: result.insertedId });
  }

  async updateWallet(userId: string, updates: Partial<Wallet>): Promise<Wallet | undefined> {
    const { id: _, ...updateDoc } = updates as any;
    const result = await this.wallets.findOneAndUpdate(
      { userId },
      { $set: { ...updateDoc, updatedAt: new Date() } },
      { returnDocument: 'after' }
    );
    return result ? this.toWallet(result) : undefined;
  }

  async adjustPendingBalance(userId: string, amount: number): Promise<Wallet | undefined> {
    const result = await this.wallets.findOneAndUpdate(
      { userId },
      { 
        $inc: { pendingUsdtBalance: amount },
        $set: { updatedAt: new Date() }
      },
      { returnDocument: 'after' }
    );
    return result ? this.toWallet(result) : undefined;
  }

  async getTransactions(walletId: string): Promise<Transaction[]> {
    const docs = await this.transactions.find({ walletId }).sort({ createdAt: -1 }).toArray();
    return docs.map(doc => this.toTransaction(doc));
  }

  async createTransaction(insertTransaction: InsertTransaction): Promise<Transaction> {
    const doc = {
      walletId: insertTransaction.walletId,
      type: insertTransaction.type,
      currency: insertTransaction.currency,
      amount: insertTransaction.amount,
      usdAmount: insertTransaction.usdAmount ?? null,
      status: insertTransaction.status ?? null,
      transactionHash: insertTransaction.transactionHash ?? null,
      createdAt: new Date(),
    };
    const result = await this.transactions.insertOne(doc);
    return this.toTransaction({ ...doc, _id: result.insertedId });
  }

  async getPTORequests(freelancerId: string): Promise<PTORequest[]> {
    const docs = await this.ptoRequests.find({ freelancerId }).sort({ createdAt: -1 }).toArray();
    return docs.map(doc => this.toPTORequest(doc));
  }

  async getAllPTORequests(): Promise<PTORequest[]> {
    const docs = await this.ptoRequests.find({}).sort({ createdAt: -1 }).toArray();
    return docs.map(doc => this.toPTORequest(doc));
  }

  async createPTORequest(insertRequest: InsertPTORequest): Promise<PTORequest> {
    const now = new Date();
    const doc = {
      freelancerId: insertRequest.freelancerId,
      startDate: insertRequest.startDate,
      endDate: insertRequest.endDate,
      reason: insertRequest.reason,
      status: insertRequest.status ?? "pending",
      createdAt: now,
      updatedAt: now,
    };
    const result = await this.ptoRequests.insertOne(doc);
    return this.toPTORequest({ ...doc, _id: result.insertedId });
  }

  async updatePTORequest(id: string, updates: Partial<PTORequest>): Promise<PTORequest | undefined> {
    const { id: _, ...updateDoc } = updates as any;
    const result = await this.ptoRequests.findOneAndUpdate(
      { _id: new ObjectId(id) },
      { $set: { ...updateDoc, updatedAt: new Date() } },
      { returnDocument: 'after' }
    );
    return result ? this.toPTORequest(result) : undefined;
  }

  async getInvitations(userId: string): Promise<Invitation[]> {
    const docs = await this.invitations
      .find({ $or: [{ toUserId: userId }, { fromUserId: userId }] })
      .sort({ createdAt: -1 })
      .toArray();
    return docs.map(doc => this.toInvitation(doc));
  }

  async createInvitation(insertInvitation: InsertInvitation): Promise<Invitation> {
    const doc = {
      jobId: insertInvitation.jobId,
      fromUserId: insertInvitation.fromUserId,
      toUserId: insertInvitation.toUserId,
      status: insertInvitation.status ?? null,
      createdAt: new Date(),
    };
    const result = await this.invitations.insertOne(doc);
    return this.toInvitation({ ...doc, _id: result.insertedId });
  }

  async updateInvitation(id: string, updates: Partial<Invitation>): Promise<Invitation | undefined> {
    const { id: _, ...updateDoc } = updates as any;
    const result = await this.invitations.findOneAndUpdate(
      { _id: new ObjectId(id) },
      { $set: updateDoc },
      { returnDocument: 'after' }
    );
    return result ? this.toInvitation(result) : undefined;
  }

  async getCancellationRequest(id: string): Promise<CancellationRequest | undefined> {
    const doc = await this.cancellationRequests.findOne({ _id: new ObjectId(id) });
    return doc ? this.toCancellationRequest(doc) : undefined;
  }

  async getCancellationRequests(filters?: { jobId?: string; requesterId?: string; status?: string }): Promise<CancellationRequest[]> {
    const query: any = {};
    if (filters?.jobId) query.jobId = filters.jobId;
    if (filters?.requesterId) query.requesterId = filters.requesterId;
    if (filters?.status) query.status = filters.status;

    const docs = await this.cancellationRequests
      .find(query)
      .sort({ createdAt: -1 })
      .toArray();
    return docs.map(doc => this.toCancellationRequest(doc));
  }

  async getAllCancellationRequests(): Promise<CancellationRequest[]> {
    const docs = await this.cancellationRequests
      .find({})
      .sort({ createdAt: -1 })
      .toArray();
    return docs.map(doc => this.toCancellationRequest(doc));
  }

  async createCancellationRequest(insertRequest: InsertCancellationRequest): Promise<CancellationRequest> {
    const now = new Date();
    const doc = {
      jobId: insertRequest.jobId,
      requesterId: insertRequest.requesterId,
      reason: insertRequest.reason,
      proofUrl: insertRequest.proofUrl ?? null,
      status: insertRequest.status ?? "pending",
      reviewerId: insertRequest.reviewerId ?? null,
      reviewNotes: insertRequest.reviewNotes ?? null,
      createdAt: now,
      updatedAt: now,
    };
    const result = await this.cancellationRequests.insertOne(doc);
    return this.toCancellationRequest({ ...doc, _id: result.insertedId });
  }

  async updateCancellationRequest(id: string, updates: Partial<CancellationRequest>): Promise<CancellationRequest | undefined> {
    const { id: _, ...updateDoc } = updates as any;
    const result = await this.cancellationRequests.findOneAndUpdate(
      { _id: new ObjectId(id) },
      { $set: { ...updateDoc, updatedAt: new Date() } },
      { returnDocument: 'after' }
    );
    return result ? this.toCancellationRequest(result) : undefined;
  }

  async getChatMessages(jobId: string): Promise<ChatMessage[]> {
    const docs = await this.chatMessages
      .find({ jobId })
      .sort({ createdAt: 1 })
      .toArray();
    return docs.map(doc => this.toChatMessage(doc));
  }

  async createChatMessage(insertMessage: InsertChatMessage): Promise<ChatMessage> {
    const doc = {
      jobId: insertMessage.jobId,
      senderId: insertMessage.senderId,
      receiverId: insertMessage.receiverId,
      message: insertMessage.message,
      read: insertMessage.read ?? false,
      createdAt: new Date(),
    };
    const result = await this.chatMessages.insertOne(doc);
    return this.toChatMessage({ ...doc, _id: result.insertedId });
  }

  async markChatMessagesAsRead(jobId: string, userId: string): Promise<void> {
    await this.chatMessages.updateMany(
      { jobId, receiverId: userId, read: false },
      { $set: { read: true } }
    );
  }

  async getNotifications(userId: string): Promise<Notification[]> {
    const docs = await this.notifications
      .find({ userId })
      .sort({ createdAt: -1 })
      .toArray();
    return docs.map(doc => this.toNotification(doc));
  }

  async getUnreadNotificationCount(userId: string): Promise<number> {
    return await this.notifications.countDocuments({ userId, read: false });
  }

  async createNotification(insertNotification: InsertNotification): Promise<Notification> {
    const doc = {
      userId: insertNotification.userId,
      type: insertNotification.type,
      title: insertNotification.title,
      message: insertNotification.message,
      relatedId: insertNotification.relatedId ?? null,
      read: insertNotification.read ?? false,
      createdAt: new Date(),
    };
    const result = await this.notifications.insertOne(doc);
    return this.toNotification({ ...doc, _id: result.insertedId });
  }

  async markNotificationAsRead(id: string): Promise<Notification | undefined> {
    const result = await this.notifications.findOneAndUpdate(
      { _id: new ObjectId(id) },
      { $set: { read: true } },
      { returnDocument: 'after' }
    );
    return result ? this.toNotification(result) : undefined;
  }

  async markAllNotificationsAsRead(userId: string): Promise<void> {
    await this.notifications.updateMany(
      { userId, read: false },
      { $set: { read: true } }
    );
  }

  async getTeamNotes(jobId: string): Promise<TeamNote[]> {
    const docs = await this.teamNotes
      .find({ jobId })
      .sort({ createdAt: -1 })
      .toArray();
    return docs.map(doc => this.toTeamNote(doc));
  }

  async createTeamNote(insertNote: InsertTeamNote): Promise<TeamNote> {
    const now = new Date();
    const doc = {
      jobId: insertNote.jobId,
      authorId: insertNote.authorId,
      content: insertNote.content,
      createdAt: now,
      updatedAt: now,
    };
    const result = await this.teamNotes.insertOne(doc);
    return this.toTeamNote({ ...doc, _id: result.insertedId });
  }

  async updateTeamNote(id: string, updates: Partial<TeamNote>): Promise<TeamNote | undefined> {
    const { id: _, ...updateDoc } = updates as any;
    const result = await this.teamNotes.findOneAndUpdate(
      { _id: new ObjectId(id) },
      { $set: { ...updateDoc, updatedAt: new Date() } },
      { returnDocument: 'after' }
    );
    return result ? this.toTeamNote(result) : undefined;
  }

  async deleteTeamNote(id: string): Promise<void> {
    await this.teamNotes.deleteOne({ _id: new ObjectId(id) });
  }

  async getTeamTasks(jobId: string): Promise<TeamTask[]> {
    const docs = await this.teamTasks
      .find({ jobId })
      .sort({ createdAt: -1 })
      .toArray();
    return docs.map(doc => this.toTeamTask(doc));
  }

  async createTeamTask(insertTask: InsertTeamTask): Promise<TeamTask> {
    const now = new Date();
    const doc = {
      jobId: insertTask.jobId,
      title: insertTask.title,
      description: insertTask.description ?? null,
      assigneeId: insertTask.assigneeId ?? null,
      status: insertTask.status ?? "todo",
      createdAt: now,
      updatedAt: now,
    };
    const result = await this.teamTasks.insertOne(doc);
    return this.toTeamTask({ ...doc, _id: result.insertedId });
  }

  async updateTeamTask(id: string, updates: Partial<TeamTask>): Promise<TeamTask | undefined> {
    const { id: _, ...updateDoc } = updates as any;
    const result = await this.teamTasks.findOneAndUpdate(
      { _id: new ObjectId(id) },
      { $set: { ...updateDoc, updatedAt: new Date() } },
      { returnDocument: 'after' }
    );
    return result ? this.toTeamTask(result) : undefined;
  }

  async deleteTeamTask(id: string): Promise<void> {
    await this.teamTasks.deleteOne({ _id: new ObjectId(id) });
  }

  async getTeamMessages(jobId: string): Promise<TeamMessage[]> {
    const docs = await this.teamMessages
      .find({ jobId })
      .sort({ createdAt: 1 })
      .toArray();
    
    const messages = docs.map(doc => this.toTeamMessage(doc));
    
    const enrichedMessages = await Promise.all(
      messages.map(async (msg) => {
        const sender = await this.getUser(msg.senderId);
        return {
          ...msg,
          senderUsername: sender?.username ?? null,
          senderAvatar: sender?.avatar ?? null,
        };
      })
    );
    
    return enrichedMessages;
  }

  async createTeamMessage(insertMessage: InsertTeamMessage): Promise<TeamMessage> {
    const now = new Date();
    const doc = {
      jobId: insertMessage.jobId,
      senderId: insertMessage.senderId,
      content: insertMessage.content,
      createdAt: now,
    };
    const result = await this.teamMessages.insertOne(doc);
    const message = this.toTeamMessage({ ...doc, _id: result.insertedId });
    
    const sender = await this.getUser(message.senderId);
    return {
      ...message,
      senderUsername: sender?.username ?? null,
      senderAvatar: sender?.avatar ?? null,
    } as TeamMessage;
  }

  async deleteTeamMessage(id: string): Promise<void> {
    await this.teamMessages.deleteOne({ _id: new ObjectId(id) });
  }

  async getRating(jobId: string): Promise<Rating | undefined> {
    const doc = await this.ratings.findOne({ jobId });
    return doc ? this.toRating(doc) : undefined;
  }

  async getRatingsByFreelancer(freelancerId: string): Promise<Rating[]> {
    const docs = await this.ratings
      .find({ freelancerId })
      .sort({ createdAt: -1 })
      .toArray();
    return docs.map(doc => this.toRating(doc));
  }

  async createRating(insertRating: InsertRating): Promise<Rating> {
    const doc = {
      jobId: insertRating.jobId,
      customerId: insertRating.customerId,
      freelancerId: insertRating.freelancerId,
      score: insertRating.score,
      review: insertRating.review ?? null,
      createdAt: new Date(),
    };
    const result = await this.ratings.insertOne(doc);
    return this.toRating({ ...doc, _id: result.insertedId });
  }
}
