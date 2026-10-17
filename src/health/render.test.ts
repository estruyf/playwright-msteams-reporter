import type { Suite } from "@playwright/test/reporter";
import { aggregateHealth, compileCategories } from "./aggregate";
import { buildHealthMessage, sanitizeHealthText } from "./render";

describe("health card rendering", () => {
  it("sanitizes secrets, URL credentials and signed queries before truncating", () => {
    const text = sanitizeHealthText(
      "Bearer opaque-secret https://user:password@acme.example/file?sig=secret#token eyJabc.def.ghi",
      500
    );
    expect(text).not.toContain("opaque-secret");
    expect(text).not.toContain("password");
    expect(text).not.toContain("sig=");
    expect(text).not.toContain("#token");
    expect(text).not.toContain("eyJabc.def.ghi");
    expect(text).toContain("https://acme.example/file");
  });

  it("redacts complete Basic and Digest authorization credentials", () => {
    for (const scheme of ["Basic", "Digest", "Bearer"]) {
      expect(sanitizeHealthText(`Authorization: ${scheme} synthetic-credential`))
        .not.toContain("synthetic-credential");
    }
    expect(sanitizeHealthText('Received: "{\\"access_token\\":\\"synthetic-token\\"}"'))
      .not.toContain("synthetic-token");
    expect(sanitizeHealthText('Received: "{\\"password\\":\\"correct horse battery\\"}"'))
      .not.toContain("correct horse battery");
    expect(sanitizeHealthText('Digest username="alice", realm="example", response="digest-secret"')).not.toContain("digest-secret");
  });

  it("redacts credentials even when ANSI styling splits the key or value", () => {
    expect(sanitizeHealthText('password:\u001b[32m"alpha beta"\u001b[39m')).not.toContain("alpha beta");
    expect(sanitizeHealthText('pass\u001b[32mword: "alpha beta"')).not.toContain("alpha beta");
    expect(sanitizeHealthText("password: `alpha beta`")).not.toContain("alpha beta");
  });

  it("redacts credentials from non-HTTP schemes and webhook paths but preserves ordinary text", () => {
    const sanitized = sanitizeHealthText([
      "amqp://user:synthetic-secret@broker.acme.example:5672",
      "amqp://user:synthetic-secret@localhost:5672",
      "wss://user:synthetic-secret@socket.acme.example/?token=synthetic-token",
      "https://tenant.webhook.office.com/webhookb2/tenant/IncomingWebhook/private-token/id",
      "Response: 500; file.csv: value",
    ].join(" "));
    expect(sanitized).not.toContain("synthetic-secret");
    expect(sanitized).not.toContain("synthetic-token");
    expect(sanitized).not.toContain("private-token");
    expect(sanitized).toContain("Response: 500");
    expect(sanitized).toContain("file.csv: value");
  });

  it("redacts quoted and escaped credentials without consuming neighboring fields", () => {
    const sanitized = sanitizeHealthText(
      String.raw`{"password":"correct horse battery","client_secret":"synthetic-secret","x-api-key":"key-value","Cookie":"session=private"}`
    );
    expect(sanitized).not.toContain("correct horse battery");
    expect(sanitized).not.toContain("synthetic-secret");
    expect(sanitized).not.toContain("key-value");
    expect(sanitized).not.toContain("session=private");
    expect(sanitizeHealthText("Cookie: theme=light; session=private")).not.toContain("session=private");
    expect(sanitizeHealthText("DB_PASSWORD=private")).not.toContain("DB_PASSWORD=private");
    expect(sanitizeHealthText("DB_PASSWORD=alpha,SECRET-SUFFIX")).not.toContain("SECRET-SUFFIX");
    const cookieArray = sanitizeHealthText(String.raw`{"set-cookie":["first-session","second-session"],"other":"visible"}`);
    expect(cookieArray).not.toContain("second-session");
    expect(cookieArray).toContain("visible");
    const multilineCookies = sanitizeHealthText(JSON.stringify({ "set-cookie": ["session=private", "auth=private"] }, null, 2));
    expect(multilineCookies).not.toContain("session=private");
    expect(multilineCookies).not.toContain("auth=private");
    const singleQuotedCookies = sanitizeHealthText(String.raw`{ 'set-cookie': [ 'session=first]PRIVATE', 'session=SECOND_SECRET' ] }`);
    expect(singleQuotedCookies).not.toContain("PRIVATE");
    expect(singleQuotedCookies).not.toContain("SECOND_SECRET");
    const escapedSingleQuote = sanitizeHealthText(String.raw`{ 'set-cookie': [ 'session=first\']PRIVATE', 'session=SECOND_SECRET' ] }`);
    expect(escapedSingleQuote).not.toContain("PRIVATE");
    expect(escapedSingleQuote).not.toContain("SECOND_SECRET");
    const backtickCookies = sanitizeHealthText("{ 'set-cookie': [ `session=first]PRIVATE`, `session=SECOND_SECRET` ] }");
    expect(backtickCookies).not.toContain("PRIVATE");
    expect(backtickCookies).not.toContain("SECOND_SECRET");
    expect(sanitizeHealthText("Response: 500; file.csv: value")).toContain("Response: 500; file.csv: value");
  });

  it("redacts escaped quotes in secrets and home paths across platforms", () => {
    const sanitized = sanitizeHealthText(String.raw`{"password":"part1\"part2","url":"amqp://user:secret@broker.acme.example"} C:\Users\alice\work /Users/bob/work /home/carol/work C:/Users/dave/work`);
    expect(sanitized).not.toContain("part2");
    expect(sanitized).not.toContain("secret");
    expect(sanitized).not.toContain("alice");
    expect(sanitized).not.toContain("bob");
    expect(sanitized).not.toContain("carol");
    expect(sanitized).not.toContain("dave");
    expect(sanitizeHealthText(String.raw`C:\Users\Alice Smith\work`)).not.toContain("Alice Smith");
  });

  it("redacts escaped JSON values with delimiters and preserves neighboring secret fields", () => {
    const sanitized = sanitizeHealthText(String.raw`{"password":"part1,part2","client_secret":"secret2","other":"visible"}`);
    expect(sanitized).not.toContain("part1");
    expect(sanitized).not.toContain("part2");
    expect(sanitized).not.toContain("secret2");
    expect(sanitized).toContain("visible");
    expect(sanitizeHealthText(String.raw`{"Authorization":"Bearer secret1","password":"secret2"}`)).not.toContain("secret2");
    const wrapped = sanitizeHealthText('Received: "{\\"password\\":\\"secret\\",\\"other\\":\\"visible\\"}"');
    expect(wrapped).not.toContain("secret");
    expect(wrapped).toContain("visible");
    expect(sanitizeHealthText(String.raw`{"password":"part1\" part2","client_secret":"secret2"}`)).not.toContain("part2");
    expect(sanitizeHealthText(String.raw`{"password":"part1\"} part2","client_secret":"secret2"}`)).not.toContain("part2");
    const trailingSlash = sanitizeHealthText(String.raw`{"password":"ends\\","other":"visible"}`);
    expect(trailingSlash).not.toContain("ends");
    expect(trailingSlash).toContain("visible");
    expect(sanitizeHealthText(String.raw`Received: "{\"password\":\"part1\\\"} part2\",\"client_secret\":\"secret2\"}"`)).not.toContain("part2");
    expect(sanitizeHealthText(String.raw`{"password":"part1\\","other":"visible"}`)).toContain("visible");
    const nested = JSON.stringify(JSON.stringify({ password: 'part1"} part2', client_secret: "secret2", other: "visible" }));
    expect(sanitizeHealthText(nested)).not.toContain("part2");
    expect(sanitizeHealthText(nested)).not.toContain("secret2");
    expect(sanitizeHealthText(nested)).toContain("visible");
    const reviewRepro = JSON.stringify(JSON.stringify({ password: 'part1"},part2', other: "visible" }));
    expect(sanitizeHealthText(reviewRepro)).not.toContain("part2");
    expect(sanitizeHealthText(reviewRepro)).toContain("visible");
    const tripleEncoded = JSON.stringify(JSON.stringify(JSON.stringify({ password: "triple-secret", other: "visible" })));
    expect(sanitizeHealthText(tripleEncoded)).not.toContain("triple-secret");
  });

  it("sanitizes final signal kinds on non-recovered flaky tests", () => {
    const summary = aggregateHealth({ allTests: () => [{
      id: "flaky-final-sensitive-signal", titlePath: () => ["flaky-final-sensitive-signal"], outcome: () => "flaky", expectedStatus: "passed",
      results: [
        { status: "passed", annotations: [], errors: [] },
        { status: "failed", annotations: [
          { type: "env-signal:token=private" },
          { type: "env-signal:untrusted-kind" },
        ], errors: [] },
      ],
    }] } as unknown as Suite, compileCategories());
    const message = buildHealthMessage(summary, {
      sanitizeText: text => text.replace("untrusted-kind", "sanitized-kind"),
    }, { status: "failed", duration: 0, errors: [] });

    expect(message).not.toContain("token=private");
    expect(message).toContain("token: <redacted");
    expect(message).not.toContain("untrusted-kind");
    expect(message).toContain("sanitized-kind");
  });

  it("drops the optional results action before rejecting a minimum-budget summary", () => {
    const summary = {
      outcomes: { expected: 1, unexpected: 0, flaky: 1, skipped: 0 },
      assessments: { environment: 0, regression: 0, mixed: 0, undetermined: 0 },
      categories: [], noise: [], failures: [], unavailable: 1,
      passedWithSignals: 1, recoveredWithSignals: 1, flakyWithFinalSignals: 0,
      flakyFinalKinds: [], previousAttemptsWithSignals: 1,
    } as ReturnType<typeof aggregateHealth>;
    const message = buildHealthMessage(summary, {
      title: "😀".repeat(500),
      maxPayloadBytes: 4096,
      linkToResultsUrl: `https://a.co/${"x".repeat(1987)}`,
      linkToResultsText: "😀".repeat(100),
    }, { status: "passed", duration: 0, errors: [] });
    const card = JSON.parse(message).attachments[0].content;
    expect(Buffer.byteLength(message, "utf8")).toBeLessThanOrEqual(4096);
    expect(card.actions).toEqual([]);
    expect(card.body.some((entry: { text: string }) => entry.text.includes("Final signal evidence unavailable"))).toBe(true);
    expect(card.body.some((entry: { text: string }) => entry.text.includes("Recovered flaky tests"))).toBe(true);
  });

  it("enforces the envelope byte limit when runner errors fill the detail section", () => {
    const summary = aggregateHealth({ allTests: () => [] } as unknown as Suite, compileCategories());
    const body = buildHealthMessage(summary, { maxPayloadBytes: 4096 }, {
      status: "failed", duration: 0, errors: Array.from({ length: 20 }, (_, index) => `Runner error ${index}: ${"x".repeat(300)}`),
    });
    expect(Buffer.byteLength(body, "utf8")).toBeLessThanOrEqual(4096);
    expect(body).toContain("omitted");
  });

  it("sanitizes the entire assertion before extracting expected/received lines", () => {
    const suite = { allTests: () => [{
      id: "multiline", titlePath: () => ["multiline"], outcome: () => "unexpected",
      results: [{ status: "failed", annotations: [], errors: [{ message:
        `Expected: PRIVATE[${"x".repeat(200)}\n${"y".repeat(200)}]\nReceived: public` }] }],
    }] } as unknown as Suite;
    const summary = aggregateHealth(suite, compileCategories());
    const body = buildHealthMessage(summary, {
      sanitizeText: text => text.replace(/PRIVATE\[[\s\S]*?\]/g, "[redacted]"),
    }, { status: "failed", duration: 0, errors: [] });
    expect(body).not.toContain("PRIVATE[");
    expect(body).not.toContain("x".repeat(20));
    const entries = JSON.parse(body).attachments[0].content.body;
    expect(entries.find((entry: { text: string }) => entry.text.startsWith("Expected:")).text).toContain("redacted");
  });

  it("runs the custom sanitizer before clipping and applies it to action labels", () => {
    const sanitizer = (text: string) => text.replace(/PRIVATE\[[\s\S]*?\]/g, "[redacted]");
    const suite = { allTests: () => [{
      id: "test", titlePath: () => ["PRIVATE[" + "x".repeat(400) + "]"], outcome: () => "unexpected",
      results: [{ status: "failed", annotations: [], errors: [] }],
    }] } as unknown as Suite;
    const summary = aggregateHealth(suite, compileCategories());
    const body = buildHealthMessage(summary, {
      sanitizeText: sanitizer,
      linkToResultsText: "PRIVATE[action-label]",
      linkToResultsUrl: "https://reports.acme.example/run",
    }, { status: "failed", duration: 0, errors: [] });
    expect(body).not.toContain("PRIVATE[");
    const card = JSON.parse(body).attachments[0].content;
    expect(card.body[3].text).toBe("\\[redacted\\]");
    expect(card.actions[0].title).toBe("\\[redacted\\]");
  });

  it("escapes Markdown markers in test-controlled text", () => {
    const suite = { allTests: () => [{
      id: "markdown", titlePath: () => ["[click](https://evil.acme.example) **bold**"], outcome: () => "unexpected",
      results: [{ status: "failed", annotations: [], errors: [{ message: "Expected string: [click](https://evil.acme.example)" }] }],
    }] } as unknown as Suite;
    const summary = aggregateHealth(suite, compileCategories());
    const body = buildHealthMessage(summary, {}, { status: "failed", duration: 0, errors: [] });
    expect(body).not.toContain("[click](");
    expect(body).not.toContain("**bold**");
  });

  it("redacts credentials in webhook URLs embedded in paths", () => {
    const suite = { allTests: () => [{
      id: "webhook", titlePath: () => ["webhook"], outcome: () => "unexpected",
      results: [{ status: "failed", annotations: [], errors: [{ message:
        "Error posting https://tenant.webhook.office.com/webhookb2/tenant/IncomingWebhook/private-token/id" }] }],
    }] } as unknown as Suite, summary = aggregateHealth(suite, compileCategories());
    const body = buildHealthMessage(summary, {}, { status: "failed", duration: 0, errors: [] });
    expect(body).not.toContain("private-token");
  });

  it("renders previous-attempt evidence for a failed test with an interrupted final attempt", () => {
    const suite = { allTests: () => [{
      id: "interrupted", titlePath: () => ["interrupted"], outcome: () => "unexpected",
      results: [
        { status: "failed", annotations: [{ type: "env-signal:http-5xx" }], errors: [{ message: "HTTP 503" }] },
        { status: "interrupted", annotations: [], errors: [] },
      ],
    }] } as unknown as Suite;
    const summary = aggregateHealth(suite, compileCategories());
    const body = buildHealthMessage(summary, {}, { status: "interrupted", duration: 0, errors: [] });
    expect(summary.assessments.undetermined).toBe(1);
    expect(body).toContain("superseded-attempt signals: 1");
    expect(body).not.toContain("environment-suspect: 1");
  });

  it("reports generic timeout evidence as undetermined in the default taxonomy", () => {
    const suite = { allTests: () => [{
      id: "timeout", titlePath: () => ["timeout"], outcome: () => "unexpected",
      results: [{ status: "timedOut", annotations: [{ type: "env-signal:test-timeout" }], errors: [] }],
    }] } as unknown as Suite;
    const summary = aggregateHealth(suite, compileCategories());
    const body = buildHealthMessage(summary, {}, { status: "timedout", duration: 0, errors: [] });
    expect(summary.assessments.undetermined).toBe(1);
    expect(body).toContain("1 Cause undetermined / developer review");
  });

  it("renders assertion text as one wrapped ordinary entry and leaves summaries intact", () => {
    const suite = { allTests: () => [{
      id: "test", titlePath: () => ["ACME", "example"], outcome: () => "unexpected",
      results: [{ status: "failed", annotations: [], errors: [{ message: 'Error: mismatch\nExpected: "hello"\nReceived: "world"' }] }],
    }] } as unknown as Suite;
    const summary = aggregateHealth(suite, compileCategories());
    const envelope = JSON.parse(buildHealthMessage(summary, {}, { status: "failed", duration: 1200, errors: [] }));
    const card = envelope.attachments[0].content;
    expect(card.version).toBe("1.4");
    const errorEntry = card.body.find((entry: { text?: string }) => entry.text?.startsWith("Error:"));
    expect(errorEntry).toEqual(expect.objectContaining({ type: "TextBlock", wrap: true }));
    expect(errorEntry.text).toContain("Expected:");
    expect(errorEntry.text).toContain("Received:");
    expect(errorEntry.fontType).toBeUndefined();
    expect(summary.assessments.undetermined).toBe(1);
    expect(JSON.stringify(card)).toContain("Cause undetermined");
  });

  it("renders Playwright value-only thrown errors", () => {
    const suite = { allTests: () => [{
      id: "value-error", titlePath: () => ["value-error"], outcome: () => "unexpected",
      results: [{ status: "failed", annotations: [], errors: [{ value: "backend unavailable" }] }],
    }] } as unknown as Suite;
    const summary = aggregateHealth(suite, compileCategories());
    const message = buildHealthMessage(summary, {}, { status: "failed", duration: 0, errors: [] });
    expect(message).toContain("backend unavailable");
  });

  it("enforces full-envelope UTF-8 limits and deterministically reports omitted details", () => {
    const suite = { allTests: () => Array.from({ length: 120 }, (_, index) => ({
      id: String(index), titlePath: () => ["\u00e9".repeat(200)], outcome: () => "unexpected",
      results: [{ status: "failed", annotations: [{ type: `env-signal:custom-${index}` }], errors: [] }],
    })) } as unknown as Suite;
    const summary = aggregateHealth(suite, compileCategories());
    const context = { status: "failed" as const, duration: 1000, errors: [] };
    const body = buildHealthMessage(summary, { maxPayloadBytes: 4096 }, context);
    expect(Buffer.byteLength(body, "utf8")).toBeLessThanOrEqual(4096);
    expect(body).toContain("omitted");
    expect(body).toContain("120 failed");
    expect(buildHealthMessage(summary, { maxPayloadBytes: 4096 }, context)).toBe(body);
    expect(summary.outcomes.unexpected).toBe(120);
  });

  it("redacts configured destinations and strips signed results links by default", () => {
    const summary = aggregateHealth({ allTests: () => [] } as unknown as Suite, compileCategories());
    const webhookUrl = "https://acme.example/webhook?sig=secret";
    const body = buildHealthMessage(summary, {
      title: webhookUrl, linkToResultsUrl: "https://reports.acme.example/index.html?sig=private#fragment",
    }, { status: "failed", duration: 0, errors: [webhookUrl] }, webhookUrl);
    expect(body).not.toContain("sig=");
    expect(body).not.toContain("fragment");
    expect(JSON.parse(body).attachments[0].content.actions[0].url).toBe("https://reports.acme.example/index.html");
  });

  it("rejects results links that canonicalize to the configured webhook", () => {
    const summary = aggregateHealth({ allTests: () => [] } as unknown as Suite, compileCategories());
    const webhookUrl = "https://tenant.webhook.office.com:443/webhookb2/tenant/IncomingWebhook/private-token/id";
    const resultUrl = "https://TENANT.webhook.office.com/webhookb2/tenant/IncomingWebhook/private-token/id";
    const card = JSON.parse(buildHealthMessage(summary, { linkToResultsUrl: resultUrl }, {
      status: "failed", duration: 0, errors: [],
    }, webhookUrl)).attachments[0].content;
    expect(card.actions).toEqual([]);
  });
});