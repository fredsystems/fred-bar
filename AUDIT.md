# fred-bar audit

A senior-engineer pass over `config/`. Findings are grouped and ordered by
impact. Each item carries a stable ID (e.g. `C-1.1`) so we can reference it
in commits and PRs as we work through the list.

Status legend: `[ ]` open · `[x]` done · `[~]` in progress · `[-]` deferred

User-facing summary of the two most-felt symptoms today:

- **Notification spam from volume / brightness OSDs** → `C-1.1`.
- **Window titles go stale** (browser tab change, terminal cwd, etc.)
  without the bar updating → `C-1.2`. Root cause confirmed below.

---

## 1. Correctness bugs

### `[x] C-1.1` Notifications: missing freedesktop hint handling

**File:** `config/services/notifications.tsx:36-62`

`handleNewNotification` ignores three hints that determine whether a
notification should be displayed and/or persisted at all:

- `transient: true` — spec: do **not** add to history. Volume/brightness
  OSDs, swayosd, and `notify-send -h boolean:transient:true` rely on this.
  fred-bar shows them as popups _and_ keeps them in the persistent list.

- `x-canonical-private-synchronous: <tag>` — spec extension used by
  `notify-send -h string:x-canonical-private-synchronous:volume` and by
  `config/right/speaker-volume/volume.tsx`. Means: replace any pending
  notification with the same tag, do not persist. Without it, scrolling
  the volume slider produces N popups + N persisted entries.

- `urgency: 0` (low) typically pairs with transient; system OSD spam is
  almost always low-urgency.

**Decision (recorded):** strict-spec behavior — transient notifications
appear in the popup only and never enter the persistent history.

**Fix sketch:**

1. Extend `NotificationData` with `transient: boolean` and
   `syncTag: string | null`.
2. Read hints in `handleNewNotification` via the AstalNotifd hint API
   (`n.get_hint_string("x-canonical-private-synchronous")`,
   `n.get_hint_boolean("transient")` — verify exact API surface).
3. If `syncTag` is set: find an existing popup with same tag + `appName`,
   dismiss/replace it in `PopupNotificationContainer`, do not add to
   history (mark in `dismissedIds` so `getNotifications()` filters it).
4. If `transient`: route to popup listeners only; mark dismissed-on-popup
   so it never enters history.
5. Mirror filtering in `getNotifications()` so transients can never
   reappear after a rebuild.

---

### `[x] C-1.2` Window titles go stale

**Files:** `config/compositors/hyprland.ts:120-124`,
`config/compositors/niri.ts:283-321`,
`config/center/window-title.tsx`

Two compounding root causes, one per compositor:

**Hyprland:** `notify::focused-title` is connected on the
`Hyprland.Hyprland` manager object. Astal's binding emits this signal on
the focused **client** object, not the manager — so the signal never
fires for title-only changes (browser tab switch, terminal cwd update).
Updates only happen via `notify::focused-client`, which fires on focus
swap but not on in-window title change.

**Niri:** `connect()`'s 200 ms poll tracks `active_window_id` per monitor
but does **not** track window titles. `getAllWorkspacesJson()` reads only
the workspaces JSON; titles live in `niri msg --json windows`. Title
changes within the same focused window leave the cached signature
unchanged and `onFocusedWindowChanged` never fires.

**Tertiary:** `window-title.tsx` early-returns icon updates if
`addressChanged` is false (correct), but the whole `update()` call still
requires the adapter to fire the signal. No fire → no update.

**Fix sketch:**

- Hyprland: track the currently focused client; connect `notify::title`
  on it; re-bind on `notify::focused-client`. Pseudocode:

  ```ts
  let lastFocused: Hyprland.Client | null = null;
  let titleHandler: number | null = null;

  const rewire = () => {
    if (lastFocused && titleHandler !== null) {
      lastFocused.disconnect(titleHandler);
    }
    lastFocused = this.hypr.focused_client;
    titleHandler =
      lastFocused?.connect("notify::title", () =>
        fire("onFocusedWindowChanged"),
      ) ?? null;
    fire("onFocusedWindowChanged");
  };

  this.hypr.connect("notify::focused-client", rewire);
  ```

