import type { Suite } from "@playwright/test/reporter";
import MsTeamsReporter from ".";
import { processResults } from "./processResults";

describe("bounded webhook delivery", () => {
  const originalFetch = global.fetch;
  const webhookUrl = "https://acme.example/webhook?sig=synthetic-secret";
  const suite = {
    allTests: () => [{}],
    suites: [{ allTests: () => [{ outcome: () => "expected" }] }],
  } as unknown as Suite;

  beforeEach(() => {
    jest.spyOn(console, "log").mockImplementation();
    jest.spyOn(console, "error").mockImplementation();
    jest.useFakeTimers();
  });

  afterEach(() => {
    global.fetch = originalFetch;
    jest.useRealTimers();
    jest.restoreAllMocks();
  });

  it.each([undefined, 25])("aborts stalled headers with timeout %s", async (webhookTimeoutMs) => {
    let signal: AbortSignal | undefined;
    global.fetch = jest.fn((_url, request) => {
      signal = request?.signal as AbortSignal;
      return new Promise((_resolve, reject) => {
        signal?.addEventListener("abort", () => reject(new Error("aborted")), { once: true });
      });
    });
    const options = { webhookUrl, webhookTimeoutMs, notifyOnSuccess: true };
    const pending = processResults(suite, options);
    expect(signal).toBeDefined();
    await jest.advanceTimersByTimeAsync(webhookTimeoutMs ?? 10000);
    await expect(pending).resolves.toBeUndefined();
    expect(signal?.aborted).toBe(true);
    expect(global.fetch).toHaveBeenCalledTimes(1);
    expect(console.error).toHaveBeenCalledTimes(1);
    expect(console.log).not.toHaveBeenCalledWith("Message sent successfully");
    expect(jest.getTimerCount()).toBe(0);
  });

  it.each([false, true])("keeps the timeout active through body consumption when quiet=%s", async (quiet) => {
    global.fetch = jest.fn(async (_url, request) => ({
      ok: true,
      text: () => new Promise((_resolve, reject) => {
        request?.signal?.addEventListener("abort", () => reject(new Error("body aborted")), { once: true });
      }),
    } as unknown as Response));
    const options = { webhookUrl, webhookTimeoutMs: 25, quiet, notifyOnSuccess: true };
    const pending = processResults(suite, options);
    await jest.advanceTimersByTimeAsync(25);
    await expect(pending).resolves.toBeUndefined();
    expect(console.log).not.toHaveBeenCalledWith("Message sent successfully");
    expect(console.error).toHaveBeenCalledTimes(1);
    expect(jest.getTimerCount()).toBe(0);
  });

  it.each(["request", "body"])("sanitizes %s failures without rejecting", async (stage) => {
    const failure = new Error(`Connection failed at ${webhookUrl}`);
    global.fetch = jest.fn().mockImplementation(async () => {
      if (stage === "request") throw failure;
      return { ok: true, text: async () => { throw failure; } };
    });
    await expect(processResults(suite, { webhookUrl, notifyOnSuccess: true })).resolves.toBeUndefined();
    const diagnostics = JSON.stringify(jest.mocked(console.error).mock.calls);
    expect(diagnostics).not.toContain("synthetic-secret");
    expect(diagnostics).toContain("<redacted>");
    expect(console.error).toHaveBeenCalledTimes(1);
    expect(console.log).not.toHaveBeenCalledWith("Message sent successfully");
    expect(jest.getTimerCount()).toBe(0);
  });

  it.each([
    { name: "null-prototype value", rejection: Object.create(null) },
    { name: "throwing conversion", rejection: { toString() { throw new Error("conversion failed"); } } },
  ])("settles when a rejection cannot be formatted: $name", async ({ rejection }) => {
    global.fetch = jest.fn().mockRejectedValue(rejection);
    await expect(processResults(suite, { webhookUrl, notifyOnSuccess: true })).resolves.toBeUndefined();
    expect(console.error).toHaveBeenCalledWith("Failed to send message: Unknown error");
    expect(console.error).toHaveBeenCalledTimes(1);
    expect(jest.getTimerCount()).toBe(0);
  });

  it("bounds error diagnostics after redaction", async () => {
    global.fetch = jest.fn().mockRejectedValue(new Error(`${webhookUrl} ${"x".repeat(5000)}`));
    await processResults(suite, { webhookUrl, notifyOnSuccess: true });
    const output = jest.mocked(console.error).mock.calls.flat().join(" ");
    expect(output).not.toContain("synthetic-secret");
    expect(output.length).toBeLessThanOrEqual(1100);
  });

  it("includes the sanitized underlying cause of a native fetch failure", async () => {
    global.fetch = jest.fn().mockRejectedValue(Object.assign(new TypeError("fetch failed"), {
      cause: new Error(`ECONNREFUSED at ${webhookUrl}`),
    }));
    await processResults(suite, { webhookUrl, notifyOnSuccess: true });
    expect(console.error).toHaveBeenCalledWith(
      "Failed to send message: fetch failed: ECONNREFUSED at <redacted>"
    );
    expect(jest.getTimerCount()).toBe(0);
  });

  it("redacts and bounds non-success HTTP response diagnostics", async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: false, text: async () => `${webhookUrl} ${"x".repeat(5000)}`,
    });
    await processResults(suite, { webhookUrl, notifyOnSuccess: true, quiet: true });
    const output = jest.mocked(console.error).mock.calls.flat().join(" ");
    expect(output).not.toContain("synthetic-secret");
    expect(output).toContain("<redacted>");
    expect(output.length).toBeLessThanOrEqual(1100);
    expect(console.log).not.toHaveBeenCalledWith("Message sent successfully");
    expect(jest.getTimerCount()).toBe(0);
  });

  it("waits for the response body before logging success and clears its timer", async () => {
    let finishBody: ((text: string) => void) | undefined;
    global.fetch = jest.fn().mockResolvedValue({
      ok: true, text: () => new Promise<string>(resolve => { finishBody = resolve; }),
    });
    const pending = processResults(suite, { webhookUrl, notifyOnSuccess: true });
    await jest.advanceTimersByTimeAsync(0);
    expect(console.log).not.toHaveBeenCalledWith("Message sent successfully");
    expect(jest.getTimerCount()).toBe(1);
    finishBody?.("1");
    await pending;
    expect(console.log).toHaveBeenCalledWith("Message sent successfully");
    expect(jest.getTimerCount()).toBe(0);
  });

  it.each([0, -1, NaN, Infinity, 1.5, 2147483648])("rejects invalid timeout %s for construction and direct calls", async (webhookTimeoutMs) => {
    const options = { webhookUrl, webhookTimeoutMs, notifyOnSuccess: true };
    expect(() => new MsTeamsReporter(options)).toThrow(/webhookTimeoutMs/);
    await expect(processResults(suite, options)).rejects.toThrow(/webhookTimeoutMs/);
  });

  it("does not swallow callback programming errors", async () => {
    global.fetch = jest.fn();
    const failure = new Error("callback failed");
    await expect(processResults(suite, {
      webhookUrl, notifyOnSuccess: true, linkToResultsUrl: () => { throw failure; },
    })).rejects.toBe(failure);
    expect(global.fetch).not.toHaveBeenCalled();
    expect(console.error).not.toHaveBeenCalled();
    expect(jest.getTimerCount()).toBe(0);
  });
});