# Microsoft Teams reporter for Playwright

[![npm version](https://badge.fury.io/js/playwright-msteams-reporter.svg)](https://badge.fury.io/js/playwright-msteams-reporter)
[![Downloads](https://img.shields.io/npm/dt/playwright-msteams-reporter)](https://www.npmjs.com/package/playwright-msteams-reporter)
![License](https://img.shields.io/github/license/estruyf/playwright-msteams-reporter)

This reporter for Playwright allows you to send the test results to a Microsoft Teams channel and mention users on failure.

Here you can see an example card for successful test results:

![Microsoft Teams card for successful test results](./assets/success.png)

Here you can see an example card for failed test results:

![Microsoft Teams card for failed test results](./assets/failure.png)

## Prerequisites

To use this reporter, you must have a Microsoft Teams webhook URL. You can create a webhook URL using the Microsoft Teams Power Automate connector or the Microsoft Teams incoming webhook functionality.

As the incoming webhook functionality will stop working on October 1, 2024 (extended to December 2025), it is recommended to use the Power Automate connector functionality.

> **Important**: You need to copy the `webhook URL` from the configuration, as you will need it to configure the reporter.

> **Info**: The [Retirement of Office 365 connectors within Microsoft Teams](https://devblogs.microsoft.com/microsoft365dev/retirement-of-office-365-connectors-within-microsoft-teams/) article provides more information on the retirement of the incoming webhook functionality.

### Microsoft Teams Power Automate webhook

To create a Power Automate webhook for Microsoft Teams, you can follow these steps:

- Start with the following [Post to a channel when a webhook request is received](https://make.preview.powerautomate.com/galleries/public/templates/d271a6f01c2545a28348d8f2cddf4c8f/post-to-a-channel-when-a-webhook-request-is-received) template
- Click continue to use the template
- Click on the **Post your own adaptive card as the Flow bot to a channel** action
- Configure the action with the following settings:
  - **Team**: Select the team where you want to post the message
  - **Channel**: Select the channel where you want to post the message

![Power Automate connector configuration](./assets/powerautomate-settings.png)

- Click on the **Save** button
- Click on **When a Teams webhook request is received** and copy the **HTTP URL**

> [!WARNING]
> When using the PowerAutomate template, a template footer will automatically be included like: `<name> used a Workflow template to send this card. Get template`.
> You can remove this footer by creating a copy of the flow, and use the new one instead.
> You can find more information about this procedure in the following blog post: [How to remove "<Name> used a Workflow template to send this card. Get template"](https://docs.hetrixtools.com/microsoft-teams-how-to-remove-name-used-a-workflow-template-to-send-this-card-get-template/).

### Microsoft Teams incoming webhook (retiring October 1, 2024)

To use this reporter, you need to create an incoming webhook for your Microsoft Teams channel. You can find more information on how to do this in the [Microsoft documentation](https://learn.microsoft.com/en-us/microsoftteams/platform/webhooks-and-connectors/how-to/add-incoming-webhook?tabs=newteams%2Cdotnet#create-an-incoming-webhook).

> **Important**: You need to copy the `webhook URL` from the configuration, as you will need it to configure the reporter.

## Installation

Install from npm:

```bash
npm install playwright-msteams-reporter
```

## Usage

You can configure the reporter by adding it to the `playwright.config.js` file:

```javascript
import { defineConfig } from '@playwright/test';
import type { MsTeamsReporterOptions } from "playwright-msteams-reporter";

export default defineConfig({
  reporter: [
    ['list'],
    [
      'playwright-msteams-reporter',
      <MsTeamsReporterOptions>{
        webhookType: "powerautomate", // or "msteams"
      }
    ]
  ],
});
```

> More information on how to use reporters can be found in the [Playwright documentation](https://playwright.dev/docs/test-reporters).

Set `MSTEAMS_WEBHOOK_URL` through your shell or CI secret store. The reporter
resolves it internally; do not put the secret value in the configuration above.

> [!WARNING]
> Playwright's JSON reporter serializes reporter configuration options. Writing
> `webhookUrl: process.env.MSTEAMS_WEBHOOK_URL` in the config still publishes the
> resolved secret when that JSON artifact is uploaded. Omit `webhookUrl` entirely
> for environment-based configuration. The HTML reporter's embedded data is a
> separate format; this warning concerns JSON-reporter output and pipelines that
> publish it alongside other artifacts.

### Webhook destination precedence

- An explicit `webhookUrl` takes precedence over environment variables.
- `webhookUrl: ""` disables delivery, even if the environment variable is set.
- When `webhookUrl` is omitted or `undefined`, the reporter reads the variable
  named by `webhookUrlEnv`, defaulting to `MSTEAMS_WEBHOOK_URL`, at construction.
- A custom variable name replaces the default; an unset or empty selected
  variable does not fall back to another variable and produces the existing
  missing-webhook diagnostic when reporting is attempted.
- Variable names must match `[A-Za-z_][A-Za-z0-9_]*`; invalid names are rejected
  without echoing their contents, including when an explicit URL is supplied.

For a custom secret variable, keep only its name in reporter options:

```javascript
reporter: [['playwright-msteams-reporter', {
  webhookUrlEnv: 'ACME_TEAMS_WEBHOOK',
  webhookType: 'powerautomate',
}]]
```

An inherited `MSTEAMS_WEBHOOK_URL` enables delivery for an already registered
reporter with an omitted destination. Use `webhookUrl: ""` or omit the reporter
itself when sending is not intended. No reporter is registered automatically.

## Configuration

The reporter supports the following configuration options:

| Option                 | Description                                                     | Type                     | Required | Default                                        |
| ---------------------- | --------------------------------------------------------------- | ------------------------ | -------- | ---------------------------------------------- |
| `webhookUrl`           | Explicit destination; empty string disables environment fallback | `string`                 | `false`  | Selected environment variable                  |
| `webhookUrlEnv`        | Name of the environment variable containing the destination      | `string`                 | `false`  | `MSTEAMS_WEBHOOK_URL`                           |
| `webhookType`          | The type of the webhook (`msteams` or `powerautomate`)          | `string`                 | `false`  | `powerautomate`                                |
| `title`                | The notification title                                          | `string`                 | `false`  | `Playwright Test Results`                      |
| `linkToResultsUrl`     | Link to the test results                                        | `string \| () => string` | `false`  | `undefined`                                    |
| `linkToResultsText`    | Text for the link to the test results                           | `string`                 | `false`  | `View test results`                            |
| `linkUrlOnFailure`     | Link to page where you can view, trigger, etc. the failed tests | `string \| () => string` | `false`  | `undefined`                                    |
| `linkTextOnFailure`    | Text for the failed tests link action                           | `string`                 | `false`  | `undefined`                                    |
| `notifyOnSuccess`      | Notify on success                                               | `boolean`                | `false`  | `true`                                         |
| `mentionOnFailure`     | Mention users on failure (comma separated list)                 | `string`                 | `false`  | `undefined`                                    |
| `mentionOnFailureText` | Text to mention users on failure                                | `string`                 | `false`  | `{mentions} please validate the test results.` |
| `enableEmoji`          | Show an emoji based on the test status                          | `boolean`                | `false`  | `false`                                        |
| `quiet`                | Suppress test output forwarding and success chatter             | `boolean`                | `false`  | `false`                                        |
| `debug`                | Show debug information                                          | `boolean`                | `false`  | `false`                                        |
| `shouldRun`            | Conditional reporting                                           | ` Suite => boolean`      | `false`  | `true`                                         |
| `reportOnEmpty`        | Prevents sending a report when no tests are run                 | `boolean`                | `false`  | `false`                                        |
| `enableDuration`       | Show the test run duration                                      | `boolean`                | `false`  | `false`                                        |
| `mentionAuthors`       | Use git metadata to mention authors of the commit or PR         | `boolean`                | `false`  | `false`                                        |

### Logging and privacy

Diagnostic options and card dumps require `debug: true`. Setting
`NODE_ENV=development` alone does not enable them.

| Output | `quiet: false` | `quiet: true` |
| --- | --- | --- |
| Reporter startup banner | Shown | Shown |
| Forwarded test stdout/stderr | Shown | Suppressed |
| Success message and response text | Shown | Suppressed |
| Failure diagnostics | Shown | Shown |
| Options and card dumps | Only with `debug: true` | Only with `debug: true` |

The configured webhook URL and its canonical `URL.href` form (including removal
of default ports and hostname normalization) are replaced with `<redacted>` in diagnostic dumps,
response text, and individual forwarded test-output chunks. The destination and
delivered card are not modified. Matching also covers their JSON-string-escaped
forms. This is not a general secret or PII filter: other encoded or partial URL
forms, fragments split across output chunks,
signed results links, and application-provided content require consumer-side
sanitization. Other reporters and Playwright artifacts are outside this logging
filter; avoid putting webhook secrets in published configuration artifacts.

### Mention users

With the `mentionOnFailure` option, you can mention users in the Microsoft Teams channel when a test fails. You can provide an array of users to mention.

### Mention users with the Power Automate connector

You can mention users by providing their email addresses when using the Power Automate connector. The reporter will replace the `{mentions}` placeholder in the `mentionOnFailureText` with the mentioned users.

```javascript
{
  mentionOnFailure: "mail1@elio.dev,mail2@elio.dev",
  mentionOnFailureText: "{mentions} check those failed tests!"
}
```

### Mention users with the Microsoft Teams Incoming Webhook

The format can be either the full name and email (`"Full name <email>"`) or just the email address (`email`). The reporter will replace the `{mentions}` placeholder in the `mentionOnFailureText` with the mentioned users.

```javascript
{
  mentionOnFailure: "Elio Struyf <mail@elio.dev>,mail@elio.dev",
  mentionOnFailureText: "{mentions} check those failed tests!"
}
```

### Link to the results

With the `linkToResultsUrl` option, you can provide a link to the test results. For example, you can view the test results on your CI/CD platform.

### Conditional reporting (shouldRun)

Example (report only from jenkins runs - project name set as 'dev\_\_jenkins'):

```javascript
shouldRun: (suite) => {
  if (suite.suites[0].project()?.name.includes("_jenkins")) return true;

  return false;
};
```

#### Github

```javascript
{
  // The link to your GitHub Actions workflow run
  linkToResultsUrl: `${process.env.GITHUB_SERVER_URL}/${process.env.GITHUB_REPOSITORY}/actions/runs/${process.env.GITHUB_RUN_ID}`,
}
```

#### Azure Devops

```javascript
{
  // The link to your Azure DevOps pipeline run (add &view=artifacts&type=publishedArtifacts to access linked artifacts directly)
  linkToResultsUrl: `${process.env.AZURE_SERVER_URL}/${process.env.AZURE_PROJECT}/_build/results?buildId=${process.env.AZURE_RUN_ID}`,
}
```

Make sure to provide the environment variables in your Azure DevOps pipeline:

```yaml
- script: npx playwright test
  displayName: "Run Playwright tests"
  name: "playwright"
  env:
    CI: "true"
    AZURE_SERVER_URL: $(System.CollectionUri)
    AZURE_PROJECT: $(System.TeamProject)
    AZURE_RUN_ID: $(Build.BuildId)
```

### Combine the reporter with the Playwright Azure Reporter

You can combine the Microsoft Teams reporter with the Playwright Azure Reporter to link to create a link to the test plan results on Azure DevOps. The following example shows how you can combine both reporters:

```typescript
import { defineConfig } from "@playwright/test";
import type { AzureReporterOptions } from "@alex_neo/playwright-azure-reporter";
import type { MsTeamsReporterOptions } from "playwright-msteams-reporter";

export default defineConfig({
  reporter: [
    ["list"],
    // First define the Azure reporter
    [
      "@alex_neo/playwright-azure-reporter",
      <AzureReporterOptions>{
        ...
      },
    ],
    // Then define the Microsoft Teams reporter
    [
      'playwright-msteams-reporter',
      <MsTeamsReporterOptions>{
        webhookUrl: "<webhookUrl>",
        // Instead of providing the URL directly, you need to provide a function that returns the URL.
        // The AZURE_PW_TEST_RUN_ID variable is only available once the Azure reporter has run.
        linkToResultsUrl: () => `${process.env.AZURE_SERVER_URL}/${process.env.AZURE_PROJECT}/_testManagement/runs?runId=${process.env.AZURE_PW_TEST_RUN_ID}&_a=runCharts`,
        linkToResultsText: "View test plan results",
      }
    ]
  ]
});
```

Make sure to provide the environment variables in your Azure DevOps pipeline:

```yaml
- script: npx playwright test
  displayName: "Run Playwright tests"
  name: "playwright"
  env:
    CI: "true"
    AZURE_SERVER_URL: $(System.CollectionUri)
    AZURE_PROJECT: $(System.TeamProject)
    AZURE_RUN_ID: $(Build.BuildId)
```

<br />

[![Visitors](https://api.visitorbadge.io/api/visitors?path=https%3A%2F%2Fgithub.com%2Festruyf%2Fplaywright-msteams-reporter&countColor=%23263759)](https://visitorbadge.io/status?path=https%3A%2F%2Fgithub.com%2Festruyf%2Fplaywright-msteams-reporter)