- Niri: best fix is `C-2.5` (event-stream). Until then, include title in
  the polled signature.

**Cross-link:** `C-2.5` (niri event-stream) supersedes the niri half.

---

### `[x] C-1.3` Volume widget: duplicate `notify::default-speaker` handler

**File:** `config/right/speaker-volume/volume.tsx:168, :201`

Two separate handlers connected on the same signal. Only the first id is
captured in `speakerChangedId`; the second leaks for the lifetime of the
process. Both call `update()` on speaker change, doubling the work.

**Fix:** remove the second `connect`; ensure the single tracked id is
disconnected in `_cleanup`.

---

### `[ ] C-1.4` Calendar fetch race on rapid day navigation

**File:** `config/right/time-pill/calendar-service.tsx`

Rapid `nextDay()` / `previousDay()` taps can resolve old fetches after
newer ones, painting stale data.

**Fix:** monotonically increasing `requestId`; capture at call site;
ignore the response if it doesn't match the latest. Same pattern applies
to DDC `getvcp` polling in `config/sidebar/sliders.tsx:401-424`.

---

### `[ ] C-1.5` Network pill: `notify` (no detail) is too broad

**File:** `config/right/network/network.tsx:201-202, :205-213`

`network.wifi?.connect("notify", update)` fires for _every_ property
change — including signal-strength jitter every few seconds. Each tick
re-shells `nmcli` synchronously on the GTK main thread (line 181 inside
`update()`, plus the 3 s `setInterval` poll at 205).

**Fixes:**

- Subscribe to specific properties (`notify::strength`, `notify::ssid`,
  `notify::internet`, `notify::active-access-point`).

- Move VPN detection off the main thread (`Gio.Subprocess` async, or
  better: see `C-3.1`).

- Best long-term: replace polling with `nmcli monitor` long-running pipe
  or D-Bus `org.freedesktop.NetworkManager` ActiveConnections
  PropertyChanged.

---

### `[ ] C-1.6` Connectivity-toggles: same nmcli-on-main issue

**File:** `config/sidebar/connectivity-toggles.tsx:12-35, :308-319`

Same synchronous `nmcli` shelling pattern. Two files
(`network.tsx` + `connectivity-toggles.tsx`) each spawn `nmcli` every
3 s independently.

**Fix:** centralize in `config/services/vpn.tsx` (see `C-3.1`).

---

### `[x] C-1.7` Sliders: `getDDCMonitors()` blocks on first sidebar open

**File:** `config/sidebar/sliders.tsx:51-125, :681-687`

`spawn_command_line_sync("ddcutil detect …")` can take 1-5 s and runs on
the main loop. The pre-warm at the bottom of the file claims to fix this
but itself uses `_sync` 100 ms after module load — same bug.

**Fix:** detect monitors via `Gio.Subprocess` async with a stdout reader
callback; populate `ddcMonitorsCache` from the callback; fire a
listener-set so widgets refresh.

---

### `[x] C-1.8` Brightness slider: initial DDC fetch fires twice

**File:** `config/sidebar/sliders.tsx:397-424`

Lines 397-399 do an `_async` call whose output is discarded; lines
401-424 do a second `_sync` call 500 ms later. Drop the first.

---

### `[ ] C-1.9` System actions: 3× synchronous `pgrep` per construction

**File:** `config/sidebar/system-actions.tsx:19-46`

Every `SystemActions()` call (each sidebar open) spawns up to three
`pgrep -x` processes synchronously. Compositor doesn't change at
runtime.

**Fix:** detect once at module load (via `services/compositor-detect.tsx`,
see `C-3.1`); reuse the cached value; if `pgrep` fallback is genuinely
needed, make it async.

---

### `[ ] C-1.10` Tray-item: action group registered under 4 prefixes

**File:** `config/left/sys-tray/tray-item.tsx:42-48`

The same `action_group` is inserted under `dbusmenu`, `app`, `unity`,
`indicator`. Works, but duplicates entries in GTK's action map per item.

