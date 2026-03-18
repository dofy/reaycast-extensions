import { ActionPanel, Action, List, Icon, Color, showToast, Toast } from "@raycast/api";
import { useExec } from "@raycast/utils";
import { spawnSync } from "child_process";
import { getBin, getEnv } from "./utils";

interface Session {
  key: string;
  ageMs: number;
  totalTokens: number;
  contextTokens: number;
  model: string;
  kind: string;
}

interface SessionsResult {
  sessions: Session[];
}

function formatAge(ms: number): string {
  const m = Math.floor(ms / 60000);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

function formatSessionLabel(key: string): string {
  if (key === "agent:main:main") return "Direct (main)";
  if (key.includes("feishu:direct")) return "Feishu · Direct";
  if (key.includes("feishu:group")) return "Feishu · Group";
  return key.replace("agent:main:", "");
}

function tokenColor(pct: number): Color {
  if (pct < 50) return Color.Green;
  if (pct < 80) return Color.Orange;
  return Color.Red;
}

export default function SessionsCommand() {
  const bin = getBin();
  const env = getEnv();

  const { data, isLoading, revalidate, error } = useExec(bin, ["sessions", "--json", "--no-color"], {
    env,
    keepPreviousData: true,
  });

  function handleCleanup() {
    showToast({ style: Toast.Style.Animated, title: "Cleaning up sessions…" });
    const result = spawnSync(bin, ["sessions", "cleanup", "--no-color"], { encoding: "utf8", env });
    if (result.status === 0) {
      showToast({ style: Toast.Style.Success, title: "Sessions cleaned up" });
      revalidate();
    } else {
      showToast({ style: Toast.Style.Failure, title: "Cleanup failed", message: result.stderr });
    }
  }

  let sessions: Session[] = [];
  if (data) {
    try {
      const parsed: SessionsResult = JSON.parse(data);
      sessions = parsed.sessions ?? [];
    } catch {
      // ignore
    }
  }

  return (
    <List
      isLoading={isLoading}
      navigationTitle="OpenClaw Sessions"
      actions={
        <ActionPanel>
          <Action title="Refresh" icon={Icon.ArrowClockwise} onAction={revalidate} shortcut={{ modifiers: ["cmd"], key: "r" }} />
          <Action title="Cleanup Sessions" icon={Icon.Trash} onAction={handleCleanup} shortcut={{ modifiers: ["cmd", "shift"], key: "d" }} />
        </ActionPanel>
      }
    >
      {error && <List.EmptyView icon={Icon.Warning} title="Failed to load sessions" description={error.message} />}
      {sessions.map((session) => {
        const pct = session.contextTokens > 0 ? Math.round((session.totalTokens / session.contextTokens) * 100) : 0;
        return (
          <List.Item
            key={session.key}
            title={formatSessionLabel(session.key)}
            subtitle={formatAge(session.ageMs)}
            accessories={[
              {
                tag: {
                  value: `${session.totalTokens.toLocaleString()} / ${(session.contextTokens / 1000).toFixed(0)}k (${pct}%)`,
                  color: tokenColor(pct),
                },
              },
              { text: session.model.replace("openrouter/", ""), icon: Icon.Cpu },
            ]}
            actions={
              <ActionPanel>
                <Action title="Refresh" icon={Icon.ArrowClockwise} onAction={revalidate} shortcut={{ modifiers: ["cmd"], key: "r" }} />
                <Action title="Cleanup Sessions" icon={Icon.Trash} onAction={handleCleanup} shortcut={{ modifiers: ["cmd", "shift"], key: "d" }} />
              </ActionPanel>
            }
          />
        );
      })}
    </List>
  );
}
