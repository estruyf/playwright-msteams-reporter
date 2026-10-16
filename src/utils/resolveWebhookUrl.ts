export function resolveWebhookUrl(
  webhookUrl?: string,
  webhookUrlEnv = "MSTEAMS_WEBHOOK_URL"
): string | undefined {
  if (typeof webhookUrlEnv !== "string" || !/^[A-Za-z_]\w*$/.test(webhookUrlEnv)) {
    throw new Error("webhookUrlEnv must be a valid environment variable name");
  }
  if (webhookUrl !== undefined) return webhookUrl;
  const value = process.env[webhookUrlEnv];
  return typeof value === "string" ? value : undefined;
}