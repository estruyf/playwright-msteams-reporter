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
| `webhookTimeoutMs`     | Deadline in milliseconds for request and response body           | `number`                 | `false`  | `10000`                                        |
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

### Optional Test Run Health Report

The independent health reporter is available at the `playwright-msteams-reporter/dist/healthReporter`
subpath. Register it after the original reporter so its webhook request follows
the original summary:

```javascript
reporter: [
  ["playwright-msteams-reporter", { webhookType: "powerautomate" }],
  ["playwright-msteams-reporter/dist/healthReporter", {
    webhookType: "powerautomate",
    webhookUrlEnv: "MSTEAMS_WEBHOOK_URL",
  }],
]
```

The second reporter sends a health card only when there are failures, actionable
signal evidence, runner errors, or an explicitly enabled empty-run report. A
clean signal-free run produces no follow-up. Its notification gates are
independent of the original reporter. Submission order is sequential; the
receiving service may still display messages in a different order.

Signals are consumer-provided Playwright annotations using the
`env-signal:<kind>` prefix by default. The reporter does not capture browser or
network activity. `TestResult.annotations` requires Playwright 1.52 or later;
older versions show evidence as unavailable and do not infer a cause. Signal
capture is optional and separate from reporter setup; see the helper below.

### Optional Environment Signal Capture

The opt-in helper is available from
`playwright-msteams-reporter/dist/healthCapture`. It composes with the fixture
exports already used by a project; it does not replace `page`, `context`, or
other fixtures. Each consumer creates its own capture instance and policy.

```typescript
import { test as base } from "@playwright/test";
import { captureEnvSignals } from "playwright-msteams-reporter/dist/healthCapture";

type Fixtures = { environmentEvidence: void };

export const test = base.extend<Fixtures>({
  environmentEvidence: async ({ page, context }, use, testInfo) => {
    const capture = captureEnvSignals({
      page,
      context,
      testInfo,
      options: {
        includeHosts: ["app.acme.example", "api.acme.example"],
        excludeUrls: ["https://api.acme.example/health"],
      },
    });
    try {
      await use(undefined);
    } finally {
      capture.dispose();
    }
  },
});
```

JavaScript and BDD-style fixture modules can compose the same helper using
CommonJS without replacing their existing fixture exports:

```javascript
const { test: base } = require("@playwright/test");
const { captureEnvSignals } = require("playwright-msteams-reporter/dist/healthCapture");

exports.test = base.extend({
  environmentEvidence: async ({ page, context }, use, testInfo) => {
    const capture = captureEnvSignals({ page, context, testInfo });
    try {
      await use(undefined);
    } finally {
      capture.dispose();
    }
  },
});
```

By default, capture is limited to the starting page's host, or the project's
`baseURL` when the page is still `about:blank`. Configure `includeHosts` for
additional exact hostnames. `excludeHosts` excludes exact hostnames and
`excludeUrls` excludes a URL path and its descendants. Defaults ignore HTTP
401/403 responses, unrelated hosts, and abort/cancel request failures. HTTP
5xx, remaining request failures, page errors, and console errors become generic
signals. An optional `classifiers` list can add application-owned kinds, such
as a visible service-busy message; no application-specific classifiers or host
rules are built in.

Each capture instance has independent filters, classifiers, sanitization, and
retention limits. Descriptions are sanitized before being retained or appended
to `testInfo.annotations`; kinds must be safe identifier-like values. The
defaults cap evidence at 20 events, 5 per kind, and 300 characters per
description. Passing-test evidence is omitted unless `retainOnPass` is enabled.
The helper observes page errors, console errors, browser-context responses and
request failures, including pages opened later as popups. It does not change
requests, routing, authentication, assertions, outcomes, or test timeouts. On
test-budget exhaustion it adds `env-signal:test-timeout` without altering the
test result.

Capture options:

| Option | Default | Meaning |
| --- | --- | --- |
| `annotationPrefix` | `env-signal:` | Safe annotation prefix; coordinate it with the health reporter's `annotationPrefix`. |
| `includeHosts` | Starting page host or project `baseURL` host | Exact hostnames to observe; configure additional app/API hosts per consumer. |
| `excludeHosts` / `excludeUrls` | `[]` | Exact host exclusions and URL path-prefix exclusions. |
| `ignoredHttpStatuses` | `[401, 403]` | Response statuses ignored before custom classification. |
| `classifiers` | `[]` | Ordered event classifiers; return `{ kind, description? }` or `undefined`. Returning `undefined` allows generic rules to run. |
| `sanitizeText` | Built-in sanitizer | Consumer sanitizer applied after built-in masking to retained descriptions. A thrown or non-string result omits the detail. |
| `maxEvents` / `maxEventsPerKind` | `20` / `5` | Total and per-kind retained signal caps; each must be an integer from `1` to `200`. |
| `maxDescriptionLength` | `300` | Retained description limit; integer from `1` to `2000` characters. |
| `retainOnPass` | `false` | Keep evidence from passing tests. |

The helper does not automatically observe `APIRequestContext`. For an existing
structured API logger, call `record()`; its supplied URL is subject to the host
filter and retention caps:

```typescript
capture.record({
  kind: "api-timeout",
  url: "https://api.acme.example/orders",
  description: "Synthetic API request exceeded its budget",
});
```

