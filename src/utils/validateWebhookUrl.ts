import { WebhookType } from "../models";

/**
 * Validates a webhook URL to ensure it meets the required format.
 *
 * @param webhookUrl - The webhook URL to validate.
 * @returns A boolean indicating whether the webhook URL is valid.
 */
export const validateWebhookUrl = (
  webhookUrl: string,
  type?: WebhookType
): boolean => {
  // https://tenant.webhook.office.com/webhookb2/{uuid}@{uuid}/IncomingWebhook/{id}/{uuid}
  if (!type || type === "msteams") {
    const webhook_pattern =
      /^https:\/\/[a-zA-Z]+.webhook.office.com\/webhookb2\/[{]?[0-9a-fA-F]{8}-([0-9a-fA-F]{4}-){3}[0-9a-fA-F]{12}[}]?\S+\/IncomingWebhook\/[a-zA-Z0-9]+\/[{]?[0-9a-fA-F]{8}-([0-9a-fA-F]{4}-){3}[0-9a-fA-F]{12}[}]?/;

    return webhook_pattern.test(webhookUrl);
  } else if (type === "powerautomate") {
    return !!(
      webhookUrl &&
      webhookUrl.startsWith("https://prod-") &&
      webhookUrl.includes("logic.azure.com") &&
      webhookUrl.includes("/workflows/") &&
      webhookUrl.includes("/triggers/")
    );
  } else {
    return false;
  }
};