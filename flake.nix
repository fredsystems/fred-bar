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

      fredbarAstalPackages = system: [
        astal.packages.${system}.hyprland
        astal.packages.${system}.tray
        astal.packages.${system}.battery
        astal.packages.${system}.wireplumber
        astal.packages.${system}.network
        astal.packages.${system}.mpris
        astal.packages.${system}.notifd
        astal.packages.${system}.bluetooth
        astal.packages.${system}.powerprofiles
      ];

      fredbarRuntimePackages =
        system:
        let
          pkgs = import nixpkgs { inherit system; };
        in
        with pkgs;
        [
          # Updates tracking (waybar-updates.sh)
          git
          ddcutil
          rwedid

          # Idle inhibit (idleinhibit-toolbar.sh)
          # systemd and gawk are already in base system
        ];
    in
    {
      lib.fredbarAstalPackages = fredbarAstalPackages;
      lib.fredbarRuntimePackages = fredbarRuntimePackages;

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
        fredbar =
          { pkgs, ... }:
          {
            imports = [
              ags.homeManagerModules.default
              ./modules/home-manager/fred-bar.nix
            ];

            _module.args = {
              fredbarPkg = self.packages.${pkgs.stdenv.hostPlatform.system}.fredbar;

              inherit (self.lib) fredbarAstalPackages fredbarRuntimePackages;
            };
          };
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
          check_docker = false;
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
              ++ (self.lib.fredbarRuntimePackages system)
              ++ (with pkgs; [
                pre-commit
                check-jsonschema
                codespell
                typos
                nixfmt
                nodePackages.markdownlint-cli2
                (ags.packages.${system}.default.override {
                  extraPackages = self.lib.fredbarAstalPackages system;
                })
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
