import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, mkdir, writeFile, chmod, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { delimiter, dirname, join } from "node:path";
import { parseSessions, healthMarkdown, parseHealth } from "../src/data.ts";
import {
  formatLogs,
  readLogTail,
  resolveLogPath,
  logErrorMessage,
  parseLogEntries,
  logEntryMarkdown,
} from "../src/log-data.ts";
import {
  searchPaths,
  resolveBinary,
  commandEnvironment,
  runExecutable,
} from "../src/runtime.ts";

test("session parser distinguishes invalid responses from an empty list and handles missing metrics", () => {
  assert.deepEqual(parseSessions('{"sessions":[]}'), []);
  const [session] = parseSessions(
    JSON.stringify({
      sessions: [{ key: "fixture", totalTokens: null, contextTokens: 0 }],
    }),
  );
  assert.equal(session.totalTokens, null);
  assert.equal(session.contextTokens, 0);
  assert.equal(session.model, "Unknown model");
  for (const raw of [
    "invalid",
    "null",
    "{}",
    '{"sessions":null}',
    '{"sessions":[null]}',
    '{"sessions":[{}]}',
  ]) {
    assert.throws(() => parseSessions(raw), /OpenClaw returned/);
  }
});

test("log list parses bracketed levels, subsystem events and orders newest first", () => {
  const entries = parseLogEntries(
    "2026-10-15T01:00:00Z [info]: [ [ 'ws' ], 'ws client ready' ]\n2026-10-15T01:00:01Z [gateway] listening\n2026-10-15T01:00:02Z ERROR failed\n  at fixture/path.ts:12",
  );
  assert.equal(entries[0].level, "error");
  assert.match(entries[0].message, /failed\n  at fixture/);
  assert.equal(entries[1].source, "gateway");
  assert.equal(entries[2].source, "ws");
  assert.equal(entries[2].message, "ws client ready");
});

test("repeated skill path warnings collapse without losing original records", () => {
  const entries = parseLogEntries(
    "2026-10-15T01:00:00Z [skills] Skipping escaped skill path outside its configured root: requested=~/.agents/skills/first\n2026-10-15T01:00:01Z [skills] Skipping escaped skill path outside its configured root: requested=~/.agents/skills/second",
  );
  assert.equal(entries.length, 1);
  assert.equal(entries[0].level, "warn");
  assert.equal(entries[0].count, 2);
  assert.equal(entries[0].timestamp, "2026-10-15T01:00:01Z");
  assert.equal(entries[0].firstTimestamp, "2026-10-15T01:00:00Z");
  assert.match(entries[0].raw.join("\n"), /skills\/first/);
  assert.match(entries[0].raw.join("\n"), /skills\/second/);
});

test("log details fence literal paths and Markdown, and list limits apply before grouping", () => {
  const entries = parseLogEntries(
    "2026-10-15T01:00:00Z info old\n2026-10-15T01:00:01Z info ~~path_with_underscores~~ ```\n2026-10-15T01:00:02Z info ~~path_with_underscores~~ ```",
    2,
  );
  assert.equal(entries.length, 1);
  assert.equal(entries[0].count, 2);
  const markdown = logEntryMarkdown(entries[0]);
  assert.ok(markdown.startsWith("````text\n"));
  assert.ok(markdown.endsWith("\n````"));
  assert.match(markdown, /~~path_with_underscores~~/);
  assert.doesNotMatch(markdown, /info old/);
});

test("health parser renders structured JSON without exposing extra credential fields", () => {
  const raw = JSON.stringify({
    ok: true,
    durationMs: 12,
    channels: {
      feishu: {
        configured: true,
        probe: { ok: false },
        token: "fixture-secret",
      },
    },
    sessions: { count: 2 },
  });
  const markdown = healthMarkdown(raw);
  assert.match(markdown, /Gateway 正常/);
  assert.match(markdown, /飞书：探测失败/);
  assert.match(markdown, /当前会话数量：\*\*2\*\*/);
  assert.doesNotMatch(markdown, /fixture-secret/);
  for (const value of ["oops", "null", "{}", '{"ok":"yes"}'])
    assert.throws(() => healthMarkdown(value));
});

