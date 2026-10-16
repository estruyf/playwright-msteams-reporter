import type { MsTeamsReporterOptions } from "..";
import { redactWebhookUrl } from "./redactWebhookUrl";
import { resolveWebhookTimeout } from "./resolveWebhookTimeout";

function diagnosticText(text: string, webhookUrl: string): string {
  return redactWebhookUrl(text, webhookUrl).replace(/[\r\n]+/g, " ").slice(0, 1000);
}

function failureReason(error: unknown): string {
  try {
    if (!(error instanceof Error)) return String(error);
    if ("cause" in error && error.cause instanceof Error) {
      return `${error.message}: ${error.cause.message}`;
    }
    return error.message;
  } catch {
    return "Unknown error";
  }
}

export async function sendWebhookMessage(
  webhookUrl: string,
  body: string,
  options: MsTeamsReporterOptions
): Promise<void> {
  const timeoutMs = resolveWebhookTimeout(options.webhookTimeoutMs);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  let response: Response;
  let responseText: string;
  try {
    response = await fetch(webhookUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body,
      signal: controller.signal,
    });
    responseText = await response.text();
  } catch (error) {
    const reason = controller.signal.aborted
      ? `Webhook delivery timed out after ${timeoutMs}ms`
      : failureReason(error);
    console.error(`Failed to send message: ${diagnosticText(reason, webhookUrl)}`);
    return;
  } finally {
    clearTimeout(timer);
  }
  if (!response.ok) {
    console.error("Failed to send message");
    console.error(diagnosticText(responseText, webhookUrl));
    return;
  }
  if (options.quiet) return;
  console.log("Message sent successfully");
  if (responseText !== "1") console.log(diagnosticText(responseText, webhookUrl));
}