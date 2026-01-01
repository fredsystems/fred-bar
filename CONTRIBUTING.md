# Contributing to fredbar

Thank you for your interest in contributing to fredbar! This guide will help you understand the project structure, architecture, and development workflow.

## Philosophy

fredbar is built around several core principles:

1. **Native integration over shell scripts** - Use Astal GObject libraries instead of polling scripts
2. **Reactive programming** - Subscribe to signals, update automatically
3. **Type safety** - Leverage TypeScript's type system
4. **Minimal dependencies** - Only depend on what's necessary
5. **Clean code** - Self-documenting, well-commented code

## Getting Started

### Prerequisites

- NixOS or Nix package manager
- Home Manager (for production use)
- Basic understanding of:
  - TypeScript
  - GTK4/GObject
  - D-Bus (for advanced features)
  - Nix flakes

### Development Setup

1. Clone the repository:

   ```bash
   git clone https://github.com/FredSystems/fred-bar.git
   cd fred-bar
   ```

2. Enter the development shell:

   ```bash
   nix develop
   ```

3. Run fredbar in development mode:

   ```bash
   ags run -d config
   ```

The dev shell provides:

- AGS with all Astal packages
- Linting and formatting tools
- Runtime dependencies for scripts

### Project Structure

```text
config/
├── app.tsx                    # Entry point - creates bars for all monitors
├── style.css                  # Global styles (Catppuccin Mocha theme)
├── compositors/               # Compositor abstraction layer
│   ├── types.ts              # Generic compositor interfaces
│   ├── index.ts              # Factory and auto-detection
│   ├── hyprland.ts           # Hyprland adapter (AstalHyprland)
│   ├── fallback.ts           # Fallback for unsupported compositors
│   └── README.md             # Architecture documentation
├── helpers/                   # Shared utilities
│   ├── tooltip.tsx           # Tooltip attachment helper
│   └── resolvescripts.tsx    # Script path resolution
├── left/                      # Left-aligned widgets
│   └── sys-tray/             # System tray (AstalTray)
├── center/                    # Center-aligned widgets
│   ├── workspaces.tsx        # Workspace switcher (compositor-aware)
│   ├── window-title.tsx      # Active window title (compositor-aware)
│   └── window-workspaces-pill.tsx  # Combined workspace/window widget
├── right/                     # Right-aligned widgets
│   ├── battery/              # Battery monitor (AstalBattery)
│   ├── network/              # Network status (AstalNetwork)
│   ├── speaker-volume/       # Volume control (AstalWp)
│   ├── time-pill/            # Clock and date
│   └── system/               # System state aggregation
│       └── state/
│           ├── modules/      # Individual state monitors
│           └── helpers/      # State normalization
└── scripts/                   # Minimal remaining scripts
    └── waybar-updates.sh     # NixOS update checker
```

## Widget Development

### Widget Pattern

All fredbar widgets follow a consistent pattern:

```typescript
import SomeAstal from "gi://AstalSomething";
import Gtk from "gi://Gtk?version=4.0";
import { attachTooltip } from "helpers/tooltip";

/**
 * Widget description and features
 */
export function MyWidget(): Gtk.Box {
  const service = SomeAstal.get_default();

  // 1. Create container
  const box = new Gtk.Box({
    spacing: 4,
    css_classes: ["my-widget", "pill"],
  });

  // 2. Create child widgets
  const icon = new Gtk.Label({ label: "" });
  const label = new Gtk.Label({ label: "" });

  box.append(icon);
  box.append(label);

  // 3. Define update function
  function update(): void {
    // Read from Astal service
    // Update widget properties
  }

  // 4. Initial render
  update();

  // 5. Subscribe to signals
  const handlerId = service.connect("notify::some-property", update);

  // 6. Add event handlers (optional)
  // scroll, click, etc.

  // 7. Attach tooltip
  attachTooltip(box, {
    text: () => "Tooltip content",
    classes: () => ["my-widget"],
  });

  // 8. Cleanup handler
  (box as Gtk.Widget & { _cleanup?: () => void })._cleanup = () => {
    service.disconnect(handlerId);
  };

  return box;
}
```

### Key Principles

#### 1. Use Astal Libraries

**DO:**

```typescript
import Network from "gi://AstalNetwork";

const network = Network.get_default();
const wifi = network.wifi;
const ssid = wifi.ssid;
```

**DON'T:**

```typescript
const ssid = await execAsync(["nmcli", "-t", "-f", "SSID", "dev", "wifi"]);
```

