# Linxora - Professional Freelancer Job Marketplace

## Overview
Linxora is a full-stack job marketplace connecting freelancers with customers through a moderated platform. It facilitates secure crypto payments, real-time Discord integrations, and comprehensive freelancer management. The platform's core purpose is to provide a seamless and secure environment for project collaboration with features like role-based access control, team collaboration with automated profit splitting, and a robust job moderation system. Linxora aims to be a leading platform for connecting talent with opportunity in the freelance economy.

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
    - Browse and search approved jobs.
    - Detailed job view with client information and requirements.
    - Freelancers can claim jobs and invite team members for collaboration.
    - Automated equal profit splitting among team members.
    - Customers can create job posts, subject to moderator approval.
    - Moderation queue for staff to approve, reject, or request changes to jobs, with customer notification and re-submission flow.
- **Crypto Wallet:**
    - Tracks balances in USDT, SOL, BTC, LTC.
    - Real-time crypto price updates via WebSockets and CoinGecko API.
    - Simulated deposit/withdrawal and transaction history.
    - Personal dashboard with portfolio breakdown and pending balance tracking.
- **Freelancer Features:** Profiles displaying completed jobs, statistics, a level system, rating/review tracking, and PTO request management.
- **Discord Integration:** Role synchronization, team collaboration notifications, and automatic posting of approved jobs via webhooks.
- **Notification Center:** Comprehensive notification infrastructure with a bell icon, unread badge, and categorized alerts for messages, approvals, and system events.
- **Onboarding System:** Multi-step role-specific onboarding wizard for new users.
- **Team Collaboration Suite:** Secure API endpoints for team notes, tasks, and real-time chat within job details.
- **Smart Search System:** Levenshtein distance fuzzy matching, synonym expansion, and budget range filtering.
- **Rating System:** Customers can rate freelancers post-completion, with automatic recalculation of freelancer averages.
- **Auto-Leveling & Statistics:** Automatic update of freelancer statistics (completion percentage, level based on completed jobs) displayed on profile pages.

**System Design Choices:**
- **Client-Side:** React with TypeScript, Wouter for routing, TanStack Query for data fetching.
- **Server-Side:** Node.js with Express, TypeScript for type safety.
- **Storage:** MongoDB Atlas for data persistence, with an in-memory fallback for development.
- **Real-time:** WebSockets for live data updates (e.g., crypto prices).
- **Project Structure:** Clear separation of client, server, and shared directories.

## External Dependencies
- **Discord:** OAuth for authentication, Webhooks for notifications and integrations.
- **MongoDB Atlas:** Cloud-hosted NoSQL database for persistent data storage.
- **CoinGecko API:** For fetching real-time cryptocurrency price data.
- **Shadcn UI:** UI component library.
- **Tailwind CSS:** Utility-first CSS framework.
- **Wouter:** React routing library.
- **TanStack Query:** Data fetching and caching library.
- **ws (WebSocket library):** For real-time communication on the backend.
- **Express Session:** For session management.