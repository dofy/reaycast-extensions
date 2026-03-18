import { ActionPanel, Action, Detail, Icon, getPreferenceValues } from "@raycast/api";
import { readFileSync } from "fs";
import { homedir } from "os";
import { useState, useEffect } from "react";

const LOG_PATH = `${homedir()}/.openclaw/logs/gateway.log`;
const LINE_COUNT = 80;

const NOISE_PATTERNS = [
  /\[plugins\]/,
  /plugins\.allow is empty/,
  /non-bundled plugins/,
  /Registered feishu/,
  /pnpm\/global/,
];

function isNoise(line: string): boolean {
  return NOISE_PATTERNS.some((p) => p.test(line));
}

function parseLogLine(line: string): { time: string; level: string; msg: string } | null {
  // Format: 2026-03-17T19:xx:xx.xxxZ level [subsystem] message
  const match = line.match(/^(\d{4}-\d{2}-\d{2}T[\d:.]+[+-]\d{2}:\d{2})\s+(\w+)\s+(.+)$/);
  if (!match) return null;
  return { time: match[1], level: match[2], msg: match[3] };
}

function levelIcon(level: string): string {
  switch (level.toLowerCase()) {
    case "error":
    case "fatal":
      return "🔴";
    case "warn":
      return "🟡";
    case "info":
      return "🔵";
    default:
      return "⚪";
  }
}

function readLogs(): string {
  try {
    const content = readFileSync(LOG_PATH, "utf8");
    const lines = content.split("\n").filter((l) => l.trim() && !isNoise(l));
    const recent = lines.slice(-LINE_COUNT);

    const formatted = recent.map((line) => {
      const parsed = parseLogLine(line);
      if (parsed) {
        const time = parsed.time.replace(/T/, " ").replace(/\.\d+[+-]\d{2}:\d{2}$/, "").slice(11);
        const icon = levelIcon(parsed.level);
        const msg = parsed.msg.replace(/\{"subsystem":"[^"]+"\}\s*/g, "").trim();
        return `\`${time}\` ${icon} ${msg}`;
      }
      return line;
    });

    return formatted.join("\n\n");
  } catch (e) {
    return `Failed to read log file: ${LOG_PATH}`;
  }
}

export default function LogsCommand() {
  const [logs, setLogs] = useState<string>("");
  const [isLoading, setIsLoading] = useState(true);
  // binPath kept in prefs for consistency but logs are read directly from disk
  getPreferenceValues<Preferences>();

  function load() {
    setIsLoading(true);
    const content = readLogs();
    setLogs(content);
    setIsLoading(false);
  }

  useEffect(() => {
    load();
  }, []);

  const markdown = `# OpenClaw Logs\n\n*Last ${LINE_COUNT} entries · ${LOG_PATH}*\n\n---\n\n${logs}`;

  return (
    <Detail
      isLoading={isLoading}
      markdown={markdown}
      navigationTitle="OpenClaw Logs"
      actions={
        <ActionPanel>
          <Action title="Refresh" icon={Icon.ArrowClockwise} onAction={load} shortcut={{ modifiers: ["cmd"], key: "r" }} />
        </ActionPanel>
      }
    />
  );
}
