import { createPoll } from "ags/time";
import { scriptPath } from "helpers/resolvescripts";
import type { SystemSignal } from "../helpers/normalize";
import { normalizeWaybar } from "../helpers/normalize";

const SCRIPT = scriptPath("waybar-updates.sh");

export const updateState = createPoll<SystemSignal | null>(
  null,
  5000,
  ["bash", "-lc", SCRIPT],
  (stdout) => {
    try {
      const parsed = JSON.parse(stdout);

      const cls = parsed.class;
      const severity =
        cls === "reboot" ? "warn" : cls === "updates" ? "warn" : "idle";

      return normalizeWaybar(parsed, { severity });
    } catch {
      return null;
    }
  },
);

// Start polling immediately
updateState.subscribe(() => {});
