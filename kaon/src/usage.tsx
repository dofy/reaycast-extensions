import {
  Action,
  ActionPanel,
  Color,
  Icon,
  Keyboard,
  List,
  openCommandPreferences,
} from "@raycast/api";
import {
  clockTime,
  count,
  expiryNote,
  money,
  rowLabel,
  severityFor,
  spendRatio,
  topN,
} from "./format.ts";
import type { BudgetBody, Severity, UsageRow } from "./format.ts";
import { CONSOLE_URL, TOKENS_URL } from "./links.ts";
import { useKaon } from "./use-kaon.ts";

function tintFor(severity: Severity): Color | undefined {
  if (severity === "crit") return Color.Red;
  if (severity === "warn") return Color.Orange;
  return undefined;
}

function budgetAccessories(
  spend: unknown,
  cap: unknown,
): List.Item.Accessory[] {
  if (typeof cap !== "number") return [{ text: money(spend) }];
  const spent = typeof spend === "number" ? spend : 0;
  return [
    { text: `${money(spend)} / $${Math.round(cap)}` },
    { tag: `剩 ${money(cap - spent)}` },
  ];
}

function BudgetSection({
  budget,
  severity,
  ratio,
}: {
  budget: BudgetBody;
  severity: Severity;
  ratio: number | null;
}) {
  return (
    <List.Section
      title="预算"
      subtitle={
        ratio === null ? undefined : `今日用量 ${Math.round(ratio * 100)}%`
      }
    >
      <List.Item
        icon={{ source: Icon.Coins, tintColor: tintFor(severity) }}
        title="今日"
        accessories={budgetAccessories(
          budget.personal_daily_spend_usd,
          budget.personal_daily_budget_usd,
        )}
      />
      <List.Item
        icon={Icon.Calendar}
        title="本周"
        accessories={budgetAccessories(
          budget.personal_weekly_spend_usd,
          budget.personal_weekly_budget_usd,
        )}
      />
      <List.Item
        icon={Icon.Calendar}
        title="本月"
        accessories={budgetAccessories(
          budget.monthly_spend_usd,
          budget.monthly_budget_usd,
        )}
      />
      {typeof budget.hard_limit_usd === "number" ? (
        <List.Item
          icon={Icon.Lock}
          title="硬上限"
          accessories={[{ text: money(budget.hard_limit_usd) }]}
        />
      ) : null}
      <List.Item
        icon={Icon.Gauge}
        title="限速"
        accessories={[
          { text: `${count(budget.rate_limit_rpm)} RPM` },
          { tag: `${count(budget.rate_limit_tpm)} TPM` },
        ]}
      />
    </List.Section>
  );
}

function BreakdownSection({
  title,
  range,
  rows,
  nameKey,
  withRequests,
}: {
  title: string;
  range: string;
  rows: UsageRow[] | undefined;
  nameKey: keyof UsageRow;
  withRequests: boolean;
}) {
  const sorted = topN(rows, 20);
  if (sorted.length === 0) return null;
  return (
    <List.Section title={title} subtitle={`近 ${range}`}>
      {sorted.map((row, index) => (
        <List.Item
          key={`${rowLabel(row, nameKey)}-${index}`}
          icon={Icon.Dot}
          title={rowLabel(row, nameKey)}
          accessories={
            withRequests
              ? [
                  { text: money(row.total_cost_usd) },
                  { tag: `${count(row.total_requests ?? 0)} 次` },
                ]
              : [{ text: money(row.total_cost_usd) }]
          }
        />
      ))}
    </List.Section>
  );
}