**Fix:** parse the menu_model once for action references, register only
the prefixes actually used. Default to `dbusmenu` (StatusNotifierItem
spec).

---

### `[ ] C-1.11` Workspaces popover: closes on hover from button to popover

**File:** `config/center/workspaces.tsx:222-231`

Moving from the workspace button into the popover triggers a `leave`
event on the button, which calls `popover.popdown()`. Popover unusable.

**Fix:** add a `Gtk.EventControllerMotion` to the popover; on `enter`
cancel pending close, on `leave` re-arm.

---

### `[ ] C-1.12` Backdrop double-add to App

**File:** `config/helpers/backdrop.tsx:53-58`

Calls both `addWindow` and `add_window`. Only one exists in any given
AGS version.

**Fix:** detect once (typeof check), call the one that exists, drop the
other.

---

### `[~] C-1.13` Mixed timer APIs (`setInterval` / `setTimeout` vs `GLib.timeout_add`)

**Files:**

- `config/center/workspaces.tsx:214` (`setTimeout`) — handled by C-1.11
- `config/compositors/niri.ts:283` (`setInterval`) — handled by C-2.5
- `config/right/network/network.tsx:205` (`setInterval`) — done
- `config/right/battery/battery.tsx:147` (`setInterval`) — done

`setInterval`/`setTimeout` are AGS shims. They lack priority control and
don't survive widget cleanup robustly. The rest of the codebase uses
`GLib.timeout_add` with self-rescheduling for sleep-cascade safety.

**Fix:** standardize on `GLib.timeout_add` + `SOURCE_REMOVE` self-reschedule
(pattern already used in `time-pill.tsx`, `media-player.tsx`,
`tooltip.tsx`).

---

### `[x] C-1.14` Tray dropdown menu clipped on the left

**File:** `config/left/sys-tray/tray-item.tsx:38`,
`config/styles/components/_tray.scss:35-36`

`ensurePopover()` called `popover.set_position(Gtk.PositionType.LEFT)`,
which anchors the popover to the **left side of** the tray button — on
a top bar with the tray on the left edge of the screen the menu opens
off-screen and the monitor edge clips it. Layered on top of that, the
`.tray-menu` SCSS rule applied `margin-left: -32px`, shoving the menu
another 32 px further left.

**Fix (applied):** anchor `Gtk.PositionType.BOTTOM` so the menu drops
straight down from the bar (matching every other GTK status tray) and
remove the `margin-left: -32px` / `margin-top: 32px` workarounds. GTK 4
auto-flips a BOTTOM popover horizontally when it would overflow the
monitor's right edge, so this works regardless of where along the bar
a given tray icon sits.

---

## 2. Memory / performance

### `[x] C-2.1` `systemState` 250 ms churn

**File:** `config/right/system/state/modules/system.tsx:19`,
consumer `config/right/system/state-pill.tsx`

`createPoll(INITIAL, 250, fn)` returns a fresh object literal every
tick. Subscribers fire 4 ×/sec; `state-pill.tsx` rebuilds icon widgets
on every emit. Likely the largest contributor to baseline CPU/mem
growth.

**Two-part fix (do both):**

1. Memoize at source: in the poll fn, build the state, deep-compare to
   last (severity + icons array + summary + sources), return last
   reference if equal.
2. Diff at consumer: `state-pill.tsx` should mutate child labels
   (`set_label`, css class toggles) instead of rebuilding.

**Better long-term:** delete the poll entirely. Each underlying module
(idleInhibit, media, update, network, notification) already has a
signal/service — wire as event sources and recompute only on change.

---

### `[x] C-2.2` Tooltip widget churn on mouse-move

**File:** `config/helpers/tooltip.tsx:28-79`

Existing FIXME flags this. Each `query-tooltip` (fires on every move
inside the anchor) creates a fresh `Gtk.Frame + Gtk.Box + Gtk.Label`.

**Fix:** cache the trio per anchor in closure; on subsequent calls just
`label.set_label(text)` and toggle css classes. Verify whether
`tooltip.set_custom(frame)` reparents/destroys; if so, caching needs a
strategy that survives that (test under `G_DEBUG=gc-friendly`).

