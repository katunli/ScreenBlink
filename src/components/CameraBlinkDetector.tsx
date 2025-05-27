import React, { useEffect, useRef, useState } from 'react';
import { FaceMesh } from '@mediapipe/face_mesh';
import { Camera } from '@mediapipe/camera_utils';

interface CameraBlinkDetectorProps {
  isEnabled: boolean;
  onBlinkDetected: () => void;
  onError: (error: string) => void;
}

const EAR_THRESHOLD = 0.25; // Eye Aspect Ratio threshold for blink detection
const BLINK_COOLDOWN = 500; // Minimum time between blink detections in ms
const PROCESSING_INTERVAL = 100; // Process frames every 100ms (10 FPS)
const CAMERA_WIDTH = 320; // Reduced resolution
const CAMERA_HEIGHT = 240; // Reduced resolution

// Create a single instance of FaceMesh that will be reused
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

export const CameraBlinkDetector: React.FC<CameraBlinkDetectorProps> = ({
  isEnabled,
  onBlinkDetected,
  onError,
}) => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [isInitialized, setIsInitialized] = useState(false);
  const lastBlinkTimeRef = useRef<number>(0);
  const lastProcessTimeRef = useRef<number>(0);
  const cleanupInProgressRef = useRef(false);
  const cameraRef = useRef<Camera | null>(null);
  const frameRequestRef = useRef<number | null>(null);

  // Cleanup function to properly dispose of resources
  const cleanup = async () => {
    // Prevent concurrent cleanup attempts
    if (cleanupInProgressRef.current) {
      return;
    }

    cleanupInProgressRef.current = true;

    try {
      // Cancel any pending frame requests
      if (frameRequestRef.current) {
        cancelAnimationFrame(frameRequestRef.current);
        frameRequestRef.current = null;
      }

      // Stop the camera first
      if (cameraRef.current) {
        try {
          cameraRef.current.stop();
        } catch (error) {
          console.error('Camera cleanup error:', error);
        }
        cameraRef.current = null;
      }

      setIsInitialized(false);
    } catch (error) {
      console.error('Cleanup error:', error);
    } finally {
      cleanupInProgressRef.current = false;
    }
  };

  // Initialize Camera and setup FaceMesh
  const initialize = async () => {
    try {
      // Clean up any existing instances first
      await cleanup();

      if (!videoRef.current) {
        throw new Error('Video element not found');
      }

      // Set up FaceMesh results handler
      faceMesh.onResults((results) => {
        if (results.multiFaceLandmarks && isEnabled) {
          for (const landmarks of results.multiFaceLandmarks) {
            const ear = calculateEAR(landmarks);
            const now = Date.now();
            if (ear < EAR_THRESHOLD && now - lastBlinkTimeRef.current > BLINK_COOLDOWN) {
              lastBlinkTimeRef.current = now;
              onBlinkDetected();
            }
          }
        }
      });

      // Create new Camera instance with optimized settings
      const camera = new Camera(videoRef.current, {
        onFrame: async () => {
          const now = Date.now();
          // Only process frames at the specified interval
          if (now - lastProcessTimeRef.current >= PROCESSING_INTERVAL) {
            lastProcessTimeRef.current = now;
            
            if (videoRef.current && isEnabled) {
              try {
                await faceMesh.send({ image: videoRef.current });
              } catch (error) {
                console.error('Frame processing error:', error);
              }
            }
          }
        },
        width: CAMERA_WIDTH,
        height: CAMERA_HEIGHT,
      });

      // Store the camera reference
      cameraRef.current = camera;

      // Start the camera
      await camera.start();
      setIsInitialized(true);
    } catch (error) {
      console.error('Initialization error:', error);
      onError('Failed to initialize camera and face detection');
      await cleanup();
    }
  };

  // Effect to handle initialization and cleanup based on isEnabled
  useEffect(() => {
    let isActive = true;

    const setup = async () => {
      if (!isEnabled) {
        await cleanup();
        return;
      }

      if (!isInitialized) {
        await initialize();
      }
    };

    setup();

    return () => {
      isActive = false;
      cleanup();
    };
  }, [isEnabled]);

  // Calculate Eye Aspect Ratio (EAR)
  const calculateEAR = (landmarks: any) => {
    const leftEye = [33, 160, 158, 133, 153, 144];
    const rightEye = [362, 385, 387, 263, 373, 380];

    const getEAR = (eyeIndices: number[]) => {
      const p1 = landmarks[eyeIndices[0]];
      const p2 = landmarks[eyeIndices[1]];
      const p3 = landmarks[eyeIndices[2]];
      const p4 = landmarks[eyeIndices[3]];
      const p5 = landmarks[eyeIndices[4]];
      const p6 = landmarks[eyeIndices[5]];

      const d1 = Math.sqrt(Math.pow(p2.x - p6.x, 2) + Math.pow(p2.y - p6.y, 2));
      const d2 = Math.sqrt(Math.pow(p3.x - p5.x, 2) + Math.pow(p3.y - p5.y, 2));
      const d3 = Math.sqrt(Math.pow(p1.x - p4.x, 2) + Math.pow(p1.y - p4.y, 2));

      return (d1 + d2) / (2.0 * d3);
    };

    const leftEAR = getEAR(leftEye);
    const rightEAR = getEAR(rightEye);

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