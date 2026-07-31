#!/usr/bin/env bash
# Restores the stock Traktor Pro CSI/D2 folder from the backup created by install.sh.
set -euo pipefail

TRAKTOR_QML=""
if [ -d "/Applications/Native Instruments/Traktor Pro 4/Traktor.app/Contents/Resources/qml/CSI" ]; then
  TRAKTOR_QML="/Applications/Native Instruments/Traktor Pro 4/Traktor.app/Contents/Resources/qml/CSI"
elif [ -d "/Applications/Native Instruments/Traktor Pro 3/Traktor.app/Contents/Resources/qml/CSI" ]; then
  TRAKTOR_QML="/Applications/Native Instruments/Traktor Pro 3/Traktor.app/Contents/Resources/qml/CSI"
fi

if [ -z "${TRAKTOR_QML}" ]; then
  echo "Error: Traktor Pro QML folder not found in /Applications/Native Instruments/" >&2
  exit 1
fi

TARGET="${TRAKTOR_QML}/D2"
BACKUP="${TRAKTOR_QML}/D2.stock-backup"

if [ ! -d "${BACKUP}" ]; then
  echo "Error: No backup found at ${BACKUP} - nothing to restore." >&2
  exit 1
fi

if pgrep -xi "Traktor" >/dev/null 2>&1; then
  echo "Error: Traktor is running. Close it before uninstalling the mod." >&2
  exit 1
fi

SUDO=""
if [ ! -w "${TRAKTOR_QML}" ]; then
  echo "Elevated permissions required to modify ${TRAKTOR_QML}."
  SUDO="sudo"
fi

${SUDO} rm -rf "${TARGET}"
${SUDO} cp -R "${BACKUP}" "${TARGET}"
${SUDO} rm -rf "${BACKUP}"
echo "Stock D2 folder restored at ${TARGET}"
