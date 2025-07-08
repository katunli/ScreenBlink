#!/usr/bin/env python3
"""
Test script for the standalone blink detector binary
"""

import subprocess
import json
import time
import signal
import sys
from pathlib import Path

def test_binary():
    """Test the standalone binary"""
    binary_path = Path(__file__).parent / "dist" / "blink_detector"
    
    if not binary_path.exists():
        print(f"ERROR: Binary not found at: {binary_path}")
        print("Please run the build script first: ./build.sh")
        return False
    
    print(f"Testing binary: {binary_path}")
    print(f"Binary size: {binary_path.stat().st_size / (1024*1024):.1f} MB")
    
    try:
        # Start the binary process
        process = subprocess.Popen(
            [str(binary_path)],
            stdin=subprocess.PIPE,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            text=True,
            bufsize=1
        )
        
        print("OK: Binary started successfully")
        
        # Send a test configuration
        test_config = {"ear_threshold": 0.20}
        process.stdin.write(json.dumps(test_config) + "\n")
        process.stdin.flush()
        
        print("OK: Sent test configuration")
        
        # Read output for a few seconds
        start_time = time.time()
        output_lines = []
        
        while time.time() - start_time < 3:  # Test for 3 seconds
            if process.stdout.readable():
                line = process.stdout.readline()
                if line:
                    output_lines.append(line.strip())
                    print(f"Output: {line.strip()}")
            
            # Check if process is still running
            if process.poll() is not None:
                break
        
        # Terminate the process
        process.terminate()
        try:
            process.wait(timeout=2)
        except subprocess.TimeoutExpired:
            process.kill()
            process.wait()
        
        print("OK: Binary terminated successfully")
        
        # Check if we got any output
        if output_lines:
            print(f"OK: Binary produced {len(output_lines)} lines of output")
            return True
        else:
            print("WARNING: No output received from binary")
            return False
            
    except Exception as e:
        print(f"ERROR: Error testing binary: {e}")
        return False

def main():
    print("Testing standalone blink detector binary...")
    
    success = test_binary()
    
    if success:
        print("\nSUCCESS: Binary test passed! The standalone executable works correctly.")
        print("\nYou can now:")
        print("1. Copy the binary to your Electron app's resources folder")
        print("2. Update your Electron code to use the binary instead of Python script")
        print("3. Distribute your app without requiring Python installation")
    else:
        print("\nERROR: Binary test failed. Please check the build process.")
        sys.exit(1)

if __name__ == "__main__":
    main() 