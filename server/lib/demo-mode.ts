export interface DemoAccountProfile {
  discordId: string;
  username: string;
  email: string;
  avatar: string;
  role: "freelancer" | "customer" | "moderator" | "head_of_moderation" | "founder";
  usdtBalance?: string;
}

// The only accounts the demo sign-in endpoint can ever resolve to. Keeping this
// list fixed means a demo deployment can never be used to sign in as a real
// account, or to invent new accounts from a request body.
export const DEMO_ACCOUNT_PROFILES: DemoAccountProfile[] = [
  {
    discordId: "demo-freelancer-1",
    username: "Alex Chen",
    email: "alex@example.com",
    avatar: "https://api.dicebear.com/7.x/avataaars/svg?seed=Alex",
    role: "freelancer",
    usdtBalance: "1250.50",
  },
  {
    discordId: "demo-freelancer-2",
    username: "Sarah Johnson",
    email: "sarah@example.com",
    avatar: "https://api.dicebear.com/7.x/avataaars/svg?seed=Sarah",
    role: "freelancer",
    usdtBalance: "3400.00",
  },
  {
    discordId: "demo-customer-1",
    username: "Tech Startup Inc",
    email: "hiring@techstartup.com",
    avatar: "https://api.dicebear.com/7.x/initials/svg?seed=TSI",
    role: "customer",
  },
  {
    discordId: "demo-moderator-1",
    username: "Admin User",
    email: "admin@freelancehub.com",
    avatar: "https://api.dicebear.com/7.x/avataaars/svg?seed=Admin",
    role: "moderator",
  },
  {
    discordId: "demo-head-mod-1",
    username: "Demo Head of Moderation",
    email: "headmod@linxova.com",
    avatar: "https://api.dicebear.com/7.x/avataaars/svg?seed=HeadMod",
    role: "head_of_moderation",
  },
  {
    discordId: "demo-founder-1",
    username: "Founder",
    email: "founder@linxova.com",
    avatar: "https://api.dicebear.com/7.x/avataaars/svg?seed=Founder",
    role: "founder",
  },
];

export const DEMO_ACCOUNT_IDS: string[] = DEMO_ACCOUNT_PROFILES.map((profile) => profile.discordId);

const DEMO_MODE_DISABLED_VALUES = new Set(["false", "0", "off", "no", "disabled"]);

/**
 * Demo mode (demo sign-in, demo account switching and demo seeding).
 *
 * On by default so a test deployment behaves exactly like local development.
 * Set DEMO_MODE=false to close it again: production then hides the demo
 * accounts, refuses demo sign-in and stops seeding demo data.
 */
export function isDemoModeEnabled(
  nodeEnv: string | undefined = process.env.NODE_ENV,
  flag: string | undefined = process.env.DEMO_MODE,
): boolean {
  void nodeEnv;
  const value = (flag ?? "").trim().toLowerCase();
  return !DEMO_MODE_DISABLED_VALUES.has(value);
}

export function isDemoAccountId(value: unknown): value is string {
  return typeof value === "string" && DEMO_ACCOUNT_IDS.includes(value);
}
