import type { TestCase } from "@playwright/test/reporter";
import type { HealthSummary } from "./aggregate";
import { redactWebhookUrl } from "../utils/redactWebhookUrl";

export interface HealthDisplayOptions {
  title?: string;
  environment?: string;
  maxTests?: number;
  maxPayloadBytes?: number;
  testLabel?: (test: TestCase) => string;
  sanitizeText?: (text: string) => string;
  linkToResultsUrl?: string | (() => string);
  linkToResultsText?: string;
  resultsLinkPolicy?: "strip-query" | "preserve";
}

export interface HealthRunContext {
  status: "passed" | "failed" | "timedout" | "interrupted";
  duration: number;
  errors: string[];
  errorsOmitted?: number;
  errorsSanitized?: boolean;
}

interface TextEntry {
  type: "TextBlock";
  text: string;
  wrap: true;
  weight?: "Bolder";
  fontType?: "Monospace";
}

const sensitiveFields = [
  "ocp-apim-subscription-key", "x-functions-key", "x-api-key", "client_secret", "client-secret",
  "db_password", "db-password", "access_token", "refresh_token", "id_token", "set-cookie",
  "sharedaccesskey", "accountkey", "authorization", "signature", "password", "passwd", "secret",
  "cookie", "api-key", "api_key", "token", "pwd", "sig", "sv", "se", "sp", "sr", "skoid", "sktid", "skt", "ske", "sks", "skv",
];
const sensitiveFieldStart = new RegExp(String.raw`(^|[^\w-])((?:\\)*)(["'\x60]?)(${sensitiveFields.join("|")})((?:\\)*)\3((?:\\)*)\s*[:=]\s*((?:\\)*)(["'\x60])?`, "gi");
const homePathPattern = /\b[A-Z]:(?:[\\/]+)Users[\\/]+[^\\/"'\r\n]+|\/(?:Users|home)\/[^/"'\r\n]+/gi;
const markdownCharacters = new Set(["\\", "`", "*", "_", "{", "}", "[", "]", "(", ")", "#", "+", "!", "|", ">"]);

function sanitizeUrl(value: string): string {
  let candidate = value;
  while (candidate.endsWith("\\")) candidate = candidate.slice(0, -1);
  try {
    const url = new URL(candidate);
    if (/\/(?:webhookb2|incomingwebhook)\//i.test(url.pathname)) return `${url.origin}/<redacted-webhook-path>`;
    url.username = "";
    url.password = "";
    url.search = "";
    url.hash = "";
    url.pathname = url.pathname.replace(/;(?:SharedAccessSignature|sig|signature|token|sv|se|sp|sr)=[^/]*$/i, "");
    return url.href;
  } catch {
    return "<redacted-url>";
  }
}

function endsEscapedJsonValue(value: string, quoteIndex: number): boolean {
  const following = value.slice(quoteIndex + 1).trimStart();
  return /^,\s*(?:\\)?["'][^"'\r\n]+(?:\\)?["']\s*:/.test(following) ||
    /^(?:\\)?[}\]](?:\\)?["']\s*(?:[,;)]|$)/.test(following);
}

function isSecretValueEnd(value: string, index: number, quote: string, escapedOpeningQuote: boolean): boolean {
  if (value[index] !== quote) return false;
  let backslashes = 0;
  for (let cursor = index - 1; cursor >= 0 && value[cursor] === "\\"; cursor -= 1) backslashes += 1;
  if (backslashes % 2 === 0) return true;
  return escapedOpeningQuote && endsEscapedJsonValue(value, index);
}

function findQuotedSecretEnd(value: string, start: number, quote: string, escapedOpeningQuote: boolean): number {
  for (let index = start; index < value.length; index += 1) {
    if (isSecretValueEnd(value, index, quote, escapedOpeningQuote)) return index + 1;
  }
  return value.length;
}

function findArraySecretEnd(value: string, start: number): number {
  let depth = 0;
  let quote: string | undefined;
  let escaped = false;
  let index = start;
  for (; index < value.length; index += 1) {
    const character = value[index];
    if (quote) {
      if (escaped) escaped = false;
      else if (character === "\\") escaped = true;
      else if (character === quote) quote = undefined;
      continue;
    }
    if (character === '"' || character === "'" || character === "`") quote = character;
    else if (character === "[") depth += 1;
    else if (character === "]" && --depth === 0) return index + 1;
  }
  return index;
}

function findUnquotedSecretEnd(value: string, start: number): number {
  if (value[start] === "[") return findArraySecretEnd(value, start);
  let index = start;
  while (index < value.length && !/\s/.test(value[index])) index += 1;
  return index;
}

function findSecretEnd(value: string, start: number, quote?: string, escapedOpeningQuote = false): number {
  return quote ? findQuotedSecretEnd(value, start, quote, escapedOpeningQuote) : findUnquotedSecretEnd(value, start);
}

function redactSensitiveFields(value: string): string {
  let output = "";
  let copiedThrough = 0;
  sensitiveFieldStart.lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = sensitiveFieldStart.exec(value)) !== null) {
    const serializedDepth = Math.max(match[2].length, match[5].length, match[6].length, match[7].length);
    const quote = match[8];
    const valueEnd = serializedDepth >= 3 ? value.length : findSecretEnd(value, sensitiveFieldStart.lastIndex, quote, Boolean(match[7]));
    output += `${value.slice(copiedThrough, match.index)}${match[1]}${match[2]}${match[3]}${match[4]}${match[3]}: <redacted>`;
    copiedThrough = valueEnd;
    sensitiveFieldStart.lastIndex = valueEnd;
  }
  return output + value.slice(copiedThrough);
}

