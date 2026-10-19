import { MsTeamsReporterOptions } from ".";
import { processResults } from "./processResults";

const MSTEAMS_WEBHOOK_URL = `https://tenant.webhook.office.com/webhookb2/12345678-1234-1234-1234-123456789abc@12345678-1234-1234-1234-123456789abc/IncomingWebhook/123456789abcdef123456789abcdef12/12345678-1234-1234-1234-123456789abc`;
const FLOW_WEBHOOK_URL = `https://prod-00.westus.logic.azure.com:443/workflows/1234567890abcdef1234567890abcdef/triggers/manual/paths/invoke?api-version=2016-06-01&sp=%2Ftriggers%2Fmanual%2Frun&sv=1.0&sig=1234567890abcdef1234567890abcdef`;

const DEFAULT_OPTIONS: MsTeamsReporterOptions = {
  webhookUrl: undefined,
  webhookType: "powerautomate",
  title: "Playwright Test Results",
  linkToResultsUrl: undefined,
  linkToResultsText: "View test results",
  notifyOnSuccess: true,
  mentionOnFailure: undefined,
  mentionOnFailureText: "{mentions} please validate the test results.",
  quiet: false,
  debug: false,
  shouldRun: () => true,
};

const SUITE_MOCK_PASSED = {
  suites: [
    {
      allTests: () => [{ outcome: () => "expected" }],
    },
    {
      allTests: () => [
        { outcome: () => "expected" },
        { outcome: () => "expected" },
      ],
    },
  ],
  allTests: () => [{}, {}, {}],
};

const SUITE_MOCK_FLAKY = {
  suites: [
    {
      allTests: () => [{ outcome: () => "expected" }],
    },
    {
      allTests: () => [
        { outcome: () => "expected" },
        { outcome: () => "expected" },
      ],
    },
    {
      allTests: () => [{ outcome: () => "flaky" }],
    },
  ],
  allTests: () => [{}, {}, {}],
};

const SUITE_MOCK_FAILED = {
  suites: [
    {
      allTests: () => [{ outcome: () => "unexpected" }],
    },
    {
      allTests: () => [
        { outcome: () => "expected" },
        { outcome: () => "expected" },
      ],
    },
  ],
  allTests: () => [{}, {}, {}],
};

