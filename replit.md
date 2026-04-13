# Linxora - Professional Freelancer Job Marketplace

## Overview
Linxora is a full-stack job marketplace connecting freelancers with customers through a moderated platform. It facilitates secure payments, real-time Discord integrations, and comprehensive freelancer management. The platform's core purpose is to provide a seamless and secure environment for project collaboration with features like role-based access control, team collaboration with automated profit splitting, and a robust job moderation system. Linxora aims to be a leading platform for connecting talent with opportunity in the freelance economy.

## User Preferences
I want iterative development. Ask before making major changes. I prefer detailed explanations.

## System Architecture
The platform is built with a React frontend, an Express Node.js backend, and MongoDB Atlas for persistent storage.

**UI/UX Decisions:**
- **Branding:** Linxora branding with a consistent logo and theme across the platform.
- **Components:** Utilizes Shadcn UI components and Tailwind CSS for a modern, responsive design.
- **Fonts:** Inter and JetBrains Mono for clear typography.
- **Timezone:** All dates and times are displayed in Eastern Time (ET) for consistency, with clear indicators.

**Technical Implementations & Feature Specifications:**
- **Authentication:** Discord OAuth for user authentication with role-based access control (Freelancer, Customer, Staff, Moderator).
- **Job Board:**
    - Browse and search approved jobs. Browse page now includes `claimed` (Filled) and `in_progress` (In Progress) jobs for transparency — status badges clearly indicate availability. Only "Open" (pending_acceptance) jobs allow new applications.
    - Detailed job view with client information and requirements.
    - **Job Application Queue System:** Freelancers apply to jobs (max 5 pending applications). Customers review applicants, accepting or rejecting each. Upon acceptance, other pending applications are automatically cancelled.
    - Automated equal profit splitting among team members.
    - Customers can create job posts, subject to moderator approval.
    - Moderation queue for staff to approve, reject, or request changes to jobs, with customer notification and re-submission flow.
    - **My Applications Page:** Freelancers can view and manage their pending job applications (/my-applications), including withdrawing applications.
    - **Earnings Breakdown:** In current-job.tsx, the "Your Earnings" section renamed to "Earnings Breakdown" with visual progress bars labeled by each team member's username.
- **Wallet:**
    - Simple USD-based balance tracking.
    - Deposit and withdrawal functionality for testing.
    - Transaction history with filtering.
    - Available and pending balance breakdown.
- **Freelancer Features:** Profiles displaying completed jobs, statistics, a level system, rating/review tracking, and PTO request management.
- **Moderator Task System:** Head of Moderation and Founder can assign tasks to moderators. Tasks can be personal or team-based, with priority levels (low/medium/high) and status tracking (pending/in_progress/completed). Moderators see their "Assigned Tasks" section on their profile instead of "Completed Projects".
- **Meeting & Calendar System:** Head of Moderation and Founder can schedule meetings for moderators via the Team Management page (/team-management). Features include:
    - Schedule individual or team-wide meetings with date, time, and duration
    - Moderators receive notifications for meeting invitations
    - Accept/decline RSVP functionality on the My Meetings page (/meetings)
    - Head of Moderation can view all RSVP responses (accepted, declined, pending)
    - Meetings displayed in Eastern Time (ET) with upcoming/past categorization
- **Team Room:** Real-time collaboration space for the moderation team (/team-room). Features include:
    - Persistent team chat with WebSocket-based real-time messaging
    - Typing indicators and online presence tracking
    - WebRTC-based voice calls with mute/deafen controls
    - Content filtering and moderation on chat messages
    - Role badges and user status display
