# fredbar TODO List

## Polish & Bug Fixes

### Spacing Issues

- [x] **Window title pill** - Too much spacing between icon and window title text
- [x] **Time pill hover** - Too much space between time and date when calendar label is expanded
- [x] **Media player widget** - Takes up excessive space when no media is playing (now hidden when empty)

### Interaction Issues

- [x] **Tray pill hover effects** - Inconsistent hover styling (some elements show hover effect, others don't)
- [x] **Tray pill menu actions** - Clicking on menu items doesn't trigger their assigned actions

### Labels & Text

- [x] **Volume tooltip** - Audio device name not human-friendly (shows technical device name instead of user-friendly name)

### Visual Design & Color Language

- [ ] **Color scheme consistency** - Current design is trending monochromatic, but needs variation without being chaotic
  - Establish which elements should have accent colors (mauve, blue, etc.)
  - Determine which should be neutral (overlay/surface colors)
  - Define rules for when to use semantic colors (green/yellow/red for status)
  - Create overall visual hierarchy and color purpose guidelines

### Visual Enhancements

- [ ] **World clocks** - More stylized display
  - Consider analog clock faces
  - Better visual treatment/typography
  - Possible day/night indicators for each timezone

## Feature Enhancements

### Calendar Widget Expansion

- [ ] **Enhanced calendar view** - Replace simple world clocks with richer calendar
  - Three-month calendar view (prev/current/next)
  - "Today" panel showing events from CalDAV calendars
  - Research CalDAV integration (evolution-data-server or CLI tools like khal/calcurse)

### System Status Control Center

- [x] Hover affects on the buttons is off.
  - [x] If the button has a colored background, there is no hover effect.
  - [x] Logout/Reboot/Shutdown have a different (and better) hover effect than BT/Wifi/Ethernet/etc
  - [x] All buttons now have consistent hover effects with translateY(-2px) lift
- [x] Tool tips
  - [x] Remove tool tip from buttons with text (Logout/Reboot/Shutdown, BT/WiFi/VPN/Ethernet, Power Profiles)
  - [x] Media player control buttons retain tooltips (they have no text labels)
  - [x] Tooltips now styled with surface0 background and blue rounded border matching sidebar widgets
- [ ] Need to improve dismissing
  - [ ] Clicking outside of the panel should dismiss it (without blocking events inside the panel)
  - [ ] Sometimes clicking the system status pill does not dismiss the panel

**Vision**: Click on system status pill to open a comprehensive control center

**UX Decision Needed**: Choose interaction model

- **Option A: Sidebar Panel (swaync-style)** ⭐ _Recommended_
  - Slides in from right edge
  - Doesn't steal full focus
  - Easy to dismiss
  - Can work while using other apps
- **Option B: Centered Popover (GNOME Quick Settings-style)**
  - Pops up below/above the pill
  - Floats over apps but more contained
- **Option C: Full Screen Overlay (macOS Notification Center-style)**
  - Covers monitor, takes full focus
  - Most disruptive

**Status**: ✅ Implemented as sidebar panel (Option A)

**Completed Features**:

- [x] 🔆 Brightness slider (auto-detects backlight devices)
- [x] 🔊 Volume sliders (speaker + microphone)
- [x] 🎵 Media player with artwork and controls
- [x] ⚡ System actions (reboot, shutdown, logout with compositor detection)
- [x] 📡 Connectivity toggles (Bluetooth, WiFi, Ethernet, VPN)
- [x] 🔋 Power profiles toggle (if supported by CPU)
- [x] 🔔 Notification center with history and DND toggle

**Potential Enhancements**:

- [ ] 📡 Network switcher (select WiFi networks from list)
- [ ] 🌙 Night light toggle
- [ ] 📱 Bluetooth device management (pair/unpair devices)

## Architecture Improvements

### Styling & Organization

- [✅] **SCSS refactoring** - Restructure monolithic CSS into organized SCSS modules
  - ✅ Created modular SCSS file structure with base/ and components/ directories
  - ✅ Defined SCSS variables for Catppuccin Mocha color palette
  - ✅ Separated components into individual files for better organization
  - ✅ Added theme variables for typography, spacing, borders, transitions

### Compositor Abstraction

- [ ] **Make bar compositor-agnostic** - Currently hard-coded to Hyprland
  - Center bar uses `AstalHyprland` for workspaces and window titles
  - Need abstraction layer to support multiple compositors (Hyprland, Niri)
  - **Proposed approach**:
    - Create `compositors/` directory with common interface
    - `compositors/hyprland.ts` - Uses AstalHyprland bindings
    - `compositors/niri.ts` - Uses `niri` CLI commands (no IPC available)
    - `compositors/fallback.ts` - Minimal/hidden features for unknown compositors
    - Auto-detection based on environment or config
  - **Niri limitations**:
    - No IPC like Hyprland
    - Scrolling workspace model doesn't map to traditional workspace list
    - Workspaces feature would likely be hidden on Niri
    - Window title could be obtained via `niri` command if available
  - **Benefits**:
    - Bar works across different Wayland compositors
    - Graceful degradation when features aren't available
    - Easier to add support for new compositors in future

## Future Enhancements

### Workspace Preview

- [ ] Window thumbnails/screenshots for visual preview
  - Background service to capture window screenshots (using grim)
  - Thumbnail caching system
  - Display small thumbnails next to window titles
  - (Optional) Spatial layout showing actual window positions

## Quality Checks

- [x] Spacing inconsistencies across pills (mostly resolved)
- [x] Tooltip positioning/alignment issues (improved)
- [ ] Animation timing tweaks (ongoing refinement)
- [x] Icon sizes consistent across widgets (standardized)

---

## Notes

- ✅ System control center implemented as sidebar panel - serves as main system interaction hub
- Color scheme needs deliberate design thinking before implementation
- Calendar integration requires research into CalDAV libraries/tools
- Workspace thumbnails are cool but non-essential (tabled for now)
- Compositor abstraction is next major architecture improvement - will enable multi-compositor support
