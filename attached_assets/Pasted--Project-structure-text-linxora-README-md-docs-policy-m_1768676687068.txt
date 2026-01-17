📁 Project structure
text
linxora/
├─ README.md
├─ docs/
│  ├─ policy.md
│  ├─ backend_logic.md
│  ├─ terms_of_service.md
│  ├─ moderator_handbook.md
│  └─ notification_system.md
└─ db/
   └─ schema.sql
You don’t need any code yet for this to be useful—this is your official spec repo.

🧾 README.md
markdown
# Linxora Platform Specification

This repository contains the **official specification** for the Linxora platform, including:

- Official Policy Document
- Backend Logic (state machine and flows)
- Database Schema (SQL)
- Terms of Service (draft)
- Moderator Handbook
- Notification System Flow

These documents are meant to guide the implementation of the Linxora backend, frontend, and moderation processes.

## Files

- `docs/policy.md` — Official Policy Document
- `docs/backend_logic.md` — Backend Logic (build-ready)
- `docs/terms_of_service.md` — Terms of Service (full draft)
- `docs/moderator_handbook.md` — Moderator Handbook
- `docs/notification_system.md` — Notification System Flow
- `db/schema.sql` — Database schema for a relational database (e.g., PostgreSQL/MySQL)
📘 docs/policy.md (Official Policy Document)
markdown
# Linxora Official Policy Document
**Effective Date:** Upon Platform Launch  
**Applies To:** All Customers, Freelancers, Moderators, and Staff

---

## 1. Overview

Linxora operates as a digital marketplace connecting customers with freelancers.  
This document defines the rules, expectations, financial systems, dispute processes, and behavioral standards required to maintain a fair, safe, and efficient environment.

By using Linxora, all users agree to follow these policies.

---

## 2. Payments, Escrow, and Job Funding

### 2.1 Escrow Requirement

- All jobs must be **fully funded** before being submitted for approval.  
- If a customer’s wallet balance is **less than the job amount**, the job **cannot** be submitted.  
- Once submitted, the job amount is **held in escrow** until:
  - The job is completed,  
  - The job is canceled, or  
  - A dispute is resolved.

### 2.2 Multi‑Freelancer Jobs

- If multiple freelancers accept a job, the job amount is split **equally** among them.  
- Example: $1000 job with 2 freelancers → $500 each.

### 2.3 Level‑Based Earnings

Each freelancer’s payout is based on their **level**, which determines how much of their share they keep.

Example:  
- Level 1 keeps $300 of their $500 share  
- Level 3 keeps $375 of their $500 share  
- Platform keeps the remainder as revenue

### 2.4 Platform Fees

Linxora earns revenue from:

- The difference between freelancer share and freelancer payout  
- Withdrawal fees (e.g., PayPal fees) passed directly to the user  

Linxora does **not** charge customers extra fees for posting jobs.

---

## 3. Job Lifecycle and Timing Rules

### 3.1 Job Expiration (No Freelancer Accepts)

- If a job remains unaccepted for **2 months**, it automatically expires.  
- The full escrow amount is refunded to the customer.  
- The job is closed permanently.

### 3.2 Deadline Grace Period

- Freelancers have up to **14 days** past the job deadline to complete the work.  
- If still incomplete:
  - The job is canceled  
  - Customer receives a **full refund**  
  - Freelancer may receive a warning or strike

### 3.3 Submission and Review

When a freelancer submits work:

- They must upload **proof of work** (files, screenshots, links, etc.)  
- The customer has **4 days** to:
  - Accept the work  
  - Reject it with a **detailed explanation** of what is missing or incorrect

### 3.4 Auto‑Completion

If the customer does not respond within 4 days:

- The job is automatically completed  
- Funds are released to the freelancer  
- Customer receives a final notification  

Reminder schedule:

- Every **8 hours**  
- Final reminder warns of auto‑completion

---

## 4. Cancellations, Disputes, and Refunds

### 4.1 Cancel Before Freelancer Accepts

- Customer may cancel anytime  
- Customer receives a **100% refund**

### 4.2 Cancel After Freelancer Accepts

Customer and freelancer have **7 days** to agree on:

- A fair partial payment to the freelancer  

If they agree:

- Agreed amount goes to the freelancer  
- Remaining amount is refunded to the customer  

If they **do not** agree within 7 days:

- The case is escalated to moderation  
- Moderator decides the split  
- Moderator’s decision is final within the platform

### 4.3 Scope Abuse

If a customer demands work beyond the job description:

- Freelancer must report it  
- Job becomes **locked**  
- Customer cannot cancel until moderation reviews  
- Moderation determines whether the request is valid or abusive

### 4.4 Refunds After Completion

Once a job is completed and funds are released:

- **No refunds** are issued  
- Exception: Special circumstances (see below)

### 4.5 Special Circumstances

