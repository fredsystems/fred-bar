import type {
  CompositorAdapter,
  CompositorEventHandlers,
  CompositorWindow,
  CompositorWorkspace,
} from "./types";

/**
 * Fallback compositor adapter
 *
 * Used when the compositor is unknown or unsupported.
 * Provides minimal functionality - no workspaces or windows are shown.
 */
export class FallbackAdapter implements CompositorAdapter {
  readonly name = "fallback";
  readonly supportsWorkspaces = false;
  readonly supportsWindows = false;

  getWorkspaces(_monitor?: string): CompositorWorkspace[] {
    return [];
  }

  getFocusedWorkspace(_monitor?: string): CompositorWorkspace | null {
    return null;
  }

  getWindows(): CompositorWindow[] {
    return [];
  }

  getFocusedWindow(): CompositorWindow | null {
    return null;
  }

  getFocusedWindowForMonitor(_monitor: string): CompositorWindow | null {
    return null;
  }

  getWorkspaceWindows(_workspaceId: number): CompositorWindow[] {
    return [];
  }

  switchToWorkspace(_workspaceId: number): void {
    console.warn("[FallbackAdapter] switchToWorkspace not supported");
  }

  focusWindow(_address: string): void {
    console.warn("[FallbackAdapter] focusWindow not supported");
  }

  connect(_handlers: CompositorEventHandlers): () => void {
    // No events to connect
    return () => {};
  }
}
