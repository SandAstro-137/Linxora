# FreelanceHub - Professional Freelancer Marketplace

A full-stack freelancer marketplace platform with role-based access control, crypto wallet integration, and Discord synchronization.

## Overview

FreelanceHub connects freelancers with customers through a moderated job board system. The platform features secure crypto payments (USDT, BTC, SOL, LTC), real-time Discord integrations, and comprehensive freelancer management tools.

## Features

### Authentication & Roles
- **Discord OAuth** authentication for secure login
- **Role-based access control**: Freelancer, Customer, Staff, Moderator
- Session management with secure cookies

### Job Board
- **Customers** can create job posts (moderation required)
- **Freelancers** can search and claim jobs
- **Keyword and category** search functionality
- **Collaboration system** - invite other freelancers to jobs
- **Moderation queue** for staff approval

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
- **MongoDB** (optional - falls back to in-memory storage)
- **Discord.js** for Discord integration
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
- `POST /api/jobs` - Create new job
- `POST /api/jobs/:id/claim` - Claim a job

### Wallet
- `GET /api/wallet` - Get user wallet
- `GET /api/wallet/prices` - Get crypto prices
- `POST /api/wallet/withdraw` - Withdraw funds

### Moderation
- `GET /api/moderation/pending` - Get pending jobs
- `POST /api/moderation/:id/approve` - Approve job
- `POST /api/moderation/:id/reject` - Reject job

### PTO
- `GET /api/pto` - Get PTO requests
- `POST /api/pto` - Submit PTO request

## Development

The application runs on port 5000 and serves both the API and frontend. Hot reload is enabled for development.

## Recent Changes

- Initial project setup with complete schema design
- Full frontend implementation with all pages and components
- Backend API with authentication, job management, wallet, and moderation
- Discord and CoinGecko integrations
- Demo data seeding for testing

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
