#!/bin/bash
# Windows Client PKG Build Script

set -e

echo "=========================================="
echo "  Web Clipboard - Windows Build"
echo "=========================================="
echo ""

# Clean old build artifacts
echo "Cleaning old build artifacts..."
rm -rf dist/
mkdir -p dist/

# Run pkg build
echo "Building (Windows x64)..."
npm run pkg:build

# Check build result
if [ -f "dist/web-clipboard-win.exe" ]; then
    echo ""
    echo "Build successful!"
    echo ""
    echo "Output: dist/web-clipboard-win.exe"
    echo "Size: $(du -h dist/web-clipboard-win.exe | cut -f1)"
    echo ""
    echo "Usage:"
    echo "  1. Send dist/web-clipboard-win.exe to Windows users"
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