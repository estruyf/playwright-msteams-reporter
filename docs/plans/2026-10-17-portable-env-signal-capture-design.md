# Portable Environment Signal Capture Design

## Goal

Provide an optional, application-neutral helper that lets consumers collect bounded environment evidence from Playwright browser tests and attach it using the health reporter's existing `env-signal:<kind>` annotation contract.

## Design

Implement the helper behind a new package subpath, leaving the package root, original reporter, health reporter lifecycle, and existing fixture ownership unchanged. Consumers call it from their own fixture with the existing `Page`, `BrowserContext`, and `TestInfo`; it returns a disposer for reliable teardown. Browser-context listeners cover existing pages and popups, while page listeners collect page errors and console errors. Request and response evidence is filtered by consumer policy before classification.

Each consumer supplies an independent policy: relevant hosts/URLs, exclusions, optional classifiers, per-kind and total retention limits, passed-test retention, and a sanitizer. Defaults remain conservative: expected negative-auth responses, intentional aborts, teardown cancellations, and unrelated hosts are not outage signals. Classification uses raw event data locally, but retained text is sanitized before it reaches annotations, stdout, or attachments. The helper never changes routing, requests, authentication, assertions, outcomes, or retry budgets.

Expose a bounded `record()` hook for consumers to bridge already-structured API logger events. The helper does not automatically observe `APIRequestContext`; document this boundary rather than implying browser-context listeners cover it. Generic defaults contain no team-specific hosts, labels, ticket parsing, SSO rules, or application classifiers.

## Public API And Packaging

Add one additive helper entry point and exported TypeScript types for options, classifiers, recorded events, and the disposer. Keep implementation modules private behind that entry point; do not add a package-wide `exports` map, new runtime dependency, or root export that can create conflicts when syncing changes from upstream.

## Validation

Use synthetic fixtures and local event emitters/Playwright objects. Cover event relevance and exclusions, auth failures, intentional aborts, spam and memory caps, sanitizer-before-retention, listener cleanup and duplicate prevention, passed/failed retention, timeout evidence, popup handling, manual API-event recording, and unchanged test outcomes. Add TypeScript and JavaScript fixture-composition examples. Never send requests to a real Teams webhook or include private consumer data.