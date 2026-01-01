# Niri Compositor Implementation

This document describes the implementation of the Niri compositor adapter for fredbar.

## Overview

The Niri adapter provides full workspace and window management support using the `niri msg --json` CLI interface with polling for updates. It supports multi-monitor setups with per-monitor workspace and window tracking.

## Implementation Details

### Architecture

Unlike Hyprland which uses GObject bindings, Niri adapter uses:

1. **JSON CLI commands** - `niri msg --json` for querying state and performing actions
2. **Polling** - 200ms polling interval to detect state changes
3. **JSON parsing** - Parse JSON output for reliable data extraction

### Core Components

#### 1. JSON CLI Command Execution

Uses `GLib.spawn_command_line_sync()` for synchronous queries:

- `niri msg --json workspaces` - Get workspace list with IDs and metadata
- `niri msg focused-output` - Get active output name
- `niri msg --json windows` - Get all windows with workspace IDs
- `niri msg --json focused-window` - Get focused window

#### 2. Polling System

Uses `setInterval()` to poll state every 200ms:

- Polls workspace state and active windows per monitor
- Compares state changes using JSON stringification
- Triggers event callbacks when changes are detected
- Multiple event handlers supported via handler array

#### 3. JSON Parsing

Direct JSON parsing of command output:

- **Workspaces**: Parse with both global ID and display index
- **Windows**: Parse with window ID and workspace ID mapping
- **Multi-monitor**: Track active workspace per output

## Workspace Handling

### Per-Output Workspaces

Niri has a unique per-output workspace model:

- Each monitor has its own independent workspace list
- Same workspace ID can exist on multiple monitors
- Active workspace is per-output

### Implementation Strategy

The adapter shows workspaces **per-monitor** for each bar instance:

1. Each bar widget detects its own monitor via window's `monitor` property
2. Call `niri msg --json workspaces` to get all workspace data
3. Filter workspaces by the widget's monitor output name
4. Show workspace index (1, 2) while using global ID (1-6) internally for window matching

This provides independent workspace display on each monitor in multi-monitor setups.

## Command Details

### Get Workspaces

```bash
niri msg --json workspaces
```

**Output Format (JSON):**

```json
[
  {
    "id": 2,
    "idx": 1,
    "name": null,
    "output": "DP-2",
    "is_active": true,
    "is_focused": true,
    "active_window_id": 9
  },
  {
    "id": 4,
    "idx": 2,
    "name": null,
    "output": "DP-2",
    "is_active": false,
    "is_focused": false,
    "active_window_id": null
  }
]
```

**Parsing:**

- `id` - Global workspace ID (used for window matching)
- `idx` - Display index within output (1, 2, etc - shown to user)
- `output` - Monitor connector name
- `is_active` - Active workspace on that output
- `active_window_id` - ID of focused window on workspace

### Get Focused Output

```bash
niri msg focused-output
```

**Output Format:**

```shell
Output "ASUSTek COMPUTER INC VG27A SALMQS105752" (DP-2)
  Current mode: 2560x1440 @ 59.951 Hz (preferred)
  ...
```

**Parsing:**

- Extract output name from parentheses: `(DP-2)`
- Used to determine which output's workspaces to show

### Get Windows

```bash
niri msg --json windows
```

**Output Format (JSON):**

```json
[
  {
    "id": 9,
    "title": "fred-bar — niri.ts",
    "app_id": "dev.zed.Zed",
    "workspace_id": 2,
    "is_focused": true
  }
]
```

**Parsing:**

- Direct JSON parsing
- Convert `id` to string for address field
- Use `workspace_id` to match with workspace global IDs

### Get Focused Window

```bash
niri msg --json focused-window
```

**Output Format:**
Same JSON structure as individual window.

### Switch Workspace

```bash
niri msg action focus-workspace <INDEX>
```

Switches to the specified workspace index (1, 2, etc) on the current output. The adapter converts the global workspace ID to the index before calling this command.

### Focus Window

```bash
niri msg action focus-window --id <ID>
```

Focuses the window with the specified ID.

## Polling System

### Polling Interval

The adapter polls state every 200ms:

```typescript
setInterval(() => {
  // Check workspace changes
  // Check active window changes per monitor
}, 200);
```

### Change Detection

#### Workspace Changes

Compares JSON stringified workspace state:

