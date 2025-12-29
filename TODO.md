# fredbar TODO List

## Polish & Bug Fixes

### Spacing Issues

- [x] **Window title pill** - Too much spacing between icon and window title text
- [x] **Time pill hover** - Too much space between time and date when calendar label is expanded

### Interaction Issues

- [ ] **Tray pill hover effects** - Inconsistent hover styling (some elements show hover effect, others don't)
- [ ] **Tray pill menu actions** - Clicking on menu items doesn't trigger their assigned actions

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

**Planned Features**:

- [ ] 🎵 Media player controls (play/pause, track info, scrubbing)
- [ ] 🔆 Brightness slider
- [ ] 🔊 Volume sliders (multiple outputs/inputs)
- [ ] 📡 Network switcher (WiFi networks, VPN toggle)
- [ ] 🔔 Notification history
- [ ] ⚡ Power menu (shutdown/restart/logout/lock)
- [ ] 🌙 Night light toggle
- [ ] 📱 Bluetooth device management

## Future Enhancements

### Workspace Preview

- [ ] Window thumbnails/screenshots for visual preview
  - Background service to capture window screenshots (using grim)
  - Thumbnail caching system
  - Display small thumbnails next to window titles
  - (Optional) Spatial layout showing actual window positions

## Quality Checks

- [ ] Spacing inconsistencies across pills
- [ ] Tooltip positioning/alignment issues
- [ ] Animation timing tweaks
- [ ] Icon sizes consistent across widgets

---

## Notes

- System control center is the biggest next feature - would serve as main system interaction hub
- Color scheme needs deliberate design thinking before implementation
- Calendar integration requires research into CalDAV libraries/tools
- Workspace thumbnails are cool but non-essential (tabled for now)
