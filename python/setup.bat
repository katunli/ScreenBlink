@echo off
setlocal enabledelayedexpansion

REM Setup script for blink detector Python environment (Windows)
REM This script creates a virtual environment and installs dependencies

echo Setting up blink detector Python environment...

REM Get the directory of this script
set "SCRIPT_DIR=%~dp0"

REM Check if Python is available
python --version >nul 2>&1 || (
    echo ERROR: Python is not installed or not in PATH
    echo Please install Python 3.8+ and try again
    exit /b 1
)

REM Check if virtual environment already exists (from cache)
if exist "%SCRIPT_DIR%venv" (
    echo Virtual environment already exists, checking if it's complete...
    
    REM Activate virtual environment to test
    call "%SCRIPT_DIR%venv\Scripts\activate.bat"
    
    REM Test if key packages are installed
    python -c "import cv2, numpy, dlib, PyInstaller" 2>nul && (
        echo OK: Virtual environment is complete and ready to use
        echo SUCCESS: Setup complete (using cached environment)!
        goto :end
    ) || (
        echo Virtual environment exists but packages are missing, reinstalling...
        deactivate
        rmdir /s /q "%SCRIPT_DIR%venv"
    )
)

REM Create virtual environment
echo Creating virtual environment...
python -m venv "%SCRIPT_DIR%venv"

REM Activate virtual environment
echo Activating virtual environment...
call "%SCRIPT_DIR%venv\Scripts\activate.bat"

REM Upgrade pip
echo Upgrading pip...
python -m pip install --upgrade pip

REM Install dependencies
echo Installing dependencies...
pip install -r "%SCRIPT_DIR%requirements.txt"

echo SUCCESS: Setup complete!
echo.
echo Next steps:
echo 1. Run build_and_install.bat to build the standalone binary
echo 2. Test the binary with test_binary.py
echo 3. The binary will be installed to electron/resources/
echo.
echo To activate the environment manually:
echo    call python\venv\Scripts\activate.bat

:end 