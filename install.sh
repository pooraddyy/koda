#!/usr/bin/env bash
set -Eeuo pipefail

# Koda installer: a source-first installer that works for branches, tags, and commits.
# The repository can be private when KODA_GITHUB_TOKEN is provided.

readonly DEFAULT_REPOSITORY="pooraddyy/koda"
readonly DEFAULT_INSTALL_ROOT="${KODA_HOME:-$HOME/.koda}"
readonly DEFAULT_BIN_DIRECTORY="${KODA_BIN_DIR:-$HOME/.local/bin}"
readonly RESET="\033[0m"
readonly CYAN="\033[36m"
readonly YELLOW="\033[33m"
readonly RED="\033[31m"
# Keep the rendered frame below a standard 80-column terminal width. The previous
# 58-cell bar wrapped on narrow terminals, making carriage-return updates appear as
# multiple lines instead of one in-place animation.
readonly PROGRESS_WIDTH=32

repository="${KODA_REPO:-$DEFAULT_REPOSITORY}"
ref="${KODA_REF:-main}"
version=""
install_root="$DEFAULT_INSTALL_ROOT"
bin_directory="$DEFAULT_BIN_DIRECTORY"
no_path_change=false
binary_path=""
uninstall=false
path_config=""
path_updated=false
KODA_PROGRESS_PID=""

say() { printf '%b\n' "$*"; }
info() { say "${CYAN}$*${RESET}"; }
warn() { say "${YELLOW}Warning:${RESET} $*" >&2; }
fail() { say "${RED}Error:${RESET} $*" >&2; exit 1; }

progress_live() {
  [[ -t 2 && "${KODA_INSTALL_PLAIN:-0}" != 1 ]]
}

progress_bar_width() {
  local columns="${COLUMNS:-}"
  if [[ ! "$columns" =~ ^[0-9]+$ ]]; then
    columns="$(tput cols 2>/dev/null || true)"
  fi
  [[ "$columns" =~ ^[0-9]+$ ]] || columns=80

  local width="$PROGRESS_WIDTH"
  local available=$((columns - 45))
  # A very narrow terminal should use a short bar, not wrap the whole frame.
  ((available < 4)) && available=4
  ((width > available)) && width="$available"
  printf '%d' "$width"
}

