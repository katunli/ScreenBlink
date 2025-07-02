import cv2
import numpy as np
import time
import json
import sys
import os
import dlib
from pathlib import Path
import threading
import queue
import base64

# Constants
EAR_THRESHOLD = 0.25  # Default value
BLINK_COOLDOWN = 0.5  # seconds

# Global variables
SEND_VIDEO = False
CAMERA_ACTIVE = False
cap = None
command_queue = queue.Queue()

def calculate_ear(eye_points):
    # Calculate the vertical distances
    vertical_dist1 = np.linalg.norm(eye_points[1] - eye_points[5])
    vertical_dist2 = np.linalg.norm(eye_points[2] - eye_points[4])
    # Calculate the horizontal distance
    horizontal_dist = np.linalg.norm(eye_points[0] - eye_points[3])
    # Compute the eye aspect ratio
    ear = (vertical_dist1 + vertical_dist2) / (2.0 * horizontal_dist)
    return ear

def encode_frame(frame):
    # Encode frame as JPEG
    _, buffer = cv2.imencode('.jpg', frame)
    # Convert to base64
    return base64.b64encode(buffer).decode('utf-8')

def find_available_camera():
    """Find the first available camera with detailed debugging"""
    print(json.dumps({"debug": "Starting camera detection..."}))
    sys.stdout.flush()
    
    # Platform-specific backends
    if sys.platform == "win32":
        backends = [cv2.CAP_DSHOW, cv2.CAP_MSMF, cv2.CAP_ANY]
    elif sys.platform == "darwin":
        backends = [cv2.CAP_AVFOUNDATION, cv2.CAP_ANY]
    else:
        backends = [cv2.CAP_V4L2, cv2.CAP_ANY]
    
    for backend in backends:
        print(json.dumps({"debug": f"Testing backend: {backend}"}))
        sys.stdout.flush()
        
        for i in range(5):  # Check cameras 0-4
            print(json.dumps({"debug": f"Trying camera index {i} with backend {backend}"}))
            sys.stdout.flush()
            
            try:
                cap_test = cv2.VideoCapture(i, backend)
                if cap_test.isOpened():
                    ret, test_frame = cap_test.read()
                    cap_test.release()
                    
                    if ret and test_frame is not None:
                        print(json.dumps({"debug": f"Success! Camera {i} working with backend {backend}"}))
                        print(json.dumps({"status": f"Found working camera at index {i}"}))
                        sys.stdout.flush()
                        return i
                    else:
                        print(json.dumps({"debug": f"Camera {i} opened but cannot read frames"}))
                        sys.stdout.flush()
                else:
                    print(json.dumps({"debug": f"Failed to open camera {i} with backend {backend}"}))
                    sys.stdout.flush()
            except Exception as e:
                print(json.dumps({"debug": f"Exception testing camera {i} with backend {backend}: {str(e)}"}))
                sys.stdout.flush()
    
    print(json.dumps({"debug": "No working camera found after trying all options"}))
    sys.stdout.flush()
    return None

def start_camera():
    """Start the camera and return success status"""
    global cap, CAMERA_ACTIVE
    
    print(json.dumps({"debug": "start_camera() called"}))
    sys.stdout.flush()
    
    if CAMERA_ACTIVE:
        print(json.dumps({"debug": "Camera already active"}))
        sys.stdout.flush()
        return True
    
    # Find available camera
    camera_index = find_available_camera()
    if camera_index is None:
        print(json.dumps({"error": "No working camera found"}))
        sys.stdout.flush()
        return False
    
    # Initialize video capture with the working camera
    try:
        cap = cv2.VideoCapture(camera_index)
        
        # Test if we can actually read frames
        ret, test_frame = cap.read()
        if not ret or test_frame is None:
            print(json.dumps({"error": "Camera opened but cannot read frames"}))
            sys.stdout.flush()
            cap.release()
            return False
        
        # Set resolution
        cap.set(cv2.CAP_PROP_FRAME_WIDTH, 640)
        cap.set(cv2.CAP_PROP_FRAME_HEIGHT, 480)
        
        # Verify resolution was set
        actual_width = cap.get(cv2.CAP_PROP_FRAME_WIDTH)
        actual_height = cap.get(cv2.CAP_PROP_FRAME_HEIGHT)
        print(json.dumps({"debug": f"Camera resolution set to: {actual_width}x{actual_height}"}))
        sys.stdout.flush()
        
        CAMERA_ACTIVE = True
        print(json.dumps({"status": "Camera opened successfully"}))
        sys.stdout.flush()
        return True
        
    except Exception as e:
        print(json.dumps({"error": f"Exception starting camera: {str(e)}"}))
        sys.stdout.flush()
        if cap is not None:
            cap.release()
            cap = None
        return False

def stop_camera():
    """Stop the camera"""
    global cap, CAMERA_ACTIVE
    
    print(json.dumps({"debug": "stop_camera() called"}))
    sys.stdout.flush()
    
    if cap is not None:
        cap.release()
        cap = None
    
    CAMERA_ACTIVE = False
    print(json.dumps({"status": "Camera released"}))
    sys.stdout.flush()

def input_thread():
    """Thread to handle stdin input"""
    print(json.dumps({"debug": "Input thread started"}))
    sys.stdout.flush()
    
    while True:
        try:
            line = sys.stdin.readline()
            if line:
                command_queue.put(line.strip())
                print(json.dumps({"debug": f"Received command: {line.strip()}"}))
                sys.stdout.flush()
        except Exception as e:
            print(json.dumps({"debug": f"Input thread error: {str(e)}"}))
            sys.stdout.flush()
            break

