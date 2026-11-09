import test from "node:test";
import assert from "node:assert/strict";
import {
  ApiError,
  backoffMs,
  classifyStatus,
  createClient,
  isStopSignal,
  parseExpiry,
} from "../src/api.ts";
import {
  budgetLine,
  count,
  expiryNote,
  menuTitle,
  money,
  rowLabel,
  severityFor,
  spendRatio,
  topN,
} from "../src/format.ts";
import {
  EMPTY_SNAPSHOT,
  MIN_FETCH_INTERVAL_MS,
  SUMMARY_TTL_MS,
  clearFatal,
  refresh,
} from "../src/state.ts";

const BUDGET = {
  personal_daily_spend_usd: 46.06,
  personal_daily_budget_usd: 80,
  personal_weekly_spend_usd: 210.5,
  personal_weekly_budget_usd: 400,
  monthly_spend_usd: 980,
  monthly_budget_usd: 1200,
  hard_limit_usd: 1500,
  rate_limit_rpm: 1200,
  rate_limit_tpm: 2_400_000,
};

const SUMMARY = {
  time_range: "7d",
  totals: { total_cost_usd: 312.5, total_requests: 9800, total_tokens: 1.2e9 },
  by_model: [
    { model: "claude-opus-5", total_cost_usd: 200, total_requests: 1000 },
    { model: "claude-haiku-5-5", total_cost_usd: 12, total_requests: 8000 },
  ],
  by_provider: [{ provider_id: "anthropic", total_cost_usd: 212 }],
  by_day: [
    { date: "2026-11-08", total_cost_usd: 40, total_requests: 900 },
    { date: "2026-11-09", total_cost_usd: 54.23, total_requests: 1100 },
  ],
};

function stubClient(overrides = {}) {
  const calls = { budget: 0, summary: 0, authMe: 0 };
  const client = {
    budget: async () => {
      calls.budget += 1;
      if (overrides.budget) return overrides.budget();
      return BUDGET;
    },
    summary: async () => {
      calls.summary += 1;
      if (overrides.summary) return overrides.summary();
      return SUMMARY;
    },
    authMe: async () => {
      calls.authMe += 1;
      if (overrides.authMe) return overrides.authMe();
      return { automation_token_expires_at: "2026-12-01T10:00:00" };
    },
  };
  return { client, calls };
}

test("money and count stay readable and reject non-numbers", () => {
  assert.equal(money(46.0567), "$46.06");
  assert.equal(money(0), "$0.00");
  assert.equal(money(undefined), "—");
  assert.equal(money(Number.NaN), "—");
  assert.equal(count(999), "999");
  assert.equal(count(1500), "1.5K");
  assert.equal(count(2_400_000), "2.4M");
  assert.equal(count(1.2e9), "1.2B");
  assert.equal(count("12"), "—");
});

test("the daily ratio needs a positive budget", () => {
  assert.equal(spendRatio(null), null);
  assert.equal(spendRatio({ personal_daily_spend_usd: 10 }), null);
  assert.equal(
    spendRatio({ personal_daily_spend_usd: 10, personal_daily_budget_usd: 0 }),
    null,
  );
  assert.equal(
    spendRatio({ personal_daily_spend_usd: 40, personal_daily_budget_usd: 80 }),
    0.5,
  );
});

test("severity uses the configured thresholds inclusively", () => {
  assert.equal(severityFor(null, 0.7, 0.9), "ok");
  assert.equal(severityFor(0.69, 0.7, 0.9), "ok");
  assert.equal(severityFor(0.7, 0.7, 0.9), "warn");
  assert.equal(severityFor(0.9, 0.7, 0.9), "crit");
});

test("every menu bar title format renders", () => {
  assert.equal(menuTitle(null, "spend"), "…");
  assert.equal(menuTitle(BUDGET, "spend"), "$46");
  assert.equal(menuTitle(BUDGET, "spendExact"), "$46.06");
  assert.equal(menuTitle(BUDGET, "spendBudget"), "$46/$80");
  assert.equal(menuTitle(BUDGET, "percent"), "58%");
  assert.equal(
    menuTitle({ personal_daily_spend_usd: 12 }, "spendBudget"),
    "$12",
  );
  assert.equal(menuTitle({ personal_daily_spend_usd: 12 }, "percent"), "$12");
});

test("a budget line without a cap drops the remainder", () => {
  assert.equal(budgetLine("今日", 46.06, 80), "今日  $46.06 / $80  (剩 $33.94)");
  assert.equal(budgetLine("今日", 46.06, undefined), "今日  $46.06");
  assert.equal(budgetLine("今日", undefined, 80), "今日  — / $80  (剩 $80.00)");
});

test("the expiry note only fires inside the warning window", () => {
  const now = Date.parse("2026-11-09T00:00:00Z");
  assert.equal(expiryNote(null, 14, now), null);
  assert.equal(
    expiryNote(Date.parse("2026-12-24T00:00:00Z"), 14, now),
    null,
  );
  assert.equal(
    expiryNote(Date.parse("2026-11-19T00:00:00Z"), 14, now),
    "token 10 天后过期",
  );
  assert.equal(
    expiryNote(Date.parse("2026-11-08T00:00:00Z"), 14, now),
    "token 已过期",
  );
});

