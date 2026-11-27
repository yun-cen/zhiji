#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
ELECTRON_APP="${1:-/tmp/electron-downloaded/Electron.app}"
INSTALL_DIR="${INSTALL_DIR:-/Applications}"
TARGET="$INSTALL_DIR/知几.app"

if [ ! -d "$ELECTRON_APP" ]; then
  echo "找不到 Electron.app：$ELECTRON_APP" >&2
  echo "用法：scripts/build-macos-app.sh /path/to/Electron.app" >&2
  exit 1
fi

if [ -d "$TARGET" ] && pgrep -f "$TARGET/Contents/MacOS" >/dev/null 2>&1; then
  echo "先退出正在运行的知几，再重新打包。" >&2
  exit 1
fi

rm -rf "$TARGET"
mkdir -p "$INSTALL_DIR"
ditto "$ELECTRON_APP" "$TARGET"

mkdir -p "$TARGET/Contents/Resources/app/electron" "$TARGET/Contents/Resources/app/linger"
cp "$ROOT"/electron/main.js "$ROOT"/electron/preload.js "$ROOT"/electron/store.cjs "$ROOT"/electron/local-model.cjs "$ROOT"/electron/prompts.cjs "$ROOT"/electron/chart-cases.cjs "$TARGET/Contents/Resources/app/electron/"
cp "$ROOT/linger/roles.cjs" "$ROOT/linger/chart.cjs" "$TARGET/Contents/Resources/app/linger/"
cp -R "$ROOT/app" "$ROOT/lab" "$ROOT/assets" "$ROOT/art" "$TARGET/Contents/Resources/app/"
for f in index.html styles.css reading.css fonts.css iztro.js star-library.js reading-library.js reading.js app.js; do
  cp "$ROOT/$f" "$TARGET/Contents/Resources/app/$f"
done

cat > "$TARGET/Contents/Resources/app/package.json" <<'JSON'
{
  "name": "zhiji-desktop",
  "version": "0.1.0",
  "private": true,
  "description": "知几 · 命·运·事三盘会诊",
  "main": "electron/main.js"
}
JSON

cp "$ROOT/assets/zhiji.icns" "$TARGET/Contents/Resources/zhiji.icns"
python3 - "$TARGET/Contents/Info.plist" <<'PY'
import plistlib, sys
path = sys.argv[1]
with open(path, 'rb') as f:
    data = plistlib.load(f)
data.update({
    'CFBundleDisplayName': '知几',
    'CFBundleName': '知几',
    'CFBundleIdentifier': 'studio.tianshuiyirang.zhiji',
    'CFBundleShortVersionString': '0.1.0',
    'CFBundleVersion': '1',
    'CFBundleIconFile': 'zhiji.icns',
    'LSApplicationCategoryType': 'public.app-category.lifestyle',
    'NSHumanReadableCopyright': 'by 天水一壤',
})
with open(path, 'wb') as f:
    plistlib.dump(data, f)
PY

xattr -dr com.apple.quarantine "$TARGET" 2>/dev/null || true
codesign --force --deep --sign - "$TARGET" >/dev/null 2>&1 || true
echo "built: $TARGET"
echo "这是本机唯一一份知几 app；旧副本已由打包脚本替换。"
