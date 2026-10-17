import type { EnvSignalCaptureOptions, EnvSignalClassifier, NormalizedEnvSignalCaptureOptions } from "./captureTypes";

function normalizeHost(host: string): string {
  if (typeof host !== "string" || !host.trim()) throw new TypeError("Invalid environment signal capture host");
  try {
    const url = new URL(host.includes("://") ? host : `https://${host}`);
    if (!["http:", "https:"].includes(url.protocol) || url.username || url.password ||
      url.pathname !== "/" || url.search || url.hash) throw new TypeError();
    return url.hostname.toLowerCase();
  } catch {
    throw new TypeError("Invalid environment signal capture host");
  }
}

function normalizeExcludedUrl(value: string): string {
  if (typeof value !== "string" || !value.trim()) throw new TypeError("Invalid environment signal capture URL exclusion");
  try {
    const url = new URL(value);
    if (!["http:", "https:"].includes(url.protocol) || url.username || url.password) throw new TypeError();
    return `${url.origin}${url.pathname}`;
  } catch {
    throw new TypeError("Invalid environment signal capture URL exclusion");
  }
}

function normalizeInteger(name: string, value: number | undefined, fallback: number, maximum: number): number {
  const normalized = value ?? fallback;
  if (!Number.isInteger(normalized) || normalized < 1 || normalized > maximum) {
    throw new RangeError(`Invalid environment signal capture ${name}`);
  }
  return normalized;
}

export function normalizeCaptureOptions(
  options: EnvSignalCaptureOptions,
  defaultHost?: string
): NormalizedEnvSignalCaptureOptions {
  if (!options || typeof options !== "object" || Array.isArray(options)) {
    throw new TypeError("Invalid environment signal capture options");
  }
  const annotationPrefix = options.annotationPrefix ?? "env-signal:";
  if (typeof annotationPrefix !== "string" || !/^[A-Za-z0-9][A-Za-z0-9._:-]{0,99}$/.test(annotationPrefix)) {
    throw new TypeError("Invalid environment signal capture annotation prefix");
  }
  const includeHosts = options.includeHosts === undefined
    ? (defaultHost ? [normalizeHost(defaultHost)] : [])
    : options.includeHosts.map(normalizeHost);
  const excludeHosts = (options.excludeHosts ?? []).map(normalizeHost);
  const excludeUrls = (options.excludeUrls ?? []).map(normalizeExcludedUrl);
  const ignoredHttpStatuses = [...(options.ignoredHttpStatuses ?? [401, 403])];
  if (ignoredHttpStatuses.some(status => !Number.isInteger(status) || status < 100 || status > 599)) {
    throw new RangeError("Invalid environment signal capture HTTP status");
  }
  const classifiers = [...(options.classifiers ?? [])];
  if (classifiers.some(classifier => typeof classifier !== "function")) {
    throw new TypeError("Invalid environment signal capture classifier");
  }
  if (options.sanitizeText !== undefined && typeof options.sanitizeText !== "function") {
    throw new TypeError("Invalid environment signal capture sanitizer");
  }
  if (options.retainOnPass !== undefined && typeof options.retainOnPass !== "boolean") {
    throw new TypeError("Invalid environment signal capture retention option");
  }

  return {
    annotationPrefix,
    includeHosts,
    excludeHosts,
    excludeUrls,
    ignoredHttpStatuses,
    maxEvents: normalizeInteger("event limit", options.maxEvents, 20, 200),
    maxEventsPerKind: normalizeInteger("per-kind event limit", options.maxEventsPerKind, 5, 200),
    maxDescriptionLength: normalizeInteger("description limit", options.maxDescriptionLength, 300, 2000),
    retainOnPass: options.retainOnPass ?? false,
    classifiers: classifiers as EnvSignalClassifier[],
    sanitizeText: options.sanitizeText,
  };
}