---

### `[ ] C-2.3` Multi-monitor popups: per-popup 50 ms timer

**File:** `config/notifications/popup.tsx:144`,
`config/notifications/popup-window.tsx`

Each `PopupNotificationWindow` spawns its own progress-bar timer at
50 ms cadence. With multiple monitors and several popups visible:
N_monitors × N_popups × 20 wakeups/sec.

**Decision (recorded):** popups appear on **focused monitor only**.

**Fix:**

1. Determine focused monitor at the popup container level (Astal
   provides current focused output via the compositor adapter).
2. Only that monitor's container subscribes to popup events; switch
   subscriber on focus change.
3. Bonus: share a single 100 ms timer across all live popups — one
   source, all popups read the elapsed time on tick.

---

### `[ ] C-2.4` Media player: rebuild on active-player swap

**File:** `config/sidebar/media-player.tsx:447-503`

The 2 s `playerSwitchPoll` rebuilds the entire `PlayerWidget` whenever
the "active" player changes (Spotify ↔ Firefox). Artwork, labels,
controls — all rebuilt. Only signal bindings actually need to swap.

**Fix:** track `currentPlayerId`; if swap is to a different player,
disconnect old signals, rebind to new player, call `update()`. Skip the
widget teardown.

---

### `[ ] C-2.5` Niri adapter: drop polling for event-stream

**File:** `config/compositors/niri.ts:283-321`

The 200 ms poll runs 3 sync subprocess calls per tick:
`getWorkspaces()`, `getFocusedWorkspace()`, `getAllWorkspacesJson()`.
That's ~15 fork/exec/sec under niri at idle.

**Decision (recorded):** switch to event-stream.

**Fix:** spawn `niri msg --json event-stream` as a long-running process;
parse stdout line-by-line; emit handler events from incoming
`WorkspacesChanged`, `WorkspaceActivated`, `WindowFocusChanged`,
`WindowOpenedOrChanged` (the latter carries title — fixes the niri half
of `C-1.2`). Use `Gio.Subprocess` + `Gio.DataInputStream.read_line_async`.

---

### `[x] C-2.6` `Gio.AppInfo.get_all()` called per icon resolve

**File:** `config/helpers/icon-resolver.tsx:39`

Every workspace preview, window-title update, notification re-enumerates
all installed `.desktop` files.

**Fix:**

```ts
const monitor = Gio.AppInfoMonitor.get();
let appsCache = Gio.AppInfo.get_all();
monitor.connect("changed", () => {
  appsCache = Gio.AppInfo.get_all();
});
```

Plus a `Map<string, Gio.Icon | null>` memo keyed by `appClass`.

---

### `[x] C-2.7` Dead try/catch arms around `Gio.ThemedIcon.new()`

**File:** `config/helpers/icon-resolver.tsx:31, 69, 78, 87, 94`

`Gio.ThemedIcon.new()` cannot throw in any current GLib. Remove the
try/catch arms; control flow becomes obvious.

---

### `[ ] C-2.8` Battery 2 s poll redundant with `notify::*`

**File:** `config/right/battery/battery.tsx:147`

UPower fires `notify::*` for every state change. The poll exists "to
catch state changes that don't fire events" — workaround for an upstream
bug.

**Fix:** investigate whether the upstream bug still exists; if yes,
document which property is missed; if no, drop the poll.

---

### `[ ] C-2.9` Tray-item tooltip captured at construction

**File:** `config/left/sys-tray/tray-item.tsx:129-135`

`attachTooltip(button, { text: () => tooltip, … })` closes over a
constant `tooltip` resolved once at construction. Tooltip-markup
property changes at runtime are never reflected.

**Fix:** `text: () => resolveTooltipMarkup(item)`.

---

## 3. Architecture / quality

### `[ ] C-3.1` Centralize VPN + compositor detection

**Files:**

- `config/sidebar/connectivity-toggles.tsx`
- `config/right/network/network.tsx`
- `config/sidebar/system-actions.tsx`
- `config/compositors/index.ts`

Multiple files independently shell `nmcli` and `pgrep`.

