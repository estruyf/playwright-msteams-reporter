import type { Suite } from "@playwright/test/reporter";
import type { MsTeamsReporterOptions } from ".";
import { processResults } from "./processResults";

describe("result link callback receivers", () => {
  const originalFetch = global.fetch;

  afterEach(() => {
    global.fetch = originalFetch;
    jest.restoreAllMocks();
  });

  it.each(["expected", "unexpected"])("preserves the options receiver and action order for %s outcomes", async (outcome) => {
    jest.spyOn(console, "log").mockImplementation();
    const fetchMock = jest.fn().mockResolvedValue({ ok: true, text: async () => "1" });
    global.fetch = fetchMock;
    const receivers: MsTeamsReporterOptions[] = [];
    const options: MsTeamsReporterOptions = {
      webhookUrl: "https://acme.example/webhook",
      notifyOnSuccess: true,
      linkToResultsText: "results",
      linkTextOnFailure: "failure",
      linkToResultsUrl() {
        receivers.push(this);
        return `https://acme.example/${this.linkToResultsText}`;
      },
      linkUrlOnFailure() {
        receivers.push(this);
        return `https://acme.example/${this.linkTextOnFailure}`;
      },
    };
    const suite = {
      allTests: () => [{}],
      suites: [{ allTests: () => [{ outcome: () => outcome }] }],
    } as unknown as Suite;

    await processResults(suite, options);

    expect(receivers).toHaveLength(outcome === "unexpected" ? 2 : 1);
    for (const receiver of receivers) expect(receiver).toBe(options);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const actions = JSON.parse(fetchMock.mock.calls[0][1].body).attachments[0].content.actions;
    expect(actions).toEqual([
      { type: "Action.OpenUrl", title: "results", url: "https://acme.example/results" },
      ...(outcome === "unexpected"
        ? [{ type: "Action.OpenUrl", title: "failure", url: "https://acme.example/failure" }]
        : []),
    ]);
  });
});