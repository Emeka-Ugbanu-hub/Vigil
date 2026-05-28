#!/bin/bash
set -e

ICONS_DIR="/Users/emekaugbanu/Desktop/Companion/src-tauri/icons"
ICONSET_DIR="/Users/emekaugbanu/Desktop/Companion/src-tauri/icons/Vigil.iconset"

mkdir -p "$ICONSET_DIR"

# Copy PNGs to iconset with proper naming
cp "$ICONS_DIR/16x16.png" "$ICONSET_DIR/icon_16x16.png"
cp "$ICONS_DIR/32x32.png" "$ICONSET_DIR/icon_32x32.png"
cp "$ICONS_DIR/32x32.png" "$ICONSET_DIR/icon_16x16@2x.png"
cp "$ICONS_DIR/128x128.png" "$ICONSET_DIR/icon_128x128.png"
cp "$ICONS_DIR/128x128@2x.png" "$ICONSET_DIR/icon_128x128@2x.png"
cp "$ICONS_DIR/128x128@2x.png" "$ICONSET_DIR/icon_256x256.png"
cp "$ICONS_DIR/icon.png" "$ICONSET_DIR/icon_256x256@2x.png"
cp "$ICONS_DIR/icon.png" "$ICONSET_DIR/icon_512x512.png"
cp "$ICONS_DIR/icon.png" "$ICONSET_DIR/icon_512x512@2x.png"

# Generate ICNS
iconutil -c icns "$ICONSET_DIR" -o "$ICONS_DIR/icon.icns"

# Clean up
rm -rf "$ICONSET_DIR"

echo "Generated $ICONS_DIR/icon.icns"
