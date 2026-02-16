import { sql } from "drizzle-orm";
import { pgTable, text, varchar, timestamp, integer, boolean, decimal, jsonb } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

// User roles enum
export const UserRole = {
  FREELANCER: "freelancer",
  CUSTOMER: "customer",
  STAFF: "staff",
  MODERATOR: "moderator",
  HEAD_OF_MODERATION: "head_of_moderation",
  FOUNDER: "founder"
} as const;

export type UserRoleType = typeof UserRole[keyof typeof UserRole];

// Job status enum - matches spec state machine
export const JobStatus = {
  DRAFT: "draft",
  PENDING_APPROVAL: "pending_approval",
  PENDING_ACCEPTANCE: "pending_acceptance",
  IN_PROGRESS: "in_progress",
  SUBMITTED: "submitted",
  AWAITING_CUSTOMER: "awaiting_customer",
  COMPLETED: "completed",
  CANCELLED: "cancelled",
  DISPUTE: "dispute",
  EXPIRED: "expired",
  // Legacy statuses for backward compatibility
  PENDING: "pending",
  ACTIVE: "active",
  FREELANCER_REQUESTED: "freelancer_requested",
  CLAIMED: "claimed",
  REJECTED: "rejected",
  CHANGES_REQUESTED: "changes_requested"
} as const;

export type JobStatusType = typeof JobStatus[keyof typeof JobStatus];

// Transaction types - expanded per spec
export const TransactionType = {
  DEPOSIT: "deposit",
  WITHDRAWAL: "withdrawal",
  ESCROW_HOLD: "escrow_hold",
  ESCROW_RELEASE: "escrow_release",
  REFUND: "refund",
  FEE: "fee",
  ADJUSTMENT: "adjustment"
} as const;

export type TransactionTypeEnum = typeof TransactionType[keyof typeof TransactionType];

// Escrow status enum
export const EscrowStatus = {
  HELD: "held",
  RELEASED: "released",
  REFUNDED: "refunded",
  PARTIAL_REFUND: "partial_refund"
} as const;

export type EscrowStatusType = typeof EscrowStatus[keyof typeof EscrowStatus];

// Job Freelancer status
export const JobFreelancerStatus = {
  ACCEPTED: "accepted",
  REMOVED: "removed",
  COMPLETED: "completed"
} as const;

export type JobFreelancerStatusType = typeof JobFreelancerStatus[keyof typeof JobFreelancerStatus];

// Job Submission status
export const JobSubmissionStatus = {
  SUBMITTED: "submitted",
  REVISED: "revised",
  FINAL: "final"
} as const;

export type JobSubmissionStatusType = typeof JobSubmissionStatus[keyof typeof JobSubmissionStatus];

// Dispute status
export const DisputeStatus = {
  OPEN: "open",
  UNDER_REVIEW: "under_review",
  RESOLVED: "resolved"
} as const;

export type DisputeStatusType = typeof DisputeStatus[keyof typeof DisputeStatus];

// Scheduled Task types
export const ScheduledTaskType = {
  AUTO_COMPLETE: "auto_complete",
  EXPIRE_JOB: "expire_job",
  DEADLINE_OVERRUN: "deadline_overrun",
  REMINDER: "reminder"
} as const;

export type ScheduledTaskTypeEnum = typeof ScheduledTaskType[keyof typeof ScheduledTaskType];

// Scheduled Task status
export const ScheduledTaskStatus = {
  PENDING: "pending",
  COMPLETED: "completed",
  CANCELLED: "cancelled"
} as const;

export type ScheduledTaskStatusType = typeof ScheduledTaskStatus[keyof typeof ScheduledTaskStatus];

// User account status
export const UserAccountStatus = {
  ACTIVE: "active",
  SUSPENDED: "suspended",
  BANNED: "banned"
} as const;

