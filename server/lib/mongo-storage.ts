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
  }

  async connect(): Promise<void> {
    await this.client.connect();
    await this.db.command({ ping: 1 });
    await this.createIndexes();
    console.log('✓ Connected to MongoDB successfully');
  }

  async close(): Promise<void> {
    await this.client.close();
  }

  private async createIndexes(): Promise<void> {
    await this.users.createIndex({ discordId: 1 }, { unique: true });
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
  }

  private toUser(doc: any): User {
    return {
      id: doc._id.toString(),
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
      collaborators: doc.collaborators ?? null,
      createdAt: doc.createdAt,
      updatedAt: doc.updatedAt,
    };
  }

  private toWallet(doc: any): Wallet {
    return {
      id: doc._id.toString(),
      userId: doc.userId,
      usdtBalance: doc.usdtBalance ?? null,
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

  async createUser(insertUser: InsertUser): Promise<User> {
    const now = new Date();
    const doc = {
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
      createdAt: now,
      updatedAt: now,
    };
    const result = await this.users.insertOne(doc);
    return this.toUser({ ...doc, _id: result.insertedId });
  }

  async updateUser(id: string, updates: Partial<User>): Promise<User | undefined> {
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
}
