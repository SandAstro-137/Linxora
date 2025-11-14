# Pixelcut - Professional Freelancer Job Marketplace

A full-stack job marketplace platform built with React, Express, and MongoDB Atlas. Features role-based access control, team collaboration with profit splitting, crypto wallet integration, and Discord synchronization.

## Overview

Pixelcut connects freelancers with customers through a moderated job board system. Freelancers can claim jobs, invite team members to collaborate, and receive equal profit splits. The platform features secure crypto payments (USDT, BTC, SOL, LTC), real-time Discord integrations, and comprehensive freelancer management tools.

## Features

### Authentication & Roles
- **Discord OAuth** authentication for secure login
- **Role-based access control**: Freelancer, Customer, Staff, Moderator
- Session management with secure cookies

### Job Board (Marketplace)
- **Job Listing**: Browse all approved jobs with search and category filters
- **Job Detail View**: Dedicated page showing full job description, client Discord username, budget, and requirements
- **Claim Jobs**: Freelancers can request to take available jobs (blue button when eligible)
- **Team Collaboration**: 
  - "Offer Team" button appears when a job is already taken
  - Invite other freelancers to join the team
  - Profits automatically split equally among all team members (2 people = 50/50, 4 people = 25/25/25/25, etc.)
  - Visual display of each team member's share and percentage
- **Job Creation**: Customers can create job posts (requires moderator approval)
- **Moderation Queue**: Staff and moderators can approve, reject, or request changes to pending jobs
  - **Request Changes**: Moderators can provide specific feedback for customers to address
  - Customers receive notifications and can edit/resubmit jobs directly from My Jobs page
  - Jobs with requested changes are clearly marked with moderator feedback displayed

### Crypto Wallet
- Track balances in USDT, SOL, BTC, and LTC
- **Real-time WebSocket price updates**: Live crypto prices broadcast every 3 seconds via WebSocket
- Server-side polling of CoinGecko API every 10 seconds with automatic reconnection
- Simulated deposit and withdrawal system
- Transaction history with USD conversions
- Personal dashboard with portfolio breakdown
- Pending balance tracking for jobs in progress

### Freelancer Profiles
- Display completed jobs and statistics
- Level system based on completed work
- Rating and review tracking
- Working hours management
- PTO (Paid Time Off) request system

### Discord Integration
- Discord role synchronization
- Team collaboration notifications
- Auto-post approved jobs to Discord channel via webhooks

## Technology Stack

### Frontend
- **React** with TypeScript
- **Wouter** for routing
- **TanStack Query** for data fetching
- **Shadcn UI** components
- **Tailwind CSS** for styling
- **Inter** and **JetBrains Mono** fonts

### Backend
- **Node.js** with Express
- **MongoDB Atlas** for persistent storage (with in-memory fallback for development)
- **TypeScript** for type safety
- **Discord Webhooks** for notifications
- **Express Session** for authentication
- **CoinGecko API** for crypto prices
- **WebSocket (ws)** for real-time price broadcasting

## Project Structure

```
├── client/               # Frontend React application
│   ├── src/
│   │   ├── components/  # Reusable UI components
│   │   ├── pages/       # Page components
│   │   ├── lib/         # Utilities and contexts
│   │   └── App.tsx      # Main app component
├── server/              # Backend Express application
│   ├── lib/            # Utilities and helpers
│   ├── middleware/     # Express middleware
│   ├── routes.ts       # API routes
│   ├── storage.ts      # Data storage interface
│   └── index.ts        # Server entry point
└── shared/             # Shared types and schemas
    └── schema.ts       # Database schemas
```

## Demo Accounts

For testing purposes, the following demo accounts are pre-seeded:

- **Freelancer**: Alex Chen (`demo-freelancer-1`)
- **Freelancer**: Sarah Johnson (`demo-freelancer-2`)
- **Customer**: Tech Startup Inc (`demo-customer-1`)
- **Moderator**: Admin User (`demo-moderator-1`)

## Environment Variables

Required secrets:
- `SESSION_SECRET` - Secret key for session encryption
- `MONGODB_URI` (optional) - MongoDB connection string for persistent storage
- `DISCORD_WEBHOOK_URL` (optional) - Discord webhook for job notifications

## Authentication

**Current Implementation**: Development demo login system allows testing all platform features with pre-seeded accounts.

