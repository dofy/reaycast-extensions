import { ApiError, backoffMs, parseExpiry } from "./api.ts";
import type { BudgetBody, SummaryBody } from "./format.ts";

export interface Snapshot {
  budget: BudgetBody | null;
  summary: SummaryBody | null;
  /** Epoch ms of the last successful summary read. */
  summaryAt: number | null;
  /** Automation token expiry, epoch ms. */
  expiresAt: number | null;
  /** Epoch ms of the last successful budget read. */
  lastOK: number | null;
  /** Human-readable and token-free. */
  lastError: string | null;
  /** Set once; stops all further requests until cleared. */
  fatal: string | null;
  failures: number;
  /** Epoch ms before which no request is issued. */
  nextFetch: number;
}

export const EMPTY_SNAPSHOT: Snapshot = {
  budget: null,
  summary: null,
  summaryAt: null,
  expiresAt: null,
  lastOK: null,
  lastError: null,
  fatal: null,
  failures: 0,
  nextFetch: 0,
};

/**
 * Usage is not second-scale data, and the menu bar command is also launched on
 * open, not only on its interval. This floor keeps an open-and-close loop from
 * hammering the control plane.
 */
export const MIN_FETCH_INTERVAL_MS = 270_000;
/** The breakdown is the heavier call, so it refreshes far less often. */
export const SUMMARY_TTL_MS = 1_800_000;

export interface Client {
  budget: () => Promise<BudgetBody>;
  summary: () => Promise<SummaryBody>;
  authMe: () => Promise<{ automation_token_expires_at?: string }>;
}

export interface RefreshOptions {
  /** Ignore both the fetch floor and the summary TTL. */
  force?: boolean;
  nowMs?: number;
}

function failureFrom(error: unknown): { message: string; fatal: boolean } {
  if (error instanceof ApiError)
    return { message: error.message, fatal: error.fatal };
  return { message: "unexpected failure", fatal: false };
}

/**
 * One refresh pass. Returns the next snapshot; never throws. A fatal snapshot
 * is returned untouched, because `automation_protocol_throttled` and
 * `automation_token_suspended` are stop signals in the Kaon admin contract, not
 * retry signals.
 */
export async function refresh(
  client: Client,
  prev: Snapshot,
  options: RefreshOptions = {},
): Promise<Snapshot> {
  const now = options.nowMs ?? Date.now();
  if (prev.fatal) return prev;
  if (!options.force && now < prev.nextFetch) return prev;

  const next: Snapshot = { ...prev };

  try {
    next.budget = await client.budget();
    next.lastOK = now;
    next.lastError = null;
    next.failures = 0;
    next.nextFetch = now + MIN_FETCH_INTERVAL_MS;
  } catch (error) {
    const failure = failureFrom(error);
    next.failures = prev.failures + 1;
    next.lastError = failure.message;
    next.nextFetch = now + backoffMs(next.failures);
    if (failure.fatal) next.fatal = failure.message;
    return next;
  }

  const summaryStale =
    next.summaryAt === null || now - next.summaryAt > SUMMARY_TTL_MS;
  if (options.force || summaryStale) {
    try {
      next.summary = await client.summary();
      next.summaryAt = now;
    } catch (error) {
      const failure = failureFrom(error);
      next.lastError = failure.message;
      if (failure.fatal) {
        next.fatal = failure.message;
        return next;
      }
    }
  }

  // One extra call per token: a token that expires silently would otherwise
  // kill the widget with nothing but a 401 to show for it.
  if (next.expiresAt === null) {
    try {
      const me = await client.authMe();
      next.expiresAt = parseExpiry(me.automation_token_expires_at);
    } catch (error) {
      const failure = failureFrom(error);
      if (failure.fatal) next.fatal = failure.message;
    }
  }

  return next;
}

export function clearFatal(prev: Snapshot): Snapshot {
  return { ...prev, fatal: null, failures: 0, nextFetch: 0, lastError: null };
}

/** Drop the breakdown so the next pass refetches it. */
export function invalidateSummary(prev: Snapshot): Snapshot {
  return { ...prev, summary: null, summaryAt: null, nextFetch: 0 };
}
