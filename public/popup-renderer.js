// Common popup functionality with CSS variables for dynamic theming

// Update colors using CSS variables instead of inline styles
function updateColors(colors) {
  if (colors.background) {
    document.documentElement.style.setProperty('--popup-bg-color', colors.background);
  }
  if (colors.text) {
    document.documentElement.style.setProperty('--popup-text-color', colors.text);
  }
}

// Update message text
function updateMessage(message) {
  const blinkElement = document.getElementById('blink');
  if (blinkElement) {
    blinkElement.textContent = message;
  }
}

// Update camera mode
function updateCameraMode(isEnabled) {
  const blinkElement = document.getElementById('blink');
  if (blinkElement) {
    if (isEnabled) {
      blinkElement.classList.add('camera-mode');
    } else {
      blinkElement.classList.remove('camera-mode');
    }
  }
}

// Exercise popup functions
function skipExercise() {
  window.popupAPI.skipExercise();
  window.close();
}

function snoozeExercise() {
  window.popupAPI.snoozeExercise();
  window.close();
}

// Initialize exercise popup
function initExercisePopup() {
  const exercises = [
    "Close your eyes and gently roll them in a circular motion for 10 seconds. Then reverse direction.",
    "Close your eyes and look up and down slowly 5 times, then left and right 5 times.",
    "Take a deep breath and yawn naturally a few times to help lubricate your eyes.",
    "Take a break and look at something 20 feet away for 20 seconds."
  ];

  let currentExerciseIndex = parseInt(localStorage.getItem('currentExerciseIndex') || '0');
  
  let currentExercise = exercises[currentExerciseIndex];
  const exerciseElement = document.getElementById('exercise');
  if (exerciseElement) {
    exerciseElement.textContent = currentExercise;
  }
  
  currentExerciseIndex = (currentExerciseIndex + 1) % exercises.length;
  localStorage.setItem('currentExerciseIndex', currentExerciseIndex.toString());
  
  // Add event listeners for buttons
  const skipBtn = document.querySelector('.exercise-button.skip');
  const snoozeBtn = document.querySelector('.exercise-button.snooze');
  
  if (skipBtn) {
    skipBtn.addEventListener('click', skipExercise);
  }
  
  if (snoozeBtn) {
    snoozeBtn.addEventListener('click', snoozeExercise);
  }
}

// Camera window functions
let lastFaceData = null;
let lastBlinkTime = 0;
let blinkDisplayTimer = null;
let currentThreshold = 0.20;
let thresholdUpdateTimer = null;

function updateInfoDisplay(eyeSize, isBlinking = false) {
  const info = document.getElementById('info');
  const currentValues = document.getElementById('current-values');
  
  if (info) {
    info.innerHTML = `
      Your eye size is continously being calculated, once it drops significantly below your baseline (average eye size) a blink is detected
    `;
    info.style.background = isBlinking ? 'rgba(0, 255, 0, 0.5)' : 'rgba(0, 0, 0, 0.4)';
  }

  if (currentValues) {
    const eyeSizeText = eyeSize !== null ? eyeSize.toFixed(3) : '0.000';
    currentValues.innerHTML = `
      <strong>Current:</strong> Eye size: ${eyeSizeText}
      <br>
      <strong>Baseline:</strong> ${lastFaceData && lastFaceData.baseline ? lastFaceData.baseline.toFixed(3) : 'Building...'}
      <br>
      <strong>Status:</strong> ${lastFaceData && lastFaceData.blink_phase ? lastFaceData.blink_phase : 'monitoring'}
    `;
    currentValues.style.background = isBlinking ? 'rgba(0, 255, 0, 0.5)' : 'rgba(0, 0, 0, 0.4)';
  }
}

function resetBlinkDisplay() {
  if (lastFaceData && lastFaceData.faceDetected) {
    const eyeSize = lastFaceData.ear || 0;
    const status = document.getElementById('status');
    if (status) {
      status.textContent = 'Eye size: ' + eyeSize.toFixed(3);
      status.style.background = 'rgba(0, 0, 0, 0.4)';
    }
    updateInfoDisplay(eyeSize);
  }
}

