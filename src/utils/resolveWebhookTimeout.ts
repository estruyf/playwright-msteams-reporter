export function resolveWebhookTimeout(webhookTimeoutMs = 10000): number {
  if (!Number.isInteger(webhookTimeoutMs) || webhookTimeoutMs <= 0 || webhookTimeoutMs > 2147483647) {
    throw new Error("webhookTimeoutMs must be an integer between 1 and 2147483647");
  }
  return webhookTimeoutMs;
}