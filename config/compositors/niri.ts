import Gio from "gi://Gio";
import GLib from "gi://GLib";
import type {
  CompositorAdapter,
  CompositorEventHandlers,
  CompositorWindow,
  CompositorWorkspace,
} from "./types";

/**
 * Workspace data from niri JSON output / event stream.
 */
interface NiriWorkspaceJson {
  id: number;
  idx: number;
  name: string | null;
  output: string;
  is_urgent: boolean;
  is_active: boolean;
  is_focused: boolean;
  active_window_id: number | null;
}

interface NiriWindowJson {
  id: number;
  title: string | null;
  app_id: string | null;
  workspace_id: number | null;
  is_focused?: boolean;
}

/* --------------------------------------------------------------------------
 * Event payload shapes
 *
 * niri emits one JSON object per line on `niri msg --json event-stream`.
 * Each object has a single key naming the event variant; the value is a
 * payload object. We type only the fields we use; unknown keys are ignored.
 * Reference: niri-ipc Event enum.
 * ------------------------------------------------------------------------ */
type NiriEvent =
  | { WorkspacesChanged: { workspaces: NiriWorkspaceJson[] } }
  | { WorkspaceActivated: { id: number; focused: boolean } }
  | {
      WorkspaceActiveWindowChanged: {
        workspace_id: number;
        active_window_id: number | null;
      };
    }
  | { WindowsChanged: { windows: NiriWindowJson[] } }
  | { WindowOpenedOrChanged: { window: NiriWindowJson } }
  | { WindowClosed: { id: number } }
  | { WindowFocusChanged: { id: number | null } }
  | { KeyboardLayoutsChanged: unknown }
  | { KeyboardLayoutSwitched: unknown }
  | { OverviewOpenedOrClosed: unknown };

/**
 * Niri compositor adapter
 *
 * Subscribes to `niri msg --json event-stream` once at construction. All
 * `getWorkspaces`/`getWindows`/`getFocused*` calls become pure reads against
 * in-process state — no subprocess spawn per call, no 200ms polling. The
 * stream is consumed line-by-line via Gio.DataInputStream's async API, so
 * the GTK main loop never blocks on i/o. If the niri socket dies (compositor
 * restart, niri exit) we reconnect with exponential backoff.
 *
 * Action commands (`focus-workspace`, `focus-window`) are still issued via
 * one-shot async subprocesses — those are write paths that don't produce
 * events we care about consuming.
 */
export class NiriAdapter implements CompositorAdapter {
  readonly name = "niri";
  readonly supportsWorkspaces = true;
  readonly supportsWindows = true;

  private eventHandlers: Array<CompositorEventHandlers> = [];

  // In-memory mirror of niri's state. Keyed by id for O(1) updates.
  private workspaces = new Map<number, NiriWorkspaceJson>();
  private windows = new Map<number, NiriWindowJson>();
  private focusedWindowId: number | null = null;

  // Cached focused-output name. WorkspaceActivated{focused:true} updates it
  // without us having to spawn `niri msg focused-output` ever again after
  // the initial bootstrap.
  private focusedOutput: string | null = null;

  // Subprocess + stream handles for the event-stream pipe.
  private streamProc: Gio.Subprocess | null = null;
  private streamCancel: Gio.Cancellable | null = null;
  private streamInput: Gio.DataInputStream | null = null;
  private reconnectTimeoutId: number | null = null;
  private reconnectDelayMs = 250;

  constructor() {
    // Bootstrap the focused-output name synchronously once. This is the only
    // remaining spawn_command_line_sync in this adapter and runs at startup
    // before any UI work, so a few ms of latency here is acceptable.
    this.focusedOutput = this.getFocusedOutputNameSync();
    this.startEventStream();
  }

  /* ------------------------------------------------------------------------
   * Event stream lifecycle
   * ---------------------------------------------------------------------- */

  private startEventStream(): void {
    if (this.streamProc) return;

    let proc: Gio.Subprocess;
    try {
      proc = Gio.Subprocess.new(
        ["niri", "msg", "--json", "event-stream"],
        Gio.SubprocessFlags.STDOUT_PIPE | Gio.SubprocessFlags.STDERR_SILENCE,
      );
    } catch (error) {
      console.error("[NiriAdapter] Failed to spawn event-stream:", error);
      this.scheduleReconnect();
      return;
    }

    const stdout = proc.get_stdout_pipe();
    if (!stdout) {
      console.error("[NiriAdapter] event-stream subprocess has no stdout pipe");
      proc.force_exit();
      this.scheduleReconnect();
      return;
    }

    const cancel = new Gio.Cancellable();
    const input = new Gio.DataInputStream({ base_stream: stdout });

    this.streamProc = proc;
    this.streamCancel = cancel;
    this.streamInput = input;

    // Reset backoff once the connection is live.
    this.reconnectDelayMs = 250;

    proc.wait_async(cancel, (_p, _res) => {
      // The event-stream process exited (niri restart, kill, crash).
      // Clean up and reconnect — the bar is the long-lived peer here.
      this.teardownStream();
      this.scheduleReconnect();
    });

    this.readNextLine();
  }

