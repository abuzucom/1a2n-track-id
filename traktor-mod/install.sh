#!/usr/bin/env bash
# Installs the 1a2n-track-id QML mod into Traktor Pro on macOS.
# Backs up the stock CSI/D2 folder first; run uninstall.sh to restore it.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
MOD_DIR="${SCRIPT_DIR}/D2"

TRAKTOR_QML=""
if [ -d "/Applications/Native Instruments/Traktor Pro 4/Traktor.app/Contents/Resources/qml/CSI" ]; then
  TRAKTOR_QML="/Applications/Native Instruments/Traktor Pro 4/Traktor.app/Contents/Resources/qml/CSI"
elif [ -d "/Applications/Native Instruments/Traktor Pro 3/Traktor.app/Contents/Resources/qml/CSI" ]; then
  TRAKTOR_QML="/Applications/Native Instruments/Traktor Pro 3/Traktor.app/Contents/Resources/qml/CSI"
fi

if [ -z "${TRAKTOR_QML}" ]; then
  echo "Error: Traktor Pro QML folder not found in /Applications/Native Instruments/" >&2
  echo "Is Traktor Pro 4 or Traktor Pro 3 installed?" >&2
  exit 1
fi

TARGET="${TRAKTOR_QML}/D2"
BACKUP="${TRAKTOR_QML}/D2.stock-backup"

if [ ! -d "${TARGET}" ]; then
  echo "Error: Traktor D2 QML folder not found at ${TARGET}" >&2
  exit 1
fi

if pgrep -xi "Traktor" >/dev/null 2>&1; then
  echo "Error: Traktor is running. Close it before installing the mod." >&2
  exit 1
fi

# Validate before the copy, not after: a mod file Traktor cannot parse leaves
# the D2 device missing from Controller Manager, and copying it over a working
# install destroys the only good copy on the machine.
CHECKER="${SCRIPT_DIR}/../scripts/check-qml-mod.mjs"
if [ ! -f "${CHECKER}" ]; then
  echo "Error: validator not found at ${CHECKER}." >&2
  echo "Run this script from a full checkout of the repository." >&2
  exit 1
fi

if ! command -v node >/dev/null 2>&1; then
  echo "Error: Node.js is not installed or not on PATH. It is needed to validate" >&2
  echo "the mod, and to run the overlay server. Install it from https://nodejs.org" >&2
  echo "and run this again." >&2
  exit 1
fi

if ! node "${CHECKER}" "${MOD_DIR}"; then
  echo "Error: the QML mod failed validation, so nothing was installed." >&2
  exit 1
fi

SUDO=""
if [ ! -w "${TRAKTOR_QML}" ]; then
  echo "Elevated permissions required to modify ${TRAKTOR_QML}."
  SUDO="sudo"
fi

if [ ! -d "${BACKUP}" ]; then
  ${SUDO} cp -R "${TARGET}" "${BACKUP}"
  echo "Backed up stock D2 folder to ${BACKUP}"
else
  echo "Backup already exists at ${BACKUP} (keeping the original stock backup)"
fi

${SUDO} cp -R "${MOD_DIR}/"* "${TARGET}/"

# Confirm every mod file arrived intact. Compares only the files this repo
# owns, so the stock NI files sharing this folder are never touched.
while IFS= read -r source_file; do
  relative="${source_file#"${MOD_DIR}/"}"
  copied="${TARGET}/${relative}"
  if [ ! -f "${copied}" ]; then
    echo "Error: install incomplete, ${relative} did not reach ${TARGET}." >&2
    echo "Restore with ./uninstall.sh and try again." >&2
    exit 1
  fi
  if ! cmp -s "${source_file}" "${copied}"; then
    echo "Error: install corrupt, ${relative} does not match the source." >&2
    echo "Restore with ./uninstall.sh and try again." >&2
    exit 1
  fi
done < <(find "${MOD_DIR}" -type f)

echo "Mod installed into ${TARGET}"
echo ""
echo "Next steps:"
echo "  1. Start Traktor Pro."
echo "  2. If you do not own a Kontrol D2: Preferences > Controller Manager > Add... > Traktor > Kontrol D2."
echo "  3. Start the overlay server (./start-overlay.sh) and load a track."