export type UserAccountStatusType = typeof UserAccountStatus[keyof typeof UserAccountStatus];

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
  userId: integer("user_id").unique().notNull(), // Sequential permanent ID based on creation order
  discordId: text("discord_id").unique().notNull(),
  username: text("username").notNull(),
  email: text("email"),
  emailVerified: boolean("email_verified").default(false),
  pendingEmail: text("pending_email"),
  avatar: text("avatar"),
  bio: text("bio"),
  role: text("role").notNull().default(UserRole.FREELANCER),
  level: integer("level").default(1),
  specialization: text("specialization"),
  workingHours: jsonb("working_hours").default(sql`'{}'::jsonb`),
  completedJobs: integer("completed_jobs").default(0),
  rating: decimal("rating", { precision: 3, scale: 2 }).default("0"),
  onboardingCompleted: boolean("onboarding_completed").default(false),
  totalRatings: integer("total_ratings").default(0),
  completionPercentage: decimal("completion_percentage", { precision: 5, scale: 2 }).default("0"),
  blacklistedFreelancers: text("blacklisted_freelancers").array().default(sql`'{}'::text[]`), // Customer's blacklisted freelancer IDs
  lastActive: timestamp("last_active").defaultNow(), // Track last activity for online/inactive status
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const insertUserSchema = createInsertSchema(users).omit({
  id: true,
  userId: true, // Auto-generated sequential ID
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

// Jobs table - updated per spec
export const jobs = pgTable("jobs", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  customerId: varchar("customer_id").notNull(),
  title: text("title").notNull(),
  description: text("description").notNull(),
  category: text("category").notNull(),
  budget: decimal("budget", { precision: 10, scale: 2 }).notNull(),
  requirements: text("requirements"),
  deadline: timestamp("deadline"),
  status: text("status").notNull().default(JobStatus.DRAFT),
  freelancerId: varchar("freelancer_id"),
  collaborators: text("collaborators").array().default(sql`ARRAY[]::text[]`),
  moderatorFeedback: text("moderator_feedback"),
  // New fields per spec
  expiresAt: timestamp("expires_at"), // For job expiration (2 months after approval)
  approvedAt: timestamp("approved_at"), // When job was approved
  submittedAt: timestamp("submitted_at"), // When work was submitted
  autoCompleteAt: timestamp("auto_complete_at"), // When auto-complete will trigger (4 days after submission)
  maxFreelancers: integer("max_freelancers").default(1), // For multi-freelancer jobs
  isLocked: boolean("is_locked").default(false), // Lock job during dispute
  customerArchived: boolean("customer_archived").default(false), // Customer can hide completed jobs
  isPremium: boolean("is_premium").default(false), // Premium listing ($100 extra for priority recommendations)
  submittedForReviewAt: timestamp("submitted_for_review_at"), // Tracks when job was last submitted for review (3h cooldown)
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

// Chat Messages table (job-specific chat)
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

// Direct Messages table (user-to-user messaging)
export const directMessages = pgTable("direct_messages", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  senderId: varchar("sender_id").notNull(),
  receiverId: varchar("receiver_id").notNull(),
  message: text("message").notNull(),
  read: boolean("read").default(false),
  createdAt: timestamp("created_at").defaultNow(),
});

export const insertDirectMessageSchema = createInsertSchema(directMessages).omit({
  id: true,
  createdAt: true,
});

export type InsertDirectMessage = z.infer<typeof insertDirectMessageSchema>;
export type DirectMessage = typeof directMessages.$inferSelect;

// Notifications table
export const NotificationType = {
  CHAT_MESSAGE: "chat_message",
  DIRECT_MESSAGE: "direct_message",
  CANCELLATION_REQUEST: "cancellation_request",
  JOB_APPROVED: "job_approved",
  JOB_REJECTED: "job_rejected",
  INVITATION: "invitation",
} as const;

export type NotificationTypeEnum = typeof NotificationType[keyof typeof NotificationType];

export const SourceType = {
  JOB: "job",
  USER: "user",
  DISPUTE: "dispute",
  SYSTEM: "system",
} as const;

export type SourceTypeEnum = typeof SourceType[keyof typeof SourceType];

export const notifications = pgTable("notifications", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull(),
  type: text("type").notNull(),
  title: text("title").notNull(),
  message: text("message").notNull(),
  relatedId: varchar("related_id"),
  sourceType: text("source_type"),
  sourceId: varchar("source_id"),
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

// Moderator Task status
export const ModeratorTaskStatus = {
  PENDING: "pending",
  IN_PROGRESS: "in_progress",
  COMPLETED: "completed"
} as const;

export type ModeratorTaskStatusType = typeof ModeratorTaskStatus[keyof typeof ModeratorTaskStatus];

// Moderator Task type (personal vs team-based)
export const ModeratorTaskType = {
  PERSONAL: "personal",
  TEAM: "team"
} as const;

export type ModeratorTaskTypeEnum = typeof ModeratorTaskType[keyof typeof ModeratorTaskType];

// Moderator Tasks table - tasks assigned by Head of Moderation
export const moderatorTasks = pgTable("moderator_tasks", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  title: text("title").notNull(),
  description: text("description"),
  assignedById: varchar("assigned_by_id").notNull(), // Head of Moderation who assigned it
  assigneeId: varchar("assignee_id").notNull(), // Moderator assigned to the task
  taskType: text("task_type").notNull().default(ModeratorTaskType.PERSONAL),
  teamMembers: text("team_members").array(), // For team tasks, list of moderator IDs
  status: text("status").notNull().default(ModeratorTaskStatus.PENDING),
  priority: text("priority").default("medium"),
  dueDate: timestamp("due_date"),
  completedAt: timestamp("completed_at"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const insertModeratorTaskSchema = createInsertSchema(moderatorTasks)
  .omit({
    id: true,
    completedAt: true,
    createdAt: true,
    updatedAt: true,
  })
  .extend({
    title: z.string().min(1, "Title is required").max(200),
    description: z.string().max(1000).optional().nullable(),
    taskType: z.enum([ModeratorTaskType.PERSONAL, ModeratorTaskType.TEAM]).optional(),
    status: z.enum([ModeratorTaskStatus.PENDING, ModeratorTaskStatus.IN_PROGRESS, ModeratorTaskStatus.COMPLETED]).optional(),
    priority: z.enum(["low", "medium", "high"]).optional(),
  })
  .refine(
    (data) => data.taskType !== ModeratorTaskType.TEAM || (data.teamMembers && data.teamMembers.length > 0),
    { message: "Team tasks must have at least one team member", path: ["teamMembers"] }
  );

export type InsertModeratorTask = z.infer<typeof insertModeratorTaskSchema>;
export type ModeratorTask = typeof moderatorTasks.$inferSelect;

// Moderator Meeting RSVP status
export const MeetingRsvpStatus = {
  PENDING: "pending",
  ACCEPTED: "accepted",
  DECLINED: "declined"
} as const;

export type MeetingRsvpStatusType = typeof MeetingRsvpStatus[keyof typeof MeetingRsvpStatus];

// Moderator Meetings table - scheduled by Head of Moderation
export const moderatorMeetings = pgTable("moderator_meetings", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  title: text("title").notNull(),
  description: text("description"),
  scheduledById: varchar("scheduled_by_id").notNull(),
  scheduledDate: timestamp("scheduled_date").notNull(),
  duration: integer("duration").default(60), // in minutes
  isTeamMeeting: boolean("is_team_meeting").default(false),
  invitedModeratorIds: text("invited_moderator_ids").array(),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const insertModeratorMeetingSchema = createInsertSchema(moderatorMeetings)
  .omit({
    id: true,
    createdAt: true,
    updatedAt: true,
  })
  .extend({
    title: z.string().min(1, "Title is required").max(200),
    description: z.string().max(1000).optional().nullable(),
    duration: z.number().min(15).max(480).optional(),
  });

export type InsertModeratorMeeting = z.infer<typeof insertModeratorMeetingSchema>;
export type ModeratorMeeting = typeof moderatorMeetings.$inferSelect;

// Meeting RSVP responses
export const meetingRsvps = pgTable("meeting_rsvps", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  meetingId: varchar("meeting_id").notNull(),
  moderatorId: varchar("moderator_id").notNull(),
  status: text("status").notNull().default(MeetingRsvpStatus.PENDING),
  respondedAt: timestamp("responded_at"),
  createdAt: timestamp("created_at").defaultNow(),
});

export const insertMeetingRsvpSchema = createInsertSchema(meetingRsvps)
  .omit({
    id: true,
    respondedAt: true,
    createdAt: true,
  })
  .extend({
    status: z.enum([MeetingRsvpStatus.PENDING, MeetingRsvpStatus.ACCEPTED, MeetingRsvpStatus.DECLINED]).optional(),
  });

export type InsertMeetingRsvp = z.infer<typeof insertMeetingRsvpSchema>;
export type MeetingRsvp = typeof meetingRsvps.$inferSelect;

// Meeting Exemption Status
export const MeetingExemptionStatus = {
  PENDING: "pending",
  APPROVED: "approved",
  DENIED: "denied"
} as const;

export type MeetingExemptionStatusType = typeof MeetingExemptionStatus[keyof typeof MeetingExemptionStatus];

// Meeting Exemption Requests table - moderators can request exemption from meetings
export const meetingExemptions = pgTable("meeting_exemptions", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  meetingId: varchar("meeting_id").notNull(),
  moderatorId: varchar("moderator_id").notNull(),
  reason: text("reason").notNull(),
  status: text("status").notNull().default(MeetingExemptionStatus.PENDING),
  reviewedById: varchar("reviewed_by_id"),
  reviewNote: text("review_note"),
  createdAt: timestamp("created_at").defaultNow(),
  reviewedAt: timestamp("reviewed_at"),
});

export const insertMeetingExemptionSchema = createInsertSchema(meetingExemptions)
  .omit({
    id: true,
    status: true,
    reviewedById: true,
    reviewNote: true,
    createdAt: true,
    reviewedAt: true,
  })
  .extend({
    reason: z.string().min(10, "Reason must be at least 10 characters").max(500),
  });

export type InsertMeetingExemption = z.infer<typeof insertMeetingExemptionSchema>;
export type MeetingExemption = typeof meetingExemptions.$inferSelect;

// Team Room Messages table - persistent chat for moderator team room
export const teamRoomMessages = pgTable("team_room_messages", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  senderId: varchar("sender_id").notNull(),
  content: text("content").notNull(),
  createdAt: timestamp("created_at").defaultNow(),
});

export const insertTeamRoomMessageSchema = createInsertSchema(teamRoomMessages)
  .omit({
    id: true,
    createdAt: true,
  })
  .extend({
    content: z.string().min(1, "Message cannot be empty").max(2000),
  });

export type InsertTeamRoomMessage = z.infer<typeof insertTeamRoomMessageSchema>;
export type TeamRoomMessage = typeof teamRoomMessages.$inferSelect;

// User Preferences table - stores user settings
export const userPreferences = pgTable("user_preferences", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").unique().notNull(),
  // Notification settings
  notificationsEnabled: boolean("notifications_enabled").default(true),
  notificationSoundEnabled: boolean("notification_sound_enabled").default(true),
  deleteConfirmationEnabled: boolean("delete_confirmation_enabled").default(true),
  // Privacy settings
  showOnlineStatus: boolean("show_online_status").default(true),
  allowDirectMessages: boolean("allow_direct_messages").default(true),
  allowMessagesFromUnknown: boolean("allow_messages_from_unknown").default(true),
  // Account status
  accountDeactivated: boolean("account_deactivated").default(false),
  deactivatedAt: timestamp("deactivated_at"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const insertUserPreferencesSchema = createInsertSchema(userPreferences)
  .omit({
    id: true,
    deactivatedAt: true,
    createdAt: true,
    updatedAt: true,
  });

export type InsertUserPreferences = z.infer<typeof insertUserPreferencesSchema>;
export type UserPreferences = typeof userPreferences.$inferSelect;

// Job Requests table - tracks freelancer applications to jobs
export const JobRequestStatus = {
  PENDING: "pending",
  ACCEPTED: "accepted",
  REJECTED: "rejected",
  CANCELLED: "cancelled",
  WITHDRAWN: "withdrawn"
} as const;

export type JobRequestStatusType = typeof JobRequestStatus[keyof typeof JobRequestStatus];

export const jobRequests = pgTable("job_requests", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  jobId: varchar("job_id").notNull(),
  freelancerId: varchar("freelancer_id").notNull(),
  status: text("status").notNull().default(JobRequestStatus.PENDING),
  message: text("message"), // Optional cover letter/message from freelancer
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const insertJobRequestSchema = createInsertSchema(jobRequests).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type InsertJobRequest = z.infer<typeof insertJobRequestSchema>;
export type JobRequest = typeof jobRequests.$inferSelect;

// Email verification tokens table
export const emailVerificationTokens = pgTable("email_verification_tokens", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull(),
  token: text("token").notNull().unique(),
  newEmail: text("new_email").notNull(),
  expiresAt: timestamp("expires_at").notNull(),
  usedAt: timestamp("used_at"),
  createdAt: timestamp("created_at").defaultNow(),
});

export const insertEmailVerificationTokenSchema = createInsertSchema(emailVerificationTokens)
  .omit({
    id: true,
    usedAt: true,
    createdAt: true,
  });

export type InsertEmailVerificationToken = z.infer<typeof insertEmailVerificationTokenSchema>;
export type EmailVerificationToken = typeof emailVerificationTokens.$inferSelect;

// Moderation Vault - single vault for the moderation team
export const moderationVault = pgTable("moderation_vault", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  balance: decimal("balance", { precision: 18, scale: 8 }).default("0"),
  totalDeposited: decimal("total_deposited", { precision: 18, scale: 8 }).default("0"),
  totalDistributed: decimal("total_distributed", { precision: 18, scale: 8 }).default("0"),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export type ModerationVault = typeof moderationVault.$inferSelect;

// Vault Transaction Types
export const VaultTransactionType = {
  DEPOSIT: "deposit",
  DISTRIBUTION: "distribution"
} as const;

export type VaultTransactionTypeEnum = typeof VaultTransactionType[keyof typeof VaultTransactionType];

// Moderation Vault Transactions - track deposits and distributions
export const vaultTransactions = pgTable("vault_transactions", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  type: text("type").notNull(), // "deposit" or "distribution"
  amount: decimal("amount", { precision: 18, scale: 8 }).notNull(),
  fromUserId: varchar("from_user_id"), // Founder who deposited (for deposits)
  toUserId: varchar("to_user_id"), // Moderator who received (for distributions)
  distributedByUserId: varchar("distributed_by_user_id"), // Head of Moderation who distributed
  note: text("note"),
  createdAt: timestamp("created_at").defaultNow(),
});

export const insertVaultTransactionSchema = createInsertSchema(vaultTransactions).omit({
  id: true,
  createdAt: true,
});

export type InsertVaultTransaction = z.infer<typeof insertVaultTransactionSchema>;
export type VaultTransaction = typeof vaultTransactions.$inferSelect;

// Friend Request Status
export const FriendRequestStatus = {
  PENDING: "pending",
  ACCEPTED: "accepted",
  DECLINED: "declined"
} as const;

export type FriendRequestStatusType = typeof FriendRequestStatus[keyof typeof FriendRequestStatus];

// Friends table - tracks friend relationships
export const friends = pgTable("friends", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull(),
  friendId: varchar("friend_id").notNull(),
  createdAt: timestamp("created_at").defaultNow(),
});

export type Friend = typeof friends.$inferSelect;

// Friend Requests table - tracks pending friend requests
export const friendRequests = pgTable("friend_requests", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  fromUserId: varchar("from_user_id").notNull(),
  toUserId: varchar("to_user_id").notNull(),
  status: text("status").notNull().default(FriendRequestStatus.PENDING),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const insertFriendRequestSchema = createInsertSchema(friendRequests).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type InsertFriendRequest = z.infer<typeof insertFriendRequestSchema>;
export type FriendRequest = typeof friendRequests.$inferSelect;

// Job Recommendation Status
export const RecommendationStatus = {
  PENDING: "pending", // Waiting for customer to review
  CUSTOMER_ACCEPTED: "customer_accepted", // Customer accepted, invitation sent to freelancer
  CUSTOMER_DECLINED: "customer_declined", // Customer declined the recommendation
  INVITATION_ACCEPTED: "invitation_accepted", // Freelancer accepted the job invitation
  INVITATION_DECLINED: "invitation_declined", // Freelancer declined the job invitation
} as const;

export type RecommendationStatusType = typeof RecommendationStatus[keyof typeof RecommendationStatus];

// Job Recommendations table - tracks freelancer-to-freelancer job recommendations
export const jobRecommendations = pgTable("job_recommendations", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  recommenderId: varchar("recommender_id").notNull(), // Freelancer A who is recommending
  recommendedFreelancerId: varchar("recommended_freelancer_id").notNull(), // Freelancer B being recommended
  jobId: varchar("job_id").notNull(), // The job they're being recommended for
  customerId: varchar("customer_id").notNull(), // The customer/employer
  status: text("status").notNull().default(RecommendationStatus.PENDING),
  recommenderMessage: text("recommender_message"), // Message from recommender to customer
  freelancerMessage: text("freelancer_message"), // Message from recommender to recommended freelancer
  customerNote: text("customer_note"), // Optional note from customer when accepting/declining
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const insertJobRecommendationSchema = createInsertSchema(jobRecommendations).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type InsertJobRecommendation = z.infer<typeof insertJobRecommendationSchema>;
export type JobRecommendation = typeof jobRecommendations.$inferSelect;

// ============================================================
// NEW TABLES FROM SPEC - Escrow, Disputes, Job Lifecycle
// ============================================================

// Escrow table - holds funds for jobs
export const escrow = pgTable("escrow", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  jobId: varchar("job_id").notNull(),
  customerId: varchar("customer_id").notNull(),
  totalAmount: decimal("total_amount", { precision: 12, scale: 2 }).notNull(),
  status: text("status").notNull().default(EscrowStatus.HELD),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const insertEscrowSchema = createInsertSchema(escrow).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type InsertEscrow = z.infer<typeof insertEscrowSchema>;
export type Escrow = typeof escrow.$inferSelect;

// Job Freelancers table - tracks freelancers assigned to jobs (supports multi-freelancer)
export const jobFreelancers = pgTable("job_freelancers", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  jobId: varchar("job_id").notNull(),
  freelancerId: varchar("freelancer_id").notNull(),
  shareAmount: decimal("share_amount", { precision: 12, scale: 2 }).notNull(),
  levelAtTime: integer("level_at_time").notNull(),
  payoutAmount: decimal("payout_amount", { precision: 12, scale: 2 }),
  status: text("status").notNull().default(JobFreelancerStatus.ACCEPTED),
  createdAt: timestamp("created_at").defaultNow(),
});

export const insertJobFreelancerSchema = createInsertSchema(jobFreelancers).omit({
  id: true,
  createdAt: true,
});

export type InsertJobFreelancer = z.infer<typeof insertJobFreelancerSchema>;
export type JobFreelancer = typeof jobFreelancers.$inferSelect;

// Job Submissions table - tracks work submissions with proof
export const jobSubmissions = pgTable("job_submissions", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  jobId: varchar("job_id").notNull(),
  freelancerId: varchar("freelancer_id").notNull(),
  proofFiles: jsonb("proof_files").default(sql`'[]'::jsonb`), // Array of file URLs
  proofLinks: jsonb("proof_links").default(sql`'[]'::jsonb`), // Array of external links
  notes: text("notes"),
  status: text("status").notNull().default(JobSubmissionStatus.SUBMITTED),
  submittedAt: timestamp("submitted_at").defaultNow(),
});

export const insertJobSubmissionSchema = createInsertSchema(jobSubmissions).omit({
  id: true,
  submittedAt: true,
});

export type InsertJobSubmission = z.infer<typeof insertJobSubmissionSchema>;
export type JobSubmission = typeof jobSubmissions.$inferSelect;

// Disputes table - tracks job disputes
export const disputes = pgTable("disputes", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  jobId: varchar("job_id").notNull(),
  openedByUserId: varchar("opened_by_user_id").notNull(),
  reason: text("reason").notNull(),
  status: text("status").notNull().default(DisputeStatus.OPEN),
  moderatorId: varchar("moderator_id"),
  resolutionNotes: text("resolution_notes"),
  freelancerAmount: decimal("freelancer_amount", { precision: 12, scale: 2 }),
  customerRefund: decimal("customer_refund", { precision: 12, scale: 2 }),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const insertDisputeSchema = createInsertSchema(disputes).omit({
  id: true,
  status: true,
  moderatorId: true,
  resolutionNotes: true,
  freelancerAmount: true,
  customerRefund: true,
  createdAt: true,
  updatedAt: true,
});

export type InsertDispute = z.infer<typeof insertDisputeSchema>;
export type Dispute = typeof disputes.$inferSelect;

// Moderation Logs table - tracks all moderator actions
export const moderationLogs = pgTable("moderation_logs", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  moderatorId: varchar("moderator_id").notNull(),
  actionType: text("action_type").notNull(),
  targetUserId: varchar("target_user_id"),
  jobId: varchar("job_id"),
  disputeId: varchar("dispute_id"),
  notes: text("notes"),
  createdAt: timestamp("created_at").defaultNow(),
});

export const insertModerationLogSchema = createInsertSchema(moderationLogs).omit({
  id: true,
  createdAt: true,
});

export type InsertModerationLog = z.infer<typeof insertModerationLogSchema>;
export type ModerationLog = typeof moderationLogs.$inferSelect;

// Scheduled Tasks table - for CRON jobs (auto-complete, expiration, etc.)
export const scheduledTasks = pgTable("scheduled_tasks", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  jobId: varchar("job_id"),
  taskType: text("task_type").notNull(),
  runAt: timestamp("run_at").notNull(),
  status: text("status").notNull().default(ScheduledTaskStatus.PENDING),
  metadata: jsonb("metadata").default(sql`'{}'::jsonb`), // Additional data for the task
  createdAt: timestamp("created_at").defaultNow(),
});

export const insertScheduledTaskSchema = createInsertSchema(scheduledTasks).omit({
  id: true,
  createdAt: true,
});

export type InsertScheduledTask = z.infer<typeof insertScheduledTaskSchema>;
export type ScheduledTask = typeof scheduledTasks.$inferSelect;

// User Bans table - tracks user bans
export const userBans = pgTable("user_bans", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull(),
  reason: text("reason").notNull(),
  bannedById: varchar("banned_by_id").notNull(),
  fundsWithheld: boolean("funds_withheld").default(false), // Rare, manual only
  withheldAmount: decimal("withheld_amount", { precision: 12, scale: 2 }),
  createdAt: timestamp("created_at").defaultNow(),
});

export const insertUserBanSchema = createInsertSchema(userBans).omit({
  id: true,
  createdAt: true,
});

export type InsertUserBan = z.infer<typeof insertUserBanSchema>;
export type UserBan = typeof userBans.$inferSelect;

// Customer Review Response table - tracks customer acceptance/rejection of work
export const customerReviews = pgTable("customer_reviews", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  jobId: varchar("job_id").notNull(),
  submissionId: varchar("submission_id").notNull(),
  customerId: varchar("customer_id").notNull(),
  accepted: boolean("accepted").notNull(),
  rejectionReason: text("rejection_reason"), // Required if rejected
  createdAt: timestamp("created_at").defaultNow(),
});

export const insertCustomerReviewSchema = createInsertSchema(customerReviews).omit({
  id: true,
  createdAt: true,
});

export type InsertCustomerReview = z.infer<typeof insertCustomerReviewSchema>;
export type CustomerReview = typeof customerReviews.$inferSelect;

// Cancellation Negotiations table - for 7-day negotiation period after acceptance
export const cancellationNegotiations = pgTable("cancellation_negotiations", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  jobId: varchar("job_id").notNull(),
  initiatedById: varchar("initiated_by_id").notNull(),
  proposedFreelancerAmount: decimal("proposed_freelancer_amount", { precision: 12, scale: 2 }),
  proposedCustomerRefund: decimal("proposed_customer_refund", { precision: 12, scale: 2 }),
  agreedByCustomer: boolean("agreed_by_customer").default(false),
  agreedByFreelancer: boolean("agreed_by_freelancer").default(false),
  expiresAt: timestamp("expires_at").notNull(), // 7 days from creation
  status: text("status").notNull().default("negotiating"), // negotiating, agreed, escalated
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const insertCancellationNegotiationSchema = createInsertSchema(cancellationNegotiations).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type InsertCancellationNegotiation = z.infer<typeof insertCancellationNegotiationSchema>;
export type CancellationNegotiation = typeof cancellationNegotiations.$inferSelect;
