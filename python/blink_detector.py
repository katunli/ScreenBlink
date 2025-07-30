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
from collections import deque
import statistics

# Core detection parameters
BLINK_COOLDOWN = 0.3
TARGET_FPS = 10
PROCESSING_RESOLUTION = (320, 240) 
BLINK_DISPLAY_DURATION = 0.2

# Adaptive approach: requires both percentage drop AND absolute EAR drop
# This prevents false blinks when baseline EAR is very low (small fluctuations 
# can cause high percentage drops but small absolute changes)
BLINK_MIN_EAR_DROP = 0.19
BLINK_MIN_ABSOLUTE_EAR_DROP = 0.03

def get_adaptive_ear_drop_threshold(baseline_ear):
    """
    Calculate adaptive EAR drop percentage using a linear function.
    Threshold smoothly decreases as baseline EAR increases for continuous adaptation.
    """
    if baseline_ear <= 0.0:
        return BLINK_MIN_EAR_DROP  # Fallback to default
    
    min_ear = 0.15
    max_ear = 0.35
    max_threshold = 0.20  # For very small eyes (less conservative)
    min_threshold = 0.15  # For large eyes
    
    # Clamp baseline_ear to valid range
    clamped_ear = max(min_ear, min(baseline_ear, max_ear))
    
    # Calculate slope for linear decrease
    slope = (max_threshold - min_threshold) / (max_ear - min_ear)
    
    # Linear function: threshold decreases as EAR increases
    threshold = max_threshold - slope * (clamped_ear - min_ear)
    
    return threshold

BLINK_DURATION_MIN = 0.1
BLINK_DURATION_MAX = 0.6
BLINK_RECOVERY_THRESHOLD = 0.7
BASELINE_WINDOW_SIZE = 15

# System state
SEND_VIDEO = False
CAMERA_ACTIVE = False
cap = None
command_queue = queue.Queue()
target_fps = TARGET_FPS
processing_resolution = PROCESSING_RESOLUTION
last_blink_display_time = 0.0

# Detection state - tracks blink progress and baseline
baseline_ear_values = deque(maxlen=BASELINE_WINDOW_SIZE)
current_baseline_ear = 0.0
blink_in_progress = False
blink_start_time = 0.0
last_blink_time = 0.0
baseline_smoothing_factor = 0.3
max_drop_percentage = 0.0

_cached_json_strings = {
    "no_face_data": json.dumps({"faceData": {
        "faceDetected": False,
        "ear": 0.0,
        "blink": False,
        "faceRect": {"x": 0, "y": 0, "width": 0, "height": 0},
        "eyeLandmarks": []
    }})
}

# Pre-allocated buffers for performance
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

def calculate_baseline_ear(ear_values):
    # Weighted average gives recent values more influence for faster adaptation
    if len(ear_values) < 5:
        return None
    
    weights = np.linspace(0.5, 1.0, len(ear_values))
    weighted_sum = np.sum(np.array(ear_values) * weights)
    total_weight = np.sum(weights)
    
    return weighted_sum / total_weight

