export function shouldApplyTabIdentity(nodeEnv: string | undefined, tabUserId: unknown): tabUserId is string {
  return nodeEnv !== "production" && typeof tabUserId === "string" && tabUserId.length > 0;
}
