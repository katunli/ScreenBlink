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
    
    # PyInstaller command (using the working command from our test)
    cmd = [
        "pyinstaller",
        "--clean",
        "--onefile",
        "--name=blink_detector",
        "--add-data=../electron/assets/models:assets/models",
        str(blink_detector_path)
    ]
    
    print("Building standalone binary...")
    print(f"Platform: {platform.system()} {platform.machine()}")
    print(f"Command: {' '.join(cmd)}")
    
    try:
        subprocess.check_call(cmd)
        
        # Check if binary was created
        exe_name = get_executable_name()
        exe_path = dist_dir / exe_name
        
        if exe_path.exists():
            size_mb = exe_path.stat().st_size / (1024*1024)
            print(f"\n✅ Binary created successfully!")
            print(f"Location: {exe_path}")
            print(f"Size: {size_mb:.1f} MB")
            
            # Test if the binary is executable
            if platform.system() != "Windows":
                os.chmod(exe_path, 0o755)
                print("✅ Made binary executable")
        else:
            print(f"❌ Binary not found at expected location: {exe_path}")
            sys.exit(1)
        
    except subprocess.CalledProcessError as e:
        print(f"❌ Build failed with error: {e}")
        sys.exit(1)

def create_cross_platform_builds():
    """Create builds for multiple platforms (requires Docker or cross-compilation setup)"""
    print("\n🔄 For cross-platform builds, you can use:")
    print("1. Docker with multi-stage builds")
    print("2. GitHub Actions for automated builds")
    print("3. Virtual machines for each target platform")
    print("\nFor now, the binary is built for your current platform only.")

def main():
    print("🚀 Building blink detector standalone binary...")
    
    # Install PyInstaller if needed
    install_pyinstaller()
    
    # Build the binary
    build_binary()
    
    # Show cross-platform build info
    create_cross_platform_builds()
    
    print("\n🎉 Build complete! You can now distribute the binary with your Electron app.")
    print("\n📝 Next steps:")
    print("1. Copy the binary to your Electron app's resources folder")
    print("2. Update your Electron code to spawn the binary instead of Python script")
    print("3. Test the binary on a clean machine without Python installed")

if __name__ == "__main__":
    main() 