#!/bin/bash

# Build script for blink detector binary
# This script activates the virtual environment and builds the standalone binary

set -e  # Exit on any error

echo "🚀 Building blink detector standalone binary..."

# Get the directory of this script
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# Check if virtual environment exists
if [ ! -d "$SCRIPT_DIR/venv" ]; then
    echo "❌ Virtual environment not found. Please run setup.sh first."
    exit 1
fi

# Activate virtual environment
echo "📦 Activating virtual environment..."
source "$SCRIPT_DIR/venv/bin/activate"

# Install PyInstaller if not already installed
echo "🔧 Checking PyInstaller installation..."
python -c "import PyInstaller" 2>/dev/null || {
    echo "📦 Installing PyInstaller..."
    pip install pyinstaller
}

# Run the build script
echo "🔨 Building binary..."
python "$SCRIPT_DIR/build_binary.py"

echo "✅ Build complete!" 