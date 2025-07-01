#!/usr/bin/env python3
"""
Simple test script to verify the build process
"""

import os
import sys
import subprocess
from pathlib import Path

def test_build():
    """Test the build process"""
    script_dir = Path(__file__).parent
    
    print("🧪 Testing build process...")
    print(f"Script directory: {script_dir}")
    print(f"Current working directory: {os.getcwd()}")
    
    # Check if required files exist
    required_files = [
        "blink_detector.py",
        "requirements.txt",
        "build_binary.py"
    ]
    
    for file in required_files:
        file_path = script_dir / file
        if file_path.exists():
            print(f"✅ {file} exists")
        else:
            print(f"❌ {file} missing")
            return False
    
    # Check if model directory exists
    model_dir = script_dir.parent / "electron" / "assets" / "models"
    if model_dir.exists():
        print(f"✅ Model directory exists: {model_dir}")
        model_file = model_dir / "shape_predictor_68_face_landmarks.dat"
        if model_file.exists():
            print(f"✅ Model file exists: {model_file}")
        else:
            print(f"❌ Model file missing: {model_file}")
            return False
    else:
        print(f"❌ Model directory missing: {model_dir}")
        return False
    
    # Test PyInstaller installation
    try:
        import PyInstaller
        print("✅ PyInstaller is installed")
    except ImportError:
        print("❌ PyInstaller is not installed")
        return False
    
    print("✅ All checks passed!")
    return True

if __name__ == "__main__":
    if test_build():
        print("\n🎉 Build environment is ready!")
        sys.exit(0)
    else:
        print("\n❌ Build environment has issues!")
        sys.exit(1) 