test("status overview keeps missing values distinct from false and zero", () => {
  const raw = JSON.stringify({
    ok: true,
    durationMs: 0,
    sessions: { count: 0 },
    channels: { feishu: {} },
  });
  const health = parseHealth(raw);
  assert.equal(health.durationMs, 0);
  assert.equal(health.sessionCount, 0);
  assert.equal(health.channels[0].running, null);
  assert.equal(health.channels[0].summary, "未报告");
  assert.deepEqual(health.issues, []);
  const markdown = healthMarkdown(raw);
  assert.match(markdown, /\*\*0 ms\*\*/);
  assert.match(markdown, /当前会话数量：\*\*0\*\*/);
  assert.match(markdown, /\| 运行 \| 未报告 \|/);
});

test("status overview separates unconfigured channels and successful probes from failures", () => {
  const health = parseHealth(
    JSON.stringify({
      ok: true,
      channels: {
        slack: { configured: false, running: false, probe: { ok: false } },
        feishu: {
          configured: true,
          running: false,
          connected: false,
          probe: { ok: true },
        },
        telegram: { configured: true, probe: { ok: false } },
      },
    }),
  );
  assert.equal(health.channels[0].summary, "未配置");
  assert.equal(health.channels[1].summary, "探测通过");
  assert.equal(health.channels[1].state, "ok");
  assert.deepEqual(health.issues, ["Telegram：探测失败"]);
});

test("failed Gateway and unconnected channels are surfaced without echoing raw errors", () => {
  const raw = JSON.stringify({
    ok: false,
    channels: {
      custom: { configured: true, connected: false, error: "fixture-secret" },
    },
  });
  const health = parseHealth(raw);
  assert.equal(health.issues.length, 2);
  assert.equal(health.channels[0].state, "warning");
  const markdown = healthMarkdown(raw);
  assert.match(markdown, /Gateway 异常/);
  assert.match(markdown, /报告未连接/);
  assert.doesNotMatch(markdown, /fixture-secret/);
});

test("log formatting supports UTC Z, numeric offsets and unknown lines", () => {
  const value = formatLogs(
    "2026-10-15T01:00:00.000Z info first\n2026-10-15T09:00:00.125+08:00 warn second\nunknown line\n[plugins] ignored",
  );
  assert.match(value, /`01:00:00` 🔵 first/);
  assert.match(value, /`09:00:00` 🟡 second/);
  assert.match(value, /unknown line/);
  assert.doesNotMatch(value, /ignored/);
});

