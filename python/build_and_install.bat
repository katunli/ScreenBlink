@echo off
setlocal enabledelayedexpansion

REM Comprehensive build and install script for blink detector binary (Windows)
REM This script builds the standalone binary and installs it to Electron resources

echo 🚀 Building and installing blink detector standalone binary...

REM Get the directory of this script
set "SCRIPT_DIR=%~dp0"

REM Check if virtual environment exists
if not exist "%SCRIPT_DIR%venv" (
    echo ❌ Virtual environment not found. Please run setup.bat first.
    exit /b 1
)

REM Activate virtual environment
echo 📦 Activating virtual environment...
call "%SCRIPT_DIR%venv\Scripts\activate.bat"

REM Install PyInstaller if not already installed
echo 🔧 Checking PyInstaller installation...
python -c "import PyInstaller" 2>nul || (
    echo 📦 Installing PyInstaller...
    pip install pyinstaller
)

REM Build the binary
echo 🔨 Building binary...
python "%SCRIPT_DIR%build_binary.py"

REM Test the binary
echo 🧪 Testing binary...
python "%SCRIPT_DIR%test_binary.py"

REM Install the binary to Electron resources
echo 📦 Installing binary to Electron resources...
python "%SCRIPT_DIR%install_binary.py"

echo ✅ Build and installation complete!
echo.
echo 🎉 Your blink detector is now ready for distribution!
echo.
echo 📝 Summary:
echo - Standalone binary created: python/dist/blink_detector.exe
echo - Binary installed to: electron/resources/blink_detector.exe
echo - Binary size: ~117MB (includes Python + all dependencies)
echo.
echo 💡 Next steps:
echo 1. Update your Electron code to use the binary instead of Python script
echo 2. Test the integration in your Electron app
echo 3. Build your Electron app for distribution
echo.
echo 🔧 To update your Electron code, change from:
echo    spawn('python', ['python/blink_detector.py'], ...)
echo    to:
echo    spawn(path.join(__dirname, 'resources', 'blink_detector.exe'), [], ...) 