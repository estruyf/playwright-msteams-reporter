import { EventEmitter } from "node:events";
import type { BrowserContext, Page, TestInfo } from "@playwright/test";
import { captureEnvSignals } from "../healthCapture";

class FakePage extends EventEmitter {
  constructor(private readonly address = "https://app.acme.example/checkout") {
    super();
  }

  url(): string {
    return this.address;
  }
}

class FakeContext extends EventEmitter {
  constructor(private readonly openPages: FakePage[]) {
    super();
  }

  pages(): Page[] {
    return this.openPages as unknown as Page[];
  }
}

function createTestInfo(): TestInfo {
  return {
    annotations: [],
    status: "failed",
    expectedStatus: "passed",
    timeout: 5000,
    duration: 200,
  } as unknown as TestInfo;
}

function emitResponse(context: FakeContext, address: string, status: number): void {
  const request = { url: () => address, method: () => "GET", resourceType: () => "fetch" };
  context.emit("response", { url: () => address, status: () => status, request: () => request });
}

function emitRequestFailure(context: FakeContext, address: string, errorText: string): void {
  context.emit("requestfailed", {
    url: () => address,
    method: () => "GET",
    resourceType: () => "fetch",
    failure: () => ({ errorText }),
  });
}

describe("environment signal browser capture lifecycle", () => {
  it("captures page errors from existing pages and popups once", () => {
    const existingPage = new FakePage();
    const popupPage = new FakePage();
    const context = new FakeContext([existingPage]);
    const testInfo = createTestInfo();
    const capture = captureEnvSignals({
      page: existingPage as unknown as Page,
      context: context as unknown as BrowserContext,
      testInfo,
    });

    existingPage.emit("pageerror", new Error("existing page failed"));
    context.emit("page", popupPage);
    context.emit("page", popupPage);
    popupPage.emit("pageerror", new Error("popup failed"));
    capture.dispose();

    expect(testInfo.annotations.map(annotation => annotation.type)).toEqual([
      "env-signal:page-error",
      "env-signal:page-error",
    ]);
    expect(existingPage.listenerCount("pageerror")).toBe(0);
    expect(popupPage.listenerCount("pageerror")).toBe(0);
    expect(context.listenerCount("page")).toBe(0);
  });

  it("uses the configured baseURL when the fixture page is still about:blank", () => {
    const page = new FakePage("about:blank");
    const context = new FakeContext([page]);
    const testInfo = {
      ...createTestInfo(),
      project: { use: { baseURL: "https://app.acme.example" } },
    } as TestInfo;
    const capture = captureEnvSignals({
      page: page as unknown as Page,
      context: context as unknown as BrowserContext,
      testInfo,
    });

    emitResponse(context, "https://app.acme.example/startup", 503);
    capture.dispose();

    expect(testInfo.annotations.map(annotation => annotation.type)).toEqual(["env-signal:http-5xx"]);
  });

  it("captures console errors and makes disposal idempotent", () => {
    const page = new FakePage();
    const context = new FakeContext([page]);
    const testInfo = createTestInfo();
    const capture = captureEnvSignals({
      page: page as unknown as Page,
      context: context as unknown as BrowserContext,
      testInfo,
    });
    const consoleError = { type: () => "error", text: () => "console failure", location: () => ({ url: page.url() }) };

    page.emit("console", consoleError);
    capture.dispose();
    capture.dispose();

    expect(testInfo.annotations).toHaveLength(1);
    expect(testInfo.annotations[0].type).toBe("env-signal:console-error");
    expect(page.listenerCount("console")).toBe(0);
    expect(context.listenerCount("page")).toBe(0);
  });

  it("sanitizes descriptions before retaining annotations", () => {
    const page = new FakePage();
    const context = new FakeContext([page]);
    const testInfo = createTestInfo();
    const capture = captureEnvSignals({
      page: page as unknown as Page,
      context: context as unknown as BrowserContext,
      testInfo,
      options: { sanitizeText: text => text.replace("company-secret", "[masked-domain]") },
    });

    capture.record({
      kind: "api-diagnostic",
      url: "https://app.acme.example/data?sig=synthetic-signature#token=fragment-secret",
      description: "Bearer synthetic-bearer company-secret",
    });
    capture.dispose();

    expect(testInfo.annotations[0].description).not.toContain("synthetic-bearer");
    expect(testInfo.annotations[0].description).not.toContain("synthetic-signature");
    expect(testInfo.annotations[0].description).not.toContain("fragment-secret");
    expect(testInfo.annotations[0].description).not.toContain("company-secret");
    expect(testInfo.annotations[0].description).toContain("[masked-domain]");
  });

  it("filters unrelated hosts, expected auth responses, and intentional request aborts", () => {
    const page = new FakePage();
    const context = new FakeContext([page]);
    const testInfo = createTestInfo();
    const capture = captureEnvSignals({
      page: page as unknown as Page,
      context: context as unknown as BrowserContext,
      testInfo,
      options: { includeHosts: ["app.acme.example", "api.acme.example"] },
    });

    emitResponse(context, "https://third-party.example/unavailable", 503);
    emitResponse(context, "https://api.acme.example/private", 401);
    emitResponse(context, "https://api.acme.example/forbidden", 403);
    emitResponse(context, "https://api.acme.example/failure", 503);
    emitRequestFailure(context, "https://api.acme.example/navigation", "net::ERR_ABORTED");
    emitRequestFailure(context, "https://api.acme.example/service", "net::ERR_CONNECTION_RESET");
    capture.dispose();

    expect(testInfo.annotations.map(annotation => annotation.type)).toEqual([
      "env-signal:http-5xx",
      "env-signal:net-fail",
    ]);
    expect(context.listenerCount("response")).toBe(0);
    expect(context.listenerCount("requestfailed")).toBe(0);
  });

  it("applies exact host exclusions, URL-prefix exclusions, and configured ignored statuses", () => {
    const page = new FakePage();
    const context = new FakeContext([page]);
    const testInfo = createTestInfo();
    const capture = captureEnvSignals({
      page: page as unknown as Page,
      context: context as unknown as BrowserContext,
      testInfo,
      options: {
        includeHosts: ["app.acme.example", "api.acme.example", "ignored.acme.example"],
        excludeHosts: ["ignored.acme.example"],
        excludeUrls: ["https://api.acme.example/health"],
        ignoredHttpStatuses: [429, 503],
      },
    });

    emitResponse(context, "https://ignored.acme.example/failure", 500);
    emitResponse(context, "https://api.acme.example/health/check", 500);
    emitResponse(context, "https://api.acme.example/healthz", 500);
    emitResponse(context, "https://api.acme.example/overloaded", 503);
    emitResponse(context, "https://api.acme.example/failure", 500);
    capture.dispose();

    expect(testInfo.annotations.map(annotation => annotation.type)).toEqual([
      "env-signal:http-5xx",
      "env-signal:http-5xx",
    ]);
  });

  it("applies custom classifiers and manual records within each capture policy", () => {
    const firstPage = new FakePage();
    const firstContext = new FakeContext([firstPage]);
    const firstTestInfo = createTestInfo();
    const firstCapture = captureEnvSignals({
      page: firstPage as unknown as Page,
      context: firstContext as unknown as BrowserContext,
      testInfo: firstTestInfo,
      options: {
        includeHosts: ["app.acme.example", "api.acme.example"],
        classifiers: [event => event.source === "console-error" && event.text?.includes("System busy")
          ? { kind: "checkout-busy", description: event.text }
          : undefined],
      },
    });
    const secondPage = new FakePage();
    const secondContext = new FakeContext([secondPage]);
    const secondTestInfo = createTestInfo();
    const secondCapture = captureEnvSignals({
      page: secondPage as unknown as Page,
      context: secondContext as unknown as BrowserContext,
      testInfo: secondTestInfo,
      options: { includeHosts: ["other.acme.example"] },
    });

    firstPage.emit("console", { type: () => "error", text: () => "System busy", location: () => ({ url: firstPage.url() }) });
    firstCapture.record({ kind: "api-timeout", description: "API logger signal", url: "https://api.acme.example/tours" });
    firstCapture.record({ kind: "external-noise", url: "https://third-party.example/ads" });
    secondCapture.record({ kind: "other-team-signal", url: "https://other.acme.example/check" });
    firstCapture.dispose();
    secondCapture.dispose();

    expect(firstTestInfo.annotations.map(annotation => annotation.type)).toEqual([
      "env-signal:checkout-busy",
      "env-signal:api-timeout",
    ]);
    expect(secondTestInfo.annotations.map(annotation => annotation.type)).toEqual(["env-signal:other-team-signal"]);
  });

  it("falls back to sanitized event text for malformed custom classifier descriptions", () => {
    const page = new FakePage();
    const context = new FakeContext([page]);
    const testInfo = createTestInfo();
    const capture = captureEnvSignals({
      page: page as unknown as Page,
      context: context as unknown as BrowserContext,
      testInfo,
      options: {
        classifiers: [() => ({ kind: "custom-error", description: 42 } as never)],
      },
    });

    page.emit("pageerror", new Error("page error"));
    capture.dispose();

    expect(testInfo.annotations.map(annotation => annotation.type)).toEqual(["env-signal:custom-error"]);
    expect(testInfo.annotations[0].description).toBe("page error");
  });

  it("enforces event and per-kind caps and omits passing-test evidence by default", () => {
    const page = new FakePage();
    const context = new FakeContext([page]);
    const testInfo = { ...createTestInfo(), status: "passed" } as TestInfo;
    const capture = captureEnvSignals({
      page: page as unknown as Page,
      context: context as unknown as BrowserContext,
      testInfo,
      options: { maxEvents: 2, maxEventsPerKind: 1 },
    });

    capture.record({ kind: "one", description: "kept" });
    capture.record({ kind: "one", description: "duplicate kind" });
    capture.record({ kind: "two", description: "over total cap" });
    capture.dispose();

    expect(testInfo.annotations).toEqual([]);
  });

  it("bounds retained evidence by total count, per-kind count, and description length", () => {
    const page = new FakePage();
    const context = new FakeContext([page]);
    const testInfo = createTestInfo();
    const capture = captureEnvSignals({
      page: page as unknown as Page,
      context: context as unknown as BrowserContext,
      testInfo,
      options: { maxEvents: 2, maxEventsPerKind: 1, maxDescriptionLength: 4 },
    });

    capture.record({ kind: "one", description: "first event" });
    capture.record({ kind: "one", description: "duplicate kind" });
    capture.record({ kind: "two", description: "second event" });
    capture.record({ kind: "three", description: "over total cap" });
    capture.dispose();

    expect(testInfo.annotations.map(annotation => annotation.type)).toEqual(["env-signal:one", "env-signal:two"]);
    expect(testInfo.annotations.map(annotation => annotation.description)).toEqual(["firs", "seco"]);
  });

  it("ignores malformed records passed from untyped JavaScript", () => {
    const page = new FakePage();
    const context = new FakeContext([page]);
    const testInfo = createTestInfo();
    const capture = captureEnvSignals({
      page: page as unknown as Page,
      context: context as unknown as BrowserContext,
      testInfo,
    });

    capture.record({ kind: "broken", description: 42 } as never);
    capture.dispose();

    expect(testInfo.annotations).toEqual([]);
  });

  it("rejects unsafe kinds and omits details when a consumer sanitizer throws", () => {
    const page = new FakePage();
    const context = new FakeContext([page]);
    const testInfo = createTestInfo();
    const capture = captureEnvSignals({
      page: page as unknown as Page,
      context: context as unknown as BrowserContext,
      testInfo,
      options: { sanitizeText: () => { throw new Error("sanitizer failure"); } },
    });

    capture.record({ kind: "token=private", description: "private value" });
    capture.record({ kind: "eyJsynthetic.payload.signature", description: "signed kind" });
    capture.record({ kind: "safe-kind", description: "private value" });
    capture.dispose();

    expect(testInfo.annotations).toHaveLength(1);
    expect(testInfo.annotations[0].type).toBe("env-signal:safe-kind");
    expect(testInfo.annotations[0].description).toBe("<detail omitted>");
    expect(JSON.stringify(testInfo.annotations)).not.toContain("private value");
  });

  it("retains passing evidence only when explicitly enabled and records test timeout", () => {
    const page = new FakePage();
    const context = new FakeContext([page]);
    const testInfo = { ...createTestInfo(), status: "passed", duration: 5000, timeout: 5000 } as TestInfo;
    const capture = captureEnvSignals({
      page: page as unknown as Page,
      context: context as unknown as BrowserContext,
      testInfo,
      options: { retainOnPass: true },
    });

    capture.dispose();

    expect(testInfo.annotations.map(annotation => annotation.type)).toEqual(["env-signal:test-timeout"]);
  });
});