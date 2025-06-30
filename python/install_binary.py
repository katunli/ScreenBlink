#!/usr/bin/env python3
"""
Install script for copying the blink detector binary to Electron resources
"""

import shutil
import os
import platform
from pathlib import Path

def get_executable_name():
    """Get the correct executable name for the current platform"""
    if platform.system() == "Windows":
        return "blink_detector.exe"
    elif platform.system() == "Darwin":  # macOS
        return "blink_detector"
    else:  # Linux
        return "blink_detector"

def install_binary():
    """Copy the binary to Electron resources folder"""
    # Get paths
    script_dir = Path(__file__).parent
    binary_name = get_executable_name()
    source_path = script_dir / "dist" / binary_name
    resources_dir = script_dir.parent / "electron" / "resources"
    target_path = resources_dir / binary_name
    
    # Check if binary exists
    if not source_path.exists():
        print(f"❌ Binary not found at: {source_path}")
        print("Please run the build script first: ./build.sh")
        return False
    
    # Create resources directory if it doesn't exist
    resources_dir.mkdir(exist_ok=True)
    
    # Copy the binary
    try:
        shutil.copy2(source_path, target_path)
        
        # Make executable on Unix systems
        if platform.system() != "Windows":
            os.chmod(target_path, 0o755)
        
        size_mb = target_path.stat().st_size / (1024*1024)
        print(f"✅ Binary installed successfully!")
        print(f"Source: {source_path}")
        print(f"Target: {target_path}")
        print(f"Size: {size_mb:.1f} MB")
        
        return True
        
    except Exception as e:
        print(f"❌ Error installing binary: {e}")
        return False

def create_platform_specific_install():
    """Create platform-specific installation instructions"""
    current_platform = platform.system()
    
    print(f"\n📋 Platform-specific installation for {current_platform}:")
    
    if current_platform == "Darwin":  # macOS
        print("For macOS distribution:")
        print("1. The binary is already built for macOS")
        print("2. Copy to electron/resources/blink_detector")
        print("3. Include in your .app bundle")
        
    elif current_platform == "Windows":
        print("For Windows distribution:")
        print("1. The binary is built for Windows")
        print("2. Copy to electron/resources/blink_detector.exe")
        print("3. Include in your installer")
        
    else:  # Linux
        print("For Linux distribution:")
        print("1. The binary is built for Linux")
        print("2. Copy to electron/resources/blink_detector")
        print("3. Include in your package")

def main():
    print("📦 Installing blink detector binary to Electron resources...")
    
    success = install_binary()
    
    if success:
        print("\n🎉 Installation complete!")
        print("\n📝 Next steps:")
        print("1. Update your Electron code to use the binary")
        print("2. Test the integration")
        print("3. Build your Electron app for distribution")
        
        # Show platform-specific info
        create_platform_specific_install()
        
        print(f"\n💡 Example Electron code update:")
        print("```javascript")
        print("// Old way (Python script)")
        print("const pythonProcess = spawn('python', ['python/blink_detector.py'], {")
        print("  stdio: ['pipe', 'pipe', 'pipe']")
        print("});")
        print("")
        print("// New way (standalone binary)")
        print("const binaryPath = path.join(__dirname, 'resources', 'blink_detector');")
        print("const binaryProcess = spawn(binaryPath, [], {")
        print("  stdio: ['pipe', 'pipe', 'pipe']")
        print("});")
        print("```")
    else:
        print("\n❌ Installation failed. Please check the build process.")

if __name__ == "__main__":
    main() 