import { createPoll } from "ags/time";
import { scriptPath } from "resolvescripts";
import type { SystemSignal } from "../helpers/normalize";
import { normalizeWaybar } from "../helpers/normalize";

const SCRIPT = scriptPath("waybar-media.sh");

export const mediaState = createPoll<SystemSignal | null>(
  null,
  2000,
  ["bash", "-lc", SCRIPT],
  (stdout) => {
    try {
      const parsed = JSON.parse(stdout);
      return normalizeWaybar(parsed, { severity: "info" });
    } catch {
      return null;
    }
  },
);

// 🔑 Start polling immediately
mediaState.subscribe(() => {});
