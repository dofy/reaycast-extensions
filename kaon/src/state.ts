import { ApiError, backoffMs, parseExpiry } from "./api.ts";
import type { BudgetBody, SummaryBody } from "./format.ts";

export interface Snapshot {
  budget: BudgetBody | null;
  summary: SummaryBody | null;
  /** Epoch ms of the last successful summary read. */
  summaryAt: number | null;
  /**
   * Range the cached breakdown was fetched with. The views label the cached
   * numbers with this, not with the current preference, so a range change
   * cannot relabel 7 days of usage as 30.
   */
  summaryRange: string | null;
  /** Automation token expiry, epoch ms. */
  expiresAt: number | null;
  /** Epoch ms of the last `/auth/me` read, successful or not. */
  expiryCheckedAt: number | null;
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
  summaryRange: null,
  expiresAt: null,
  expiryCheckedAt: null,
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
/**
 * The token is read per launch and never cached, so a swapped token cannot be
 * detected directly. Re-reading the expiry once a day picks up the new one.
 */
export const EXPIRY_TTL_MS = 86_400_000;

export interface Client {
  /** Range this client requests the breakdown with. */
  range: string;
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

  // A range change has to get past the fetch floor: the cached breakdown
  // answers a different question now, and waiting out the floor would leave
  // the views labelling the old window as the newly chosen one. Only the
  // breakdown is refetched in that case — the budget counter does not depend
  // on the range, so the floor still protects it.
  const rangeChanged =
    prev.summaryRange !== null && prev.summaryRange !== client.range;
  const throttled = !options.force && now < prev.nextFetch;
  if (throttled && !rangeChanged) return prev;

  const next: Snapshot = { ...prev };

  if (!throttled) {
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
  }

  // A range change invalidates the breakdown on its own: the cached numbers
  // cover a different window, however fresh they are.
  const summaryStale =
    next.summaryAt === null ||
    next.summaryRange !== client.range ||
    now - next.summaryAt > SUMMARY_TTL_MS;
  if (options.force || summaryStale) {
    try {
      next.summary = await client.summary();
      next.summaryAt = now;
      next.summaryRange = client.range;
    } catch (error) {
      const failure = failureFrom(error);
      next.lastError = failure.message;
      if (failure.fatal) {
        next.fatal = failure.message;
        return next;
      }
    }
  }

  // A token that expires silently would otherwise kill the widget with nothing
  // but a 401 to show for it. An expiry already in the past is re-read at once:
  // the token has most likely been replaced since.
  const expiryStale =
    next.expiresAt === null ||
    next.expiryCheckedAt === null ||
    next.expiresAt <= now ||
    now - next.expiryCheckedAt > EXPIRY_TTL_MS;
  if (options.force || (!throttled && expiryStale)) {
    try {
      const me = await client.authMe();
      next.expiresAt = parseExpiry(me.automation_token_expires_at);
      next.expiryCheckedAt = now;
    } catch (error) {
      const failure = failureFrom(error);
      // Keep the stale expiry rather than dropping the warning entirely, but
      // let the next pass try again.
      if (failure.fatal) next.fatal = failure.message;
    }
  }

  return next;
}

/**
 * Clear the stop state so requests resume. The token expiry goes with it: a
 * stop is normally cleared after replacing the token, and the old token's
 * expiry would otherwise stick around as a false warning.
 */
export function clearFatal(prev: Snapshot): Snapshot {
  return {
    ...prev,
    fatal: null,
    failures: 0,
    nextFetch: 0,
    lastError: null,
    expiresAt: null,
    expiryCheckedAt: null,
  };
}
