export interface ProfitSplit {
  userId: string;
  username?: string;
  share: number;
  percentage: number;
  amount: string;
}

export function calculateProfitSplits(
  budget: string,
  freelancerId: string | null,
  collaborators: string[] | null,
  userMap?: Map<string, { id: string; username: string }>
): ProfitSplit[] {
  const budgetAmount = parseFloat(budget);
  
  // If no freelancer has claimed the job, return empty array
  if (!freelancerId) {
    return [];
  }
  
  // Build list of all team members (freelancer + collaborators)
  const allMembers = [freelancerId, ...(collaborators || [])];
  const uniqueMembers = Array.from(new Set(allMembers));
  
  // Calculate equal split
  const totalMembers = uniqueMembers.length;
  const percentage = 100 / totalMembers;
  const shareAmount = budgetAmount / totalMembers;
  
  return uniqueMembers.map((userId) => ({
    userId,
    username: userMap?.get(userId)?.username,
    share: totalMembers,
    percentage: parseFloat(percentage.toFixed(2)),
    amount: shareAmount.toFixed(2),
  }));
}

export function formatProfitSplit(split: ProfitSplit): string {
  return `$${split.amount} (${split.percentage}%)`;
}