def detect_blink_advanced(current_ear, current_time):
    global baseline_ear_values, current_baseline_ear, blink_in_progress, blink_start_time, last_blink_time, max_drop_percentage
    
    baseline_ear_values.append(current_ear)
    
    # Update baseline with exponential smoothing for responsive adaptation
    if len(baseline_ear_values) >= 5:
        new_baseline = calculate_baseline_ear(baseline_ear_values)
        if new_baseline:
            if current_baseline_ear > 0:
                current_baseline_ear = (baseline_smoothing_factor * new_baseline + 
                                      (1 - baseline_smoothing_factor) * current_baseline_ear)
            else:
                current_baseline_ear = new_baseline
    else:
        return False, None
    
    if current_baseline_ear <= 0:
        return False, None
        
    ear_drop_percentage = (current_baseline_ear - current_ear) / current_baseline_ear
    ear_drop_absolute = current_baseline_ear - current_ear
    
    # Get adaptive threshold based on baseline EAR size
    adaptive_threshold = get_adaptive_ear_drop_threshold(current_baseline_ear)
    
    # Start blink detection when both percentage and absolute drop thresholds are met
    if (not blink_in_progress and 
        ear_drop_percentage > adaptive_threshold and 
        ear_drop_absolute > BLINK_MIN_ABSOLUTE_EAR_DROP and 
        ear_drop_percentage > 0):
        blink_in_progress = True
        blink_start_time = current_time
        max_drop_percentage = ear_drop_percentage
        return False, {"baseline": current_baseline_ear, "drop": ear_drop_percentage, "phase": "start", "threshold": adaptive_threshold}
    
    # Track maximum drop and validate blink completion
    elif blink_in_progress:
        if ear_drop_percentage > max_drop_percentage:
            max_drop_percentage = ear_drop_percentage
        
        blink_duration = current_time - blink_start_time
        
        # End blink when eye recovers or duration exceeds limit
        if current_ear > current_baseline_ear * BLINK_RECOVERY_THRESHOLD or blink_duration > BLINK_DURATION_MAX:
            # Only register as valid blink if both percentage and absolute drop thresholds are met
            if (BLINK_DURATION_MIN <= blink_duration <= BLINK_DURATION_MAX and 
                max_drop_percentage > adaptive_threshold and
                (current_baseline_ear * max_drop_percentage) > BLINK_MIN_ABSOLUTE_EAR_DROP):
                if (current_time - last_blink_time) > BLINK_COOLDOWN:
                    last_blink_time = current_time
                    blink_in_progress = False
                    
                    # Calculate the actual EAR value at maximum drop for accurate reporting
                    max_drop_ear = current_baseline_ear * (1 - max_drop_percentage)
                    
                    return True, {
                        "baseline": current_baseline_ear,
                        "drop": max_drop_percentage,
                        "max_drop_ear": max_drop_ear,
                        "duration": blink_duration,
                        "phase": "complete",
                        "threshold": adaptive_threshold
                    }
            
            blink_in_progress = False
            max_drop_percentage = 0.0
    
    return False, {"baseline": current_baseline_ear, "drop": ear_drop_percentage, "phase": "monitoring", "threshold": adaptive_threshold}

def reset_blink_detection():
    global baseline_ear_values, current_baseline_ear, blink_in_progress, blink_start_time, last_blink_time, baseline_smoothing_factor, max_drop_percentage
    baseline_ear_values.clear()
    current_baseline_ear = 0.0
    blink_in_progress = False
    blink_start_time = 0.0
    last_blink_time = 0.0
    baseline_smoothing_factor = 0.3
    max_drop_percentage = 0.0

