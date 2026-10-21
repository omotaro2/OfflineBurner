#!/usr/bin/env bash
# Start one local shelf, then show its Chromium window.
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
LOCK="${ROOT}/data/field-shelf.lock"
PROFILE="${XDG_CONFIG_HOME:-${HOME}/.config}/field-shelf/chromium"
CLASS="field-shelf"

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

server_up() {
  curl -fsS --max-time 2 -o /dev/null "$URL"
}

port_open() {
  if ! command -v ss >/dev/null 2>&1; then
    return 1
  fi
  ss -ltn | awk '{print $4}' | grep -Eq '[:.]43127$'
}

browser_running() {
  if ! command -v pgrep >/dev/null 2>&1; then
    return 1
  fi
  pgrep -f -- "--class=${CLASS}" >/dev/null 2>&1
}

focus_browser() {
  if command -v wmctrl >/dev/null 2>&1 && wmctrl -x -a "$CLASS"; then
    return 0
  fi
  if command -v xdotool >/dev/null 2>&1; then
    local window
    window="$(xdotool search --class "$CLASS" 2>/dev/null | head -n 1 || true)"
    if [ -n "$window" ]; then
      xdotool windowactivate "$window" >/dev/null 2>&1 || true
      return 0
    fi
  fi
  return 1
}

wait_for_server() {
  local _attempt
  for _attempt in $(seq 1 40); do
    if server_up; then
      return 0
    fi
    sleep 1
  done
  return 1
}

ensure_server() {
  if server_up; then
    return 0
  fi
  if port_open; then
    wait_for_server
    return
  fi
  if ! command -v npm >/dev/null 2>&1; then
    notify "npm が見つかりません。このフォルダで一度 npm install を済ませてから、もう一度アイコンを開いてください。"
    exit 1
  fi
  mkdir -p "${ROOT}/data"
  nohup npm run dev >>"$LOG" 2>&1 9>&- &
  if ! wait_for_server; then
    notify "起動できませんでした。${LOG} を確認してください。"
    exit 1
  fi
}

open_browser() {
  if browser_running; then
    focus_browser || true
    return 0
  fi
  local browser=""
  local candidate
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
  mkdir -p "$PROFILE"
  nohup "$browser" \
    --class="$CLASS" \
    --user-data-dir="$PROFILE" \
    --no-first-run \
    --no-default-browser-check \
    "$URL" >/dev/null 2>&1 9>&- &
  local _attempt
  for _attempt in $(seq 1 25); do
    if browser_running; then
      return 0
    fi
    sleep 0.2
  done
}

mkdir -p "${ROOT}/data"
exec 9>"$LOCK"
if ! flock -w 70 9; then
  notify "起動中です。少し待ってから、もう一度アイコンを開いてください。"
  exit 1
fi

ensure_server
open_browser
