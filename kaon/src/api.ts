import type { BudgetBody, SummaryBody } from "./format.ts";
import type { KaonSettings } from "./settings.ts";

export interface ApiFailure {
  /** Human-readable and token-free. Never carries a response body. */
  message: string;
  /** A stop signal: do not retry, or the token risks suspension. */
  fatal: boolean;
}

export class ApiError extends Error {
  readonly fatal: boolean;
  constructor(failure: ApiFailure) {
    super(failure.message);
    this.name = "ApiError";
    this.fatal = failure.fatal;
  }
}

/**
 * Never put a response body in a user-visible string: it is control-plane data.
 * Only the status code and a fixed label are reported.
 */
export function classifyStatus(status: number): ApiFailure {
  if (status === 401)
    return { message: "401 token invalid or expired", fatal: true };
  if (status === 403)
    return { message: "403 missing usage:read scope", fatal: true };
  if (status === 429) return { message: "429 throttled", fatal: true };
  return { message: `${status} unexpected status`, fatal: false };
}

/** A Kaon stop signal must not be retried; retrying risks token suspension. */
export function isStopSignal(payload: unknown): boolean {
  if (typeof payload !== "object" || payload === null) return false;
  const body = payload as { code?: unknown; error?: unknown };
  const code = typeof body.code === "string" ? body.code : body.error;
  if (typeof code !== "string") return false;
  return (
    code.includes("automation_protocol_throttled") ||
    code.includes("automation_token_suspended") ||
    code.includes("operation_plan_denied")
  );
}

/**
 * `automation_token_expires_at` is UTC. A bare timestamp with no zone suffix is
 * still UTC, so it is forced to UTC rather than read as local time.
 */
export function parseExpiry(value: unknown): number | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/.test(trimmed)) return null;
  const withZone = /(Z|[+-]\d{2}:?\d{2})$/.test(trimmed)
    ? trimmed
    : `${trimmed}Z`;
  const parsed = Date.parse(withZone);
  return Number.isNaN(parsed) ? null : parsed;
}

/** Seconds added per consecutive failure, capped, before another attempt. */
export const BACKOFF_STEP_MS = 60_000;
export const BACKOFF_MAX_MS = 1_800_000;

export function backoffMs(failures: number): number {
  return Math.min(BACKOFF_MAX_MS, Math.max(1, failures) * BACKOFF_STEP_MS);
}

export interface FetchLike {
  (
    url: string,
    init: { headers: Record<string, string>; signal: AbortSignal },
  ): Promise<{
    ok: boolean;
    status: number;
    json: () => Promise<unknown>;
    text: () => Promise<string>;
  }>;
}

async function request<T>(
  path: string,
  token: string,
  settings: Pick<KaonSettings, "baseURL" | "requestTimeoutMs">,
  fetchImpl: FetchLike,
): Promise<T> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), settings.requestTimeoutMs);
  let response;
  try {
    response = await fetchImpl(`${settings.baseURL}${path}`, {
      headers: { Authorization: `Bearer ${token}`, Accept: "application/json" },
      signal: controller.signal,
    });
  } catch {
    throw new ApiError({ message: "network unreachable", fatal: false });
  } finally {
    clearTimeout(timer);
  }

  if (!response.ok) {
    const failure = classifyStatus(response.status);
    let stop = failure.fatal;
    if (!stop) {
      // Read the body only to look for a stop signal; it is never shown.
      try {
        stop = isStopSignal(await response.json());
      } catch {
        stop = false;
      }
    }
    throw new ApiError({ message: `${path}: ${failure.message}`, fatal: stop });
  }

  try {
    return (await response.json()) as T;
  } catch {
    throw new ApiError({
      message: `malformed JSON from ${path}`,
      fatal: false,
    });
  }
}

export function createClient(
  token: string,
  settings: Pick<KaonSettings, "baseURL" | "requestTimeoutMs" | "summaryRange">,
  fetchImpl: FetchLike = globalThis.fetch as unknown as FetchLike,
) {
  return {
    /**
     * `/users/me/budget` is authoritative: it is the counter the console's own
     * /keys banner shows and the one that actually gates requests.
     */
    budget: () =>
      request<BudgetBody>("/users/me/budget", token, settings, fetchImpl),
    /**
     * `/usage/summary` is Prometheus-derived and does not reconcile with the
     * budget counter, so it is used only for the breakdown. `source=starrocks`
     * is a T+1 warehouse — its newest bucket is yesterday — so it is never used.
     */
    summary: () =>
      request<SummaryBody>(
        `/usage/summary?range=${settings.summaryRange}`,
        token,
        settings,
        fetchImpl,
      ),
    authMe: () =>
      request<{ automation_token_expires_at?: string }>(
        "/auth/me",
        token,
        settings,
        fetchImpl,
      ),
  };
}
