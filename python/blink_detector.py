import cv2
import numpy as np
import time
import json
import sys
import os
import dlib
from pathlib import Path

# Constants
EAR_THRESHOLD = 0.25
BLINK_COOLDOWN = 0.5  # seconds

def calculate_ear(eye_points):
    # Calculate the vertical distances
    vertical_dist1 = np.linalg.norm(eye_points[1] - eye_points[5])
    vertical_dist2 = np.linalg.norm(eye_points[2] - eye_points[4])
    # Calculate the horizontal distance
    horizontal_dist = np.linalg.norm(eye_points[0] - eye_points[3])
    # Compute the eye aspect ratio
    ear = (vertical_dist1 + vertical_dist2) / (2.0 * horizontal_dist)
    return ear

def main():
    print(json.dumps({"status": "Starting blink detector..."}))
    sys.stdout.flush()
    
    # Initialize dlib's face detector and facial landmark predictor
    detector = dlib.get_frontal_face_detector()
    predictor_path = os.path.join(os.path.dirname(__file__), 'shape_predictor_68_face_landmarks.dat')
    
    # Download the facial landmark predictor if it doesn't exist
    if not os.path.exists(predictor_path):
        print(json.dumps({"status": "Downloading facial landmark predictor..."}))
        sys.stdout.flush()
        import urllib.request
        url = "http://dlib.net/files/shape_predictor_68_face_landmarks.dat.bz2"
        urllib.request.urlretrieve(url, predictor_path + ".bz2")
        import bz2
        with bz2.open(predictor_path + ".bz2", 'rb') as source, open(predictor_path, 'wb') as dest:
            dest.write(source.read())
        os.remove(predictor_path + ".bz2")
    
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
    
    try:
        while True:
            ret, frame = cap.read()
            if not ret:
                print(json.dumps({"error": "Failed to read frame"}))
                break
            
            # Convert to grayscale
            gray = cv2.cvtColor(frame, cv2.COLOR_BGR2GRAY)
            
            # Detect faces using dlib
            faces = detector(gray, 0)
            
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
                
                # Check for blink
                if avg_ear < EAR_THRESHOLD and (current_time - last_blink_time) > BLINK_COOLDOWN:
                    last_blink_time = current_time
                    print(json.dumps({
                        "blink": True,
                        "ear": avg_ear,
                        "time": current_time
                    }))
                    sys.stdout.flush()
            
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