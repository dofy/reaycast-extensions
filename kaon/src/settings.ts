import { homedir } from "node:os";
import { isAbsolute } from "node:path";

/** Range tokens the Admin API accepts for `/usage/summary`. */
export const SUMMARY_RANGES = ["5m", "1h", "24h", "7d", "30d"] as const;
export type SummaryRange = (typeof SUMMARY_RANGES)[number];

export const TITLE_FORMATS = [
  "spend",
  "spendExact",
  "spendBudget",
  "percent",
] as const;
export type TitleFormat = (typeof TITLE_FORMATS)[number];

export interface SettingsInput {
  token?: string;
  tokenPath?: string;
  baseURL?: string;
  titleFormat?: string;
  warnRatio?: string;
  critRatio?: string;
  summaryRange?: string;
  expiryWarnDays?: string;
  requestTimeoutSeconds?: string;
}

export interface KaonSettings {
  /** Token typed into preferences; takes precedence over `tokenPath`. */
  token: string;
  /** Absolute path to the token file, used when `token` is empty. */
  tokenPath: string;
  baseURL: string;
  titleFormat: TitleFormat;
  warnRatio: number;
  critRatio: number;
  summaryRange: SummaryRange;
  expiryWarnDays: number;
  requestTimeoutMs: number;
}

export const DEFAULT_BASE_URL =
  "https://kaon-router-admin-api.kaonai.com/api/v1";
export const DEFAULT_TOKEN_PATH = "~/.config/kaon/token";

function expandPath(value: string, label: string, home: string): string {
  const path = value.trim().replace(/^~(?=\/|$)/, home);
  if (!isAbsolute(path))
    throw new Error(`${label} must be an absolute path or a ~/ path.`);
  return path;
}

function ratio(
  value: string | undefined,
  fallback: number,
  label: string,
): number {
  const raw = value?.trim();
  if (!raw) return fallback;
  const parsed = Number(raw);
  if (!Number.isFinite(parsed) || parsed < 0 || parsed > 1)
    throw new Error(
      `${label} must be a number from 0 to 1. Check extension preferences.`,
    );
  return parsed;
}

function integer(
  value: string | undefined,
  fallback: number,
  min: number,
  max: number,
  label: string,
): number {
  const raw = value?.trim();
  if (!raw) return fallback;
  const parsed = Number(raw);
  if (!Number.isInteger(parsed) || parsed < min || parsed > max)
    throw new Error(
      `${label} must be an integer from ${min} to ${max}. Check extension preferences.`,
    );
  return parsed;
}

export function normalizeSettings(
  input: SettingsInput = {},
  home: string = homedir(),
): KaonSettings {
  const baseURL = (input.baseURL?.trim() || DEFAULT_BASE_URL).replace(
    /\/+$/,
    "",
  );
  if (!/^https:\/\/[^\s/]+/.test(baseURL))
    throw new Error(
      "Admin API Base URL must be an https URL. Check extension preferences.",
    );

  const titleFormat = (input.titleFormat?.trim() || "spend") as TitleFormat;
  if (!TITLE_FORMATS.includes(titleFormat))
    throw new Error("Invalid Menu Bar Title. Check extension preferences.");

  const summaryRange = (input.summaryRange?.trim() || "7d") as SummaryRange;
  if (!SUMMARY_RANGES.includes(summaryRange))
    throw new Error("Invalid Breakdown Range. Check extension preferences.");

  const warnRatio = ratio(input.warnRatio, 0.7, "Warning Threshold");
  const critRatio = ratio(input.critRatio, 0.9, "Critical Threshold");
  if (critRatio < warnRatio)
    throw new Error(
      "Critical Threshold must not be below Warning Threshold. Check extension preferences.",
    );

  return {
    token: input.token?.trim() ?? "",
    tokenPath: expandPath(
      input.tokenPath?.trim() || DEFAULT_TOKEN_PATH,
      "Token File Path",
      home,
    ),
    baseURL,
    titleFormat,
    warnRatio,
    critRatio,
    summaryRange,
    expiryWarnDays: integer(
      input.expiryWarnDays,
      14,
      0,
      365,
      "Token Expiry Warning",
    ),
    requestTimeoutMs:
      integer(input.requestTimeoutSeconds, 15, 1, 120, "Request Timeout") *
      1000,
  };
}
