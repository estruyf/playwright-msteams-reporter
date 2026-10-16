import MsTeamsReporter from ".";
import type { FullConfig, FullResult, Suite } from "@playwright/test/reporter";

describe("webhook environment configuration", () => {
  const originalEnvironment = {
    MSTEAMS_WEBHOOK_URL: process.env.MSTEAMS_WEBHOOK_URL,
    ACME_TEAMS_WEBHOOK: process.env.ACME_TEAMS_WEBHOOK,
  };
  const originalFetch = global.fetch;
  const defaultUrl = "https://acme.example/webhook?sig=default-secret";
  const customUrl = "https://acme.example/webhook?sig=custom-secret";
  const suite = {
    suites: [{ allTests: () => [{ outcome: () => "expected" }] }],
    allTests: () => [{}],
  } as unknown as Suite;

  beforeEach(() => {
    delete process.env.MSTEAMS_WEBHOOK_URL;
    delete process.env.ACME_TEAMS_WEBHOOK;
    jest.spyOn(console, "log").mockImplementation();
    jest.spyOn(console, "error").mockImplementation();
    global.fetch = jest.fn().mockResolvedValue({ ok: true, text: async () => "1" });
  });

  afterEach(() => {
    for (const [name, value] of Object.entries(originalEnvironment)) {
      if (value === undefined) delete process.env[name];
      else process.env[name] = value;
    }
    global.fetch = originalFetch;
    jest.restoreAllMocks();
  });

  it.each(["msteams", "powerautomate"] as const)("resolves the default variable for %s without mutating config", async (webhookType) => {
    process.env.MSTEAMS_WEBHOOK_URL = defaultUrl;
    const options = Object.freeze({ webhookType, debug: true, webhookUrl: undefined });
    const config = Object.freeze({ reporter: [["playwright-msteams-reporter", options]] });
    const before = JSON.stringify(config);
    const reporter = new MsTeamsReporter(options);
    reporter.onBegin(config as unknown as FullConfig, suite);
    await reporter.onEnd({} as FullResult);
    expect(global.fetch).toHaveBeenCalledWith(defaultUrl, expect.any(Object));
    expect(JSON.stringify(config)).toBe(before);
    expect(JSON.stringify(config)).not.toContain(defaultUrl);
    expect(JSON.stringify(jest.mocked(console.log).mock.calls)).not.toContain(defaultUrl);
  });

  it("uses a custom variable instead of the default", async () => {
    process.env.MSTEAMS_WEBHOOK_URL = defaultUrl;
    process.env.ACME_TEAMS_WEBHOOK = customUrl;
    const options = { webhookUrl: undefined, webhookUrlEnv: "ACME_TEAMS_WEBHOOK" };
    const reporter = new MsTeamsReporter(options);
    reporter.onBegin({} as FullConfig, suite);
    await reporter.onEnd({} as FullResult);
    expect(global.fetch).toHaveBeenCalledWith(customUrl, expect.any(Object));
  });

  it("gives an explicit URL precedence over either environment variable", async () => {
    process.env.MSTEAMS_WEBHOOK_URL = defaultUrl;
    process.env.ACME_TEAMS_WEBHOOK = customUrl;
    const options = { webhookUrl: "https://acme.example/explicit", webhookUrlEnv: "ACME_TEAMS_WEBHOOK" };
    const reporter = new MsTeamsReporter(options);
    reporter.onBegin({} as FullConfig, suite);
    await reporter.onEnd({} as FullResult);
    expect(global.fetch).toHaveBeenCalledWith(options.webhookUrl, expect.any(Object));
  });

  it.each([undefined, "ACME_TEAMS_WEBHOOK"])("an empty explicit URL disables environment fallback (%s)", async (webhookUrlEnv) => {
    process.env.MSTEAMS_WEBHOOK_URL = defaultUrl;
    process.env.ACME_TEAMS_WEBHOOK = customUrl;
    const options = { webhookUrl: "", webhookUrlEnv };
    const reporter = new MsTeamsReporter(options);
    reporter.onBegin({} as FullConfig, suite);
    await reporter.onEnd({} as FullResult);
    expect(global.fetch).not.toHaveBeenCalled();
    expect(console.error).toHaveBeenCalledWith("No webhook URL provided");
  });

  it.each([undefined, "", "ACME_TEAMS_WEBHOOK"])("does not send with a missing or empty destination (%s)", async (value) => {
    if (value === "") process.env.MSTEAMS_WEBHOOK_URL = "";
    if (value === "ACME_TEAMS_WEBHOOK") process.env.MSTEAMS_WEBHOOK_URL = defaultUrl;
    const options = { webhookUrl: undefined, webhookUrlEnv: value === "ACME_TEAMS_WEBHOOK" ? value : undefined };
    const reporter = new MsTeamsReporter(options);
    reporter.onBegin({} as FullConfig, suite);
    await reporter.onEnd({} as FullResult);
    expect(global.fetch).not.toHaveBeenCalled();
    expect(console.error).toHaveBeenCalledWith("No webhook URL provided");
  });

  it.each(["", "WITH SPACE", "KEY=VALUE", "1KEY", "https://acme.example/?sig=secret"])("rejects invalid environment variable names without echoing them: %s", (webhookUrlEnv) => {
    const options = { webhookUrl: undefined, webhookUrlEnv };
    expect(() => new MsTeamsReporter(options)).toThrow(/^webhookUrlEnv must be a valid environment variable name$/);
    expect(console.log).not.toHaveBeenCalled();
  });

  it.each(["toString", "hasOwnProperty", "__proto__"])("does not resolve inherited environment properties: %s", async (webhookUrlEnv) => {
    const reporter = new MsTeamsReporter({ webhookUrlEnv });
    reporter.onBegin({} as FullConfig, suite);
    await reporter.onEnd({} as FullResult);
    expect(global.fetch).not.toHaveBeenCalled();
    expect(console.error).toHaveBeenCalledWith("No webhook URL provided");
  });

  it("validates variable names even when the explicit URL wins", () => {
    expect(() => new MsTeamsReporter({ webhookUrl: defaultUrl, webhookUrlEnv: "INVALID NAME" }))
      .toThrow(/^webhookUrlEnv must be a valid environment variable name$/);
  });

  it("resolves the destination only at construction", async () => {
    process.env.MSTEAMS_WEBHOOK_URL = defaultUrl;
    const reporter = new MsTeamsReporter();
    process.env.MSTEAMS_WEBHOOK_URL = customUrl;
    reporter.onBegin({} as FullConfig, suite);
    await reporter.onEnd({} as FullResult);
    expect(global.fetch).toHaveBeenCalledWith(defaultUrl, expect.any(Object));
  });
});