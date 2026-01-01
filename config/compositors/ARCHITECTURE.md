# Compositor Abstraction Architecture

## High-Level Flow

```shell
┌─────────────────────────────────────────────────────────────┐
│                        fredbar Start                         │
└─────────────────────────┬───────────────────────────────────┘
                          │
                          ▼
┌─────────────────────────────────────────────────────────────┐
│              getCompositor() - Singleton Factory             │
│  • Detects compositor via environment variables              │
│  • Creates appropriate adapter                               │
│  • Returns singleton instance                                │
└─────────────────────────┬───────────────────────────────────┘
                          │
          ┌───────────────┼───────────────┐
          │               │               │
          ▼               ▼               ▼
    ┌─────────┐     ┌─────────┐     ┌─────────┐
    │Hyprland │     │  Sway   │     │Fallback │
    │ Adapter │     │ Adapter │     │ Adapter │
    └────┬────┘     └────┬────┘     └────┬────┘
         │               │               │
         │               │               │
         └───────────────┼───────────────┘
                         │
                         ▼
         ┌───────────────────────────────┐
         │   CompositorAdapter Interface  │
         │                                │
         │  • getWorkspaces()             │
         │  • getFocusedWorkspace()       │
         │  • getWindows()                │
         │  • getFocusedWindow()          │
         │  • switchToWorkspace()         │
         │  • focusWindow()               │
         │  • connect(handlers)           │
         │                                │
         │  Capabilities:                 │
         │  • supportsWorkspaces          │
         │  • supportsWindows             │
         └───────────────┬───────────────┘
                         │
         ┌───────────────┼───────────────┐
         │               │               │
         ▼               ▼               ▼
    ┌─────────┐    ┌──────────┐    ┌─────────┐
    │Workspace│    │  Window  │    │ Active  │
    │ Widget  │    │  Title   │    │Workspace│
    └─────────┘    └──────────┘    └─────────┘
```

## Compositor Detection Flow

```shell
Start
  │
  ├─ Check HYPRLAND_INSTANCE_SIGNATURE
  │    └─ Set? → Return "hyprland"
  │
  ├─ Check XDG_CURRENT_DESKTOP
  │    ├─ Contains "hyprland"? → Return "hyprland"
  │    ├─ Contains "sway"? → Return "sway"
  │    ├─ Contains "niri"? → Return "niri"
  │    └─ Other? → Continue
  │
  └─ Default → Return "fallback"
```

## Adapter Implementation Comparison

| Feature         | Hyprland                | Sway (Template)      | Fallback       |
| --------------- | ----------------------- | -------------------- | -------------- |
| **Data Source** | AstalHyprland (GObject) | swaymsg (IPC/JSON)   | None           |
| **Workspaces**  | ✅ Native IPC           | ✅ JSON parsing      | ❌ Empty array |
| **Windows**     | ✅ Native IPC           | ✅ Tree traversal    | ❌ Empty array |
| **Events**      | ✅ GObject signals      | ⚠️ Polling/Subscribe | ❌ No-op       |
| **Performance** | Excellent               | Good (IPC)           | N/A            |

## Event System Architecture

```shell
┌──────────────────────────────────────────────────────────┐
│                    Widget Code                            │
│                                                           │
│  compositor.connect({                                    │
│    onWorkspacesChanged: handleUpdate,                    │
│    onFocusedWindowChanged: handleUpdate,                 │
│  })                                                      │
└─────────────────────────┬────────────────────────────────┘
                          │
                          ▼
┌──────────────────────────────────────────────────────────┐
│              Compositor Adapter                           │
│                                                           │
│  Hyprland:                                               │
│  • Subscribes to GObject signals                         │
│  • Returns disconnect function                           │
│                                                           │
│  Sway:                                                   │
│  • Opens IPC subscription socket                         │
│  • Parses event stream                                   │
│  • Calls handlers on events                              │
│                                                           │
│  Fallback:                                               │
│  • Returns no-op disconnect                              │
└──────────────────────────────────────────────────────────┘
```

## Widget Integration Pattern

```typescript
// 1. Import compositor abstraction
import { getCompositor } from "compositors";

export function MyWidget(): Gtk.Box {
  // 2. Get compositor instance
  const compositor = getCompositor();

  // 3. Check capabilities
  if (!compositor.supportsWorkspaces) {
    return createHiddenWidget();
  }

  // 4. Get data
  const workspaces = compositor.getWorkspaces();

  // 5. Subscribe to events
  compositor.connect({
    onWorkspacesChanged: updateUI,
  });

  // 6. Perform actions
  button.connect("clicked", () => {
    compositor.switchToWorkspace(id);
  });
}
```