progress_line() {
  local label="$1"
  local percent="$2"
  local width
  width="$(progress_bar_width)"
  local filled=$((percent * width / 100))
  local empty=$((width - filled))
  local bar=""
  local rest=""
  printf -v bar '%*s' "$filled" ''
  printf -v rest '%*s' "$empty" ''
  bar=${bar// /■}
  rest=${rest// /·}
  progress_live || return 0
  printf '\r\033[2K%b%-34s%b %b%s%s%b %3d%%' \
    "$CYAN" "$label" "$RESET" "$CYAN" "$bar" "$rest" "$RESET" "$percent" >&2
}

progress_complete() {
  local label="Koda installation complete"
  local percent=100
  local width
  local bar
  width="$(progress_bar_width)"
  printf -v bar '%*s' "$width" ''
  bar=${bar// /■}
  if progress_live; then
    progress_line "$label" "$percent"
    printf '\n' >&2
  else
    printf '%b%-34s%b %b%s%b %3d%%\n' \
      "$CYAN" "$label" "$RESET" "$CYAN" "$bar" "$RESET" "$percent" >&2
  fi
}

progress_run() {
  local label="$1"
  local start="$2"
  local end="$3"
  shift 3
  local log_file="${KODA_TEMP_DIR:-${TMPDIR:-/tmp}}/koda-progress.$$.log"
  local percent="$start"
  local status
  "$@" >"$log_file" 2>&1 &
  KODA_PROGRESS_PID=$!
  progress_line "$label" "$percent"
  if progress_live; then
    while kill -0 "$KODA_PROGRESS_PID" 2>/dev/null; do
      sleep 0.12
      percent=$((percent + 5))
      if ((percent > end)); then percent="$end"; fi
      progress_line "$label" "$percent"
    done
  fi
  if wait "$KODA_PROGRESS_PID"; then
    status=0
  else
    status=$?
  fi
  KODA_PROGRESS_PID=""
  if ((status != 0)); then
    if progress_live; then printf '\n' >&2; fi
    cat "$log_file" >&2 || true
    rm -f -- "$log_file"
    return "$status"
  fi
  progress_line "$label" "$end"
  rm -f -- "$log_file"
}

print_banner() {
  printf '%b\n' "${CYAN}  ██ ▄█▀ ▒█████  ▓█████▄  ▄▄▄      ${RESET}"
  printf '%b\n' "${CYAN}  ██▄█▒ ▒██▒  ██▒▒██▀ ██▌▒████▄    ${RESET}"
  printf '%b\n' "${CYAN} ▓███▄░ ▒██░  ██▒░██   █▌▒██  ▀█▄  ${RESET}"
  printf '%b\n' "${CYAN} ▓██ █▄ ▒██   ██░░▓█▄   ▌░██▄▄▄▄██ ${RESET}"
  printf '%b\n' "${CYAN} ▒██▒ █▄░ ████▓▒░░▒████▓  ▓█   ▓██▒${RESET}"
  printf '%b\n' "${CYAN} ▒ ▒▒ ▓▒░ ▒░▒░▒░  ▒▒▓  ▒  ▒▒   ▓▒█░${RESET}"
  printf '%b\n' "${CYAN} ░ ░▒ ▒░  ░ ▒ ▒░  ░ ▒  ▒   ▒   ▒▒ ░${RESET}"
  printf '%b\n' "${CYAN} ░ ░░ ░ ░ ░ ░ ▒   ░ ░  ░   ░   ▒   ${RESET}"
  printf '%b\n' "${CYAN} ░  ░       ░ ░     ░          ░  ░${RESET}"
  printf '%b\n' "${CYAN}                   ░                ${RESET}"
}

usage() {
  cat <<'HELP'
Koda installer

Install the Koda CLI and TUI from a GitHub branch, tag, or commit.

Usage:
  ./install.sh [options]

Options:
  -h, --help                 Show this help text.
  -v, --version VERSION      Install a version tag (vVERSION is accepted).
  -r, --ref REF              Install a branch, tag, or commit (default: main).
      --repo OWNER/REPO      Use a different GitHub repository.
      --dir PATH              Store the Koda source under PATH.
      --bin-dir PATH          Install the koda launcher into PATH.
  -b, --binary PATH           Install a local executable instead of source code.
      --no-modify-path       Do not update shell startup files.
      KODA_INSTALL_PLAIN=1    Disable animation and use plain progress lines.
      --uninstall             Remove the Koda source and launcher.

Examples:
  ./install.sh
  ./install.sh --version 7.4.23
  ./install.sh --ref main --no-modify-path
  ./install.sh --binary ./koda-linux-x64
  ./install.sh --uninstall

Remote one-line usage for a private GitHub repository:
  export KODA_GITHUB_TOKEN=...
  curl -fsSL \
    -H 'Accept: application/vnd.github.raw+json' \
    -H "Authorization: Bearer $KODA_GITHUB_TOKEN" \
    'https://api.github.com/repos/pooraddyy/koda/contents/install.sh?ref=main' | bash
HELP
}

while (($#)); do
  case "$1" in
    -h|--help)
      usage
      exit 0
      ;;
    -v|--version)
      (($# >= 2)) || fail "--version needs a value."
      version="${2#v}"
      ref="v$version"
      shift 2
      ;;
    -r|--ref)
      (($# >= 2)) || fail "--ref needs a value."
      ref="$2"
      shift 2
      ;;
    --repo)
      (($# >= 2)) || fail "--repo needs an OWNER/REPO value."
      repository="$2"
      shift 2
      ;;
    --dir)
      (($# >= 2)) || fail "--dir needs a path."
      install_root="$2"
      shift 2
      ;;
    --bin-dir)
      (($# >= 2)) || fail "--bin-dir needs a path."
      bin_directory="$2"
      shift 2
      ;;
    -b|--binary)
      (($# >= 2)) || fail "--binary needs a file path."
      binary_path="$2"
      shift 2
      ;;
    --no-modify-path)
      no_path_change=true
      shift
      ;;
    --uninstall)
      uninstall=true
      shift
      ;;
    *)
      fail "Unknown option: $1 (use --help for usage)."
      ;;
  esac
done

if [[ "$uninstall" == true ]]; then
  rm -rf -- "$install_root"
  rm -f -- "$bin_directory/koda"
  info "Koda has been removed from $install_root and $bin_directory/koda."
  exit 0
fi

command -v curl >/dev/null 2>&1 || fail "curl is required."
command -v tar >/dev/null 2>&1 || fail "tar is required."

KODA_TEMP_DIR=""
cleanup_temp() {
  if [[ -n "${KODA_PROGRESS_PID:-}" ]]; then
    kill "$KODA_PROGRESS_PID" 2>/dev/null || true
    KODA_PROGRESS_PID=""
  fi
  if [[ -n "${KODA_TEMP_DIR:-}" ]]; then
    rm -rf -- "$KODA_TEMP_DIR"
    KODA_TEMP_DIR=""
  fi
}
trap cleanup_temp EXIT

ensure_bun() {
  if command -v bun >/dev/null 2>&1; then
    command -v bun
    return 0
  fi

  [[ "${KODA_SKIP_BUN_BOOTSTRAP:-0}" != 1 ]] || fail "Bun is missing. Install Bun or unset KODA_SKIP_BUN_BOOTSTRAP."
  info "Bun was not found; installing Bun into ~/.bun." >&2
  curl -fsSL https://bun.sh/install | bash >&2
  export BUN_INSTALL="${BUN_INSTALL:-$HOME/.bun}"
  export PATH="$BUN_INSTALL/bin:$PATH"
  command -v bun >/dev/null 2>&1 || fail "Bun installation finished, but bun is not on PATH."
  command -v bun
}

install_launcher() {
  local bun_path="$1"
  mkdir -p "$bin_directory"
  cat > "$bin_directory/koda" <<EOF
#!/usr/bin/env bash
set -Eeuo pipefail
export koda_CLIENT=cli
exec "$bun_path" run --cwd "$install_root/source/packages/opencode" --conditions=node src/index.ts "\$@"
EOF
  chmod 755 "$bin_directory/koda"
}

install_binary() {
  [[ -f "$binary_path" ]] || fail "Binary not found: $binary_path"
  mkdir -p "$bin_directory"
  install -m 755 "$binary_path" "$bin_directory/koda"
  info "Installed local binary at $bin_directory/koda."
}

install_source() {
  local bun_path="$1"
  local temp_dir archive extracted staged backup archive_url
  temp_dir="$(mktemp -d "${TMPDIR:-/tmp}/koda-install.XXXXXX")"
  KODA_TEMP_DIR="$temp_dir"
  archive="$temp_dir/koda-source.tar.gz"
  extracted="$temp_dir/extracted"
  staged="$temp_dir/source"
  archive_url="https://codeload.github.com/${repository}/tar.gz/${ref}"

  info "Installing Koda version: ${version:-$ref}"
  local -a curl_args=(-fsSL --retry 3 --retry-delay 1 --connect-timeout 15)
  if [[ -n "${KODA_GITHUB_TOKEN:-}" ]]; then
    curl_args+=(--header "Authorization: Bearer ${KODA_GITHUB_TOKEN}")
  fi
  progress_run "Setting up Koda" 0 45 curl "${curl_args[@]}" -o "$archive" "$archive_url" || fail "Could not download $archive_url. Private repositories need KODA_GITHUB_TOKEN."

  mkdir -p "$extracted"
  progress_run "Setting up Koda" 45 55 tar -xzf "$archive" -C "$extracted" || fail "Could not extract the Koda source archive."
  local source_root
  source_root="$(find "$extracted" -mindepth 1 -maxdepth 1 -type d -print -quit)"
  [[ -n "$source_root" && -f "$source_root/bun.lock" && -d "$source_root/packages/opencode" ]] || fail "Downloaded source does not look like a Koda checkout."

  mv "$source_root" "$staged"
  progress_run "Setting up Koda" 55 95 bash -c 'cd "$1" && HUSKY=0 "$2" install --frozen-lockfile' bash "$staged" "$bun_path" || fail "Dependency installation failed."

  mkdir -p "$install_root"
  backup="$install_root/source.previous.$$"
  if [[ -e "$install_root/source" ]]; then
    mv "$install_root/source" "$backup"
  fi
  mv "$staged" "$install_root/source"
  rm -rf -- "$backup"
  install_launcher "$bun_path"
  cleanup_temp
  info "Installed Koda source at $install_root/source."
}

if [[ -n "$binary_path" ]]; then
  install_binary
else
  bun_path="$(ensure_bun)"
  bun_directory="$(dirname -- "$bun_path")"
  if [[ ":$PATH:" != *":$bun_directory:"* ]]; then
    export PATH="$bun_directory:$PATH"
  fi
  install_source "$bun_path"
fi

add_path_hint() {
  [[ "$no_path_change" == true ]] && return 0
  case "${SHELL##*/}" in
    fish)
      path_config="${XDG_CONFIG_HOME:-$HOME/.config}/fish/config.fish"
      mkdir -p "$(dirname "$path_config")"
      if ! grep -Fqx "fish_add_path $bin_directory" "$path_config" 2>/dev/null; then
        printf '\n# Koda CLI\nfish_add_path %s\n' "$bin_directory" >> "$path_config"
        path_updated=true
      fi
      ;;
    zsh)
      path_config="${ZDOTDIR:-$HOME}/.zshrc"
      touch "$path_config"
      if ! grep -Fq "$bin_directory" "$path_config"; then
        printf '\n# Koda CLI\nexport PATH="%s:$PATH"\n' "$bin_directory" >> "$path_config"
        path_updated=true
      fi
      ;;
    *)
      path_config="$HOME/.bashrc"
      touch "$path_config"
      if ! grep -Fq "$bin_directory" "$path_config"; then
        printf '\n# Koda CLI\nexport PATH="%s:$PATH"\n' "$bin_directory" >> "$path_config"
        path_updated=true
      fi
      ;;
  esac
}
add_path_hint
progress_complete

if [[ ":$PATH:" != *":$bin_directory:"* ]]; then
  warn "$bin_directory is not in the current shell PATH. Run: export PATH=\"$bin_directory:\$PATH\""
fi
say ""
if [[ "$no_path_change" == true ]]; then
  info "PATH update skipped (--no-modify-path)."
elif [[ "$path_updated" == true ]]; then
  info "Successfully added $bin_directory to \$PATH in $path_config"
else
  info "$bin_directory is already available in $path_config"
fi
say ""
print_banner
say ""
info "Koda is ready. Start it with: koda"
say ""
say "To get started, run:"
say ""
if [[ "$no_path_change" == true ]]; then
  say "export PATH=\"$bin_directory:\$PATH\""
else
  say "source $path_config  # or open a new terminal"
fi
say "cd <project>"
say "koda"
say ""
say "For more information visit https://github.com/pooraddyy/koda"