Refunds may be issued if:

- Customer attempted to cancel  
- Moderator ignored or mishandled the request  
- Job auto‑completed unfairly  

These cases are reviewed by the **Head of Moderation**.

Moderators who ignore or mishandle such cases may face disciplinary action.

---

## 5. Abuse, Bans, and Fund Handling

### 5.1 Abuse Definition

Abuse includes:

- Fraud  
- Harassment  
- Repeated false reports  
- Chargeback attempts  
- Attempting to manipulate the system  
- Exploiting loopholes  
- Threatening staff or users  

### 5.2 Bans

If a user is banned:

- All active jobs are canceled  
- Funds are handled case‑by‑case:
  - Partial or full refunds may be issued  
  - In extreme abuse cases, funds may be **withheld**  
- Withholding funds is:
  - **Manual only**  
  - **Extremely rare**  
  - Never automated

### 5.3 Right to Defend

Before a ban or severe penalty:

- The user must be given a chance to explain their side  
- If this opportunity is denied:
  - The case escalates to the Head of Moderation  
  - If still unresolved, the user may contact the Founder directly

---

## 6. Moderator Responsibilities

Moderators must:

- Act neutrally  
- Base decisions on evidence  
- Respond within required timeframes  
- Escalate when necessary  
- Allow both sides to speak  
- Document all actions  
- Never ignore cancellation requests  
- Never deny a user the right to defend themselves  

Violations may result in:

- Removal from moderation  
- Disciplinary action  
- Escalation to the Head of Moderation or Founder

---

## 7. Proof of Work Requirements

Freelancers must provide:

- Files  
- Screenshots  
- Links  
- Logs  
- Any evidence showing the work was completed  

Customers must:

- Provide detailed reasons for rejection  
- Not request work outside the original job description  

---

## 8. Final Authority

- Moderators have authority over normal disputes  
- Head of Moderation has authority over special cases  
- Founder has authority over:
  - Moderator misconduct  
  - Severe escalations  
  - System‑level disputes  

---

**End of Policy Document**
⚙️ docs/backend_logic.md (Backend Logic)
markdown
# Linxora Backend Logic (Final, Build‑Ready)

This document defines the full backend behavior of Linxora: job flow, escrow, disputes, payouts, bans, notifications, and moderation.

---

## 1. Core Job Statuses (State Machine)

Job statuses:

- `DRAFT`
- `PENDING_APPROVAL`
- `PENDING_ACCEPTANCE`
- `IN_PROGRESS`
- `SUBMITTED`
- `AWAITING_CUSTOMER`
- `COMPLETED`
- `CANCELLED`
- `DISPUTE`
- `EXPIRED`

No skipping states except where explicitly defined.

---

## 2. Job Creation Flow

### 2.1 Create Job (DRAFT)

Triggered when customer starts creating a job.

- Create job record  
- `status = DRAFT`  
- No funds moved  

### 2.2 Submit for Approval

Triggered when customer clicks “Submit for Approval”.

Checks:

- `wallet_balance >= job_amount`  
  - If false → error  
  - If true → continue  

Actions:

- Deduct `job_amount` from customer wallet  
- Create escrow record with `status = HELD`  
- Set `job.status = PENDING_APPROVAL`  
- Notify admins for approval  

---

## 3. Job Approval Flow

### 3.1 Admin Approves Job

Actions:

- `job.status = PENDING_ACCEPTANCE`  
- `job.expires_at = now + 2 months`  
- Notify customer: job live  

---

## 4. Freelancer Acceptance Flow

### 4.1 Freelancer Accepts Job

Actions:

- Add record in `job_freelancers`  
- `share_amount = job.amount / number_of_freelancers`  
- If job requires only 1 freelancer:
  - `job.status = IN_PROGRESS`  

Notifications:

- Notify customer: freelancer accepted  

---

## 5. Job Progress Flow

### 5.1 Freelancer Submits Work

Checks:

- Freelancer is assigned to job  
- Proof of work provided  

Actions:

- Create `job_submissions` record  
- `job.status = SUBMITTED` then `AWAITING_CUSTOMER`  
- Start 4‑day timer  
- Schedule reminders every 8 hours  

Notifications:

- Notify customer: work submitted  

---

## 6. Customer Review Flow

### 6.1 Customer Accepts Work

Actions:

- `job.status = COMPLETED`  
- Release escrow funds  
- For each freelancer:
  - `payout = share_amount * level_percentage`  
  - Credit freelancer wallet  
  - Credit platform account with fee  

Notifications:

- Notify freelancer: job completed, funds released  

---

### 6.2 Customer Rejects Work

Checks:

- Detailed explanation required  

Actions:

- `job.status = IN_PROGRESS` (or keep a sub‑state)  
- Notify freelancer with rejection reason  

---

### 6.3 Customer Does Nothing (Auto‑Complete)

