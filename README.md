# fredbar

**fredbar** is a lightweight, modular system bar built with [AGS](https://github.com/Aylur/ags) and GTK4, designed as a modern replacement for Waybar in Wayland compositors (currently focused on Hyprland).

It is opinionated, Home-Manager–first, and intentionally minimal: fredbar exposes system state clearly, avoids over-configuration, and is built as a real application rather than a pile of shell scripts.

> [!NOTE]
> This project primarily exists to scratch my own itch — but it is structured cleanly enough that others are welcome to try it.

## Features

- Per-monitor bar with hotplug support
- Reserved screen space (layer-shell, no window overlap)
- Modular "pill"-style widgets:
  - **System tray** - Native system tray with status icons
  - **Workspaces + active window** - Hyprland workspace indicator and window title
  - **Network** - Shows WiFi SSID or Ethernet connection with signal strength
  - **Volume** - Audio control with scroll to adjust, click to mute
  - **Battery** - Battery percentage and charging status (laptops)
  - **Time / date** - Clock with timezone support and calendar popover
  - **System state** - Aggregated status (media playback, updates, idle inhibitors)
- **Native Astal integration** - No shell script polling, uses GObject signals for reactive updates
- **GTK tooltips** with consistent styling and state-aware colors
- **Home Manager integration** - Single-line enable in your NixOS config
- **Optional user-level systemd service** - Easy lifecycle management
- **Catppuccin Mocha color scheme** - Beautiful, cohesive theming

## Requirements

- NixOS (or another system using Home Manager)
- Home Manager
- Wayland compositor (tested with **Hyprland**)
- AGS + Astal (handled automatically by the flake)

> [!IMPORTANT]
> fredbar is set up to Just Work(tm) for NixOS and Home Manager. It is possible to run this without Home Manager, but you will need to configure it manually. Look at `flake.nix` and `fred-bar.nix` for context about what packages it depends on, how I set up the systemd unit, and what specific astral packages need to be installed.

fredbar is **not** intended to be run without Home Manager.

## Installation (Nix flakes)

### 1. Add fredbar as a flake input

In your system flake:

```nix
fredbar = {
  url = "github:FredSystems/fred-bar";
  inputs.nixpkgs.follows = "nixpkgs";
};
```

### 2. Enable fredbar via Home Manager

Enable the Home Manager module for your user:

```nix
home-manager.users.${username} = {
  programs.fredbar = {
    enable = true;
  };
};
```

This will:

- Enable AGS
- Install fredbar’s AGS configuration
- Pull in all required Astal packages
- Install (but **not start**) a user systemd service

## Running fredbar

fredbar does **not** auto-start by default.

You have two options:

### Option 1: Start it manually (recommended for testing)

```bash
systemctl --user start fredbar
```

To stop it:

```bash
systemctl --user stop fredbar
```

Logs:

```bash
journalctl --user -u fredbar -f
```

### Option 2: Start it with your compositor (Hyprland)

In your Hyprland config:

```ini
exec-once = systemctl --user start fredbar
```

This keeps fredbar compositor-agnostic while still integrating cleanly.

## Systemd user service

fredbar installs a **user-level systemd service**:

- Name: `fredbar.service`
- Scope: user session
- Disabled by default
- Uses the Home Manager–wrapped `ags` binary

The service exists purely as a convenience and integration point — it does not run unless you explicitly start it.

## Development

For local development:

```bash
nix develop
ags run -d config
```

The dev shell provides:

- AGS with all required Astal packages
- Linting and formatting tools
- A runtime environment matching the Home Manager install

You can also override the flake input in your system flake to point to a local checkout:

```bash
nixos-rebuild switch \
  --flake .#hostname \
  --override-input fredbar /absolute/path/to/fred-bar
```

## Scope & non-goals

fredbar intentionally does **not** aim to be:

- A drop-in Waybar clone
- Highly themeable via JSON/YAML
- Compositor-agnostic out of the box
- A general-purpose status bar framework

If you want something endlessly configurable, Waybar or Eww may be a better fit.

If you want a clean, understandable bar built like a real application, fredbar might be interesting.

## Architecture

fredbar is built on top of [AGS (Aylur's GTK Shell)](https://github.com/Aylur/ags) and uses the [Astal](https://github.com/Aylur/astal) library ecosystem for system integration.

### Tech Stack

- **Language**: TypeScript (compiled via AGS)
- **UI Framework**: GTK4
- **System Integration**: Astal GObject libraries
- **Build System**: Nix flakes
- **Styling**: CSS with Catppuccin Mocha variables

### Widget Architecture

Each widget in fredbar follows a consistent pattern:

1. **Import Astal library** - e.g., `AstalBattery`, `AstalNetwork`, `AstalWp`
2. **Create reactive state** - Uses GObject signals for real-time updates (no polling!)
3. **Build GTK widget tree** - Constructs boxes, labels, and controls
4. **Attach event handlers** - Scroll, click, and other user interactions
5. **Add tooltips** - Contextual information on hover
6. **Cleanup on destroy** - Disconnect signals to prevent memory leaks

### Astal Packages Used

fredbar leverages the following Astal packages for native system integration:

| Package | Purpose | Widget(s) |
|---------|---------|-----------|
| `astal.hyprland` | Hyprland compositor integration | Workspaces, window titles |
| `astal.tray` | System tray protocol | System tray |
| `astal.battery` | UPower battery monitoring | Battery pill |
| `astal.network` | NetworkManager integration | Network pill |
| `astal.wireplumber` | WirePlumber/PipeWire audio | Volume pill, media detection |
| `astal.mpris` | MPRIS media player protocol | Media player detection |

All widgets use **reactive programming** - they subscribe to GObject signals and update automatically when system state changes. No polling required!

### Project Structure

```
config/
├── app.tsx                    # Main application entry point
├── style.css                  # Global styles and Catppuccin theme
├── helpers/                   # Shared utilities
│   ├── tooltip.tsx           # Tooltip attachment helper
│   └── resolvescripts.tsx    # Script path resolution
├── left/                      # Left-side widgets
│   └── sys-tray/             # System tray implementation
├── center/                    # Center widgets
│   ├── active-workspace.tsx  # Current workspace indicator
│   ├── window-title.tsx      # Active window title
│   ├── workspaces.tsx        # Workspace switcher
│   └── window-workspaces-pill.tsx  # Combined widget
├── right/                     # Right-side widgets
│   ├── battery/              # Battery status
│   ├── network/              # Network connection
│   ├── speaker-volume/       # Audio volume control
│   ├── time-pill/            # Clock and date
│   └── system/               # System state aggregation
│       └── state/
│           ├── modules/      # Individual state monitors
│           │   ├── idleInhibit.tsx    # D-Bus idle inhibitor detection
│           │   ├── media.tsx          # Media playback detection
│           │   ├── networkState.tsx   # Network connectivity
│           │   └── updateState.tsx    # System updates
│           └── helpers/      # State normalization utilities
└── scripts/                   # Minimal remaining scripts
    └── waybar-updates.sh     # NixOS update checker (custom logic)
```

### Widget Details

#### Network Pill

**File**: `config/right/network/network.tsx`

Uses `AstalNetwork` to monitor network connectivity:
- Displays WiFi SSID with signal strength icons
- Shows "Ethernet" for wired connections
- Updates instantly on network changes (no polling)
- Color-coded: default gray when connected, red when disconnected

**Icons**:
- 󰤨 󰤥 󰤢 󰤟 󰤯 - WiFi signal strength
- 󰈀 - Ethernet
- 󰤮 - Disconnected

#### Volume Pill

**File**: `config/right/speaker-volume/volume.tsx`

Uses `AstalWp` (WirePlumber) for audio control:
- **Scroll** to adjust volume (5% increments)
- **Click** to toggle mute
- Shows volume icon + percentage
- Instant updates when volume changes externally

**Icons**:
- 󰝟 - Muted
- 󰕿 - Low (0-20%)
- 󰖀 - Medium (21-60%)
- 󰕾 - High (61-100%)

#### Battery Pill

**File**: `config/right/battery/battery.tsx`

Uses `AstalBattery` for power monitoring:
- Shows percentage and charging icon
- Color-coded by charge level:
  - Green: >90% or charging
  - Yellow: 50-89%
  - Orange: 20-49%
  - Red: <20%
- Tooltip shows time remaining and power draw

#### System State Pill

**File**: `config/right/system/state-pill.tsx`

Aggregates multiple system signals:
- **Media playback** - Detects active audio/microphone via AstalWp
- **Media players** - Shows playing media via AstalMpris
- **Idle inhibitors** - D-Bus queries to systemd-logind
- **System updates** - Custom NixOS git repo monitoring

The pill shows the highest-priority active state with appropriate icon and color.

### D-Bus Integration

fredbar uses direct D-Bus communication for systemd integration:

**Idle Inhibit Detection** (`config/right/system/state/modules/idleInhibit.tsx`):
- Queries `org.freedesktop.login1.Manager.ListInhibitors`
- Parses inhibitor tuples directly (no shell scripts!)
- Filters for block-mode idle/sleep inhibitors
- Checks user systemd service for caffeine state

This approach is more efficient and reliable than parsing `systemd-inhibit` output.

### Custom Scripts

Only **one script** remains in fredbar:

**`waybar-updates.sh`**: NixOS-specific update detection
- Checks `/run/reboot-required` for pending reboots
- Monitors git repository for upstream changes
- Custom logic that doesn't have an Astal equivalent
- This is application-specific, not general system monitoring

All other monitoring (audio, network, battery, idle inhibitors) uses native Astal libraries or D-Bus.

### Styling System

fredbar uses a semantic CSS class system:

**Pill states**:
- `.network-connected`, `.battery-good` - Normal operation (gray/green)
- `.battery-warn`, `.battery-low` - Warning states (yellow/orange)
- `.network-error`, `.battery-critical` - Error states (red)

**State severity**:
- `.state-idle` - No attention needed (muted colors)
- `.state-info` - Informational (blue)
- `.state-warn` - Attention recommended (yellow)
- `.state-error` - Something wrong (red)

All colors are defined as CSS variables in `style.css` using the Catppuccin Mocha palette.

## Contributing

fredbar is a personal project but contributions are welcome! When adding features:

1. **Use Astal libraries** when possible instead of shell scripts
2. **Follow the widget pattern** - reactive updates via GObject signals
3. **Add cleanup handlers** - disconnect signals in `_cleanup` method
4. **Use semantic CSS classes** - follow the existing state/severity system
5. **Document Nerd Font icons** - include icon codes in comments
6. **Test with hotplug** - ensure widgets handle device changes gracefully

## License

MIT — see [`LICENSE`](./LICENSE).
