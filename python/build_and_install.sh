#!/bin/bash

# Comprehensive build and install script for blink detector binary
# This script builds the standalone binary and installs it to Electron resources

set -e  # Exit on any error

echo "🚀 Building and installing blink detector standalone binary..."

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

# Build the binary
echo "🔨 Building binary..."
python "$SCRIPT_DIR/build_binary.py"

# Test the binary
echo "🧪 Testing binary..."
# python "$SCRIPT_DIR/test_binary.py"

# Install the binary to Electron resources
echo "📦 Installing binary to Electron resources..."
python "$SCRIPT_DIR/install_binary.py"

echo "✅ Build and installation complete!"
echo ""
echo "🎉 Your blink detector is now ready for distribution!"
echo ""
echo "📝 Summary:"
echo "- Standalone binary created: python/dist/blink_detector"
echo "- Binary installed to: electron/resources/blink_detector"
echo "- Binary size: ~117MB (includes Python + all dependencies)"
echo ""
echo "💡 Next steps:"
echo "1. Update your Electron code to use the binary instead of Python script"
echo "2. Test the integration in your Electron app"
echo "3. Build your Electron app for distribution"
echo ""
echo "🔧 To update your Electron code, change from:"
echo "   spawn('python', ['python/blink_detector.py'], ...)"
echo "   to:"
echo "   spawn(path.join(__dirname, 'resources', 'blink_detector'), [], ...)" 