def find_available_camera():
    print(json.dumps({"debug": "Starting camera detection..."}))
    sys.stdout.flush()
    
    # Platform-specific backends for maximum compatibility
    if sys.platform == "win32":
        backends = [cv2.CAP_DSHOW, cv2.CAP_MSMF, cv2.CAP_ANY]
    elif sys.platform == "darwin":
        backends = [cv2.CAP_AVFOUNDATION, cv2.CAP_ANY]
    else:
        backends = [cv2.CAP_V4L2, cv2.CAP_ANY]
    
    for backend in backends:
        print(json.dumps({"debug": f"Testing backend: {backend}"}))
        sys.stdout.flush()
        
        for i in range(5):
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
    global cap, CAMERA_ACTIVE
    
    print(json.dumps({"debug": "start_camera() called"}))
    sys.stdout.flush()
    
    if CAMERA_ACTIVE:
        print(json.dumps({"debug": "Camera already active"}))
        sys.stdout.flush()
        return True
    
    # Retry logic for robust camera initialization
    max_retries = 10  
    retry_delay = 2   
    for attempt in range(max_retries):
        print(json.dumps({"debug": f"Camera start attempt {attempt + 1}/{max_retries}"}))
        sys.stdout.flush()
        
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
        
        try:
            cap = cv2.VideoCapture(camera_index, backend)
            
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
            
            cap.set(cv2.CAP_PROP_FRAME_WIDTH, processing_resolution[0])
            cap.set(cv2.CAP_PROP_FRAME_HEIGHT, processing_resolution[1])
            cap.set(cv2.CAP_PROP_FPS, target_fps)
            
            actual_width = cap.get(cv2.CAP_PROP_FRAME_WIDTH)
            actual_height = cap.get(cv2.CAP_PROP_FRAME_HEIGHT)
            actual_fps = cap.get(cv2.CAP_PROP_FPS)
            print(json.dumps({"debug": f"Camera resolution set to: {actual_width}x{actual_height}, FPS: {actual_fps}"}))
            sys.stdout.flush()
            
            CAMERA_ACTIVE = True
            print(json.dumps({"status": "Camera opened successfully"}))
            sys.stdout.flush()
            
            reset_blink_detection()
            
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
    global SEND_VIDEO, target_fps, processing_resolution
    
    while not command_queue.empty():
        try:
            line = command_queue.get_nowait()
            data = json.loads(line)
            
            print(json.dumps({"debug": f"Processing command: {data}"}))
            sys.stdout.flush()
            
            if 'target_fps' in data:
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
    global SEND_VIDEO, CAMERA_ACTIVE, cap, last_blink_display_time
    
    print(json.dumps({"status": "Starting blink detector in standby mode..."}))
    sys.stdout.flush()
    
    detector = dlib.get_frontal_face_detector()
    
    # Model path handling for both development and bundled scenarios
    if getattr(sys, 'frozen', False):
        base_path = sys._MEIPASS
        predictor_path = os.path.join(base_path, 'assets', 'models', 'shape_predictor_68_face_landmarks.dat')
    else:
        app_root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
        predictor_path = os.path.join(app_root, 'electron', 'assets', 'models', 'shape_predictor_68_face_landmarks.dat')
    
    if not os.path.exists(predictor_path):
        print(json.dumps({"error": f"Facial landmark model not found at: {predictor_path}"}))
        sys.exit(1)
    
    predictor = dlib.shape_predictor(predictor_path)
    buffers = PreallocatedBuffers()
    
    print(json.dumps({"status": "Models loaded successfully, ready for camera activation"}))
    print(json.dumps({"debug": "Advanced blink detection with dynamic baseline is active"}))
    sys.stdout.flush()
    
    last_blink_time = time.time()
    frame_count = 0
    last_face_detection_time = 0
    cached_face_data = None
    
    frame_interval = 1.0 / target_fps
    last_frame_time = time.time()
    
    default_face_data = {
        "faceDetected": False,
        "ear": 0.0,
        "blink": False,
        "faceRect": {"x": 0, "y": 0, "width": 0, "height": 0},
        "eyeLandmarks": []
    }
    
    input_handler = threading.Thread(target=input_thread, daemon=True)
    input_handler.start()
    
    try:
        while True:
            process_commands()
            
            if not CAMERA_ACTIVE or cap is None:
                time.sleep(0.1)
                continue
            
            # Frame rate limiting for consistent processing
            current_time = time.time()
            if current_time - last_frame_time < frame_interval:
                time.sleep(0.001)
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
                
                blink_detected, blink_info = detect_blink_advanced(avg_ear, current_time)
                
                # Simplified blink state management to prevent visual flicker
                if blink_detected and blink_info:
                    last_blink_display_time = current_time
                    face_data["blink"] = True
                    
                    # Use the EAR value at maximum drop for more accurate reporting
                    max_drop_ear = blink_info.get("max_drop_ear", avg_ear)
                    
                    print(json.dumps({
                        "blink": True,
                        "ear": float(max_drop_ear), 
                        "baseline": float(blink_info["baseline"]),
                        "drop_percentage": float(blink_info["drop"]),
                        "duration": float(blink_info["duration"]),
                        "time": float(current_time)
                    }))
                    print(json.dumps({
                        "debug": f"Blink detected! Max Drop EAR: {max_drop_ear:.3f}, Baseline: {blink_info['baseline']:.3f}, Drop: {blink_info['drop']:.1%}, Duration: {blink_info['duration']:.3f}s, Absolute Drop: {blink_info['baseline'] - max_drop_ear:.3f}"
                    }))
                    sys.stdout.flush()
                elif (current_time - last_blink_display_time) < BLINK_DISPLAY_DURATION:
                    face_data["blink"] = True
                
                # Provide real-time feedback on detection status
                if blink_info and current_baseline_ear > 0:
                    face_data["baseline"] = float(current_baseline_ear)
                    face_data["blink_phase"] = blink_info.get("phase", "monitoring")
                    
                    # Add debug info for threshold monitoring
                    if blink_info.get("phase") == "monitoring":
                        current_ear_drop_absolute = current_baseline_ear - avg_ear
                        if current_ear_drop_absolute > 0:
                            face_data["ear_drop_absolute"] = float(current_ear_drop_absolute)
                            face_data["ear_drop_percentage"] = float((current_baseline_ear - avg_ear) / current_baseline_ear)
                elif current_baseline_ear == 0:
                    face_data["blink_phase"] = "initializing"
            
            if face_data.get("faceDetected", False):
                print(json.dumps({"faceData": face_data}))
            else:
                print(_cached_json_strings["no_face_data"])
            sys.stdout.flush()
            
            # Stream video for visualization when requested
            if SEND_VIDEO and face_data.get("faceDetected", False):
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