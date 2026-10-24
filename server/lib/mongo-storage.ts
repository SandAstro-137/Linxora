import { MongoClient, Db, Collection, ObjectId } from 'mongodb';
import { randomUUID } from "crypto";
import {
  type User,
  type InsertUser,
  type Job,
  type InsertJob,
  type JobFreelancer,
  type InsertJobFreelancer,
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
  type CustomerRating,
  type InsertCustomerRating,
  type DirectMessage,
  type InsertDirectMessage,
  type Friend,
  type FriendRequest,
  type InsertFriendRequest,
} from "@shared/schema";
import { AccountDeletionBlockedError, type IStorage } from "../storage";
import { getWalletBalanceBlockReason } from "./wallet-amounts";
import { EmailAlreadyInUseError, findEmailConflict, normalizeEmailAddress } from "./email-uniqueness";

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
  private customerRatings: Collection;
  private directMessages: Collection;
  private friends: Collection;
  private friendRequests: Collection;
  private jobFreelancers: Collection;
  private counters: Collection;
  private emailClaims: Collection;

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
    this.customerRatings = this.db.collection('customerRatings');
    this.directMessages = this.db.collection('directMessages');
    this.friends = this.db.collection('friends');
    this.friendRequests = this.db.collection('friendRequests');
    this.jobFreelancers = this.db.collection('jobFreelancers');
    this.counters = this.db.collection('counters');
    this.emailClaims = this.db.collection('emailClaims');
  }

  async connect(): Promise<void> {
    await this.client.connect();
    await this.db.command({ ping: 1 });
    // Older deployments may have users with missing/non-numeric IDs and a
    // counter that was never advanced. Repair records before creating the unique ID index.
    const highestExistingUser = await this.users.find({ userId: { $type: "number" } })
      .sort({ userId: -1 })
      .limit(1)
      .project({ userId: 1 })
      .next();
    const minimumSequence = highestExistingUser && Number.isSafeInteger(highestExistingUser.userId)
      ? highestExistingUser.userId
      : 0;
    await this.counters.updateOne(
      { _id: 'userId' as any },
      [{ $set: { sequence: { $max: [{ $ifNull: ["$sequence", 0] }, minimumSequence] } } }],
      { upsert: true }
    );

    const usersWithoutNumericIds = this.users.find({ userId: { $not: { $type: "number" } } })
      .sort({ createdAt: 1, _id: 1 })
      .project({ _id: 1 });
    for await (const user of usersWithoutNumericIds) {
      const userId = await this.getNextUserId();
      await this.users.updateOne(
        { _id: user._id, userId: { $not: { $type: "number" } } },
        { $set: { userId } }
      );
    }

    await this.createIndexes();
    await this.syncEmailClaims();
    console.log('✓ Connected to MongoDB successfully');
  }

  private async getNextUserId(): Promise<number> {
    const counter = await this.counters.findOneAndUpdate(
      { _id: 'userId' as any },
      { $inc: { sequence: 1 } },
      { returnDocument: 'after', upsert: true }
    );
    if (!counter || !Number.isSafeInteger(counter.sequence) || counter.sequence < 1) {
      throw new Error("Failed to generate user ID");
    }
    return counter.sequence;
  }

  async close(): Promise<void> {
    await this.client.close();
  }

  private async syncEmailClaims(): Promise<void> {
    const users = await this.users.find({}).sort({ createdAt: 1, _id: 1 }).toArray();
    for (const user of users) {
      const emails = new Set([
        normalizeEmailAddress(user.email),
        normalizeEmailAddress(user.pendingEmail),
      ].filter((email): email is string => !!email));
      for (const email of Array.from(emails)) {
        // When older data already contains duplicates, the oldest account keeps
        // the claim. Do not delete or otherwise rewrite the existing accounts.
        try {
          await this.emailClaims.updateOne(
            { _id: email } as any,
            { $setOnInsert: { userId: user._id } },
            { upsert: true },
          );
        } catch (error: any) {
          if (error?.code !== 11000) throw error;
        }
      }
    }
  }

  private async reserveEmail(email: string, userId: string): Promise<boolean> {
    const normalizedEmail = normalizeEmailAddress(email);
    if (!normalizedEmail) return false;

    let inserted = false;
    try {
      const result = await this.emailClaims.updateOne(
        { _id: normalizedEmail } as any,
        { $setOnInsert: { userId: new ObjectId(userId) } },
        { upsert: true },
      );
      inserted = result.upsertedCount === 1;
    } catch (error: any) {
      if (error?.code !== 11000) throw error;
    }

    const claim = await this.emailClaims.findOne({ _id: normalizedEmail } as any);
    if (!claim || String(claim.userId) !== userId) throw new EmailAlreadyInUseError();
    return inserted;
  }

  private async releaseEmailClaims(userId: string, emails?: Array<string | null | undefined>): Promise<void> {
    const normalizedEmails = emails?.map(normalizeEmailAddress).filter((email): email is string => !!email);
    if (normalizedEmails) {
      if (normalizedEmails.length > 0) {
        await this.emailClaims.deleteMany({ userId: new ObjectId(userId), _id: { $in: Array.from(new Set(normalizedEmails)) } } as any);
      }
      return;
    }
    await this.emailClaims.deleteMany({ userId: new ObjectId(userId) });
  }

  private async createIndexes(): Promise<void> {
    await this.users.createIndex({ discordId: 1 }, { unique: true });
    await this.users.createIndex({ userId: 1 }, { unique: true });
    await this.users.createIndex({ username: 1 });
    await this.friendRequests.createIndex({ fromUserId: 1, toUserId: 1, createdAt: -1 });
    await this.friends.createIndex({ userId: 1 });
    await this.friends.createIndex({ friendId: 1 });
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
    await this.ratings.createIndex({ jobId: 1, freelancerId: 1 }, { unique: true });
    await this.ratings.createIndex({ freelancerId: 1 });
    await this.ratings.createIndex({ customerId: 1 });
    await this.customerRatings.createIndex({ jobId: 1 }, { unique: true });
    await this.jobFreelancers.createIndex({ freelancerId: 1 });
    await this.jobFreelancers.createIndex({ jobId: 1 });
    await this.customerRatings.createIndex({ customerId: 1 });
    await this.customerRatings.createIndex({ freelancerId: 1 });
  }

  private toUser(doc: any): User {
    return {
      ...doc,
      id: doc._id.toString(),
      userId: doc.userId,
      discordId: doc.discordId,
      username: doc.username,
      email: doc.email ?? null,
      avatar: doc.avatar ?? null,
      role: doc.role,
      level: doc.level ?? null,
      specialization: doc.specialization ?? null,
      portfolio: doc.portfolio ?? null,
      workingHours: doc.workingHours ?? null,
      completedJobs: doc.completedJobs ?? null,
      totalJobs: doc.totalJobs ?? 0,
      rating: doc.rating ?? null,
      onboardingCompleted: doc.onboardingCompleted ?? false,
      totalRatings: doc.totalRatings ?? 0,
      completionPercentage: doc.completionPercentage ?? "0",
      totalEarned: doc.totalEarned ?? "0",
      blacklistedFreelancers: doc.blacklistedFreelancers ?? [],
      accountStatus: doc.accountStatus ?? "active",
      suspendedUntil: doc.suspendedUntil ?? null,
      suspendedReason: doc.suspendedReason ?? null,
      lastActive: doc.lastActive ?? null,
      createdAt: doc.createdAt,
      updatedAt: doc.updatedAt,
    };
  }

  private toJob(doc: any): Job {
    return {
      ...doc,
      id: doc._id.toString(),
      customerId: doc.customerId,
      title: doc.title,
      description: doc.description,
      category: doc.category,
      budget: doc.budget,
      requirements: doc.requirements ?? null,
      deadline: doc.deadline ?? null,
      lastDeadlineReminderAt: doc.lastDeadlineReminderAt ?? null,
      deadlineArrivalNotified: doc.deadlineArrivalNotified ?? false,
      status: doc.status,
      freelancerId: doc.freelancerId ?? null,
      projectLeaderId: doc.projectLeaderId ?? null,
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
      dismissed: doc.dismissed ?? false,
      sourceType: doc.sourceType ?? null,
      sourceId: doc.sourceId ?? null,
      redirectUrl: doc.redirectUrl ?? null,
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

  private toCustomerRating(doc: any): CustomerRating {
    return {
      id: doc._id.toString(),
      jobId: doc.jobId,
      freelancerId: doc.freelancerId,
      customerId: doc.customerId,
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

  async getUserByEmail(email: string): Promise<User | undefined> {
    const normalizedEmail = normalizeEmailAddress(email);
    if (!normalizedEmail) return undefined;
    const doc = await this.users.findOne({ email: { $regex: `^${normalizedEmail.replace(/[.*+?^${}()|[\\]\\]/g, "\\$&")}$`, $options: "i" } });
    return doc ? this.toUser(doc) : undefined;
  }

  async getUserByUsername(username: string): Promise<User | undefined> {
    const doc = await this.users.findOne({ username });
    return doc ? this.toUser(doc) : undefined;
  }

  async getUserByUserId(userId: number): Promise<User | undefined> {
    const doc = await this.users.findOne({ userId });
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
    
    const requestedEmail = normalizeEmailAddress(insertUser.email);
    const requestedPendingEmail = normalizeEmailAddress(insertUser.pendingEmail);
    if (requestedEmail || requestedPendingEmail) {
      const existingUsers = await this.users.find({}).toArray();
      if (findEmailConflict(existingUsers.map((user: any) => ({
        id: user._id.toString(),
        email: user.email,
        pendingEmail: user.pendingEmail,
      })), [requestedEmail, requestedPendingEmail])) {
        throw new EmailAlreadyInUseError();
      }
    }

    const userObjectId = new ObjectId();
    let userId = 0;
    const claimedEmails: string[] = [];
    try {
      userId = await this.getNextUserId();
      for (const email of Array.from(new Set([requestedEmail, requestedPendingEmail].filter((value): value is string => !!value)))) {
        if (await this.reserveEmail(email, userObjectId.toString())) claimedEmails.push(email);
      }
    } catch (error) {
      await this.releaseEmailClaims(userObjectId.toString(), claimedEmails);
      throw error;
    }

    const now = new Date();
    const doc = {
      _id: userObjectId,
      userId,
      discordId: insertUser.discordId,
      username: insertUser.username,
      email: insertUser.email ?? null,
      emailVerified: insertUser.emailVerified ?? false,
      pendingEmail: insertUser.pendingEmail ?? null,
      avatar: insertUser.avatar ?? null,
      bio: insertUser.bio ?? null,
      role: insertUser.role ?? "customer",
      level: insertUser.level ?? 1,
      specialization: insertUser.specialization ?? null,
      portfolio: insertUser.portfolio ?? null,
      workingHours: insertUser.workingHours ?? {},
      completedJobs: insertUser.completedJobs ?? 0,
      totalJobs: insertUser.totalJobs ?? 0,
      rating: insertUser.rating ?? "0",
      onboardingCompleted: insertUser.onboardingCompleted ?? false,
      totalRatings: insertUser.totalRatings ?? 0,
      completionPercentage: insertUser.completionPercentage ?? "0",
      totalEarned: insertUser.totalEarned ?? "0",
      blacklistedFreelancers: insertUser.blacklistedFreelancers ?? [],
      accountStatus: insertUser.accountStatus ?? "active",
      suspendedUntil: insertUser.suspendedUntil ?? null,
      suspendedReason: insertUser.suspendedReason ?? null,
      lastActive: insertUser.lastActive ?? now,
      createdAt: now,
      updatedAt: now,
    };
    try {
      const result = await this.users.insertOne(doc);
      return this.toUser({ ...doc, _id: result.insertedId });
    } catch (error: any) {
      await this.releaseEmailClaims(userObjectId.toString(), claimedEmails);
      if (error?.code === 11000 && (error?.keyPattern?.email || error?.keyPattern?.pendingEmail)) {
        throw new EmailAlreadyInUseError();
      }
      throw error;
    }
  }

  async getAccountDeletionBlockReasons(userId: string): Promise<string[]> {
    const issues: string[] = [];
    const possibleUserIds: unknown[] = [userId];
    if (ObjectId.isValid(userId)) possibleUserIds.push(new ObjectId(userId));
    const relatedJobs = await this.jobs.find({
      $or: [
        { customerId: { $in: possibleUserIds } },
        { freelancerId: { $in: possibleUserIds } },
        { projectLeaderId: { $in: possibleUserIds } },
        { collaborators: { $in: possibleUserIds } },
      ],
    }).toArray();
    const openJobs = relatedJobs.filter(job => !["completed", "cancelled", "rejected", "expired"].includes(String(job.status ?? "").toLowerCase()));
    const postedOpenJob = openJobs.some(job => String(job.customerId) === userId);
    const assignedOpenJob = openJobs.some(job => String(job.freelancerId ?? "") === userId || String(job.projectLeaderId ?? "") === userId || job.collaborators?.some((id: unknown) => String(id) === userId));

    // Include denormalized assignment rows where the job's participant fields
    // are stale or missing.
    const assignments = await this.jobFreelancers.find({ freelancerId: { $in: possibleUserIds } }).toArray();
    const assignmentJobIds = assignments
      .filter(assignment => !["completed", "paid", "removed", "cancelled", "rejected"].includes(String(assignment.status ?? "").toLowerCase()))
      .map(assignment => String(assignment.jobId));
    const assignedJobs = assignmentJobIds.length > 0
      ? await this.jobs.find({ _id: { $in: assignmentJobIds.filter(ObjectId.isValid).map(id => new ObjectId(id)) } }).toArray()
      : [];
    const hasOpenAssignment = assignedJobs.some(job => !["completed", "cancelled", "rejected", "expired"].includes(String(job.status ?? "").toLowerCase()));
    if (postedOpenJob) issues.push("Job posted or pending — cancel or complete every job you've posted to continue.");
    if (assignedOpenJob || hasOpenAssignment) issues.push("In a job — exit or complete every job you're assigned to continue.");

    if (await this.db.collection("jobRequests").findOne({ freelancerId: { $in: possibleUserIds }, status: "pending" })) {
      issues.push("Pending job application — withdraw or resolve it to continue.");
    }

    const walletDocs = await this.wallets.find({ userId: { $in: possibleUserIds } }).toArray();
    const isNonzeroOrInvalid = (balance: unknown) => {
      const amount = Number(balance ?? 0);
      return !Number.isFinite(amount) || amount !== 0;
    };
    const walletBalanceIssue = getWalletBalanceBlockReason(walletDocs.map(wallet => ({
      currency: "USDT",
      balance: wallet.usdtBalance,
    })));
    if (walletBalanceIssue) issues.push(walletBalanceIssue);
    if (walletDocs.some(wallet => isNonzeroOrInvalid(wallet.pendingUsdtBalance))) {
      issues.push("Pending funds — wait for them to settle to continue.");
    }

    const walletIds: Array<ObjectId | string> = walletDocs.flatMap(wallet => [wallet._id as ObjectId, String(wallet._id)]);
    if (walletIds.length && await this.transactions.findOne({
      walletId: { $in: walletIds },
      status: { $in: ["pending", "processing", "in_progress", "queued"] },
    })) {
      issues.push("Pending wallet transaction — wait for it to complete to continue.");
    }

    const relatedJobIds: unknown[] = [
      ...relatedJobs.map(job => job._id),
      ...assignments.map(assignment => assignment.jobId),
    ];
    const possibleJobIds: unknown[] = [...relatedJobIds];
    for (const jobId of relatedJobIds) {
      const jobIdString = String(jobId);
      possibleJobIds.push(jobIdString);
      if (ObjectId.isValid(jobIdString)) possibleJobIds.push(new ObjectId(jobIdString));
    }
    if (await this.db.collection("escrow").findOne({
      status: { $in: ["held", "partial_refund"] },
      $or: [
        { customerId: { $in: possibleUserIds } },
        { jobId: { $in: possibleJobIds } },
      ],
    })) {
      issues.push("Funds are held in escrow — resolve the escrow to continue.");
    }
    if (await this.db.collection("moneyRequests").findOne({
      $or: [{ requesterId: { $in: possibleUserIds } }, { recipientId: { $in: possibleUserIds } }],
      status: "pending",
    })) {
      issues.push("Pending money request — accept, decline, or cancel it to continue.");
    }
    return issues;
  }

  async getAccountDeletionBlockReason(userId: string): Promise<string | null> {
    return (await this.getAccountDeletionBlockReasons(userId))[0] ?? null;
  }

  async deleteAccount(userId: string): Promise<void> {
    const blockReason = await this.getAccountDeletionBlockReason(userId);
    if (blockReason) throw new AccountDeletionBlockedError(blockReason);

    const deletedReference = `deleted-account-${randomUUID()}`;
    if (!ObjectId.isValid(userId)) throw new Error("Invalid account ID; deletion did not complete.");
    const userIds: unknown[] = [userId, new ObjectId(userId)];
    const walletDocs = await this.wallets.find({ userId: { $in: userIds } }).project({ _id: 1 }).toArray();
    const walletIds: unknown[] = walletDocs.flatMap(wallet => [wallet._id, wallet._id.toString()]);
    const remove = async (name: string, filter: Record<string, any>) => this.db.collection(name).deleteMany(filter);
    const anonymize = async (name: string, filter: Record<string, any>, fields: Record<string, any>) => {
      const set = Object.fromEntries(Object.entries(fields).map(([field, replacement]) => [field, replacement === "@deleted" ? deletedReference : replacement]));
      await this.db.collection(name).updateMany(filter, { $set: set });
    };
    const removeArrayEntry = async (collectionName: string, fieldName: string) => {
      const collection = this.db.collection(collectionName);
      const documents = await collection.find({ [fieldName]: userId }).toArray();
      for (const document of documents) {
        const entries: any = document[fieldName];
        if (Array.isArray(entries)) {
          await collection.updateOne({ _id: document._id }, { $set: { [fieldName]: entries.filter((entry: string) => entry !== userId) } });
        }
      }
    };

    // Private/account-owned records and one-to-one conversations are erased.
    await this.wallets.deleteMany({ userId: { $in: userIds } });
    await this.transactions.updateMany({ walletId: { $in: walletIds } }, { $set: { walletId: deletedReference } });
    await this.ptoRequests.deleteMany({ freelancerId: userId });
    await this.invitations.deleteMany({ $or: [{ fromUserId: userId }, { toUserId: userId }] });
    await this.cancellationRequests.deleteMany({ requesterId: userId });
    await anonymize("cancellationRequests", { reviewerId: userId }, { reviewerId: "@deleted", reviewNotes: "[deleted]" });
    await this.directMessages.deleteMany({ $or: [{ senderId: userId }, { receiverId: userId }] });
    await this.notifications.deleteMany({ userId });
    await remove("abandonRequests", { freelancerId: userId });
    await remove("roleUpgradeRequests", { userId });
    await remove("userPreferences", { userId });
    await remove("hiddenConversations", { $or: [{ userId }, { partnerId: userId }] });
    await remove("emailVerificationTokens", { userId });
    await remove("jobRequests", { freelancerId: { $in: userIds } });
    await this.jobFreelancers.deleteMany({ freelancerId: { $in: userIds } });
    await remove("oauthAccounts", { userId });
    await remove("sessions", { "session.userId": { $in: userIds } });
    await remove("friends", { $or: [{ userId }, { friendId: userId }] });
    await remove("friendRequests", { $or: [{ fromUserId: userId }, { toUserId: userId }] });
    await remove("userFollows", { $or: [{ followerId: userId }, { followingId: userId }] });
    await remove("userBlocks", { $or: [{ blockerId: userId }, { blockedId: userId }] });
    await remove("groupChatMembers", { userId });
    await remove("moneyRequests", { $or: [{ requesterId: userId }, { recipientId: userId }] });
    await remove("calendarEvents", { createdBy: userId });
    await remove("meetingRsvps", { moderatorId: userId });
    await remove("meetingExemptions", { moderatorId: userId });
    await remove("weeklyIncomes", { moderatorId: userId });

    // Retain shared marketplace/financial/moderation records only in an
    // anonymized form, redacting messages and user-authored free text.
    await anonymize("jobs", { customerId: userId }, { customerId: "@deleted", title: "[deleted]", description: "[deleted]", requirements: null });
    await anonymize("jobs", { freelancerId: userId }, { freelancerId: "@deleted" });
    await anonymize("jobs", { projectLeaderId: userId }, { projectLeaderId: "@deleted" });
    await removeArrayEntry("jobs", "collaborators");
    await anonymize("escrow", { customerId: userId }, { customerId: "@deleted" });
    await anonymize("ratings", { customerId: userId }, { customerId: "@deleted", review: "[deleted]" });
    await anonymize("ratings", { freelancerId: userId }, { freelancerId: "@deleted", review: "[deleted]" });
    await anonymize("customerRatings", { customerId: userId }, { customerId: "@deleted", review: "[deleted]" });
    await anonymize("customerRatings", { freelancerId: userId }, { freelancerId: "@deleted", review: "[deleted]" });
    await anonymize("chatMessages", { senderId: userId }, { senderId: "@deleted", message: "[deleted]" });
    await anonymize("chatMessages", { receiverId: userId }, { receiverId: "@deleted" });
    await anonymize("teamNotes", { authorId: userId }, { authorId: "@deleted", content: "[deleted]" });
    await anonymize("teamMessages", { senderId: userId }, { senderId: "@deleted", content: "[deleted]" });
    await this.teamTasks.updateMany({ assigneeId: userId }, { $set: { assigneeId: null } });
    await anonymize("reports", { reporterId: userId }, { reporterId: "@deleted", description: "[deleted]", reason: "[deleted]" });
    await anonymize("reports", { targetId: userId }, { targetId: "@deleted" });
    await anonymize("reports", { reviewerId: userId }, { reviewerId: "@deleted", reviewNotes: "[deleted]", actionTaken: "[deleted]" });
    await anonymize("moderationLogs", { moderatorId: userId }, { moderatorId: "@deleted", notes: "[deleted]" });
    await anonymize("moderationLogs", { targetUserId: userId }, { targetUserId: "@deleted" });
    await anonymize("vaultTransactions", { fromUserId: userId }, { fromUserId: "@deleted" });
    await anonymize("vaultTransactions", { toUserId: userId }, { toUserId: "@deleted" });
    await anonymize("vaultTransactions", { distributedByUserId: userId }, { distributedByUserId: "@deleted" });
    await anonymize("userBans", { userId }, { userId: "@deleted", reason: "[deleted]" });
    await anonymize("userBans", { bannedById: userId }, { bannedById: "@deleted", reason: "[deleted]" });
    await anonymize("roleUpgradeRequests", { reviewerId: userId }, { reviewerId: "@deleted", reviewNotes: "[deleted]" });
    await anonymize("meetingExemptions", { reviewedById: userId }, { reviewedById: "@deleted", reviewNote: "[deleted]" });
    await anonymize("moderatorTasks", { assignedById: userId }, { assignedById: "@deleted", title: "[deleted]", description: "[deleted]" });
    await anonymize("moderatorTasks", { assigneeId: userId }, { assigneeId: "@deleted" });
    await removeArrayEntry("moderatorTasks", "teamMembers");
    await anonymize("moderatorMeetings", { scheduledById: userId }, { scheduledById: "@deleted", title: "[deleted]", description: "[deleted]" });
    await removeArrayEntry("moderatorMeetings", "invitedModeratorIds");
    await anonymize("groupChats", { creatorId: userId }, { creatorId: "@deleted" });
    await anonymize("jobFreelancers", { freelancerId: userId }, { freelancerId: "@deleted" });
    await anonymize("jobSubmissions", { freelancerId: userId }, { freelancerId: "@deleted", notes: "[deleted]", proofFiles: [], proofLinks: [] });
    await anonymize("disputes", { openedByUserId: userId }, { openedByUserId: "@deleted", reason: "[deleted]" });
    await anonymize("disputes", { moderatorId: userId }, { moderatorId: "@deleted", resolutionNotes: "[deleted]" });
    await anonymize("customerReviews", { customerId: userId }, { customerId: "@deleted", rejectionReason: "[deleted]" });
    await anonymize("cancellationNegotiations", { initiatedById: userId }, { initiatedById: "@deleted" });
    await anonymize("jobRecommendations", { recommenderId: userId }, { recommenderId: "@deleted", recommenderMessage: "[deleted]" });
    await anonymize("jobRecommendations", { recommendedFreelancerId: userId }, { recommendedFreelancerId: "@deleted", freelancerMessage: "[deleted]" });
    await anonymize("jobRecommendations", { customerId: userId }, { customerId: "@deleted", customerNote: "[deleted]" });
    await anonymize("leadershipVotes", { initiatedById: userId }, { initiatedById: "@deleted" });
    await anonymize("leadershipVotes", { candidateId: userId }, { candidateId: "@deleted" });
    await anonymize("leadershipVoteCasts", { voterId: userId }, { voterId: "@deleted" });
    await anonymize("meetings", { moderatorId: userId }, { moderatorId: "@deleted" });
    await removeArrayEntry("meetings", "mutedUserIds");
    await this.db.collection("weeklyIncomes").updateMany({ setById: userId }, { $set: { setById: deletedReference } });
    await this.db.collection("groupChatMessages").updateMany({ senderId: userId }, { $set: { senderId: deletedReference, message: "[deleted]" } });
    await this.db.collection("teamRoomMessages").updateMany({ senderId: userId }, { $set: { senderId: deletedReference, content: "[deleted]" } });
    await this.db.collection("scheduledTasks").updateMany({ "metadata.userId": userId }, { $unset: { "metadata.userId": "" } });
    await removeArrayEntry("users", "blacklistedFreelancers");
    await remove("users", { blacklistedFreelancers: { $in: userIds } });
    const userDeleteResult = await this.users.deleteOne({ _id: new ObjectId(userId) });
    if (userDeleteResult.deletedCount !== 1) {
      throw new Error("Account record was not deleted; deletion did not complete.");
    }
    await this.releaseEmailClaims(userId);
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
    if (!existingUser) return undefined;
    const nextEmail = updates.email !== undefined ? updates.email : existingUser.email;
    const nextPendingEmail = updates.pendingEmail !== undefined ? updates.pendingEmail : existingUser.pendingEmail;
    const previousEmails = [existingUser.email, existingUser.pendingEmail];
    const requestedEmail = normalizeEmailAddress(nextEmail);
    const requestedPendingEmail = normalizeEmailAddress(nextPendingEmail);
    if (updates.pendingEmail !== undefined && requestedPendingEmail) {
      const pendingOwner = await this.users.findOne({
        $or: [
          { email: { $regex: `^${requestedPendingEmail.replace(/[.*+?^${}()|[\\]\\]/g, "\\$&")}$`, $options: "i" } },
          { pendingEmail: { $regex: `^${requestedPendingEmail.replace(/[.*+?^${}()|[\\]\\]/g, "\\$&")}$`, $options: "i" } },
        ],
        _id: { $ne: new ObjectId(id) },
      });
      if (pendingOwner) throw new EmailAlreadyInUseError();
    }
    if (updates.email !== undefined && requestedEmail) {
      const emailOwner = await this.users.findOne({
        email: { $regex: `^${requestedEmail.replace(/[.*+?^${}()|[\\]\\]/g, "\\$&")}$`, $options: "i" },
        _id: { $ne: new ObjectId(id) },
      });
      if (emailOwner) throw new EmailAlreadyInUseError();
    }
    if (requestedEmail || requestedPendingEmail) {
      const otherUsers = await this.users.find({ _id: { $ne: new ObjectId(id) } }).toArray();
      if (findEmailConflict(otherUsers.map((user: any) => ({
        id: user._id.toString(),
        email: user.email,
        pendingEmail: user.pendingEmail,
      })), [requestedEmail, requestedPendingEmail])) {
        throw new EmailAlreadyInUseError();
      }
    }

    const nextEmailSet = new Set([requestedEmail, requestedPendingEmail].filter((email): email is string => !!email));
    const previousEmailSet = new Set(previousEmails.map(normalizeEmailAddress).filter((email): email is string => !!email));
    const newlyClaimed: string[] = [];
    try {
      for (const email of Array.from(nextEmailSet)) {
        if (await this.reserveEmail(email, id)) newlyClaimed.push(email);
      }

      const { id: _, ...updateDoc } = updates as any;
      const result = await this.users.findOneAndUpdate(
        { _id: new ObjectId(id) },
        { $set: { ...updateDoc, updatedAt: new Date() } },
        { returnDocument: 'after' }
      );
      if (result) {
        await this.releaseEmailClaims(id, Array.from(previousEmailSet).filter(email => !nextEmailSet.has(email)));
        return this.toUser(result);
      }
      await this.releaseEmailClaims(id, newlyClaimed);
      return undefined;
    } catch (error: any) {
      await this.releaseEmailClaims(id, newlyClaimed);
      if (error?.code === 11000 && (error?.keyPattern?.email || error?.keyPattern?.pendingEmail)) {
        throw new EmailAlreadyInUseError();
      }
      throw error;
    }
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

  async deleteJob(id: string): Promise<void> {
    await this.jobs.deleteOne({ _id: new ObjectId(id) });
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
      projectLeaderId: insertJob.projectLeaderId ?? null,
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

  private toJobFreelancer(doc: any): JobFreelancer {
    return {
      ...doc,
      id: doc._id.toString(),
      jobId: String(doc.jobId),
      freelancerId: doc.freelancerId,
      shareAmount: doc.shareAmount,
      levelAtTime: doc.levelAtTime,
      payoutAmount: doc.payoutAmount ?? null,
      status: doc.status,
      createdAt: doc.createdAt,
    };
  }

  async getJobFreelancers(jobId: string): Promise<JobFreelancer[]> {
    const possibleIds: unknown[] = [jobId];
    if (ObjectId.isValid(jobId)) possibleIds.push(new ObjectId(jobId));
    const docs = await this.jobFreelancers.find({ jobId: { $in: possibleIds } }).toArray();
    return docs.map(doc => this.toJobFreelancer(doc));
  }

  async getJobFreelancersByFreelancer(freelancerId: string): Promise<JobFreelancer[]> {
    const docs = await this.jobFreelancers.find({ freelancerId }).toArray();
    const jobIds = docs.map(doc => String(doc.jobId));
    if (jobIds.length === 0) return [];

    // Job IDs are Mongo ObjectIds while jobFreelancer references may have
    // been persisted as either strings or ObjectIds by older versions.
    const jobs = await this.jobs.find({ _id: { $in: jobIds.filter(ObjectId.isValid).map(id => new ObjectId(id)) } }).project({ _id: 1 }).toArray();
    const canonicalJobIds = new Set(jobs.map(job => job._id.toString()));
    return docs
      .filter(doc => canonicalJobIds.has(String(doc.jobId)))
      .map(doc => this.toJobFreelancer(doc));
  }

  async createJobFreelancer(insertJF: InsertJobFreelancer): Promise<JobFreelancer> {
    const doc = {
      jobId: String(insertJF.jobId),
      freelancerId: insertJF.freelancerId,
      shareAmount: insertJF.shareAmount,
      levelAtTime: insertJF.levelAtTime,
      payoutAmount: insertJF.payoutAmount ?? null,
      status: insertJF.status ?? "accepted",
      createdAt: new Date(),
    };
    const result = await this.jobFreelancers.insertOne(doc);
    return this.toJobFreelancer({ ...doc, _id: result.insertedId });
  }

  async updateJobFreelancer(id: string, updates: Partial<JobFreelancer>): Promise<JobFreelancer | undefined> {
    const { id: _id, ...updateDoc } = updates;
    const result = await this.jobFreelancers.findOneAndUpdate(
      { _id: new ObjectId(id) },
      { $set: updateDoc },
      { returnDocument: "after" }
    );
    return result ? this.toJobFreelancer(result) : undefined;
  }

  async deleteJobFreelancer(id: string): Promise<void> {
    await this.jobFreelancers.deleteOne({ _id: new ObjectId(id) });
  }

  async removeJobFreelancer(jobId: string, freelancerId: string): Promise<void> {
    const possibleIds: unknown[] = [jobId];
    if (ObjectId.isValid(jobId)) possibleIds.push(new ObjectId(jobId));
    await this.jobFreelancers.deleteOne({ jobId: { $in: possibleIds }, freelancerId });
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

  async getInvitationsByJob(jobId: string): Promise<Invitation[]> {
    const docs = await this.invitations
      .find({ jobId })
      .sort({ createdAt: -1 })
      .toArray();
    return docs.map(doc => this.toInvitation(doc));
  }

  async getInvitation(id: string): Promise<Invitation | undefined> {
    const result = await this.invitations.findOne({ _id: new ObjectId(id) });
    return result ? this.toInvitation(result) : undefined;
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

  async getRatingForFreelancer(jobId: string, freelancerId: string): Promise<Rating | undefined> {
    const doc = await this.ratings.findOne({ jobId, freelancerId });
    return doc ? this.toRating(doc) : undefined;
  }

  async getRatingsByFreelancer(freelancerId: string): Promise<Rating[]> {
    const docs = await this.ratings
      .find({ freelancerId })
      .sort({ createdAt: -1 })
      .toArray();
    return docs.map(doc => this.toRating(doc));
  }

  async getRatingsByJob(jobId: string): Promise<Rating[]> {
    const docs = await this.ratings
      .find({ jobId })
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

  async getCustomerRating(jobId: string): Promise<CustomerRating | undefined> {
    const doc = await this.customerRatings.findOne({ jobId });
    return doc ? this.toCustomerRating(doc) : undefined;
  }

  async getCustomerRatings(customerId: string): Promise<CustomerRating[]> {
    const docs = await this.customerRatings
      .find({ customerId })
      .sort({ createdAt: -1 })
      .toArray();
    return docs.map(doc => this.toCustomerRating(doc));
  }

  async createCustomerRating(insertRating: InsertCustomerRating): Promise<CustomerRating> {
    const doc = {
      jobId: insertRating.jobId,
      freelancerId: insertRating.freelancerId,
      customerId: insertRating.customerId,
      score: insertRating.score,
      review: insertRating.review ?? null,
      createdAt: new Date(),
    };
    const result = await this.customerRatings.insertOne(doc);
    return this.toCustomerRating({ ...doc, _id: result.insertedId });
  }

  // Direct Message operations
  private toDirectMessage(doc: any): DirectMessage {
    return {
      id: doc._id.toString(),
      senderId: doc.senderId,
      receiverId: doc.receiverId,
      message: doc.message,
      read: doc.read ?? false,
      createdAt: doc.createdAt,
    };
  }

  async getDirectMessages(userId1: string, userId2: string): Promise<DirectMessage[]> {
    const docs = await this.directMessages
      .find({
        $or: [
          { senderId: userId1, receiverId: userId2 },
          { senderId: userId2, receiverId: userId1 },
        ],
      })
      .sort({ createdAt: 1 })
      .toArray();
    return docs.map(doc => this.toDirectMessage(doc));
  }

  async getConversations(userId: string): Promise<{ partnerId: string; lastMessage: DirectMessage; unreadCount: number }[]> {
    const docs = await this.directMessages
      .find({
        $or: [{ senderId: userId }, { receiverId: userId }],
      })
      .toArray();

    const messages = docs.map(doc => this.toDirectMessage(doc));
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
    const doc = {
      senderId: message.senderId,
      receiverId: message.receiverId,
      message: message.message,
      read: false,
      createdAt: new Date(),
    };
    const result = await this.directMessages.insertOne(doc);
    return this.toDirectMessage({ ...doc, _id: result.insertedId });
  }

  async markDirectMessagesAsRead(senderId: string, receiverId: string): Promise<void> {
    await this.directMessages.updateMany(
      { senderId, receiverId, read: false },
      { $set: { read: true } }
    );
  }

  // Friend operations are persisted in the same collections used by the rest
  // of MongoStorage; the previous in-memory-only implementations meant requests
  // never reached seeded Mongo demo users and disappeared after restart.
  private toFriend(doc: any): Friend {
    return {
      id: doc._id.toString(),
      userId: doc.userId,
      friendId: doc.friendId,
      createdAt: doc.createdAt,
    };
  }

  private toFriendRequest(doc: any): FriendRequest {
    return {
      id: doc._id.toString(),
      fromUserId: doc.fromUserId,
      toUserId: doc.toUserId,
      status: doc.status ?? "pending",
      createdAt: doc.createdAt,
      updatedAt: doc.updatedAt ?? doc.createdAt,
    };
  }

  async getFriends(userId: string): Promise<Friend[]> {
    const docs = await this.friends.find({ $or: [{ userId }, { friendId: userId }] }).toArray();
    return docs.map(doc => this.toFriend(doc));
  }

  async getFriendRequest(id: string): Promise<FriendRequest | undefined> {
    if (!ObjectId.isValid(id)) return undefined;
    const doc = await this.friendRequests.findOne({ _id: new ObjectId(id) });
    return doc ? this.toFriendRequest(doc) : undefined;
  }

  async getFriendRequestsByUser(userId: string): Promise<FriendRequest[]> {
    const docs = await this.friendRequests.find({ $or: [{ fromUserId: userId }, { toUserId: userId }] })
      .sort({ createdAt: -1 }).toArray();
    return docs.map(doc => this.toFriendRequest(doc));
  }

  async getIncomingFriendRequests(userId: string): Promise<FriendRequest[]> {
    const docs = await this.friendRequests.find({ toUserId: userId, status: "pending" })
      .sort({ createdAt: -1 }).toArray();
    return docs.map(doc => this.toFriendRequest(doc));
  }

  async getFriendRequestBetweenUsers(userId1: string, userId2: string): Promise<FriendRequest | undefined> {
    const doc = await this.friendRequests.findOne({
      $or: [
        { fromUserId: userId1, toUserId: userId2 },
        { fromUserId: userId2, toUserId: userId1 },
      ],
      status: { $in: ["pending", "accepted", "declined"] },
    }, { sort: { createdAt: -1 } });
    return doc ? this.toFriendRequest(doc) : undefined;
  }

  async areFriends(userId1: string, userId2: string): Promise<boolean> {
    return !!await this.friends.findOne({
      $or: [
        { userId: userId1, friendId: userId2 },
        { userId: userId2, friendId: userId1 },
      ],
    });
  }

  async createFriendRequest(request: InsertFriendRequest): Promise<FriendRequest> {
    const now = new Date();
    const doc = {
      fromUserId: request.fromUserId,
      toUserId: request.toUserId,
      status: request.status ?? "pending",
      createdAt: now,
      updatedAt: now,
    };
    const result = await this.friendRequests.insertOne(doc);
    return this.toFriendRequest({ ...doc, _id: result.insertedId });
  }

  async updateFriendRequest(id: string, updates: Partial<FriendRequest>): Promise<FriendRequest | undefined> {
    if (!ObjectId.isValid(id)) return undefined;
    const { id: _id, ...changes } = updates;
    const result = await this.friendRequests.findOneAndUpdate(
      { _id: new ObjectId(id) },
      { $set: { ...changes, updatedAt: new Date() } },
      { returnDocument: "after" }
    );
    return result ? this.toFriendRequest(result) : undefined;
  }

  async createFriendship(userId: string, friendId: string): Promise<void> {
    const existing = await this.friends.findOne({
      $or: [
        { userId, friendId },
        { userId: friendId, friendId: userId },
      ],
    });
    if (!existing) await this.friends.insertOne({ userId, friendId, createdAt: new Date() });
  }

  async removeFriendship(userId: string, friendId: string): Promise<void> {
    await this.friends.deleteMany({
      $or: [
        { userId, friendId },
        { userId: friendId, friendId: userId },
      ],
    });
    const request = await this.getFriendRequestBetweenUsers(userId, friendId);
    if (request?.status === "accepted") {
      await this.updateFriendRequest(request.id, { status: "accepted", updatedAt: new Date() });
    }
  }

  async searchUsersByUserId(userIdQuery: number): Promise<User[]> {
    const doc = await this.users.findOne({ userId: userIdQuery });
    return doc ? [this.toUser(doc)] : [];
  }

}