Triggered after 4 days with no response.

Actions:

- `job.status = COMPLETED`  
- Release funds as if accepted  
- Notify both parties  

---

## 7. Job Expiration Flow

### 7.1 No Freelancer Accepts (2 Months)

Triggered by scheduled task.

Actions:

- `job.status = EXPIRED`  
- Refund full escrow to customer wallet  
- Notify customer  

---

## 8. Deadline Overrun Flow

### 8.1 Deadline + 14 Days

Triggered by scheduled task.

Actions:

- `job.status = CANCELLED`  
- Refund full escrow to customer  
- Add strike to freelancer  
- Notify both parties  

---

## 9. Cancellation Flow

### 9.1 Cancel Before Acceptance

Actions:

- `job.status = CANCELLED`  
- Refund full escrow  
- Notify customer  

### 9.2 Cancel After Acceptance

Actions:

- `job.status = DISPUTE`  
- Start 7‑day negotiation window  
- Allow both sides to propose compensation  

If agreement:

- Pay freelancer agreed amount  
- Refund remainder to customer  
- `job.status = CANCELLED`  

If no agreement:

- Escalate to moderation  

---

## 10. Dispute Flow

### 10.1 Dispute Opened

Actions:

- `job.status = DISPUTE`  
- Assign moderator  
- Lock job from cancellation  

### 10.2 Moderator Decision

Moderator sets:

- `freelancer_amount`  
- `customer_refund`  

Actions:

- Release funds accordingly  
- `job.status = COMPLETED` or `CANCELLED`  
- Log in `moderation_logs`  

### 10.3 Special Circumstances

If mishandled:

- Escalate to Head of Moderation  
- Possible override  
- Possible moderator discipline  

---

## 11. Ban Flow

### 11.1 User Banned

Actions:

- `user.status = BANNED`  
- Cancel all active jobs  
- For each job:
  - Refund or partial refund based on moderation decision  
- Freeze wallet if needed  
- Withhold funds only in extreme abuse cases (manual only)  

---

## 12. Wallet & Transaction Logic

Wallet supports:

- `deposit`  
- `withdrawal`  
- `escrow_hold`  
- `escrow_release`  
- `refund`  
- `fee`  

Each movement creates a `transactions` record.

---

## 13. Notification Logic

Each event triggers a notification with:

- `user_id`  
- `type`  
- `title`  
- `body`  
- `source_type`  
- `source_id`  

Frontend routes based on `source_type` and `source_id`.

---

## 14. Moderator Logic

Moderators can:

- View disputes  
- Request evidence  
- Decide payouts  
- Issue warnings  
- Recommend bans  
- Escalate cases  

Cannot:

- Ban users alone  
- Withhold funds automatically  

---

## 15. Scheduled Tasks (CRON)

Runs hourly:

- Auto‑completion checks  
- Job expiration checks  
- Deadline overrun checks  
- Reminder notifications  

---

**End of Backend Logic**
📜 docs/terms_of_service.md (Terms of Service)
markdown
# Linxora Terms of Service (Draft)

**Effective Date:** Upon Platform Launch  
**Last Updated:** Upon any revision

---

## 1. Introduction

Welcome to Linxora (“the Platform”). These Terms of Service (“Terms”) govern your access to and use of Linxora’s website, mobile application, and services (“Services”). By creating an account or using the Platform, you agree to be bound by these Terms.

If you do not agree, you may not use Linxora.

---

## 2. Eligibility

To use Linxora, you must:

- Be at least 18 years old  
- Have the legal capacity to enter into contracts  
- Not be banned or suspended from the Platform  
- Use the Platform in compliance with all applicable laws  

---

## 3. Account Registration

You agree to:

- Provide accurate and complete information  
- Maintain the security of your login credentials  
- Not create multiple accounts  
- Not impersonate another person  
- Not share your account with others  

Linxora may suspend or terminate accounts that violate these rules.

---

## 4. Platform Role

Linxora is a **marketplace platform**, not an employer, contractor, or agent of any user.

Linxora:

- Does not guarantee job outcomes  
- Does not supervise freelancers  
- Does not control customer requirements  
- Is not responsible for the quality, timeliness, or legality of work performed  

All contracts for work are strictly between customers and freelancers.

---

## 5. Payments and Escrow

### 5.1 Escrow Requirement

All jobs must be fully funded before being submitted for approval.  
If the customer’s wallet balance is insufficient, the job cannot be submitted.

### 5.2 Escrow Hold

Once submitted, the job amount is held in escrow until:

- The job is completed  
- The job is canceled  
- A dispute is resolved  

### 5.3 Multi‑Freelancer Jobs

If multiple freelancers accept a job, the job amount is split evenly among them.

### 5.4 Level‑Based Earnings

Freelancers receive a payout based on their level.  
The Platform retains the difference between:

- The freelancer’s share  
- The freelancer’s level‑based payout  

### 5.5 Withdrawal Fees

Withdrawal fees (e.g., PayPal fees) are passed directly to the user.

---

## 6. Job Lifecycle

### 6.1 Posting and Approval

Jobs must be approved by Linxora before becoming visible to freelancers.

### 6.2 Acceptance

A job becomes active once a freelancer accepts it.

### 6.3 Submission

Freelancers must upload proof of work before marking a job as finished.

### 6.4 Customer Review

Customers have **4 days** to accept or reject submitted work.

### 6.5 Auto‑Completion

If the customer does not respond within 4 days:

- The job is automatically completed  
- Funds are released to the freelancer  

---

## 7. Cancellations and Refunds

### 7.1 Cancel Before Acceptance

Customers may cancel anytime before a freelancer accepts.  
Refund: **100%**

### 7.2 Cancel After Acceptance

If a customer cancels after acceptance:

- Customer and freelancer have **7 days** to agree on compensation  
- If they agree:
  - Agreed amount goes to freelancer  
  - Remainder refunded to customer  
- If they do not agree:
  - The case is escalated to moderation  

### 7.3 Deadline Overrun

If a freelancer misses the deadline + 14‑day grace period:

- Job is canceled  
- Customer receives a full refund  
- Freelancer may receive a strike  

### 7.4 Refunds After Completion

Once a job is completed and funds are released:

- **No refunds** are issued  
- Exception: Special circumstances (Section 7.5)

### 7.5 Special Circumstances

Refunds may be issued if:

- Customer attempted to cancel  
- Moderator ignored or mishandled the request  
- Job auto‑completed unfairly  

These cases are reviewed by the **Head of Moderation**.

---

## 8. Disputes

### 8.1 Opening a Dispute

A dispute may be opened when:

- Customer rejects work  
- Customer cancels after acceptance  
- Freelancer reports scope abuse  
- Either party alleges misconduct  

### 8.2 Moderation Process

Moderators may:

- Request evidence  
- Review submissions and messages  
- Decide compensation  
- Issue warnings  
- Escalate to the Head of Moderation  

### 8.3 Finality of Decisions

Moderator decisions are final within the Platform.  
The Head of Moderation may override decisions in special cases.

---

## 9. User Conduct

Users agree not to:

- Harass, threaten, or abuse others  
- Attempt fraud or chargebacks  
- Request work outside the job description  
- Submit false reports  
- Exploit loopholes  
- Spam or misuse the Platform  
- Circumvent bans or restrictions  

---

## 10. Bans and Account Actions

### 10.1 Grounds for Ban

Users may be banned for:

- Fraud  
- Harassment  
- Repeated disputes in bad faith  
- Chargeback attempts  
- Moderator abuse  
- System manipulation  
- Violating these Terms  

### 10.2 Effects of Ban

If banned:

- All active jobs are canceled  
- Funds may be refunded or partially refunded  
- In extreme abuse cases, funds may be withheld  
- Withholding funds is:
  - Manual only  
  - Extremely rare  
  - Never automated  

### 10.3 Right to Defend

Before a ban:

- Users must be given a chance to explain their side  
- If this opportunity is denied:
  - The case may be escalated to the Head of Moderation  
  - If unresolved, the user may contact the Founder  

---

## 11. Proof of Work Requirements

Freelancers must provide:

- Files  
- Screenshots  
- Links  
- Logs  
- Any evidence showing the work was completed  

Customers must:

- Provide detailed reasons for rejection  
- Not request work outside the job description  

---

## 12. Limitation of Liability

To the fullest extent permitted by law:

- Linxora is not liable for lost profits, data loss, or indirect damages  
- Linxora is not responsible for:
  - Work quality  
  - Missed deadlines  
  - Disputes between users  
  - Payment processor issues  
- Linxora’s total liability is limited to the amount paid to the Platform in the last 12 months  

---

## 13. No Legal Action Clause

Users agree that:

- All disputes must be handled through Linxora’s internal dispute system  
- Users may not pursue legal action against Linxora except where legally unavoidable  
- Moderator and Head of Moderation decisions are binding within the Platform  

---

## 14. Changes to Terms

Linxora may update these Terms at any time.  
Continued use of the Platform constitutes acceptance of updated Terms.

---

## 15. Contact Information

For support or escalations:  
Contact the Founder through the official Linxora support system.

---

**End of Terms of Service Draft**
🛡️ docs/moderator_handbook.md (Moderator Handbook)
markdown
# Linxora Moderator Handbook

**Effective Date:** Upon Platform Launch  
**Audience:** Moderators, Head of Moderation, Admins, Founder

---

## 1. Introduction

Moderators are the backbone of Linxora’s fairness and safety.

Your job is to:

- Protect users  
- Resolve disputes  
- Enforce rules  
- Maintain platform integrity  
- Act with neutrality and professionalism  

This handbook defines your responsibilities, authority, and required procedures.

---

## 2. Moderator Roles

### 2.1 Standard Moderator

Responsibilities:

- Handle disputes  
- Review reports  
- Decide compensation splits  
- Issue warnings  
- Lock/unlock jobs  
- Communicate with users  
- Document all actions  

Limitations:

- Cannot ban users without approval  
- Cannot override Head of Moderation  
- Cannot deny users a chance to defend themselves  
- Cannot withhold funds automatically  

---

### 2.2 Head of Moderation

Responsibilities:

- Handle escalated disputes  
- Review moderator misconduct  
- Approve bans  
- Approve special refunds  
- Override incorrect decisions  
- Train moderators  

Authority:

- Final decision-maker before Founder  
- Can remove moderators from position  

---

### 2.3 Founder

Responsibilities:

- Handle extreme escalations  
- Review staff misconduct  
- Make final decisions when needed  

Authority:

- Highest authority on the platform  
- Can override any decision  
- Can permanently ban users or staff  

---

## 3. Moderator Code of Conduct

Moderators must:

- Act neutrally  
- Base decisions on evidence  
- Treat all users with respect  
- Respond within required timeframes  
- Allow both sides to speak  
- Escalate when unsure  
- Keep all internal information confidential  
- Never abuse their authority  

Violations may result in:

- Warnings  
- Suspension  
- Removal from moderation  
- Permanent ban (in extreme cases)  

---

## 4. Communication Standards

Moderators must:

- Use clear, professional language  
- Avoid emotional or aggressive tone  
- Never insult or belittle users  
- Never argue with users  
- Never threaten users  
- Never promise outcomes before reviewing evidence  

All communication should be:

- Neutral  
- Respectful  
- Documented  

---

## 5. Dispute Handling Process

### 5.1 When a Dispute Opens

You must:

1. Review the job details  
2. Review the chat history  
3. Review all submissions  
4. Review deadlines and timestamps  
5. Request additional evidence if needed  

You must acknowledge the dispute within **24 hours**.

---

### 5.2 Evidence Requirements

From freelancers:

- Proof of work (files, screenshots, links, logs)  
- Explanation of what was completed  

From customers:

- Specific reasons for rejection  
- Screenshots or examples of missing work  

If a customer demands work outside the job description:

- Mark as **scope abuse**  
- Lock job  
- Begin investigation  

---

### 5.3 Decision Making

You must determine:

- Did the freelancer complete the agreed work  
- Is the customer requesting extra work  
- Is the freelancer missing required parts  
- Is either party acting in bad faith  

Your decision must include:

- Amount paid to freelancer  
- Amount refunded to customer  
- Explanation for both sides  
- Documentation in moderation logs  

---

### 5.4 Compensation Rules

If freelancer completed the job:

- Full payout to freelancer  
- No refund to customer  

If freelancer partially completed the job:

- Partial payout  
- Partial refund  

If freelancer did not complete the job:

- Full refund  
- No payout  

If customer abused the system:

- Full payout to freelancer  
- Warning or penalty to customer  

---

### 5.5 Finality

Your decision is final unless:

- You escalate to Head of Moderation  
- The user appeals to Head of Moderation  
- You made a procedural error  

---

## 6. Cancellation Handling

### 6.1 Before Freelancer Accepts

- Customer may cancel freely  
- Full refund  
- No dispute needed  

### 6.2 After Freelancer Accepts

- Customer and freelancer have **7 days** to negotiate  
- If no agreement → dispute  
- Moderator decides payout split  

---

## 7. Auto‑Completion Rules

- Customer has 4 days to respond  
- Reminders every 8 hours  
- If no response → auto‑complete  
- Funds released to freelancer  

If customer claims they tried to cancel but were ignored:

- Escalate to Head of Moderation  
- Possible refund  
- Moderator who ignored request may face discipline  

---

## 8. Deadline Overrun Rules

If freelancer misses deadline + 14 days:

- Job auto‑cancels  
- Customer receives full refund  
- Freelancer receives a strike  

Moderators must verify timestamps before issuing strikes.

---

## 9. Reports (Scope Abuse, Harassment, Fraud)

### 9.1 Scope Abuse

If customer demands extra work:

- Lock job  
- Review job description  
- Review messages  
- Decide if request is valid or abusive  

If abusive:

- Customer receives warning  
- Freelancer protected  
- Job continues normally  

---

### 9.2 Harassment

If harassment occurs:

- Immediate warning  
- Possible temporary suspension  
- Severe cases → escalate for ban  

---

### 9.3 Fraud

Examples:

- Fake submissions  
- Fake screenshots  
- Attempted chargebacks  
- Manipulating deadlines  
- Creating multiple accounts  

