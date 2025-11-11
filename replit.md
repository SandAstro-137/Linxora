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
- Real-time price updates from CoinGecko API
- Simulated deposit and withdrawal system
- Transaction history with USD conversions
- Personal dashboard with portfolio breakdown

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

## Recent Changes (November 2025)

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
- Advanced job search with multiple filters
- Freelancer rating and review system  
- Milestone-based payment escrow
- Comprehensive admin analytics dashboard
- Real-time WebSocket notifications
- Email notification system

### Testing & Deployment
- End-to-end test coverage
- Load testing and performance optimization
- CI/CD pipeline setup
- Production deployment configuration
