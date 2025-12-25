{
  lib,
  config,
  pkgs,
  astal,
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

      configDir = "${fredbarPkg}/share/fredbar/config";

      extraPackages = with pkgs; [
        astal.packages.${pkgs.system}.hyprland
        astal.packages.${pkgs.system}.tray
        astal.packages.${pkgs.system}.battery
      ];
    };
  };
}