#### 2. Reactive Updates

**DO:**

```typescript
function update(): void {
  label.label = service.some_property;
}

const id = service.connect("notify::some-property", update);
```

**DON'T:**

```typescript
setInterval(() => {
  label.label = service.some_property;
}, 1000);
```

#### 3. Cleanup Handlers

**DO:**

```typescript
(box as Gtk.Widget & { _cleanup?: () => void })._cleanup = () => {
  service.disconnect(handlerId);
  if (otherResource) {
    otherResource.cleanup();
  }
};
```

**DON'T:**

```typescript
// Forget to disconnect - causes memory leaks!
return box;
```

#### 4. Semantic CSS Classes

**DO:**

```typescript
// State-based classes
box.add_css_class("network-connected");
box.add_css_class("battery-warn");

// Severity-based classes
box.add_css_class("state-error");
```

**DON'T:**

```typescript
// Hardcoded styles
box.set_css_classes(["red-border", "big-text"]);
```

#### 4. Compositor Abstraction

For workspace and window management, use the compositor abstraction layer instead of directly importing `AstalHyprland`:

**DO:**

```typescript
import { getCompositor } from "compositors";

export function MyWidget(): Gtk.Box {
  const compositor = getCompositor();

  // Check capabilities before using features
  if (!compositor.supportsWorkspaces) {
    return createFallbackWidget();
  }

  const workspaces = compositor.getWorkspaces();
  const focused = compositor.getFocusedWorkspace();

  compositor.connect({
    onWorkspacesChanged: updateUI,
  });
}
```

**DON'T:**

```typescript
import Hyprland from "gi://AstalHyprland";

const hypr = Hyprland.get_default(); // Hardcoded to Hyprland
```

This ensures the bar works across different Wayland compositors. See `config/compositors/README.md` for full documentation.

### Available Astal Packages

| Package       | Import               | Purpose                                                  |
| ------------- | -------------------- | -------------------------------------------------------- |
| AstalBattery  | `gi://AstalBattery`  | UPower battery monitoring                                |
| AstalNetwork  | `gi://AstalNetwork`  | NetworkManager integration                               |
| AstalWp       | `gi://AstalWp`       | WirePlumber/PipeWire audio                               |
| AstalMpris    | `gi://AstalMpris`    | MPRIS media players                                      |
| AstalTray     | `gi://AstalTray`     | System tray protocol                                     |
| AstalHyprland | `gi://AstalHyprland` | Hyprland compositor (use compositor abstraction instead) |

To add a new Astal package, update `flake.nix`:

```nix
fredbarAstalPackages = system: [
  astal.packages.${system}.new-package
  # ...
];
```

## Styling

### CSS Variables

fredbar uses Catppuccin Mocha colors defined in `style.css`:

```css
:root {
  --ctp-text: #cdd6f4;
  --ctp-error: #f38ba8;
  --ctp-warning: #f9e2af;
  --ctp-success: #a6e3a1;
  /* ... */
}
```

### Widget Classes

Apply semantic classes to widgets:

```typescript
// Pill base
// State classes (mutually exclusive)
css_classes: ["my-widget", "pill"].network -
  connected.network - // Normal operation
  // Severity classes (for system state)
  error.state - // Error state
  idle.state - // Muted
  info.state - // Blue
  warn.state - // Yellow
  error; // Red
```

### Tooltip Theming

Tooltips inherit state from the widget:

```typescript
attachTooltip(box, {
  text: () => "Content",
  classes: () => [currentStateClass], // e.g., "battery-warn"
});
```

Tooltip CSS automatically adds `-tooltip` suffix:

- `.battery-warn` → `.battery-warn-tooltip`

## D-Bus Integration

For system features not covered by Astal, use D-Bus:

```typescript
import Gio from "gi://Gio";
import GLib from "gi://GLib";

const connection = Gio.DBus.system; // or Gio.DBus.session

const result = connection.call_sync(
  "org.freedesktop.ServiceName", // Service
  "/path/to/object", // Object path
  "org.freedesktop.Interface", // Interface
  "MethodName", // Method
  new GLib.Variant("(s)", ["arg"]), // Parameters
  GLib.VariantType.new("(s)"), // Return type
  Gio.DBusCallFlags.NONE,
  -1,
  null,
);

// Parse result
const value = result?.get_child_value(0)?.get_string()[0];
```

