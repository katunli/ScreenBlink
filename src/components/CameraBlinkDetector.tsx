import React, { useEffect, useRef } from 'react';
import { FaceMesh } from '@mediapipe/face_mesh';
import { Camera } from '@mediapipe/camera_utils';

interface CameraBlinkDetectorProps {
  isEnabled: boolean;
  onBlinkDetected: () => void;
  onError: (error: string) => void;
}

const EAR_THRESHOLD = 0.25; // Eye Aspect Ratio threshold for blink detection
const BLINK_COOLDOWN = 500; // Minimum time between blink detections in ms

export const CameraBlinkDetector: React.FC<CameraBlinkDetectorProps> = ({
  isEnabled,
  onBlinkDetected,
  onError,
}) => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const faceMeshRef = useRef<FaceMesh | null>(null);
  const cameraRef = useRef<Camera | null>(null);
  const lastBlinkTimeRef = useRef<number>(0);

  // Initialize MediaPipe Face Mesh
  useEffect(() => {
    const initializeFaceMesh = async () => {
      try {
        const faceMesh = new FaceMesh({
          locateFile: (file) => {
            return `https://cdn.jsdelivr.net/npm/@mediapipe/face_mesh/${file}`;
          },
        });

        faceMesh.setOptions({
          maxNumFaces: 1,
          refineLandmarks: true,
          minDetectionConfidence: 0.5,
          minTrackingConfidence: 0.5,
        });

        faceMesh.onResults((results) => {
          if (results.multiFaceLandmarks && isEnabled) {
            for (const landmarks of results.multiFaceLandmarks) {
              // Calculate Eye Aspect Ratio (EAR)
              const ear = calculateEAR(landmarks);
              
              // Detect blink
              const now = Date.now();
              if (ear < EAR_THRESHOLD && now - lastBlinkTimeRef.current > BLINK_COOLDOWN) {
                lastBlinkTimeRef.current = now;
                onBlinkDetected();
              }
            }
          }
        });

        faceMeshRef.current = faceMesh;
      } catch (error) {
        onError('Failed to initialize face detection');
        console.error('Face mesh initialization error:', error);
      }
    };

    initializeFaceMesh();

    return () => {
      if (faceMeshRef.current) {
        faceMeshRef.current.close();
      }
    };
  }, [onBlinkDetected, onError]);

  // Handle camera initialization and cleanup based on isEnabled
  useEffect(() => {
    // If eye tracking is disabled, ensure camera is stopped and cleaned up
    if (!isEnabled) {
      if (cameraRef.current) {
        cameraRef.current.stop();
        cameraRef.current = null;
      }
      return;
    }

    // Only proceed with camera initialization if eye tracking is enabled
    const initializeCamera = async () => {
      if (!isEnabled || !videoRef.current || !faceMeshRef.current) {
        return;
      }

      try {
        const camera = new Camera(videoRef.current, {
          onFrame: async () => {
            if (videoRef.current && isEnabled) {
              await faceMeshRef.current?.send({ image: videoRef.current });
            }
          },
          width: 640,
          height: 480,
        });
        cameraRef.current = camera;
        await camera.start();
      } catch (error) {
        onError('Failed to initialize camera');
        console.error('Camera initialization error:', error);
      }
    };

    initializeCamera();

    return () => {
      if (cameraRef.current) {
        cameraRef.current.stop();
        cameraRef.current = null;
      }
    };
  }, [isEnabled, onError]);

  // Calculate Eye Aspect Ratio (EAR)
  const calculateEAR = (landmarks: any) => {
    // Indices for the eye landmarks
    const leftEye = [33, 160, 158, 133, 153, 144];
    const rightEye = [362, 385, 387, 263, 373, 380];

    const getEAR = (eyeIndices: number[]) => {
      const p1 = landmarks[eyeIndices[0]];
      const p2 = landmarks[eyeIndices[1]];
      const p3 = landmarks[eyeIndices[2]];
      const p4 = landmarks[eyeIndices[3]];
      const p5 = landmarks[eyeIndices[4]];
      const p6 = landmarks[eyeIndices[5]];

      // Calculate distances
      const d1 = Math.sqrt(Math.pow(p2.x - p6.x, 2) + Math.pow(p2.y - p6.y, 2));
      const d2 = Math.sqrt(Math.pow(p3.x - p5.x, 2) + Math.pow(p3.y - p5.y, 2));
      const d3 = Math.sqrt(Math.pow(p1.x - p4.x, 2) + Math.pow(p1.y - p4.y, 2));

      // Calculate EAR
      return (d1 + d2) / (2.0 * d3);
    };

    const leftEAR = getEAR(leftEye);
    const rightEAR = getEAR(rightEye);

    // Return average EAR
    return (leftEAR + rightEAR) / 2.0;
  };

  return (
    <video
      ref={videoRef}
      className="hidden"
      playsInline
    />
  );
}; 