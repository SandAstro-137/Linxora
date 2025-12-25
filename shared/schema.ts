import { sql } from "drizzle-orm";
import { pgTable, text, varchar, timestamp, integer, boolean, decimal, jsonb } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

// User roles enum
export const UserRole = {
  FREELANCER: "freelancer",
  CUSTOMER: "customer",
  STAFF: "staff",
  MODERATOR: "moderator"
} as const;

export type UserRoleType = typeof UserRole[keyof typeof UserRole];

// Job status enum
export const JobStatus = {
  PENDING: "pending",
  ACTIVE: "active",
  FREELANCER_REQUESTED: "freelancer_requested",
  CLAIMED: "claimed",
  IN_PROGRESS: "in_progress",
  COMPLETED: "completed",
  REJECTED: "rejected",
  CHANGES_REQUESTED: "changes_requested"
} as const;

export type JobStatusType = typeof JobStatus[keyof typeof JobStatus];

// Transaction types
export const TransactionType = {
  DEPOSIT: "deposit",
  WITHDRAWAL: "withdrawal"
} as const;

export type TransactionTypeEnum = typeof TransactionType[keyof typeof TransactionType];

// PTO status
export const PTOStatus = {
  PENDING: "pending",
  APPROVED: "approved",
  REJECTED: "rejected"
} as const;

export type PTOStatusType = typeof PTOStatus[keyof typeof PTOStatus];

// Cancellation Request status
export const CancellationStatus = {
  PENDING: "pending",
  APPROVED: "approved",
  DECLINED: "declined",
  NEEDS_MORE_EVIDENCE: "needs_more_evidence"
} as const;

export type CancellationStatusType = typeof CancellationStatus[keyof typeof CancellationStatus];

// Level payout percentages
export const LEVEL_PAYOUTS = {
  1: 0.60,
  2: 0.70,
  3: 0.75,
  4: 0.80,
  5: 0.85
} as const;

export function getLevelPayout(level: number): number {
  const clampedLevel = Math.max(1, Math.min(5, level)) as keyof typeof LEVEL_PAYOUTS;
  return LEVEL_PAYOUTS[clampedLevel];
}

