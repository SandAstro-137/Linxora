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
    level: 3,
    specialization: "Web Development",
    completedJobs: 12,
    rating: "4.8",
  });

  const freelancer2 = await storage.createUser({
    discordId: "demo-freelancer-2",
    username: "Sarah Johnson",
    email: "sarah@example.com",
    avatar: "https://api.dicebear.com/7.x/avataaars/svg?seed=Sarah",
    role: "freelancer",
    level: 5,
    specialization: "UI/UX Design",
    completedJobs: 28,
    rating: "4.9",
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

  const founder = await storage.createUser({
    discordId: "demo-founder-1",
    username: "Founder",
    email: "founder@linxora.com",
    avatar: "https://api.dicebear.com/7.x/avataaars/svg?seed=Founder",
    role: "founder",
  }, true);

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
      submittedForReviewAt: new Date(),
    },
    {
      customerId: customer.id,
      title: "API Integration for Payment System",
      description: "Integrate Stripe payment gateway into existing Node.js application with webhook handling and subscription management.",
      category: "Web Development",
      budget: "1200",
      status: "active",
      submittedForReviewAt: new Date(),
    },
    {
      customerId: customer.id,
      title: "Content Writing for Tech Blog",
      description: "Write 5 high-quality articles about emerging web development trends, each 1500-2000 words.",
      category: "Writing",
      budget: "500",
      status: "pending",
      submittedForReviewAt: new Date(),
    },
  ];

  const totalSeedJobCost = seedJobs.reduce((sum, j) => sum + parseFloat(j.budget), 0);
  const customerStartingBalance = 10000;

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

    await storage.createEscrow({
      jobId: job.id,
      customerId: customer.id,
      totalAmount: budget.toFixed(2),
      status: EscrowStatus.HELD,
    });

    await storage.createTransaction({
      walletId: customerWallet.id,
      type: "escrow_lock",
      currency: "USDT",
      amount: budget.toFixed(8),
      usdAmount: budget.toFixed(2),
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

  console.log('Initial data seeded successfully!');
  console.log('\nDemo accounts created:');
  console.log('- Freelancer: Alex Chen (ID:', freelancer1.discordId, ')');
  console.log('- Freelancer: Sarah Johnson (ID:', freelancer2.discordId, ')');
  console.log('- Customer: Tech Startup Inc (ID:', customer.discordId, ')');
  console.log('- Moderator: Admin User (ID:', moderator.discordId, ')');
  console.log('- Founder:', founder.username, '(ID:', founder.discordId, ')');
}
