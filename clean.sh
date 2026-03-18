#!/bin/bash

echo "🧹 Cleaning build artifacts..."

# Clean Rust build
echo "Cleaning Rust build..."
rm -rf src-tauri/target
rm -f src-tauri/Cargo.lock

# Clean npm
echo "Cleaning npm..."
rm -rf node_modules
rm -f package-lock.json

# Clean Vite
echo "Cleaning Vite..."
rm -rf dist

# Clean database (optional)
read -p "Delete database and settings? (y/N): " -n 1 -r
echo
if [[ $REPLY =~ ^[Yy]$ ]]; then
    echo "Deleting database and settings..."
    rm -rf ~/Library/Application\ Support/com.immersive-ai-reader/
fi

echo ""
echo "✅ Clean complete!"
echo ""
echo "To reinstall dependencies and run:"
echo "  1. npm install"
echo "  2. npm run tauri dev"
echo ""
echo "Or use ./start.sh"
