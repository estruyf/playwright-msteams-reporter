import { MsTeamsReporterOptions } from "./src";

if (process.env.NODE_ENV === "development") {
  require("dotenv").config({ path: ".env" });
}

export default {
  testDir: "./tests",
  reporter: [
    [
      "./src/index.ts",
      <MsTeamsReporterOptions>{
        webhookUrl: process.env.FLOW_WEBHOOK_URL,
        title: "E2E Test Results",
        linkToResultsUrl: "https://eliostruyf.com",
        linkToResultsText: "View results",
        linkUrlOnFailure:
          "https://github.com/playwright-community/playwright-msteams-reporter/issues",
        linkTextOnFailure: "Report an issue",
        mentionOnFailure: "elio@struyfconsulting.be",
        mentionOnFailureText: "",
        enableEmoji: false,
        debug: true,
        shouldRun: () => true,
      },
    ],
  ],
};
