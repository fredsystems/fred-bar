import type Gio from "gi://Gio";
import type Gtk from "gi://Gtk?version=4.0";

/**
 * Generic workspace representation
 */
export interface CompositorWorkspace {
  id: number;
  name?: string;
}

/**
 * Generic window/client representation
 */
export interface CompositorWindow {
  address: string;
  title: string;
  appClass: string;
  workspaceId: number;
  hidden: boolean;
}

/**
 * Compositor event handlers
 */
export interface CompositorEventHandlers {
  onWorkspacesChanged?: () => void;
  onFocusedWorkspaceChanged?: () => void;
  onFocusedWindowChanged?: () => void;
  onWindowAdded?: () => void;
  onWindowRemoved?: () => void;
  onWindowMoved?: () => void;
}

/**
 * Generic compositor interface
 *
 * All compositor implementations must implement this interface
 * to provide workspace and window management functionality.
 */
export interface CompositorAdapter {
  /**
   * Compositor name for identification
   */
  readonly name: string;

  /**
   * Whether this compositor supports workspaces
   */
  readonly supportsWorkspaces: boolean;

  /**
   * Whether this compositor supports window tracking
   */
  readonly supportsWindows: boolean;

  /**
   * Get all available workspaces
   */
  getWorkspaces(): CompositorWorkspace[];

  /**
   * Get the currently focused workspace
   */
  getFocusedWorkspace(): CompositorWorkspace | null;

  /**
   * Get all windows/clients
   */
  getWindows(): CompositorWindow[];

  /**
   * Get the currently focused window
   */
  getFocusedWindow(): CompositorWindow | null;

  /**
   * Get windows for a specific workspace
   */
  getWorkspaceWindows(workspaceId: number): CompositorWindow[];

  /**
   * Switch to a workspace
   */
  switchToWorkspace(workspaceId: number): void;

  /**
   * Focus a specific window
   */
  focusWindow(address: string): void;

  /**
   * Connect event handlers
   * Returns a disconnect function
   */
  connect(handlers: CompositorEventHandlers): () => void;
}

/**
 * Window preview data for workspace previews
 */
export interface WindowPreviewData {
  address: string;
  title: string;
  appClass: string;
  icon?: Gio.Icon | null;
}

/**
 * Workspace data with windows for previews
 */
export interface WorkspacePreviewData {
  workspace: CompositorWorkspace;
  windows: WindowPreviewData[];
  isFocused: boolean;
}
