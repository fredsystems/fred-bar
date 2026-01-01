# Compositor Abstraction Migration

This document summarizes the compositor abstraction work completed to make fredbar compositor-agnostic.

## What Changed

### Before

- Center widgets (`workspaces.tsx`, `window-title.tsx`, `active-workspace.tsx`) directly imported and used `AstalHyprland`
- Hard-coded dependency on Hyprland compositor
- No fallback behavior for other compositors
- Bar would crash or fail to start on non-Hyprland compositors

### After

- New `compositors/` directory with abstraction layer
- Generic `CompositorAdapter` interface
- Multiple compositor implementations (Hyprland, Fallback)
- Auto-detection of running compositor
- Graceful feature degradation when compositor doesn't support certain features
- Widgets check compositor capabilities before enabling features

## New Architecture

```shell
config/compositors/
├── types.ts          # Generic interfaces (CompositorAdapter, CompositorWorkspace, etc.)
├── index.ts          # Factory, auto-detection, singleton accessor
├── hyprland.ts       # Hyprland implementation using AstalHyprland
├── fallback.ts       # Minimal implementation for unsupported compositors
├── sway.ts.template  # Template/example for future Sway support
└── README.md         # Full architecture documentation
```

## Key Interfaces

### CompositorAdapter

Main interface all compositor implementations must follow:

- `getWorkspaces()` - Get all workspaces
- `getFocusedWorkspace()` - Get active workspace
- `getWindows()` - Get all windows
- `getFocusedWindow()` - Get focused window
- `getWorkspaceWindows(id)` - Get windows for specific workspace
- `switchToWorkspace(id)` - Switch to workspace
- `focusWindow(address)` - Focus specific window
- `connect(handlers)` - Subscribe to events

### Capability Flags

- `supportsWorkspaces: boolean` - Can compositor provide workspace info?
- `supportsWindows: boolean` - Can compositor track windows?

Widgets check these flags and adapt behavior accordingly.

## Migration Examples

### Before (Hyprland-specific)

```typescript
import Hyprland from "gi://AstalHyprland";

const hypr = Hyprland.get_default();

export function ActiveWorkspace(): Gtk.Label {
  const label = new Gtk.Label();

  function update() {
    label.set_label(String(hypr.focused_workspace?.id ?? ""));
  }

  hypr.connect("notify::focused-workspace", update);
  return label;
}
```

### After (Compositor-agnostic)

```typescript
import { getCompositor } from "compositors";

export function ActiveWorkspace(): Gtk.Label {
  const compositor = getCompositor();
  const label = new Gtk.Label();

  function update() {
    const workspace = compositor.getFocusedWorkspace();
    label.set_label(workspace ? String(workspace.id) : "");
  }

  compositor.connect({
    onFocusedWorkspaceChanged: update,
  });

  return label;
}
```

## Files Modified

### New Files

- `config/compositors/types.ts` - Interface definitions
- `config/compositors/index.ts` - Factory and detection
- `config/compositors/hyprland.ts` - Hyprland adapter
- `config/compositors/fallback.ts` - Fallback adapter
- `config/compositors/README.md` - Architecture docs
- `config/compositors/sway.ts.template` - Example template

### Modified Files

- `config/center/active-workspace.tsx` - Uses compositor abstraction
- `config/center/workspaces.tsx` - Uses compositor abstraction
- `config/center/window-title.tsx` - Uses compositor abstraction
- `config/center/window-workspaces-pill.tsx` - Handles compositor capabilities
- `README.md` - Updated to reflect compositor-agnostic design
- `TODO.md` - Marked compositor abstraction as complete
- `CONTRIBUTING.md` - Added compositor abstraction guidelines

## Compositor Support Status

| Compositor | Status             | Method              | Capabilities                |
| ---------- | ------------------ | ------------------- | --------------------------- |
| Hyprland   | ✅ Fully supported | AstalHyprland (IPC) | Workspaces, Windows, Events |
| Sway       | 📝 Template ready  | swaymsg (IPC)       | Workspaces, Windows, Events |
| Niri       | 🔜 Planned         | niri msg (CLI)      | Limited (no workspaces)     |
| River      | 🔮 Future          | river-control       | TBD                         |
| Others     | ⚠️ Fallback mode   | None                | No workspaces/windows shown |

## Auto-Detection

The compositor is automatically detected via environment variables:

1. `HYPRLAND_INSTANCE_SIGNATURE` - Direct Hyprland indicator
2. `XDG_CURRENT_DESKTOP` - Desktop environment name
3. Falls back to fallback adapter if unknown

Detection happens once at startup and creates a singleton instance.

## Event System

Compositors provide event callbacks that return a disconnect function:

```typescript
const disconnect = compositor.connect({
  onWorkspacesChanged: () => console.log("Workspaces changed"),
  onFocusedWorkspaceChanged: () => console.log("Focus changed"),
  onFocusedWindowChanged: () => console.log("Window changed"),
  onWindowAdded: () => console.log("Window added"),
  onWindowRemoved: () => console.log("Window removed"),
  onWindowMoved: () => console.log("Window moved"),
});

// Later cleanup:
disconnect();
```

## Graceful Degradation

When a compositor doesn't support certain features:

- Widgets check capability flags
- Unsupported features are hidden (not shown broken)
- Bar still works with remaining features
- Console warnings inform about missing capabilities

Example:

```typescript
if (!compositor.supportsWorkspaces) {
  box.set_visible(false);
  return box;
}
```

## Benefits

1. **Compositor Independence** - Bar works on any Wayland compositor
2. **Graceful Degradation** - Features hide when not supported
3. **Type Safety** - TypeScript interfaces ensure consistency
4. **Maintainability** - Compositor-specific code is isolated
5. **Extensibility** - Easy to add new compositor support
6. **No Breaking Changes** - Existing Hyprland functionality unchanged

## Adding New Compositor Support

See `config/compositors/README.md` for detailed guide.

Quick steps:

1. Create new adapter file (e.g., `sway.ts`)
2. Implement `CompositorAdapter` interface
3. Add detection logic in `index.ts`
4. Register in factory in `index.ts`
5. Update `flake.nix` if using Astal bindings

Template available at `config/compositors/sway.ts.template`

## Testing

Currently running compositor is auto-detected. To test specific compositor:

```typescript
// In widget code (for testing only)
const compositor = getCompositor("fallback");
```

To verify detection:

```bash
# Check logs when starting bar
journalctl --user -u fredbar -f | grep Compositor
```

Should show:

```shell
[Compositor] Initializing adapter for: hyprland
```

## Future Work

- [ ] Implement Sway adapter (template ready)
- [ ] Implement Niri adapter (CLI-based, limited features)
- [ ] Add River support if desired
- [ ] Consider event buffering/debouncing for performance
- [ ] Add compositor-specific configuration options
- [ ] Improve fallback mode with basic window info from other sources

## Compatibility

This change is **backward compatible**:

- Existing Hyprland users see no change in behavior
- All existing features continue to work
- No configuration changes required
- AstalHyprland is still used under the hood for Hyprland

The abstraction layer is purely internal - the user experience remains the same.