- All workspaces with their IDs, indices, and focused status
- Triggers `onWorkspacesChanged` and `onFocusedWorkspaceChanged`

#### Window Changes

Compares active window per monitor:

- Gets all active workspaces (one per monitor)
- Maps to their `active_window_id`
- Sorts by output name for stable comparison
- Triggers `onFocusedWindowChanged` when any monitor's active window changes

### Multiple Listeners

Event handlers are stored in an array to support multiple widgets:

- Each widget (per monitor) registers its own update callback
- When state changes, all registered handlers are called
- Each widget checks its own monitor and updates accordingly

## Performance Considerations

### Caching

- **Workspace data**: Not cached, queried on each poll
- **State changes**: Cached stringified JSON for comparison

### Polling vs Event Stream

- Initially attempted event stream but faced IOChannel complexity
- Polling at 200ms provides good responsiveness
- Simpler implementation with JSON output
- Acceptable overhead for the use case

### CLI Overhead

- Each poll cycle makes 1 CLI call (`niri msg --json workspaces`)
- Window queries are on-demand (when rendering previews)
- ~200ms interval provides good balance of responsiveness vs overhead

## Multi-Monitor Behavior

### Workspace Display

- Shows workspaces from **focused output only**
- Switching outputs updates workspace list automatically
- Prevents confusion from duplicate workspace IDs

### Window Tracking

- Windows from all outputs are tracked
- Workspace preview shows windows on that workspace ID
- May include windows from multiple outputs (same workspace ID)

## Edge Cases

### No Focused Output

- Returns empty workspace list
- Bar shows no workspaces

### No Focused Window

- Returns null
- Window title widget hides itself

### Polling Robustness

- Polling continues indefinitely while handlers are registered
- Stops automatically when all widgets disconnect
- No disconnection issues like with event streams

### Multi-Monitor Workspace Ambiguity

- Same workspace ID can exist on multiple monitors
- Adapter prioritizes focused output's workspaces
- Workspace switching affects focused output

## Limitations

### Known Issues

1. **Polling overhead**
   - 200ms polling interval may have slight CPU impact
   - Could be optimized with event stream in future

2. **Multi-monitor workspace complexity**
   - Same workspace ID on multiple monitors
   - Switching workspace affects current output only

3. **JSON format changes**
   - CLI JSON output format could change
   - More stable than text parsing but still not a formal API

### Future Improvements

- Implement proper event stream with IOChannel (if GJS bugs are resolved)
- Optimize polling frequency based on activity
- Cache window list between polls to reduce CLI calls
- Add configurable polling interval

## Testing

### Verify Detection

```bash
echo $XDG_CURRENT_DESKTOP  # Should include "niri"
niri msg version           # Should succeed
```

### Verify Commands Work

```bash
niri msg --json workspaces
niri msg focused-output
niri msg --json windows
niri msg --json focused-window
```

### Test Bar Integration

```bash
ags run -d config
# Check logs for:
# [Compositor] Initializing adapter for: niri
# [NiriAdapter] Initialized with JSON output
```

### Test Features

1. **Workspaces**: Hover over center pill, verify workspaces shown
2. **Active workspace**: Verify correct workspace highlighted
3. **Window title**: Verify focused window title displayed
4. **Workspace switching**: Click workspace, verify it switches
5. **Workspace preview**: Hover over workspace, verify windows listed
6. **Window focusing**: Click window in preview, verify focus changes

## Comparison with Hyprland Adapter

| Feature        | Hyprland             | Niri                  |
| -------------- | -------------------- | --------------------- |
| Data source    | GObject bindings     | JSON CLI commands     |
| Events         | GObject signals      | Polling (200ms)       |
| Performance    | Excellent            | Good                  |
| Multi-monitor  | Single workspace set | Per-output workspaces |
| API stability  | Stable               | JSON output format    |
| State tracking | Real-time signals    | Polling-based         |

## Conclusion

The Niri adapter provides full-featured compositor integration using JSON CLI commands and polling. While not as tightly integrated as Hyprland's GObject bindings, it offers comparable functionality with good performance and per-monitor workspace tracking. The polling-based approach is simpler and more reliable than event stream parsing, with acceptable overhead for the use case.

## Status

✅ **Fully Implemented and Working**

- Multi-monitor support with per-monitor workspaces
- Window title tracking per monitor
- Workspace switching and window focusing
- Workspace previews with window lists
- Real-time updates via polling
