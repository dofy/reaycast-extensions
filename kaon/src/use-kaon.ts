import { useCallback, useEffect, useRef, useState } from "react";
import { getPreferenceValues } from "@raycast/api";
import { createClient } from "./api.ts";
import { normalizeSettings } from "./settings.ts";
import type { KaonSettings, SettingsInput } from "./settings.ts";
import { clearFatal, invalidateSummary, refresh } from "./state.ts";
import type { Snapshot } from "./state.ts";
import { loadSnapshot, saveSnapshot } from "./store.ts";
import { resolveToken } from "./token.ts";

export interface KaonState {
  snapshot: Snapshot;
  /** Null when preferences themselves are invalid. */
  settings: KaonSettings | null;
  /** A setup or preference problem, as opposed to an API failure. */
  setupError: string | null;
  isLoading: boolean;
  reload: (force?: boolean) => Promise<void>;
  retryAfterStop: () => Promise<void>;
}

function readSettings(): KaonSettings {
  return normalizeSettings(getPreferenceValues<SettingsInput>());
}

export function useKaon(): KaonState {
  const [snapshot, setSnapshot] = useState<Snapshot>(() => loadSnapshot());
  const [isLoading, setIsLoading] = useState(true);
  const [setupError, setSetupError] = useState<string | null>(null);
  // Invalid preferences must not break rendering: the views fall back to
  // defaults and show the message instead.
  const [settings, setSettings] = useState<KaonSettings | null>(() => {
    try {
      return readSettings();
    } catch {
      return null;
    }
  });
  const inFlight = useRef(false);

  const run = useCallback(
    async (force: boolean, seed?: (prev: Snapshot) => Snapshot) => {
      if (inFlight.current) return;
      inFlight.current = true;
      setIsLoading(true);
      try {
        const resolved = readSettings();
        setSettings(resolved);
        const token = resolveToken(resolved);
        const client = createClient(token, resolved);
        const base = seed ? seed(loadSnapshot()) : loadSnapshot();
        const next = await refresh(client, base, { force });
        saveSnapshot(next);
        setSnapshot(next);
        setSetupError(null);
      } catch (error) {
        setSetupError(
          error instanceof Error ? error.message : "unexpected failure",
        );
      } finally {
        inFlight.current = false;
        setIsLoading(false);
      }
    },
    [],
  );

  useEffect(() => {
    void run(false);
  }, [run]);

  return {
    snapshot,
    settings,
    setupError,
    isLoading,
    reload: (force = false) =>
      run(force, force ? invalidateSummary : undefined),
    retryAfterStop: () =>
      run(true, (prev) => invalidateSummary(clearFatal(prev))),
  };
}
