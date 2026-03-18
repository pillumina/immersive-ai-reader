#!/bin/bash

echo "🚀 Starting Immersive AI Reader (Tauri)..."
echo ""
echo "📋 Checking prerequisites..."

# Check Node.js
if command -v node &> /dev/null; then
    NODE_VERSION=$(node --version)
    echo "✅ Node.js: $NODE_VERSION"
else
    echo "❌ Node.js not found. Please install Node.js 20+"
    exit 1
fi

# Check npm
if command -v npm &> /dev/null; then
    NPM_VERSION=$(npm --version)
    echo "✅ npm: $NPM_VERSION"
else
    echo "❌ npm not found"
    exit 1
fi

# Check Rust
if command -v rustc &> /dev/null; then
    RUST_VERSION=$(rustc --version)
    echo "✅ Rust: $RUST_VERSION"
else
    echo "❌ Rust not found. Please install from https://rustup.rs/"
    exit 1
fi

# Check Cargo
if command -v cargo &> /dev/null; then
    CARGO_VERSION=$(cargo --version)
    echo "✅ Cargo: $CARGO_VERSION"
else
    echo "❌ Cargo not found"
    exit 1
fi

echo ""
echo "📦 Checking dependencies..."

# Check if node_modules exists
if [ ! -d "node_modules" ]; then
    echo "⚠️  node_modules not found. Installing npm dependencies..."
    npm install
    if [ $? -ne 0 ]; then
        echo "❌ Failed to install npm dependencies"
        exit 1
    fi
    echo "✅ npm dependencies installed"
else
    echo "✅ npm dependencies found"
fi

echo ""
echo "🎯 Starting Tauri development server..."
echo ""
echo "⏱️  Note: First run may take 5-10 minutes to compile Rust dependencies"
echo "🔄 Subsequent runs will be much faster"
echo ""
echo "Press Ctrl+C to stop the server"
echo ""
echo "═══════════════════════════════════════════════════════════════"
echo ""

# Run Tauri dev
npm run tauri dev