def process_commands():
    """Process commands from the queue"""
    global SEND_VIDEO, current_ear_threshold
    
    while not command_queue.empty():
        try:
            line = command_queue.get_nowait()
            data = json.loads(line)
            
            print(json.dumps({"debug": f"Processing command: {data}"}))
            sys.stdout.flush()
            
            if 'ear_threshold' in data:
                current_ear_threshold = float(data['ear_threshold'])
                print(json.dumps({"status": f"Updated EAR threshold to {current_ear_threshold}"}))
                sys.stdout.flush()
            elif 'request_video' in data:
                SEND_VIDEO = True
                print(json.dumps({"status": "Video streaming enabled"}))
                sys.stdout.flush()
            elif 'start_camera' in data:
                if start_camera():
                    print(json.dumps({"status": "Camera started successfully"}))
                else:
                    print(json.dumps({"error": "Failed to start camera"}))
                sys.stdout.flush()
            elif 'stop_camera' in data:
                stop_camera()
                SEND_VIDEO = False
                print(json.dumps({"status": "Camera stopped"}))
                sys.stdout.flush()
        except json.JSONDecodeError as e:
            print(json.dumps({"debug": f"JSON decode error: {str(e)}"}))
            sys.stdout.flush()
        except Exception as e:
            print(json.dumps({"debug": f"Command processing error: {str(e)}"}))
            sys.stdout.flush()

def main():
    global SEND_VIDEO, CAMERA_ACTIVE, cap
    
    print(json.dumps({"status": "Starting blink detector in standby mode..."}))
    sys.stdout.flush()
    
    # Initialize dlib's face detector and facial landmark predictor
    detector = dlib.get_frontal_face_detector()
    
    # Get the model path - handle both development and bundled scenarios
    if getattr(sys, 'frozen', False):
        # Running as bundled binary
        base_path = sys._MEIPASS
        predictor_path = os.path.join(base_path, 'assets', 'models', 'shape_predictor_68_face_landmarks.dat')
    else:
        # Running as script in development
        app_root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
        predictor_path = os.path.join(app_root, 'electron', 'assets', 'models', 'shape_predictor_68_face_landmarks.dat')
    
    # Check if model exists
    if not os.path.exists(predictor_path):
        print(json.dumps({"error": f"Facial landmark model not found at: {predictor_path}"}))
        sys.exit(1)
    
    predictor = dlib.shape_predictor(predictor_path)
    
    print(json.dumps({"status": "Models loaded successfully, ready for camera activation"}))
    sys.stdout.flush()
    
    last_blink_time = time.time()
    current_ear_threshold = EAR_THRESHOLD
    frame_count = 0
    
    # Start input thread
    input_handler = threading.Thread(target=input_thread, daemon=True)
    input_handler.start()
    
    try:
        while True:
            # Process any pending commands
            process_commands()
            
            # Only process frames if camera is active
            if not CAMERA_ACTIVE or cap is None:
                time.sleep(0.1)  # Sleep longer when camera is not active
                continue
            
            ret, frame = cap.read()
            if not ret:
                print(json.dumps({"error": "Failed to read frame"}))
                break
            
            # Convert to grayscale for face detection
            gray = cv2.cvtColor(frame, cv2.COLOR_BGR2GRAY)
            
            # Detect faces using dlib
            faces = detector(gray, 0)
            
            face_data = {
                "faceDetected": False,
                "ear": 0.0,
                "blink": False,
                "faceRect": {"x": 0, "y": 0, "width": 0, "height": 0},
                "eyeLandmarks": []
            }
            
            for face in faces:
                # Get facial landmarks
                landmarks = predictor(gray, face)
                
                # Convert landmarks to numpy array
                points = np.array([[p.x, p.y] for p in landmarks.parts()])
                
                # Get eye landmarks
                left_eye = points[36:42]  # Left eye landmarks
                right_eye = points[42:48]  # Right eye landmarks
                
                # Calculate EAR for both eyes
                left_ear = calculate_ear(left_eye)
                right_ear = calculate_ear(right_eye)
                avg_ear = (left_ear + right_ear) / 2.0
                
                current_time = time.time()
                
                # Update face data
                face_data["faceDetected"] = True
                face_data["ear"] = avg_ear
                face_data["faceRect"] = {
                    "x": face.left() / frame.shape[1],
                    "y": face.top() / frame.shape[0],
                    "width": face.width() / frame.shape[1],
                    "height": face.height() / frame.shape[0]
                }
                face_data["eyeLandmarks"] = [
                    {"x": p[0] / frame.shape[1], "y": p[1] / frame.shape[0]}
                    for p in np.concatenate([left_eye, right_eye])
                ]
                
                # Check for blink using current threshold
                if avg_ear < current_ear_threshold and (current_time - last_blink_time) > BLINK_COOLDOWN:
                    last_blink_time = current_time
                    face_data["blink"] = True
                    print(json.dumps({
                        "blink": True,
                        "ear": avg_ear,
                        "time": current_time
                    }))
                    sys.stdout.flush()
            
            # Send face tracking data
            print(json.dumps({"faceData": face_data}))
            sys.stdout.flush()
            
            # Send video frame every 3 frames if enabled
            if SEND_VIDEO and frame_count % 3 == 0:
                frame_base64 = encode_frame(frame)
                print(json.dumps({"videoStream": frame_base64}))
                sys.stdout.flush()
            
            frame_count += 1
            
            # Small delay to prevent high CPU usage
            time.sleep(0.01)
            
    except KeyboardInterrupt:
        print(json.dumps({"status": "Stopping blink detector..."}))
        sys.stdout.flush()
    finally:
        stop_camera()

if __name__ == "__main__":
    main() 