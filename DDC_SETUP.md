# DDC/CI Monitor Brightness Control Setup

FredBar supports controlling external monitor brightness via DDC/CI (Display Data Channel Command Interface). This requires system-level configuration to allow access to I2C devices.

## Prerequisites

The following packages are already included in FredBar's runtime dependencies:

- `ddcutil` - Tool for querying and controlling monitors via DDC/CI
- `rwedid` - EDID reading/writing utility

## NixOS Configuration

Add the following to your NixOS configuration (`configuration.nix` or relevant module):

```nix
{
  # Enable I2C hardware support
  hardware.i2c.enable = true;

  # Add your user to the i2c group
  users.users.<your-username>.extraGroups = [ "i2c" ];
}
```

The `hardware.i2c.enable = true;` option will:

1. Load the `i2c-dev` kernel module
2. Create the `i2c` group
3. Add udev rules to set `/dev/i2c-*` devices to group `i2c` with mode `0660`

After applying this configuration, **log out and log back in** for the group membership to take effect.

## Verification

### 1. Check I2C devices exist

```bash
ls -l /dev/i2c-*
```

You should see devices like `/dev/i2c-0`, `/dev/i2c-1`, etc., owned by group `i2c`.

### 2. Check group membership

```bash
groups
```

You should see `i2c` in the output.

### 3. Detect monitors

```bash
ddcutil detect
```

This should list your DDC/CI-capable monitors. Example output:

```text
Display 1
   I2C bus:  /dev/i2c-4
   Monitor:  Dell U2720Q
   ...

Display 2
   I2C bus:  /dev/i2c-5
   Monitor:  BenQ PD2700U
   ...
```

### 4. Test brightness control

Get current brightness (VCP code 10):

```bash
ddcutil getvcp 10 --bus 1
```

Set brightness to 50%:

```bash
ddcutil setvcp 10 50 --bus 1
```

Replace `1` with your monitor's bus number from the detect output.

## Troubleshooting

### No monitors detected

Some monitors don't support DDC/CI or have it disabled. Check your monitor's OSD menu for DDC/CI settings.

### Permission denied

Ensure you:

1. Have `hardware.i2c.enable = true;` in your NixOS config
2. Your user is in the `i2c` group
3. You've logged out and back in after adding the group

### Slow response

DDC/CI can be slow (100-500ms per command). FredBar polls brightness every 2 seconds to detect external changes while minimizing I2C bus traffic.

### Module not loaded

If I2C devices don't exist, manually load the module:

```bash
sudo modprobe i2c-dev
```

Then add it permanently via NixOS config:

```nix
boot.kernelModules = [ "i2c-dev" ];
```

## Technical Details

### VCP Codes

FredBar uses VCP (Virtual Control Panel) code 10 for brightness control:

- Code 10: Brightness (0-100 or 0-max value reported by monitor)

### Supported Monitors

Most modern monitors support DDC/CI, but some exceptions:

- Very old monitors (pre-2010)
- Some gaming monitors disable DDC/CI in certain modes
- USB-C monitors may need USB connection for DDC/CI
- Some monitors require DDC/CI to be explicitly enabled in OSD

### Alternative: Manual udev rules

If you can't use `hardware.i2c.enable`, add udev rules manually:

```nix
services.udev.extraRules = ''
  KERNEL=="i2c-[0-9]*", GROUP="i2c", MODE="0660"
'';

users.groups.i2c = {};
users.users.<your-username>.extraGroups = [ "i2c" ];
```

## Performance Considerations

DDC/CI operations are slow compared to laptop backlight control:

- Laptop backlight: < 1ms
- DDC/CI: 100-500ms

FredBar handles this by:

- Using async commands for brightness changes
- Polling at a reasonable interval (2s)
- Not blocking the UI during DDC operations

## References

- [ddcutil documentation](https://www.ddcutil.com/)
- [DDC/CI specification](https://en.wikipedia.org/wiki/Display_Data_Channel)
- [VESA Monitor Control Command Set (MCCS)](https://en.wikipedia.org/wiki/Monitor_Control_Command_Set)