  private readNextLine(): void {
    const input = this.streamInput;
    const cancel = this.streamCancel;
    if (!input || !cancel) return;

    input.read_line_async(GLib.PRIORITY_DEFAULT, cancel, (_stream, res) => {
      let line: string | null = null;
      try {
        const [bytes /*, length */] = input.read_line_finish_utf8(res);
        line = bytes;
      } catch (err) {
        // Cancellation throws here during teardown; ignore. Anything else is
        // a genuine i/o error and we'll let wait_async drive the reconnect.
        if (cancel.is_cancelled()) return;
        console.error("[NiriAdapter] read_line_async error:", err);
        return;
      }

      if (line === null) {
        // EOF: stdout closed. wait_async will fire and reconnect.
        return;
      }

      if (line.length > 0) {
        this.handleEventLine(line);
      }

      this.readNextLine();
    });
  }

  private teardownStream(): void {
    if (this.streamCancel) {
      this.streamCancel.cancel();
    }
    if (this.streamInput) {
      try {
        this.streamInput.close(null);
      } catch {
        /* already closed */
      }
    }
    if (this.streamProc) {
      try {
        this.streamProc.force_exit();
      } catch {
        /* already exited */
      }
    }
    this.streamProc = null;
    this.streamCancel = null;
    this.streamInput = null;
  }

  private scheduleReconnect(): void {
    if (this.reconnectTimeoutId !== null) return;
    const delay = this.reconnectDelayMs;
    // Exponential backoff capped at 5 s. Reset to 250 ms on successful
    // connect. This mirrors how every other long-lived event subscriber in
    // GNOME stack handles a transient peer.
    this.reconnectDelayMs = Math.min(this.reconnectDelayMs * 2, 5000);
    this.reconnectTimeoutId = GLib.timeout_add(
      GLib.PRIORITY_DEFAULT,
      delay,
      () => {
        this.reconnectTimeoutId = null;
        this.startEventStream();
        return GLib.SOURCE_REMOVE;
      },
    );
  }

  /* ------------------------------------------------------------------------
   * Event dispatch
   * ---------------------------------------------------------------------- */

  private handleEventLine(line: string): void {
    let parsed: NiriEvent;
    try {
      parsed = JSON.parse(line) as NiriEvent;
    } catch (err) {
      console.error("[NiriAdapter] Bad event JSON:", err, line);
      return;
    }

    // Discriminate on the single key. We accept that some events touch both
    // workspace and window state and may want to fire multiple handler types.
    let workspacesDirty = false;
    let focusedWorkspaceDirty = false;
    let focusedWindowDirty = false;

    if ("WorkspacesChanged" in parsed) {
      this.workspaces.clear();
      for (const ws of parsed.WorkspacesChanged.workspaces) {
        this.workspaces.set(ws.id, ws);
        if (ws.is_focused) this.focusedOutput = ws.output;
      }
      workspacesDirty = true;
      focusedWorkspaceDirty = true;
    } else if ("WorkspaceActivated" in parsed) {
      const { id, focused } = parsed.WorkspaceActivated;
      // Update is_active on this workspace and clear it on others on the
      // same output. is_focused only flips when `focused` is true.
      const target = this.workspaces.get(id);
      if (target) {
        for (const ws of this.workspaces.values()) {
          if (ws.output === target.output) {
            ws.is_active = ws.id === id;
            if (focused) ws.is_focused = ws.id === id;
          }
        }
        if (focused) this.focusedOutput = target.output;
      }
      focusedWorkspaceDirty = true;
    } else if ("WorkspaceActiveWindowChanged" in parsed) {
      const { workspace_id, active_window_id } =
        parsed.WorkspaceActiveWindowChanged;
      const ws = this.workspaces.get(workspace_id);
      if (ws) ws.active_window_id = active_window_id;
      focusedWindowDirty = true;
    } else if ("WindowsChanged" in parsed) {
      this.windows.clear();
      for (const w of parsed.WindowsChanged.windows) {
        this.windows.set(w.id, w);
        if (w.is_focused) this.focusedWindowId = w.id;
      }
      focusedWindowDirty = true;
    } else if ("WindowOpenedOrChanged" in parsed) {
      const w = parsed.WindowOpenedOrChanged.window;
      this.windows.set(w.id, w);
      if (w.is_focused) this.focusedWindowId = w.id;
      focusedWindowDirty = true;
    } else if ("WindowClosed" in parsed) {
      this.windows.delete(parsed.WindowClosed.id);
      if (this.focusedWindowId === parsed.WindowClosed.id) {
        this.focusedWindowId = null;
      }
      focusedWindowDirty = true;
    } else if ("WindowFocusChanged" in parsed) {
      this.focusedWindowId = parsed.WindowFocusChanged.id;
      focusedWindowDirty = true;
    } else {
      // KeyboardLayoutsChanged / KeyboardLayoutSwitched / OverviewOpenedOrClosed
      // — not consumed.
      return;
    }

    if (workspacesDirty) {
      for (const h of this.eventHandlers) h.onWorkspacesChanged?.();
    }
    if (focusedWorkspaceDirty) {
      for (const h of this.eventHandlers) h.onFocusedWorkspaceChanged?.();
    }
    if (focusedWindowDirty) {
      for (const h of this.eventHandlers) h.onFocusedWindowChanged?.();
    }
  }

