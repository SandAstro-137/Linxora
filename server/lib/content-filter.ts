const inappropriatePatterns: RegExp[] = [
  /\b(spam|scam|fraud)\b/i,
  /\b(hack|exploit)\b/i,
  /\b(illegal|illicit)\b/i,
  /\b(hate|racist|sexist)\b/i,
  /\b(violence|violent)\b/i,
  /\b(harassment|harass)\b/i,
  /\b(phishing|malware)\b/i,
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

export function filterContent(text: string): ContentFilterResult {
  const flags: string[] = [];
  let severity: "low" | "medium" | "high" = "low";

  for (const pattern of inappropriatePatterns) {
    if (pattern.test(text)) {
      const match = text.match(pattern);
      if (match) {
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

export function isSpamLike(text: string): boolean {
  const repeated = /(.)\1{10,}/;
  if (repeated.test(text)) return true;

  const capsRatio = (text.match(/[A-Z]/g)?.length || 0) / text.length;
  if (capsRatio > 0.7 && text.length > 20) return true;

  const specialChars = (text.match(/[!@#$%^&*]{3,}/g)?.length || 0);
  if (specialChars > 3) return true;

  return false;
}
