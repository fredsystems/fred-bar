{
  description = "Dev shell and Linting";

  inputs = {
    nixpkgs.url = "github:nixos/nixpkgs/nixos-unstable";

    ags.url = "github:Aylur/ags";
    astal.url = "github:Aylur/astal";

    precommit = {
      url = "github:FredSystems/pre-commit-checks";
      inputs.nixpkgs.follows = "nixpkgs";
    };
  };

  outputs =
    {
      self,
      nixpkgs,
      precommit,
      ags,
      astal,
      ...
    }:
    let
      systems = precommit.lib.supportedSystems;
      inherit (nixpkgs) lib;
    in
    {
      packages = lib.genAttrs systems (
        system:
        let
          pkgs = import nixpkgs { inherit system; };
        in
        {
          fredbar = pkgs.stdenv.mkDerivation {
            pname = "fredbar";
            version = "0.1.0";

            src = ./.;

            installPhase = ''
              mkdir -p $out/share/fredbar
              cp -r config $out/share/fredbar/
            '';
          };
        }
      );

      homeManagerModules = {
        fredbar = import ./modules/home-manager/fredbar.nix;
      };

      ##########################################################################
      ## PRE-COMMIT CHECKS
      ##########################################################################
      checks = lib.genAttrs systems (system: {
        pre-commit = precommit.lib.mkCheck {
          inherit system;
          src = ./.;

          # ── Feature toggles ─────────────────────────────
          check_rust = false;
          check_docker = true;
          check_python = false;
          check_javascript = true;
        };
      });

      ##########################################################################
      ## DEV SHELL
      ##########################################################################
      devShells = lib.genAttrs systems (
        system:
        let
          pkgs = import nixpkgs { inherit system; };
          chk = self.checks.${system}.pre-commit;
        in
        {
          default = pkgs.mkShell {
            buildInputs =
              chk.enabledPackages
              ++ (chk.passthru.devPackages or [ ])
              ++ (with pkgs; [
                pre-commit
                check-jsonschema
                codespell
                typos
                nixfmt
                nodePackages.markdownlint-cli2
                ags.packages.${system}.default
                astal.packages.${pkgs.stdenv.hostPlatform.system}.hyprland
                astal.packages.${pkgs.stdenv.hostPlatform.system}.tray
                astal.packages.${pkgs.system}.battery
              ]);

            LD_LIBRARY_PATH = pkgs.lib.makeLibraryPath (chk.passthru.libPath or [ ]);

            shellHook = ''
              ${chk.shellHook}
              alias pre-commit="pre-commit run --all-files"
            '';
          };
        }
      );
    };
}