describe("processResults", () => {
  it("should return early if no webhook URL is provided", async () => {
    const consoleErrorSpy = jest.spyOn(console, "error").mockImplementation();
    const options = {
      ...DEFAULT_OPTIONS,
      webhookUrl: undefined,
    };
    await processResults(undefined, options);
    expect(consoleErrorSpy).toHaveBeenCalledWith("No webhook URL provided");

    consoleErrorSpy.mockReset();
  });

  it("should return early if no test suite is found", async () => {
    const consoleErrorSpy = jest.spyOn(console, "error").mockImplementation();
    const options: MsTeamsReporterOptions = {
      ...DEFAULT_OPTIONS,
      webhookUrl: MSTEAMS_WEBHOOK_URL,
      webhookType: "msteams",
    };
    await processResults(undefined, options);
    expect(consoleErrorSpy).toHaveBeenCalledWith("No test suite found");

    consoleErrorSpy.mockReset();
  });

  it("should skip notification if there are no failed tests and notifyOnSuccess is false", async () => {
    const consoleLogSpy = jest.spyOn(console, "log").mockImplementation();
    const options: MsTeamsReporterOptions = {
      ...DEFAULT_OPTIONS,
      webhookUrl: MSTEAMS_WEBHOOK_URL,
      webhookType: "msteams",
      notifyOnSuccess: false,
    };
    const suite: any = {
      suites: [],
      allTests: () => [],
    };
    await processResults(suite, options);
    expect(consoleLogSpy).toHaveBeenCalledWith(
      "No tests found, skipping report (reportOnEmpty is false)"
    );

    consoleLogSpy.mockReset();
  });

  it("should return early if shouldRun is false", async () => {
    const consoleLogSpy = jest.spyOn(console, "log").mockImplementation();

    const fetchMock = jest.fn();
    global.fetch = fetchMock;
    const options = {
      ...DEFAULT_OPTIONS,
      webhookUrl: undefined,
      shouldRun: () => false,
    };
    await processResults(undefined, options);
    expect(fetchMock).not.toHaveBeenCalled();
    expect(consoleLogSpy).not.toHaveBeenCalled();

    consoleLogSpy.mockReset();
  });

  it("should send a message successfully", async () => {
    const consoleLogSpy = jest.spyOn(console, "log").mockImplementation();
    const fetchMock = jest
      .fn()
      .mockResolvedValue({ ok: true, text: () => "1" });
    global.fetch = fetchMock;
    const options: MsTeamsReporterOptions = {
      ...DEFAULT_OPTIONS,
      webhookUrl: MSTEAMS_WEBHOOK_URL,
      webhookType: "msteams",
    };
    await processResults(SUITE_MOCK_PASSED as any, options);
    expect(fetchMock).toHaveBeenCalledWith(
      MSTEAMS_WEBHOOK_URL,
      expect.any(Object)
    );
    expect(consoleLogSpy).toHaveBeenCalledWith("Message sent successfully");

    consoleLogSpy.mockReset();
  });

  it("should send a message successfully with API outcome", async () => {
    const consoleLogSpy = jest.spyOn(console, "log").mockImplementation();
    const fetchMock = jest
      .fn()
      .mockResolvedValue({ ok: true, text: () => "Some fake message" });
    global.fetch = fetchMock;
    const options: MsTeamsReporterOptions = {
      ...DEFAULT_OPTIONS,
      webhookUrl: MSTEAMS_WEBHOOK_URL,
      webhookType: "msteams",
    };
    await processResults(SUITE_MOCK_PASSED as any, options);
    expect(consoleLogSpy).toHaveBeenCalledWith("Some fake message");

    consoleLogSpy.mockReset();
  });

  it("should log an error if sending the message fails", async () => {
    const consoleErrorSpy = jest.spyOn(console, "error").mockImplementation();
    const fetchMock = jest
      .fn()
      .mockResolvedValue({ ok: false, text: () => "Error" });
    global.fetch = fetchMock;
    const options: MsTeamsReporterOptions = {
      ...DEFAULT_OPTIONS,
      webhookUrl: MSTEAMS_WEBHOOK_URL,
      webhookType: "msteams",
    };
    await processResults(SUITE_MOCK_PASSED as any, options);
    expect(fetchMock).toHaveBeenCalledWith(
      MSTEAMS_WEBHOOK_URL,
      expect.any(Object)
    );
    expect(consoleErrorSpy).toHaveBeenCalledWith("Failed to send message");
    expect(consoleErrorSpy).toHaveBeenCalledWith("Error");

    consoleErrorSpy.mockReset();
  });

  it("should include a flaky row", async () => {
    const consoleLogSpy = jest
      .spyOn(console, "log")
      .mockImplementation((message) => {
        if (message.includes("message") && message.includes("Flaky")) {
          console.log(`Flaky`);
        }
      });
    const fetchMock = jest
      .fn()
      .mockResolvedValue({ ok: true, text: () => "1" });
    global.fetch = fetchMock;
    const options: MsTeamsReporterOptions = {
      ...DEFAULT_OPTIONS,
      webhookUrl: FLOW_WEBHOOK_URL,
      webhookType: "powerautomate",
      debug: true,
    };
    await processResults(SUITE_MOCK_FLAKY as any, options);
    expect(consoleLogSpy).toHaveBeenCalledWith("Flaky");

    consoleLogSpy.mockReset();
  });

  it("should use version 1.4 for adaptive card", async () => {
    const consoleLogSpy = jest
      .spyOn(console, "log")
      .mockImplementation((message) => {
        if (message.includes("message") && message.includes("version")) {
          const msgBody = JSON.parse(message);
          console.log(`version: ${msgBody.attachments[0].content.version}`);
        }
      });
    const fetchMock = jest
      .fn()
      .mockResolvedValue({ ok: true, text: () => "1" });
    global.fetch = fetchMock;
    const options: MsTeamsReporterOptions = {
      ...DEFAULT_OPTIONS,
      webhookUrl: FLOW_WEBHOOK_URL,
      webhookType: "powerautomate",
      debug: true,
    };
    await processResults(SUITE_MOCK_PASSED as any, options);
    expect(consoleLogSpy).toHaveBeenCalledWith("version: 1.4");

    consoleLogSpy.mockReset();
  });

  it("should include mentions", async () => {
    const fakeEmail = "fake@mail.be";
    const consoleLogSpy = jest
      .spyOn(console, "log")
      .mockImplementation((message) => {
        if (
          message.includes("message") &&
          message.includes(`<at>${fakeEmail}</at>`)
        ) {
          console.log(`<at>${fakeEmail}</at>`);
        }
      });
    const fetchMock = jest
      .fn()
      .mockResolvedValue({ ok: true, text: () => "1" });
    global.fetch = fetchMock;
    const options: MsTeamsReporterOptions = {
      ...DEFAULT_OPTIONS,
      webhookUrl: FLOW_WEBHOOK_URL,
      webhookType: "powerautomate",
      mentionOnFailure: fakeEmail,
      debug: true,
    };
    await processResults(SUITE_MOCK_FAILED as any, options);
    expect(consoleLogSpy).toHaveBeenCalledWith(`<at>${fakeEmail}</at>`);

    consoleLogSpy.mockReset();
  });

  it("should include mention message", async () => {
    const fakeEmail = "fake@mail.be";
    const fakeMessage = " validate the tests.";
    const consoleLogSpy = jest
      .spyOn(console, "log")
      .mockImplementation((message) => {
        if (
          message.includes("message") &&
          message.includes(`<at>${fakeEmail}</at>`) &&
          message.includes(fakeMessage)
        ) {
          console.log(fakeMessage);
        }
      });
    const fetchMock = jest
      .fn()
      .mockResolvedValue({ ok: true, text: () => "1" });
    global.fetch = fetchMock;
    const options: MsTeamsReporterOptions = {
      ...DEFAULT_OPTIONS,
      webhookUrl: FLOW_WEBHOOK_URL,
      webhookType: "powerautomate",
      mentionOnFailure: fakeEmail,
      mentionOnFailureText: `{mentions}${fakeMessage}`,
      debug: true,
    };
    await processResults(SUITE_MOCK_FAILED as any, options);
    expect(consoleLogSpy).toHaveBeenCalledWith(fakeMessage);

    consoleLogSpy.mockReset();
  });

  it("should include the link", async () => {
    const fakeLink = "https://github.com/estruyf/playwright-msteams-reporter";
    const consoleLogSpy = jest
      .spyOn(console, "log")
      .mockImplementation((message) => {
        if (message.includes("message") && message.includes(fakeLink)) {
          console.log(fakeLink);
        }
      });
    const fetchMock = jest
      .fn()
      .mockResolvedValue({ ok: true, text: () => "1" });
    global.fetch = fetchMock;
    const options: MsTeamsReporterOptions = {
      ...DEFAULT_OPTIONS,
      webhookUrl: FLOW_WEBHOOK_URL,
      webhookType: "powerautomate",
      linkToResultsUrl: fakeLink,
      debug: true,
    };
    await processResults(SUITE_MOCK_FAILED as any, options);
    expect(consoleLogSpy).toHaveBeenCalledWith(fakeLink);

    consoleLogSpy.mockReset();
  });

  it("should include the link from the function", async () => {
    const fakeLink = "https://github.com/estruyf/playwright-msteams-reporter";
    const consoleLogSpy = jest
      .spyOn(console, "log")
      .mockImplementation((message) => {
        if (message.includes("message") && message.includes(fakeLink)) {
          console.log(fakeLink);
        }
      });
    const fetchMock = jest
      .fn()
      .mockResolvedValue({ ok: true, text: () => "1" });
    global.fetch = fetchMock;
    const options: MsTeamsReporterOptions = {
      ...DEFAULT_OPTIONS,
      webhookUrl: FLOW_WEBHOOK_URL,
      webhookType: "powerautomate",
      linkToResultsUrl: () => fakeLink,
      debug: true,
    };
    await processResults(SUITE_MOCK_FAILED as any, options);
    expect(consoleLogSpy).toHaveBeenCalledWith(fakeLink);

    consoleLogSpy.mockReset();
  });

  it("should not include the link from the function when not a string (number)", async () => {
    const fakeLink = 123;
    const consoleLogSpy = jest
      .spyOn(console, "log")
      .mockImplementation((message) => {
        if (message.includes("message") && !message.includes(fakeLink)) {
          console.log(`Did not include ${fakeLink}`);
        }
      });
    const fetchMock = jest
      .fn()
      .mockResolvedValue({ ok: true, text: () => "1" });
    global.fetch = fetchMock;
    const options: MsTeamsReporterOptions = {
      ...DEFAULT_OPTIONS,
      webhookUrl: FLOW_WEBHOOK_URL,
      webhookType: "powerautomate",
      linkToResultsUrl: (): any => fakeLink,
      debug: true,
    };
    await processResults(SUITE_MOCK_FAILED as any, options);
    expect(consoleLogSpy).toHaveBeenCalledWith(`Did not include ${fakeLink}`);

    consoleLogSpy.mockReset();
  });

  it("should not include the link from the function when not a string (undefined)", async () => {
    const fakeLink = undefined;
    const consoleLogSpy = jest
      .spyOn(console, "log")
      .mockImplementation((message) => {
        if (message.includes("message") && !message.includes(fakeLink)) {
          console.log(`Did not include ${fakeLink}`);
        }
      });
    const fetchMock = jest
      .fn()
      .mockResolvedValue({ ok: true, text: () => "1" });
    global.fetch = fetchMock;
    const options: MsTeamsReporterOptions = {
      ...DEFAULT_OPTIONS,
      webhookUrl: FLOW_WEBHOOK_URL,
      webhookType: "powerautomate",
      linkToResultsUrl: (): any => fakeLink,
      debug: true,
    };
    await processResults(SUITE_MOCK_FAILED as any, options);
    expect(consoleLogSpy).toHaveBeenCalledWith(`Did not include ${fakeLink}`);

    consoleLogSpy.mockReset();
  });

  it("should include the failure link", async () => {
    const fakeFailureLink =
      "https://github.com/estruyf/playwright-msteams-reporter";
    const fakeFailureText = "View the failed tests";
    const consoleLogSpy = jest
      .spyOn(console, "log")
      .mockImplementation((message) => {
        if (
          message.includes("message") &&
          message.includes(fakeFailureLink) &&
          message.includes(fakeFailureText)
        ) {
          console.log(fakeFailureText);
        }
      });
    const fetchMock = jest
      .fn()
      .mockResolvedValue({ ok: true, text: () => "1" });
    global.fetch = fetchMock;
    const options: MsTeamsReporterOptions = {
      ...DEFAULT_OPTIONS,
      webhookUrl: FLOW_WEBHOOK_URL,
      webhookType: "powerautomate",
      linkUrlOnFailure: fakeFailureLink,
      linkTextOnFailure: "View the failed tests",
      debug: true,
    };
    await processResults(SUITE_MOCK_FAILED as any, options);
    expect(consoleLogSpy).toHaveBeenCalledWith(fakeFailureText);

    consoleLogSpy.mockReset();
  });

  it("should include the failure link from the function", async () => {
    const fakeFailureLink =
      "https://github.com/estruyf/playwright-msteams-reporter";
    const fakeFailureText = "View the failed tests";
    const consoleLogSpy = jest
      .spyOn(console, "log")
      .mockImplementation((message) => {
        if (
          message.includes("message") &&
          message.includes(fakeFailureLink) &&
          message.includes(fakeFailureText)
        ) {
          console.log(fakeFailureText);
        }
      });
    const fetchMock = jest
      .fn()
      .mockResolvedValue({ ok: true, text: () => "1" });
    global.fetch = fetchMock;
    const options: MsTeamsReporterOptions = {
      ...DEFAULT_OPTIONS,
      webhookUrl: FLOW_WEBHOOK_URL,
      webhookType: "powerautomate",
      linkUrlOnFailure: () => fakeFailureLink,
      linkTextOnFailure: "View the failed tests",
      debug: true,
    };
    await processResults(SUITE_MOCK_FAILED as any, options);
    expect(consoleLogSpy).toHaveBeenCalledWith(fakeFailureText);

    consoleLogSpy.mockReset();
  });

  it("should not include the failure link from the function when not a string (number)", async () => {
    const fakeFailureLink = 123;
    const fakeFailureText = "View the failed tests";
    const consoleLogSpy = jest
      .spyOn(console, "log")
      .mockImplementation((message) => {
        if (
          message.includes("message") &&
          !message.includes(fakeFailureLink) &&
          !message.includes(fakeFailureText)
        ) {
          console.log(`Did not include ${fakeFailureLink}`);
        }
      });
    const fetchMock = jest
      .fn()
      .mockResolvedValue({ ok: true, text: () => "1" });
    global.fetch = fetchMock;
    const options: MsTeamsReporterOptions = {
      ...DEFAULT_OPTIONS,
      webhookUrl: FLOW_WEBHOOK_URL,
      webhookType: "powerautomate",
      linkUrlOnFailure: (): any => fakeFailureLink,
      linkTextOnFailure: "View the failed tests",
      debug: true,
    };
    await processResults(SUITE_MOCK_FAILED as any, options);
    expect(consoleLogSpy).toHaveBeenCalledWith(
      `Did not include ${fakeFailureLink}`
    );

    consoleLogSpy.mockReset();
  });

  it("should not include the failure link from the function when not a string (undefined)", async () => {
    const fakeFailureLink = undefined;
    const fakeFailureText = "View the failed tests";
    const consoleLogSpy = jest
      .spyOn(console, "log")
      .mockImplementation((message) => {
        if (
          message.includes("message") &&
          !message.includes(fakeFailureLink) &&
          !message.includes(fakeFailureText)
        ) {
          console.log(`Did not include ${fakeFailureLink}`);
        }
      });
    const fetchMock = jest
      .fn()
      .mockResolvedValue({ ok: true, text: () => "1" });
    global.fetch = fetchMock;
    const options: MsTeamsReporterOptions = {
      ...DEFAULT_OPTIONS,
      webhookUrl: FLOW_WEBHOOK_URL,
      webhookType: "powerautomate",
      linkUrlOnFailure: (): any => fakeFailureLink,
      linkTextOnFailure: "View the failed tests",
      debug: true,
    };
    await processResults(SUITE_MOCK_FAILED as any, options);
    expect(consoleLogSpy).toHaveBeenCalledWith(
      `Did not include ${fakeFailureLink}`
    );

    consoleLogSpy.mockReset();
  });

  it("should use the default failure link text", async () => {
    const fetchMock = jest
      .fn()
      .mockResolvedValue({ ok: true, text: () => "1" });
    global.fetch = fetchMock;
    const options: MsTeamsReporterOptions = {
      ...DEFAULT_OPTIONS,
      webhookUrl: FLOW_WEBHOOK_URL,
      webhookType: "powerautomate",
      linkUrlOnFailure: "https://failure.example.com",
      quiet: true,
    };
    await processResults(SUITE_MOCK_FAILED as any, options);

    const body = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(body.attachments[0].content.actions).toEqual([
      {
        type: "Action.OpenUrl",
        title: "View failed tests",
        url: "https://failure.example.com",
      },
    ]);
  });

  it("should include the additional links", async () => {
    const fetchMock = jest
      .fn()
      .mockResolvedValue({ ok: true, text: () => "1" });
    global.fetch = fetchMock;
    const options: MsTeamsReporterOptions = {
      ...DEFAULT_OPTIONS,
      webhookUrl: FLOW_WEBHOOK_URL,
      webhookType: "powerautomate",
      linkToResultsUrl: "https://results.example.com",
      links: [
        { text: "See test run", url: "https://run.example.com" },
        { text: "See test report", url: () => "https://report.example.com" },
      ],
      quiet: true,
    };
    await processResults(SUITE_MOCK_PASSED as any, options);

    const body = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(body.attachments[0].content.actions).toEqual([
      {
        type: "Action.OpenUrl",
        title: "View test results",
        url: "https://results.example.com",
      },
      {
        type: "Action.OpenUrl",
        title: "See test run",
        url: "https://run.example.com",
      },
      {
        type: "Action.OpenUrl",
        title: "See test report",
        url: "https://report.example.com",
      },
    ]);
  });

  it("should skip additional links without text or a valid URL", async () => {
    const fetchMock = jest
      .fn()
      .mockResolvedValue({ ok: true, text: () => "1" });
    global.fetch = fetchMock;
    const options: MsTeamsReporterOptions = {
      ...DEFAULT_OPTIONS,
      webhookUrl: FLOW_WEBHOOK_URL,
      webhookType: "powerautomate",
      links: [
        { text: "", url: "https://run.example.com" },
        { text: "No URL", url: (): any => undefined },
        { text: "See test report", url: "https://report.example.com" },
      ],
      quiet: true,
    };
    await processResults(SUITE_MOCK_PASSED as any, options);

    const body = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(body.attachments[0].content.actions).toEqual([
      {
        type: "Action.OpenUrl",
        title: "See test report",
        url: "https://report.example.com",
      },
    ]);
  });

  it("should show debug message", async () => {
    const consoleLogSpy = jest.spyOn(console, "log").mockImplementation();
    const fetchMock = jest
      .fn()
      .mockResolvedValue({ ok: true, text: () => "1" });
    global.fetch = fetchMock;
    const options: MsTeamsReporterOptions = {
      ...DEFAULT_OPTIONS,
      webhookUrl: MSTEAMS_WEBHOOK_URL,
      webhookType: "msteams",
      debug: true,
    };
    await processResults(SUITE_MOCK_PASSED as any, options);
    expect(consoleLogSpy).toHaveBeenCalledWith(
      "Sending the following message:"
    );

    consoleLogSpy.mockReset();
  });

  it("should not send a report when reportOnEmpty is false and there are no tests", async () => {
    const consoleLogSpy = jest.spyOn(console, "log").mockImplementation();
    const options: MsTeamsReporterOptions = {
      ...DEFAULT_OPTIONS,
      webhookUrl: MSTEAMS_WEBHOOK_URL,
      reportOnEmpty: false,
    };
    const emptySuite = { allTests: () => [], suites: [] };
    await processResults(emptySuite as any, options);
    expect(consoleLogSpy).toHaveBeenCalledWith(
      "No tests found, skipping report (reportOnEmpty is false)"
    );
    consoleLogSpy.mockReset();
  });

  it("should send a report when reportOnEmpty is true and there are no tests", async () => {
    const fetchMock = jest
      .fn()
      .mockResolvedValue({ ok: true, text: () => "1" });
    global.fetch = fetchMock;
    const options: MsTeamsReporterOptions = {
      ...DEFAULT_OPTIONS,
      webhookUrl: MSTEAMS_WEBHOOK_URL,
      reportOnEmpty: true,
    };
    const emptySuite = { allTests: () => [], suites: [] };
    await processResults(emptySuite as any, options);
    expect(fetchMock).toHaveBeenCalled();
  });

  it("should include duration in the report when enableDuration is true", async () => {
    const fetchMock = jest
      .fn()
      .mockResolvedValue({ ok: true, text: () => "1" });
    global.fetch = fetchMock;
    const options: MsTeamsReporterOptions = {
      ...DEFAULT_OPTIONS,
      webhookUrl: MSTEAMS_WEBHOOK_URL,
      enableDuration: true,
    };
    const suite = SUITE_MOCK_PASSED as any;
    const durationMs = 125000; // 2m 5s
    await processResults(suite, options, durationMs);
    const body = fetchMock.mock.calls[0][1].body;
    expect(body).toContain("2m 5s");
  });

  it("should not include duration in the report when enableDuration is false", async () => {
    const fetchMock = jest
      .fn()
      .mockResolvedValue({ ok: true, text: () => "1" });
    global.fetch = fetchMock;
    const options: MsTeamsReporterOptions = {
      ...DEFAULT_OPTIONS,
      webhookUrl: MSTEAMS_WEBHOOK_URL,
      enableDuration: false,
    };
    const suite = SUITE_MOCK_PASSED as any;
    const durationMs = 125000; // 2m 5s
    await processResults(suite, options, durationMs);
    const body = fetchMock.mock.calls[0][1].body;
    expect(body).not.toContain("2m 5s");
  });
});
