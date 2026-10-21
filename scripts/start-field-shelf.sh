#!/usr/bin/env bash
# Start the local shelf if it is down, then open it in the browser.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"
export PATH="${HOME}/.local/bin:/usr/local/bin:/usr/bin:/bin:/snap/bin:${PATH:-}"

if [ -s "${HOME}/.nvm/nvm.sh" ]; then
  # shellcheck disable=SC1091
  . "${HOME}/.nvm/nvm.sh"
  nvm use --silent default >/dev/null 2>&1 || true
fi

URL="http://127.0.0.1:43127"
LOG="${ROOT}/data/dev-server.log"

notify() {
  local message="$1"
  if command -v notify-send >/dev/null 2>&1; then
    notify-send "フィールドシェルフ" "$message" || true
  elif command -v zenity >/dev/null 2>&1; then
    zenity --error --title="フィールドシェルフ" --text="$message" || true
  else
    printf '%s\n' "$message" >&2
  fi
}

if ! curl -fsS --max-time 2 -o /dev/null "$URL"; then
  if ! command -v npm >/dev/null 2>&1; then
    notify "npm が見つかりません。このフォルダで一度 npm install を済ませてから、もう一度アイコンを開いてください。"
    exit 1
  fi
  mkdir -p "${ROOT}/data"
  nohup npm run dev >>"$LOG" 2>&1 &
  ready=0
  for _ in $(seq 1 40); do
    if curl -fsS --max-time 2 -o /dev/null "$URL"; then
      ready=1
      break
    fi
    sleep 1
  done
  if [ "$ready" -ne 1 ]; then
    notify "起動できませんでした。${LOG} を確認してください。"
    exit 1
  fi
fi

browser=""
for candidate in chromium chromium-browser google-chrome google-chrome-stable; do
  if command -v "$candidate" >/dev/null 2>&1; then
    browser="$candidate"
    break
  fi
done
if [ -z "$browser" ]; then
  notify "Chromium が見つかりません。sudo apt install chromium のあと、もう一度アイコンを開いてください。"
  exit 1
fi
nohup "$browser" "$URL" >/dev/null 2>&1 &
