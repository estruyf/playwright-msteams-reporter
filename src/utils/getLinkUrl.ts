export const getLinkUrl = (
  url: string | (() => string) | undefined
): string | undefined => {
  if (!url) {
    return;
  }

  const linkUrl = typeof url === "string" ? url : url();
  if (linkUrl && typeof linkUrl === "string") {
    return linkUrl;
  }

  return;
};
