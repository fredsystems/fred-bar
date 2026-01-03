{
  lib,
  config,
  pkgs,
  fredbarPkg,
  fredcalPkg,
  ...
}:

let
  cfg = config.programs.fredbar;
  cfg_fredcal = config.programs.fredcal;
in
{
  options.programs = {
    fredbar = {
      enable = lib.mkEnableOption "FredBar (AGS-based system bar)";
    };

    fredcal = {
      enable = lib.mkEnableOption "FredCal (CalDAV syncing service)";

      server = lib.mkOption {
        type = lib.types.str;
        description = "CalDAV server address (hostname or URL). Path to file";
        example = "https://caldav.example.com";
      };

      username = lib.mkOption {
        type = lib.types.str;
        description = "Username (path to file) for CalDAV authentication.";
      };

      password = lib.mkOption {
        type = lib.types.str;
        description = "Password (path to file) for CalDAV authentication.";
      };

      port = lib.mkOption {
        type = lib.types.port;
        default = 3000;
        description = "Port used by fred-cal.";
      };
    };
  };

  config = lib.mkIf cfg.enable {
    assertions = lib.mkIf cfg_fredcal.enable [
      {
        assertion = cfg_fredcal.server != "" && cfg_fredcal.username != "" && cfg_fredcal.password != "";
        message = ''
          programs.fredcal requires all of the following options to be set:
            - programs.fredcal.server
            - programs.fredcal.username
            - programs.fredcal.password
        '';
      }
    ];

    programs.ags = {
      enable = true;

      # FredBar AGS config
      configDir = "${fredbarPkg}/share/fredbar/config";

      # Astal + friends, defined ONCE in the fredbar flake
      extraPackages = config._module.args.fredbarAstalPackages pkgs.stdenv.hostPlatform.system;

    };

    # Runtime dependencies for fredbar scripts
    home.packages = config._module.args.fredbarRuntimePackages pkgs.stdenv.hostPlatform.system;

    systemd.user.services = {
      fredbar = {
        Unit = {
          Description = "FredBar (AGS-based system bar)";
          PartOf = [ "graphical-session.target" ];
        };

        Path = {
          PathChanged = "${fredbarPkg}";
        };

        Service = {
          Type = "simple";
          ExecStart = "${config.home.profileDirectory}/bin/ags run";
          Restart = "on-failure";
          RestartSec = "2s";

          KillMode = "mixed";
        };

        Install = {
          WantedBy = [ ];
        };
      };

      fredcal = lib.mkIf cfg_fredcal.enable {
        Unit = {
          Description = "FredCal (CalDAV Syncing)";
          PartOf = [ "graphical-session.target" ];
        };

        Service = {
          Type = "simple";

          ExecStart = ''
            ${fredcalPkg}/bin/fred-cal \
              --caldav-server ${lib.escapeShellArg cfg_fredcal.server} \
              --port ${toString cfg_fredcal.port} \
              --username ${lib.escapeShellArg cfg_fredcal.username} \
              --password ${lib.escapeShellArg cfg_fredcal.password}
          '';

          Restart = "on-failure";
          RestartSec = "2s";
        };

        Install = {
          WantedBy = [ "graphical-session.target" ];
        };
      };
    };

    # NOTE: DDC/CI monitor brightness control requires system-level configuration.
    # Add to your NixOS configuration:
    #
    #   hardware.i2c.enable = true;
    #   users.users.<username>.extraGroups = [ "i2c" ];
    #
    # This will create the i2c group and add udev rules for /dev/i2c-* devices.
  };
}
