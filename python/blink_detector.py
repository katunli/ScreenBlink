import base64
import json
import queue
import sys
import threading
import time
from collections import deque

import cv2
import numpy as np


TARGET_FPS = 10
PROCESSING_RESOLUTION = (320, 240)
BLINK_COOLDOWN = 0.35
BASELINE_WINDOW_SIZE = 20

SEND_VIDEO = False
CAMERA_ACTIVE = False
cap = None
command_queue = queue.Queue()
target_fps = TARGET_FPS
processing_resolution = PROCESSING_RESOLUTION

baseline_values = deque(maxlen=BASELINE_WINDOW_SIZE)
baseline_openness = 0.0
blink_in_progress = False
blink_start_time = 0.0
last_blink_time = 0.0

face_cascade = cv2.CascadeClassifier(
    cv2.data.haarcascades + "haarcascade_frontalface_default.xml"
)
eye_cascade = cv2.CascadeClassifier(
    cv2.data.haarcascades + "haarcascade_eye_tree_eyeglasses.xml"
)
if eye_cascade.empty():
    eye_cascade = cv2.CascadeClassifier(cv2.data.haarcascades + "haarcascade_eye.xml")


def emit(data):
    print(json.dumps(data), flush=True)


def default_face_data():
    return {
        "faceDetected": False,
        "ear": 0.0,
        "blink": False,
        "faceRect": {"x": 0, "y": 0, "width": 0, "height": 0},
        "eyeLandmarks": [],
        "blink_phase": "no_face",
    }


def encode_frame(frame):
    ok, buffer = cv2.imencode(".jpg", frame, [cv2.IMWRITE_JPEG_QUALITY, 70])
    if not ok:
        return None
    return base64.b64encode(buffer).decode("utf-8")


def find_available_camera():
    emit({"debug": "Starting camera detection..."})
    backends = (
        [cv2.CAP_DSHOW, cv2.CAP_MSMF, cv2.CAP_ANY]
        if sys.platform == "win32"
        else [cv2.CAP_AVFOUNDATION, cv2.CAP_ANY]
        if sys.platform == "darwin"
        else [cv2.CAP_V4L2, cv2.CAP_ANY]
    )

    for backend in backends:
        for index in range(5):
            test = cv2.VideoCapture(index, backend)
            if test.isOpened():
                ok, frame = test.read()
                test.release()
                if ok and frame is not None:
                    emit({"status": f"Found working camera at index {index}"})
                    return index, backend
            else:
                test.release()

    return None, None


def start_camera():
    global CAMERA_ACTIVE, cap

    if CAMERA_ACTIVE:
        return True

    for attempt in range(10):
        camera_index, backend = find_available_camera()
        if camera_index is None:
            emit({"debug": f"No camera found on attempt {attempt + 1}/10"})
            time.sleep(1)
            continue

        cap = cv2.VideoCapture(camera_index, backend)
        if not cap.isOpened():
            time.sleep(1)
            continue

        cap.set(cv2.CAP_PROP_FRAME_WIDTH, processing_resolution[0])
        cap.set(cv2.CAP_PROP_FRAME_HEIGHT, processing_resolution[1])
        cap.set(cv2.CAP_PROP_FPS, target_fps)

        ok, _ = cap.read()
        if ok:
            reset_blink_detection()
            CAMERA_ACTIVE = True
            emit({"status": "Camera opened successfully"})
            return True

        cap.release()
        cap = None
        time.sleep(1)

    emit({"error": "No working camera found. Check camera permissions and close other apps using the camera."})
    return False


def stop_camera():
    global CAMERA_ACTIVE, cap
    if cap is not None:
        cap.release()
        cap = None
    CAMERA_ACTIVE = False
    emit({"status": "Camera released"})


def reset_blink_detection():
    global baseline_openness, blink_in_progress, blink_start_time, last_blink_time
    baseline_values.clear()
    baseline_openness = 0.0
    blink_in_progress = False
    blink_start_time = 0.0
    last_blink_time = 0.0


def normalized_rect(x, y, w, h, frame_w, frame_h):
    return {
        "x": float(max(0, x) / frame_w),
        "y": float(max(0, y) / frame_h),
        "width": float(max(0, w) / frame_w),
        "height": float(max(0, h) / frame_h),
    }


def eye_landmark_box(x, y, w, h, frame_w, frame_h):
    points = [
        (x, y + h * 0.5),
        (x + w * 0.25, y + h * 0.2),
        (x + w * 0.75, y + h * 0.2),
        (x + w, y + h * 0.5),
        (x + w * 0.75, y + h * 0.8),
        (x + w * 0.25, y + h * 0.8),
    ]
    return [{"x": float(px / frame_w), "y": float(py / frame_h)} for px, py in points]


