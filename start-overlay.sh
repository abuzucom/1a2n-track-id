#!/usr/bin/env bash
# Starts the overlay server and opens the overlay in the default browser.
# Closing this script (Ctrl+C or terminating the process) stops the server.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "${SCRIPT_DIR}"

if ! command -v node >/dev/null 2>&1; then
  echo "Node.js is not installed or not on PATH." >&2
  echo "Install it from https://nodejs.org and run this again." >&2
  exit 1
fi

if [ ! -d "node_modules" ]; then
  echo "First run: installing dependencies..."
  npm install
fi

echo "Building the overlay server..."
npm run build

node dist/main.js &
SERVER_PID=$!

cleanup() {
  if [ -n "${SERVER_PID:-}" ] && kill -0 "${SERVER_PID}" 2>/dev/null; then
    kill "${SERVER_PID}" 2>/dev/null || true
  fi
}
trap cleanup EXIT INT TERM HUP

if command -v open >/dev/null 2>&1; then
  open "http://127.0.0.1:8080/overlay"
elif command -v xdg-open >/dev/null 2>&1; then
  xdg-open "http://127.0.0.1:8080/overlay"
fi

echo ""
echo "Overlay server running. Closing this window or pressing Ctrl+C stops it."
echo ""

wait "${SERVER_PID}"