test("log tail reads a bounded window and drops a partial first line", async () => {
  const dir = await mkdtemp(join(tmpdir(), "raycast-log-test-"));
  try {
    const file = join(dir, "fixture.log");
    await writeFile(
      file,
      "OLD".repeat(10000) + "\n2026-10-15T01:00:00Z info 完整尾行\n",
    );
    const value = await readLogTail(file, 128);
    assert.match(value, /完整尾行/);
    assert.doesNotMatch(value, /OLD/);
    await assert.rejects(readLogTail(join(dir, "missing")));
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("CLI discovery recovers a removed legacy default and respects valid explicit paths", async () => {
  const home = await mkdtemp(join(tmpdir(), "raycast-cli-test-"));
  try {
    const directory = join(home, ".local/bin");
    await mkdir(directory, { recursive: true });
    const binary = join(directory, "openclaw");
    await writeFile(binary, "#!/bin/sh\nexit 0\n");
    await chmod(binary, 0o755);
    assert.equal(resolveBinary("", [directory], home), binary);
    assert.equal(
      resolveBinary(join(home, "Library/pnpm/openclaw"), [directory], home),
      binary,
    );
    assert.equal(
      resolveBinary("~/.local/bin/openclaw", [directory], home),
      binary,
    );
    assert.throws(
      () => resolveBinary(join(home, "missing"), [directory], home),
      /not found/,
    );
    assert.throws(
      () => resolveBinary(directory, [directory], home),
      /not found/,
    );
    const env = commandEnvironment(binary, {
      PATH: "/usr/bin",
      FIXTURE: "kept",
    });
    assert.equal(env.PATH.split(delimiter)[0], dirname(binary));
    assert.equal(env.FIXTURE, "kept");
    assert.equal(env.NO_COLOR, "1");
    assert.ok(searchPaths({ PATH: "/usr/bin" }, home).includes(directory));
  } finally {
    await rm(home, { recursive: true, force: true });
  }
});

test("async CLI runner returns output, rejects failures privately and terminates timed-out fixtures", async () => {
  assert.equal(
    await runExecutable(
      process.execPath,
      ["-e", "process.stdout.write('fixture')"],
      process.env,
    ),
    "fixture",
  );
  await assert.rejects(
    runExecutable(
      process.execPath,
      ["-e", "process.stderr.write('fixture-secret');process.exit(1)"],
      process.env,
    ),
    (error) => {
      assert.match(error.message, /command failed/);
      assert.doesNotMatch(error.message, /fixture-secret/);
      return true;
    },
  );
  await assert.rejects(
    runExecutable(
      process.execPath,
      ["-e", "setInterval(()=>{},1000)"],
      process.env,
      80,
    ),
    /timed out/,
  );
});

test("log discovery prefers the macOS Gateway service log and supports custom overrides", async () => {
  const home = await mkdtemp(join(tmpdir(), "raycast-log-location-"));
  try {
    const service = join(home, "Library/Logs/openclaw/gateway.log");
    const legacy = join(home, ".openclaw/logs/gateway.log");
    for (const file of [service, legacy]) {
      await mkdir(dirname(file), { recursive: true });
      await writeFile(file, "fixture\n");
    }
    const locations = {
      home,
      stateDirectory: join(home, ".openclaw"),
      dailyDirectories: [],
    };
    assert.equal(await resolveLogPath("", locations), service);
    assert.equal(
      await resolveLogPath("~/.openclaw/logs/gateway.log", locations),
      legacy,
    );
    await rm(service);
    assert.equal(await resolveLogPath("", locations), legacy);
  } finally {
    await rm(home, { recursive: true, force: true });
  }
});

test("log discovery falls back to the most recent dated diagnostic file", async () => {
  const home = await mkdtemp(join(tmpdir(), "raycast-log-daily-"));
  try {
    const directory = join(home, "daily");
    await mkdir(directory);
    for (const name of [
      "openclaw-2026-10-14.log",
      "openclaw-2026-10-15.log",
      "unrelated.log",
    ])
      await writeFile(join(directory, name), "fixture\n");
    const locations = {
      home,
      stateDirectory: join(home, ".openclaw"),
      dailyDirectories: [directory],
    };
    assert.equal(
      await resolveLogPath("", locations),
      join(directory, "openclaw-2026-10-15.log"),
    );
  } finally {
    await rm(home, { recursive: true, force: true });
  }
});

test("missing logs, directory overrides and permission errors provide actionable messages", async () => {
  const home = await mkdtemp(join(tmpdir(), "raycast-log-missing-"));
  try {
    const locations = {
      home,
      stateDirectory: join(home, ".openclaw"),
      dailyDirectories: [],
    };
    await assert.rejects(
      resolveLogPath("", locations),
      /No OpenClaw log file was found/,
    );
    await assert.rejects(
      resolveLogPath(join(home, "missing.log"), locations),
      /no longer exists/,
    );
    await assert.rejects(
      resolveLogPath(home, locations),
      /must point to a file/,
    );
    assert.match(logErrorMessage({ code: "EACCES" }), /Permission denied/);
    assert.match(logErrorMessage({ code: "EPERM" }), /Permission denied/);
  } finally {
    await rm(home, { recursive: true, force: true });
  }
});

test("daily JSON log records render timestamps, levels and message text", () => {
  const line = JSON.stringify({
    0: "subsystem",
    1: "fixture event",
    _meta: { date: "2026-10-15T01:02:03.000Z", logLevelName: "INFO" },
    time: "2026-10-15T01:02:03.000Z",
  });
  assert.equal(formatLogs(line), "`01:02:03` 🔵 fixture event");
});
