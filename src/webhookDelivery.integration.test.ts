import { execFile } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import path from "node:path";
import { promisify } from "node:util";

const execute = promisify(execFile);

it.each(["headers", "body"])("exits successfully and runs a second reporter after stalled %s", async (stage) => {
  const directory = await mkdtemp(path.join(tmpdir(), "acme-delivery-"));
  const requests: string[] = [];
  const server = createServer((request, response) => {
    request.resume();
    requests.push(request.url || "");
    if (request.url?.startsWith("/stall")) {
      if (stage === "body") {
        response.writeHead(200, { "Content-Type": "text/plain" });
        response.write("incomplete");
      }
      return;
    }
    response.end("1");
  });
  let primaryFailure = false;
  try {
    await new Promise<void>((resolve, reject) => {
      server.once("error", reject);
      server.listen(0, "127.0.0.1", resolve);
    });
    const address = server.address();
    if (!address || typeof address === "string") throw new Error("Local webhook did not start");
    const origin = `http://127.0.0.1:${address.port}`;
    const outputFile = path.join(directory, "report.json");
    const configFile = path.join(directory, "playwright.config.cjs");
    await writeFile(configFile, `module.exports = ${JSON.stringify({
      testDir: directory, testMatch: "**/example.spec.js", workers: 1, retries: 0,
      outputDir: path.join(directory, "results"),
      reporter: [
        [require.resolve("./index"), { webhookUrlEnv: "ACME_STALL_WEBHOOK", webhookTimeoutMs: 1000, quiet: true }],
        [require.resolve("./index"), { webhookUrlEnv: "ACME_NEXT_WEBHOOK", webhookTimeoutMs: 5000, quiet: true }],
        ["json", { outputFile }],
      ],
    })};`);
    await writeFile(path.join(directory, "example.spec.js"),
      `const { test, expect } = require(${JSON.stringify(require.resolve("@playwright/test"))});\ntest('example', () => { expect(1).toBe(1); });\n`);
    const childEnvironment = { ...process.env };
    for (const name of Object.keys(childEnvironment)) {
      if (/^(?:JEST_WORKER_ID|PLAYWRIGHT_.*|PW_.*|PWDEBUG|NODE_USE_ENV_PROXY|HTTPS?_PROXY|ALL_PROXY|NO_PROXY)$/i.test(name)) {
        delete childEnvironment[name];
      }
    }
    const { stdout, stderr } = await execute(process.execPath, [
      require.resolve("@playwright/test/cli"), "test", "--config", configFile,
    ], {
      env: {
        ...childEnvironment,
        ACME_STALL_WEBHOOK: `${origin}/stall?sig=synthetic-secret`,
        ACME_NEXT_WEBHOOK: `${origin}/next`,
        MSTEAMS_WEBHOOK_URL: "", NODE_ENV: "production",
      },
      timeout: 20000, windowsHide: true,
    });
    expect(requests).toEqual(["/stall?sig=synthetic-secret", "/next"]);
    expect(stderr).toContain("Webhook delivery timed out after 1000ms");
    expect(stderr.match(/Failed to send message/g) || []).toHaveLength(1);
    expect(stdout + stderr).not.toContain("synthetic-secret");
    expect(stdout).not.toContain("Message sent successfully");
    const report = JSON.parse(await readFile(outputFile, "utf8"));
    expect(report.errors).toEqual([]);
    expect(report.stats.expected).toBe(1);
    expect(report.stats.unexpected).toBe(0);
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
    if (!primaryFailure) {
      for (const result of cleanup) {
        if (result.status === "rejected") throw result.reason;
      }
    }
  }
}, 30000);