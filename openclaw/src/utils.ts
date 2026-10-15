import { getPreferenceValues } from "@raycast/api";
import { commandEnvironment, resolveBinary, runExecutable } from "./runtime";

export function getBin(): string {
  const { binPath } = getPreferenceValues<Preferences>();
  return resolveBinary(binPath);
}

export function getEnv(binary = getBin()): NodeJS.ProcessEnv {
  return commandEnvironment(binary);
}

export function runCli(args: string[]): Promise<string> {
  const binary = getBin();
  return runExecutable(binary, args, getEnv(binary));
}
