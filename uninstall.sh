#!/bin/bash
set -e

PURGE=0
if [ "$1" == "--purge" ]; then
    PURGE=1
fi

echo "🗑️  Uninstalling Synkromium..."
echo "🔒 You may be prompted for your sudo password."

echo "Removing application files from /opt/Synkromium..."
sudo rm -rf /opt/Synkromium

echo "Removing application icon..."
sudo rm -f /usr/share/pixmaps/synkromium.png

echo "Removing desktop entry..."
sudo rm -f /usr/share/applications/synkromium.desktop

if [ $PURGE -eq 1 ]; then
    echo "🧹 Purging configuration files in ~/.synkromium..."
    rm -rf ~/.synkromium
fi

echo "✅ Synkromium has been successfully uninstalled!"
if [ $PURGE -eq 0 ]; then
    echo "💡 Note: Configuration and sync data were not removed. Run with --purge to remove them."
fi
