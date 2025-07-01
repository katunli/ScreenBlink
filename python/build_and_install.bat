@echo off
setlocal enabledelayedexpansion

REM Comprehensive build and install script for blink detector binary (Windows)
REM This script builds the standalone binary and installs it to Electron resources

echo Building and installing blink detector standalone binary...

REM Get the directory of this script
set "SCRIPT_DIR=%~dp0"

REM Check if virtual environment exists
if not exist "%SCRIPT_DIR%venv" (
    echo ERROR: Virtual environment not found. Please run setup.bat first.
    exit /b 1
)

REM Activate virtual environment
echo Activating virtual environment...
call "%SCRIPT_DIR%venv\Scripts\activate.bat"

REM Verify virtual environment is active
echo Verifying virtual environment...
python -c "import sys; print('Python executable:', sys.executable)"
if not "%VIRTUAL_ENV%"=="%SCRIPT_DIR%venv" (
    echo ERROR: Virtual environment not properly activated!
    echo Expected: %SCRIPT_DIR%venv
    echo Actual: %VIRTUAL_ENV%
    exit /b 1
)
echo OK: Virtual environment activated successfully

REM Install PyInstaller if not already installed
echo Checking PyInstaller installation...
python -c "import PyInstaller" 2>nul || (
    echo Installing PyInstaller...
    pip install pyinstaller
)

REM Test build environment
echo Testing build environment...
python "%SCRIPT_DIR%test_build.py"
if errorlevel 1 (
    echo ERROR: Build environment test failed!
    exit /b 1
)

REM Build the binary
echo Building binary...
python "%SCRIPT_DIR%build_binary.py"

REM Check if build was successful
if not exist "%SCRIPT_DIR%dist\blink_detector.exe" (
    echo ERROR: Binary build failed! Checking for errors...
    echo.
    echo Checking dist directory contents:
    if exist "%SCRIPT_DIR%dist" (
        dir "%SCRIPT_DIR%dist"
    ) else (
        echo Dist directory does not exist!
    )
    echo.
    echo Checking build directory contents:
    if exist "%SCRIPT_DIR%build" (
        dir "%SCRIPT_DIR%build"
    ) else (
        echo Build directory does not exist!
    )
    echo.
    echo Checking PyInstaller cache:
    if exist "%LOCALAPPDATA%\pyinstaller" (
        dir "%LOCALAPPDATA%\pyinstaller"
    )
    exit /b 1
)

echo OK: Binary built successfully!

REM Test the binary
echo Testing binary...
python "%SCRIPT_DIR%test_binary.py"

REM Install the binary to Electron resources
echo Installing binary to Electron resources...
python "%SCRIPT_DIR%install_binary.py"

echo SUCCESS: Build and installation complete!
echo.
echo Your blink detector is now ready for distribution!
echo.
echo Summary:
echo - Standalone binary created: python/dist/blink_detector.exe
echo - Binary installed to: electron/resources/blink_detector.exe
echo - Binary size: ~117MB (includes Python + all dependencies)
echo.
echo Next steps:
echo 1. Update your Electron code to use the binary instead of Python script
echo 2. Test the integration in your Electron app
echo 3. Build your Electron app for distribution
echo.
echo To update your Electron code, change from:
echo    spawn('python', ['python/blink_detector.py'], ...)
echo    to:
echo    spawn(path.join(__dirname, 'resources', 'blink_detector.exe'), [], ...) 