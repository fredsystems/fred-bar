{
  lib,
  config,
  pkgs,
  inputs,
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
      extraPackages = inputs.fredbar.lib.fredbarAstalPackages pkgs.system;
    };
  };
}
