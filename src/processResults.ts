import { Suite } from "@playwright/test/reporter";
import { MsTeamsReporterOptions } from ".";
import {
  createTableRow,
  getMentions,
  getNotificationBackground,
  getNotificationColor,
  getNotificationTitle,
  getTotalStatus,
} from "./utils";
import { BaseAdaptiveCard, BaseTable } from "./constants";
import { redactWebhookUrl } from "./utils/redactWebhookUrl";
import type { AdaptiveCard, TestStatuses } from "./models";

function buildResultsTable(
  totalStatus: TestStatuses,
  totalTests: number,
  options: MsTeamsReporterOptions,
  durationMs?: number
) {
  const table = structuredClone(BaseTable);
  table.rows.push(
    createTableRow("Type", "Total"),
    createTableRow(
      `${options.enableEmoji ? "✅ " : ""}Passed`,
      totalStatus.passed,
      { style: "good" }
    )
  );
  if (totalStatus.flaky) {
    table.rows.push(
      createTableRow(
        `${options.enableEmoji ? "⚠️ " : ""}Flaky`,
        totalStatus.flaky,
        { style: "warning" }
      )
    );
  }
  table.rows.push(
    createTableRow(
      `${options.enableEmoji ? "❌ " : ""}Failed`,
      totalStatus.failed,
      { style: "attention" }
    ),
    createTableRow(
      `${options.enableEmoji ? "⏭️ " : ""}Skipped`,
      totalStatus.skipped,
      { style: "accent" }
    ),
    createTableRow("Total tests", totalTests, {
      isSubtle: true,
      weight: "Bolder",
    })
  );

  if (options.enableDuration && typeof durationMs === "number") {
    const seconds = Math.round(durationMs / 1000);
    const min = Math.floor(seconds / 60);
    const sec = seconds % 60;
    const durationStr = min > 0 ? `${min}m ${sec}s` : `${sec}s`;
    table.rows.push(
      createTableRow("Duration", durationStr, {
        isSubtle: true,
        weight: "Bolder",
      })
    );
  }
  return table;
}

function addFailureMentions(
  adaptiveCard: AdaptiveCard,
  container: { items: any[] },
  options: MsTeamsReporterOptions,
  gitAuthors?: string[]
) {
  const mentionEmails = options.mentionAuthors && gitAuthors && gitAuthors.length > 0
    ? gitAuthors.join(",")
    : options.mentionOnFailure;
  const mentionData = getMentions(mentionEmails, options.mentionOnFailureText);
  if (!mentionData?.message || mentionData.mentions.length === 0) return;
  container.items.push({
    type: "TextBlock",
    size: "Medium",
    text: mentionData.message,
    wrap: true,
  });
  adaptiveCard.msteams.entities = mentionData.mentions.map((mention) => ({
    type: "mention",
    text: `<at>${mention.email}</at>`,
    mentioned: { id: mention.email, name: mention.name },
  }));
}

function addResultsLink(
  adaptiveCard: AdaptiveCard,
  link: string | (() => string) | undefined,
  title: string | undefined,
  options: MsTeamsReporterOptions
) {
  if (!link) return;
  const url = typeof link === "string" ? link : link.call(options);
  if (url && typeof url === "string") {
    adaptiveCard.actions.push({ type: "Action.OpenUrl", title, url });
  }
}

function addReportLinks(adaptiveCard: AdaptiveCard, options: MsTeamsReporterOptions, isSuccess: boolean) {
  addResultsLink(adaptiveCard, options.linkToResultsUrl, options.linkToResultsText, options);
  if (!isSuccess && options.linkTextOnFailure && options.linkUrlOnFailure) {
    addResultsLink(adaptiveCard, options.linkUrlOnFailure, options.linkTextOnFailure, options);
  }
}

async function logWebhookResponse(response: Response, options: MsTeamsReporterOptions) {
  if (!response.ok) {
    console.error("Failed to send message");
    console.error(redactWebhookUrl(await response.text(), options.webhookUrl));
    return;
  }
  if (options.quiet) return;
  console.log("Message sent successfully");
  const responseText = await response.text();
  if (responseText !== "1") {
    console.log(redactWebhookUrl(responseText, options.webhookUrl));
  }
}

function logSkippedReport(message: string, options: MsTeamsReporterOptions) {
  if (!options.quiet) console.log(message);
}

export const processResults = async (
  suite: Suite | undefined,
  options: MsTeamsReporterOptions,
  durationMs?: number,
  gitAuthors?: string[]
) => {
  if (!options.webhookUrl) {
    console.error("No webhook URL provided");
    return;
  }
  if (!suite) {
    console.error("No test suite found");
    return;
  }
  if (options.shouldRun && !options.shouldRun(suite)) return;
  const totalTests = suite.allTests().length;
  if (!options.reportOnEmpty && totalTests === 0) {
    logSkippedReport("No tests found, skipping report (reportOnEmpty is false)", options);
    return;
  }
  const adaptiveCard = structuredClone(BaseAdaptiveCard);
  const totalStatus = getTotalStatus(suite.suites);
  const isSuccess = totalStatus.failed === 0;
  if (isSuccess && !options.notifyOnSuccess) {
    logSkippedReport("No failed tests, skipping notification", options);
    return;
  }
  const table = buildResultsTable(totalStatus, totalTests, options, durationMs);

  const container = {
    type: "Container",
    items: [
      {
        type: "TextBlock",
        size: "ExtraLarge",
        weight: "Bolder",
        text: options.title,
      },
      {
        type: "TextBlock",
        size: "Large",
        weight: "Bolder",
        text: getNotificationTitle(totalStatus),
        color: getNotificationColor(totalStatus),
      },
      table,
    ] as any[],
    bleed: true,
    backgroundImage: {
      url: getNotificationBackground(totalStatus),
      fillMode: "RepeatHorizontally",
    },
  };

  if (!isSuccess) {
    addFailureMentions(adaptiveCard, container, options, gitAuthors);
  }

  // Add the container to the body
  adaptiveCard.body.push(container);

  addReportLinks(adaptiveCard, options, isSuccess);

  if (options.webhookType === "powerautomate") {
    adaptiveCard.version = "1.4";
  }

  const body = JSON.stringify({
    type: "message",
    attachments: [
      {
        contentType: "application/vnd.microsoft.card.adaptive",
        contentUrl: null,
        content: adaptiveCard,
      },
    ],
  });

  if (options.debug) {
    console.log("Sending the following message:");
    console.log(redactWebhookUrl(body, options.webhookUrl));
  }

  const response = await fetch(options.webhookUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body,
  });

  await logWebhookResponse(response, options);
};
