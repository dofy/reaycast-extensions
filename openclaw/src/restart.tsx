import { showHUD, showToast, Toast } from "@raycast/api";
import { spawnSync } from "child_process";
import { getBin, getEnv } from "./utils";

export default async function RestartCommand() {
  const bin = getBin();
  const env = getEnv();

  await showToast({ style: Toast.Style.Animated, title: "Restarting OpenClaw gateway…" });

  const result = spawnSync(bin, ["gateway", "restart", "--no-color"], { encoding: "utf8", env });

  if (result.status === 0) {
    await showHUD("✅ OpenClaw gateway restarted");
  } else {
    await showHUD(`❌ Restart failed: ${result.stderr || result.stdout || "unknown error"}`);
  }
}
