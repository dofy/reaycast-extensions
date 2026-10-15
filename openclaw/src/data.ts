export interface Session {
  key: string;
  ageMs: number | null;
  totalTokens: number | null;
  contextTokens: number | null;
  model: string;
}

function record(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function number(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) && value >= 0
    ? value
    : null;
}

export function parseSessions(raw: string): Session[] {
  let data: unknown;
  try {
    data = JSON.parse(raw);
  } catch {
    throw new Error("OpenClaw returned invalid session JSON.");
  }
  if (!record(data) || !Array.isArray(data.sessions))
    throw new Error("OpenClaw returned an unsupported session response.");
  return data.sessions.map((value) => {
    if (!record(value) || typeof value.key !== "string")
      throw new Error("OpenClaw returned an invalid session entry.");
    return {
      key: value.key,
      ageMs: number(value.ageMs),
      totalTokens: number(value.totalTokens),
      contextTokens: number(value.contextTokens),
      model: typeof value.model === "string" ? value.model : "Unknown model",
    };
  });
}

export interface HealthChannel {
  id: string;
  name: string;
  configured: boolean | null;
  running: boolean | null;
  connected: boolean | null;
  probe: boolean | null;
  summary: string;
  state: "ok" | "warning" | "neutral";
}

export interface HealthOverview {
  ok: boolean;
  durationMs: number | null;
  sessionCount: number | null;
  channels: HealthChannel[];
  issues: string[];
}

function flag(value: unknown): boolean | null {
  return typeof value === "boolean" ? value : null;
}

export function parseHealth(raw: string): HealthOverview {
  let data: unknown;
  try {
    data = JSON.parse(raw);
  } catch {
    throw new Error("OpenClaw returned invalid health JSON.");
  }
  if (!record(data) || typeof data.ok !== "boolean")
    throw new Error("OpenClaw returned an unsupported health response.");
  const issues: string[] = data.ok ? [] : ["Gateway 健康检查未通过"];
  const channels: HealthChannel[] = [];
  const names: Record<string, string> = {
    feishu: "飞书",
    telegram: "Telegram",
    discord: "Discord",
    slack: "Slack",
    whatsapp: "WhatsApp",
  };
  if (record(data.channels)) {
    for (const [id, value] of Object.entries(data.channels)) {
      const channel = record(value) ? value : {};
      const name = names[id] ?? id.replace(/[\r\n\t]/g, " ");
      const configured = flag(channel.configured);
      const running = flag(channel.running);
      const connected = flag(channel.connected);
      const probe = record(channel.probe) ? flag(channel.probe.ok) : null;
      let summary = "未报告";
      let state: HealthChannel["state"] = "neutral";
      if (configured === false) summary = "未配置";
      else if (probe === false) {
        summary = "探测失败";
        state = "warning";
        issues.push(`${name}：探测失败`);
      } else if (probe === true) {
        summary = "探测通过";
        state = "ok";
      } else if (running === false || connected === false) {
        summary = "需关注";
        state = "warning";
        const reasons = [
          running === false ? "报告未运行" : "",
          connected === false ? "报告未连接" : "",
        ].filter(Boolean);
        issues.push(`${name}：${reasons.join("、")}；未报告探测结果`);
      } else if (connected === true) {
        summary = "已连接";
        state = "ok";
      } else if (running === true) {
        summary = "运行中";
        state = "ok";
      } else if (configured === true) summary = "已配置";
      channels.push({
        id,
        name,
        configured,
        running,
        connected,
        probe,
        summary,
        state,
      });
    }
  }
  return {
    ok: data.ok,
    durationMs: number(data.durationMs),
    sessionCount: record(data.sessions) ? number(data.sessions.count) : null,
    channels,
    issues,
  };
}

function escapeMarkdown(value: string): string {
  return value.replace(/[\\`*_{}[\]()#+.!>|~-]/g, "\\$&");
}

export function formatHealth(health: HealthOverview): string {
  const duration =
    health.durationMs === null ? "未报告" : `${health.durationMs} ms`;
  let markdown = `# ${health.ok ? "🟢 Gateway 正常" : "🔴 Gateway 异常"}\n\n检查耗时 **${duration}**\n\n---\n\n`;
  if (health.issues.length)
    markdown += `## ⚠️ 需关注 · ${health.issues.length} 项\n\n${health.issues.map((issue) => "- " + escapeMarkdown(issue)).join("\n")}\n\n`;
  else markdown += "本次检查未报告明确异常。\n\n";
  markdown += "## 渠道\n\n";
  for (const channel of health.channels) {
    const state = (value: boolean | null, yes: string, no: string) =>
      value === null ? "未报告" : value ? yes : no;
    markdown += `### ${escapeMarkdown(channel.name)} · ${channel.summary}\n\n| 状态项 | 结果 |\n| --- | --- |\n`;
    markdown += `| 配置 | ${state(channel.configured, "已配置", "未配置")} |\n`;
    markdown += `| 运行 | ${state(channel.running, "运行中", "未运行")} |\n`;
    markdown += `| 连接 | ${state(channel.connected, "已连接", "未连接")} |\n`;
    markdown += `| 探测 | ${state(channel.probe, "通过", "失败")} |\n\n`;
  }
  if (!health.channels.length) markdown += "未报告渠道状态。\n\n";
  markdown += `## 会话\n\n${health.sessionCount === null ? "会话数量未报告。" : `当前会话数量：**${health.sessionCount}**`}\n\n`;
  if (
    health.channels.some((channel) =>
      [
        channel.configured,
        channel.running,
        channel.connected,
        channel.probe,
      ].includes(null),
    )
  )
    markdown += "“未报告”表示本次响应没有提供该字段，不代表失败。";
  return markdown;
}

export function healthMarkdown(raw: string): string {
  return formatHealth(parseHealth(raw));
}
