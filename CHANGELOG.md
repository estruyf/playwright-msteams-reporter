# Changelog

All notable changes to this project will be documented in this file.

## [Unreleased]

- Add an optional application-neutral test-run health reporter at `playwright-msteams-reporter/dist/healthReporter`; it posts a separate bounded Adaptive Card after the original report when run evidence warrants it.
- Bound webhook requests and response-body reads with `webhookTimeoutMs` (default 10 seconds); report redacted transport failures without changing test outcomes or retrying delivery.
- Resolve omitted or explicitly `undefined` webhook destinations from `MSTEAMS_WEBHOOK_URL` or a custom `webhookUrlEnv` without modifying reporter configuration; an explicit empty URL disables delivery. Config expressions evaluating to `undefined` now use this fallback.
- Redact configured webhook URLs and their canonical URL forms from reporter logs without changing delivery.
- Require `debug: true` for diagnostic dumps; `NODE_ENV=development` alone no longer enables them.
- Add an optional `dist/healthCapture` fixture helper for bounded, sanitized browser evidence and consumer-owned environment-signal policies; existing reporters and fixture exports remain unchanged.

## [0.0.13]

- [#21](https://github.com/playwright-community/playwright-msteams-reporter/issues/21): Added the `mentionAuthors` option to mention commit/PR authors using Playwright's git metadata
- [#23](https://github.com/playwright-community/playwright-msteams-reporter/issues/23): Added the `enableDuration` option to show the test run duration in the report
- [#24](https://github.com/playwright-community/playwright-msteams-reporter/issues/24): Added the `reportOnEmpty` option to control whether to report when no tests are found
- [#25](https://github.com/playwright-community/playwright-msteams-reporter/issues/25): Removed the webhook URL validation as it keeps changing format

## [0.0.12]

- [#18](https://github.com/playwright-community/playwright-msteams-reporter/issues/18): Fix issue in MS Teams webhook URL validation

## [0.0.11]

- [#15](https://github.com/playwright-community/playwright-msteams-reporter/pull/15): New option `shouldRun` to control when to report based on suite values

## [0.0.10]

- [#10](https://github.com/playwright-community/playwright-msteams-reporter/issues/10): Update to the `linkToResultsUrl` and `linkUrlOnFailure` options to support a function that returns the URL

## [0.0.9]

- [#7](https://github.com/playwright-community/playwright-msteams-reporter/issues/7): Fix for Power Automate webhook URL validation

## [0.0.8]

- [#4](https://github.com/playwright-community/playwright-msteams-reporter/issues/4): Added support for flaky tests
- [#5](https://github.com/playwright-community/playwright-msteams-reporter/issues/5): Added the `enableEmoji` setting to show an emoji based on the test status

## [0.0.7]

- Included the type definition files
- Updated project information
- [#2](https://github.com/playwright-community/playwright-msteams-reporter/issues/2): Added the `linkUrlOnFailure` and `linkTextOnFailure` options
- [#3](https://github.com/playwright-community/playwright-msteams-reporter/issues/3): Sending duplicate results to the webhook

## [0.0.6]

- Set the default value for the `webhookType` option to `powerautomate`.

## [0.0.5]

- The reporter now supports Microsoft Teams incoming webhooks and Power Automate webhooks. You can configure this in the `webhookType` option.

## [0.0.4]

- Added Microsoft Teams incoming webhook URL validation
- Added Jest tests

## [0.0.3]

- Added `debug` option to show the options that are used, plus the payload that is sent to the Microsoft Teams webhook.

## [0.0.2]

- Update readme with more information on how to use the configuration options.

## [0.0.1]

- Initial release of the `playwright-msteams-reporter`.
