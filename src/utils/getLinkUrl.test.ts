import { getLinkUrl } from "./getLinkUrl";

describe("getLinkUrl", () => {
  const fakeLink = "https://github.com/estruyf/playwright-msteams-reporter";

  it("should return the URL when a string is provided", () => {
    expect(getLinkUrl(fakeLink)).toBe(fakeLink);
  });

  it("should return the URL from the function", () => {
    expect(getLinkUrl(() => fakeLink)).toBe(fakeLink);
  });

  it("should return undefined when no URL is provided", () => {
    expect(getLinkUrl(undefined)).toBeUndefined();
  });

  it("should return undefined when the function does not return a string", () => {
    expect(getLinkUrl((): any => 123)).toBeUndefined();
    expect(getLinkUrl((): any => undefined)).toBeUndefined();
  });

  it("should return undefined when the function returns an empty string", () => {
    expect(getLinkUrl(() => "")).toBeUndefined();
  });
});
