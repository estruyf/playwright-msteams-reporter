import MsTeamsReporter from ".";
import { processResults } from "./processResults";
import type { Suite } from "@playwright/test/reporter";
import { redactWebhookUrl } from "./utils/redactWebhookUrl";

const destinations = [
  { webhookType: "msteams" as const, webhookUrl: "https://acme.webhook.office.com/webhookb2/example/IncomingWebhook/secret/example" },
  { webhookType: "powerautomate" as const, webhookUrl: "https://acme.logic.azure.com/workflows/example/triggers/manual/paths/invoke?sig=secret" },
];

describe("webhook logging privacy", () => {
  const originalEnvironment = process.env.NODE_ENV;
  const originalFetch = global.fetch;

  beforeEach(() => {
    jest.spyOn(console, "log").mockImplementation();
    jest.spyOn(console, "error").mockImplementation();
  });

  afterEach(() => {
    jest.restoreAllMocks();
    global.fetch = originalFetch;
    if (originalEnvironment === undefined) delete process.env.NODE_ENV;
    else process.env.NODE_ENV = originalEnvironment;
  });

  it("does not enable diagnostic dumps through NODE_ENV", () => {
    process.env.NODE_ENV = "development";
    new MsTeamsReporter({ webhookUrl: destinations[0].webhookUrl });
    expect(console.log).toHaveBeenCalledTimes(1);
    expect(console.log).toHaveBeenCalledWith("Using Microsoft Teams reporter");
  });

  it("does not dump the card through NODE_ENV when debug is omitted", async () => {
    process.env.NODE_ENV = "development";
    global.fetch = jest.fn().mockResolvedValue({ ok: true, text: async () => "1" });
    const suite = {
      suites: [{ allTests: () => [{ outcome: () => "expected" }] }],
      allTests: () => [{}],
    } as unknown as Suite;
    await processResults(suite, {
      ...destinations[0], notifyOnSuccess: true,
    });
    expect(console.log).toHaveBeenCalledTimes(1);
    expect(console.log).toHaveBeenCalledWith("Message sent successfully");
  });

  it.each([
    "https://ACME.logic.azure.com:443/workflows/example/invoke?sig=SYNTHETIC",
    "https://ACME.webhook.office.com:443/IncomingWebhook/SYNTHETIC/example",
  ])("redacts normalized destinations: %s", (destination) => {
    const normalized = new URL(destination).href;
    expect(normalized).not.toBe(destination);
    expect(redactWebhookUrl(`Echo ${normalized}`, destination)).toBe("Echo <redacted>");
    expect(redactWebhookUrl(JSON.stringify({ destination: normalized }), destination))
      .toBe(JSON.stringify({ destination: "<redacted>" }));
  });

  it("preserves exact-value redaction for destinations that cannot be parsed", () => {
    expect(redactWebhookUrl("Echo not-a-url", "not-a-url")).toBe("Echo <redacted>");
  });

  it.each([false, true])("keeps diagnostics explicit when quiet=%s", (quiet) => {
    new MsTeamsReporter({ webhookUrl: "", quiet, debug: false });
    expect(console.log).toHaveBeenCalledTimes(1);
    jest.mocked(console.log).mockClear();
    const reporter = new MsTeamsReporter({ webhookUrl: "", quiet, debug: true });
    expect(console.log).toHaveBeenCalledTimes(3);
    const stdout = jest.spyOn(process.stdout, "write").mockImplementation(() => true);
    reporter.onStdOut("ordinary output", undefined, undefined);
    expect(stdout).toHaveBeenCalledTimes(quiet ? 0 : 1);
  });

  it("redacts repeated and JSON-escaped destinations without changing other links", () => {
    const destination = 'https://acme.example/webhook?value="secret"';
    const publicLink = "https://reports.acme.example/results";
    expect(redactWebhookUrl(`${destination} ${destination}`, destination))
      .toBe("<redacted> <redacted>");
    expect(redactWebhookUrl(JSON.stringify({ destination, publicLink }), destination))
      .toBe(JSON.stringify({ destination: "<redacted>", publicLink }));
    expect(redactWebhookUrl(publicLink, "")).toBe(publicLink);
    expect(redactWebhookUrl(publicLink)).toBe(publicLink);
  });

  it.each(destinations)("redacts $webhookType constructor diagnostics", (destination) => {
    new MsTeamsReporter({ ...destination, debug: true, quiet: true });
    const output = JSON.stringify(jest.mocked(console.log).mock.calls);
    expect(output).not.toContain(destination.webhookUrl);
    expect(output).toContain("<redacted>");
  });

  it.each(destinations)("redacts $webhookType passthrough without changing ordinary text", (destination) => {
    const stdout = jest.spyOn(process.stdout, "write").mockImplementation(() => true);
    const stderr = jest.spyOn(process.stderr, "write").mockImplementation(() => true);
    const reporter = new MsTeamsReporter(destination);
    reporter.onStdOut(`Destination ${destination.webhookUrl}`, undefined, undefined);
    reporter.onStdErr(Buffer.from(`Destination ${destination.webhookUrl}`), undefined as never, undefined as never);
    expect(stdout).toHaveBeenCalledWith("Destination <redacted>");
    expect(stderr).toHaveBeenCalledWith("Destination <redacted>");
    reporter.onStdOut("ordinary output", undefined, undefined);
    expect(stdout).toHaveBeenCalledWith("ordinary output");
  });

  it.each(destinations.flatMap(destination => [true, false].map(ok => ({ ...destination, ok }))))(
    "redacts $webhookType response logs (ok=$ok) without changing delivery",
    async ({ webhookUrl, webhookType, ok }) => {
      const fetchMock = jest.fn().mockResolvedValue({ ok, text: async () => `Echo ${webhookUrl}` });
      global.fetch = fetchMock;
      const suite = {
        suites: [{ allTests: () => [{ outcome: () => "expected" }] }],
        allTests: () => [{}],
      } as unknown as Suite;
      await processResults(suite, {
        webhookUrl, webhookType, debug: true, notifyOnSuccess: true,
        title: `Destination ${webhookUrl}`,
      });
      const output = JSON.stringify([
        ...jest.mocked(console.log).mock.calls,
        ...jest.mocked(console.error).mock.calls,
      ]);
      expect(output).not.toContain(webhookUrl);
      expect(output).toContain("<redacted>");
      expect(fetchMock).toHaveBeenCalledWith(webhookUrl, expect.any(Object));
      const request = fetchMock.mock.calls[0][1];
      expect(JSON.parse(request.body).attachments[0].content.body[0].items[0].text).toBe(`Destination ${webhookUrl}`);
    }
  );
});