function builtinSanitize(value: string, webhookUrl?: string): string {
  const normalized = value.replace(/\u001b\[[0-9;]*m/g, "");
  return redactSensitiveFields(redactWebhookUrl(normalized, webhookUrl))
    .replace(/\bAuthorization\s*:\s*[^\r\n]+/gi, "Authorization: <redacted>")
    .replace(/\bDigest\s+[^\r\n]*/gi, "<redacted-authorization>")
    .replace(/\bBearer\s+[^\s,;}"'\\]+/gi, "Bearer <redacted>")
    .replace(/\b(?:Basic|Digest|NTLM|Negotiate|ApiKey|Token)\s+[^\s,;}"'\\]+/gi, "<redacted-authorization>")
    .replace(/\beyJ[\w-]+\.[\w-]+\.[\w-]+/g, "<redacted>")
    .replace(/\b(?:Cookie|Set-Cookie)\s*:\s*[^\r\n]+/gi, "<redacted-cookie>")
    .replace(/\b(?:AccountKey|SharedAccessKey|Ocp-Apim-Subscription-Key|x-functions-key)\s*=\s*(?:"[^"\r\n]*"|'[^'\r\n]*'|[^;\s,}]+)/gi, "<redacted-key>")
    .replace(/\b[a-z][a-z0-9+.-]*:\/\/[^\s<>"']+/gi, sanitizeUrl)
    .replace(/(?:^|[?&;\s])(sv|se|sp|sr|sig|signature|skoid|sktid|skt|ske|sks|skv)=([^&#;\s]+)/gi, (_match, key: string) => `${key}=<redacted>`)
    .replace(/\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi, "<redacted-email>")
    .replace(homePathPattern, "<redacted-home>")
    .replace(/[\u0000-\u0009\u000b-\u001f\u007f\u2028\u2029]+/g, " ")
    .replace(/[ \t]+/g, " ").trim();
}

function listPrefixIndices(line: string): Set<number> {
  const indices = new Set<number>();
  let index = 0;
  while (line[index]?.trim() === "") index += 1;
  if (["-", "+", ">"].includes(line[index]) && line[index + 1] === " ") {
    indices.add(index);
    return indices;
  }
  const digitsStart = index;
  while (line[index] !== undefined && line[index] >= "0" && line[index] <= "9") index += 1;
  if (index > digitsStart && line[index] === "." && line[index + 1] === " ") indices.add(index);
  return indices;
}

function escapeMarkdownLine(line: string): string {
  const prefixIndices = listPrefixIndices(line);
  let escaped = "";
  for (const [index, character] of Array.from(line).entries()) {
    const needsEscape = markdownCharacters.has(character) || prefixIndices.has(index);
    escaped += `${needsEscape ? "\\" : ""}${character}`;
  }
  return escaped;
}

function escapeMarkdown(value: string): string {
  return value.split("\n").map(line => {
    return escapeMarkdownLine(line);
  }).join("\n");
}

export function sanitizeHealthText(
  value: string,
  limit = 300,
  webhookUrl?: string,
  customSanitize?: (text: string) => string,
  escapeMarkdownText = true
): string {
  let sanitized = builtinSanitize(value, webhookUrl);
  if (customSanitize) {
    try {
      const custom = customSanitize(sanitized);
      if (typeof custom !== "string") return escapeMarkdownText ? escapeMarkdown("<detail omitted>") : "<detail omitted>";
      sanitized = builtinSanitize(custom, webhookUrl);
    } catch {
      return escapeMarkdownText ? escapeMarkdown("<detail omitted>") : "<detail omitted>";
    }
  }
  const clipped = Array.from(sanitized).slice(0, limit).join("").trim();
  return escapeMarkdownText ? escapeMarkdown(clipped) : clipped;
}

function textEntry(text: string, bold = false): TextEntry {
  return { type: "TextBlock", text, wrap: true, ...(bold ? { weight: "Bolder" as const } : {}) };
}

function addResultsAction(options: HealthDisplayOptions, webhookUrl: string | undefined, clean: (value: string, limit?: number, escapeMarkdownText?: boolean) => string) {
  const value = typeof options.linkToResultsUrl === "function" ? options.linkToResultsUrl() : options.linkToResultsUrl;
  if (typeof value !== "string" || !value || value.length > 2000) return [];
  try {
    const url = new URL(value);
    if (!["http:", "https:"].includes(url.protocol) || url.username || url.password ||
      redactWebhookUrl(value, webhookUrl) !== value || redactWebhookUrl(url.href, webhookUrl) !== url.href) return [];
    if (options.resultsLinkPolicy !== "preserve") { url.search = ""; url.hash = ""; }
    if (url.href.length > 2000) return [];
    return [{ type: "Action.OpenUrl", title: clean(options.linkToResultsText ?? "View test results", 100), url: url.href }];
  } catch {
    return [];
  }
}

function categoryDetails(summary: HealthSummary, clean: (value: string, limit?: number) => string): TextEntry[][] {
  const details = summary.categories.length ? [
    [textEntry("Failure evidence categories may overlap; each failure has one assessment.")],
  ] : [];
  for (const category of summary.categories) {
    details.push([textEntry(`${clean(category.name, 120)}: ${category.failed} failed tests`, true)]);
    for (const kind of category.kinds) details.push([textEntry(`${clean(kind.kind, 120)}: ${kind.tests} tests`)]);
  }
  return details;
}

function failureDetail(failure: HealthSummary["failures"][number], options: HealthDisplayOptions, clean: (value: string, limit?: number) => string): TextEntry[] {
  let label = failure.test.titlePath().filter(Boolean).join(" > ");
  if (options.testLabel) {
    try {
      const custom = options.testLabel(failure.test);
      if (typeof custom === "string") label = custom;
    } catch { /* Fall back to the Playwright title path. */ }
  }
  const entries = [textEntry(clean(label), true)];
  const error = failure.result?.errors?.[0];
  const diagnostic = error?.message ?? error?.value;
  if (diagnostic) entries.push(textEntry(clean(diagnostic, 2000)));
  return entries;
}

function failureDetails(summary: HealthSummary, options: HealthDisplayOptions, clean: (value: string, limit?: number) => string): TextEntry[][] {
  const details = categoryDetails(summary, clean);
  details.push(
    ...summary.noise.map(noise => [textEntry(`${clean(noise.kind, 120)}: ambient noise on ${noise.tests} tests; not a failure cause.`)]),
    ...summary.failures.slice(0, options.maxTests ?? 5).map(failure => failureDetail(failure, options, clean))
  );
  return details;
}

function flakyFinalSignalDetails(summary: HealthSummary, clean: (value: string, limit?: number) => string): TextEntry[][] {
  if (!summary.flakyWithFinalSignals) return [];
  return summary.flakyFinalKinds.map(({ kind, tests }) => [textEntry(`${clean(kind, 120)}: final-attempt signal on ${tests} flaky tests; recovery not established.`)]);
}

function baseEntries(summary: HealthSummary, options: HealthDisplayOptions, context: HealthRunContext, clean: (value: string, limit?: number) => string): TextEntry[] {
  const title = [options.environment, options.title ?? "Test Run Health"].filter(Boolean).join(" - ");
  const entries = [
    textEntry(clean(title, 160), true),
    textEntry(`${summary.outcomes.unexpected} failed; ${summary.outcomes.expected} expected; ${summary.outcomes.flaky} flaky; ${summary.outcomes.skipped} skipped. Run: ${context.status}; ${Math.round(context.duration / 1000)}s.`),
    textEntry(`Evidence assessment (best guess): ${summary.assessments.environment} environment-suspect; ${summary.assessments.regression} regression-suspect; ${summary.assessments.mixed} mixed; ${summary.assessments.undetermined} Cause undetermined / developer review.`),
  ];
  if (summary.unavailable) entries.push(textEntry(`Final signal evidence unavailable or unsupported on ${summary.unavailable} tests. No cause inferred.`));
  if (summary.passedWithSignals || summary.recoveredWithSignals || summary.previousAttemptsWithSignals) {
    entries.push(textEntry(`Passed with signals: ${summary.passedWithSignals}. Recovered flaky tests with signal evidence: ${summary.recoveredWithSignals}. Tests with superseded-attempt signals: ${summary.previousAttemptsWithSignals}. Not included in final-failure assessments.`));
  }
  if (summary.flakyWithFinalSignals) {
    entries.push(textEntry(`Flaky tests with final-attempt signals: ${summary.flakyWithFinalSignals}. Recovery not established; not included in final-failure assessments.`));
  }
  return entries;
}

export function buildHealthMessage(summary: HealthSummary, options: HealthDisplayOptions, context: HealthRunContext, webhookUrl?: string): string {
  const clean = (value: string, limit = 300, escapeMarkdownText = true) => sanitizeHealthText(value, limit, webhookUrl, options.sanitizeText, escapeMarkdownText);
  const body = baseEntries(summary, options, context, clean);
  const errors = context.errors.map(error => [textEntry(`Runner error: ${context.errorsSanitized ? error : clean(error)}`)]);
  const errorOmission = context.errorsOmitted ? [[textEntry(`${context.errorsOmitted} additional runner errors omitted.`)]] : [];
  const detailGroups = [...errorOmission, ...errors, ...flakyFinalSignalDetails(summary, clean), ...failureDetails(summary, options, clean)];
  let actions = addResultsAction(options, webhookUrl, clean);
  const serialize = (entries: TextEntry[]) => JSON.stringify({
    type: "message",
    attachments: [{ contentType: "application/vnd.microsoft.card.adaptive", contentUrl: null,
      content: { type: "AdaptiveCard", version: "1.4", $schema: "https://adaptivecards.io/schemas/adaptive-card.json", body: entries, msteams: { width: "Full" }, actions } }],
  });
  const budget = options.maxPayloadBytes ?? 26000;
  let omitted = Math.max(0, summary.failures.length - (options.maxTests ?? 5));
  const omission = (count: number) => textEntry(`${count} additional detail groups omitted; aggregate counts are unchanged.`);
  const minimumMessage = () => serialize([...body, omission(detailGroups.length + omitted)]);
  if (Buffer.byteLength(minimumMessage(), "utf8") > budget && actions.length) actions = [];
  if (Buffer.byteLength(minimumMessage(), "utf8") > budget) {
    throw new Error("Health payload budget is too small for summary and results link");
  }
  const selected = [...body];
  for (const [index, group] of detailGroups.entries()) {
    const following = detailGroups.length - index - 1 + omitted;
    const candidate = [...selected, ...group];
    if (following) candidate.push(omission(following));
    if (Buffer.byteLength(serialize(candidate), "utf8") > budget) {
      omitted += detailGroups.length - index;
      break;
    }
    selected.push(...group);
  }
  if (omitted) selected.push(omission(omitted));
  return serialize(selected);
}
