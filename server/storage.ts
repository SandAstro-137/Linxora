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
} from "@shared/schema";
import { randomUUID } from "crypto";

export interface IStorage {
  // User operations
  getUser(id: string): Promise<User | undefined>;
  getUserByDiscordId(discordId: string): Promise<User | undefined>;
  getUserByUsername(username: string): Promise<User | undefined>;
  createUser(user: InsertUser): Promise<User>;
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
}

export class MemStorage implements IStorage {
  private users: Map<string, User>;
  private jobs: Map<string, Job>;
  private wallets: Map<string, Wallet>;
  private transactions: Map<string, Transaction>;
  private ptoRequests: Map<string, PTORequest>;
  private invitations: Map<string, Invitation>;
  private cancellationRequests: Map<string, CancellationRequest>;

  constructor() {
    this.users = new Map();
    this.jobs = new Map();
    this.wallets = new Map();
    this.transactions = new Map();
    this.ptoRequests = new Map();
    this.invitations = new Map();
    this.cancellationRequests = new Map();
  }

  // User operations
  async getUser(id: string): Promise<User | undefined> {
    return this.users.get(id);
  }

  async getUserByDiscordId(discordId: string): Promise<User | undefined> {
    return Array.from(this.users.values()).find((user) => user.discordId === discordId);
  }

  async getUserByUsername(username: string): Promise<User | undefined> {
    return Array.from(this.users.values()).find((user) => user.username === username);
  }

  async createUser(insertUser: InsertUser): Promise<User> {
    const id = randomUUID();
    const user: User = {
      ...insertUser,
      id,
      email: insertUser.email ?? null,
      avatar: insertUser.avatar ?? null,
      specialization: insertUser.specialization ?? null,
      role: insertUser.role ?? "freelancer",
      level: insertUser.level ?? 1,
      completedJobs: insertUser.completedJobs ?? 0,
      rating: insertUser.rating ?? "0",
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
}

export let storage: IStorage = new MemStorage();

export function setStorage(newStorage: IStorage) {
  storage = newStorage;
}
