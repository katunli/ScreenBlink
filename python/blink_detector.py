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
EAR_THRESHOLD = 0.20  # Default value
BLINK_COOLDOWN = 0.3  # seconds
TARGET_FPS = 15
FACE_DETECTION_SKIP = 1  # Only run face detection every 3rd frame
PROCESSING_RESOLUTION = (320, 240) 
BLINK_DISPLAY_DURATION = 0.35  # How long to show blink detection in UI (seconds)

# Global variables
SEND_VIDEO = False
CAMERA_ACTIVE = False
cap = None
command_queue = queue.Queue()
current_face_detection_skip = FACE_DETECTION_SKIP
target_fps = TARGET_FPS
processing_resolution = PROCESSING_RESOLUTION
current_ear_threshold = EAR_THRESHOLD 
last_blink_display_time = 0.0  # Track when blink was last detected for UI display

_cached_json_strings = {
    "no_face_data": json.dumps({"faceData": {
        "faceDetected": False,
        "ear": 0.0,
        "blink": False,
        "faceRect": {"x": 0, "y": 0, "width": 0, "height": 0},
        "eyeLandmarks": []
    }})
}

# Performance optimization: Pre-allocated buffers
class PreallocatedBuffers:
    def __init__(self, max_points=68):
        self.landmarks_array = np.zeros((max_points, 2), dtype=np.int32)
        self.left_eye = np.zeros((6, 2), dtype=np.int32)
        self.right_eye = np.zeros((6, 2), dtype=np.int32)
        self.temp_frame = None
        self.ear_diffs = np.zeros((3, 2), dtype=np.float32)
        self.ear_distances = np.zeros(3, dtype=np.float32)
        self.concatenated_eyes = np.zeros((12, 2), dtype=np.int32)
        self.normalized_landmarks = [{"x": 0.0, "y": 0.0} for _ in range(12)]

def calculate_ear_fast(eye_points, buffers):
    buffers.ear_diffs[0] = eye_points[1] - eye_points[5]
    buffers.ear_diffs[1] = eye_points[2] - eye_points[4]
    buffers.ear_diffs[2] = eye_points[0] - eye_points[3]
    
    np.sum(buffers.ear_diffs**2, axis=1, out=buffers.ear_distances)
    np.sqrt(buffers.ear_distances, out=buffers.ear_distances)
    
    return float((buffers.ear_distances[0] + buffers.ear_distances[1]) / (2.0 * buffers.ear_distances[2] + 1e-6))

def get_eye_landmarks_only(predictor, gray, face, buffers):
    shape = predictor(gray, face)
    for i in range(6):
        point = shape.part(36 + i)
        buffers.left_eye[i, 0] = point.x
        buffers.left_eye[i, 1] = point.y
        
        point = shape.part(42 + i)
        buffers.right_eye[i, 0] = point.x
        buffers.right_eye[i, 1] = point.y
    
    return buffers.left_eye, buffers.right_eye

_encode_params = [cv2.IMWRITE_JPEG_QUALITY, 70]
def encode_frame(frame):
    _, buffer = cv2.imencode('.jpg', frame, _encode_params)
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
                        return i, backend
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
    return None, None

