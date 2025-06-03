import cv2
import numpy as np
import time
import json
import sys
import os
import dlib
from pathlib import Path
import select
import base64

# Constants
EAR_THRESHOLD = 0.25  # Default value
BLINK_COOLDOWN = 0.5  # seconds

# Global variables
SEND_VIDEO = False

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

def main():
    global SEND_VIDEO
    
    print(json.dumps({"status": "Starting blink detector..."}))
    sys.stdout.flush()
    
    # Initialize dlib's face detector and facial landmark predictor
    detector = dlib.get_frontal_face_detector()
    
    # Get the model path relative to the app root
    app_root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    predictor_path = os.path.join(app_root, 'electron', 'assets', 'models', 'shape_predictor_68_face_landmarks.dat')
    
    # Check if model exists
    if not os.path.exists(predictor_path):
        print(json.dumps({"error": "Facial landmark model not found. Please ensure the model file is present in electron/assets/models/"}))
        sys.exit(1)
    
    predictor = dlib.shape_predictor(predictor_path)
    
    # Initialize video capture
    cap = cv2.VideoCapture(0)
    if not cap.isOpened():
        print(json.dumps({"error": "Failed to open camera"}))
        sys.exit(1)
    
    print(json.dumps({"status": "Camera opened successfully"}))
    sys.stdout.flush()
    
    # Set resolution
    cap.set(cv2.CAP_PROP_FRAME_WIDTH, 640)
    cap.set(cv2.CAP_PROP_FRAME_HEIGHT, 480)
    
    last_blink_time = time.time()
    current_ear_threshold = EAR_THRESHOLD
    frame_count = 0
    
    try:
        while True:
            # Check for new threshold value from stdin
            if sys.stdin in select.select([sys.stdin], [], [], 0)[0]:
                try:
                    line = sys.stdin.readline()
                    if line:
                        data = json.loads(line)
                        if 'ear_threshold' in data:
                            current_ear_threshold = float(data['ear_threshold'])
                            print(json.dumps({"status": f"Updated EAR threshold to {current_ear_threshold}"}))
                            sys.stdout.flush()
                        elif 'request_video' in data:
                            SEND_VIDEO = True
                            print(json.dumps({"status": "Video streaming enabled"}))
                            sys.stdout.flush()
                except json.JSONDecodeError:
                    pass
                except Exception as e:
                    print(json.dumps({"error": f"Error processing input: {str(e)}"}))
                    sys.stdout.flush()
            
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
        cap.release()
        print(json.dumps({"status": "Camera released"}))
        sys.stdout.flush()

if __name__ == "__main__":
    main() 