**Production OAuth**: For production deployment, implement end-user Discord OAuth by:
1. Creating a Discord application at https://discord.com/developers/applications
2. Configuring OAuth2 redirect URLs
3. Implementing OAuth2 authorization code flow
4. Exchanging authorization codes for user tokens
5. Storing refresh tokens securely

The Replit Discord connector is currently used for app-level Discord integration (webhooks, notifications), not end-user authentication.

## API Endpoints

### Authentication
- `POST /api/auth/dev-login` - Development login
- `GET /api/auth/me` - Get current user
- `POST /api/auth/logout` - Logout

### Jobs
- `GET /api/jobs` - List active jobs
- `GET /api/jobs/:id` - Get job details with enriched data (customer info, collaborators, profit splits)
- `GET /api/my-jobs` - Get all jobs created by current user (all statuses)
- `POST /api/jobs` - Create new job (requires customer role)
- `PUT /api/jobs/:id` - Edit existing job (resets status to pending)
- `POST /api/jobs/:id/claim` - Claim a job (changes status from active to claimed)
- `POST /api/jobs/:jobId/invite` - Invite freelancer to join team

### Invitations
- `GET /api/invitations` - Get user's invitations
- `POST /api/invitations/:id/accept` - Accept team invitation (adds to collaborators)
- `POST /api/invitations/:id/reject` - Reject team invitation

### Wallet
- `GET /api/wallet` - Get user wallet
- `GET /api/wallet/prices` - Get crypto prices
- `POST /api/wallet/withdraw` - Withdraw funds

### Moderation
- `GET /api/moderation/pending` - Get pending jobs
- `POST /api/moderation/:id/approve` - Approve job
- `POST /api/moderation/:id/reject` - Reject job
- `POST /api/moderation/:id/request-changes` - Request changes with feedback

### PTO
- `GET /api/pto` - Get PTO requests
- `POST /api/pto` - Submit PTO request

## Development

The application runs on port 5000 and serves both the API and frontend. Hot reload is enabled for development.

## Recent Changes

### Real-Time WebSocket Price Updates (November 14, 2025) - Latest
**WebSocket implementation for live crypto prices:**

- **Backend WebSocket Server**: WebSocket server (`/ws/prices`) broadcasts crypto prices every 3 seconds
- **Price Polling Service**: Server-side CoinGecko API polling every 10 seconds for fresh price data
- **Frontend WebSocket Client**: Wallet page connects to WebSocket for real-time updates
- **Automatic Reconnection**: Frontend includes reconnection logic with proper cleanup to prevent ghost sockets
- **Hybrid Approach**: Falls back to REST API if WebSocket unavailable, ensuring reliability
- **Efficient Architecture**: Singleton price service shared across all WebSocket clients
- **Resource Management**: `shouldReconnect` ref prevents memory leaks on component unmount

### Phase 3 Completion - Advanced Features (November 11, 2025)
**All 12 tasks completed and architect-reviewed:**

**1-2. Role-Based Onboarding System**
- User schema extended with `hasCompletedOnboarding` boolean
- Multi-step wizard modal with role-specific content (freelancer, customer, moderator, staff)
- Automatic trigger on first login, never shown again after completion
- Smooth user experience with localStorage persistence

**3-5. Notification Center**
- Complete notification infrastructure with 8 API endpoints
- Bell icon in header with real-time unread badge
- Popover panel with organized tabs: Messages, Approvals, System
- Integrated with all key events (job approvals, PTO, invitations, team collaboration)
- Toast notifications for immediate feedback

**6. Enhanced Wallet with Pending Balance**
- Pending balance tracking for jobs awaiting completion
- Available vs. Total balance display with clear breakdown
- USDT locking during job approval, automatic release on completion
- Improved transaction history with filtering
- Real-time balance updates

**7-8. Team Collaboration Suite**
- 8 secure API endpoints for team notes, tasks, and messaging
- Team Notes: Create, edit, delete with author tracking
- Team Tasks: Create, toggle status, delete with assignee tracking
- Team Chat: Real-time messaging with 5-second auto-refresh
- Dedicated Team tab in job detail (visible only to team members)
- Full access control and authorization

