#!/usr/bin/env sh
# One-time setup for Linux/macOS:
#   1. downloads the pinned PocketBase build for this OS/CPU and verifies its checksum
#   2. creates pb_public/config.js from the example if it doesn't exist
# Safe to re-run. Usage: ./setup.sh [--force]   (--force re-downloads PocketBase)
set -eu
cd "$(dirname "$0")"

PB_VERSION="0.39.4"
FORCE=0
[ "${1:-}" = "--force" ] && FORCE=1

die() { echo "Error: $*" >&2; exit 1; }
have() { command -v "$1" >/dev/null 2>&1; }

# --- Detect platform (PB_OS / PB_ARCH env vars override detection) ---
case "${PB_OS:-$(uname -s)}" in
  Linux|linux)   os=linux ;;
  Darwin|darwin) os=darwin ;;
  *) die "unsupported OS '$(uname -s)'. On Windows, run setup.ps1 instead." ;;
esac
case "${PB_ARCH:-$(uname -m)}" in
  x86_64|amd64)  arch=amd64 ;;
  aarch64|arm64) arch=arm64 ;;
  armv7l|armv7)  arch=armv7 ;;
  ppc64le)       arch=ppc64le ;;
  s390x)         arch=s390x ;;
  *) die "unsupported CPU architecture '$(uname -m)'." ;;
esac

# --- PocketBase ---
if [ -x ./pocketbase ] && [ "$FORCE" -eq 0 ]; then
  current="$(./pocketbase --version 2>/dev/null || true)"
  case "$current" in
    *"$PB_VERSION"*) echo "PocketBase $PB_VERSION already installed." ;;
    *) echo "Found existing pocketbase ($current); leaving it alone. Run ./setup.sh --force to replace it with $PB_VERSION." ;;
  esac
else
  have unzip || die "'unzip' is required (RHEL/Fedora: sudo dnf install unzip | Debian/Ubuntu: sudo apt install unzip)."
  if have curl; then fetch() { curl -fsSL -o "$2" "$1"; }
  elif have wget; then fetch() { wget -q -O "$2" "$1"; }
  else die "'curl' or 'wget' is required."; fi
  if have sha256sum; then sha() { sha256sum "$1" | cut -d' ' -f1; }
  elif have shasum; then sha() { shasum -a 256 "$1" | cut -d' ' -f1; }
  else die "'sha256sum' or 'shasum' is required."; fi

  zip="pocketbase_${PB_VERSION}_${os}_${arch}.zip"
  base="https://github.com/pocketbase/pocketbase/releases/download/v${PB_VERSION}"
  tmp="$(mktemp -d)"
  trap 'rm -rf "$tmp"' EXIT

  echo "Downloading $zip..."
  fetch "$base/$zip" "$tmp/$zip"
  fetch "$base/checksums.txt" "$tmp/checksums.txt"

  expected="$(grep " ${zip}\$" "$tmp/checksums.txt" | cut -d' ' -f1)"
  [ -n "$expected" ] || die "no checksum listed for $zip."
  actual="$(sha "$tmp/$zip")"
  [ "$expected" = "$actual" ] || die "checksum mismatch for $zip (expected $expected, got $actual)."
  echo "Checksum OK."

  unzip -o -q "$tmp/$zip" pocketbase -d "$tmp"
  mv -f "$tmp/pocketbase" ./pocketbase
  chmod +x ./pocketbase
  echo "Installed PocketBase $PB_VERSION ($os/$arch)."
fi

# --- Config ---
if [ -f pb_public/config.js ]; then
  echo "pb_public/config.js already exists; leaving it alone."
else
  cp pb_public/config.example.js pb_public/config.js
  echo "Created pb_public/config.js. Edit it to set your users' names."
fi

chmod +x launch.sh 2>/dev/null || true
echo
echo "Done. Next steps:"
echo "  1. (optional) create a dashboard admin: ./pocketbase superuser upsert you@example.com <password>"
echo "  2. start the app: ./launch.sh   (or ./pocketbase serve, then open http://127.0.0.1:8090)"