// Users table
export const users = pgTable("users", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  discordId: text("discord_id").unique().notNull(),
  username: text("username").notNull(),
  email: text("email"),
  avatar: text("avatar"),
  role: text("role").notNull().default(UserRole.FREELANCER),
  level: integer("level").default(1),
  specialization: text("specialization"),
  workingHours: jsonb("working_hours").default(sql`'{}'::jsonb`),
  completedJobs: integer("completed_jobs").default(0),
  rating: decimal("rating", { precision: 3, scale: 2 }).default("0"),
  onboardingCompleted: boolean("onboarding_completed").default(false),
  totalRatings: integer("total_ratings").default(0),
  completionPercentage: decimal("completion_percentage", { precision: 5, scale: 2 }).default("0"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const insertUserSchema = createInsertSchema(users).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type InsertUser = z.infer<typeof insertUserSchema>;
export type User = typeof users.$inferSelect;

// Working hours schema
export const workingHoursSchema = z.object({
  monday: z.object({ start: z.string(), end: z.string() }),
  tuesday: z.object({ start: z.string(), end: z.string() }),
  wednesday: z.object({ start: z.string(), end: z.string() }),
  thursday: z.object({ start: z.string(), end: z.string() }),
  friday: z.object({ start: z.string(), end: z.string() }),
  saturday: z.object({ start: z.string(), end: z.string() }),
  sunday: z.object({ start: z.string(), end: z.string() }),
});

export type WorkingHours = z.infer<typeof workingHoursSchema>;

// Jobs table
export const jobs = pgTable("jobs", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  customerId: varchar("customer_id").notNull(),
  title: text("title").notNull(),
  description: text("description").notNull(),
  category: text("category").notNull(),
  budget: decimal("budget", { precision: 10, scale: 2 }).notNull(),
  requirements: text("requirements"),
  deadline: timestamp("deadline"),
  status: text("status").notNull().default(JobStatus.PENDING),
  freelancerId: varchar("freelancer_id"),
  collaborators: text("collaborators").array().default(sql`ARRAY[]::text[]`),
  moderatorFeedback: text("moderator_feedback"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const insertJobSchema = createInsertSchema(jobs)
  .omit({
    id: true,
    createdAt: true,
    updatedAt: true,
  })
  .extend({
    deadline: z.coerce.date().optional().refine(
      (date) => {
        if (!date) return true;
        const now = new Date();
        const threeWeeksFromNow = new Date(now);
        threeWeeksFromNow.setDate(now.getDate() + 21);
        return date >= threeWeeksFromNow;
      },
      { message: "Deadline must be at least 3 weeks from now" }
    ),
  });

export type InsertJob = z.infer<typeof insertJobSchema>;
export type Job = typeof jobs.$inferSelect;

// Wallets table
export const wallets = pgTable("wallets", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull().unique(),
  usdtBalance: decimal("usdt_balance", { precision: 20, scale: 8 }).default("0"),
  pendingUsdtBalance: decimal("pending_usdt_balance", { precision: 20, scale: 8 }).default("0"),
  solBalance: decimal("sol_balance", { precision: 20, scale: 8 }).default("0"),
  btcBalance: decimal("btc_balance", { precision: 20, scale: 8 }).default("0"),
  ltcBalance: decimal("ltc_balance", { precision: 20, scale: 8 }).default("0"),
  walletAddress: text("wallet_address"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const insertWalletSchema = createInsertSchema(wallets).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type InsertWallet = z.infer<typeof insertWalletSchema>;
export type Wallet = typeof wallets.$inferSelect;

// Transactions table
export const transactions = pgTable("transactions", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  walletId: varchar("wallet_id").notNull(),
  type: text("type").notNull(),
  currency: text("currency").notNull(),
  amount: decimal("amount", { precision: 20, scale: 8 }).notNull(),
  usdAmount: decimal("usd_amount", { precision: 10, scale: 2 }),
  status: text("status").default("completed"),
  transactionHash: text("transaction_hash"),
  createdAt: timestamp("created_at").defaultNow(),
});

export const insertTransactionSchema = createInsertSchema(transactions).omit({
  id: true,
  createdAt: true,
});

export type InsertTransaction = z.infer<typeof insertTransactionSchema>;
export type Transaction = typeof transactions.$inferSelect;

// PTO Requests table
export const ptoRequests = pgTable("pto_requests", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  freelancerId: varchar("freelancer_id").notNull(),
  startDate: timestamp("start_date").notNull(),
  endDate: timestamp("end_date").notNull(),
  reason: text("reason").notNull(),
  status: text("status").notNull().default(PTOStatus.PENDING),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const insertPTORequestSchema = createInsertSchema(ptoRequests)
  .omit({
    id: true,
    createdAt: true,
    updatedAt: true,
  })
  .extend({
    startDate: z.coerce.date().refine(
      (date) => {
        const now = new Date();
        now.setHours(0, 0, 0, 0);
        return date >= now;
      },
      { message: "Start date cannot be in the past" }
    ),
    endDate: z.coerce.date(),
  })
  .refine(
    (data) => {
      const tenYearsFromNow = new Date();
      tenYearsFromNow.setFullYear(tenYearsFromNow.getFullYear() + 10);
      return data.startDate <= tenYearsFromNow && data.endDate <= tenYearsFromNow;
    },
    { message: "PTO dates cannot be more than 10 years in the future" }
  )
  .refine(
    (data) => data.endDate >= data.startDate,
    { message: "End date must be after or equal to start date" }
  );

export type InsertPTORequest = z.infer<typeof insertPTORequestSchema>;
export type PTORequest = typeof ptoRequests.$inferSelect;

// Invitations table
export const invitations = pgTable("invitations", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  jobId: varchar("job_id").notNull(),
  fromUserId: varchar("from_user_id").notNull(),
  toUserId: varchar("to_user_id").notNull(),
  status: text("status").default("pending"),
  createdAt: timestamp("created_at").defaultNow(),
});

export const insertInvitationSchema = createInsertSchema(invitations).omit({
  id: true,
  createdAt: true,
});

export type InsertInvitation = z.infer<typeof insertInvitationSchema>;
export type Invitation = typeof invitations.$inferSelect;

// Cancellation Requests table
export const cancellationRequests = pgTable("cancellation_requests", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  jobId: varchar("job_id").notNull(),
  requesterId: varchar("requester_id").notNull(),
  reason: text("reason").notNull(),
  proofUrl: text("proof_url"),
  status: text("status").notNull().default(CancellationStatus.PENDING),
  reviewerId: varchar("reviewer_id"),
  reviewNotes: text("review_notes"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const insertCancellationRequestSchema = createInsertSchema(cancellationRequests).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type InsertCancellationRequest = z.infer<typeof insertCancellationRequestSchema>;
export type CancellationRequest = typeof cancellationRequests.$inferSelect;

// Chat Messages table
export const chatMessages = pgTable("chat_messages", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  jobId: varchar("job_id").notNull(),
  senderId: varchar("sender_id").notNull(),
  receiverId: varchar("receiver_id").notNull(),
  message: text("message").notNull(),
  read: boolean("read").default(false),
  createdAt: timestamp("created_at").defaultNow(),
});

export const insertChatMessageSchema = createInsertSchema(chatMessages).omit({
  id: true,
  createdAt: true,
});

export type InsertChatMessage = z.infer<typeof insertChatMessageSchema>;
export type ChatMessage = typeof chatMessages.$inferSelect;

// Notifications table
export const NotificationType = {
  CHAT_MESSAGE: "chat_message",
  CANCELLATION_REQUEST: "cancellation_request",
  JOB_APPROVED: "job_approved",
  JOB_REJECTED: "job_rejected",
  INVITATION: "invitation",
} as const;

export type NotificationTypeEnum = typeof NotificationType[keyof typeof NotificationType];

export const notifications = pgTable("notifications", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull(),
  type: text("type").notNull(),
  title: text("title").notNull(),
  message: text("message").notNull(),
  relatedId: varchar("related_id"),
  read: boolean("read").default(false),
  createdAt: timestamp("created_at").defaultNow(),
});

export const insertNotificationSchema = createInsertSchema(notifications).omit({
  id: true,
  createdAt: true,
});

export type InsertNotification = z.infer<typeof insertNotificationSchema>;
export type Notification = typeof notifications.$inferSelect;

// Team Notes table
export const teamNotes = pgTable("team_notes", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  jobId: varchar("job_id").notNull(),
  authorId: varchar("author_id").notNull(),
  content: text("content").notNull(),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const insertTeamNoteSchema = createInsertSchema(teamNotes).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type InsertTeamNote = z.infer<typeof insertTeamNoteSchema>;
export type TeamNote = typeof teamNotes.$inferSelect;

// Team Tasks table
export const TaskStatus = {
  TODO: "todo",
  IN_PROGRESS: "in_progress",
  DONE: "done"
} as const;

export type TaskStatusType = typeof TaskStatus[keyof typeof TaskStatus];

export const teamTasks = pgTable("team_tasks", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  jobId: varchar("job_id").notNull(),
  title: text("title").notNull(),
  description: text("description"),
  assigneeId: varchar("assignee_id"),
  status: text("status").notNull().default(TaskStatus.TODO),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const insertTeamTaskSchema = createInsertSchema(teamTasks)
  .omit({
    id: true,
    createdAt: true,
    updatedAt: true,
  })
  .extend({
    status: z.enum([TaskStatus.TODO, TaskStatus.IN_PROGRESS, TaskStatus.DONE]).optional(),
  });

export type InsertTeamTask = z.infer<typeof insertTeamTaskSchema>;
export type TeamTask = typeof teamTasks.$inferSelect;

// Team Messages table
export const teamMessages = pgTable("team_messages", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  jobId: varchar("job_id").notNull(),
  senderId: varchar("sender_id").notNull(),
  content: text("content").notNull(),
  createdAt: timestamp("created_at").defaultNow(),
});

export const insertTeamMessageSchema = createInsertSchema(teamMessages).omit({
  id: true,
  createdAt: true,
});

export type InsertTeamMessage = z.infer<typeof insertTeamMessageSchema>;
export type TeamMessage = typeof teamMessages.$inferSelect;

// Ratings table
export const ratings = pgTable("ratings", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  jobId: varchar("job_id").notNull().unique(),
  customerId: varchar("customer_id").notNull(),
  freelancerId: varchar("freelancer_id").notNull(),
  score: integer("score").notNull(),
  review: text("review"),
  createdAt: timestamp("created_at").defaultNow(),
});

export const insertRatingSchema = createInsertSchema(ratings)
  .omit({
    id: true,
    createdAt: true,
  })
  .extend({
    score: z.number().min(1).max(5),
  });

export type InsertRating = z.infer<typeof insertRatingSchema>;
export type Rating = typeof ratings.$inferSelect;

// Role Upgrade Request status
export const RoleUpgradeStatus = {
  PENDING: "pending",
  APPROVED: "approved",
  REJECTED: "rejected"
} as const;

export type RoleUpgradeStatusType = typeof RoleUpgradeStatus[keyof typeof RoleUpgradeStatus];

// Role Upgrade Request types
export const RoleUpgradeType = {
  CUSTOMER_TO_FREELANCER: "customer_to_freelancer",
  FREELANCER_TO_MODERATOR: "freelancer_to_moderator"
} as const;

export type RoleUpgradeTypeEnum = typeof RoleUpgradeType[keyof typeof RoleUpgradeType];

// Role Upgrade Requests table
export const roleUpgradeRequests = pgTable("role_upgrade_requests", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull(),
  upgradeType: text("upgrade_type").notNull(),
  reason: text("reason").notNull(),
  experience: text("experience"),
  portfolio: text("portfolio"),
  status: text("status").notNull().default(RoleUpgradeStatus.PENDING),
  reviewerId: varchar("reviewer_id"),
  reviewNotes: text("review_notes"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const insertRoleUpgradeRequestSchema = createInsertSchema(roleUpgradeRequests)
  .omit({
    id: true,
    status: true,
    reviewerId: true,
    reviewNotes: true,
    createdAt: true,
    updatedAt: true,
  })
  .extend({
    upgradeType: z.enum([RoleUpgradeType.CUSTOMER_TO_FREELANCER, RoleUpgradeType.FREELANCER_TO_MODERATOR]),
    reason: z.string().min(10, "Please provide a detailed reason (at least 10 characters)"),
  });

export type InsertRoleUpgradeRequest = z.infer<typeof insertRoleUpgradeRequestSchema>;
export type RoleUpgradeRequest = typeof roleUpgradeRequests.$inferSelect;

export const ReportType = {
  JOB: "job",
  USER: "user",
  MESSAGE: "message",
} as const;

export const ReportStatus = {
  PENDING: "pending",
  REVIEWED: "reviewed",
  RESOLVED: "resolved",
  DISMISSED: "dismissed",
} as const;

export const reports = pgTable("reports", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  reporterId: varchar("reporter_id").notNull(),
  reportType: text("report_type").notNull(),
  targetId: varchar("target_id").notNull(),
  reason: text("reason").notNull(),
  description: text("description"),
  status: text("status").notNull().default(ReportStatus.PENDING),
  reviewerId: varchar("reviewer_id"),
  reviewNotes: text("review_notes"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const insertReportSchema = createInsertSchema(reports)
  .omit({
    id: true,
    status: true,
    reviewerId: true,
    reviewNotes: true,
    createdAt: true,
    updatedAt: true,
  })
  .extend({
    reportType: z.enum([ReportType.JOB, ReportType.USER, ReportType.MESSAGE]),
    reason: z.string().min(5, "Please provide a reason"),
  });

export type InsertReport = z.infer<typeof insertReportSchema>;
export type Report = typeof reports.$inferSelect;
