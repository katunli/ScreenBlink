#!/usr/bin/env python3
"""
Simple camera test script to verify camera functionality
"""
import cv2
import sys
import json

def test_camera():
    print("Testing camera functionality...")
    
    # Platform-specific backends
    if sys.platform == "win32":
        backends = [cv2.CAP_DSHOW, cv2.CAP_MSMF, cv2.CAP_ANY]
    elif sys.platform == "darwin":
        backends = [cv2.CAP_AVFOUNDATION, cv2.CAP_ANY]
    else:
        backends = [cv2.CAP_V4L2, cv2.CAP_ANY]
    
    for backend in backends:
        print(f"Testing backend: {backend}")
        
        for i in range(5):  # Check cameras 0-4
            print(f"  Trying camera index {i} with backend {backend}")
            
            try:
                cap = cv2.VideoCapture(i, backend)
                if cap.isOpened():
                    ret, frame = cap.read()
                    cap.release()
                    
                    if ret and frame is not None:
                        print(f"  SUCCESS! Camera {i} working with backend {backend}")
                        print(f"  Frame shape: {frame.shape}")
                        return True
                    else:
                        print(f"  Camera {i} opened but cannot read frames")
                else:
                    print(f"  Failed to open camera {i} with backend {backend}")
            except Exception as e:
                print(f"  Exception testing camera {i} with backend {backend}: {str(e)}")
    
    print("No working camera found")
    return False

if __name__ == "__main__":
    success = test_camera()
    if success:
        print("\nCamera test PASSED")
        sys.exit(0)
    else:
        print("\nCamera test FAILED")
        sys.exit(1) 