Fraud must be escalated to Head of Moderation.

---

## 10. Ban Procedures

Moderators cannot ban users alone.

Steps:

1. Gather evidence  
2. Write a detailed report  
3. Submit to Head of Moderation  
4. Head reviews and approves/denies  
5. If approved:
   - User is banned  
   - All jobs canceled  
   - Funds handled case‑by‑case  

Extreme cases:

- Funds may be withheld  
- Only Head of Moderation or Founder can approve this  

---

## 11. Moderator Misconduct

Moderators may be disciplined for:

- Ignoring cancellation requests  
- Denying users a chance to defend themselves  
- Abusing authority  
- Being biased  
- Mishandling disputes  
- Failing to document actions  
- Being disrespectful  
- Leaking internal information  

Penalties:

- Warning  
- Suspension  
- Removal  
- Permanent ban (extreme cases)  

---

## 12. Escalation Path

Standard path:

- Moderator → Head of Moderation → Founder  

Escalate when:

- You are unsure  
- User claims moderator misconduct  
- Special refund is requested  
- User threatens legal action  
- Fraud is suspected  
- A moderator made a mistake  
- A user was denied a chance to defend themselves  

---

## 13. Documentation Requirements

Every action must be logged:

- What happened  
- Why it happened  
- Evidence used  
- Decision made  
- Users notified  
- Timestamp  
- Moderator name  

---

## 14. Moderator Tools & Permissions

Moderators can:

- View all job details  
- View all submissions  
- View all reports  
- Lock/unlock jobs  
- Issue warnings  
- Decide disputes  
- Request evidence  
- Escalate cases  

Moderators cannot:

- Ban users  
- Issue special refunds  
- Override Head of Moderation  
- Change platform settings  
- Access founder‑level tools  

---

## 15. Moderator Expectations

Moderators must:

- Be active  
- Respond quickly  
- Stay neutral  
- Follow procedures  
- Protect users  
- Protect the platform  
- Maintain professionalism  

---

**End of Moderator Handbook**
🔔 docs/notification_system.md (Notification System Flow)
markdown
# Linxora Notification System Flow

**Purpose:** Deliver timely, actionable, deep‑linked notifications to users.

---

## 1. Notification Principles

Notifications must be:

- Actionable  
- Contextual  
- Timely  
- Non‑spammy  
- Logged  

Each notification has:

- `type`  
- `source_type`  
- `source_id`  
- A clear destination route  

---

## 2. Notification Structure

Fields:

- `user_id` — recipient  
- `type` — event type  
- `title` — short summary  
- `body` — detailed message  
- `source_type` — `job`, `user`, `dispute`, `system`  
- `source_id` — ID of related entity  
- `is_read` — boolean  
- `created_at` — timestamp  

---

## 3. Notification Types

### 3.1 User‑to‑User

**Friend Request**

- `type: friend_request`  
- `source_type: user`  
- `source_id: friend_user_id`  
- Tap → Friend Request screen / user profile  

**Message Received**

- `type: message`  
- `source_type: user`  
- `source_id: sender_id`  
- Tap → Chat with sender  

---

### 3.2 Job Lifecycle

**Job Approved**

- `type: job_status_change`  
- `source_type: job`  
- `source_id: job_id`  
- Tap → Job Details  

**Freelancer Accepted Job**

- `type: job_application`  
- `source_type: job`  
- `source_id: job_id`  
- Tap → Job Applicants section  

**Work Submitted**

- `type: job_status_change`  
- `source_type: job`  
- `source_id: job_id`  
- Tap → Submission Review  

**Customer Accepted Work**

- `type: job_status_change`  
- `source_type: job`  
- `source_id: job_id`  
- Tap → Completed Job Details  

**Customer Rejected Work**

- `type: job_status_change`  
- `source_type: job`  
- `source_id: job_id`  
- Tap → Submission Review with rejection notes  

---

### 3.3 Auto‑Completion

**Reminder (Every 8 Hours)**

- `type: system`  
- `source_type: job`  
- `source_id: job_id`  
- Tap → Submission Review  

**Final Warning**

- `type: system`  
- `source_type: job`  
- `source_id: job_id`  
- Tap → Submission Review  

**Auto‑Completed**

- `type: job_status_change`  
- `source_type: job`  
- `source_id: job_id`  
- Tap → Completed Job Details  

---

### 3.4 Cancellations

**Customer Cancels Before Acceptance**

- `type: job_status_change`  
- `source_type: job`  
- `source_id: job_id`  
- Tap → Job Details (Canceled)  

**Customer Cancels After Acceptance**

- `type: job_status_change`  
- `source_type: job`  
- `source_id: job_id`  
- Tap → Dispute / Negotiation screen  

---

### 3.5 Disputes

**Dispute Opened**

- `type: dispute_update`  
- `source_type: dispute`  
- `source_id: dispute_id`  
- Tap → Dispute Details  

