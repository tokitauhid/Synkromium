#!/bin/bash
set -e

echo "📦 Building Synkromium..."
npm install
npm run build

echo "🔨 Packaging application..."
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

echo "✅ Synkromium installed successfully!"
echo "🎉 Launch 'Synkromium' from your application menu."
