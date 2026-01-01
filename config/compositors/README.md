# Compositor Abstraction Layer

This directory contains the compositor abstraction layer that makes fredbar work across different Wayland compositors.

## Architecture

The abstraction layer provides a generic interface (`CompositorAdapter`) that all compositor implementations must follow. This allows the bar to work with different compositors without changing the UI code.

### Core Components

#### `types.ts`

Defines the common interfaces and types:

- `CompositorAdapter` - Main interface all compositor implementations must implement
- `CompositorWorkspace` - Generic workspace representation
- `CompositorWindow` - Generic window/client representation
- `CompositorEventHandlers` - Event callback definitions

#### `index.ts`

Factory and auto-detection:

- `detectCompositor()` - Automatically detects which compositor is running
- `createCompositorAdapter()` - Creates the appropriate adapter
- `getCompositor()` - Singleton accessor for the compositor instance

#### Compositor Implementations

##### `hyprland.ts` - Hyprland Adapter

Uses `AstalHyprland` bindings for native IPC integration with Hyprland.

**Features:**

- ✅ Full workspace support
- ✅ Window tracking and management
- ✅ Real-time event notifications via IPC
- ✅ Native workspace switching
- ✅ Window focusing

##### `niri.ts` - Niri Adapter

Uses `niri msg` CLI commands and event stream for compositor communication.

**Features:**

- ✅ Full workspace support
- ✅ Window tracking and management
- ✅ Real-time event notifications via `niri msg event-stream`
- ✅ Workspace switching via `niri msg action`
- ✅ Window focusing
- ℹ️ Multi-monitor aware (shows workspaces from focused output)

##### `fallback.ts` - Fallback Adapter

Used when the compositor is unknown or unsupported.

**Features:**

- ❌ No workspace support
- ❌ No window tracking
- ℹ️ Widgets gracefully hide themselves

## Adding a New Compositor

To add support for a new compositor (e.g., Sway, Niri):

### 1. Create the adapter file

```typescript
// compositors/sway.ts
import type {
  CompositorAdapter,
  CompositorEventHandlers,
  CompositorWindow,
  CompositorWorkspace,
} from "./types";

export class SwayAdapter implements CompositorAdapter {
  readonly name = "sway";
  readonly supportsWorkspaces = true;
  readonly supportsWindows = true;

  // Implement all required methods...
  getWorkspaces(): CompositorWorkspace[] {
    // Your implementation
  }

  // ... etc
}
```

### 2. Add detection logic

Update `index.ts`:

```typescript
function detectCompositor(): string {
  // ... existing checks ...

  if (xdgCurrentDesktop) {
    const desktop = xdgCurrentDesktop.toLowerCase();
    if (desktop.includes("sway")) {
      return "sway";
    }
  }

  // ... rest of function
}
```

### 3. Register in factory

Update `createCompositorAdapter()` in `index.ts`:

```typescript
case "sway":
  return new SwayAdapter();
```

### 4. Update dependencies

If using Astal bindings, update `flake.nix`:

```nix
fredbarAstalPackages = system: [
  # ... existing packages ...
  astal.packages.${system}.sway  # If available
];
```

## Compositor Capabilities

The abstraction layer uses capability flags to allow different levels of support:

- `supportsWorkspaces` - Can the compositor provide workspace information?
- `supportsWindows` - Can the compositor track windows?

Widgets check these flags and gracefully hide or adapt their behavior:

```typescript
if (!compositor.supportsWorkspaces) {
  box.set_visible(false);
  return box;
}
```

## Event System

The event system is callback-based and returns a disconnect function:

```typescript
const disconnect = compositor.connect({
  onWorkspacesChanged: () => console.log("Workspaces changed"),
  onFocusedWindowChanged: () => console.log("Window focus changed"),
});

// Later, to clean up:
disconnect();
```

### Available Events

- `onWorkspacesChanged` - Workspace list changed (added/removed)
- `onFocusedWorkspaceChanged` - Active workspace changed
- `onFocusedWindowChanged` - Focused window changed or title updated
- `onWindowAdded` - New window opened
- `onWindowRemoved` - Window closed
- `onWindowMoved` - Window moved to different workspace

## Implementation Notes

### Hyprland

- Uses AstalHyprland GObject bindings
- Real-time IPC events via GObject signals
- Native workspace IDs and names
- Window address-based focusing

### Niri

- Uses `niri msg` CLI commands
- Real-time events via `niri msg event-stream`
- Workspace support (shows workspaces from focused output)
- Window tracking and focusing
- Event stream parsed as JSON
- Multi-monitor aware

### Future Compositors

**Sway:**

- Can use `swaymsg` for IPC
- Similar workspace model to Hyprland
- Should be straightforward to implement

**River:**

- Has IPC via river-control protocol
- Tagged workspace model may require adaptation

## Testing

To test with a specific compositor:

```typescript
// Force a specific compositor (for testing)
const compositor = getCompositor("hyprland");
```

To test fallback behavior:

```typescript
const compositor = getCompositor("fallback");
```

## Widget Integration

Widgets use the compositor abstraction like this:

```typescript
import { getCompositor } from "compositors";

export function MyWidget(): Gtk.Box {
  const compositor = getCompositor();

  // Check capabilities
  if (!compositor.supportsWorkspaces) {
    return createFallbackWidget();
  }

  // Get data
  const workspaces = compositor.getWorkspaces();
  const focused = compositor.getFocusedWorkspace();

  // React to changes
  compositor.connect({
    onWorkspacesChanged: () => updateUI(),
  });

  // Perform actions
  button.connect("clicked", () => {
    compositor.switchToWorkspace(workspaceId);
  });
}
```

## Niri-Specific Implementation Notes

### Event Stream

Niri provides real-time events via `niri msg event-stream`:

- Events are JSON objects, one per line
- Spawned as a background process using `GLib.spawn_async_with_pipes`
- Read via `GLib.IOChannel` and `GLib.io_add_watch`
- Events parsed and mapped to compositor callbacks

### Workspace Handling

- Niri has per-output workspaces
- Adapter shows workspaces from the currently focused output
- Active workspace determined by `*` marker in `niri msg workspaces`

### Commands Used

- `niri msg workspaces` - Get workspace list per output
- `niri msg focused-output` - Get currently focused output
- `niri msg windows` - Get all windows
- `niri msg focused-window` - Get focused window
- `niri msg action focus-workspace <id>` - Switch workspace
- `niri msg action focus-window --id <id>` - Focus window
- `niri msg event-stream` - Real-time event notifications

## Benefits

1. **Compositor Independence** - Bar works across different Wayland compositors
2. **Graceful Degradation** - Features hide when not supported
3. **Type Safety** - Common interfaces enforce consistency
4. **Maintainability** - Compositor-specific code is isolated
5. **Extensibility** - Easy to add new compositors
