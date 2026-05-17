#!/bin/bash

# Exit on any error
set -e

echo "📦 Building Synkromium..."
# Make sure dependencies are installed
npm install
# Build the TypeScript and copy assets
npm run build

echo "🔨 Packaging application (distro-independent)..."
# Build the unpacked directory (no .deb/.rpm specific packaging)
npx electron-builder --linux dir

UNPACKED_DIR="release/linux-unpacked"

if [ ! -d "$UNPACKED_DIR" ]; then
    echo "❌ Error: Could not find packaged app in $UNPACKED_DIR"
    exit 1
fi

echo "🚀 Installing to /opt/Synkromium..."
echo "🔒 You may be prompted for your sudo password."
sudo rm -rf /opt/Synkromium
sudo cp -r "$UNPACKED_DIR" /opt/Synkromium

echo "🖼️  Setting up application icon and desktop entry..."
sudo cp build/icons/icon.png /usr/share/pixmaps/synkromium.png

# Create a system-wide desktop entry
sudo tee /usr/share/applications/synkromium.desktop > /dev/null << EOF
[Desktop Entry]
Name=Synkromium
Comment=Private, Git-backed Chromium browser sync
Exec=/opt/Synkromium/synkromium %U
Icon=synkromium
Terminal=false
Type=Application
Categories=Utility;Network;
EOF

sudo chmod +x /usr/share/applications/synkromium.desktop

echo "✅ Synkromium has been installed successfully!"
echo "🎉 You can now find and launch 'Synkromium' from your application menu on any Linux distro."
