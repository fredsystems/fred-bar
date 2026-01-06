import GLib from "gi://GLib";
import type {
  CompositorAdapter,
  CompositorEventHandlers,
  CompositorWindow,
  CompositorWorkspace,
} from "./types";

/**
 * Workspace data from niri JSON output
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

/**
 * Niri compositor adapter
 *
 * Uses `niri msg --json` commands with polling for updates.
 */
export class NiriAdapter implements CompositorAdapter {
  readonly name = "niri";
  readonly supportsWorkspaces = true;
  readonly supportsWindows = true;

  private eventHandlers: Array<CompositorEventHandlers> = [];
  private pollingInterval: number | null = null;

  constructor() {
    console.log("[NiriAdapter] Initialized with JSON output");
  }

  /**
   * Get the name of the currently focused output
   */
  private getFocusedOutputName(): string | null {
    try {
      const [success, stdout] = GLib.spawn_command_line_sync(
        "niri msg focused-output",
      );

      if (!success || !stdout) {
        return null;
      }

      const output = new TextDecoder().decode(stdout);
      const match = output.match(/Output "[^"]*" \(([^)]+)\)/);
      return match ? match[1] : null;
    } catch (error) {
      console.error("[NiriAdapter] Failed to get focused output:", error);
      return null;
    }
  }

  /**
   * Get all workspaces from JSON output
   */
  private getAllWorkspacesJson(): NiriWorkspaceJson[] {
    try {
      const [success, stdout] = GLib.spawn_command_line_sync(
        "niri msg --json workspaces",
      );

      if (!success || !stdout) {
        return [];
      }

      const output = new TextDecoder().decode(stdout);
      return JSON.parse(output) as NiriWorkspaceJson[];
    } catch (error) {
      console.error("[NiriAdapter] Failed to get workspaces JSON:", error);
      return [];
    }
  }

  getWorkspaces(monitor?: string): CompositorWorkspace[] {
    // Use provided monitor or fall back to focused output
    const targetOutput = monitor || this.getFocusedOutputName();
    if (!targetOutput) {
      return [];
    }

    const allWorkspaces = this.getAllWorkspacesJson();

    // Get workspaces for the target output only
    const workspaces: CompositorWorkspace[] = [];
    for (const ws of allWorkspaces) {
      if (ws.output === targetOutput) {
        workspaces.push({
          id: ws.id, // Global workspace ID (for matching with windows)
          name: String(ws.idx), // Display index (1, 2, etc)
        });
      }
    }

    // Sort by display index
    return workspaces.sort((a, b) => {
      const aIdx = parseInt(a.name || "0", 10);
      const bIdx = parseInt(b.name || "0", 10);
      return aIdx - bIdx;
    });
  }

  getFocusedWorkspace(monitor?: string): CompositorWorkspace | null {
    // Use provided monitor or fall back to focused output
    const targetOutput = monitor || this.getFocusedOutputName();
    if (!targetOutput) {
      return null;
    }

    const allWorkspaces = this.getAllWorkspacesJson();

    // Find the active workspace on the target output
    for (const ws of allWorkspaces) {
      if (ws.output === targetOutput && ws.is_active) {
        return {
          id: ws.id,
          name: String(ws.idx),
        };
      }
    }

    return null;
  }

  getFocusedWindowForMonitor(monitor: string): CompositorWindow | null {
    const allWorkspaces = this.getAllWorkspacesJson();

    // Find the active workspace on this monitor
    const activeWorkspace = allWorkspaces.find(
      (ws) => ws.output === monitor && ws.is_active,
    );

    if (!activeWorkspace || !activeWorkspace.active_window_id) {
      return null;
    }

    // Get the window with this ID (convert number to string for comparison)
    const windowId = String(activeWorkspace.active_window_id);
    const windows = this.getWindows();
    return windows.find((w) => w.address === windowId) || null;
  }

  /**
   * Get all windows from JSON output
   */
  getWindows(): CompositorWindow[] {
    try {
      const [success, stdout] = GLib.spawn_command_line_sync(
        "niri msg --json windows",
      );

      if (!success || !stdout) {
        return [];
      }

      const output = new TextDecoder().decode(stdout);
      const windowsJson = JSON.parse(output) as Array<{
        id: number;
        title: string | null;
        app_id: string | null;
        workspace_id: number | null;
      }>;

      return windowsJson
        .filter(
          (w) => w && w.workspace_id !== null && w.workspace_id !== undefined,
        )
        .map((w) => ({
          address: String(w.id ?? ""),
          title: w.title ?? "",
          appClass: w.app_id ?? "",
          workspaceId: w.workspace_id ?? 0,
          hidden: false,
        }));
    } catch (error) {
      console.error("[NiriAdapter] Failed to get windows:", error);
      return [];
    }
  }

