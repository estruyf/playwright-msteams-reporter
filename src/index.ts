import type {
  Reporter,
  FullConfig,
  Suite,
  TestCase,
  TestResult,
  FullResult,
} from "@playwright/test/reporter";
import { processResults } from "./processResults";
import { Link, WebhookType } from "./models";

export interface MsTeamsReporterOptions {
  webhookUrl?: string;
  webhookType?: WebhookType;
  title?: string;
  linkToResultsUrl?: string | (() => string);
  linkToResultsText?: string;
  linkUrlOnFailure?: string | (() => string);
  linkTextOnFailure?: string;
  links?: Link[];
  notifyOnSuccess?: boolean;
  mentionOnFailure?: string;
  mentionOnFailureText?: string;
  enableEmoji?: boolean;
  quiet?: boolean;
  debug?: boolean;
  shouldRun?: (suite: Suite) => boolean;
  reportOnEmpty?: boolean;
  enableDuration?: boolean;
  mentionAuthors?: boolean;
}

export default class MsTeamsReporter implements Reporter {
  private suite: Suite | undefined;
  private startTime: number | undefined;
  private gitAuthors: string[] | undefined;

  constructor(private options: MsTeamsReporterOptions) {
    const defaultOptions: MsTeamsReporterOptions = {
      webhookUrl: undefined,
      webhookType: "powerautomate",
      title: "Playwright Test Results",
      linkToResultsUrl: undefined,
      linkToResultsText: "View test results",
      linkUrlOnFailure: undefined,
      linkTextOnFailure: "View failed tests",
      notifyOnSuccess: true,
      mentionOnFailure: undefined,
      mentionOnFailureText: "{mentions} please validate the test results.",
      enableEmoji: false,
      quiet: false,
      debug: false,
      shouldRun: () => true,
      reportOnEmpty: false,
      enableDuration: false,
      mentionAuthors: false,
    };

    this.options = { ...defaultOptions, ...options };

    console.log(`Using Microsoft Teams reporter`);

    if (process.env.NODE_ENV === "development" || this.options.debug) {
      console.log(`Using development mode`);
      console.log(`Options: ${JSON.stringify(this.options, null, 2)}`);
    }
  }

  onBegin(config: FullConfig, suite: Suite) {
    this.suite = suite;
    if (this.options.enableDuration) {
      this.startTime = Date.now();
    }
    // Capture git authors from metadata if enabled
    if (this.options.mentionAuthors && config?.metadata?.git) {
      // Playwright 1.51+ git metadata
      const authors: string[] = [];
      if (Array.isArray(config.metadata.git.commits)) {
        for (const commit of config.metadata.git.commits) {
          if (commit.author && commit.author.email) {
            authors.push(commit.author.email);
          }
        }
      } else if (config.metadata.git.commit?.author?.email) {
        authors.push(config.metadata.git.commit.author.email);
      }
      this.gitAuthors = Array.from(new Set(authors));
    }
  }

  onStdOut(
    chunk: string | Buffer,
    _: void | TestCase,
    __: void | TestResult
  ): void {
    if (this.options.quiet) {
      return;
    }

    const text = chunk.toString("utf-8");
    process.stdout.write(text);
  }

  onStdErr(chunk: string | Buffer, _: TestCase, __: TestResult) {
    if (this.options.quiet) {
      return;
    }

    const text = chunk.toString("utf-8");
    process.stderr.write(text);
  }

  async onEnd(_: FullResult) {
    let durationMs: number | undefined = undefined;
    if (this.options.enableDuration && this.startTime) {
      durationMs = Date.now() - this.startTime;
    }
    await processResults(this.suite, this.options, durationMs, this.gitAuthors);
  }
}