export default function Command() {
  const { snapshot, settings, setupError, isLoading, reload, retryAfterStop } =
    useKaon();
  const { budget, summary, fatal, lastError, lastOK, expiresAt } = snapshot;

  const ratio = spendRatio(budget);
  const severity = severityFor(
    ratio,
    settings?.warnRatio ?? 0.7,
    settings?.critRatio ?? 0.9,
  );
  const note = expiryNote(
    expiresAt,
    settings?.expiryWarnDays ?? 14,
    Date.now(),
  );
  const range = summary?.time_range ?? settings?.summaryRange ?? "7d";
  const totals = summary?.totals;
  const blocked = fatal ?? setupError;

  const actions = (
    <ActionPanel>
      <Action
        title="Refresh"
        icon={Icon.ArrowClockwise}
        shortcut={Keyboard.Shortcut.Common.Refresh}
        onAction={() => void reload(false)}
      />
      <Action
        title="Force Refetch"
        icon={Icon.Repeat}
        shortcut={{ modifiers: ["cmd", "shift"], key: "r" }}
        onAction={() => void reload(true)}
      />
      {fatal ? (
        <Action
          title="Retry (Clear Stop State)"
          icon={Icon.Redo}
          onAction={() => void retryAfterStop()}
        />
      ) : null}
      <Action.OpenInBrowser
        title="Open Console"
        url={CONSOLE_URL}
        shortcut={Keyboard.Shortcut.Common.Open}
      />
      <Action.OpenInBrowser title="Open Automation Tokens" url={TOKENS_URL} />
      <Action
        title="Configure Extension"
        icon={Icon.Gear}
        onAction={() => void openCommandPreferences()}
      />
    </ActionPanel>
  );

  if (blocked) {
    return (
      <List isLoading={isLoading} actions={actions}>
        <List.EmptyView
          icon={{ source: Icon.Warning, tintColor: Color.Red }}
          title={fatal ? "已停止请求" : "无法读取用量"}
          description={`${blocked}\n\n停止信号不会自动重试。修好原因后用 Retry 清除停止状态。`}
        />
      </List>
    );
  }

  return (
    <List
      isLoading={isLoading}
      navigationTitle="Kaon Router"
      searchBarPlaceholder="筛选模型、Key、供应商"
      actions={actions}
    >
      {budget ? (
        <BudgetSection budget={budget} severity={severity} ratio={ratio} />
      ) : (
        <List.EmptyView
          icon={Icon.Coins}
          title="读取中…"
          description={lastError ?? undefined}
        />
      )}

      {note ? (
        <List.Section title="提醒">
          <List.Item
            icon={{ source: Icon.Key, tintColor: Color.Orange }}
            title={note}
            accessories={[{ text: "Automation Tokens" }]}
          />
        </List.Section>
      ) : null}

      {lastError ? (
        <List.Section title="上次失败">
          <List.Item
            icon={{ source: Icon.ExclamationMark, tintColor: Color.Orange }}
            title={lastError}
            subtitle={lastOK ? `上次成功 ${clockTime(lastOK)}` : undefined}
          />
        </List.Section>
      ) : null}

      {/* /usage/summary is Prometheus-derived and does not reconcile with the
          budget counter, so it is labelled by its range, not as today. */}
      {summary ? (
        <List.Section title="合计" subtitle={`近 ${range} · Prometheus`}>
          <List.Item
            icon={Icon.BarChart}
            title={money(totals?.total_cost_usd)}
            accessories={[
              { text: `${count(totals?.total_requests ?? 0)} 次` },
              { tag: `${count(totals?.total_tokens ?? 0)} token` },
            ]}
          />
        </List.Section>
      ) : null}

      <BreakdownSection
        title="按模型"
        range={range}
        rows={summary?.by_model}
        nameKey="model"
        withRequests
      />
      <BreakdownSection
        title="按 Key"
        range={range}
        rows={summary?.by_key}
        nameKey="api_key_name"
        withRequests
      />
      <BreakdownSection
        title="按供应商"
        range={range}
        rows={summary?.by_provider}
        nameKey="provider_id"
        withRequests={false}
      />

      {(summary?.by_day ?? []).length > 0 ? (
        <List.Section
          title="按天"
          subtitle="Prometheus；与「今日」不一致属正常"
        >
          {[...(summary?.by_day ?? [])].reverse().map((day, index) => (
            <List.Item
              key={`${day.date ?? index}`}
              icon={Icon.Clock}
              title={day.date ?? "?"}
              accessories={[
                { text: money(day.total_cost_usd) },
                { tag: `${day.total_requests ?? 0} 次` },
              ]}
            />
          ))}
        </List.Section>
      ) : null}
    </List>
  );
}
