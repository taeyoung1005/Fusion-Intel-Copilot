#!/usr/bin/env bash
set -Eeuo pipefail

log() {
  printf '[falconsim-install] %s\n' "$*"
}

fail() {
  printf '[falconsim-install] ERROR: %s\n' "$*" >&2
  exit 1
}

TARGET_ROOT="${FALCON_INSTALL_ROOT:-$HOME/duality}"
WORK_DIR="${FALCON_INSTALL_WORK:-$HOME/.cache/falconsim-install}"
mkdir -p "$TARGET_ROOT" "$WORK_DIR"

input="${1:-}"

find_candidate() {
  find "$HOME/Downloads" "$HOME/다운로드" "$HOME" -maxdepth 3 -type f \
    \( -iname '*FalconSim*.deb' -o -iname '*DuSim*.deb' -o -iname '*FalconSim*.zip' -o -iname '*DuSim*.zip' -o -iname '*FalconSim*.tar*' -o -iname '*DuSim*.tar*' -o -iname '*Simulator*Falcon*.deb' -o -iname '*Runtime*Falcon*.deb' \) \
    2>/dev/null | sort | head -1
}

if [[ -z "$input" ]]; then
  input="$(find_candidate || true)"
fi

if [[ -z "$input" ]]; then
  log "No FalconSim/DuSim installer found. Searched: ~/Downloads, ~/다운로드, and ~."
  log "Put one of these files on the server, then rerun this script:"
  log "  FalconSim*.deb, DuSim*.deb, FalconSim*.zip, DuSim*.zip, FalconSim*.tar.gz"
  log "Or pass an authenticated direct URL: ~/install-falconsim.sh 'https://...'"
  exit 2
fi

if [[ "$input" =~ ^https?:// ]]; then
  out="$WORK_DIR/${input##*/}"
  [[ "$out" == "$WORK_DIR/" ]] && out="$WORK_DIR/falconsim-installer"
  log "Downloading installer URL to $out"
  if command -v curl >/dev/null 2>&1; then
    curl -fL --retry 3 --continue-at - "$input" -o "$out"
  elif command -v wget >/dev/null 2>&1; then
    wget -c "$input" -O "$out"
  else
    fail "curl/wget not installed"
  fi
  input="$out"
fi

[[ -f "$input" ]] || fail "Installer path does not exist: $input"
log "Using installer: $input"
file "$input" || true

name="$(basename "$input")"
lower="${name,,}"

if [[ "$lower" == *.deb ]]; then
  inspect="$WORK_DIR/deb-inspect"
  rm -rf "$inspect"
  mkdir -p "$inspect"
  (cd "$inspect" && ar x "$input" && tar -xf control.tar.*)
  log "Package control metadata:"
  sed -n '1,80p' "$inspect/control" || true
  if grep -qiE 'falconeditor' "$inspect/control"; then
    fail "This is FalconEditor, not FalconSim/DuSim. Need the runtime package."
  fi
  if ! grep -qiE 'falconsim|dusim|simulator|runtime' "$inspect/control" "$inspect/postinst" 2>/dev/null; then
    fail "Debian package does not identify as FalconSim/DuSim runtime. Refusing to install unknown package."
  fi
  log "Debian package appears to be FalconSim/DuSim."
  if command -v sudo >/dev/null 2>&1 && sudo -n true 2>/dev/null; then
    sudo apt install -y "$input"
  else
    fail "sudo requires interactive password. Verified installer, but cannot perform privileged install non-interactively."
  fi
elif [[ "$lower" == *.zip ]]; then
  install_dir="$TARGET_ROOT/${name%.zip}"
  rm -rf "$install_dir"
  mkdir -p "$install_dir"
  log "Extracting zip to $install_dir"
  if command -v 7z >/dev/null 2>&1; then
    7z x -bsp1 -mmt -aoa "$input" -o"$install_dir"
  else
    unzip -q "$input" -d "$install_dir"
  fi
elif [[ "$lower" == *.tar.gz || "$lower" == *.tgz || "$lower" == *.tar.xz || "$lower" == *.tar ]]; then
  base="$name"
  base="${base%.tar.gz}"
  base="${base%.tgz}"
  base="${base%.tar.xz}"
  base="${base%.tar}"
  install_dir="$TARGET_ROOT/$base"
  rm -rf "$install_dir"
  mkdir -p "$install_dir"
  log "Extracting archive to $install_dir"
  tar -xf "$input" -C "$install_dir" --strip-components=1 || tar -xf "$input" -C "$install_dir"
else
  fail "Unsupported installer type: $input"
fi

log "Searching for FalconSim runtime after install/extract"
mapfile -t runtimes < <(find "$TARGET_ROOT" -maxdepth 6 -type f \( -iname 'DuSim.sh' -o -iname 'DuSim-Linux*' -o -iname 'DuSim' \) 2>/dev/null | sort)
if (( ${#runtimes[@]} == 0 )); then
  fail "Install/extract completed but no DuSim runtime was found under $TARGET_ROOT"
fi

printf '%s\n' "${runtimes[@]}"
latest="${runtimes[0]}"
chmod +x "$latest" 2>/dev/null || true
ln -sfn "$(dirname "$latest")" "$TARGET_ROOT/falconsim-runtime"
log "FalconSim runtime found: $latest"
log "Symlinked runtime dir: $TARGET_ROOT/falconsim-runtime"
