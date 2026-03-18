import { getPreferenceValues } from "@raycast/api";

const DEFAULT_BIN = "/Users/seven/Library/pnpm/openclaw";

const EXTRA_PATHS = [
  "/Users/seven/.nvm/versions/node/v24.13.1/bin",
  "/Users/seven/Library/pnpm",
  "/opt/homebrew/bin",
  "/usr/local/bin",
  "/usr/bin",
  "/bin",
  "/usr/sbin",
  "/sbin",
];

export function getBin(): string {
  const { binPath } = getPreferenceValues<Preferences>();
  return binPath || DEFAULT_BIN;
}

export function getEnv(): Record<string, string> {
  const currentPath = process.env.PATH ?? "";
  const paths = [...EXTRA_PATHS, currentPath].filter(Boolean).join(":");
  return { ...process.env, PATH: paths } as Record<string, string>;
}
