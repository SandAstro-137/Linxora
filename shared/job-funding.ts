export function getJobFundingRequirement(totalCost: number, heldEscrowAmount = 0): number {
  return Math.max(0, totalCost - Math.max(0, heldEscrowAmount));
}

export function getJobFundingShortfall(totalCost: number, availableBalance: number, heldEscrowAmount = 0): number {
  return Math.max(0, getJobFundingRequirement(totalCost, heldEscrowAmount) - availableBalance);
}
