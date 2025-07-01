#!/usr/bin/env python3
"""
Build script for creating standalone binary of blink_detector.py
"""

import os
import sys
import subprocess
import shutil
import platform
from pathlib import Path

def install_pyinstaller():
    """Install PyInstaller if not already installed"""
    try:
        import PyInstaller
        print("PyInstaller is already installed")
    except ImportError:
        print("Installing PyInstaller...")
        subprocess.check_call([sys.executable, "-m", "pip", "install", "pyinstaller"])

def get_executable_name():
    """Get the correct executable name for the current platform"""
    if platform.system() == "Windows":
        return "blink_detector.exe"
    elif platform.system() == "Darwin":  # macOS
        return "blink_detector"
    else:  # Linux
        return "blink_detector"

def build_binary():
    """Build the standalone binary"""
    # Get the directory of this script
    script_dir = Path(__file__).parent
    blink_detector_path = script_dir / "blink_detector.py"
    
    # Ensure the blink detector script exists
    if not blink_detector_path.exists():
        print(f"Error: {blink_detector_path} not found!")
        sys.exit(1)
    
    # Create dist directory if it doesn't exist
    dist_dir = script_dir / "dist"
    dist_dir.mkdir(exist_ok=True)
    
    print("Building standalone binary...")
    print(f"Platform: {platform.system()} {platform.machine()}")
    
    # Check if spec file exists
    spec_file = script_dir / "blink_detector.spec"
    model_source = script_dir.parent / "electron" / "assets" / "models"
    
    # Try to build with spec file first
    if spec_file.exists():
        print("Using existing spec file...")
        try:
            cmd = ["pyinstaller", "--clean", str(spec_file)]
            print(f"Command: {' '.join(cmd)}")
            result = subprocess.run(cmd, capture_output=True, text=True, check=True)
            print("PyInstaller output:")
            print(result.stdout)
        except subprocess.CalledProcessError as e:
            print(f"Spec file build failed: {e}")
            print("PyInstaller stderr:")
            print(e.stderr)
            print("Falling back to direct PyInstaller command...")
            # Fall back to direct command
            build_with_direct_command(blink_detector_path, model_source)
    else:
        print("Creating new build with PyInstaller...")
        build_with_direct_command(blink_detector_path, model_source)
    
    # Check if binary was created
    exe_name = get_executable_name()
    exe_path = dist_dir / exe_name
    
    if exe_path.exists():
        size_mb = exe_path.stat().st_size / (1024*1024)
        print(f"\nSUCCESS: Binary created successfully!")
        print(f"Location: {exe_path}")
        print(f"Size: {size_mb:.1f} MB")
        
        # Test if the binary is executable
        if platform.system() != "Windows":
            os.chmod(exe_path, 0o755)
            print("OK: Made binary executable")
    else:
        print(f"ERROR: Binary not found at expected location: {exe_path}")
        print("Checking dist directory contents:")
        if dist_dir.exists():
            for item in dist_dir.iterdir():
                print(f"  - {item.name}")
        sys.exit(1)

def build_with_direct_command(blink_detector_path, model_source):
    """Build using direct PyInstaller command"""
    if not model_source.exists():
        print(f"Warning: Model directory not found at {model_source}")
        print("Will try to build without models (binary may not work properly)")
        cmd = [
            "pyinstaller",
            "--clean",
            "--onefile",
            "--name=blink_detector",
            str(blink_detector_path)
        ]
    else:
        cmd = [
            "pyinstaller",
            "--clean",
            "--onefile",
            "--name=blink_detector",
            f"--add-data={model_source}:assets/models",
            str(blink_detector_path)
        ]
    
    print(f"Command: {' '.join(cmd)}")
    try:
        result = subprocess.run(cmd, capture_output=True, text=True, check=True)
        print("PyInstaller output:")
        print(result.stdout)
    except subprocess.CalledProcessError as e:
        print(f"ERROR: Build failed with error: {e}")
        print("PyInstaller stderr:")
        print(e.stderr)
        print("PyInstaller stdout:")
        print(e.stdout)
        sys.exit(1)

def create_cross_platform_builds():
    """Create builds for multiple platforms (requires Docker or cross-compilation setup)"""
    print("\nFor cross-platform builds, you can use:")
    print("1. Docker with multi-stage builds")
    print("2. GitHub Actions for automated builds")
    print("3. Virtual machines for each target platform")
    print("\nFor now, the binary is built for your current platform only.")

def main():
    print("Building blink detector standalone binary...")
    
    # Install PyInstaller if needed
    install_pyinstaller()
    
    # Build the binary
    build_binary()
    
    # Show cross-platform build info
    create_cross_platform_builds()
    
    print("\nSUCCESS: Build complete! You can now distribute the binary with your Electron app.")
    print("\nNext steps:")
    print("1. Copy the binary to your Electron app's resources folder")
    print("2. Update your Electron code to spawn the binary instead of Python script")
    print("3. Test the binary on a clean machine without Python installed")

if __name__ == "__main__":
    main() 