def start_camera():
    """Start the camera and return success status"""
    global cap, CAMERA_ACTIVE
    
    print(json.dumps({"debug": "start_camera() called"}))
    sys.stdout.flush()
    
    if CAMERA_ACTIVE:
        print(json.dumps({"debug": "Camera already active"}))
        sys.stdout.flush()
        return True
    
    # Try to start camera with retry logic
    max_retries = 10  
    retry_delay = 2   
    for attempt in range(max_retries):
        print(json.dumps({"debug": f"Camera start attempt {attempt + 1}/{max_retries}"}))
        sys.stdout.flush()
        
        # Find available camera
        camera_index, backend = find_available_camera()
        if camera_index is None:
            print(json.dumps({"debug": f"No working camera found on attempt {attempt + 1}"}))
            sys.stdout.flush()
            if attempt < max_retries - 1:
                time.sleep(retry_delay)
                continue
            else:
                print(json.dumps({"error": "No working camera found after all attempts"}))
                sys.stdout.flush()
                return False
        
        # Initialize video capture with the working camera
        try:
            cap = cv2.VideoCapture(camera_index, backend)
            
            # Test if we can actually read frames
            ret, test_frame = cap.read()
            if not ret or test_frame is None:
                print(json.dumps({"debug": f"Camera opened but cannot read frames on attempt {attempt + 1}"}))
                sys.stdout.flush()
                cap.release()
                cap = None
                if attempt < max_retries - 1:
                    time.sleep(retry_delay)
                    continue
                else:
                    print(json.dumps({"error": "Camera opened but cannot read frames after all attempts"}))
                    sys.stdout.flush()
                    return False
            
            # Set resolution to efficient processing resolution
            cap.set(cv2.CAP_PROP_FRAME_WIDTH, processing_resolution[0])
            cap.set(cv2.CAP_PROP_FRAME_HEIGHT, processing_resolution[1])
            
            # Set frame rate to efficient target FPS
            cap.set(cv2.CAP_PROP_FPS, target_fps)
            
            # Verify resolution was set
            actual_width = cap.get(cv2.CAP_PROP_FRAME_WIDTH)
            actual_height = cap.get(cv2.CAP_PROP_FRAME_HEIGHT)
            actual_fps = cap.get(cv2.CAP_PROP_FPS)
            print(json.dumps({"debug": f"Camera resolution set to: {actual_width}x{actual_height}, FPS: {actual_fps}"}))
            sys.stdout.flush()
            
            CAMERA_ACTIVE = True
            print(json.dumps({"status": "Camera opened successfully"}))
            sys.stdout.flush()
            return True
            
        except Exception as e:
            print(json.dumps({"debug": f"Exception starting camera on attempt {attempt + 1}: {str(e)}"}))
            sys.stdout.flush()
            if cap is not None:
                cap.release()
                cap = None
            
            if attempt < max_retries - 1:
                time.sleep(retry_delay)
                continue
            else:
                print(json.dumps({"error": f"Failed to start camera after all attempts: {str(e)}"}))
                sys.stdout.flush()
                return False
    
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
    global SEND_VIDEO, current_ear_threshold, current_face_detection_skip, target_fps, processing_resolution
    
    while not command_queue.empty():
        try:
            line = command_queue.get_nowait()
            data = json.loads(line)
            
            print(json.dumps({"debug": f"Processing command: {data}"}))
            sys.stdout.flush()
            
            if 'ear_threshold' in data:
                current_ear_threshold = float(data['ear_threshold'])
                print(json.dumps({"status": f"Updated EAR threshold to {current_ear_threshold}"}))
                print(json.dumps({"debug": f"Current EAR threshold being used: {current_ear_threshold}"}))
                sys.stdout.flush()
            elif 'frame_skip' in data:
                current_face_detection_skip = int(data['frame_skip'])
                print(json.dumps({"status": f"Updated face detection skip to {current_face_detection_skip}"}))
                sys.stdout.flush()
            elif 'target_fps' in data:
                target_fps = int(data['target_fps'])
                if CAMERA_ACTIVE and cap is not None:
                    cap.set(cv2.CAP_PROP_FPS, target_fps)
                print(json.dumps({"status": f"Updated target FPS to {target_fps}"}))
                sys.stdout.flush()
            elif 'processing_resolution' in data:
                processing_resolution = tuple(data['processing_resolution'])
                print(json.dumps({"status": f"Updated processing resolution to {processing_resolution}"}))
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
    global SEND_VIDEO, CAMERA_ACTIVE, cap, current_ear_threshold, last_blink_display_time  # Add current_ear_threshold to global declaration
    
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
    
    # Performance optimization: Pre-allocate buffers
    buffers = PreallocatedBuffers()
    
    print(json.dumps({"status": "Models loaded successfully, ready for camera activation"}))
    print(json.dumps({"debug": f"Initial EAR threshold set to: {current_ear_threshold}"}))
    sys.stdout.flush()
    
    last_blink_time = time.time()
    frame_count = 0
    last_face_detection_time = 0
    cached_face_data = None
    
    # Calculate frame interval for target FPS
    frame_interval = 1.0 / target_fps
    last_frame_time = time.time()
    
    # Pre-allocate face data structure to reduce memory allocations
    default_face_data = {
        "faceDetected": False,
        "ear": 0.0,
        "blink": False,
        "faceRect": {"x": 0, "y": 0, "width": 0, "height": 0},
        "eyeLandmarks": []
    }
    
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
            
            # Frame rate limiting
            current_time = time.time()
            if current_time - last_frame_time < frame_interval:
                time.sleep(0.001)  # Small sleep to prevent busy waiting
                continue
            
            last_frame_time = current_time
            
            ret, frame = cap.read()
            if not ret:
                print(json.dumps({"error": "Failed to read frame"}))
                time.sleep(0.1)
                continue
            
            current_shape = frame.shape[:2]
            target_shape = processing_resolution[::-1]
            if current_shape != target_shape:
                frame = cv2.resize(frame, processing_resolution)
            
            gray = cv2.cvtColor(frame, cv2.COLOR_BGR2GRAY)
            
            should_detect_face = (frame_count % current_face_detection_skip == 0)
            
            if should_detect_face:
                faces = detector(gray, 0)
                last_face_detection_time = current_time
                
                face_data = default_face_data.copy()
                
                for face in faces:
                    left_eye, right_eye = get_eye_landmarks_only(predictor, gray, face, buffers)
                    
                    left_ear = calculate_ear_fast(left_eye, buffers)
                    right_ear = calculate_ear_fast(right_eye, buffers)
                    avg_ear = (left_ear + right_ear) * 0.5
                    
                    frame_width = frame.shape[1]
                    frame_height = frame.shape[0]
                    
                    face_data["faceDetected"] = True
                    face_data["ear"] = float(avg_ear)
                    face_data["faceRect"] = {
                        "x": float(face.left() / frame_width),
                        "y": float(face.top() / frame_height),
                        "width": float(face.width() / frame_width),
                        "height": float(face.height() / frame_height)
                    }
                    
                    buffers.concatenated_eyes[:6] = left_eye
                    buffers.concatenated_eyes[6:] = right_eye
                    
                    for i in range(12):
                        buffers.normalized_landmarks[i]["x"] = float(buffers.concatenated_eyes[i, 0] / frame_width)
                        buffers.normalized_landmarks[i]["y"] = float(buffers.concatenated_eyes[i, 1] / frame_height)
                    
                    face_data["eyeLandmarks"] = buffers.normalized_landmarks.copy()
                    
                    # Check if we should show blink detection in UI
                    should_show_blink = (current_time - last_blink_display_time) < BLINK_DISPLAY_DURATION
                    
                    if avg_ear < current_ear_threshold and (current_time - last_blink_time) > BLINK_COOLDOWN:
                        last_blink_time = current_time
                        last_blink_display_time = current_time
                        face_data["blink"] = True
                        print(json.dumps({
                            "blink": True,
                            "ear": float(avg_ear),
                            "time": float(current_time)
                        }))
                        print(json.dumps({"debug": f"Blink detected! EAR: {avg_ear:.3f}, Threshold: {current_ear_threshold:.3f}"}))
                        sys.stdout.flush()
                    elif should_show_blink:
                        # Keep showing blink detection for the display duration
                        face_data["blink"] = True
                
                cached_face_data = face_data
            else:
                # Use cached face data but check if we should still show blink detection
                face_data = cached_face_data if cached_face_data else default_face_data
                
                # Check if we should still show blink detection from previous detection
                if face_data.get("faceDetected", False):
                    should_show_blink = (current_time - last_blink_display_time) < BLINK_DISPLAY_DURATION
                    if should_show_blink:
                        face_data["blink"] = True
            
            if face_data.get("faceDetected", False):
                print(json.dumps({"faceData": face_data}))
            else:
                print(_cached_json_strings["no_face_data"])
            sys.stdout.flush()
            
            if SEND_VIDEO and frame_count % 3 == 0 and face_data.get("faceDetected", False):
                if processing_resolution == (640, 480):
                    frame_base64 = encode_frame(frame)
                else:
                    display_frame = cv2.resize(frame, (640, 480))
                    frame_base64 = encode_frame(display_frame)
                
                print(json.dumps({"videoStream": frame_base64}))
                sys.stdout.flush()
            
            frame_count += 1
            
    except KeyboardInterrupt:
        print(json.dumps({"status": "Stopping blink detector..."}))
        sys.stdout.flush()
    finally:
        stop_camera()

if __name__ == "__main__":
    main() 