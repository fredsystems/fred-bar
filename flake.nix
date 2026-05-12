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

    # Needed directly because we add a project-local tsc hook that wraps
    # the compiler in a filter (see `tsc-filtered` writeShellApplication
    # below). The precommit framework doesn't expose a way to inject
    # extra hooks, so we re-invoke `git-hooks.lib.run` ourselves and
    # merge in our hook alongside the framework's.
    git-hooks = {
      url = "github:cachix/git-hooks.nix";
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
      git-hooks,
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
      #
      # We bypass `precommit.lib.mkCheck` for one reason: the framework's
      # built-in tsc hook runs `tsc --build <tsconfig>` and surfaces every
      # error tsc emits, including the ~8 errors in upstream ags / gnim
      # `.ts` sources that ship without `.d.ts` files (see
      # `node_modules/ags/lib/gtk4/app.ts:288` for one example). Those are
      # not bugs in our code; the canonical `ags init` template fails
      # `tsc -p . --noEmit` straight out of the box.
      #
      # Rather than disabling typechecking entirely, we keep tsc as a
      # pre-commit hook but post-filter its output to errors originating
      # in `config/**` (excluding `config/@girs` and `config/node_modules`
      # which contain generated / vendored code). Any error from our own
      # source still fails the hook; upstream noise is silently dropped.
      checks = lib.genAttrs systems (
        system:
        let
          pkgs = import nixpkgs { inherit system; };

          # Wrapper script: run tsc in project mode, then filter stderr+stdout
          # to retain only lines pointing at fred-bar sources. Exits non-zero
          # iff at least one such line remains.
          tscFiltered = pkgs.writeShellApplication {
            name = "fredbar-tsc-check";
            runtimeInputs = [
              pkgs.typescript
              pkgs.gnugrep
              pkgs.coreutils
              # `ags types -u` regenerates `config/@girs` and the
              # `config/node_modules/{ags,gnim}` symlinks. The hook
              # runs inside a git-hooks sandbox where those gitignored
              # artifacts are absent, so we regenerate them on demand.
              ((patchedAgs system).override {
                extraPackages = self.lib.fredbarAstalPackages system;
              })
            ];
            text = ''
              set -u

              # Ensure ags-generated artifacts exist. They live in
              # gitignored paths so are absent from a clean checkout
              # (e.g. the pre-commit sandbox or a CI clone).
              # `ags types -u` regenerates types AND rewrites
              # `config/tsconfig.json` from a hard-coded template, so we
              # save and restore the in-repo config around the call.
              if [ ! -d "./config/@girs" ] || [ ! -L "./config/node_modules/ags" ]; then
                cp ./config/tsconfig.json ./config/.tsconfig.json.bak
                if ! ags types -u -d "./config" >/tmp/ags-types.log 2>&1; then
                  mv ./config/.tsconfig.json.bak ./config/tsconfig.json
                  printf '[tsc] %s\n' \
                    "failed to generate ags types; tsc cannot resolve gi:// modules" >&2
                  printf '[tsc] ags types output:\n' >&2
                  cat /tmp/ags-types.log >&2 || true
                  exit 1
                fi
                mv ./config/.tsconfig.json.bak ./config/tsconfig.json
              fi

              # Capture both streams. tsc writes errors to stdout, but be
              # defensive in case that changes in a future release.
              # `writeShellApplication` enables `set -e`; suppress it just
              # for the tsc invocation so we can inspect its exit code.
              set +e
              raw="$(tsc -p ./config --noEmit 2>&1)"
              rc=$?
              set -e

              # Strip lines whose error path does NOT live under our
              # source tree. Anything outside `config/` (including
              # paths starting with `../` that escape the cwd, e.g.
              # `../../../nix/store/...` symlinks) or under
              # `config/@girs/` and `config/node_modules/` is upstream
              # noise.
              filtered="$(printf '%s\n' "$raw" \
                | grep -E '^(config/)' \
                | grep -vE '^config/(@girs|node_modules)/' \
                || true)"

              if [ -n "$filtered" ]; then
                printf '%s\n' "$filtered"
                exit 1
              fi

              # tsc exited non-zero but every error was upstream. Still
              # report a green light, but log a one-line note so it's
              # not silent.
              if [ "$rc" -ne 0 ]; then
                printf '[tsc] %s\n' \
                  "passed (upstream-only errors filtered out)" >&2
              fi
              exit 0
            '';
          };

          baseMod = precommit.lib.mkBaseCheck { inherit system; };
          jsMod = precommit.lib.mkJavascriptCheck {
            inherit system;
            enableBiome = true;
            enableTsc = false; # we provide our own filtered hook below
          };

          extraHook = {
            tsc-fredbar = {
              enable = true;
              entry = "${tscFiltered}/bin/fredbar-tsc-check";
              files = "\\.(ts|tsx)$";
              pass_filenames = false;
            };
          };

          hooks = baseMod.hooks // jsMod.hooks // extraHook;
          excludes = baseMod.excludes ++ jsMod.excludes;

          run = git-hooks.lib.${system}.run {
            src = ./.;
            inherit hooks excludes;
          };
        in
        {
          pre-commit = run // {
            passthru = {
              devPackages = baseMod.passthru.devPackages ++ jsMod.passthru.devPackages ++ [ tscFiltered ];
              libPath = baseMod.passthru.libPath ++ jsMod.passthru.libPath;
            };
            enabledPackages = run.enabledPackages or [ ];
          };
        }
      );

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
                # TypeScript compiler for typechecking config/ (ags doesn't
                # typecheck at runtime). Invoke with: `tsc -p config --noEmit`.
                typescript
                ((patchedAgs system).override {
                  extraPackages = self.lib.fredbarAstalPackages system;
                })
              ]);

            LD_LIBRARY_PATH = pkgs.lib.makeLibraryPath (chk.passthru.libPath or [ ]);

            shellHook = ''
              ${chk.shellHook}

              alias pre-commit="pre-commit run --all-files"

              # Generate TypeScript types and link the ags / gnim packages
              # into config/node_modules. `ags types -u` is idempotent but
              # ALSO rewrites config/tsconfig.json from a hard-coded ags
              # template, clobbering our in-repo settings (baseUrl,
              # skipLibCheck, etc.). Save and restore around the call.
              if [ ! -d "$PWD/config/@girs" ] || [ ! -L "$PWD/config/node_modules/ags" ]; then
                echo "[fred-bar] generating ags TypeScript types..." >&2
                cp "$PWD/config/tsconfig.json" "$PWD/config/.tsconfig.json.bak"
                if ags types -u -d "$PWD/config" >/dev/null 2>&1; then
                  mv "$PWD/config/.tsconfig.json.bak" "$PWD/config/tsconfig.json"
                else
                  mv "$PWD/config/.tsconfig.json.bak" "$PWD/config/tsconfig.json"
                  echo "[fred-bar] WARNING: 'ags types -u' failed; tsc will not resolve ags modules" >&2
                fi
              fi
            '';
          };
        }
      );
    };
}