function drawOverlays(faceData) {
  const canvas = document.getElementById('canvas');
  if (!canvas || !faceData) return;
  
  const ctx = canvas.getContext('2d');
  if (faceData.faceDetected) {
    ctx.save();
    ctx.strokeStyle = '#00FF00';
    ctx.lineWidth = 2;
    
    // Draw face rectangle
    ctx.strokeRect(
      faceData.faceRect.x * canvas.width,
      faceData.faceRect.y * canvas.height,
      faceData.faceRect.width * canvas.width,
      faceData.faceRect.height * canvas.height
    );
    
    // Draw eye landmarks
    if (faceData.eyeLandmarks) {
      ctx.fillStyle = '#00FF00';
      faceData.eyeLandmarks.forEach(point => {
        ctx.beginPath();
        ctx.arc(
          point.x * canvas.width,
          point.y * canvas.height,
          2,
          0,
          Math.PI * 2
        );
        ctx.fill();
      });
    }
    ctx.restore();
    
    // Check if we should still be showing blink detection
    const timeSinceLastBlink = Date.now() - lastBlinkTime;
    const shouldShowBlink = timeSinceLastBlink < 350; 
    
    // Update status with simple language
    const eyeSize = faceData.ear || 0;
    const isBlinking = faceData.blink || shouldShowBlink;
    
    const status = document.getElementById('status');
    if (status) {
      status.textContent = isBlinking ? 'BLINK DETECTED!' : 'Eye size: ' + eyeSize.toFixed(3);
      status.style.background = isBlinking ? 'rgba(0, 255, 0, 0.5)' : 'rgba(0, 0, 0, 0.4)';
    }
    
    // Update info box
    updateInfoDisplay(eyeSize, isBlinking);
  } else {
    const status = document.getElementById('status');
    if (status) {
      status.textContent = 'No face detected';
      status.style.background = 'rgba(255, 0, 0, 0.5)';
    }
    updateInfoDisplay(null);
  }
}

// Popup editor functions
function updateSizeDisplay() {
  const sizeDisplay = document.getElementById('sizeDisplay');
  if (sizeDisplay) {
    const width = Math.round(window.innerWidth);
    const height = Math.round(window.innerHeight);
    sizeDisplay.textContent = `Width: ${width}px, Height: ${height}px`;
  }
}

function savePopupEditor() {
  const size = {
    width: Math.round(window.innerWidth),
    height: Math.round(window.innerHeight)
  };
  const position = {
    x: Math.round(window.screenX),
    y: Math.round(window.screenY)
  };
  window.popupAPI.savePopupEditor({ size, position });
  window.close();
}

function cancelPopupEditor() {
  window.close();
}

// Initialize popup editor
function initPopupEditor() {
  updateSizeDisplay();
  
  // Add event listeners for buttons
  const saveBtn = document.getElementById('saveBtn');
  const cancelBtn = document.getElementById('cancelBtn');
  
  if (saveBtn) {
    saveBtn.addEventListener('click', savePopupEditor);
  }
  
  if (cancelBtn) {
    cancelBtn.addEventListener('click', cancelPopupEditor);
  }
  
  // Add keyboard event listeners
  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') {
      event.preventDefault();
      cancelPopupEditor();
    } else if (event.key === 'Enter') {
      event.preventDefault();
      savePopupEditor();
    }
  });
  
  // Listen for window resize
  window.addEventListener('resize', updateSizeDisplay);
  
  // Show drag indicator on mouse down (but not on resize handles)
  let isDragging = false;
  let isOverResizeHandle = false;
  
  document.addEventListener('mousedown', (event) => {
    // Check if the click is on a resize handle
    const target = event.target;
    if (target.classList.contains('resize-handle') || target.classList.contains('corner-indicator')) {
      isOverResizeHandle = true;
      return;
    }
    
    if (!isDragging && !isOverResizeHandle) {
      const dragIndicator = document.getElementById('dragIndicator');
      if (dragIndicator) {
        dragIndicator.classList.add('show');
        setTimeout(() => {
          dragIndicator.classList.remove('show');
        }, 2000);
      }
    }
  });
  
  // Track when mouse enters/leaves resize handles
  const resizeHandles = document.querySelectorAll('.resize-handle');
  resizeHandles.forEach(handle => {
    handle.addEventListener('mouseenter', () => {
      isOverResizeHandle = true;
    });
    
    handle.addEventListener('mouseleave', () => {
      isOverResizeHandle = false;
    });
  });
}

