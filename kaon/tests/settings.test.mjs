import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, writeFile, chmod, rm } from "node:fs/promises";
import { readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { normalizeSettings } from "../src/settings.ts";
import { resolveToken } from "../src/token.ts";

test("blank preferences fall back to the documented defaults", () => {
  const settings = normalizeSettings({}, "/fixture/home");
  assert.equal(
    settings.baseURL,
    "https://kaon-router-admin-api.kaonai.com/api/v1",
  );
  assert.equal(settings.tokenPath, "/fixture/home/.config/kaon/token");
  assert.equal(settings.token, "");
  assert.equal(settings.titleFormat, "spend");
  assert.equal(settings.warnRatio, 0.7);
  assert.equal(settings.critRatio, 0.9);
  assert.equal(settings.summaryRange, "7d");
  assert.equal(settings.expiryWarnDays, 14);
  assert.equal(settings.requestTimeoutMs, 15000);
});

test("a trailing slash is stripped from the base URL", () => {
  const settings = normalizeSettings(
    { baseURL: "https://example.test/api/v1///" },
    "/fixture/home",
  );
  assert.equal(settings.baseURL, "https://example.test/api/v1");
});

test("plain http is rejected so the token never leaves over cleartext", () => {
  assert.throws(
    () => normalizeSettings({ baseURL: "http://example.test" }, "/fixture/home"),
    /must be an https URL/,
  );
});

test("a relative token path is rejected", () => {
  assert.throws(
    () => normalizeSettings({ tokenPath: "config/token" }, "/fixture/home"),
    /absolute path or a ~\/ path/,
  );
});

test("thresholds must sit in range and stay ordered", () => {
  assert.throws(
    () => normalizeSettings({ warnRatio: "1.5" }, "/fixture/home"),
    /from 0 to 1/,
  );
  assert.throws(
    () =>
      normalizeSettings(
        { warnRatio: "0.9", critRatio: "0.5" },
        "/fixture/home",
      ),
    /must not be below Warning Threshold/,
  );
  const settings = normalizeSettings(
    { warnRatio: "0.5", critRatio: "0.5" },
    "/fixture/home",
  );
  assert.equal(settings.warnRatio, 0.5);
  assert.equal(settings.critRatio, 0.5);
});

test("out-of-range and non-integer numbers are rejected", () => {
  assert.throws(
    () => normalizeSettings({ requestTimeoutSeconds: "0" }, "/fixture/home"),
    /from 1 to 120/,
  );
  assert.throws(
    () => normalizeSettings({ expiryWarnDays: "7.5" }, "/fixture/home"),
    /from 0 to 365/,
  );
});

test("unknown dropdown values are rejected", () => {
  assert.throws(
    () => normalizeSettings({ summaryRange: "48h" }, "/fixture/home"),
    /Invalid Breakdown Range/,
  );
  assert.throws(
    () => normalizeSettings({ titleFormat: "bar" }, "/fixture/home"),
    /Invalid Menu Bar Title/,
  );
});

test("the preference token wins over the token file", () => {
  const token = resolveToken(
    { token: "kaon_pat_preference", tokenPath: "/fixture/token" },
    () => {
      throw new Error("the token file must not be read");
    },
  );
  assert.equal(token, "kaon_pat_preference");
});

test("the token file is read and trimmed, and its path is reported when absent", async () => {
  const dir = await mkdtemp(join(tmpdir(), "kaon-token-"));
  try {
    const path = join(dir, "token");
    await writeFile(path, "  kaon_pat_from_file\n");
    await chmod(path, 0o600);
    assert.equal(
      resolveToken({ token: "", tokenPath: path }, (p) =>
        readFileSync(p, "utf8"),
      ),
      "kaon_pat_from_file",
    );

    const empty = join(dir, "empty");
    await writeFile(empty, "\n\n");
    assert.throws(
      () =>
        resolveToken({ token: "", tokenPath: empty }, (p) =>
          readFileSync(p, "utf8"),
        ),
      /Token file is empty/,
    );

    assert.throws(
      () =>
        resolveToken({ token: "", tokenPath: join(dir, "missing") }, (p) =>
          readFileSync(p, "utf8"),
        ),
      /No token\./,
    );
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
