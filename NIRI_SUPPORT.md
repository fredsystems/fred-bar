# Niri Compositor Support

This document summarizes the Niri compositor support implementation for fredbar.

## Status

✅ **FULLY IMPLEMENTED** - Niri is now a first-class supported compositor alongside Hyprland.

## Overview

fredbar now works seamlessly on Niri with full workspace and window management support, including proper multi-monitor handling with per-output workspaces.

## Features

### Workspaces

- ✅ Display workspace indices (1, 2) per monitor
- ✅ Active workspace highlighting per monitor
- ✅ Workspace switching (click to switch)
- ✅ Workspace previews on hover
- ✅ Window list in workspace previews
- ✅ Click window in preview to focus

### Windows

- ✅ Active window title per monitor
- ✅ Application icon display
- ✅ Real-time title updates
- ✅ Window focusing from previews

### Multi-Monitor

- ✅ Independent workspace display per monitor
- ✅ Per-monitor active window tracking
- ✅ Correct workspace-to-monitor mapping
- ✅ Support for 3+ monitors tested

## Implementation Approach

### Architecture

- **JSON CLI Interface**: Uses `niri msg --json` for all queries
- **Polling-Based Updates**: 200ms polling interval for state changes
- **Multi-Monitor Aware**: Each bar instance tracks its own monitor
- **Event Handler Array**: Multiple widgets can subscribe to updates

### Key Technical Decisions

1. **JSON over Text Parsing**
   - Reliable workspace ID and metadata extraction
   - Direct mapping of window IDs to workspace IDs
   - Both global IDs (for matching) and indices (for display)

2. **Polling over Event Stream**
   - Simpler implementation than GLib IOChannel event stream
   - More reliable than text parsing of streaming events
   - 200ms interval provides good responsiveness
   - Acceptable overhead for the use case

3. **Per-Monitor Detection**
   - Uses GTK window's `monitor` property
   - More reliable than surface-based detection
   - Widgets detect monitor on `realize` event

4. **Multiple Event Handlers**
   - Stored as array instead of single object
   - Allows all monitors to receive updates
   - Each widget checks its own monitor and updates accordingly

## Workspace ID Mapping

Niri has a unique workspace model:

- **Global Workspace IDs**: Unique across all monitors (1, 2, 3, 4, 5, 6)
- **Workspace Indices**: Per-monitor display values (1, 2 on each output)

Example with 3 monitors, 2 workspaces each:

```shell
DP-2:      Workspace ID 2 (idx 1) ← active
           Workspace ID 4 (idx 2)

DP-3:      Workspace ID 3 (idx 1) ← active
           Workspace ID 5 (idx 2)

HDMI-A-1:  Workspace ID 1 (idx 1) ← active
           Workspace ID 6 (idx 2)
```

The adapter:

- Shows indices (1, 2) to users
- Uses global IDs internally for window matching
- Converts IDs to indices when switching workspaces

## Commands Used

All commands use JSON output for reliability:

```bash
# Get all workspaces with IDs, indices, and active windows
niri msg --json workspaces

# Get all windows with workspace IDs
niri msg --json windows

# Get currently focused window
niri msg --json focused-window

# Get focused output name (for initial detection)
niri msg focused-output

# Switch workspace (uses index, not ID)
niri msg action focus-workspace <INDEX>

# Focus specific window
niri msg action focus-window --id <ID>
```

## Files Modified/Created

### New Files

- `config/compositors/niri.ts` - Niri compositor adapter implementation
- `config/compositors/NIRI_IMPLEMENTATION.md` - Detailed implementation docs
- `NIRI_SUPPORT.md` - This summary document

### Modified Files

- `config/compositors/types.ts` - Added monitor parameter to methods
- `config/compositors/index.ts` - Added Niri detection and factory registration
- `config/compositors/hyprland.ts` - Updated signatures for monitor parameter
- `config/compositors/fallback.ts` - Updated signatures for monitor parameter
- `config/center/active-workspace.tsx` - Per-monitor workspace detection
- `config/center/workspaces.tsx` - Per-monitor workspace display
- `config/center/window-title.tsx` - Per-monitor window title
- `README.md` - Updated to list Niri as fully supported
- `TODO.md` - Marked Niri support as complete

## Testing

Tested and verified on:

- 3-monitor setup (DP-2, DP-3, HDMI-A-1)
- 2 workspaces per monitor
- Workspace switching on all monitors
- Window title updates on all monitors
- Workspace previews with correct windows

## Performance

- **Polling overhead**: ~200ms interval, minimal CPU usage
- **CLI overhead**: Single `niri msg --json workspaces` call per poll
- **Window queries**: On-demand when showing previews
- **Responsiveness**: Updates within 200ms of state change

## Limitations

1. **Polling-based updates**
   - Not instant like Hyprland's GObject signals
   - 200ms delay acceptable for UI responsiveness

2. **No window add/remove events**
   - Only tracks active window changes
   - Workspace preview windows refresh when shown

3. **JSON format dependency**
   - Relies on `niri msg --json` output format
   - More stable than text but not a formal API

## Future Improvements

- [ ] Implement proper event stream if GLib IOChannel issues are resolved
- [ ] Add configurable polling interval
- [ ] Cache window list between polls to reduce CLI calls
- [ ] Add window add/remove event detection

## Comparison: Hyprland vs Niri Adapters

| Feature             | Hyprland                  | Niri                    |
| ------------------- | ------------------------- | ----------------------- |
| **Data Source**     | AstalHyprland (GObject)   | `niri msg --json` (CLI) |
| **Updates**         | GObject signals (instant) | Polling (200ms)         |
| **Workspace Model** | Global workspace list     | Per-output workspaces   |
| **Multi-Monitor**   | Single workspace set      | Independent per monitor |
| **Performance**     | Excellent (native)        | Good (polling)          |
| **API Stability**   | Stable (GObject)          | Good (JSON CLI)         |

Both adapters provide full functionality through the compositor abstraction layer.

## Conclusion

Niri is now fully supported with feature parity to Hyprland. The multi-monitor workspace model is properly handled with per-monitor workspace and window tracking. The polling-based approach provides reliable updates with acceptable overhead.

fredbar users can switch between Hyprland and Niri without any configuration changes - the compositor is auto-detected and the appropriate adapter is loaded automatically.
