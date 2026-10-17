import type { FullConfig, FullResult, Suite } from "@playwright/test/reporter";
import HealthReporter from "./healthReporter";

describe("optional health reporter", () => {
  const originalFetch = global.fetch;
  const webhookUrl = "https://acme.example/webhook?sig=secret";
  beforeEach(() => {
    jest.spyOn(console, "log").mockImplementation();
    jest.spyOn(console, "error").mockImplementation();
    global.fetch = jest.fn().mockResolvedValue({ ok: true, text: async () => "1" });
  });
  afterEach(() => { global.fetch = originalFetch; jest.restoreAllMocks(); });
  const suite = (outcome: string, kinds: string[] = []) => ({ allTests: () => [{
    id: "example", titlePath: () => ["ACME", "example"], outcome: () => outcome,
    results: [{ status: outcome === "unexpected" ? "failed" : "passed",
      annotations: kinds.map(kind => ({ type: `env-signal:${kind}` })), errors: [] }],
  }] }) as unknown as Suite;
  const result = { status: "passed", duration: 1000 } as FullResult;

  it.each(["msteams", "powerautomate"] as const)("sends a separate inconclusive failure report for %s", async (webhookType) => {
    const reporter = new HealthReporter({ webhookUrl, webhookType, quiet: true });
    reporter.onBegin({} as FullConfig, suite("unexpected"));
    await reporter.onEnd({ ...result, status: "failed" });
    expect(global.fetch).toHaveBeenCalledTimes(1);
    expect(global.fetch).toHaveBeenCalledWith(webhookUrl, expect.objectContaining({ signal: expect.any(AbortSignal) }));
    const request = jest.mocked(global.fetch).mock.calls[0][1];
    expect(String(request?.body)).toContain("Cause undetermined");
    expect(String(request?.body)).not.toContain("sig=secret");
    expect(console.log).not.toHaveBeenCalled();
    expect(reporter.printsToStdio()).toBe(false);
    expect("onStdOut" in reporter).toBe(false);
  });

  it("does not post a clean signal-free run", async () => {
    const reporter = new HealthReporter({ webhookUrl });
    reporter.onBegin({} as FullConfig, suite("expected"));
    await reporter.onEnd(result);
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it("reports signal evidence on the final successful flaky attempt", async () => {
    const reporter = new HealthReporter({ webhookUrl, quiet: true });
    const flakySuite = { allTests: () => [{
      id: "flaky-final-signal", titlePath: () => ["flaky-final-signal"], outcome: () => "flaky", expectedStatus: "passed",
      results: [
        { status: "failed", annotations: [], errors: [] },
        { status: "passed", annotations: [{ type: "env-signal:http-5xx" }], errors: [] },
      ],
    }] } as unknown as Suite;
    reporter.onBegin({} as FullConfig, flakySuite);
    await reporter.onEnd(result);
    expect(global.fetch).toHaveBeenCalledTimes(1);
    const body = String(jest.mocked(global.fetch).mock.calls[0][1]?.body);
    expect(body).toContain("Recovered flaky tests with signal evidence: 1");
  });

  it("reports final signals on flaky tests without labeling them recovered", async () => {
    const reporter = new HealthReporter({ webhookUrl, quiet: true });
    reporter.onBegin({} as FullConfig, { allTests: () => [{
      id: "flaky-final-failed", titlePath: () => ["flaky-final-failed"], outcome: () => "flaky", expectedStatus: "passed",
      results: [
        { status: "passed", annotations: [], errors: [] },
        { status: "failed", annotations: [{ type: "env-signal:http-5xx" }], errors: [] },
      ],
    }] } as unknown as Suite);
    await reporter.onEnd(result);
    expect(global.fetch).toHaveBeenCalledTimes(1);
    const body = String(jest.mocked(global.fetch).mock.calls[0][1]?.body);
    expect(body).toContain("Flaky tests with final-attempt signals: 1");
    expect(body).not.toContain("Recovered flaky tests with signal evidence: 1");
  });

  it("does not post a clean run containing only known noise", async () => {
    const reporter = new HealthReporter({
      webhookUrl,
      categories: [{ name: "Ambient", kinds: ["ambient"], noise: true }],
    });
    reporter.onBegin({} as FullConfig, suite("expected", ["ambient"]));
    await reporter.onEnd(result);
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it("allows signal-carrying all-pass reports to be disabled independently", async () => {
    const reporter = new HealthReporter({ webhookUrl, notifyOnSuccess: false });
    reporter.onBegin({} as FullConfig, suite("expected", ["page-error"]));
    await reporter.onEnd(result);
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it("reports runner errors without failed tests and explicitly enabled empty runs", async () => {
    const reporter = new HealthReporter({ webhookUrl, quiet: true });
    reporter.onBegin({} as FullConfig, { allTests: () => [] } as unknown as Suite);
    reporter.onError({ message: "ACME worker startup failed" });
    await reporter.onEnd({ ...result, status: "failed" });
    expect(global.fetch).toHaveBeenCalledTimes(1);
    jest.mocked(global.fetch).mockClear();
    const empty = new HealthReporter({ webhookUrl, reportOnEmpty: true });
    empty.onBegin({} as FullConfig, { allTests: () => [] } as unknown as Suite);
    await empty.onEnd(result);
    expect(global.fetch).toHaveBeenCalledTimes(1);
  });

  it("reports setup or collection failures received before onBegin", async () => {
    const reporter = new HealthReporter({ webhookUrl, quiet: true });
    reporter.onError({ message: "ACME global setup failed" });
    await reporter.onEnd({ ...result, status: "failed" });
    expect(global.fetch).toHaveBeenCalledTimes(1);
    const body = JSON.parse(jest.mocked(global.fetch).mock.calls[0][1]?.body as string);
    expect(body.attachments[0].content.body.some((entry: { text?: string }) => entry.text?.includes("global setup failed"))).toBe(true);
  });

  it("includes value-only Playwright runner errors in the health card", async () => {
    const reporter = new HealthReporter({ webhookUrl, quiet: true });
    reporter.onBegin({} as FullConfig, { allTests: () => [] } as unknown as Suite);
    reporter.onError({ value: "backend unavailable" });
    await reporter.onEnd({ ...result, status: "failed" });
    const body = String(jest.mocked(global.fetch).mock.calls[0][1]?.body);
    expect(body).toContain("backend unavailable");
  });

  it("sanitizes and bounds runner errors when they are received", () => {
    const reporter = new HealthReporter({
      webhookUrl,
      sanitizeText: text => text.replace(/PRIVATE\[[\s\S]*?\]/g, "[redacted]"),
    });
    reporter.onError({ message: `PRIVATE[${"x".repeat(10000)}]` });
    expect((reporter as any).runnerErrors).toEqual(["\\[redacted\\]"]);
  });

  it("counts runner errors beyond the detail cap and keeps them near the summary", async () => {
    const reporter = new HealthReporter({ webhookUrl, quiet: true, maxPayloadBytes: 4096 });
    for (let index = 0; index < 23; index += 1) reporter.onError({ message: `Runner error ${index}` });
    await reporter.onEnd({ ...result, status: "failed" });
    const card = JSON.parse(jest.mocked(global.fetch).mock.calls[0][1]?.body as string).attachments[0].content;
    expect(card.body.some((entry: { text: string }) => entry.text === "3 additional runner errors omitted.")).toBe(true);
    expect(card.body.findIndex((entry: { text: string }) => entry.text.startsWith("Runner error:"))).toBe(4);
  });

  it("honors enabled and shouldRun gates without altering other reporters", async () => {
    for (const options of [{ enabled: false }, { shouldRun: () => false }]) {
      const reporter = new HealthReporter({ webhookUrl, ...options });
      reporter.onBegin({} as FullConfig, suite("unexpected"));
      await reporter.onEnd({ ...result, status: "failed" });
    }
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it("reports pre-onBegin errors and isolates invalid display callbacks", async () => {
    const beforeBegin = new HealthReporter({ webhookUrl, quiet: true });
    beforeBegin.onError({ message: "setup failed" });
    await beforeBegin.onEnd({ ...result, status: "failed" });
    expect(global.fetch).toHaveBeenCalledTimes(1);
    expect(String(jest.mocked(global.fetch).mock.calls[0][1]?.body)).toContain("setup failed");
    jest.mocked(global.fetch).mockClear();

    const invalidLabel = new HealthReporter({ webhookUrl, quiet: true, testLabel: (() => 3) as never });
    invalidLabel.onBegin({} as FullConfig, suite("unexpected"));
    await expect(invalidLabel.onEnd({ ...result, status: "failed" })).resolves.toBeUndefined();
    expect(global.fetch).toHaveBeenCalledTimes(1);
    const card = JSON.parse(jest.mocked(global.fetch).mock.calls[0][1]?.body as string).attachments[0].content;
    expect(card.body.some((entry: { text: string }) => entry.text === "ACME \\> example")).toBe(true);
  });

  it("drops an invalid results action without losing the card", async () => {
    const reporter = new HealthReporter({ webhookUrl, quiet: true, linkToResultsUrl: "relative/path" });
    reporter.onBegin({} as FullConfig, suite("unexpected"));
    await expect(reporter.onEnd({ ...result, status: "failed" })).resolves.toBeUndefined();
    expect(global.fetch).toHaveBeenCalledTimes(1);
    expect(JSON.parse(jest.mocked(global.fetch).mock.calls[0][1]?.body as string).attachments[0].content.actions).toEqual([]);
  });

  it("reports throwing results-link callbacks instead of silently omitting the action", async () => {
    const reporter = new HealthReporter({
      webhookUrl,
      quiet: true,
      linkToResultsUrl: () => { throw new Error(`results callback failed ${webhookUrl}`); },
    });
    reporter.onBegin({} as FullConfig, suite("unexpected"));
    await expect(reporter.onEnd({ ...result, status: "failed" })).resolves.toBeUndefined();
    expect(global.fetch).not.toHaveBeenCalled();
    const diagnostic = jest.mocked(console.error).mock.calls.flat().join(" ");
    expect(diagnostic).toContain("results callback failed");
    expect(diagnostic).not.toContain("sig=secret");
  });

  it.each([
    { annotationPrefix: "" }, { maxTests: -1 }, { maxTests: 1.5 }, { maxPayloadBytes: 4095 },
    { maxPayloadBytes: 26001 }, { resultsLinkPolicy: "unknown" }, { webhookType: "unknown" },
  ])("rejects invalid options without echoing values", (options) => {
    expect(() => new HealthReporter({ webhookUrl, ...options } as never)).toThrow(/Invalid health|webhook/);
  });
});