import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function formatAccountCreated(createdAt: string | Date | null | undefined): string {
  if (!createdAt) return "Unknown";
  const d = new Date(createdAt);
  if (isNaN(d.getTime())) return "Unknown";
  const day = d.getDate();
  const suffix =
    day % 10 === 1 && day !== 11 ? "st"
    : day % 10 === 2 && day !== 12 ? "nd"
    : day % 10 === 3 && day !== 13 ? "rd"
    : "th";
  const month = d.toLocaleString("en-US", { month: "short" });
  return `${month} ${day}${suffix}, ${d.getFullYear()}`;
}
