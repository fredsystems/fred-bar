import Hyprland from "gi://AstalHyprland";
import type {
  CompositorAdapter,
  CompositorEventHandlers,
  CompositorWindow,
  CompositorWorkspace,
} from "./types";

/**
 * Hyprland compositor adapter
 *
 * Uses AstalHyprland bindings for native IPC integration
 */
export class HyprlandAdapter implements CompositorAdapter {
  readonly name = "hyprland";
  readonly supportsWorkspaces = true;
  readonly supportsWindows = true;

  private hypr: Hyprland.Hyprland;

  constructor() {
    this.hypr = Hyprland.get_default();
  }

  getWorkspaces(monitor?: string): CompositorWorkspace[] {
    // Hyprland doesn't have per-monitor workspaces, ignore monitor parameter
    return (this.hypr.workspaces ?? [])
      .filter((ws) => ws && ws.id > 0)
      .sort((a, b) => a.id - b.id)
      .map((ws) => ({
        id: ws.id ?? 0,
        name: ws.name ?? String(ws.id ?? 0),
      }));
  }

  getFocusedWorkspace(monitor?: string): CompositorWorkspace | null {
    // Hyprland doesn't have per-monitor workspaces, ignore monitor parameter
    const ws = this.hypr.focused_workspace;
    if (!ws) return null;

    return {
      id: ws.id ?? 0,
      name: ws.name ?? String(ws.id ?? 0),
    };
  }

  getWindows(): CompositorWindow[] {
    return (this.hypr.get_clients() ?? [])
      .filter(
        (client) => client.workspace !== null && client.workspace !== undefined,
      )
      .map((client) => ({
        address: client.address ?? "",
        title: client.title ?? "",
        appClass: client.class ?? "",
        workspaceId: client.workspace.id,
        hidden: client.hidden ?? false,
      }));
  }

  getFocusedWindow(): CompositorWindow | null {
    const client = this.hypr.focused_client;
    if (!client || !client.workspace) return null;

    return {
      address: client.address ?? "",
      title: client.title ?? "",
      appClass: client.class ?? "",
      workspaceId: client.workspace.id,
      hidden: client.hidden ?? false,
    };
  }

  getFocusedWindowForMonitor(monitor: string): CompositorWindow | null {
    // Hyprland doesn't have per-monitor focus, return global focused window
    return this.getFocusedWindow();
  }

  getWorkspaceWindows(workspaceId: number): CompositorWindow[] {
    return this.getWindows().filter(
      (win) => win.workspaceId === workspaceId && !win.hidden,
    );
  }

  switchToWorkspace(workspaceId: number): void {
    this.hypr.dispatch("workspace", String(workspaceId));
  }

  focusWindow(address: string): void {
    this.hypr.dispatch("focuswindow", `address:${address}`);
  }

  connect(handlers: CompositorEventHandlers): () => void {
    const connections: number[] = [];

    if (handlers.onWorkspacesChanged) {
      const id = this.hypr.connect(
        "notify::workspaces",
        handlers.onWorkspacesChanged,
      );
      connections.push(id);
    }

    if (handlers.onFocusedWorkspaceChanged) {
      const id = this.hypr.connect(
        "notify::focused-workspace",
        handlers.onFocusedWorkspaceChanged,
      );
      connections.push(id);
    }

    if (handlers.onFocusedWindowChanged) {
      const id = this.hypr.connect(
        "notify::focused-client",
        handlers.onFocusedWindowChanged,
      );
      connections.push(id);

      // Also listen for title changes
      const titleId = this.hypr.connect(
        "notify::focused-title",
        handlers.onFocusedWindowChanged,
      );
      connections.push(titleId);
    }

    if (handlers.onWindowAdded) {
      const id = this.hypr.connect("client-added", handlers.onWindowAdded);
      connections.push(id);
    }

    if (handlers.onWindowRemoved) {
      const id = this.hypr.connect("client-removed", handlers.onWindowRemoved);
      connections.push(id);
    }

    if (handlers.onWindowMoved) {
      const id = this.hypr.connect("client-moved", handlers.onWindowMoved);
      connections.push(id);
    }

    // Return disconnect function
    return () => {
      for (const id of connections) {
        this.hypr.disconnect(id);
      }
    };
  }
}
