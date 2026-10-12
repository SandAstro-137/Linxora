import { storage } from "../storage";
import { EscrowStatus } from "@shared/schema";

export async function seedData() {
  // Check if data already exists
  const existingJobs = await storage.getJobs();
  if (existingJobs.length > 0) {
    console.log('Data already seeded, skipping...');
    return;
  }

  console.log('Seeding initial data...');

  // Create demo users
  const freelancer1 = await storage.createUser({
    discordId: "demo-freelancer-1",
    username: "Alex Chen",
    email: "alex@example.com",
    avatar: "https://api.dicebear.com/7.x/avataaars/svg?seed=Alex",
    role: "freelancer",
    level: 4,
    specialization: "Web Development",
    portfolio: "https://alexchen.dev",
    workingHours: {
      monday: { start: "09:00", end: "17:00" },
      tuesday: { start: "09:00", end: "17:00" },
      wednesday: { start: "09:00", end: "17:00" },
      thursday: { start: "09:00", end: "17:00" },
      friday: { start: "09:00", end: "17:00" },
      saturday: { start: "", end: "" },
      sunday: { start: "", end: "" },
    },
    completedJobs: 15,
    totalJobs: 15,
    completionPercentage: "100",
    totalEarned: "180",
  });

  const freelancer2 = await storage.createUser({
    discordId: "demo-freelancer-2",
    username: "Sarah Johnson",
    email: "sarah@example.com",
    avatar: "https://api.dicebear.com/7.x/avataaars/svg?seed=Sarah",
    role: "freelancer",
    level: 6,
    specialization: "UI/UX Design",
    portfolio: "https://sarahj.design",
    workingHours: {
      monday: { start: "10:00", end: "18:00" },
      tuesday: { start: "10:00", end: "18:00" },
      wednesday: { start: "10:00", end: "18:00" },
      thursday: { start: "10:00", end: "18:00" },
      friday: { start: "10:00", end: "18:00" },
      saturday: { start: "10:00", end: "14:00" },
      sunday: { start: "", end: "" },
    },
    completedJobs: 50,
    totalJobs: 50,
    completionPercentage: "100",
    totalEarned: "650",
  });

  const customer = await storage.createUser({
    discordId: "demo-customer-1",
    username: "Tech Startup Inc",
    email: "hiring@techstartup.com",
    avatar: "https://api.dicebear.com/7.x/initials/svg?seed=TSI",
    role: "customer",
  });

  const moderator = await storage.createUser({
    discordId: "demo-moderator-1",
    username: "Admin User",
    email: "admin@freelancehub.com",
    avatar: "https://api.dicebear.com/7.x/avataaars/svg?seed=Admin",
    role: "moderator",
  });

  const headModerator = await storage.createUser({
    discordId: "demo-head-mod-1",
    username: "Demo Head of Moderation",
    email: "headmod@linxova.com",
    avatar: "https://api.dicebear.com/7.x/avataaars/svg?seed=HeadMod",
    role: "head_of_moderation",
  });

  const founder = await storage.createUser({
    discordId: "demo-founder-1",
    username: "Founder",
    email: "founder@linxova.com",
    avatar: "https://api.dicebear.com/7.x/avataaars/svg?seed=Founder",
    role: "founder",
  }, true);

  const oneYearAgo = new Date();
  oneYearAgo.setFullYear(oneYearAgo.getFullYear() - 1);
  await Promise.all([
    storage.updateUser(freelancer1.id, { createdAt: oneYearAgo }),
    storage.updateUser(freelancer2.id, { createdAt: oneYearAgo }),
    storage.updateUser(customer.id, { createdAt: oneYearAgo }),
    storage.updateUser(moderator.id, { createdAt: oneYearAgo }),
    storage.updateUser(headModerator.id, { createdAt: oneYearAgo }),
    storage.updateUser(founder.id, { createdAt: oneYearAgo }),
  ]);

  // Create demo jobs with proper escrow records (matching real payment flow)
  const seedJobs = [
    {
      customerId: customer.id,
      title: "Build a Modern E-commerce Dashboard",
      description: "We need a responsive dashboard for our e-commerce platform with real-time analytics, order management, and inventory tracking.",
      category: "Web Development",
      budget: "2500",
      requirements: "React.js, TypeScript, Tailwind CSS, Chart.js",
      status: "active",
      deadline: new Date(Date.now() + 40 * 86400000),
      submittedForReviewAt: new Date(),
    },
    {
      customerId: customer.id,
      title: "Mobile App UI/UX Design",
      description: "Design a complete mobile app interface for a fitness tracking application. Should include onboarding, dashboard, workout tracking, and social features.",
      category: "Design",
      budget: "1800",
      requirements: "Figma, mobile design experience, fitness app knowledge preferred",
      status: "active",
      deadline: new Date(Date.now() + 20 * 86400000),
      submittedForReviewAt: new Date(),
    },
    {
      customerId: customer.id,
      title: "API Integration for Payment System",
      description: "Integrate Stripe payment gateway into existing Node.js application with webhook handling and subscription management.",
      category: "Web Development",
      budget: "1200",
      status: "active",
      deadline: new Date(Date.now() + 10 * 86400000),
      submittedForReviewAt: new Date(),
    },
    {
      customerId: customer.id,
      title: "Content Writing for Tech Blog",
      description: "Write 5 high-quality articles about emerging web development trends, each 1500-2000 words.",
      category: "Writing",
      budget: "500",
      status: "pending",
      deadline: new Date(Date.now() + 25 * 86400000),
      submittedForReviewAt: new Date(),
    },
    {
      customerId: customer.id,
      title: "Senior React Developer for SaaS Dashboard",
      description: "Build a production-grade SaaS analytics dashboard with real-time charts, role-based access, and a reusable component library.",
      category: "Web Development",
      budget: "3000",
      requirements: "React, TypeScript, TanStack Query, Tailwind CSS",
      status: "active",
      isPremium: true,
      premiumAmount: "300",
      deadline: new Date(Date.now() + 200 * 86400000),
      submittedForReviewAt: new Date(),
    },
    {
      customerId: customer.id,
      title: "Cross-Platform Fitness App (iOS & Android)",
      description: "Develop a cross-platform fitness tracking app with workout logging, social features, and wearable sync.",
      category: "Mobile Development",
      budget: "4500",
      requirements: "React Native or Flutter, experience shipping to both app stores",
      status: "active",
      isPremium: true,
      premiumAmount: "400",
      deadline: new Date(Date.now() + 60 * 86400000),
      submittedForReviewAt: new Date(),
    },
    {
      customerId: customer.id,
      title: "Brand Identity & Logo Design Package",
      description: "Full brand identity for a fintech startup: logo, color palette, typography, and brand guidelines.",
      category: "Design",
      budget: "1000",
      requirements: "Portfolio of brand work, Figma, print and digital deliverables",
      status: "active",
      isPremium: true,
      premiumAmount: "150",
      deadline: new Date(Date.now() + 12 * 86400000),
      submittedForReviewAt: new Date(),
    },
    {
      customerId: customer.id,
      title: "Blockchain Smart Contract Audit",
      description: "Security audit of ERC-20 and staking contracts including gas optimization and a detailed findings report.",
      category: "Other",
      budget: "6000",
      requirements: "Solidity expertise, prior audit reports, familiarity with Slither/Foundry",
      status: "active",
      isPremium: true,
      premiumAmount: "500",
      deadline: new Date(Date.now() + 8 * 86400000),
      submittedForReviewAt: new Date(),
    },
    {
      customerId: customer.id,
      title: "AI Support Chatbot with RAG",
      description: "Build an AI customer-support chatbot grounded in our documentation (RAG) with escalation to human agents.",
      category: "Data Science",
      budget: "2500",
      requirements: "OpenAI or similar LLMs, vector databases, Node.js or Python",
      status: "active",
      isPremium: true,
      premiumAmount: "250",
      deadline: new Date(Date.now() + 5 * 86400000),
      submittedForReviewAt: new Date(),
    },
    {
      customerId: customer.id,
      title: "Redesign Company Landing Page",
      description: "Redesign our marketing landing page with a modern look, responsive layout, and improved conversion copy.",
      category: "Web Development",
      budget: "2000",
      requirements: "React, Tailwind CSS, Figma handoff",
      status: "in_progress",
      freelancerId: freelancer1.id,
      collaborators: [freelancer2.id],
      deadline: new Date(Date.now() + 3 * 86400000),
      submittedForReviewAt: new Date(),
    },
  ];

  const totalSeedJobCost = seedJobs.reduce((sum, j) => sum + parseFloat(j.budget) + parseFloat(j.premiumAmount || "0"), 0);
  const customerStartingBalance = 50000;

  // Create demo wallets with initial balances
  const freelancer1Wallet = await storage.createWallet({
    userId: freelancer1.id,
    usdtBalance: "1250.50",
    solBalance: "12.5",
    btcBalance: "0.05",
    ltcBalance: "8.2",
    walletAddress: "0xabc123def456ghi789jkl012mno345pqr678stu",
  });

  const freelancer2Wallet = await storage.createWallet({
    userId: freelancer2.id,
    usdtBalance: "3400.00",
    solBalance: "25.8",
    btcBalance: "0.12",
    ltcBalance: "15.6",
    walletAddress: "0xdef789abc012ghi345jkl678mno901pqr234stu",
  });

  const customerWallet = await storage.createWallet({
    userId: customer.id,
    usdtBalance: (customerStartingBalance - totalSeedJobCost).toFixed(2),
    walletAddress: "0xcust123def456ghi789jkl012mno345pqr678stu",
  });

  // Create seed jobs with proper escrow records (matching real payment flow)
  for (const jobData of seedJobs) {
    const job = await storage.createJob(jobData);
    const budget = parseFloat(jobData.budget);
    const premium = parseFloat(jobData.premiumAmount || "0");
    const totalAmount = budget + premium;

    await storage.createEscrow({
      jobId: job.id,
      customerId: customer.id,
      totalAmount: totalAmount.toFixed(2),
      status: EscrowStatus.HELD,
    });

    await storage.createTransaction({
      walletId: customerWallet.id,
      type: "escrow_lock",
      currency: "USDT",
      amount: totalAmount.toFixed(8),
      usdAmount: totalAmount.toFixed(2),
      status: "completed",
      transactionHash: `escrow-lock-seed-${job.id}`,
    });
  }

  // Create demo transactions
  await storage.createTransaction({
    walletId: freelancer1Wallet.id,
    type: "deposit",
    currency: "USDT",
    amount: "500.00",
    usdAmount: "500.00",
    status: "completed",
    transactionHash: "0x1234567890abcdef1234567890abcdef12345678",
  });

  await storage.createTransaction({
    walletId: freelancer1Wallet.id,
    type: "withdrawal",
    currency: "BTC",
    amount: "0.01",
    usdAmount: "430.00",
    status: "completed",
    transactionHash: "0xabcdef1234567890abcdef1234567890abcdef12",
  });

  // Completed jobs so profiles have real job history + review context
  const completedJobData = [
    {
      customerId: customer.id,
      title: "E-commerce Dashboard MVP",
      description: "Built a responsive analytics dashboard.",
      category: "Web Development",
      budget: "2200",
      deadline: new Date(Date.now() - 30 * 86400000),
      status: "completed",
      freelancerId: freelancer1.id,
    },
    {
      customerId: customer.id,
      title: "Fitness App UI Design",
      description: "Designed a complete mobile app interface.",
      category: "Design",
      budget: "1600",
      deadline: new Date(Date.now() - 30 * 86400000),
      status: "completed",
      freelancerId: freelancer2.id,
    },
    {
      customerId: customer.id,
      title: "Marketing Landing Page",
      description: "Redesigned the marketing landing page.",
      category: "Web Development",
      budget: "1400",
      deadline: new Date(Date.now() - 30 * 86400000),
      status: "completed",
      freelancerId: freelancer1.id,
    },
  ];
  const completedJobs = [];
  for (const jobData of completedJobData) {
    completedJobs.push(await storage.createJob(jobData));
  }

  // Additional completed job history so profiles and "My Job Applications"
  // reflect the freelancers' lifetime job counters (Alex 15, Sarah 50).
  // Ratings/indexes above stay pinned to the original three jobs; the loop
  // below tops up each freelancer so completed job records match their
  // counters exactly.
  const namedHistory = [
    { title: "Dashboard Widget Library", category: "Web Development", budget: "900", who: "f1" },
    { title: "Contact Form & Email Integration", category: "Web Development", budget: "450", who: "f1", agoDays: 150 },
    { title: "Admin Panel CRUD Module", category: "Web Development", budget: "1100", who: "f1", agoDays: 165 },
    { title: "REST API for Inventory Sync", category: "Web Development", budget: "800", who: "f1", agoDays: 180 },
    { title: "Bug Fixes & Performance Pass", category: "Web Development", budget: "350", who: "f1", agoDays: 195 },
    { title: "React Component Refactor", category: "Web Development", budget: "650", who: "f1", agoDays: 210 },
    { title: "Node.js Cron Job Setup", category: "Web Development", budget: "300", who: "f1", agoDays: 225 },
    { title: "Static Site from Figma Design", category: "Web Development", budget: "700", who: "f1", agoDays: 240 },
    { title: "Third-Party API Integration", category: "Web Development", budget: "950", who: "f1", agoDays: 255 },
    { title: "E-commerce Store Theme", category: "Web Development", budget: "1200", who: "f1", agoDays: 270 },
    { title: "Landing Page A/B Variants", category: "Web Development", budget: "500", who: "f1", agoDays: 285 },
    { title: "Onboarding Flow UX Audit", category: "Design", budget: "600", who: "f2", agoDays: 150 },
    { title: "Mobile App Icon Set", category: "Design", budget: "400", who: "f2", agoDays: 165 },
    { title: "SaaS Dashboard UI Kit", category: "Design", budget: "1400", who: "f2", agoDays: 180 },
    { title: "Email Template Designs", category: "Design", budget: "350", who: "f2", agoDays: 195 },
    { title: "Marketing site hero illustrations", category: "Design", budget: "550", who: "f2", agoDays: 210 },
    { title: "Design System Foundations", category: "Design", budget: "1600", who: "f2", agoDays: 225 },
    { title: "Web App Accessibility Pass", category: "Design", budget: "750", who: "f2", agoDays: 240 },
    { title: "Prototype for Pitch Demo", category: "Design", budget: "500", who: "f2", agoDays: 255 },
    { title: "Brand Refresh Concepts", category: "Design", budget: "900", who: "f2", agoDays: 270 },
    { title: "Analytics Dashboard Charts", category: "Design", budget: '650', who: "f2", agoDays: 285 },
    { title: "Illustration Pack for Blog", category: "Design", budget: "450", who: "f2", agoDays: 300 },
    { title: "App Store Screenshots", category: "Design", budget: "300", who: "f2", agoDays: 315 },
  ];
  // Alex: 15 completed lifetime = 3 named above + 10 named here + 2 filler.
  // Sarah: 50 completed lifetime = 1 named above + 12 named here + 37 filler.
  const f1Remaining = 15 - completedJobData.filter(j => j.freelancerId === freelancer1.id).length - namedHistory.filter(h => h.who === "f1").length;
  const f2Remaining = 50 - completedJobData.filter(j => j.freelancerId === freelancer2.id).length - namedHistory.filter(h => h.who === "f2").length;
  const historyTemplate = [
    ...namedHistory,
    ...Array.from({ length: f1Remaining }, (_, i) => ({
      title: `Web Utility Project #${i + 1} (Archived)`, category: "Web Development", budget: "600", who: "f1", agoDays: 300 + (i + 1) * 20,
    })),
    ...Array.from({ length: f2Remaining }, (_, i) => ({
      title: `Design Retainer Project #${i + 1} (Archived)`, category: "Design", budget: "500", who: "f2", agoDays: 330 + (i + 1) * 20,
    })),
  ];
  for (const h of historyTemplate) {
    const job = await storage.createJob({
      customerId: customer.id,
      title: h.title,
      description: `Completed ${h.title} project for Tech Startup Inc.`,
      category: h.category,
      budget: h.budget,
      deadline: new Date(Date.now() - (h.agoDays ?? 120) * 86400000),
      status: "completed",
      freelancerId: h.who === "f1" ? freelancer1.id : freelancer2.id,
    });
    // Backdate so application history sorts realistically.
    await storage.updateJob(job.id, {
      createdAt: new Date(Date.now() - ((h.agoDays ?? 120) + 14) * 86400000),
      updatedAt: new Date(Date.now() - (h.agoDays ?? 120) * 86400000),
    } as any);
  }

  // Customer reviews of freelancers
  const seededRatings = [
    { jobId: completedJobs[0].id, freelancerId: freelancer1.id, score: 5, review: "Alex delivered an outstanding dashboard ahead of schedule. Communication was excellent throughout." },
    { jobId: completedJobs[1].id, freelancerId: freelancer2.id, score: 5, review: "Sarah's UI design was clean, modern, and exactly what we envisioned. Highly recommend." },
    { jobId: completedJobs[2].id, freelancerId: freelancer1.id, score: 4, review: "Great landing page and quick turnaround. A minor revision was needed but resolved fast." },
  ];
  for (const r of seededRatings) {
    await storage.createRating({ ...r, customerId: customer.id });
  }

  // Freelancer reviews of the customer
  const seededCustomerRatings = [
    { jobId: completedJobs[0].id, freelancerId: freelancer1.id, score: 5, review: "Clear requirements and fast feedback. A pleasure to work with." },
    { jobId: completedJobs[1].id, freelancerId: freelancer2.id, score: 4, review: "Good client, though approvals were sometimes slow." },
    { jobId: completedJobs[2].id, freelancerId: freelancer1.id, score: 5, review: "Professional and responsive. Would definitely work with them again." },
  ];
  for (const r of seededCustomerRatings) {
    await storage.createCustomerRating({ ...r, customerId: customer.id });
  }

  // Recompute aggregate rating/totalRatings from the seeded reviews so the
  // header summary matches the individual reviews shown on each profile.
  for (const freelancer of [freelancer1, freelancer2]) {
    const ratings = await storage.getRatingsByFreelancer(freelancer.id);
    if (ratings.length > 0) {
      const avg = ratings.reduce((sum, r) => sum + r.score, 0) / ratings.length;
      await storage.updateUser(freelancer.id, {
        rating: avg.toFixed(2),
        totalRatings: ratings.length,
      });
    }
  }
  const seededCustomerRatingsAll = await storage.getCustomerRatings(customer.id);
  if (seededCustomerRatingsAll.length > 0) {
    const avg = seededCustomerRatingsAll.reduce((sum, r) => sum + r.score, 0) / seededCustomerRatingsAll.length;
    await storage.updateUser(customer.id, {
      rating: avg.toFixed(2),
      totalRatings: seededCustomerRatingsAll.length,
    });
  }

  console.log('Initial data seeded successfully!');
  console.log('\nDemo accounts created:');
  console.log('- Freelancer: Alex Chen (ID:', freelancer1.discordId, ')');
  console.log('- Freelancer: Sarah Johnson (ID:', freelancer2.discordId, ')');
  console.log('- Customer: Tech Startup Inc (ID:', customer.discordId, ')');
  console.log('- Moderator: Admin User (ID:', moderator.discordId, ')');
  console.log('- Founder:', founder.username, '(ID:', founder.discordId, ')');
}
