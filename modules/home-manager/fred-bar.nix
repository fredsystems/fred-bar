{
  lib,
  config,
  pkgs,
  fredbarPkg,
  ...
}:

let
  cfg = config.programs.fredbar;
in
{
  options.programs.fredbar = {
    enable = lib.mkEnableOption "FredBar (AGS-based system bar)";
  };

  config = lib.mkIf cfg.enable {
    programs.ags = {
      enable = true;

      # FredBar AGS config
      configDir = "${fredbarPkg}/share/fredbar/config";

      # Astal + friends, defined ONCE in the fredbar flake
      extraPackages = config._module.args.fredbarAstalPackages pkgs.stdenv.hostPlatform.system;

    };

    # Runtime dependencies for fredbar scripts
    home.packages = config._module.args.fredbarRuntimePackages pkgs.stdenv.hostPlatform.system;

    systemd.user.services.fredbar = {
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
  };
}
