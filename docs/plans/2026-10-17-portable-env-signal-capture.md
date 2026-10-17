# Portable Environment Signal Capture Implementation Plan

> **For GitHub Copilot:** Use the `executing-plans` skill to implement this plan task-by-task.

**Goal:** Add an opt-in Playwright fixture helper that collects bounded, sanitized browser evidence and attaches it with the health reporter's existing `env-signal:<kind>` annotation contract.

**Architecture:** Keep all new runtime code behind `src/healthCapture.ts` and private capture modules under `src/health/`. Consumers explicitly pass their existing `Page`, `BrowserContext`, and `TestInfo`, then dispose listeners in fixture teardown. Each helper instance owns independent filters/classifiers/caps; a bounded `record()` hook accepts already-structured API logger evidence without claiming automatic `APIRequestContext` observation. Do not modify the package root, existing reporters, reporter payloads, or test behavior.

**Tech Stack:** TypeScript, `@playwright/test` public Page/BrowserContext/TestInfo APIs, Jest, TypeScript compiler.

---

### Task 1: Define the helper API and validate per-consumer options

**Files:**
- Create: `src/health/captureTypes.ts`
- Create: `src/health/captureOptions.ts`
- Test: `src/health/captureOptions.test.ts`
- Create: `src/healthCapture.ts`

**Step 1: Write failing option tests**

Cover independent defaults, valid empty options, invalid limits, malformed host/URL filters, and invalid or throwing user callbacks. Keep representative configurations as explicit literals.

**Step 2: Run the focused test and confirm failure**

Run: `npx --no-install jest --runInBand src/health/captureOptions.test.ts`

Expected: FAIL because the capture option API does not exist.

**Step 3: Add the minimal public types and normalization**

Define `EnvSignalCaptureOptions`, event/classifier types, and an independent normalized options object. Include host/URL inclusion and exclusion, ignored statuses, classifiers, total/per-kind caps, passed-test retention, per-entry text limits, and an optional sanitizer. Validate values without logging supplied values. Export only the helper surface from `src/healthCapture.ts`; do not add root exports, package exports maps, or dependencies.

**Step 4: Run focused tests and build**

Run: `npx --no-install jest --runInBand src/health/captureOptions.test.ts`

Run: `npm run build`

Expected: focused tests pass and generated declarations compile.

### Task 2: Capture browser events with reliable listener lifecycle

**Files:**
- Create: `src/health/capture.ts`
- Test: `src/health/capture.test.ts`

**Step 1: Write failing lifecycle tests**

Use typed fakes or local Playwright objects to prove existing pages are covered, new popup pages are covered once, page errors and console errors are observed, and disposal removes every listener. Include repeated disposal and repeated page registration.

**Step 2: Run the focused test and confirm failure**

Run: `npx --no-install jest --runInBand src/health/capture.test.ts`

Expected: FAIL because capture and disposal are not implemented.

**Step 3: Implement listener registration and idempotent disposal**

Register context-level request/response listeners and page-level pageerror/console listeners for existing and future pages. Ensure the provided page is covered even if it is not returned by the context fake. Track registered pages so popups or reused pages cannot create duplicate listeners. `dispose()` must remove all handlers and be safe to call more than once.

**Step 4: Run focused lifecycle tests**

Run: `npx --no-install jest --runInBand src/health/capture.test.ts`

Expected: all listener lifecycle cases pass.

### Task 3: Filter and classify network evidence, including manual API events

**Files:**
- Modify: `src/health/capture.ts`
- Test: `src/health/capture.test.ts`

**Step 1: Write failing filter/classification tests**

Cover relevant host matching, unrelated hosts, configured exclusions, expected 401/403, configured status exclusions, HTTP 5xx, request failures, intentional abort/teardown-cancellation noise, custom classifiers, and a caller-fed `record()` event. Verify each capture instance applies only its own policy.

**Step 2: Run the focused test and confirm failure**

Run: `npx --no-install jest --runInBand src/health/capture.test.ts`

Expected: the new filtering and manual-record cases fail.

**Step 3: Implement classification and bounded recording**

Classify locally from raw event data, but retain only a structured kind and sanitized bounded description. Use generic kinds such as `page-error`, `console-error`, `http-5xx`, `net-fail`, and `test-timeout`; allow consumer classifiers to return application-owned kinds. By default, exclude unrelated origins, expected auth statuses, abort-like cancellations, and configured exclusions. `record()` accepts caller-supplied structured evidence and passes through the same validation, classifier policy, sanitizer, and caps; it does not hook `APIRequestContext` itself.

**Step 4: Run focused filtering tests**

Run: `npx --no-install jest --runInBand src/health/capture.test.ts`

Expected: all inclusion/exclusion and per-instance independence cases pass.

### Task 4: Sanitize retained evidence, append annotations, and enforce budgets

**Files:**
- Modify: `src/health/capture.ts`
- Test: `src/health/capture.test.ts`

**Step 1: Write failing privacy and budget tests**

Prove secret text is sanitized before it is retained or attached; JWT, bearer/token values, and signed URL query/fragment values are masked. Cover event spam, per-kind and total caps, text truncation, no raw text in annotations, no duplicate annotation on repeated disposal, and passed-test retention policy. Verify capture never changes test status or request behavior.

**Step 2: Run focused tests and confirm failures**

Run: `npx --no-install jest --runInBand src/health/capture.test.ts`

Expected: privacy, cap, and annotation cases fail before implementation.

**Step 3: Implement sanitize-before-retain and teardown annotation output**

Apply built-in sanitization and the consumer sanitizer before storing descriptions. Bound retained entry count, per-kind count, and text length. At disposal, append annotations with the `env-signal:` prefix and sanitized descriptions to the supplied `TestInfo`; respect passed-test retention and detect test-budget exhaustion without rewriting the test outcome. Cleanup runs even when final evidence is omitted.

**Step 4: Run focused capture tests and build**

Run: `npx --no-install jest --runInBand src/health/capture.test.ts src/health/captureOptions.test.ts`

Run: `npm run build`

Expected: focused tests and TypeScript build pass.

### Task 5: Verify fixture composition and document the opt-in subpath

**Files:**
- Modify: `README.md`
- Modify: `CHANGELOG.md`
- Create: `src/healthCapture.integration.test.ts` or a focused fixture-composition test alongside existing integration tests.

**Step 1: Add failing fixture-composition coverage**

Prove a TypeScript fixture can wrap an existing fixture and dispose capture in teardown, and a JavaScript/BDD-style example can use the helper without replacing fixture exports. Confirm no real webhook is contacted and test outcomes are unchanged.

**Step 2: Run the focused fixture test and confirm failure**

Run: `npx --no-install jest --runInBand src/healthCapture.integration.test.ts`

Expected: FAIL until the public entry point and fixture usage are connected.

**Step 3: Add documentation and changelog entry**

Document the helper subpath, TypeScript and JavaScript/BDD composition, independent per-team policies, built-in event coverage and conservative exclusions, `record()` for structured API-log bridges, and the explicit boundary that `APIRequestContext` is not automatically observed. Preserve existing README and changelog edits. State PII limitations and prohibit private URLs, raw traces, and consumer identifiers in examples.

**Step 4: Run final safe verification**

Run: `npm run build`

Run: `npm run test:jest`

Do not run `npm test`; it invokes the real-webhook Playwright demo suite. Expected: build and Jest pass without external webhook requests.

**Step 5: Check patch and commit the implementation**

Run: `git diff --check`

Commit the helper, tests, docs, and changelog in focused commits consistent with the repository workflow. Do not alter root reporter behavior or reformat unrelated documentation.