**Moderator Requests Evidence**

- `type: dispute_update`  
- `source_type: dispute`  
- `source_id: dispute_id`  
- Tap → Evidence Upload  

**Dispute Resolved**

- `type: dispute_update`  
- `source_type: dispute`  
- `source_id: dispute_id`  
- Tap → Final Decision  

---

### 3.6 Deadlines & Expiration

**Deadline Approaching**

- `type: system`  
- `source_type: job`  
- `source_id: job_id`  
- Tap → Job Details  

**Deadline Missed (Grace Period Started)**

- `type: system`  
- `source_type: job`  
- `source_id: job_id`  
- Tap → Job Details  

**Job Expired (No Freelancer)**

- `type: job_status_change`  
- `source_type: job`  
- `source_id: job_id`  
- Tap → Job Details (Expired)  

---

### 3.7 Account & Moderation

**Warning Issued**

- `type: system`  
- `source_type: user`  
- `source_id: moderator_id`  
- Tap → Warning Details  

**Temporary Suspension**

- `type: system`  
- `source_type: user`  
- `source_id: moderator_id`  
- Tap → Suspension Details  

**Ban Notice**

- `type: system`  
- `source_type: user`  
- `source_id: moderator_id`  
- Tap → Ban Explanation  

---

## 4. Deep‑Link Routing

If `source_type = job` → `/job/{job_id}`  
If `source_type = user` → `/user/{user_id}`  
If `source_type = dispute` → `/dispute/{dispute_id}`  
If `source_type = system` → `/system/notifications`  

---

## 5. Notification Triggers

| Event | Recipient |
|-------|-----------|
| Job approved | Customer |
| Freelancer accepts | Customer |
| Work submitted | Customer |
| Customer accepts | Freelancer |
| Customer rejects | Freelancer |
| Auto‑completion warnings | Customer |
| Auto‑completion final | Customer |
| Auto‑completion executed | Customer + Freelancer |
| Customer cancels | Freelancer (if accepted) |
| Dispute opened | Both parties |
| Moderator requests evidence | Target user |
| Dispute resolved | Both parties |
| Deadline approaching | Freelancer |
| Deadline missed | Freelancer + Customer |
| Job expired | Customer |
| Warning issued | User |
| Suspension | User |
| Ban | User |

---

## 6. Frequency Rules

- Auto‑completion reminders: every 8 hours  
- Deadline reminders: once per day  
- Moderation messages: only when needed  
- System announcements: rare  

---

## 7. Priority Levels

- High — requires immediate action (submission, dispute, auto‑complete)  
- Medium — important but not urgent (deadlines)  
- Low — informational (friend requests, system updates)  

---

## 8. Read/Unread Behavior

- New notifications: `is_read = false`  
- Mark as read when:
  - User taps it  
  - User views related screen  

Users may manually mark notifications as read.

---

## 9. Cleanup Rules

- Notifications older than 12 months may be archived  
- Archived notifications remain viewable but not active  
- Deleted accounts → notifications anonymized  

---

## 10. Moderator Notification Tools

Moderators can:

- Send manual notifications  
- Request evidence  
- Issue warnings  
- Notify users of decisions  
- Trigger system messages for disputes  

All moderator‑sent notifications are logged.

---

**End of Notification System Flow**
🗄️ db/schema.sql (Database Schema)
sql
-- Linxora Database Schema (Final)

-- 1. USERS

