import { Cache } from "@raycast/api";
import { EMPTY_SNAPSHOT } from "./state.ts";
import type { Snapshot } from "./state.ts";

/**
 * Raycast launches the menu bar command as its own process on every interval
 * tick, so the stop state, the backoff deadline and the last good numbers have
 * to outlive the process. They are cached, never the token.
 */
const cache = new Cache({ namespace: "kaon-router" });
const KEY = "snapshot";

export function loadSnapshot(): Snapshot {
  const raw = cache.get(KEY);
  if (!raw) return EMPTY_SNAPSHOT;
  try {
    return { ...EMPTY_SNAPSHOT, ...(JSON.parse(raw) as Partial<Snapshot>) };
  } catch {
    return EMPTY_SNAPSHOT;
  }
}

export function saveSnapshot(snapshot: Snapshot): void {
  cache.set(KEY, JSON.stringify(snapshot));
}
