import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import ts from "typescript";

function load(name, modules = {}, globals = {}) {
  const source = readFileSync(
    new URL(`../src/${name}.ts`, import.meta.url),
    "utf8",
  );
  const output = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2023,
    },
  }).outputText;
  const exports = {};
  runInNewContext(output, {
    exports,
    URL,
    Error,
    AbortSignal,
    require: (key) => {
      if (!(key in modules)) throw new Error(`Unexpected import: ${key}`);
      return modules[key];
    },
    ...globals,
  });
  return exports;
}

const languages = load("languages");
const config = {
  apiBaseUrl: "https://example.test/v1",
  apiKey: "test-only-key",
  model: "test-model",
};

test("selection normalization restores flattened lists without losing Unicode text", () => {
  const { normalizeSelectedText } = load("text-format");
  assert.equal(
    normalizeSelectedText("标题 • 第一项 • 第二项"),
    "标题\n• 第一项\n• 第二项",
  );
  assert.equal(
    normalizeSelectedText("任务 ☑ 已完成 ☐ 待办"),
    "任务\n☑ 已完成\n☐ 待办",
  );
  assert.equal(
    normalizeSelectedText("1. first 2. second"),
    "1. first\n2. second",
  );
  assert.equal(
    normalizeSelectedText("第一段\r\n第二段 👍\r\n"),
    "第一段\n第二段 👍",
  );
});

test("translation sends configured model, key and unmodified source text to the expected endpoint", async () => {
  let captured;
  const api = load(
    "api",
    { "./languages": languages },
    {
      fetch: async (url, options) => {
        captured = {
          url: url.toString(),
          headers: options.headers,
          body: JSON.parse(options.body),
        };
        return new Response(
          JSON.stringify({
            choices: [{ message: { content: "Hello\n- world" } }],
          }),
        );
      },
    },
  );
  const result = await api.translateText("你好\n- 世界", "en", config);
  assert.equal(result, "Hello\n- world");
  assert.equal(captured.url, "https://example.test/v1/chat/completions");
  assert.equal(captured.headers.Authorization, "Bearer test-only-key");
  assert.equal(captured.body.model, "test-model");
  assert.equal(captured.body.messages[1].content, "你好\n- 世界");
});

test("translation supports full endpoints and content blocks and rejects failed/empty responses", async () => {
  const api = load(
    "api",
    { "./languages": languages },
    {
      fetch: async () =>
        new Response(
          JSON.stringify({
            choices: [
              { message: { content: [{ text: "Hello" }, { text: " world" }] } },
            ],
          }),
        ),
    },
  );
  assert.equal(
    api
      .buildChatCompletionsUrl("https://example.test/v1/chat/completions/")
      .toString(),
    "https://example.test/v1/chat/completions",
  );
  assert.equal(await api.translateText("你好", "auto", config), "Hello world");
  for (const response of [
    new Response("invalid JSON"),
    new Response(JSON.stringify({ choices: [] })),
    new Response("Unavailable", { status: 503 }),
  ]) {
    const failed = load(
      "api",
      { "./languages": languages },
      { fetch: async () => response },
    );
    await assert.rejects(failed.translateText("你好", "en", config));
  }
});
