import { execFile } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import path from "node:path";
import { promisify } from "node:util";

const execute = promisify(execFile);

it("delivers from env without serializing the destination into Playwright JSON", async () => {
  const directory = await mkdtemp(path.join(tmpdir(), "acme-reporter-"));
  const requests: { url: string | undefined; body: string }[] = [];
  const server = createServer((request, response) => {
    let body = "";
    request.setEncoding("utf8");
    request.on("data", (chunk: string) => { body += chunk; });
    request.on("end", () => {
      requests.push({ url: request.url, body });
      response.end("1");
    });
  });
  let primaryFailure = false;
  try {
    await new Promise<void>((resolve, reject) => {
      server.once("error", reject);
      server.listen(0, "127.0.0.1", resolve);
    });
    const address = server.address();
    if (!address || typeof address === "string") throw new Error("Local webhook did not start");
    const webhookUrl = `http://127.0.0.1:${address.port}/webhook?sig=synthetic-secret`;
    const outputFile = path.join(directory, "report.json");
    const configFile = path.join(directory, "playwright.config.cjs");
    await writeFile(configFile, `module.exports = ${JSON.stringify({
      testDir: directory,
      testMatch: "**/example.spec.js",
      workers: 1,
      retries: 0,
      outputDir: path.join(directory, "results"),
      reporter: [
        [require.resolve("./index"), { webhookUrlEnv: "ACME_TEAMS_WEBHOOK", debug: true }],
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
      env: { ...childEnvironment, ACME_TEAMS_WEBHOOK: webhookUrl, MSTEAMS_WEBHOOK_URL: "", NODE_ENV: "production" },
      timeout: 30000,
      windowsHide: true,
    }).catch(async (error: Error & { stdout?: string; stderr?: string }) => {
      let diagnostics = "JSON report unavailable";
      try {
        diagnostics = JSON.stringify(JSON.parse(await readFile(outputFile, "utf8")).errors);
      } catch {
        diagnostics = "JSON report unavailable";
      }
      throw new Error(`${error.message}\n${error.stdout ?? ""}\n${error.stderr ?? ""}\n${diagnostics}`);
    });
    expect(requests).toHaveLength(1);
    expect(requests[0].url).toBe("/webhook?sig=synthetic-secret");
    expect(JSON.parse(requests[0].body).type).toBe("message");
    const serialized = await readFile(outputFile, "utf8");
    const report = JSON.parse(serialized);
    expect(report.errors).toEqual([]);
    expect(report.stats.expected).toBe(1);
    expect(report.config.reporter).toContainEqual([
      require.resolve("./index"), { webhookUrlEnv: "ACME_TEAMS_WEBHOOK", debug: true },
    ]);
    expect(serialized).not.toContain("synthetic-secret");
    expect(stdout + stderr).not.toContain("synthetic-secret");
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
}, 45000);