def detect_face_and_eyes(frame):
    gray = cv2.cvtColor(frame, cv2.COLOR_BGR2GRAY)
    gray = cv2.equalizeHist(gray)
    frame_h, frame_w = gray.shape[:2]

    faces = face_cascade.detectMultiScale(
        gray,
        scaleFactor=1.1,
        minNeighbors=5,
        minSize=(60, 60),
    )
    if len(faces) == 0:
        return default_face_data(), 0.0, 0

    x, y, w, h = max(faces, key=lambda face: face[2] * face[3])
    upper_face = gray[y : y + int(h * 0.62), x : x + w]
    eyes = eye_cascade.detectMultiScale(
        upper_face,
        scaleFactor=1.08,
        minNeighbors=4,
        minSize=(18, 10),
    )

    eye_boxes = []
    for ex, ey, ew, eh in eyes:
        abs_x = x + ex
        abs_y = y + ey
        if abs_y > y + h * 0.68:
            continue
        eye_boxes.append((abs_x, abs_y, ew, eh))

    eye_boxes = sorted(eye_boxes, key=lambda item: item[2] * item[3], reverse=True)[:2]
    eye_boxes = sorted(eye_boxes, key=lambda item: item[0])

    if eye_boxes:
        openness = float(np.mean([eh / max(ew, 1) for _, _, ew, eh in eye_boxes]))
    else:
        openness = 0.0

    landmarks = []
    for box in eye_boxes:
        landmarks.extend(eye_landmark_box(*box, frame_w, frame_h))

    face_data = {
        "faceDetected": True,
        "ear": openness,
        "blink": False,
        "faceRect": normalized_rect(x, y, w, h, frame_w, frame_h),
        "eyeLandmarks": landmarks,
        "blink_phase": "monitoring",
    }
    return face_data, openness, len(eye_boxes)


def update_blink_state(face_data, openness, eye_count):
    global baseline_openness, blink_in_progress, blink_start_time, last_blink_time

    now = time.time()
    blink_detected = False

    if face_data["faceDetected"] and eye_count >= 2 and openness > 0:
        if not blink_in_progress:
            baseline_values.append(openness)
        if len(baseline_values) >= 5:
            baseline_openness = float(np.median(list(baseline_values)))

    if not face_data["faceDetected"] or baseline_openness <= 0:
        face_data["baseline"] = baseline_openness
        return False

    closed_enough = eye_count < 2 or openness < baseline_openness * 0.58
    recovered = eye_count >= 2 and openness > baseline_openness * 0.72

    if closed_enough and not blink_in_progress and now - last_blink_time > BLINK_COOLDOWN:
        blink_in_progress = True
        blink_start_time = now
        face_data["blink_phase"] = "start"
    elif blink_in_progress:
        face_data["blink_phase"] = "closed"
        if recovered or now - blink_start_time > 0.7:
            duration = now - blink_start_time
            blink_in_progress = False
            if 0.05 <= duration <= 0.7 and now - last_blink_time > BLINK_COOLDOWN:
                blink_detected = True
                last_blink_time = now
                face_data["blink"] = True
                face_data["blink_phase"] = "complete"
                emit({
                    "blink": True,
                    "ear": openness,
                    "baseline": baseline_openness,
                    "drop_percentage": max(0.0, (baseline_openness - openness) / baseline_openness),
                    "duration": duration,
                    "time": now,
                })

    face_data["baseline"] = baseline_openness
    face_data["ear_drop_percentage"] = (
        max(0.0, (baseline_openness - openness) / baseline_openness)
        if baseline_openness > 0
        else 0.0
    )
    return blink_detected


def input_thread():
    emit({"debug": "Input thread started"})
    while True:
        line = sys.stdin.readline()
        if not line:
            time.sleep(0.05)
            continue
        command_queue.put(line.strip())


def process_commands():
    global SEND_VIDEO, target_fps, processing_resolution

    while not command_queue.empty():
        try:
            data = json.loads(command_queue.get_nowait())
            if "target_fps" in data:
                target_fps = max(1, int(data["target_fps"]))
                if CAMERA_ACTIVE and cap is not None:
                    cap.set(cv2.CAP_PROP_FPS, target_fps)
            elif "processing_resolution" in data:
                width, height = data["processing_resolution"]
                processing_resolution = (int(width), int(height))
            elif "request_video" in data:
                SEND_VIDEO = True
                emit({"status": "Video streaming enabled"})
            elif "start_camera" in data:
                if start_camera():
                    emit({"status": "Camera started successfully"})
                else:
                    emit({"error": "Failed to start camera"})
            elif "stop_camera" in data:
                stop_camera()
                SEND_VIDEO = False
        except Exception as error:
            emit({"debug": f"Command processing error: {error}"})


def main():
    global cap

    if face_cascade.empty() or eye_cascade.empty():
        emit({"error": "OpenCV Haar cascade files are missing"})
        sys.exit(1)

    emit({"status": "Starting blink detector in standby mode..."})
    emit({"status": "Models loaded successfully, ready for camera activation"})
    emit({"debug": "OpenCV Haar blink detector is active"})

    threading.Thread(target=input_thread, daemon=True).start()
    last_frame_time = 0.0

    try:
        while True:
            process_commands()

            if not CAMERA_ACTIVE or cap is None:
                time.sleep(0.05)
                continue

            frame_interval = 1.0 / max(1, target_fps)
            now = time.time()
            if now - last_frame_time < frame_interval:
                time.sleep(0.002)
                continue
            last_frame_time = now

            ok, frame = cap.read()
            if not ok or frame is None:
                emit({"error": "Failed to read frame from camera"})
                time.sleep(0.1)
                continue

            if frame.shape[1] != processing_resolution[0] or frame.shape[0] != processing_resolution[1]:
                frame = cv2.resize(frame, processing_resolution)

            face_data, openness, eye_count = detect_face_and_eyes(frame)
            update_blink_state(face_data, openness, eye_count)
            emit({"faceData": face_data})

            if SEND_VIDEO:
                display_frame = cv2.resize(frame, (640, 480))
                encoded = encode_frame(display_frame)
                if encoded:
                    emit({"videoStream": encoded})
    except KeyboardInterrupt:
        emit({"status": "Stopping blink detector..."})
    finally:
        stop_camera()


if __name__ == "__main__":
    main()
