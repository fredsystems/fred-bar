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

    fredcal = {
      url = "github:FredSystems/fred-cal";
      inputs.nixpkgs.follows = "nixpkgs";
    };

    hyprshutdown = {
      url = "github:hyprwm/hyprshutdown";
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
      fredcal,
      hyprshutdown,
      ...
    }:
    let
      systems = precommit.lib.supportedSystems;
      inherit (nixpkgs) lib;

      # Upstream AGS sets `proxyVendor = true` in its nix/default.nix.
      # That makes the FOD output non-deterministic across machines:
      # `go mod download` writes per-module `@v/list` files whose contents
      # depend on whatever versions the Go module proxy happens to know
      # about at fetch time. The result is a vendorHash that flaps
      # between values depending on which runner builds first, breaking
      # CI builds at random whenever the `ags` flake input is bumped.
      #
      # We override to `proxyVendor = false`, which makes Go produce a
      # real `vendor/` tree (deterministic — strictly the modules listed
      # in `cli/go.sum`). vendorHash below only needs updating when
      # AGS's `cli/go.sum` actually changes, not at the whim of the
      # Go proxy.
      patchedAgs =
        system:
        ags.packages.${system}.default.overrideAttrs (_: {
          proxyVendor = false;
          vendorHash = "sha256-BHoVwiVMlbUzZHhgZIwg2vYKtJISJ01plNCqQctKb6I=";
        });

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
          git
          ddcutil
          rwedid
          fredcal.packages.${system}.default
          hyprshutdown.packages.${system}.hyprshutdown
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

          # Exposed so CI can rebuild it without substituters to verify
          # the vendorHash override hasn't drifted. Not intended as a
          # user-facing package.
          patched-ags = patchedAgs system;
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
              fredcalPkg = fredcal.packages.${pkgs.stdenv.hostPlatform.system}.default;
              fredbarAgsPkg = patchedAgs pkgs.stdenv.hostPlatform.system;

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
                markdownlint-cli2
                # Debugger for tracking down gjs/GLib refcount underflows and
                # segfaults that have no JS-side backtrace. Pair with
                # `G_DEBUG=fatal-criticals` so the first GLib-CRITICAL halts
                # the process in gdb.
                gdb
                ((patchedAgs system).override {
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
