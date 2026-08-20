#!/usr/bin/env bash
# Installs the 1a2n-track-id QML mod into Traktor Pro on macOS.
# Backs up the stock CSI/D2 folder first; run uninstall.sh to restore it.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
MOD_DIR="${SCRIPT_DIR}/D2"
CHECKER="${SCRIPT_DIR}/../scripts/check-qml-mod.mjs"

# Every failure exits through here, so none scrolls past unnoticed. The read
# returns immediately at EOF, so a piped or CI run exits instead of hanging.
fail() {
  local title="$1"
  shift
  {
    echo ""
    echo "================================================================"
    echo " ABORTED: ${title}"
    echo "================================================================"
    echo ""
    for paragraph in "$@"; do
      echo "  ${paragraph}"
    done
    echo ""
  } >&2
  read -r -p "Press Enter to exit" _ || true
  exit 1
}

TRAKTOR_QML=""
if [ -d "/Applications/Native Instruments/Traktor Pro 4/Traktor.app/Contents/Resources/qml/CSI" ]; then
  TRAKTOR_QML="/Applications/Native Instruments/Traktor Pro 4/Traktor.app/Contents/Resources/qml/CSI"
elif [ -d "/Applications/Native Instruments/Traktor Pro 3/Traktor.app/Contents/Resources/qml/CSI" ]; then
  TRAKTOR_QML="/Applications/Native Instruments/Traktor Pro 3/Traktor.app/Contents/Resources/qml/CSI"
fi

if [ -z "${TRAKTOR_QML}" ]; then
  fail "Traktor Pro was not found" \
    "Looked under /Applications/Native Instruments/ for Traktor Pro 4 and" \
    "Traktor Pro 3. Install Traktor to the default location, or edit the" \
    "paths at the top of this script if yours lives elsewhere."
fi

TARGET="${TRAKTOR_QML}/D2"
BACKUP="${TRAKTOR_QML}/D2.stock-backup"

if [ ! -d "${TARGET}" ]; then
  fail "the Traktor D2 QML folder is missing" \
    "Expected it at:" \
    "  ${TARGET}"
fi

if pgrep -xi "Traktor" >/dev/null 2>&1; then
  fail "Traktor is running" \
    "Close Traktor completely, then run this script again." \
    "Traktor reads these files at startup and holds them open."
fi

if [ ! -f "${CHECKER}" ]; then
  fail "the mod validator is missing" \
    "Expected it at:" \
    "  ${CHECKER}" \
    "" \
    "Run this script from a full checkout of the repository, not from a" \
    "copy of the traktor-mod folder on its own."
fi

if ! command -v node >/dev/null 2>&1; then
  fail "Node.js is not installed or not on PATH" \
    "It validates the mod before installing, and it runs the overlay" \
    "server. Install it from https://nodejs.org, then run this again."
fi

# Validate before the copy, not after: Traktor drops a mapping it cannot
# compile without reporting it, so an unchecked install fails silently, and
# copying a broken mod over a working one destroys the only good copy here.
set +e
VERDICT="$(node "${CHECKER}" "${MOD_DIR}" 2>&1)"
CHECKER_EXIT=$?
set -e

[ -n "${VERDICT}" ] && echo "${VERDICT}"

if [ "${CHECKER_EXIT}" -ne 0 ]; then
  fail "the QML mod in this repository will not compile" \
    "Nothing was copied. Traktor was not touched." \
    "" \
    "This is a defect in the repository, not on this machine. Traktor" \
    "drops a mapping it cannot compile without reporting it, so installing" \
    "this would leave the D2 missing from Controller Manager with nothing" \
    "in any log to explain it." \
    "" \
    "Revert or hotfix the change that broke it:" \
    "  git log -1 --oneline -- traktor-mod/D2" \
    "  git revert <that commit>" \
    "or fix the file named above, then run this script again."
fi

# A validator that produced no verdict has told us nothing. Treat that as a
# failure: a silent pass here is what let a broken mod install once already.
if [ -z "${VERDICT}" ]; then
  fail "the mod validator produced no output" \
    "It should print a line naming how many files it checked. Exiting" \
    "without one means it did not run, so the mod is unverified and this" \
    "script will not install it." \
    "" \
    "Check that node runs the validator directly:" \
    "  node \"${CHECKER}\" \"${MOD_DIR}\""
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
    fail "the install did not complete" \
      "${relative} never reached ${TARGET}." \
      "" \
      "Traktor is in a half-installed state. Restore it with:" \
      "  ./traktor-mod/uninstall.sh"
  fi
  if ! cmp -s "${source_file}" "${copied}"; then
    fail "the install is corrupt" \
      "${relative} does not match the source it was copied from." \
      "" \
      "Traktor is in a half-installed state. Restore it with:" \
      "  ./traktor-mod/uninstall.sh"
  fi
done < <(find "${MOD_DIR}" -type f)

echo "Mod installed into ${TARGET}"
echo ""
echo "Next steps:"
echo "  1. Start Traktor Pro."
echo "  2. If you do not own a Kontrol D2: Preferences > Controller Manager > Add... > Traktor > Kontrol D2."
echo "  3. Start the overlay server (./start-overlay.sh) and load a track."