- **Discord Integration:** Role synchronization, team collaboration notifications, and automatic posting of approved jobs via webhooks.
- **Notification Center:** Comprehensive notification infrastructure with a bell icon, unread badge, and categorized alerts for messages, approvals, and system events. Bell popover and Notifications log page are now separated: "Clear all" and individual X buttons in the bell DISMISS (hide) notifications from the bell without deleting them from the log. The Notifications page (`/notifications`) shows ALL notifications including dismissed ones (shown with "Cleared" badge and dimmed styling), acting as a permanent history log. "Mark all read" button is available separately on the log page. New routes: `PUT /api/notifications/:id/dismiss` and `PUT /api/notifications/dismiss-all`. Schema has a `dismissed` boolean field.
- **Onboarding System:** Multi-step role-specific onboarding wizard for new users.
- **Team Collaboration Suite:** Secure API endpoints for team notes, tasks, and real-time chat within job details.
- **Smart Search System:** Levenshtein distance fuzzy matching, synonym expansion, and budget range filtering.
- **Rating System:** Customers can rate freelancers post-completion, with automatic recalculation of freelancer averages.
- **Auto-Leveling & Statistics:** Automatic update of freelancer statistics (completion percentage, level based on completed jobs) displayed on profile pages.
- **Role Upgrade System:** Customers can apply to become Freelancers, and Freelancers can apply for Moderator status (requires 5+ completed jobs). Moderators review and approve/reject applications. Automatic role updates upon approval with full notification system.
- **Friends System:** Global user search by unique user ID, friend requests with accept/decline functionality, friends list management, and quick message access. Available at /friends for all roles.
- **Group Chats (NEW - Mar 2026):** Users can create named group chats, add members by User ID, send messages, rename groups (creator only), add/kick members (creator only), and leave groups. Group chats appear in the Messages page alongside DMs. Schema: `groupChats`, `groupChatMembers`, `groupChatMessages` tables. API: `GET/POST /api/group-chats`, `GET /api/group-chats/:id`, `PATCH /api/group-chats/:id`, `POST/DELETE /api/group-chats/:id/members`, `DELETE /api/group-chats/:id/leave`, `GET/POST /api/group-chats/:id/messages`.
- **Enhanced Messages UI (Mar 2026):** DM messages now show sender avatar and username with clickable profile navigation (clicking avatar or name goes to `/user/:id`). Group chat messages show same avatar + username display. Left sidebar separates DMs and group chats with labeled sections.
- **Message Privacy System:** Users can control who can message them via "Allow messages from unknown users" setting in Privacy Settings. When disabled, only "known users" (friends, prior chat partners, or job collaborators) can send direct messages. Unknown senders see a clear error message.
- **Tutorial System:** Slide-based walkthrough with role-specific content (6 slides for freelancers, 5 for customers, 4 for moderators), accessible via help button in header.
- **Safety & Moderation:**
    - Content Filter: Server-side library (server/lib/content-filter.ts) with inappropriate/suspicious pattern detection, XSS sanitization via sanitizeText(), and spam detection via isSpamLike().
    - Report System: Users can report jobs, users, messages, or bugs via ReportDialog component. "Report User" button on user profile pages, "Report a Bug" in sidebar for all roles. Reports are stored with sanitized content and checked for high-severity inappropriate content.
    - Moderation Queue: Reports tab in moderation page for moderators to review, resolve, mark reviewed, dismiss, or take disciplinary action on reports.
    - Disciplinary Actions: Moderators can issue warnings, suspend accounts (1/3/7/14/30 days), or permanently ban users from user reports. Role hierarchy enforced (can't act on equal/higher roles). Account status (active/suspended/banned) checked on every authenticated request. Suspended users see a dedicated suspension screen (not just logged out) with: countdown timer to lift time, suspension reason, "Switch Account" button (clears session first), "Log Off" button, and "Try Logging In Again" when suspension expires. Self-reporting is blocked client-side.
    - Bug Forwarding: Moderators can forward genuine bug reports to the development team. Forwarded bugs have a dedicated "Forwarded Bugs" tab in moderation (visible to Founder/Head of Moderation only). Forwarded bug notifications redirect to `/moderation?tab=forwarded-bugs`.
    - Report History: "Report History" tab in moderation page allows moderators/founder to search for specific reports by ID and view all past reports (pending, resolved, dismissed, forwarded) sorted by most recent. Uses `GET /api/reports/:id` for individual lookup and `GET /api/reports` for full list.
    - Member Report: When reporting a member via sidebar "Report a Bug" flow, user ID field is numeric-only input (no letters allowed). User IDs are displayed on profile pages.
    - Content filtering applied to job creation and report submissions to prevent malicious content.
- **Lino AI Assistant:** AI-powered support chatbot accessible via "Ask Lino" in the sidebar's Support section. Uses OpenAI (via Replit AI Integrations) with gpt-5-mini model. Rate limited to 20 messages/hour. Conversation history limited to last 20 messages. System prompt contains Linxora platform knowledge. Available at /lino for all authenticated users.
- **Job Lifecycle State Machine (NEW - Jan 2026):**
    - States: DRAFT → PENDING_APPROVAL → PENDING_ACCEPTANCE → IN_PROGRESS → AWAITING_CUSTOMER → COMPLETED
    - Alternative paths: CANCELLED, DISPUTE, EXPIRED
    - Customer creates job as DRAFT, submits for approval
    - Moderator approves (funds locked in escrow) or rejects
    - Freelancer accepts job, starts work
    - Freelancer submits work with proof (files, links, notes)
    - Customer has 4 days to review (auto-complete if no response)
    - 8-hour reminder notification sent to customer
- **Premium Listing System:** Variable premium amount (minimum $100). Higher premium = higher placement on job board. Premium amount goes to Linxora (platform revenue).
- **Escrow Payment System (UPDATED Feb 2026):**
    - Full amount (budget + premium) **actually deducted from wallet** when customer submits job for review (not just pending hold)
    - Full refund (budget + premium) **credited back to wallet** on cancellation or moderator rejection
    - On completion: no further charge (already paid), freelancer receives level-based portion of budget only, premium stays with Linxora
    - On dispute: premium goes to Linxora, customerRefund portion credited back to wallet, freelancer gets their split
    - Level-based freelancer payouts: Level 1=60%, Level 2=70%, Level 3=80%, Level 4=85%, Level 5=90%
    - Platform retains difference as fee
    - Multi-freelancer jobs split payment equally, then apply level percentage
    - Transaction records created for all charges and refunds (escrow_lock, refund types)
- **Dispute Resolution (NEW):**
    - Either party can open dispute for active jobs
    - Job locked during dispute
    - Moderator claims and resolves with split decision
    - Funds distributed per moderator decision (freelancer amount + customer refund)
- **Cancellation System (NEW):**
    - Before freelancer acceptance: full refund to customer
    - After acceptance: 7-day negotiation period
    - If no agreement, auto-escalates to dispute
- **Scheduled Tasks (NEW):**
    - Auto-completion after 4 days with no customer response
    - Job expiration after 2 months with no freelancer acceptance
    - Customer review reminders at 8 hours
    - Cancellation escalation after 7-day negotiation

**System Design Choices:**
- **Client-Side:** React with TypeScript, Wouter for routing, TanStack Query for data fetching.
- **Server-Side:** Node.js with Express, TypeScript for type safety.
- **Storage:** MongoDB Atlas for data persistence, with an in-memory fallback for development.
- **Real-time:** WebSockets for live notifications and updates.
- **Project Structure:** Clear separation of client, server, and shared directories.

## External Dependencies
- **Discord:** OAuth for authentication, Webhooks for notifications and integrations.
- **MongoDB Atlas:** Cloud-hosted NoSQL database for persistent data storage.
- **Shadcn UI:** UI component library.
- **Tailwind CSS:** Utility-first CSS framework.
- **Wouter:** React routing library.
- **TanStack Query:** Data fetching and caching library.
- **ws (WebSocket library):** For real-time communication on the backend.
- **Express Session:** For session management.