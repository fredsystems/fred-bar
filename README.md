# fredbar

**fredbar** is a lightweight, modular system bar built with [AGS](https://github.com/Aylur/ags) and GTK4, designed as a modern replacement for Waybar in Wayland compositors (currently focused on Hyprland).

It is opinionated, Home-Manager–first, and intentionally minimal: fredbar exposes system state clearly, avoids over-configuration, and is built as a real application rather than a pile of shell scripts.

> This project primarily exists to scratch my own itch — but it is structured cleanly enough that others are welcome to try it.

## Features

- Per-monitor bar with hotplug support
- Reserved screen space (layer-shell, no window overlap)
- Modular “pill”-style widgets:
  - System tray
  - Workspace + active window
  - Volume (scroll + click)
  - Time / date
  - System state aggregation (media, updates, idle inhibitors, etc.)
- GTK tooltips with consistent styling
- Home Manager integration
- Optional user-level systemd service

## Requirements

- NixOS (or another system using Home Manager)
- Home Manager
- Wayland compositor (tested with **Hyprland**)
- AGS + Astal (handled automatically by the flake)

> [!NOTE]
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

## License

MIT — see [`LICENSE`](./LICENSE).