## Data Flow Example: Switching Workspace

```shell
User clicks workspace button
         │
         ▼
Widget calls: compositor.switchToWorkspace(5)
         │
         ▼
┌────────┴─────────┐
│                  │
▼                  ▼
Hyprland:          Fallback:
hypr.dispatch()    console.warn()
         │
         ▼
Compositor changes workspace
         │
         ▼
Compositor emits event
         │
         ▼
Adapter receives signal
         │
         ▼
Adapter calls: handlers.onFocusedWorkspaceChanged()
         │
         ▼
Widget's updateUI() is called
         │
         ▼
UI updates to show new focused workspace
```

## Type Hierarchy

```shell
CompositorAdapter (interface)
├── Capabilities
│   ├── supportsWorkspaces: boolean
│   └── supportsWindows: boolean
│
├── Data Getters
│   ├── getWorkspaces(): CompositorWorkspace[]
│   ├── getFocusedWorkspace(): CompositorWorkspace | null
│   ├── getWindows(): CompositorWindow[]
│   ├── getFocusedWindow(): CompositorWindow | null
│   └── getWorkspaceWindows(id): CompositorWindow[]
│
├── Actions
│   ├── switchToWorkspace(id: number): void
│   └── focusWindow(address: string): void
│
└── Events
    └── connect(handlers: CompositorEventHandlers): () => void

CompositorWorkspace
├── id: number
└── name?: string

CompositorWindow
├── address: string
├── title: string
├── appClass: string
├── workspaceId: number
└── hidden: boolean

CompositorEventHandlers
├── onWorkspacesChanged?: () => void
├── onFocusedWorkspaceChanged?: () => void
├── onFocusedWindowChanged?: () => void
├── onWindowAdded?: () => void
├── onWindowRemoved?: () => void
└── onWindowMoved?: () => void
```

## Directory Structure

```shell
config/compositors/
├── types.ts                    # Core interfaces and types
├── index.ts                    # Factory, detection, singleton
├── hyprland.ts                 # Hyprland implementation
├── fallback.ts                 # Fallback implementation
├── sway.ts.template            # Template for Sway (future)
├── README.md                   # Implementation guide
└── ARCHITECTURE.md             # This file
```

## Graceful Degradation Example

```shell
┌─────────────────────────────────┐
│  Hyprland (Full Support)        │
│  ✅ Workspaces widget shown     │
│  ✅ Window title shown          │
│  ✅ Workspace preview shown     │
│  ✅ All features enabled        │
└─────────────────────────────────┘

┌─────────────────────────────────┐
│  Sway (Future - Full Support)   │
│  ✅ Workspaces widget shown     │
│  ✅ Window title shown          │
│  ✅ Workspace preview shown     │
│  ✅ All features enabled        │
└─────────────────────────────────┘

┌─────────────────────────────────┐
│  Niri (Future - Partial)        │
│  ❌ Workspaces hidden           │
│  ✅ Window title shown          │
│  ❌ Preview not available       │
│  ⚠️  Limited features           │
└─────────────────────────────────┘

┌─────────────────────────────────┐
│  Unknown Compositor (Fallback)  │
│  ❌ Workspaces hidden           │
│  ❌ Window title hidden         │
│  ❌ No compositor features      │
│  ✅ Other widgets work          │
└─────────────────────────────────┘
```

## Benefits Visualization

```shell
Before (Hyprland-only):
┌──────────┐
│ Widgets  │──→ AstalHyprland ──→ Hyprland only
└──────────┘         ❌ Other compositors crash

After (Abstracted):
┌──────────┐     ┌────────────┐
│ Widgets  │──→  │ Compositor │──→ Hyprland ✅
└──────────┘     │  Adapter   │──→ Sway ✅
                 └────────────┘──→ Fallback ✅
                                ──→ Future compositors ✅
```

## Performance Considerations

### Hyprland Adapter

- **Excellent**: Direct GObject bindings, zero overhead
- **Events**: Real-time via native signals
- **No polling**: Event-driven architecture

### Sway Adapter (Template)

- **Good**: IPC socket communication
- **Events**: Subscribe to event stream
- **Minimal overhead**: JSON parsing only

### Fallback Adapter

- **N/A**: No operations performed
- **Zero overhead**: Returns empty data

## Extension Points

To add a new compositor:

1. **Create adapter file** (`compositors/yourcompositor.ts`)
2. **Implement interface** (`CompositorAdapter`)
3. **Add detection** (in `index.ts`)
4. **Register factory** (in `index.ts`)
5. **Test capabilities** (set flags appropriately)

See `sway.ts.template` for a complete example.
