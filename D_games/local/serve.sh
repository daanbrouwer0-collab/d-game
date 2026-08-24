#!/usr/bin/env bash
# Alleen voor lokale ontwikkeling — niet onderdeel van de publieke site.
# Start een HTTP-server vanuit de projectroot (één map omhoog).
# Open daarna: http://localhost:8080/multi.html
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"
PORT="${1:-8080}"

echo "D5 Games — lokale dev-server"
echo "Project: ${ROOT}"
echo "Open:    http://localhost:${PORT}/multi.html"
echo "Stoppen: Ctrl+C"
echo

if command -v python3 >/dev/null 2>&1; then
  exec python3 -m http.server "$PORT"
fi

if command -v python >/dev/null 2>&1; then
  exec python -m http.server "$PORT"
fi

if command -v npx >/dev/null 2>&1; then
  exec npx --yes serve -l "$PORT" .
fi

echo "Geen python3/npx gevonden. Installeer python3 of Node.js." >&2
exit 1