**Fix:**

- `config/services/vpn.tsx` — singleton, async monitor (or D-Bus),
  expose subscribe API.

- `config/services/compositor-detect.tsx` — detect once at module load,
  cache, expose `getDetectedCompositor(): "hyprland" | "niri" | "sway" | "other"`.

---

### `[ ] C-3.2` `_cleanup` lifecycle is fragile

**Pattern:** widespread.

The `(widget as ... & { _cleanup?: () => void })._cleanup = ...`
convention is never invoked by GTK. It only fires when `app.tsx`'s
recursive walker runs (window destroy). Mid-lifetime removals
(`tray.tsx:30-38`, `media-player.tsx:447-455`) require manual walks
that some sites do and some don't.

**Fix:** prefer `widget.connect("destroy", cleanup)` — GTK fires this on
finalize regardless of how the widget left the tree. Keep `_cleanup` as
a chainable hook, but invoke it from a `destroy` handler so it runs
universally.

---

### `[ ] C-3.3` Monitor detection via undocumented `(root as { monitor?: number })`

**Files:** `config/center/workspaces.tsx:247`,
`config/center/window-title.tsx:89`,
`config/center/active-workspace.tsx:27`

Brittle cast to an undocumented Astal property.
`compositors/index.ts:113` already exposes `getMonitorConnectorName()`
which does it the documented way (`get_native → get_surface →
get_monitor_at_surface → get_connector`).

**Fix:** use `getMonitorConnectorName(box)` everywhere.

---

### `[ ] C-3.4` `clockDrawingAreas.set(c.tzid, ...)` collides on `""`

**File:** `config/right/time-pill/time-pill.tsx:259`

Local clock has `tzid: ""`. Map works today but silently overwrites if
another empty-tzid clock is added.

**Fix:** key by `c.label`, or assert uniqueness in `CLOCKS`.

---

### `[ ] C-3.5` Pervasive `as unknown as { ... }` casts

**Examples:** `config/sidebar/media-player.tsx:278-282`,
`config/center/workspaces.tsx:251-253`.

Hides API drift.

**Fix:** generate proper bindings via `generate_types.sh`. Where casts
remain unavoidable, centralize in `config/helpers/gobject-cast.ts`.

---

### `[ ] C-3.6` Direct `console.{log,error,warn}` everywhere

**Pattern:** widespread.

Long-running journald gets noisy.

**Fix:** add `config/helpers/logger.ts` honoring `AGS_LOG_LEVEL`
(default `warn`). Mechanical replace.

---

## 4. Quick-wins triage

Rough effort × impact ordering for follow-up PRs:

| ID     | Effort | Impact | Notes                                  |
| ------ | ------ | ------ | -------------------------------------- |
| C-1.1  | 1-2 h  | High   | The reason for the audit. Do first.    |
| C-1.2  | 1 h    | High   | Window titles. Hyprland half is small. |
| C-2.1  | 30 min | High   | Eliminates 4 Hz baseline churn.        |
| C-1.3  | 5 min  | Med    | Trivial leak fix.                      |
| C-1.13 | 15 min | Med    | Sleep-cascade hardening.               |
| C-2.6  | 30 min | Med    | Visible during previews.               |
| C-2.2  | 1 h    | Med    | Perceptible smoothness.                |
| C-2.5  | 2-3 h  | High   | Niri-only; biggest niri perf win.      |
| C-1.7  | 1 h    | Med    | First-sidebar-open delay vanishes.     |

---

## 5. Out-of-scope but noticed

- `flake.nix` `patchedAgs` override is correct but the deterministic
  vendorHash needs to be regenerated whenever upstream AGS bumps
  `cli/go.sum`. Document that in `flake.nix` itself near the override.
  Not a code bug.

- `CALENDAR_IMPLEMENTATION.md`, `COMPOSITOR_MIGRATION.md`,
  `CONTRIBUTING.md`, `DDC_SETUP.md`, `NIRI_SUPPORT.md`, `TODO.md` — lots
  of historical docs at repo root. Consider moving to `docs/`. Not a bug.