See `config/right/system/state/modules/idleInhibit.tsx` for a complete example.

## Nerd Fonts

fredbar uses Nerd Fonts for icons. Find icons at: <https://www.nerdfonts.com/cheat-sheet>

Always document icon codes in comments:

```typescript
const ICONS = {
  wifi: "󰤨", // nf-md-wifi_strength_4
  ethernet: "󰈀", // nf-md-ethernet
  offline: "󰤮", // nf-md-wifi_strength_off
};
```

## Testing

### Manual Testing

1. Start fredbar in dev mode:

   ```bash
   ags run -d config
   ```

2. Make changes to TypeScript files

3. Restart AGS (it auto-reloads on file changes)

4. Check logs:

   ```bash
   # Development
   # Watch terminal output

   # Production
   journalctl --user -u fredbar -f
   ```

### Testing Checklist

When adding/modifying a widget:

- [ ] Widget displays correctly on initial load
- [ ] Updates reactively when state changes
- [ ] Handles device hotplug gracefully
- [ ] Tooltip shows correct information
- [ ] Event handlers work (click, scroll, etc.)
- [ ] Cleanup handler disconnects all signals
- [ ] CSS classes applied correctly
- [ ] Works across monitor hotplug
- [ ] No console errors or warnings

## Code Style

### TypeScript

- Use TypeScript's type system - avoid `any`
- Prefer `const` over `let`
- Use arrow functions for callbacks
- Document functions with JSDoc comments:

```typescript
/**
 * Converts signal strength to icon
 * @param strength - Signal strength percentage (0-100)
 * @returns Nerd Font icon string
 */
function getIcon(strength: number): string {
  // ...
}
```

### Comments

- Explain **why**, not **what**
- Document non-obvious behavior
- Add section headers for organization:

```typescript
/* -----------------------------
 * Section Name
 * ----------------------------- */
```

- Use inline comments for clarity:

```typescript
const step = 0.05; // 5% steps (0.05 = 5% of 1.0)
```

### Formatting

The dev shell includes formatters. Run before committing:

```bash
pre-commit run --all-files
```

## Pull Request Process

1. **Fork the repository** and create a feature branch

2. **Make your changes** following the guidelines above

3. **Test thoroughly** - ensure no regressions

4. **Document your changes**:
   - Update README.md if adding features
   - Add inline comments for complex logic
   - Update this guide if changing architecture

5. **Submit PR** with clear description:
   - What does it do?
   - Why is it needed?
   - How was it tested?

## Common Pitfalls

### Memory Leaks

**Problem:** Forgot to disconnect signals

```typescript
const id = service.connect("notify", update);
return box; // LEAK!
```

**Solution:** Always add cleanup

```typescript
(box as Gtk.Widget & { _cleanup?: () => void })._cleanup = () => {
  service.disconnect(id);
};
```

### Polling Instead of Signals

**Problem:** Polling for changes

```typescript
setInterval(() => checkState(), 1000);
```

**Solution:** Use GObject signals

```typescript
service.connect("notify::property", update);
```

### Hardcoded Paths

**Problem:** Absolute paths in code

```typescript
const config = "/home/user/.config/fredbar/config.json";
```

**Solution:** Use GLib path utilities

```typescript
import GLib from "gi://GLib";
const configDir = GLib.getenv("AGS_CONFIG_DIR");
const config = GLib.build_filenamev([configDir, "config.json"]);
```

### Race Conditions

**Problem:** Assuming service is ready

```typescript
const network = Network.get_default();
const ssid = network.wifi.ssid; // wifi might be null!
```

**Solution:** Check for null/undefined

```typescript
const network = Network.get_default();
const wifi = network.wifi;
if (wifi && wifi.ssid) {
  // safe to use
}
```

## Resources

- [AGS Documentation](https://aylur.github.io/ags-docs/)
- [GTK4 Documentation](https://docs.gtk.org/gtk4/)
- [GObject Documentation](https://docs.gtk.org/gobject/)
- Icons: [Nerd Fonts Cheat Sheet](https://www.nerdfonts.com/cheat-sheet)
- [Catppuccin Theme](https://github.com/catppuccin/catppuccin)
- [D-Bus Specification](https://dbus.freedesktop.org/doc/dbus-specification.html)

## Getting Help

- Open an issue for bugs or questions
- Check existing issues and PRs first
- Provide logs and reproduction steps
- Be patient and respectful

## License

By contributing, you agree that your contributions will be licensed under the MIT License.
