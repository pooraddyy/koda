{
  description = "koda development flake";

  inputs = {
    nixpkgs.url = "github:NixOS/nixpkgs/nixpkgs-unstable";
  };

  outputs =
    { self, nixpkgs, ... }:
    let
      systems = [
        "aarch64-linux"
        "x86_64-linux"
        "aarch64-darwin"
        "x86_64-darwin"
      ];
      forEachSystem = f: nixpkgs.lib.genAttrs systems (system: f nixpkgs.legacyPackages.${system});
      rev = self.shortRev or self.dirtyShortRev or "dirty";
    in
    {
      devShells = forEachSystem (pkgs: {
        default =
          let
            bun = pkgs.callPackage ./nix/bun.nix { };

            koda-dev = pkgs.writeShellScriptBin "koda-dev" ''
              set -euo pipefail

              : "''${koda_ROOT:?koda_ROOT is not set. Enter the flake dev shell from the repo root.}"
              export koda_DEV_CWD="$PWD"
              exec ${bun}/bin/bun --cwd "$koda_ROOT/packages/opencode" --conditions=browser ./src/index.ts "$@"
            '';

            koda-install-bin = pkgs.writeShellScriptBin "koda-install" ''
              set -euo pipefail

              CACHE_DIR="$HOME/.cache/koda-nix"
              VERSION="''${1:-latest}"

              # Platform detection
              os=$(uname -s | tr '[:upper:]' '[:lower:]')
              case "$os" in
                darwin) os="darwin" ;;
                linux) os="linux" ;;
                *) echo "Unsupported OS: $os" >&2; exit 1 ;;
              esac

              arch=$(uname -m)
              case "$arch" in
                aarch64) arch="arm64" ;;
                x86_64) arch="x64" ;;
                *) echo "Unsupported architecture: $arch" >&2; exit 1 ;;
              esac

              # Rosetta 2 detection on macOS
              if [ "$os" = "darwin" ] && [ "$arch" = "x64" ]; then
                rosetta_flag=$(sysctl -n sysctl.proc_translated 2>/dev/null || echo 0)
                if [ "$rosetta_flag" = "1" ]; then
                  arch="arm64"
                fi
              fi

              # Musl detection on Linux
              is_musl=""
              if [ "$os" = "linux" ]; then
                if [ -f /etc/alpine-release ] || (command -v ldd >/dev/null 2>&1 && ldd --version 2>&1 | grep -qi musl); then
                  is_musl="-musl"
                fi
              fi

              # AVX2 detection for baseline builds
              needs_baseline=""
              if [ "$arch" = "x64" ]; then
                if [ "$os" = "linux" ] && ! grep -qi avx2 /proc/cpuinfo 2>/dev/null; then
                  needs_baseline="-baseline"
                elif [ "$os" = "darwin" ]; then
                  avx2=$(sysctl -n hw.optional.avx2_0 2>/dev/null || echo 0)
                  if [ "$avx2" != "1" ]; then
                    needs_baseline="-baseline"
                  fi
                fi
              fi

              # Determine archive extension
              if [ "$os" = "linux" ]; then
                ext=".tar.gz"
              else
                ext=".zip"
              fi

              # Build filename and URL
              target="$os-$arch$needs_baseline$is_musl"
              filename="koda-$target$ext"

              if [ "$VERSION" = "latest" ]; then
                url="https://github.com/koda-Org/koda/releases/latest/download/$filename"
                echo "Installing latest version of koda..." >&2
              else
                # Strip leading 'v' if present
                VERSION="''${VERSION#v}"
                url="https://github.com/koda-Org/koda/releases/download/v''${VERSION}/$filename"
                echo "Installing koda version $VERSION..." >&2
              fi

              # Create cache directory
              mkdir -p "$CACHE_DIR"

              # Download to temporary directory
              tmp_dir=$(mktemp -d)
              trap "rm -rf $tmp_dir" EXIT

              echo "Downloading from $url..." >&2
              if ! ${pkgs.curl}/bin/curl -fsSL -o "$tmp_dir/$filename" "$url"; then
                echo "Error: Failed to download koda from $url" >&2
                echo "Please check your internet connection or visit https://github.com/koda-Org/koda/releases" >&2
                exit 1
              fi

              # Extract the archive
              echo "Extracting..." >&2
              if [ "$os" = "linux" ]; then
                ${pkgs.gnutar}/bin/tar -xzf "$tmp_dir/$filename" -C "$tmp_dir"
              else
                ${pkgs.unzip}/bin/unzip -q "$tmp_dir/$filename" -d "$tmp_dir"
              fi

              # Install the binary
              koda_BIN="$CACHE_DIR/koda"
              mv "$tmp_dir/koda" "$koda_BIN"
              chmod +x "$koda_BIN"

              # Get the installed version
              installed_version=$("$koda_BIN" --version 2>/dev/null || echo "unknown")
              echo "Successfully installed koda $installed_version to $koda_BIN" >&2
            '';

            koda-bin = pkgs.writeShellScriptBin "koda" ''
              set -euo pipefail

              CACHE_DIR="$HOME/.cache/koda-nix"
              koda_BIN="$CACHE_DIR/koda"

              if [ ! -f "$koda_BIN" ]; then
                echo "Error: koda is not installed in the cache." >&2
                echo "Please run 'koda-install' first to download and install koda." >&2
                echo "" >&2
                echo "Examples:" >&2
                echo "  koda-install          # Install latest version" >&2
                echo "  koda-install 1.0.180  # Install specific version" >&2
                exit 1
              fi

              # Execute the cached binary with all arguments
              exec "$koda_BIN" "$@"
            '';
          in
          pkgs.mkShell {
            packages =
              with pkgs;
              [
                bun
                nodejs_20
                python3
                pkg-config
                openssl
                git
                gh
                playwright-driver.browsers
                vsce
                unzip
                gnutar
                gzip
                patchelf
                ripgrep
                jetbrains.jdk
                jdk21
                koda-dev
                koda-install-bin
                koda-bin
              ]
              ++ lib.optionals stdenv.isLinux [
                libX11
                libXext
                libXrender
                libXtst
                libXi
                fontconfig
                freetype
              ];
            shellHook = ''
              export koda_ROOT="$PWD"
              export PLAYWRIGHT_BROWSERS_PATH="${pkgs.playwright-driver.browsers}"
              export PLAYWRIGHT_SKIP_VALIDATE_HOST_REQUIREMENTS=true
            ''
            + pkgs.lib.optionalString pkgs.stdenv.isLinux ''
              export LD_LIBRARY_PATH="${
                pkgs.lib.makeLibraryPath [
                  pkgs.libX11
                  pkgs.libXext
                  pkgs.libXrender
                  pkgs.libXtst
                  pkgs.libXi
                  pkgs.fontconfig
                  pkgs.freetype
                ]
              }:$LD_LIBRARY_PATH"
            '';
          };
      });

      overlays = {
        default =
          final: _prev:
          let
            node_modules = final.callPackage ./nix/node_modules.nix {
              inherit rev;
            };
            opencode = final.callPackage ./nix/opencode.nix {
              inherit node_modules;
            };
          in
          {
            inherit opencode;
          };
      };

      packages = forEachSystem (
        pkgs:
        let
          bun = pkgs.callPackage ./nix/bun.nix { };
          node_modules = pkgs.callPackage ./nix/node_modules.nix {
            inherit bun rev;
          };
          koda = pkgs.callPackage ./nix/koda.nix {
            inherit bun node_modules;
          };
        in
        {
          default = koda;
          inherit koda;
          # Updater derivation with fakeHash - build fails and reveals correct hash
          node_modules_updater = node_modules.override {
            hash = pkgs.lib.fakeHash;
          };
        }
      );
    };
}