  getFocusedWindow(): CompositorWindow | null {
    try {
      const [success, stdout] = GLib.spawn_command_line_sync(
        "niri msg --json focused-window",
      );

      if (!success || !stdout) {
        return null;
      }

      const output = new TextDecoder().decode(stdout).trim();

      // Handle empty response (no focused window)
      if (!output) {
        return null;
      }

      const windowJson = JSON.parse(output) as {
        id: number;
        title: string | null;
        app_id: string | null;
        workspace_id: number | null;
      } | null;

      if (
        !windowJson ||
        windowJson.workspace_id === null ||
        windowJson.workspace_id === undefined
      ) {
        return null;
      }

      return {
        address: String(windowJson.id ?? ""),
        title: windowJson.title ?? "",
        appClass: windowJson.app_id ?? "",
        workspaceId: windowJson.workspace_id,
        hidden: false,
      };
    } catch (error) {
      console.error("[NiriAdapter] Failed to get focused window:", error);
      return null;
    }
  }

  getWorkspaceWindows(workspaceId: number): CompositorWindow[] {
    // workspaceId is the global workspace ID
    return this.getWindows().filter(
      (win) => win.workspaceId === workspaceId && !win.hidden,
    );
  }

  switchToWorkspace(workspaceId: number): void {
    try {
      // We need to convert the global workspace ID to the index for the current output
      const focusedOutput = this.getFocusedOutputName();
      if (!focusedOutput) return;

      const allWorkspaces = this.getAllWorkspacesJson();
      const targetWorkspace = allWorkspaces.find((ws) => ws.id === workspaceId);

      if (!targetWorkspace) {
        console.warn(`[NiriAdapter] Workspace ID ${workspaceId} not found`);
        return;
      }

      // Use the workspace index for switching
      GLib.spawn_command_line_async(
        `niri msg action focus-workspace ${targetWorkspace.idx}`,
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
    // Add handlers to the array instead of merging
    this.eventHandlers.push(handlers);

    // Start polling if not already started
    if (this.pollingInterval === null) {
      let lastWorkspaceState = "";
      let lastActiveWindowsPerMonitor = "";

      this.pollingInterval = setInterval(() => {
        // Check for workspace changes
        const workspaces = this.getWorkspaces();
        const focusedWorkspace = this.getFocusedWorkspace();
        const currentWorkspaceState = JSON.stringify({
          workspaces,
          focused: focusedWorkspace,
        });

        if (currentWorkspaceState !== lastWorkspaceState) {
          lastWorkspaceState = currentWorkspaceState;
          // Call all registered handlers
          for (const handler of this.eventHandlers) {
            handler.onWorkspacesChanged?.();
            handler.onFocusedWorkspaceChanged?.();
          }
        }

        // Check for active window changes PER MONITOR
        const allWorkspaces = this.getAllWorkspacesJson();
        const activeWindowsPerMonitor = allWorkspaces
          .filter((ws) => ws.is_active)
          .map((ws) => ({
            output: ws.output,
            windowId: ws.active_window_id,
          }))
          .sort((a, b) => a.output.localeCompare(b.output)); // Sort for stable comparison
        const currentActiveWindowsPerMonitor = JSON.stringify(
          activeWindowsPerMonitor,
        );

        if (currentActiveWindowsPerMonitor !== lastActiveWindowsPerMonitor) {
          lastActiveWindowsPerMonitor = currentActiveWindowsPerMonitor;
          // Call all registered handlers
          for (const handler of this.eventHandlers) {
            handler.onFocusedWindowChanged?.();
          }
        }
      }, 200) as unknown as number; // Poll every 200ms
    }

    return () => {
      // Remove this specific handler from the array
      const index = this.eventHandlers.indexOf(handlers);
      if (index > -1) {
        this.eventHandlers.splice(index, 1);
      }

      if (this.eventHandlers.length === 0) {
        if (this.pollingInterval !== null) {
          clearInterval(this.pollingInterval);
          this.pollingInterval = null;
        }
      }
    };
  }
}
