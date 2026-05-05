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

  getWorkspaces(_monitor?: string): CompositorWorkspace[] {
    // Hyprland doesn't have per-monitor workspaces, ignore monitor parameter
    return (this.hypr.workspaces ?? [])
      .filter((ws) => ws && ws.id > 0)
      .sort((a, b) => a.id - b.id)
      .map((ws) => ({
        id: ws.id ?? 0,
        name: ws.name ?? String(ws.id ?? 0),
      }));
  }

  getFocusedWorkspace(_monitor?: string): CompositorWorkspace | null {
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

  getFocusedWindowForMonitor(_monitor: string): CompositorWindow | null {
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
    // Per-Client title listener bookkeeping. The Hyprland manager does not
    // emit any signal for in-window title changes; those live on the focused
    // Client object. We rebind notify::title on each focus change.
    let trackedClient: Hyprland.Client | null = null;
    let trackedTitleId: number | null = null;
    const detachClientListener = (): void => {
      if (trackedClient && trackedTitleId !== null) {
        trackedClient.disconnect(trackedTitleId);
      }
      trackedClient = null;
      trackedTitleId = null;
    };

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
      const fire = handlers.onFocusedWindowChanged;
      const id = this.hypr.connect("notify::focused-client", () => fire());
      connections.push(id);

      const rewireTitleListener = (): void => {
        detachClientListener();
        trackedClient = this.hypr.focused_client ?? null;
        trackedTitleId =
          trackedClient?.connect("notify::title", () => fire()) ?? null;
      };

      rewireTitleListener();
      const rewireId = this.hypr.connect("notify::focused-client", () => {
        rewireTitleListener();
      });
      connections.push(rewireId);
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
      detachClientListener();
    };
  }
}
