import type { TitleFormat } from "./settings.ts";

export interface BudgetBody {
  personal_daily_spend_usd?: number;
  personal_daily_budget_usd?: number;
  personal_weekly_spend_usd?: number;
  personal_weekly_budget_usd?: number;
  monthly_spend_usd?: number;
  monthly_budget_usd?: number;
  hard_limit_usd?: number;
  rate_limit_rpm?: number;
  rate_limit_tpm?: number;
}

export interface UsageRow {
  model?: string;
  api_key_name?: string;
  provider_id?: string;
  date?: string;
  total_cost_usd?: number;
  total_requests?: number;
  total_tokens?: number;
}

export interface SummaryBody {
  time_range?: string;
  totals?: UsageRow;
  by_model?: UsageRow[];
  by_key?: UsageRow[];
  by_provider?: UsageRow[];
  by_day?: UsageRow[];
}

export type Severity = "ok" | "warn" | "crit";

export function money(value: unknown): string {
  if (typeof value !== "number" || !Number.isFinite(value)) return "—";
  return `$${value.toFixed(2)}`;
}

/** Token and RPM/TPM counts run to nine digits, unreadable in a menu. */
export function count(value: unknown): string {
  if (typeof value !== "number" || !Number.isFinite(value)) return "—";
  if (value >= 1e9) return `${(value / 1e9).toFixed(1)}B`;
  if (value >= 1e6) return `${(value / 1e6).toFixed(1)}M`;
  if (value >= 1e3) return `${(value / 1e3).toFixed(1)}K`;
  return `${Math.trunc(value)}`;
}

export function spendRatio(budget: BudgetBody | null): number | null {
  if (!budget) return null;
  const spend = budget.personal_daily_spend_usd;
  const cap = budget.personal_daily_budget_usd;
  if (typeof spend !== "number" || typeof cap !== "number" || cap <= 0)
    return null;
  return spend / cap;
}

export function severityFor(
  ratio: number | null,
  warnRatio: number,
  critRatio: number,
): Severity {
  if (ratio === null) return "ok";
  if (ratio >= critRatio) return "crit";
  if (ratio >= warnRatio) return "warn";
  return "ok";
}

/**
 * Menu bar title. Today's spend alone by default: the budget never changes, so
 * repeating it costs menu width for no information. The dropdown and the
 * tooltip still carry the full numbers.
 */
export function menuTitle(
  budget: BudgetBody | null,
  format: TitleFormat,
): string {
  if (!budget) return "…";
  const spend = budget.personal_daily_spend_usd ?? 0;
  const cap = budget.personal_daily_budget_usd;
  switch (format) {
    case "spendExact":
      return `$${spend.toFixed(2)}`;
    case "spendBudget":
      return typeof cap === "number"
        ? `$${Math.round(spend)}/$${Math.round(cap)}`
        : `$${Math.round(spend)}`;
    case "percent": {
      const ratio = spendRatio(budget);
      return ratio === null
        ? `$${Math.round(spend)}`
        : `${Math.round(ratio * 100)}%`;
    }
    default:
      return `$${Math.round(spend)}`;
  }
}

export function budgetLine(
  label: string,
  spend: unknown,
  cap: unknown,
): string {
  if (typeof cap !== "number") return `${label}  ${money(spend)}`;
  const spent = typeof spend === "number" ? spend : 0;
  return `${label}  ${money(spend)} / $${Math.round(cap)}  (剩 ${money(cap - spent)})`;
}

/** Days until `expiresAt`; negative once expired. */
export function daysUntil(expiresAt: number, nowMs: number): number {
  return Math.floor((expiresAt - nowMs) / 86_400_000);
}

export function expiryNote(
  expiresAt: number | null,
  warnDays: number,
  nowMs: number,
): string | null {
  if (expiresAt === null) return null;
  const days = daysUntil(expiresAt, nowMs);
  if (days < 0) return "token 已过期";
  if (days <= warnDays) return `token ${days} 天后过期`;
  return null;
}

export function topN(rows: UsageRow[] | undefined, n: number): UsageRow[] {
  return [...(rows ?? [])]
    .sort((a, b) => (b.total_cost_usd ?? 0) - (a.total_cost_usd ?? 0))
    .slice(0, n);
}

export function rowLabel(row: UsageRow, key: keyof UsageRow): string {
  const label = row[key];
  if (typeof label !== "string" || label === "") return "unknown";
  return label;
}

export function clockTime(epochMs: number): string {
  return new Date(epochMs).toLocaleTimeString(undefined, {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
}
