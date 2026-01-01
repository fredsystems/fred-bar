# Compositor Abstraction Quick Reference

## Basic Usage

### Import

```typescript
import { getCompositor } from "compositors";
```

### Get Instance

```typescript
const compositor = getCompositor();
```

## Check Capabilities

```typescript
// Check before using features
if (compositor.supportsWorkspaces) {
  // Use workspace features
}

if (compositor.supportsWindows) {
  // Use window features
}
```

## Get Data

### Workspaces

```typescript
// All workspaces
const workspaces = compositor.getWorkspaces();
// Returns: CompositorWorkspace[] = [{ id: 1, name: "1" }, ...]

// Focused workspace
const focused = compositor.getFocusedWorkspace();
// Returns: CompositorWorkspace | null
```

### Windows

```typescript
// All windows
const windows = compositor.getWindows();
// Returns: CompositorWindow[]

// Focused window
const focused = compositor.getFocusedWindow();
// Returns: CompositorWindow | null

// Windows in specific workspace
const wsWindows = compositor.getWorkspaceWindows(5);
// Returns: CompositorWindow[]
```

## Perform Actions

```typescript
// Switch workspace
compositor.switchToWorkspace(5);

// Focus window
compositor.focusWindow(windowAddress);
```

## Listen to Events

```typescript
const disconnect = compositor.connect({
  onWorkspacesChanged: () => {
    // Workspace list changed (added/removed)
    updateWorkspaceList();
  },

  onFocusedWorkspaceChanged: () => {
    // Active workspace changed
    updateActiveIndicator();
  },

  onFocusedWindowChanged: () => {
    // Focused window changed or title updated
    updateWindowTitle();
  },

  onWindowAdded: () => {
    // New window opened
    refreshWindowList();
  },

  onWindowRemoved: () => {
    // Window closed
    refreshWindowList();
  },

  onWindowMoved: () => {
    // Window moved to different workspace
    refreshWorkspacePreview();
  },
});

// Clean up when widget is destroyed
disconnect();
```

## Complete Widget Example

```typescript
import Gtk from "gi://Gtk?version=4.0";
import { getCompositor } from "compositors";

export function WorkspaceWidget(): Gtk.Box {
  const compositor = getCompositor();

  const box = new Gtk.Box({
    spacing: 4,
    css_classes: ["workspace-widget"],
  });

  // Hide if not supported
  if (!compositor.supportsWorkspaces) {
    box.set_visible(false);
    return box;
  }

  function render() {
    // Clear existing
    for (let child = box.get_first_child(); child; ) {
      const next = child.get_next_sibling();
      box.remove(child);
      child = next;
    }

    // Get data
    const workspaces = compositor.getWorkspaces();
    const focused = compositor.getFocusedWorkspace();

    // Create buttons
    for (const ws of workspaces) {
      const button = new Gtk.Button({
        label: String(ws.id),
        css_classes: ws.id === focused?.id ? ["active"] : [],
      });

      button.connect("clicked", () => {
        compositor.switchToWorkspace(ws.id);
      });

      box.append(button);
    }
  }

  render();

  // Listen for changes
  compositor.connect({
    onWorkspacesChanged: render,
    onFocusedWorkspaceChanged: render,
  });

  return box;
}
```

## Type Definitions

### CompositorWorkspace

```typescript
interface CompositorWorkspace {
  id: number; // Workspace number/ID
  name?: string; // Optional name
}
```

### CompositorWindow

```typescript
interface CompositorWindow {
  address: string; // Unique identifier
  title: string; // Window title
  appClass: string; // Application class name
  workspaceId: number; // Which workspace it's on
  hidden: boolean; // Is window hidden/minimized
}
```

## Compositor Support Matrix

| Feature    | Hyprland | Fallback | Sway\* | Niri\* |
| ---------- | -------- | -------- | ------ | ------ |
| Workspaces | ✅       | ❌       | ✅     | ❌     |
| Windows    | ✅       | ❌       | ✅     | ⚠️     |
| Events     | ✅       | ❌       | ✅     | ⚠️     |
| Switch WS  | ✅       | ❌       | ✅     | ❌     |
| Focus Win  | ✅       | ❌       | ✅     | ⚠️     |

\*Not yet implemented

## Common Patterns

### Graceful Degradation

```typescript
if (!compositor.supportsWorkspaces) {
  // Hide workspace features
  workspaceBox.set_visible(false);
} else {
  // Show workspace features
  workspaceBox.set_visible(true);
}
```

### Safe Data Access

```typescript
const focused = compositor.getFocusedWorkspace();
const label = focused ? `WS ${focused.id}` : "No workspace";
```

### Event Cleanup

```typescript
// Store disconnect function
let disconnect: (() => void) | null = null;

// Connect
disconnect = compositor.connect({
  onWorkspacesChanged: update,
});

// Clean up (e.g., in widget destroy handler)
if (disconnect) {
  disconnect();
  disconnect = null;
}
```

## Debugging

### Check Detected Compositor

```typescript
console.log(`Compositor: ${compositor.name}`);
console.log(`Supports workspaces: ${compositor.supportsWorkspaces}`);
console.log(`Supports windows: ${compositor.supportsWindows}`);
```

### Log Workspace Data

```typescript
const workspaces = compositor.getWorkspaces();
console.log("Workspaces:", JSON.stringify(workspaces, null, 2));
```

### Monitor Events

```typescript
compositor.connect({
  onWorkspacesChanged: () => console.log("[Event] Workspaces changed"),
  onFocusedWorkspaceChanged: () => console.log("[Event] Focus changed"),
  onFocusedWindowChanged: () => console.log("[Event] Window changed"),
});
```

## Best Practices

1. **Always check capabilities** before using features
2. **Handle null returns** from getFocused methods
3. **Store disconnect functions** for cleanup
4. **Hide unsupported features** instead of showing errors
5. **Use events** instead of polling for updates
6. **Cache compositor instance** (it's a singleton)

## Migration from AstalHyprland

### Before

```typescript
import Hyprland from "gi://AstalHyprland";
const hypr = Hyprland.get_default();
const workspaces = hypr.workspaces;
hypr.connect("notify::workspaces", update);
```

### After

```typescript
import { getCompositor } from "compositors";
const compositor = getCompositor();
const workspaces = compositor.getWorkspaces();
compositor.connect({ onWorkspacesChanged: update });
```

## See Also

- `types.ts` - Full type definitions
- `README.md` - Architecture and implementation guide
- `ARCHITECTURE.md` - Visual diagrams and flows
- `sway.ts.template` - Example implementation
