import {
  openExtensionPreferences,
  ActionPanel,
  Action,
  Detail,
  Icon,
  showToast,
  Toast,
  Color,
} from "@raycast/api";
import { usePromise } from "@raycast/utils";
import { getSettings, runCli } from "./utils";
import type { OpenClawSettings } from "./settings";
import { parseHealth, formatHealth } from "./data";

export default function StatusCommand() {
  const settingsKey = JSON.stringify(getSettings());
  const { data, isLoading, revalidate, error } = usePromise(
    async (serialized: string) => {
      const health = parseHealth(
        await runCli(
          ["health", "--json", "--no-color"],
          JSON.parse(serialized) as OpenClawSettings,
        ),
      );
      return {
        health,
        markdown: formatHealth(health),
        checkedAt: new Date().toLocaleTimeString(undefined, { hour12: false }),
      };
    },
    [settingsKey],
  );

  async function handleRestart() {
    await showToast({
      style: Toast.Style.Animated,
      title: "正在重启 Gateway…",
    });
    try {
      await runCli(["gateway", "restart", "--no-color"]);
      await showToast({
        style: Toast.Style.Success,
        title: "Gateway 已重启",
      });
      await revalidate();
    } catch (error) {
      await showToast({
        style: Toast.Style.Failure,
        title: "重启失败",
        message: error instanceof Error ? error.message : "Unknown error",
      });
    }
  }

  return (
    <Detail
      isLoading={isLoading}
      markdown={
        error
          ? `# 暂时无法读取状态\n\n${error.message}\n\n请检查 Gateway 和可执行文件路径，按 ⌘R 重试。`
          : (data?.markdown ?? "正在检查 Gateway…")
      }
      navigationTitle="OpenClaw 状态"
      metadata={
        data && !error ? (
          <Detail.Metadata>
            <Detail.Metadata.TagList title="Gateway">
              <Detail.Metadata.TagList.Item
                text={data.health.ok ? "正常" : "异常"}
                color={data.health.ok ? Color.Green : Color.Red}
              />
            </Detail.Metadata.TagList>
            <Detail.Metadata.Label
              title="检查耗时"
              text={
                data.health.durationMs === null
                  ? "未报告"
                  : `${data.health.durationMs} ms`
              }
            />
            <Detail.Metadata.Label
              title="会话数量"
              text={
                data.health.sessionCount === null
                  ? "未报告"
                  : String(data.health.sessionCount)
              }
            />
            <Detail.Metadata.Label title="检查时间" text={data.checkedAt} />
            <Detail.Metadata.Separator />
            <Detail.Metadata.TagList title="渠道">
              {data.health.channels.map((channel) => (
                <Detail.Metadata.TagList.Item
                  key={channel.id}
                  text={`${channel.name} · ${channel.summary}`}
                  color={
                    channel.state === "ok"
                      ? Color.Green
                      : channel.state === "warning"
                        ? Color.Orange
                        : Color.SecondaryText
                  }
                />
              ))}
            </Detail.Metadata.TagList>
            <Detail.Metadata.Label
              title="需关注"
              text={String(data.health.issues.length)}
            />
          </Detail.Metadata>
        ) : undefined
      }
      actions={
        <ActionPanel>
          <Action
            title="Refresh"
            icon={Icon.ArrowClockwise}
            onAction={revalidate}
            shortcut={{ modifiers: ["cmd"], key: "r" }}
          />
          <Action
            title="Restart Gateway"
            icon={Icon.Repeat}
            onAction={handleRestart}
            shortcut={{ modifiers: ["cmd", "shift"], key: "r" }}
          />
          <Action
            title="Extension Preferences"
            icon={Icon.Gear}
            onAction={openExtensionPreferences}
          />
        </ActionPanel>
      }
    />
  );
}
