#!/usr/bin/env bash
# Put a desktop launcher on this machine. Run once with: npm run shortcut
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
START="${ROOT}/scripts/start-field-shelf.sh"
ICON="${ROOT}/public/icon.png"
chmod +x "$START"

if [ ! -f "$ICON" ]; then
  printf '%s\n' "アイコンが見つかりません: ${ICON}" >&2
  exit 1
fi

DESKTOP_DIR="$(xdg-user-dir DESKTOP 2>/dev/null || true)"
if [ -z "$DESKTOP_DIR" ] || [ ! -d "$DESKTOP_DIR" ]; then
  if [ -d "${HOME}/デスクトップ" ]; then
    DESKTOP_DIR="${HOME}/デスクトップ"
  elif [ -d "${HOME}/Desktop" ]; then
    DESKTOP_DIR="${HOME}/Desktop"
  else
    DESKTOP_DIR=""
  fi
fi

APP_DIR="${XDG_DATA_HOME:-${HOME}/.local/share}/applications"
mkdir -p "$APP_DIR"

write_desktop() {
  local dest="$1"
  cat >"$dest" <<EOF
[Desktop Entry]
Version=1.0
Type=Application
Name=フィールドシェルフ
GenericName=ファームウェア棚
Comment=Cardputer Adv の安定版とプロジェクトを開く
Exec=${START}
Icon=${ICON}
Terminal=false
Categories=Utility;
StartupNotify=true
EOF
  chmod +x "$dest"
  if command -v gio >/dev/null 2>&1; then
    gio set "$dest" metadata::trusted true >/dev/null 2>&1 || true
  fi
}

write_desktop "${APP_DIR}/field-shelf.desktop"
if [ -n "$DESKTOP_DIR" ]; then
  write_desktop "${DESKTOP_DIR}/フィールドシェルフ.desktop"
  printf '%s\n' "デスクトップに「フィールドシェルフ」を置きました。次からはそのアイコンで開けます。"
else
  printf '%s\n' "アプリ一覧に「フィールドシェルフ」を追加しました。デスクトップのフォルダが見つからなかったので、アプリ一覧から開いてください。"
fi
