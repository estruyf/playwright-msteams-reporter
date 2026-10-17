import { normalizeCaptureOptions } from "./captureOptions";

describe("environment signal capture options", () => {
  it("uses conservative defaults scoped to the initial page host", () => {
    expect(normalizeCaptureOptions({}, "app.acme.example")).toEqual({
      annotationPrefix: "env-signal:",
      includeHosts: ["app.acme.example"],
      excludeHosts: [],
      excludeUrls: [],
      ignoredHttpStatuses: [401, 403],
      maxEvents: 20,
      maxEventsPerKind: 5,
      maxDescriptionLength: 300,
      retainOnPass: false,
      classifiers: [],
      sanitizeText: undefined,
    });
  });

  it("normalizes independent host filters and copies mutable options", () => {
    const includeHosts = ["API.ACME.EXAMPLE"];
    const ignoredHttpStatuses = [404, 429];
    const options = { includeHosts, ignoredHttpStatuses };
    const first = normalizeCaptureOptions(options, "app.acme.example");
    const second = normalizeCaptureOptions({}, "other.acme.example");
    includeHosts.push("third-party.example");
    ignoredHttpStatuses.push(500);

    expect(first.includeHosts).toEqual(["api.acme.example"]);
    expect(first.ignoredHttpStatuses).toEqual([404, 429]);
    expect(second.includeHosts).toEqual(["other.acme.example"]);
  });

  it.each([
    { maxEvents: 0 },
    { maxEvents: 1.5 },
    { maxEventsPerKind: 201 },
    { maxDescriptionLength: 0 },
    { annotationPrefix: "" },
    { annotationPrefix: "token=private:" },
    { includeHosts: ["https://bad host/"] },
    { includeHosts: "app.acme.example" },
    { excludeUrls: ["https://bad host/path"] },
    { ignoredHttpStatuses: [99] },
    { classifiers: ["not a classifier"] },
    { sanitizeText: "not a sanitizer" },
  ])("rejects invalid configuration %#", options => {
    expect(() => normalizeCaptureOptions(options as never, "app.acme.example")).toThrow();
  });

  it("rejects a malformed fallback host without echoing it", () => {
    expect(() => normalizeCaptureOptions({}, "not a host/path")).toThrow();
  });
});