// Sound player functions
function initSoundPlayer() {
  window.popupAPI.onPlaySound((soundPath) => {
    console.log('Sound player received path:', soundPath);
    const audio = document.getElementById('audio');
    if (audio) {
      audio.src = soundPath;
      
      // Listen for when audio finishes playing
      audio.addEventListener('ended', () => {
        window.popupAPI.notifyAudioFinished();
      });
      
      audio.play().catch(error => {
        console.error('Error playing sound:', error);
        // If there's an error, still notify that we're done
        window.popupAPI.notifyAudioFinished();
      });
    }
  });
}

// Initialize based on popup type
function initPopup() {
  // Set initial colors
  updateColors({
    background: '#1E1E1E',
    text: '#FFFFFF',
    transparency: 0.3
  });
  
  // Initialize based on popup type
  if (document.getElementById('exercise')) {
    initExercisePopup();
  } else if (document.getElementById('canvas')) {
    // Camera window
    window.popupAPI.onFaceTrackingData((data) => {
      lastFaceData = data;
      
      const timeSinceLastBlink = Date.now() - lastBlinkTime;
      const shouldShowBlink = timeSinceLastBlink < 350;
      
      if (data.faceDetected) {
        const eyeSize = data.ear || 0;
        const isBlinking = data.blink || shouldShowBlink;
        
        const status = document.getElementById('status');
        if (status) {
          status.textContent = isBlinking ? 'BLINK DETECTED!' : 'Eye size: ' + eyeSize.toFixed(3);
          status.style.background = isBlinking ? 'rgba(0, 255, 0, 0.5)' : 'rgba(0, 0, 0, 0.4)';
        }
        
        updateInfoDisplay(eyeSize, isBlinking);
      }
    });

    window.popupAPI.onBlinkDetected((blinkData) => {
      lastBlinkTime = Date.now();
      
      if (blinkDisplayTimer) {
        clearTimeout(blinkDisplayTimer);
      }
      
      if (lastFaceData && lastFaceData.faceDetected) {
        const status = document.getElementById('status');
        if (status) {
          status.textContent = 'BLINK DETECTED!';
          status.style.background = 'rgba(0, 255, 0, 0.5)';
        }
        
        updateInfoDisplay(blinkData.ear, true);
      }
      
      blinkDisplayTimer = setTimeout(resetBlinkDisplay, 350);
    });

    window.popupAPI.onThresholdUpdated((newThreshold) => {
      if (thresholdUpdateTimer) {
        clearTimeout(thresholdUpdateTimer);
      }
      
      thresholdUpdateTimer = setTimeout(() => {
        currentThreshold = newThreshold;
        updateInfoDisplay(lastFaceData ? lastFaceData.ear : null);
      }, 200);
    });

    window.popupAPI.onVideoStream((streamData) => {
      try {
        const canvas = document.getElementById('canvas');
        if (canvas) {
          const ctx = canvas.getContext('2d');
          const img = new window.Image();
          img.onload = function () {
            canvas.width = img.width;
            canvas.height = img.height;
            ctx.drawImage(img, 0, 0, img.width, img.height);
            drawOverlays(lastFaceData);
          };
          img.src = 'data:image/jpeg;base64,' + streamData;
        }
      } catch (error) {
        console.error('Error handling video stream:', error);
        const status = document.getElementById('status');
        if (status) {
          status.textContent = 'Error: Failed to process video stream';
          status.style.background = 'rgba(255, 0, 0, 0.5)';
        }
      }
    });

    window.popupAPI.requestVideoStream();
    updateInfoDisplay(null);
    
  } else if (document.getElementById('sizeDisplay')) {
    // Popup editor
    initPopupEditor();
    
    // Set initial colors for popup editor
    updateColors({
      background: '#FFFFFF',
      text: '#000000',
      transparency: 0.9
    });
    
    window.popupAPI.onPopupEditorUpdate((data) => {
      if (data.type === 'colors') {
        updateColors(data.data);
      } else if (data.type === 'state') {
        updateSizeDisplay();
      }
    });
    
  } else if (document.getElementById('audio')) {
    // Sound player
    initSoundPlayer();
    
  } else {
    // Blink popups (blink, starting, stopped)
    window.popupAPI.onUpdateColors(updateColors);
    window.popupAPI.onUpdateMessage(updateMessage);
    window.popupAPI.onCameraMode(updateCameraMode);
  }
}

// Initialize when DOM is loaded
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initPopup);
} else {
  initPopup();
} 