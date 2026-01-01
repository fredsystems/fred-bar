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
  - [x] All buttons now have consistent hover effects with translateY(-2px) lift
  - [x] Fixed Ethernet button hover (was disabled due to sensitive: false)
  - [x] Fixed slider trough hover to lighten instead of darken
- [x] Tool tips
  - [x] Remove tool tip from buttons with text (Logout/Reboot/Shutdown, BT/WiFi/VPN/Ethernet, Power Profiles)
  - [x] Media player control buttons use custom tooltip helper with proper styling
  - [x] Media tooltips styled with surface0 background and blue rounded border
- [x] Sliders refined
  - [x] Made sliders narrower (6px height) with pill-shaped ends
  - [x] Fixed hover behavior on trough
- [ ] Need to improve dismissing
  - [x] ESC key dismisses the panel
  - [ ] Clicking outside of the panel should dismiss it (complex - layer-shell limitations)
  - [ ] Clicking the system status pill to toggle needs refinement (works with mouse movement)

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

- [x] **Make bar compositor-agnostic** - ✅ COMPLETED
  - ✅ Created `compositors/` directory with common interface (`CompositorAdapter`)
  - ✅ `compositors/hyprland.ts` - Uses AstalHyprland bindings
  - ✅ `compositors/fallback.ts` - Minimal/hidden features for unknown compositors
  - ✅ Auto-detection based on environment variables
  - ✅ All center widgets refactored to use compositor abstraction
  - ✅ Widgets gracefully hide when compositor doesn't support features
  - **Next steps**:
    - [ ] Add Sway support (`compositors/sway.ts`)
    - [ ] Add Niri support (`compositors/niri.ts`) - CLI-based, limited features
    - [ ] Add River support if desired
  - **Implementation details**:
    - `types.ts` - Generic workspace/window interfaces
    - `index.ts` - Factory with auto-detection
    - Capability flags: `supportsWorkspaces`, `supportsWindows`
    - Event system with disconnect callbacks
    - See `config/compositors/README.md` for full documentation

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
