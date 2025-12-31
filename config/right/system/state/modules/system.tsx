import { createPoll } from "ags/time";
import type { AggregatedSystemState } from "../helpers/aggregate";
import { resolveSystemState } from "../helpers/aggregate";

import { idleInhibitState } from "../modules/idleInhibit";
import { mediaState } from "../modules/media";
import { networkState } from "./networkState";
import { notificationState } from "./notificationState";
import { updateState } from "./updateState";

const INITIAL: AggregatedSystemState = {
  severity: "idle",
  icon: null,
  icons: [],
  summary: "",
  sources: [],
};

export const systemState = createPoll<AggregatedSystemState>(INITIAL, 250, () =>
  resolveSystemState([
    idleInhibitState(),
    mediaState(),
    updateState(),
    networkState(),
    notificationState(),
  ]),
);
