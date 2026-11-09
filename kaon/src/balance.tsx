import {
  Color,
  Icon,
  Keyboard,
  MenuBarExtra,
  open,
  openExtensionPreferences,
} from "@raycast/api";
import {
  budgetLine,
  clockTime,
  count,
  expiryNote,
  menuTitle,
  money,
  rowLabel,
  severityFor,
  spendRatio,
  topN,
} from "./format.ts";
import type { Severity, UsageRow } from "./format.ts";
import { CONSOLE_URL } from "./links.ts";
import { useKaon } from "./use-kaon.ts";

function tintFor(severity: Severity): Color | undefined {
  if (severity === "crit") return Color.Red;
  if (severity === "warn") return Color.Orange;
  return undefined;
}

export default function Command() {
  const { snapshot, settings, setupError, isLoading, reload, retryAfterStop } =
    useKaon();
  const {
    budget,
    summary,
    summaryRange: cachedRange,
    fatal,
    lastError,
    lastOK,
    expiresAt,
  } = snapshot;

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

  const blocked = fatal ?? setupError;
  // The menu bar title cannot carry colour, so severity is shown by tinting
  // the icon instead.
  const icon = blocked
    ? { source: Icon.Warning, tintColor: Color.Red }
    : { source: Icon.Coins, tintColor: tintFor(severity) };

  const tooltip: string[] = [];
  if (blocked) {
    tooltip.push(`Kaon: ${blocked}`);
  } else if (budget) {
    const spend = budget.personal_daily_spend_usd ?? 0;
    tooltip.push(`今日 ${money(spend)}`);
    const cap = budget.personal_daily_budget_usd;
    if (typeof cap === "number")
      tooltip.push(`预算 $${Math.round(cap)}  剩余 ${money(cap - spend)}`);
    if (lastError) tooltip.push(`上次失败: ${lastError}`);
    if (note) tooltip.push(note);
    if (lastOK) tooltip.push(`更新于 ${clockTime(lastOK)}`);
  } else {
    tooltip.push(lastError ?? "Kaon: 读取中");
  }

  const range =
    summary?.time_range ?? cachedRange ?? settings?.summaryRange ?? "7d";
  const totals = summary?.totals;

  const breakdown = (
    title: string,
    rows: UsageRow[] | undefined,
    nameKey: keyof UsageRow,
    withRequests: boolean,
  ) => {
    const top = topN(rows, 5);
    if (top.length === 0) return null;
    return (
      <MenuBarExtra.Submenu key={title} title={`${title} (近 ${range})`}>
        {top.map((row, index) => (
          <MenuBarExtra.Item
            key={`${rowLabel(row, nameKey)}-${index}`}
            title={rowLabel(row, nameKey)}
            subtitle={
              withRequests
                ? `${money(row.total_cost_usd)} · ${count(row.total_requests ?? 0)} 次`
                : money(row.total_cost_usd)
            }
          />
        ))}
      </MenuBarExtra.Submenu>
    );
  };

  return (
    <MenuBarExtra
      icon={icon}
      title={
        blocked
          ? undefined
          : menuTitle(budget, settings?.titleFormat ?? "spend")
      }
      tooltip={tooltip.join("\n")}
      isLoading={isLoading}
    >
      {blocked ? (
        <MenuBarExtra.Section>
          <MenuBarExtra.Item title={`已停止: ${blocked}`} />
          {fatal ? (
            <MenuBarExtra.Item
              title="Retry (Clear Stop State)"
              icon={Icon.ArrowClockwise}
              onAction={() => void retryAfterStop()}
            />
          ) : null}
        </MenuBarExtra.Section>
      ) : null}

      {!blocked && budget ? (
        <MenuBarExtra.Section>
          <MenuBarExtra.Item
            title={budgetLine(
              "今日",
              budget.personal_daily_spend_usd,
              budget.personal_daily_budget_usd,
            )}
          />
          <MenuBarExtra.Item
            title={budgetLine(
              "本周",
              budget.personal_weekly_spend_usd,
              budget.personal_weekly_budget_usd,
            )}
          />
          <MenuBarExtra.Item
            title={budgetLine(
              "本月",
              budget.monthly_spend_usd,
              budget.monthly_budget_usd,
            )}
          />
          {typeof budget.hard_limit_usd === "number" ? (
            <MenuBarExtra.Item
              title={`硬上限  ${money(budget.hard_limit_usd)}`}
            />
          ) : null}
          <MenuBarExtra.Item
            title={`限速  ${count(budget.rate_limit_rpm)} RPM / ${count(budget.rate_limit_tpm)} TPM`}
          />
        </MenuBarExtra.Section>
      ) : null}

      {!blocked && !budget ? (
        <MenuBarExtra.Section>
          <MenuBarExtra.Item title={lastError ?? "读取中…"} />
        </MenuBarExtra.Section>
      ) : null}

      {/* The summary cannot be narrowed to today, so it is labelled by its
          range rather than presented as today's numbers. */}
      {!blocked && summary ? (
        <MenuBarExtra.Section>
          <MenuBarExtra.Item
            title={`近 ${range}  ${money(totals?.total_cost_usd)} · ${count(totals?.total_requests ?? 0)} 次 · ${count(totals?.total_tokens ?? 0)} token`}
          />
          {breakdown("按模型", summary.by_model, "model", true)}
          {breakdown("按 Key", summary.by_key, "api_key_name", true)}
          {/* by_provider's total_requests is 0 for every provider, so only its
              cost is shown. */}
          {breakdown("按供应商", summary.by_provider, "provider_id", false)}
          {(summary.by_day ?? []).length > 0 ? (
            <MenuBarExtra.Submenu title="按天 (Prometheus)">
              {[...(summary.by_day ?? [])].reverse().map((day, index) => (
                <MenuBarExtra.Item
                  key={`${day.date ?? index}`}
                  title={day.date ?? "?"}
                  subtitle={`${money(day.total_cost_usd)} · ${day.total_requests ?? 0} 次`}
                />
              ))}
              <MenuBarExtra.Section>
                <MenuBarExtra.Item title="与「今日」不一致属正常: 来源不同" />
              </MenuBarExtra.Section>
            </MenuBarExtra.Submenu>
          ) : null}
        </MenuBarExtra.Section>
      ) : null}

      {note && !blocked ? (
        <MenuBarExtra.Section>
          <MenuBarExtra.Item title={`⚠ ${note}`} />
        </MenuBarExtra.Section>
      ) : null}

      <MenuBarExtra.Section>
        <MenuBarExtra.Item
          title="Open Console"
          icon={Icon.Globe}
          onAction={() => void open(CONSOLE_URL)}
        />
        <MenuBarExtra.Item
          title="Force Refetch"
          icon={Icon.ArrowClockwise}
          shortcut={Keyboard.Shortcut.Common.Refresh}
          onAction={() => void reload(true)}
        />
        <MenuBarExtra.Item
          title="Configure Extension"
          icon={Icon.Gear}
          onAction={() => void openExtensionPreferences()}
        />
      </MenuBarExtra.Section>
    </MenuBarExtra>
  );
}
