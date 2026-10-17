import type { Suite } from "@playwright/test/reporter";
import { aggregateHealth, compileCategories } from "./aggregate";

describe("health aggregation", () => {
  it("uses outcome for failure membership and deduplicates kinds and categories", () => {
    const suite = { allTests: () => [{
      id: "failure", titlePath: () => ["project", "example"], outcome: () => "unexpected",
      results: [{ status: "failed", annotations: [
        { type: "env-signal:http-5xx" }, { type: "env-signal:http-5xx" }, { type: "env-signal:net-fail" },
      ], errors: [] }],
    }, {
      id: "expected-failure", titlePath: () => ["expected failure"], outcome: () => "expected",
      results: [{ status: "failed", annotations: [], errors: [] }],
    }] } as unknown as Suite;
    const summary = aggregateHealth(suite, compileCategories());
    expect(summary.outcomes).toEqual({ expected: 1, unexpected: 1, flaky: 0, skipped: 0 });
    expect(summary.assessments).toEqual({ environment: 1, regression: 0, mixed: 0, undetermined: 0 });
    expect(summary.categories[0].failed).toBe(1);
    expect(summary.categories[0].kinds).toEqual([{ kind: "http-5xx", tests: 1 }, { kind: "net-fail", tests: 1 }]);
  });

  it("keeps retries, noise and interrupted final evidence separate", () => {
    const suite = { allTests: () => [{
      id: "recovered", titlePath: () => ["recovered"], outcome: () => "flaky", expectedStatus: "passed",
      results: [
        { status: "failed", annotations: [{ type: "env-signal:http-5xx" }], errors: [] },
        { status: "passed", annotations: [{ type: "env-signal:ambient" }], errors: [] },
      ],
    }, {
      id: "interrupted", titlePath: () => ["interrupted"], outcome: () => "unexpected",
      results: [
        { status: "failed", annotations: [{ type: "env-signal:http-5xx" }], errors: [] },
        { status: "interrupted", annotations: [], errors: [] },
      ],
    }] } as unknown as Suite;
    const summary = aggregateHealth(suite, compileCategories([
      { name: "Noise", kinds: ["ambient"], noise: true },
      { name: "Backend", kinds: ["http-*"], assessment: "environment" },
    ]));
    expect(summary.assessments.environment).toBe(0);
    expect(summary.assessments.undetermined).toBe(1);
    expect(summary.recoveredWithSignals).toBe(1);
    expect(summary.passedWithSignals).toBe(0);
    expect(summary.previousAttemptsWithSignals).toBe(2);
    expect(summary.noise).toEqual([{ kind: "ambient", tests: 1 }]);
    expect(summary.unavailable).toBe(1);
  });

  it("counts final-pass signals from flaky retries as recovered evidence", () => {
    const suite = { allTests: () => [{
      id: "flaky-final-signal", titlePath: () => ["flaky-final-signal"], outcome: () => "flaky", expectedStatus: "passed",
      results: [
        { status: "failed", annotations: [], errors: [] },
        { status: "passed", annotations: [{ type: "env-signal:http-5xx" }], errors: [] },
      ],
    }] } as unknown as Suite;
    const summary = aggregateHealth(suite, compileCategories());
    expect(summary.recoveredWithSignals).toBe(1);
    expect(summary.passedWithSignals).toBe(0);
  });

  it("does not count a flaky retry as recovered when the final attempt was skipped", () => {
    const suite = { allTests: () => [{
      id: "serial-skip", titlePath: () => ["serial-skip"], outcome: () => "flaky", expectedStatus: "passed",
      results: [
        { status: "passed", annotations: [], errors: [] },
        { status: "failed", annotations: [{ type: "env-signal:http-5xx" }], errors: [] },
        { status: "skipped", annotations: [], errors: [] },
      ],
    }] } as unknown as Suite;
    const summary = aggregateHealth(suite, compileCategories());
    expect(summary.outcomes.flaky).toBe(1);
    expect(summary.recoveredWithSignals).toBe(0);
    expect(summary.previousAttemptsWithSignals).toBe(1);
    expect(summary.unavailable).toBe(1);
  });

  it("preserves final signals on flaky tests whose final attempt did not recover", () => {
    const suite = { allTests: () => [{
      id: "flaky-final-failure", titlePath: () => ["flaky-final-failure"], outcome: () => "flaky", expectedStatus: "passed",
      results: [
        { status: "passed", annotations: [], errors: [] },
        { status: "failed", annotations: [{ type: "env-signal:http-5xx" }], errors: [] },
      ],
    }] } as unknown as Suite;
    const summary = aggregateHealth(suite, compileCategories());
    expect(summary.outcomes.flaky).toBe(1);
    expect(summary.recoveredWithSignals).toBe(0);
    expect(summary.flakyWithFinalSignals).toBe(1);
    expect(summary.flakyFinalKinds).toEqual([{ kind: "http-5xx", tests: 1 }]);
    expect(summary.assessments.environment).toBe(0);
  });

  it("keeps conflicting categories mixed and unsupported annotations inconclusive", () => {
    const suite = { allTests: () => [{
      id: "mixed", titlePath: () => ["mixed"], outcome: () => "unexpected",
      results: [{ status: "failed", annotations: [{ type: "env-signal:auth-fail" }, { type: "env-signal:app-bug" }], errors: [] }],
    }, {
      id: "old", titlePath: () => ["old"], outcome: () => "unexpected",
      results: [{ status: "failed", errors: [] }],
    }] } as unknown as Suite;
    const summary = aggregateHealth(suite, compileCategories([
      { name: "Auth", kinds: ["auth-*"], assessment: "environment" },
      { name: "App", kinds: ["app-*"], assessment: "regression" },
    ]));
    expect(summary.assessments).toEqual({ environment: 0, regression: 0, mixed: 1, undetermined: 1 });
    expect(summary.unavailable).toBe(1);
  });

  it("keeps an environment observation mixed when another signal is undetermined", () => {
    const suite = { allTests: () => [{
      id: "ambiguous", titlePath: () => ["ambiguous"], outcome: () => "unexpected",
      results: [{ status: "failed", annotations: [
        { type: "env-signal:http-5xx" }, { type: "env-signal:new-unknown-kind" },
      ], errors: [] }],
    }] } as unknown as Suite;
    const summary = aggregateHealth(suite, compileCategories([
      { name: "Backend", kinds: ["http-*"], assessment: "environment" },
    ]));
    expect(summary.assessments).toEqual({ environment: 0, regression: 0, mixed: 1, undetermined: 0 });
  });

  it("does not reuse earlier failure evidence when the final retry is interrupted or skipped", () => {
    const suite = { allTests: () => [{
      id: "interrupted", titlePath: () => ["interrupted"], outcome: () => "unexpected",
      results: [
        { status: "failed", annotations: [{ type: "env-signal:http-5xx" }], errors: [{ message: "HTTP 503" }] },
        { status: "interrupted", annotations: [], errors: [] },
      ],
    }, {
      id: "not-run", titlePath: () => ["not-run"], outcome: () => "unexpected",
      results: [
        { status: "failed", annotations: [{ type: "env-signal:page-error" }], errors: [{ message: "Application error" }] },
        { status: "skipped", annotations: [], errors: [] },
      ],
    }] } as unknown as Suite;
    const summary = aggregateHealth(suite, compileCategories());
    expect(summary.assessments.environment).toBe(0);
    expect(summary.assessments.undetermined).toBe(2);
    expect(summary.unavailable).toBe(2);
    expect(summary.previousAttemptsWithSignals).toBe(2);
    expect(summary.failures.every(failure => failure.result?.status === "interrupted" || failure.result?.status === "skipped")).toBe(true);
  });

  it("keeps a timeout signal inconclusive by default", () => {
    const suite = { allTests: () => [{
      id: "timeout", titlePath: () => ["timeout"], outcome: () => "unexpected",
      results: [{ status: "timedOut", annotations: [{ type: "env-signal:test-timeout" }], errors: [] }],
    }] } as unknown as Suite;
    const summary = aggregateHealth(suite, compileCategories());
    expect(summary.assessments.undetermined).toBe(1);
  });
  it("matches whole case-sensitive kinds with first-match precedence and literal regex characters", () => {
    const categories = compileCategories([
      { name: "Exact", kinds: ["http-5xx"], assessment: "regression" },
      { name: "Broad", kinds: ["http-*", "a.b*"], assessment: "environment" },
    ]);
    expect(categories.forKind("http-5xx").name).toBe("Exact");
    expect(categories.forKind("http-401").name).toBe("Broad");
    expect(categories.forKind("HTTP-401").name).toBe("Other signals");
    expect(categories.forKind("a.b-c").name).toBe("Broad");
    expect(categories.forKind("axb-c").name).toBe("Other signals");
    expect(compileCategories([{ name: "Star", kinds: ["a*b"] }]).forKind("a*xb").name).toBe("Star");
    expect(compileCategories([]).forKind("http-5xx").name).toBe("Other signals");
  });

  it("rejects ambiguous or invalid category configuration", () => {
    expect(() => compileCategories([{ name: "Other signals", kinds: ["*"] }])).toThrow();
    expect(() => compileCategories([{ name: "same", kinds: ["a"] }, { name: "same", kinds: ["b"] }])).toThrow();
    expect(() => compileCategories([{ name: "Noise", kinds: ["a"], noise: true, assessment: "environment" }])).toThrow();
  });
});