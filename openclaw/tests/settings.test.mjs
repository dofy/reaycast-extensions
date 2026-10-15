import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, mkdir, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { normalizeSettings, settingsEnvironment } from "../src/settings.ts";
import { parseLogEntries, resolveLogPath } from "../src/log-data.ts";
import { runExecutable } from "../src/runtime.ts";

test("blank and auto preferences retain defaults and inherited CLI environment", () => {
  const env = {
    PATH: "/usr/bin",
    OPENCLAW_STATE_DIR: "/fixture/state",
    OPENCLAW_CONFIG_PATH: "/fixture/config.json",
  };
  const settings = normalizeSettings(
    {
      binPath: "auto",
      logPath: "",
      stateDirectory: "auto",
      configPath: "auto",
    },
    env,
    "/fixture/home",
  );
  assert.equal(settings.binPath, "");
  assert.equal(settings.logPath, "");
  assert.equal(settings.stateDirectory, "/fixture/state");
  assert.equal(settings.commandTimeoutMs, 20000);
  assert.equal(settings.commandOutputBytes, 2 * 1024 * 1024);
  assert.equal(settings.logReadBytes, 256 * 1024);
  assert.equal(settings.logEntryLimit, 80);
  assert.equal(settings.defaultLogLevel, "all");
  assert.equal(settings.groupRepeatedLogs, true);
  assert.deepEqual(settingsEnvironment(settings, env), env);
  assert.equal(normalizeSettings({}, {}, "/fixture/home").isolatedLogs, false);
  assert.equal(
    normalizeSettings({}, { OPENCLAW_HOME: "/fixture/other" }, "/fixture/home")
      .stateDirectory,
    "/fixture/other/.openclaw",
  );
});

test("custom preferences expand paths and affect only the child process environment", async () => {
  const env = { PATH: "/usr/bin", OPENCLAW_STATE_DIR: "/fixture/old" };
  const settings = normalizeSettings(
    {
      binPath: "~/bin/openclaw",
      logPath: "~/logs/gateway.log",
      stateDirectory: "~/custom",
      configPath: "~/custom.json",
      additionalPath: "~/bin:/opt/fixture/bin",
      dailyLogDirectory: "~/logs",
      commandTimeoutSeconds: "45",
      commandOutputMiB: "4",
      logEntryLimit: "200",
      logReadKiB: "512",
      defaultLogLevel: "problems",
      groupRepeatedLogs: false,
    },
    env,
    "/fixture/home",
  );
  const childEnv = settingsEnvironment(settings, env);
  assert.equal(settings.logPath, "/fixture/home/logs/gateway.log");
  assert.equal(settings.binPath, "/fixture/home/bin/openclaw");
  assert.equal(settings.dailyLogDirectory, "/fixture/home/logs");
  assert.equal(settings.commandTimeoutMs, 45000);
  assert.equal(settings.commandOutputBytes, 4 * 1024 * 1024);
  assert.equal(settings.logReadBytes, 512 * 1024);
  assert.equal(settings.logEntryLimit, 200);
  assert.equal(settings.defaultLogLevel, "problems");
  assert.equal(settings.groupRepeatedLogs, false);
  assert.equal(settings.isolatedLogs, true);
  assert.equal(childEnv.PATH, "/fixture/home/bin:/opt/fixture/bin:/usr/bin");
  assert.equal(env.OPENCLAW_STATE_DIR, "/fixture/old");
  assert.equal(env.OPENCLAW_CONFIG_PATH, undefined);
  const output = await runExecutable(
    process.execPath,
    [
      "-e",
      "process.stdout.write(JSON.stringify([process.env.OPENCLAW_STATE_DIR,process.env.OPENCLAW_CONFIG_PATH]))",
    ],
    childEnv,
    settings.commandTimeoutMs,
    settings.commandOutputBytes,
  );
  assert.deepEqual(JSON.parse(output), [
    "/fixture/home/custom",
    "/fixture/home/custom.json",
  ]);
});

test("invalid paths, ranges and filters fail before executing commands", () => {
  for (const input of [
    { binPath: "relative/openclaw" },
    { logPath: "relative.log" },
    { stateDirectory: "relative" },
    { configPath: "relative.json" },
    { additionalPath: "~/bin:relative" },
    { dailyLogDirectory: "relative" },
    { commandTimeoutSeconds: "0" },
    { commandTimeoutSeconds: "301" },
    { commandOutputMiB: "17" },
    { logEntryLimit: "1.5" },
    { logEntryLimit: "1001" },
    { logReadKiB: "15" },
    { logReadKiB: "4097" },
    { defaultLogLevel: "unknown" },
  ])
    assert.throws(() => normalizeSettings(input, {}, "/fixture/home"));
});

test("log count and grouping can be configured independently", () => {
  const raw =
    "2026-10-15T01:00:00Z info repeated\n2026-10-15T01:00:01Z info repeated";
  assert.equal(parseLogEntries(raw, 80, true).length, 1);
  const entries = parseLogEntries(raw, 80, false);
  assert.equal(entries.length, 2);
  assert.equal(entries[0].count, 1);
  assert.equal(entries[0].timestamp, "2026-10-15T01:00:01Z");
  assert.equal(parseLogEntries(raw, 1, false).length, 1);
});

test("isolated log discovery skips an existing default service log", async () => {
  const home = await mkdtemp(join(tmpdir(), "raycast-custom-state-"));
  try {
    const service = join(home, "Library/Logs/openclaw/gateway.log");
    const custom = join(home, "custom/logs/gateway.log");
    for (const file of [service, custom]) {
      await mkdir(dirname(file), { recursive: true });
      await writeFile(file, "fixture\n");
    }
    assert.equal(
      await resolveLogPath("", {
        home,
        stateDirectory: join(home, "custom"),
        dailyDirectories: [],
        includeServiceLog: false,
      }),
      custom,
    );
  } finally {
    await rm(home, { recursive: true, force: true });
  }
});

test("configured CLI output bounds reject oversized output with an actionable error", async () => {
  await assert.rejects(
    runExecutable(
      process.execPath,
      ["-e", "process.stdout.write('x'.repeat(1024))"],
      process.env,
      10000,
      16,
    ),
    /exceeded CLI Output Limit/,
  );
});
