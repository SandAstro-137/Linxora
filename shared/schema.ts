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
  CLAIMED: "claimed",
  IN_PROGRESS: "in_progress",
  COMPLETED: "completed",
  REJECTED: "rejected"
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
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const insertJobSchema = createInsertSchema(jobs).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type InsertJob = z.infer<typeof insertJobSchema>;
export type Job = typeof jobs.$inferSelect;

// Wallets table
export const wallets = pgTable("wallets", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull().unique(),
  usdtBalance: decimal("usdt_balance", { precision: 20, scale: 8 }).default("0"),
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

export const insertPTORequestSchema = createInsertSchema(ptoRequests).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

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
