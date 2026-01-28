#!/bin/bash
# Windows Client PKG Build Script

set -e

echo "=========================================="
echo "  Web Clipboard - Windows Build"
echo "=========================================="
echo ""

# Clean old build artifacts
echo "Cleaning old build artifacts..."
rm -rf release-build/pkg/win/
mkdir -p release-build/pkg/win/

# Run pkg build
echo "Building (Windows x64)..."
npm run pkg:build

# Check build result
if [ -f "release-build/pkg/win/web-clipboard-win.exe" ]; then
    echo ""
    echo "Build successful!"
    echo ""
    echo "Output: release-build/pkg/win/web-clipboard-win.exe"
    echo "Size: $(du -h release-build/pkg/win/web-clipboard-win.exe | cut -f1)"
    echo ""
    echo "Usage:"
    echo "  1. Send release-build/pkg/win/web-clipboard-win.exe to Windows users"
    echo "  2. User double-clicks to run"
    echo "  3. Enter room ID (or press Enter for random room)"
    echo "  4. Open the displayed URL on mobile phone"
    echo "  5. Start clipboard sync"
    echo ""
else
    echo ""
    echo "Build failed, output file not found"
    exit 1
fi