**9. Smarter Search System**
- Levenshtein distance fuzzy matching for typo tolerance
- Synonym expansion across 10 categories (developer↔programmer↔coder, etc.)
- Budget range filtering (min/max)
- Server-side processing for better performance
- 70% similarity threshold for word matching, 75% for synonyms

**10. Functional Rating System**
- Complete rating schema with duplicate prevention
- Customers can rate freelancers after job completion
- Star selection UI (1-5) with optional review text
- Automatic freelancer rating recalculation (average of all ratings)
- Ownership verification and completion requirement enforcement

**11. Auto-Leveling & Real Stats Calculation**
- Automatic freelancer stats update on job completion
- Real completion percentage: (completed / assigned) * 100
- Job deduplication to prevent double-counting
- 5-tier level system: L1(0-4), L2(5-14), L3(15-29), L4(30-49), L5(50+)
- Automatic level promotion based on completed jobs count

**12. Profile Page Real Statistics Display**
- Replaced all demo data with real user statistics
- Displays completion percentage, rating, level, completed jobs
- Accurate level progress bar based on actual tier thresholds
- Defensive clamping for edge cases (progress 0-100%, never negative)
- Improved rating format: "4.5/5" instead of just "4.5"

### Previous Updates
- **Logo Integration**: Added Pixelcut logo to header navbar and favicon
- **Profile Picture Upload**: Users can now upload profile pictures via camera button on avatar
  - Client-side validation (image type, 5MB limit)
  - Base64 encoding and storage
  - Auto-updates across all UI components
- **Cancellation UI Improvements**: Dynamic toast messages based on approval requirements
  - "Cancellation being reviewed" for jobs requiring admin approval
  - "Job cancelled" for immediate cancellations (pending/active jobs)
- **Wallet TypeScript Fixes**: Resolved type errors in transaction history display

### New Features Implemented
- **Request Changes Workflow**: Complete moderation feedback system
  - Moderators can request specific changes with detailed feedback
  - Customers receive notifications and see feedback in My Jobs page
  - Edit & Resubmit flow allows customers to update jobs and resubmit for review
  - Jobs automatically reset to "pending" status when resubmitted
  - Frontend query param detection enables seamless edit mode transitions
- **Job Detail Page** (`/jobs/:id`): 
  - Full job description and requirements display
  - Customer Discord username visible to freelancers
  - Conditional action buttons based on job status and user role
  - Team member listing with profit split breakdown
- **Team Collaboration & Profit Splitting**:
  - Equal profit distribution among all team members
  - Visual display showing each member's dollar amount and percentage
  - Team invitation system with Discord notifications
- **MongoDB Atlas Integration**:
  - Complete `MongoStorage` class implementing full `IStorage` interface
  - Automatic fallback to in-memory storage if MongoDB connection fails
  - Connection pooling and error handling
  - Indexes on critical fields (discordId, status, userId, etc.)
- **Enhanced API Endpoints**:
  - Enriched `/api/jobs/:id` endpoint returns customer info, collaborator details, and calculated profit splits
  - User search endpoint for finding team members to invite
  - `GET /api/my-jobs` for customer job management
  - `PUT /api/jobs/:id` for job editing and resubmission

### Technical Improvements
- Fixed TypeScript type errors in storage layer
- Proper null coalescing for optional fields
- Improved error messages for MongoDB connection issues
- Better logging and user feedback for storage backend selection

### UI/UX Enhancements
- Blue primary button for "Request to Take Job" when eligible
- Grey secondary button when job is already taken
- "Offer Team" button appears below for collaboration
- Clean profit split visualization with avatars and amounts
- Responsive job detail layout with sidebar for key information

## Next Phase

### Production Readiness
- Implement end-user Discord OAuth (requires separate Discord app registration)
- Configure MongoDB connection with MONGODB_URI
- Set up Redis/MongoDB-backed session store for production
- Add CSRF protection and secure cookie settings
- Implement rate limiting and API security

### Feature Enhancements
- Real blockchain integration for crypto transactions
- Milestone-based payment escrow
- Comprehensive admin analytics dashboard
- Real-time WebSocket notifications for instant updates
- Email notification system
- Collaborator removal/rejection workflow (requires schema enhancement)
- Advanced performance monitoring and analytics

### Testing & Deployment
- End-to-end test coverage
- Load testing and performance optimization
- CI/CD pipeline setup
- Production deployment configuration
