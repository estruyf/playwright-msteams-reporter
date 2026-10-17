import { execFile } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import path from "node:path";
import { promisify } from "node:util";

const execute = promisify(execFile);

it("posts the unchanged original before an optional health card without duplicating test output", async () => {
  const directory = await mkdtemp(path.join(tmpdir(), "acme-health-"));
  const messages: { title: string; body: string }[] = [];
  const server = createServer((request, response) => {
    let body = "";
    request.setEncoding("utf8");
    request.on("data", (chunk: string) => { body += chunk; });
    request.on("end", () => {
      const card = JSON.parse(body).attachments[0].content;
      messages.push({ title: card.body[0].items?.[0]?.text ?? card.body[0].text, body });
      response.end("1");
    });
  });
  let primaryFailure = false;
  try {
    await new Promise<void>((resolve, reject) => { server.once("error", reject); server.listen(0, "127.0.0.1", resolve); });
    const address = server.address();
    if (!address || typeof address === "string") throw new Error("Local webhook did not start");
    const configFile = path.join(directory, "playwright.config.cjs");
    const outputFile = path.join(directory, "report.json");
    const reporter = [require.resolve("./index"), { webhookUrlEnv: "ACME_TEAMS_WEBHOOK", title: "Original Results" }];
    const configuration = {
      testDir: directory, testMatch: "**/example.spec.js", workers: 1, retries: 0,
      outputDir: path.join(directory, "results"),
      reporter: [reporter, [require.resolve("./healthReporter"), { webhookUrlEnv: "ACME_TEAMS_WEBHOOK", quiet: true }], ["json", { outputFile }]],
    };
    await writeFile(configFile, `module.exports = ${JSON.stringify(configuration)};`);
    await writeFile(path.join(directory, "example.spec.js"),
      `const { test, expect } = require(${JSON.stringify(require.resolve("@playwright/test"))});\n` +
      `test('example', async ({}, testInfo) => { console.log('ACME_OUTPUT_ONCE'); testInfo.annotations.push({type:'env-signal:page-error',description:'Bearer synthetic-token'}); expect(1).toBe(1); });\n`);
    const environment = { ...process.env };
    for (const name of Object.keys(environment)) {
      if (/^(?:JEST_WORKER_ID|PLAYWRIGHT_.*|PW_.*|PWDEBUG|NODE_USE_ENV_PROXY|HTTPS?_PROXY|ALL_PROXY|NO_PROXY)$/i.test(name)) delete environment[name];
    }
    const run = () => execute(process.execPath, [require.resolve("@playwright/test/cli"), "test", "--config", configFile], {
      env: { ...environment, ACME_TEAMS_WEBHOOK: `http://127.0.0.1:${address.port}/webhook?sig=private-secret`, MSTEAMS_WEBHOOK_URL: "", NODE_ENV: "production" },
      timeout: 20000, windowsHide: true,
    });
    const firstRun = await run();
    expect(messages.map(message => message.title)).toEqual(["Original Results", "Test Run Health"]);
    expect(firstRun.stdout.match(/ACME_OUTPUT_ONCE/g) || []).toHaveLength(1);
    expect(messages[1].body).toContain("Passed with signals: 1");
    expect(messages[1].body).not.toContain("synthetic-token");
    const report = JSON.parse(await readFile(outputFile, "utf8"));
    expect(report.errors).toEqual([]);
    expect(report.stats.expected).toBe(1);
    expect(JSON.stringify(report.config.reporter)).not.toContain("private-secret");
    const originalBody = messages[0].body;
    messages.length = 0;
    await writeFile(configFile, `module.exports = ${JSON.stringify({ ...configuration, reporter: [reporter, ["json", { outputFile }]] })};`);
    await run();
    expect(messages).toHaveLength(1);
    expect(messages[0].body).toBe(originalBody);
  } catch (error) {
    primaryFailure = true;
    throw error;
  } finally {
    server.closeAllConnections();
    const cleanup = await Promise.allSettled([
      new Promise<void>((resolve, reject) => {
        if (!server.listening) return resolve();
        server.close(error => error ? reject(error) : resolve());
      }),
      rm(directory, { recursive: true, force: true, maxRetries: 3 }),
    ]);
    if (!primaryFailure) for (const result of cleanup) if (result.status === "rejected") throw result.reason;
  }
}, 45000);