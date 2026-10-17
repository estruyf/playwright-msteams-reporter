import type { BrowserContext, ConsoleMessage, Page, Request, Response, TestInfo } from "@playwright/test";
import { sanitizeHealthText } from "./render";
import { normalizeCaptureOptions } from "./captureOptions";
import type { EnvSignalCaptureEvent, EnvSignalCaptureOptions, EnvSignalRecord } from "./captureTypes";

export interface CaptureEnvSignalsOptions {
  page: Page;
  context: BrowserContext;
  testInfo: TestInfo;
  options?: EnvSignalCaptureOptions;
}

export interface EnvSignalCapture {
  record(event: EnvSignalRecord): void;
  dispose(): void;
}

interface RetainedSignal {
  kind: string;
  description: string;
}

function pageHost(page: Page, testInfo: TestInfo): string | undefined {
  try {
    const currentHost = new URL(page.url()).hostname;
    if (currentHost) return currentHost;
  } catch {
    // Fall back to the configured origin before the page's first navigation.
  }
  const baseURL = testInfo.project.use.baseURL;
  if (typeof baseURL !== "string") return undefined;
  try { return new URL(baseURL).hostname; } catch { return undefined; }
}

function consoleErrorText(message: ConsoleMessage): string {
  return message.text();
}

function safeKind(value: string): boolean {
  return /^[A-Za-z0-9][A-Za-z0-9._-]{0,79}$/.test(value);
}

function cleanDescription(value: string, policy: ReturnType<typeof normalizeCaptureOptions>): string {
  return sanitizeHealthText(value, policy.maxDescriptionLength, undefined, policy.sanitizeText, false);
}

function isRelevantUrl(address: string | undefined, policy: ReturnType<typeof normalizeCaptureOptions>): boolean {
  if (!address) return true;
  try {
    const url = new URL(address);
    if (!["http:", "https:"].includes(url.protocol)) return false;
    const host = url.hostname.toLowerCase();
    if (!policy.includeHosts.includes(host) || policy.excludeHosts.includes(host)) return false;
    return !policy.excludeUrls.some(exclusion => {
      const path = exclusion.slice(new URL(exclusion).origin.length);
      return url.origin === new URL(exclusion).origin &&
        (url.pathname === path || url.pathname.startsWith(path.endsWith("/") ? path : `${path}/`));
    });
  } catch {
    return false;
  }
}

export function captureEnvSignals({ page, context, testInfo, options = {} }: CaptureEnvSignalsOptions): EnvSignalCapture {
  const policy = normalizeCaptureOptions(options, pageHost(page, testInfo));
  const pages = new Set<Page>();
  const pageListeners = new Map<Page, { onPageError: (error: Error) => void; onConsole: (message: ConsoleMessage) => void }>();
  const signals: RetainedSignal[] = [];
  const countsByKind = new Map<string, number>();
  let disposed = false;

  const appendSignal = (kind: string, description = ""): void => {
    if (disposed || typeof kind !== "string") return;
    const sanitizedKind = sanitizeHealthText(kind, 80, undefined, undefined, false);
    if (!safeKind(sanitizedKind)) return;
    if (signals.length >= policy.maxEvents) return;
    const count = countsByKind.get(sanitizedKind) ?? 0;
    if (count >= policy.maxEventsPerKind) return;
    countsByKind.set(sanitizedKind, count + 1);
    signals.push({ kind: sanitizedKind, description: cleanDescription(description, policy) });
  };

  const record = (event: EnvSignalRecord): void => {
    if (!event || typeof event !== "object" || Array.isArray(event) || typeof event.kind !== "string" ||
      (event.url !== undefined && typeof event.url !== "string") ||
      (event.description !== undefined && typeof event.description !== "string") || !isRelevantUrl(event.url, policy)) return;
    appendSignal(event.kind, event.description ?? "");
  };

  const classify = (event: EnvSignalCaptureEvent): void => {
    if (disposed || !isRelevantUrl(event.url, policy) ||
      (event.status !== undefined && policy.ignoredHttpStatuses.includes(event.status))) return;
    for (const classifier of policy.classifiers) {
      try {
        const classification = classifier(event);
        if (classification) {
          appendSignal(
            classification.kind,
            typeof classification.description === "string" ? classification.description : event.text ?? ""
          );
          return;
        }
      } catch {
        continue;
      }
    }
    if (event.source === "page-error") appendSignal("page-error", event.text ?? "");
    else if (event.source === "console-error") appendSignal("console-error", event.text ?? "");
    else if (event.source === "response" && event.status !== undefined && event.status >= 500) {
      appendSignal("http-5xx", event.text ?? `HTTP ${event.status}`);
    } else if (event.source === "request-failed" && event.text && !/abort|cancel/i.test(event.text)) {
      appendSignal("net-fail", event.text);
    }
  };

  const registerPage = (target: Page): void => {
    if (pages.has(target)) return;
    pages.add(target);
    const onPageError = (error: Error): void => classify({
      source: "page-error", url: target.url(), text: error?.message ?? String(error),
    });
    const onConsole = (message: ConsoleMessage): void => {
      if (message.type() === "error") classify({
        source: "console-error", url: message.location().url || target.url(), text: consoleErrorText(message),
      });
    };
    pageListeners.set(target, { onPageError, onConsole });
    target.on("pageerror", onPageError);
    target.on("console", onConsole);
  };
  const onPage = (target: Page): void => registerPage(target);
  const onResponse = (response: Response): void => {
    const request = response.request();
    classify({
      source: "response", url: response.url(), status: response.status(),
      method: request.method(), resourceType: request.resourceType(), text: `HTTP ${response.status()}`,
    });
  };
  const onRequestFailed = (request: Request): void => classify({
    source: "request-failed", url: request.url(), method: request.method(),
    resourceType: request.resourceType(), text: request.failure()?.errorText ?? "Request failed",
  });
  context.on("page", onPage);
  context.on("response", onResponse);
  context.on("requestfailed", onRequestFailed);
  for (const existingPage of context.pages()) registerPage(existingPage);
  registerPage(page);

  const dispose = (): void => {
    if (disposed) return;
    if (testInfo.status === "timedOut" || (testInfo.timeout > 0 && testInfo.duration >= testInfo.timeout)) {
      appendSignal("test-timeout", "Test exceeded its configured time budget");
    }
    disposed = true;
    context.removeListener("page", onPage);
    context.removeListener("response", onResponse);
    context.removeListener("requestfailed", onRequestFailed);
    for (const registeredPage of pages) {
      const listeners = pageListeners.get(registeredPage);
      if (!listeners) continue;
      registeredPage.removeListener("pageerror", listeners.onPageError);
      registeredPage.removeListener("console", listeners.onConsole);
    }
    if (testInfo.status !== "passed" || policy.retainOnPass) {
      for (const signal of signals) {
        testInfo.annotations.push({
          type: `${policy.annotationPrefix}${signal.kind}`,
          ...(signal.description ? { description: signal.description } : {}),
        });
      }
    }
  };

  return { record, dispose };
}