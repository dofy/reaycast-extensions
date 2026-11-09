import { readFileSync } from "node:fs";
import type { KaonSettings } from "./settings.ts";

/**
 * The token typed into preferences wins. Otherwise it is read from the token
 * file, which is the same file the Hammerspoon widget reads, so one token
 * serves both. The token itself never reaches a user-visible string.
 */
export function resolveToken(
  settings: Pick<KaonSettings, "token" | "tokenPath">,
  read: (path: string) => string = (path) => readFileSync(path, "utf8"),
): string {
  if (settings.token) return settings.token;

  let raw: string;
  try {
    raw = read(settings.tokenPath);
  } catch {
    throw new Error(
      `No token. Set Automation Token in preferences, or create ${settings.tokenPath}.`,
    );
  }

  const token = raw.trim();
  if (!token)
    throw new Error(
      `Token file is empty: ${settings.tokenPath}. Write the kaon_pat_* token into it, or set Automation Token in preferences.`,
    );
  return token;
}