CREATE TABLE users (
    id BIGINT PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
    email VARCHAR(255) UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    username VARCHAR(50) NOT NULL,
    role VARCHAR(20) NOT NULL CHECK (role IN ('customer','freelancer','moderator','head_moderator','admin','founder')),
    level INT NOT NULL DEFAULT 0,
    wallet_balance DECIMAL(12,2) NOT NULL DEFAULT 0.00,
    status VARCHAR(20) NOT NULL CHECK (status IN ('active','banned','suspended')),
    created_at TIMESTAMP NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE TABLE user_bans (
    id BIGINT PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
    user_id BIGINT NOT NULL REFERENCES users(id),
    reason TEXT NOT NULL,
    banned_by BIGINT NOT NULL REFERENCES users(id),
    created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

-- 2. TRANSACTIONS

CREATE TABLE transactions (
    id BIGINT PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
    user_id BIGINT NOT NULL REFERENCES users(id),
    job_id BIGINT REFERENCES jobs(id),
    type VARCHAR(30) NOT NULL CHECK (type IN ('deposit','withdrawal','escrow_hold','escrow_release','refund','fee','adjustment')),
    amount DECIMAL(12,2) NOT NULL,
    direction VARCHAR(10) NOT NULL CHECK (direction IN ('credit','debit')),
    created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

-- 3. JOBS

CREATE TABLE jobs (
    id BIGINT PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
    customer_id BIGINT NOT NULL REFERENCES users(id),
    title VARCHAR(255) NOT NULL,
    description TEXT NOT NULL,
    amount DECIMAL(12,2) NOT NULL,
    status VARCHAR(30) NOT NULL CHECK (status IN ('DRAFT','PENDING_APPROVAL','PENDING_ACCEPTANCE','IN_PROGRESS','SUBMITTED','AWAITING_CUSTOMER','COMPLETED','CANCELLED','DISPUTE','EXPIRED')),
    deadline TIMESTAMP,
    expires_at TIMESTAMP,
    approved_at TIMESTAMP,
    created_at TIMESTAMP NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

-- 4. ESCROW

CREATE TABLE escrow (
    id BIGINT PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
    job_id BIGINT NOT NULL REFERENCES jobs(id),
    customer_id BIGINT NOT NULL REFERENCES users(id),
    total_amount DECIMAL(12,2) NOT NULL,
    status VARCHAR(30) NOT NULL CHECK (status IN ('held','released','refunded','partial_refund')),
    created_at TIMESTAMP NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

-- 5. JOB FREELANCERS

CREATE TABLE job_freelancers (
    id BIGINT PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
    job_id BIGINT NOT NULL REFERENCES jobs(id),
    freelancer_id BIGINT NOT NULL REFERENCES users(id),
    share_amount DECIMAL(12,2) NOT NULL,
    level_at_time INT NOT NULL,
    payout_amount DECIMAL(12,2),
    status VARCHAR(20) NOT NULL CHECK (status IN ('accepted','removed','completed')),
    created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

-- 6. JOB SUBMISSIONS

CREATE TABLE job_submissions (
    id BIGINT PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
    job_id BIGINT NOT NULL REFERENCES jobs(id),
    freelancer_id BIGINT NOT NULL REFERENCES users(id),
    proof_files JSON,
    proof_links JSON,
    notes TEXT,
    submitted_at TIMESTAMP NOT NULL DEFAULT NOW(),
    status VARCHAR(20) NOT NULL CHECK (status IN ('submitted','revised','final'))
);

-- 7. DISPUTES

CREATE TABLE disputes (
    id BIGINT PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
    job_id BIGINT NOT NULL REFERENCES jobs(id),
    opened_by_user_id BIGINT NOT NULL REFERENCES users(id),
    reason TEXT NOT NULL,
    status VARCHAR(20) NOT NULL CHECK (status IN ('open','under_review','resolved')),
    moderator_id BIGINT REFERENCES users(id),
    resolution_notes TEXT,
    freelancer_amount DECIMAL(12,2),
    customer_refund DECIMAL(12,2),
    created_at TIMESTAMP NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

-- 8. MODERATION LOGS

CREATE TABLE moderation_logs (
    id BIGINT PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
    moderator_id BIGINT NOT NULL REFERENCES users(id),
    action_type VARCHAR(100) NOT NULL,
    target_user_id BIGINT REFERENCES users(id),
    job_id BIGINT REFERENCES jobs(id),
    notes TEXT,
    created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

-- 9. NOTIFICATIONS

CREATE TABLE notifications (
    id BIGINT PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
    user_id BIGINT NOT NULL REFERENCES users(id),
    type VARCHAR(50) NOT NULL,
    title VARCHAR(255) NOT NULL,
    body TEXT NOT NULL,
    source_type VARCHAR(20) NOT NULL CHECK (source_type IN ('job','user','dispute','system')),
    source_id BIGINT,
    is_read BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

-- 10. REPORTS

CREATE TABLE reports (
    id BIGINT PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
    reporter_id BIGINT NOT NULL REFERENCES users(id),
    accused_id BIGINT NOT NULL REFERENCES users(id),
    job_id BIGINT REFERENCES jobs(id),
    type VARCHAR(30) NOT NULL CHECK (type IN ('scope_abuse','harassment','fraud','other')),
    description TEXT NOT NULL,
    status VARCHAR(20) NOT NULL CHECK (status IN ('open','under_review','resolved')),
    moderator_id BIGINT REFERENCES users(id),
    created_at TIMESTAMP NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

-- 11. SCHEDULED TASKS

CREATE TABLE scheduled_tasks (
    id BIGINT PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
    job_id BIGINT REFERENCES jobs(id),
    task_type VARCHAR(30) NOT NULL CHECK (task_type IN ('auto_complete','expire_job','deadline_overrun','reminder')),
    run_at TIMESTAMP NOT NULL,
    status VARCHAR(20) NOT NULL CHECK (status IN ('pending','completed','cancelled')),
    created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

-- 12. PLATFORM SETTINGS

CREATE TABLE platform_settings (
    id BIGINT PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
    key VARCHAR(255) NOT NULL UNIQUE,
    value VARCHAR(255) NOT NULL,
    updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);