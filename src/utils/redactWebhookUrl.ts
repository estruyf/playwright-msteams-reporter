export function redactWebhookUrl(text: string, webhookUrl?: string): string {
  if (!webhookUrl) return text;
  let parsedUrl: URL | undefined;
  try {
    parsedUrl = new URL(webhookUrl);
  } catch {
    parsedUrl = undefined;
  }
  const destinations = new Set([webhookUrl, parsedUrl?.href ?? webhookUrl]);
  let sanitized = text;
  for (const destination of destinations) {
    const serializedUrl = JSON.stringify(destination).slice(1, -1);
    sanitized = sanitized.split(destination).join("<redacted>")
      .split(serializedUrl).join("<redacted>");
  }
  return sanitized;
}