test("breakdown rows sort by cost and name their unknowns", () => {
  const rows = topN(SUMMARY.by_model, 1);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].model, "claude-opus-5");
  assert.deepEqual(topN(undefined, 5), []);
  assert.equal(rowLabel({ model: "" }, "model"), "unknown");
  assert.equal(rowLabel({}, "provider_id"), "unknown");
});

test("401, 403 and 429 are stop signals; other statuses are not", () => {
  assert.deepEqual(classifyStatus(401), {
    message: "401 token invalid or expired",
    fatal: true,
  });
  assert.deepEqual(classifyStatus(403), {
    message: "403 missing usage:read scope",
    fatal: true,
  });
  assert.deepEqual(classifyStatus(429), {
    message: "429 throttled",
    fatal: true,
  });
  assert.deepEqual(classifyStatus(502), {
    message: "502 unexpected status",
    fatal: false,
  });
});

test("Kaon stop codes are recognised in either field", () => {
  assert.equal(isStopSignal({ code: "automation_protocol_throttled" }), true);
  assert.equal(isStopSignal({ error: "automation_token_suspended" }), true);
  assert.equal(isStopSignal({ code: "operation_plan_denied" }), true);
  assert.equal(isStopSignal({ code: "rate_limited" }), false);
  assert.equal(isStopSignal(null), false);
  assert.equal(isStopSignal("automation_token_suspended"), false);
});

test("a zoneless expiry timestamp is read as UTC", () => {
  assert.equal(
    parseExpiry("2026-12-01T10:00:00"),
    Date.parse("2026-12-01T10:00:00Z"),
  );
  assert.equal(
    parseExpiry("2026-12-01T10:00:00+08:00"),
    Date.parse("2026-12-01T02:00:00Z"),
  );
  assert.equal(parseExpiry("soon"), null);
  assert.equal(parseExpiry(undefined), null);
});

test("backoff grows per failure and is capped", () => {
  assert.equal(backoffMs(0), 60_000);
  assert.equal(backoffMs(1), 60_000);
  assert.equal(backoffMs(5), 300_000);
  assert.equal(backoffMs(1000), 1_800_000);
});

test("a non-200 response never leaks the response body", async () => {
  let bodyRead = false;
  const client = createClient(
    "kaon_pat_secret",
    { baseURL: "https://example.test", requestTimeoutMs: 1000, summaryRange: "7d" },
    async () => ({
      ok: false,
      status: 401,
      json: async () => {
        bodyRead = true;
        return { detail: "token kaon_pat_secret revoked" };
      },
      text: async () => "token kaon_pat_secret revoked",
    }),
  );
  await assert.rejects(client.budget(), (error) => {
    assert.ok(error instanceof ApiError);
    assert.equal(error.fatal, true);
    assert.equal(error.message, "/users/me/budget: 401 token invalid or expired");
    assert.ok(!error.message.includes("kaon_pat_secret"));
    return true;
  });
  // 401 is already fatal, so there is no reason to read the body at all.
  assert.equal(bodyRead, false);
});

test("a 5xx carrying a stop code becomes fatal", async () => {
  const client = createClient(
    "kaon_pat_secret",
    { baseURL: "https://example.test", requestTimeoutMs: 1000, summaryRange: "7d" },
    async () => ({
      ok: false,
      status: 503,
      json: async () => ({ code: "automation_token_suspended" }),
      text: async () => "",
    }),
  );
  await assert.rejects(client.summary(), (error) => {
    assert.equal(error.fatal, true);
    assert.match(error.message, /503 unexpected status/);
    return true;
  });
});

test("the summary request carries the configured range", async () => {
  let seen = "";
  const client = createClient(
    "kaon_pat_secret",
    { baseURL: "https://example.test", requestTimeoutMs: 1000, summaryRange: "30d" },
    async (url) => {
      seen = url;
      return { ok: true, status: 200, json: async () => ({}), text: async () => "" };
    },
  );
  await client.summary();
  assert.equal(seen, "https://example.test/usage/summary?range=30d");
});

test("a transport failure reports as unreachable, not as a crash", async () => {
  const client = createClient(
    "kaon_pat_secret",
    { baseURL: "https://example.test", requestTimeoutMs: 1000, summaryRange: "7d" },
    async () => {
      throw new Error("getaddrinfo ENOTFOUND");
    },
  );
  await assert.rejects(client.budget(), (error) => {
    assert.equal(error.message, "network unreachable");
    assert.equal(error.fatal, false);
    return true;
  });
});