  /* ------------------------------------------------------------------------
   * Bootstrap — only used once at startup
   * ---------------------------------------------------------------------- */

  private getFocusedOutputNameSync(): string | null {
    try {
      const [success, stdout] = GLib.spawn_command_line_sync(
        "niri msg focused-output",
      );
      if (!success || !stdout) return null;
      const output = new TextDecoder().decode(stdout);
      const match = output.match(/Output "[^"]*" \(([^)]+)\)/);
      return match ? match[1] : null;
    } catch (error) {
      console.error("[NiriAdapter] Failed to get focused output:", error);
      return null;
    }
  }

  /* ------------------------------------------------------------------------
   * CompositorAdapter — pure reads against in-memory state
   * ---------------------------------------------------------------------- */

  getWorkspaces(monitor?: string): CompositorWorkspace[] {
    const targetOutput = monitor || this.focusedOutput;
    if (!targetOutput) return [];

    const workspaces: CompositorWorkspace[] = [];
    for (const ws of this.workspaces.values()) {
      if (ws.output === targetOutput) {
        workspaces.push({ id: ws.id, name: String(ws.idx) });
      }
    }
    workspaces.sort((a, b) => {
      const aIdx = parseInt(a.name || "0", 10);
      const bIdx = parseInt(b.name || "0", 10);
      return aIdx - bIdx;
    });
    return workspaces;
  }

  getFocusedWorkspace(monitor?: string): CompositorWorkspace | null {
    const targetOutput = monitor || this.focusedOutput;
    if (!targetOutput) return null;

    for (const ws of this.workspaces.values()) {
      if (ws.output === targetOutput && ws.is_active) {
        return { id: ws.id, name: String(ws.idx) };
      }
    }
    return null;
  }

  getFocusedWindowForMonitor(monitor: string): CompositorWindow | null {
    let activeWorkspace: NiriWorkspaceJson | undefined;
    for (const ws of this.workspaces.values()) {
      if (ws.output === monitor && ws.is_active) {
        activeWorkspace = ws;
        break;
      }
    }
    if (!activeWorkspace?.active_window_id) return null;

    const w = this.windows.get(activeWorkspace.active_window_id);
    return w ? this.toCompositorWindow(w) : null;
  }

  getWindows(): CompositorWindow[] {
    const out: CompositorWindow[] = [];
    for (const w of this.windows.values()) {
      if (w.workspace_id === null || w.workspace_id === undefined) continue;
      out.push(this.toCompositorWindow(w));
    }
    return out;
  }

  getFocusedWindow(): CompositorWindow | null {
    if (this.focusedWindowId === null) return null;
    const w = this.windows.get(this.focusedWindowId);
    if (!w || w.workspace_id === null || w.workspace_id === undefined) {
      return null;
    }
    return this.toCompositorWindow(w);
  }

  getWorkspaceWindows(workspaceId: number): CompositorWindow[] {
    const out: CompositorWindow[] = [];
    for (const w of this.windows.values()) {
      if (w.workspace_id === workspaceId) out.push(this.toCompositorWindow(w));
    }
    return out;
  }

  switchToWorkspace(workspaceId: number): void {
    const ws = this.workspaces.get(workspaceId);
    if (!ws) {
      console.warn(`[NiriAdapter] Workspace ID ${workspaceId} not found`);
      return;
    }
    try {
      GLib.spawn_command_line_async(
        `niri msg action focus-workspace ${ws.idx}`,
      );
    } catch (error) {
      console.error("[NiriAdapter] Failed to switch workspace:", error);
    }
  }

  focusWindow(address: string): void {
    try {
      GLib.spawn_command_line_async(
        `niri msg action focus-window --id ${address}`,
      );
    } catch (error) {
      console.error("[NiriAdapter] Failed to focus window:", error);
    }
  }

  connect(handlers: CompositorEventHandlers): () => void {
    this.eventHandlers.push(handlers);
    return () => {
      const i = this.eventHandlers.indexOf(handlers);
      if (i > -1) this.eventHandlers.splice(i, 1);
    };
  }

  /* ------------------------------------------------------------------------
   * Helpers
   * ---------------------------------------------------------------------- */

  private toCompositorWindow(w: NiriWindowJson): CompositorWindow {
    return {
      address: String(w.id ?? ""),
      title: w.title ?? "",
      appClass: w.app_id ?? "",
      workspaceId: w.workspace_id ?? 0,
      hidden: false,
    };
  }
}
