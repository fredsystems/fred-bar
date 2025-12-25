{
  lib,
  config,
  pkgs,
  inputs,
  astral,
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

      configDir = "${inputs.fredbar.packages.${pkgs.system}.fredbar}/share/fredbar/config";

      extraPackages = with pkgs; [
        astral.packages.${pkgs.system}.hyprland
        astral.packages.${pkgs.system}.tray
        astral.packages.${pkgs.system}.battery
      ];
    };
  };
}