test("a first pass fetches budget, summary and the token expiry", async () => {
  const { client, calls } = stubClient();
  const now = Date.parse("2026-11-09T08:00:00Z");
  const next = await refresh(client, EMPTY_SNAPSHOT, { nowMs: now });
  assert.deepEqual(calls, { budget: 1, summary: 1, authMe: 1 });
  assert.equal(next.budget.personal_daily_spend_usd, 46.06);
  assert.equal(next.summary.time_range, "7d");
  assert.equal(next.summaryAt, now);
  assert.equal(next.lastOK, now);
  assert.equal(next.failures, 0);
  assert.equal(next.fatal, null);
  assert.equal(next.nextFetch, now + MIN_FETCH_INTERVAL_MS);
  assert.equal(next.expiresAt, Date.parse("2026-12-01T10:00:00Z"));
});

test("the fetch floor holds, and force overrides it", async () => {
  const { client, calls } = stubClient();
  const now = Date.parse("2026-11-09T08:00:00Z");
  const first = await refresh(client, EMPTY_SNAPSHOT, { nowMs: now });

  const held = await refresh(client, first, { nowMs: now + 1000 });
  assert.equal(calls.budget, 1, "no request inside the fetch floor");
  assert.equal(held, first);

  await refresh(client, first, { nowMs: now + 1000, force: true });
  assert.equal(calls.budget, 2);
  assert.equal(calls.summary, 2, "force refetches the breakdown too");
});

test("the breakdown is skipped until its TTL expires", async () => {
  const { client, calls } = stubClient();
  const now = Date.parse("2026-11-09T08:00:00Z");
  const first = await refresh(client, EMPTY_SNAPSHOT, { nowMs: now });

  const soon = now + MIN_FETCH_INTERVAL_MS + 1000;
  await refresh(client, first, { nowMs: soon });
  assert.equal(calls.budget, 2);
  assert.equal(calls.summary, 1, "the breakdown is the heavier call");
  assert.equal(calls.authMe, 1, "the expiry is read once per token");

  const later = now + SUMMARY_TTL_MS + 1000;
  await refresh(client, first, { nowMs: later });
  assert.equal(calls.summary, 2);
});

test("a failed budget read backs off and keeps the last good numbers", async () => {
  const { client, calls } = stubClient();
  const now = Date.parse("2026-11-09T08:00:00Z");
  const good = await refresh(client, EMPTY_SNAPSHOT, { nowMs: now });

  const failing = stubClient({
    budget: () => {
      throw new ApiError({ message: "502 unexpected status", fatal: false });
    },
  });
  const after = await refresh(failing.client, good, {
    nowMs: now + MIN_FETCH_INTERVAL_MS + 1,
    force: true,
  });
  assert.equal(after.failures, 1);
  assert.equal(after.lastError, "502 unexpected status");
  assert.equal(after.fatal, null);
  assert.equal(after.budget.personal_daily_spend_usd, 46.06);
  assert.equal(after.lastOK, good.lastOK);
  assert.equal(
    after.nextFetch,
    now + MIN_FETCH_INTERVAL_MS + 1 + backoffMs(1),
  );
  assert.equal(failing.calls.summary, 0, "a failed budget skips the breakdown");
  assert.equal(calls.budget, 1);
});

test("a stop signal halts every later pass until it is cleared", async () => {
  const stopping = stubClient({
    budget: () => {
      throw new ApiError({ message: "429 throttled", fatal: true });
    },
  });
  const now = Date.parse("2026-11-09T08:00:00Z");
  const stopped = await refresh(stopping.client, EMPTY_SNAPSHOT, { nowMs: now });
  assert.equal(stopped.fatal, "429 throttled");

  const { client, calls } = stubClient();
  const again = await refresh(client, stopped, { nowMs: now + 1e7, force: true });
  assert.equal(again, stopped, "a fatal snapshot is returned untouched");
  assert.deepEqual(calls, { budget: 0, summary: 0, authMe: 0 });

  const cleared = clearFatal(stopped);
  assert.equal(cleared.fatal, null);
  assert.equal(cleared.failures, 0);
  assert.equal(cleared.nextFetch, 0);
  const recovered = await refresh(client, cleared, { nowMs: now + 1e7 });
  assert.equal(recovered.fatal, null);
  assert.equal(calls.budget, 1);
});

test("a failing breakdown or expiry read does not discard the budget", async () => {
  const { client } = stubClient({
    summary: () => {
      throw new ApiError({ message: "502 unexpected status", fatal: false });
    },
    authMe: () => {
      throw new ApiError({ message: "network unreachable", fatal: false });
    },
  });
  const now = Date.parse("2026-11-09T08:00:00Z");
  const next = await refresh(client, EMPTY_SNAPSHOT, { nowMs: now });
  assert.equal(next.budget.personal_daily_spend_usd, 46.06);
  assert.equal(next.summary, null);
  assert.equal(next.expiresAt, null);
  assert.equal(next.lastError, "502 unexpected status");
  assert.equal(next.fatal, null);
  assert.equal(next.lastOK, now);
});

test("an unexpected throw is reported without a stack or a body", async () => {
  const { client } = stubClient({
    budget: () => {
      throw new TypeError("x is not a function");
    },
  });
  const next = await refresh(client, EMPTY_SNAPSHOT, { nowMs: 1000 });
  assert.equal(next.lastError, "unexpected failure");
  assert.equal(next.fatal, null);
  assert.equal(next.failures, 1);
});
