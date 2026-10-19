import { Suite } from "@playwright/test/reporter";
import { MsTeamsReporterOptions } from ".";
import {
  createTableRow,
  getLinkUrl,
  getMentions,
  getNotificationBackground,
  getNotificationColor,
  getNotificationTitle,
  getTotalStatus,
} from "./utils";
import { BaseAdaptiveCard, BaseTable } from "./constants";

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

  if (options.shouldRun && !options?.shouldRun(suite)) return;

  const totalTests = suite.allTests().length;
  if (!options.reportOnEmpty && totalTests === 0) {
    if (!options.quiet) {
      console.log("No tests found, skipping report (reportOnEmpty is false)");
    }
    return;
  }

  // Clone the base adaptive card and table
  const adaptiveCard = structuredClone(BaseAdaptiveCard);
  const table = structuredClone(BaseTable);

  const totalStatus = getTotalStatus(suite.suites);
  const isSuccess = totalStatus.failed === 0;

  if (isSuccess && !options.notifyOnSuccess) {
    if (!options.quiet) {
      console.log("No failed tests, skipping notification");
    }
    return;
  }

  table.rows.push(createTableRow("Type", "Total"));

  table.rows.push(
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
    )
  );
  table.rows.push(
    createTableRow(
      `${options.enableEmoji ? "⏭️ " : ""}Skipped`,
      totalStatus.skipped,
      { style: "accent" }
    )
  );
  table.rows.push(
    createTableRow("Total tests", totalTests, {
      isSubtle: true,
      weight: "Bolder",
    })
  );

  // Add duration if enabled
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

  // Check if we should ping on failure
  let mentionEmails = options.mentionOnFailure;
  if (options.mentionAuthors && gitAuthors && gitAuthors.length > 0) {
    mentionEmails = gitAuthors.join(",");
  }
  if (!isSuccess) {
    const mentionData = getMentions(
      mentionEmails,
      options.mentionOnFailureText
    );
    if (mentionData?.message && mentionData.mentions.length > 0) {
      container.items.push({
        type: "TextBlock",
        size: "Medium",
        text: mentionData.message,
        wrap: true,
      });

      adaptiveCard.msteams.entities = mentionData.mentions.map((mention) => ({
        type: "mention",
        text: `<at>${mention.email}</at>`,
        mentioned: {
          id: mention.email,
          name: mention.name,
        },
      }));
    }
  }

  // Add the container to the body
  adaptiveCard.body.push(container);

  // Get the github actions run URL
  const linkToResultsUrl = getLinkUrl(options.linkToResultsUrl);
  if (linkToResultsUrl) {
    adaptiveCard.actions.push({
      type: "Action.OpenUrl",
      title: options.linkToResultsText,
      url: linkToResultsUrl,
    });
  }

  // Add the additional links
  for (const link of options.links || []) {
    const linkUrl = getLinkUrl(link?.url);
    if (link?.text && linkUrl) {
      adaptiveCard.actions.push({
        type: "Action.OpenUrl",
        title: link.text,
        url: linkUrl,
      });
    }
  }

  if (!isSuccess) {
    const linkUrlOnFailure = getLinkUrl(options.linkUrlOnFailure);
    if (linkUrlOnFailure) {
      adaptiveCard.actions.push({
        type: "Action.OpenUrl",
        title: options.linkTextOnFailure || "View failed tests",
        url: linkUrlOnFailure,
      });
    }
  }

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
    console.log(body);
  }

  const response = await fetch(options.webhookUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body,
  });

  if (response.ok) {
    if (!options.quiet) {
      console.log("Message sent successfully");
      const responseText = await response.text();
      if (responseText !== "1") {
        console.log(responseText);
      }
    }
  } else {
    console.error("Failed to send message");
    console.error(await response.text());
  }
};
