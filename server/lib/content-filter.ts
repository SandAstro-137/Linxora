// High-risk terms that should be reviewed before a job is published.
const inappropriatePatterns: RegExp[] = [
  /\b(spam|scam|fraud)\b/i,
  /\b(hack|exploit)\b/i,
  /\b(illegal|illicit)\b/i,
  /\b(hate|racist|sexist)\b/i,
  /\b(violence|violent)\b/i,
  /\b(harassment|harass)\b/i,
  /\b(phishing|malware)\b/i,
];

// Profanity and common identity-based slur variants are review triggers, not
// automatic rejections: moderators decide whether the surrounding context is acceptable.
const abusiveLanguagePatterns: RegExp[] = [
  /\b(damn|hell|crap|shit(?:ty|ting|ter|s)?|bullshit|fuck(?:er|ing|ed|s)?|motherfucker|bitch(?:es)?|bastard|asshole|jackass|ass|dick(?:head|s)?|piss(?:ed|ing)?|cunt|whore|slut|cock|pussy|wtf)\b/i,
  /\b(n[i1!]gg(?:er|a)s?|fag(?:got|s)?|dyke|k[i1!]ke|ch[i1!]nk|sp[i1!]c|wetback|g[o0]{2}k|tr[a@]nny|retard(?:ed)?)\b/i,
];

// Explicitly harmful requests that should not publish automatically. These use
// action + harmful-object phrases rather than isolated words such as "password"
// or "hack", which frequently appear in legitimate software jobs.
const clearlyHarmfulRequestPatterns: RegExp[] = [
  /\b(?:build|create|make|write|develop|sell|send|deploy|launch)\b.{0,50}\b(?:phishing kit|ransomware|malware|credential stealer|keylogger|ddos attack|bomb)\b/i,
  /\b(?:steal|harvest)\b.{0,40}\b(?:passwords?|credentials?|credit cards?|bank accounts?|social security numbers?)\b/i,
  /\b(?:scam|defraud)\b.{0,40}\b(?:people|customers|users|clients|victims)\b/i,
  /\b(?:buy followers|fake reviews|send spam|mass unsolicited messages)\b/i,
];

// Words that are acceptable when reporting issues (these describe what's being reported)
const reportingContextWords: RegExp[] = [
  /\b(spam|scam|fraud)\b/i,
  /\b(phishing|malware)\b/i,
  /\b(harassment|harass)\b/i,
];

const suspiciousPatterns: RegExp[] = [
  /\b(guaranteed income|easy money|get rich quick)\b/i,
  /\b(no experience needed.*\$\d+k)\b/i,
  /\b(wire transfer|western union|crypto.*send)\b/i,
  /\b(personal.*information|ssn|social security)\b/i,
  /\b(password|bank.*account|credit card)\b/i,
];

export interface ContentFilterResult {
  isClean: boolean;
  flags: string[];
  severity: "low" | "medium" | "high";
}

export type FilterContext = "job" | "report" | "message" | "general";

export function filterContent(text: string, context: FilterContext = "general"): ContentFilterResult {
  const flags: string[] = [];
  let severity: "low" | "medium" | "high" = "low";

  if (context === "job") {
    for (const pattern of abusiveLanguagePatterns) {
      if (pattern.test(text)) {
        flags.push("Potentially abusive language detected; moderator review required.");
        severity = "high";
      }
    }
  }

  for (const pattern of inappropriatePatterns) {
    if (pattern.test(text)) {
      const match = text.match(pattern);
      if (match) {
        // In report context, allow words that describe what's being reported
        if (context === "report") {
          const isReportingWord = reportingContextWords.some(rp => rp.test(match[0]));
          if (isReportingWord) {
            // Skip this flag - it's acceptable in reporting context
            continue;
          }
        }
        
        flags.push(`Inappropriate content detected: "${match[0]}"`);
        severity = "high";
      }
    }
  }

  for (const pattern of suspiciousPatterns) {
    if (pattern.test(text)) {
      const match = text.match(pattern);
      if (match) {
        flags.push(`Suspicious content detected: "${match[0]}"`);
        if (severity !== "high") severity = "medium";
      }
    }
  }

  return {
    isClean: flags.length === 0,
    flags,
    severity,
  };
}

export function sanitizeText(text: string): string {
  return text
    .replace(/[<>]/g, "")
    .replace(/javascript:/gi, "")
    .replace(/on\w+=/gi, "")
    .trim();
}

export interface JobContentReview {
  needsReview: boolean;
  flags: string[];
}

export function reviewJobContent(title: string, description: string, requirements?: string | null): JobContentReview {
  const content = `${title} ${description} ${requirements || ""}`;
  const flags: string[] = [];

  if (abusiveLanguagePatterns.some((pattern) => pattern.test(content))) {
    flags.push("Potential profanity or slur detected; moderator review required.");
  }
  if (clearlyHarmfulRequestPatterns.some((pattern) => pattern.test(content))) {
    flags.push("Potentially harmful request detected; moderator review required.");
  }

  return { needsReview: flags.length > 0, flags };
}

export function isSpamLike(text: string): boolean {
  const repeated = /(.)\1{10,}/;
  if (repeated.test(text)) return true;

  const capsRatio = (text.match(/[A-Z]/g)?.length || 0) / text.length;
  if (capsRatio > 0.7 && text.length > 20) return true;

  const specialChars = (text.match(/[!@#$%^&*]{3,}/g)?.length || 0);
  if (specialChars > 3) return true;

  return false;
}
