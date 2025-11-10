# Design Guidelines: Freelancer Marketplace Platform

## Design Approach
**Design System Foundation:** Material Design with inspiration from professional marketplace platforms (Upwork, Fiverr) and productivity tools (Linear, Notion)
- Clean, professional aesthetic prioritizing efficiency and data clarity
- Dashboard-centric interface optimized for frequent user interactions
- Trust-building through structured layouts and clear information hierarchy

## Typography
**Font Stack:** Inter (headings, UI) + JetBrains Mono (wallet addresses, transaction IDs)
- Headings: text-2xl to text-4xl, font-semibold to font-bold
- Body: text-sm to text-base, font-normal
- Labels/Meta: text-xs to text-sm, font-medium
- Monospace: text-sm for crypto addresses and technical data

## Layout System
**Spacing Units:** Tailwind units of 2, 4, 6, and 8 (p-2, m-4, gap-6, h-8)
- Container widths: max-w-7xl for dashboards, max-w-4xl for forms/profiles
- Card padding: p-6 to p-8
- Section spacing: py-12 to py-16
- Grid gaps: gap-4 to gap-6

## Core Components

### Navigation
**Multi-Role Navigation Bar:**
- Persistent top bar with logo, role indicator badge, and user avatar dropdown
- Contextual sidebar (collapsible on mobile) showing role-specific menu items
- Quick access: Notification bell (Discord invites, job updates), wallet balance widget

### Dashboard Layouts
**Role-Specific Dashboards:**
- Grid-based card layouts (grid-cols-1 md:grid-cols-2 lg:grid-cols-3)
- Stats cards with large numbers (text-3xl) and trend indicators
- Recent activity feeds with avatar + timestamp + action pattern

### Job Board
**Job Listings:**
- Card-based layout with clear visual hierarchy
- Job cards include: title (text-lg font-semibold), budget badge, category tag, truncated description, time posted
- Search bar with filters (category dropdowns, keyword input)
- Status badges: "Pending Moderation" (yellow), "Active" (green), "Claimed" (blue)

**Job Creation Form:**
- Multi-step wizard layout with progress indicator
- Generous spacing between form fields (space-y-6)
- Clear field labels with helper text
- Template sections for job details, budget, requirements, deadline

### Crypto Wallet Dashboard
**Wallet Interface:**
- Hero card showing total USD balance (text-5xl font-bold) with last updated timestamp
- Currency breakdown grid (USDT, SOL, BTC, LTC) in 2x2 or 4-column layout
- Each currency card: coin logo, amount, USD equivalent, percentage of total
- Transaction history table with: date, type, amount, status, transaction ID (monospace)
- Withdraw/deposit action buttons prominently placed

### Freelancer Profiles
**Profile Layout:**
- Two-column desktop layout (avatar/stats sidebar + main content area)
- Stats cards: Completed jobs, Rating, Level badge, Specialization tags
- Working hours calendar/grid view with editable interface
- PTO request form card with date pickers and reason textarea
- Portfolio section: Grid of completed job cards with project images

### Moderation Queue (Staff/Moderator)
**Queue Interface:**
- Table view with job preview cards
- Actions: Approve (green), Reject (red), Request Changes (orange)
- Expandable details for each job submission
- Bulk action checkboxes and batch processing toolbar

### Discord Integration Components
**Role Sync Display:**
- Connected Discord account card with server/role badges
- Visual indicator of sync status (green checkmark or sync icon)

**Notification Cards:**
- Toast-style notifications for team invites
- In-app notification center with categorized tabs

## Forms & Inputs
- Consistent input styling: border, rounded corners, focus states with ring
- Form groups with labels above inputs
- Required field indicators (asterisk)
- Inline validation messages
- Primary action buttons: Large, prominent, right-aligned or centered

## Data Displays
**Tables:**
- Responsive tables with horizontal scroll on mobile
- Sticky headers for long lists
- Row hover states for interactivity
- Action columns with icon buttons

**Cards:**
- Subtle border or shadow elevation
- Rounded corners (rounded-lg)
- Hover state with subtle lift effect (translate-y)

## Status Indicators
**Badges & Labels:**
- Color-coded status badges (inline-flex items-center gap-1)
- Role badges (Freelancer, Customer, Staff, Moderator)
- Job status, transaction status, PTO request status
- Use subtle backgrounds with bold text

## Interactive Elements
**Buttons:**
- Primary: Solid background, prominent
- Secondary: Outline or subtle background
- Danger: For delete/reject actions
- Icon buttons for compact actions
- Sizes: sm, md, lg matching context

**Dropdowns & Selects:**
- Custom-styled selects matching form inputs
- Dropdown menus with hover states
- Search-enabled multi-select for tags/categories

## Images
**Hero Section:** Full-width hero image showing diverse freelancers collaborating (desktop/laptop devices visible), with blurred-background overlay for heading and CTA
**Profile Avatars:** User profile images throughout (64x64 to 128x128)
**Job Portfolio:** Project thumbnails in freelancer profiles (16:9 aspect ratio)
**Currency Icons:** Cryptocurrency logos in wallet dashboard
**Empty States:** Illustrations for empty job boards, no transactions, etc.

## Accessibility
- Consistent tab navigation order
- ARIA labels for icon-only buttons
- Keyboard shortcuts for common actions
- Clear focus indicators throughout
- Sufficient color contrast ratios

## Responsive Strategy
- Mobile: Single column, collapsible sidebar, stacked cards
- Tablet: 2-column layouts where appropriate
- Desktop: Full multi-column dashboards with sidebars
- Breakpoints: sm (640px), md (768px), lg (1024px), xl (1280px)