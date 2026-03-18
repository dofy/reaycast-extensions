import { ActionPanel, Action, Detail, Icon, showToast, Toast } from "@raycast/api";
import { useExec } from "@raycast/utils";
import { spawnSync } from "child_process";
import { getBin, getEnv } from "./utils";

function parseHealth(raw: string): string {
  const lines = raw
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean);

  const statusLines: string[] = [];
  const sessionLines: string[] = [];
  let inSessions = false;

  for (const line of lines) {
    if (line.startsWith("- agent:")) {
      inSessions = true;
      const match = line.match(/- (agent:[^\s]+) \((.+)\)/);
      if (match) {
        sessionLines.push(`| ${formatSessionKey(match[1])} | ${match[2]} |`);
      }
    } else if (!inSessions) {
      statusLines.push(line);
    }
  }

  let md = "# OpenClaw Status\n\n";
  for (const line of statusLines) {
    const [k, ...rest] = line.split(":");
    const v = rest.join(":").trim();
    if (v) {
      const icon = line.startsWith("Feishu") ? (v === "ok" ? "✅" : "❌") : "•";
      md += `**${icon} ${k.trim()}:** ${v}\n\n`;
    }
  }

  if (sessionLines.length > 0) {
    md += "\n## Active Sessions\n\n";
    md += "| Session | Last Active |\n|---|---|\n";
    md += sessionLines.join("\n") + "\n";
  }

  return md;
}

function formatSessionKey(key: string): string {
  if (key === "agent:main:main") return "Direct (main)";
  if (key.includes("feishu:direct")) return "Feishu · Direct";
  if (key.includes("feishu:group")) return "Feishu · Group";
  return key.replace("agent:main:", "");
}

export default function StatusCommand() {
  const bin = getBin();
  const env = getEnv();

  const { data, isLoading, revalidate, error } = useExec(bin, ["health", "--no-color"], {
    env,
    keepPreviousData: true,
  });

  function handleRestart() {
    showToast({ style: Toast.Style.Animated, title: "Restarting gateway…" });
    const result = spawnSync(bin, ["gateway", "restart", "--no-color"], { encoding: "utf8", env });
    if (result.status === 0) {
      showToast({ style: Toast.Style.Success, title: "Gateway restarted" });
      setTimeout(revalidate, 2000);
    } else {
      showToast({ style: Toast.Style.Failure, title: "Restart failed", message: result.stderr });
    }
  }

  const markdown = error
    ? `# Error\n\n\`\`\`\n${error.message}\n\`\`\``
    : data
      ? parseHealth(data)
      : "Loading…";

  return (
    <Detail
      isLoading={isLoading}
      markdown={markdown}
      navigationTitle="OpenClaw Status"
      actions={
        <ActionPanel>
          <Action title="Refresh" icon={Icon.ArrowClockwise} onAction={revalidate} shortcut={{ modifiers: ["cmd"], key: "r" }} />
          <Action title="Restart Gateway" icon={Icon.Repeat} onAction={handleRestart} shortcut={{ modifiers: ["cmd", "shift"], key: "r" }} />
        </ActionPanel>
      }
    />
  );
}
