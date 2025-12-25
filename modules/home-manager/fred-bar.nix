{
  lib,
  config,
  pkgs,
  inputs,
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
        inputs.astal.packages.${pkgs.system}.hyprland
        inputs.astal.packages.${pkgs.system}.tray
        inputs.astal.packages.${pkgs.system}.battery
      ];
    };
  };
}
