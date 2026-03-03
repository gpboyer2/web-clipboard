#!/bin/bash
# Cross-platform PKG Build Script
# Builds for Windows, macOS, and Linux

set -e

echo "=========================================="
echo "  Web Clipboard - Multi-Platform Build"
echo "=========================================="
echo ""

# Clean old build artifacts
echo "Cleaning old build artifacts..."
rm -rf release-build/pkg/
mkdir -p release-build/pkg/win/
mkdir -p release-build/pkg/mac/
mkdir -p release-build/pkg/linux/

# Build for all platforms
echo ""
echo "Building for all platforms..."
echo ""

# Windows
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "Building Windows x64..."
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
npm run pkg:build:win
if [ -f "release-build/pkg/win/web-clipboard-win.exe" ]; then
    echo "✅ Windows build successful"
    echo "   Size: $(du -h release-build/pkg/win/web-clipboard-win.exe | cut -f1)"
else
    echo "❌ Windows build failed"
    exit 1
fi

# macOS
echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "Building macOS x64..."
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
npm run pkg:build:mac
if [ -f "release-build/pkg/mac/web-clipboard-mac" ]; then
    echo "✅ macOS build successful"
    echo "   Size: $(du -h release-build/pkg/mac/web-clipboard-mac | cut -f1)"
else
    echo "❌ macOS build failed"
    exit 1
fi

# Linux
echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "Building Linux x64..."
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
npm run pkg:build:linux
if [ -f "release-build/pkg/linux/web-clipboard-linux" ]; then
    echo "✅ Linux build successful"
    echo "   Size: $(du -h release-build/pkg/linux/web-clipboard-linux | cut -f1)"
else
    echo "❌ Linux build failed"
    exit 1
fi

# Summary
echo ""
echo "=========================================="
echo "  Build Complete!"
echo "=========================================="
echo ""
echo "Output files:"
echo "  📁 release-build/pkg/win/web-clipboard-win.exe"
echo "  📁 release-build/pkg/mac/web-clipboard-mac"
echo "  📁 release-build/pkg/linux/web-clipboard-linux"
echo ""
echo "Usage:"
echo ""
echo "Windows:"
echo "  1. Send web-clipboard-win.exe to Windows users"
echo "  2. Double-click to run"
echo ""
echo "macOS:"
echo "  1. Send web-clipboard-mac to macOS users"
echo "  2. Open Terminal: chmod +x web-clipboard-mac"
echo "  3. Run: ./web-clipboard-mac"
echo ""
echo "Linux:"
echo "  1. Install clipboard tool (if needed):"
echo "     sudo apt install xclip   # or xsel"
echo "  2. Send web-clipboard-linux to Linux users"
echo "  3. Open Terminal: chmod +x web-clipboard-linux"
echo "  4. Run: ./web-clipboard-linux"
echo ""