Built-in masking covers common bearer/JWT and signed-URL forms, but cannot
identify arbitrary application secrets or personal data. Provide `sanitizeText`
for domain-specific values, keep classifiers local and side-effect free, and do
not place raw traces, private URLs, or unbounded logger output in annotations.
The helper creates no attachments and writes no output itself.

Health reporter options:

| Option | Default | Meaning |
| --- | --- | --- |
| `enabled` | `true` | Set `false` to disable this reporter. |
| `annotationPrefix` | `env-signal:` | Annotation prefix; the non-empty prefix is removed before category matching. |
| `categories` | Built-in categories | Replaces, rather than merges with, the built-in taxonomy. `[]` disables all known-kind mappings; signals still count in `Other signals`. |
| `title` / `environment` | `Test Run Health` / none | Card title and optional environment label. |
| `maxTests` | `5` | Maximum failed-test detail groups (`0` to `100`); aggregate counts are not capped. |
| `maxPayloadBytes` | `26000` | Complete serialized envelope limit (`4096` to `26000` UTF-8 bytes). Details are omitted deterministically before counts are changed. |
| `testLabel` | Test title path | Optional function mapping a test to its displayed label. Invalid/throwing labels fall back to the title path. |
| `sanitizeText` | Built-in sanitizer | Optional function applied after built-in sanitization and before output clipping. It receives the complete text for a detail, including newlines; its output is sanitized again. Throwing or non-string results omit that detail. |
| `resultsLinkPolicy` | `strip-query` | `strip-query` removes query and fragment; `preserve` intentionally retains them. |
| `notifyOnSuccess` | `true` | `false` suppresses passing runs, including signal-only all-pass runs. It does not suppress failed runs or runner errors. |
| `reportOnEmpty` | `false` | Allows a card for an empty run; runner errors are reported even when no suite began. |
| `shouldRun` | always | Optional suite predicate. A false result suppresses this health card only. |
| `quiet` / `debug` | `false` / `false` | `quiet` suppresses the one-line health summary; `debug` logs the card after sanitization. Neither forwards test stdout/stderr. |
| `webhookUrl`, `webhookUrlEnv`, `webhookTimeoutMs`, `webhookType` | Same as the original reporter | Destination precedence, timeout validation, and Power Automate/Teams delivery are shared with the original reporter. |

Categories are ordered; the first category with a matching kind pattern wins.
Patterns match the entire kind, case-sensitively. `*` is the only wildcard;
other characters are literal. Category names must be unique, and `Other signals`
is reserved. A noise category cannot also specify an assessment. Custom
categories replace the defaults. For example:

```javascript
categories: [
  { name: "Service availability", kinds: ["http-5xx", "net-fail"], assessment: "environment" },
  { name: "Known background noise", kinds: ["sso-ambient-*"], noise: true },
]
```

Built-in kinds are `sso-*`, `http-auth`, `auth-*`, `http-5xx`, `net-fail`,
`test-timeout`, `page-error`, and `console-error`. Authentication/backend kinds
are labeled **environment-suspect**, not proven causes. Timeouts and application
errors are undetermined by default. A failure with both assessed and undetermined
signals is mixed; no evidence, unknown-only evidence, and unsupported annotations
remain undetermined. Noise is context, never a failure cause.

Failure assessments use exactly the tests whose Playwright `outcome()` is
`unexpected`; these four assessments partition that failed-test count. Category
and kind counts are evidence counts and may overlap across categories, but a test
counts once within each category/kind. Signals from superseded retry attempts are
shown separately and do not change final-failure assessments. A recovered flaky
test is counted as recovered, not as an expected pass.

The default category assessments are best-effort heuristics, not proof of root
cause. Authentication and backend/network observations are environment-suspect;
timeouts, application errors, unknown signals, missing evidence, and conflicting
assessments remain undetermined or mixed. Consumers can supply ordered categories
to change the assessment policy or mark known ambient signals as noise. Do not
classify a signal as noise unless that policy is appropriate for the application.

Text and assertion details are sanitized and bounded, but the renderer cannot
guarantee removal of arbitrary application-specific secrets or personal data.
Consumers should provide `sanitizeText` for domain-specific secrets and should
not use `resultsLinkPolicy: "preserve"` for signed URLs unless sharing them in the
card is intended. The card payload is bounded to at most 26,000 UTF-8 bytes;
detail rows may be omitted while aggregate counts remain complete.

### Delivery timeout and failures

Each notification has a `webhookTimeoutMs` deadline covering the HTTP request
and response-body consumption. The default is `10000` milliseconds when omitted
or `undefined`. Values must be integers from `1` through `2147483647`; zero,
negative, fractional, non-finite, and out-of-range values are configuration errors.
There is no unbounded or zero-disables-timeout mode.

Request failures, timeouts, and response-body failures produce one redacted error
diagnostic and settle without changing test outcomes. Non-success HTTP responses
produce a failure message and redacted response text. Diagnostic details are
limited to 1000 characters after redaction. No delivery retries are made, avoiding
duplicate notifications when an endpoint accepted a message before failing.

Response bodies are consumed within the deadline even with `quiet: true`, but
success output stays suppressed. A success message is logged only after the body
is read successfully. Invalid configuration and errors in `shouldRun` or result-link
callbacks are not swallowed by transport handling.

Playwright awaits reporters in configuration order. A timed-out delivery settles
before the next reporter begins; each delivery has its own deadline. Ordered HTTP
submission does not guarantee Teams or Power Automate display order.

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
