export function shouldApplyDemoIdentity(
  nodeEnv: string | undefined,
  sessionIsDemo: boolean | undefined,
  demoId: unknown,
): demoId is string {
  return nodeEnv !== "production" && sessionIsDemo === true && typeof demoId === "string" && demoId.length > 0;
}
