import { ipcRenderer, contextBridge } from 'electron'

// Expose API to the Renderer process (main window)
contextBridge.exposeInMainWorld('ipcRenderer', {
  on: (channel: string, func: (...args: any[]) => void) => {
    const validChannels = [
      'main-process-message', 
      'load-preferences',
      'camera-error',
      'video-stream',
      'camera-window-closed',
      'update-message',
      'face-tracking-data',
      'blink-detected',
      'threshold-updated'
    ];
    if (validChannels.includes(channel)) {
      ipcRenderer.on(channel, (_event, ...args) => func(...args));
    }
  },
  off(...args: Parameters<typeof ipcRenderer.off>) {
    const [channel, ...omit] = args
    return ipcRenderer.off(channel, ...omit)
  },
  send: (channel: string, ...args: any[]) => {
    const validChannels = [
      'start-blink-reminders',
      'stop-blink-reminders',
      'update-popup-position',
      'update-interval',
      'update-popup-colors',
      'update-popup-transparency',
      'update-dark-mode',
      'update-camera-enabled',
      'update-eye-exercises-enabled',
      'update-exercise-interval',
      'update-popup-message',
      'update-keyboard-shortcut',
      'blink-detected',
      'start-camera-tracking',
      'stop-camera-tracking',
      'skip-exercise',
      'snooze-exercise',
      'update-mgd-mode',
      'show-camera-window',
      'close-camera-window',
      'show-popup-editor',
      'popup-editor-saved',
      'reset-preferences',
      'show-size-editor',
      'size-saved',
      'update-sound-enabled',
      'audio-finished',
      'request-video-stream'
    ];
    if (validChannels.includes(channel)) {
      ipcRenderer.send(channel, ...args);
    }
  },
  invoke(...args: Parameters<typeof ipcRenderer.invoke>) {
    const [channel, ...omit] = args
    return ipcRenderer.invoke(channel, ...omit)
  },
})

// Expose API to popup windows with proper security
contextBridge.exposeInMainWorld('popupAPI', {
  // For blink popups
  onUpdateColors: (callback: (colors: any) => void) => {
    ipcRenderer.on('update-colors', (_event, colors) => callback(colors));
  },
  onUpdateMessage: (callback: (message: string) => void) => {
    ipcRenderer.on('update-message', (_event, message) => callback(message));
  },
  onCameraMode: (callback: (isEnabled: boolean) => void) => {
    ipcRenderer.on('camera-mode', (_event, isEnabled) => callback(isEnabled));
  },
  
  // For sound player
  onPlaySound: (callback: (soundPath: string) => void) => {
    ipcRenderer.on('play-sound', (_event, soundPath) => callback(soundPath));
  },
  notifyAudioFinished: () => {
    ipcRenderer.send('audio-finished');
  },
  
  // For camera window
  onFaceTrackingData: (callback: (data: any) => void) => {
    ipcRenderer.on('face-tracking-data', (_event, data) => callback(data));
  },
  onBlinkDetected: (callback: (blinkData: any) => void) => {
    ipcRenderer.on('blink-detected', (_event, blinkData) => callback(blinkData));
  },
  onVideoStream: (callback: (streamData: string) => void) => {
    ipcRenderer.on('video-stream', (_event, streamData) => callback(streamData));
  },
  onThresholdUpdated: (callback: (threshold: number) => void) => {
    ipcRenderer.on('threshold-updated', (_event, threshold) => callback(threshold));
  },
  requestVideoStream: () => {
    ipcRenderer.send('request-video-stream');
  },
  
  // For exercise popups
  skipExercise: () => {
    ipcRenderer.send('skip-exercise');
  },
  snoozeExercise: () => {
    ipcRenderer.send('snooze-exercise');
  },
  
  // For popup editor
  onPopupEditorUpdate: (callback: (data: any) => void) => {
    ipcRenderer.on('update-colors', (_event, colors) => callback({ type: 'colors', data: colors }));
    ipcRenderer.on('current-popup-state', (_event, state) => callback({ type: 'state', data: state }));
  },
  savePopupEditor: (data: any) => {
    ipcRenderer.send('popup-editor-saved', data);
  },
  
  // Utility functions
  removeAllListeners: (channel: string) => {
    ipcRenderer.removeAllListeners(channel);
  }
})

// Type definitions for TypeScript
declare global {
  interface Window {
    popupAPI: {
      onUpdateColors: (callback: (colors: any) => void) => void;
      onUpdateMessage: (callback: (message: string) => void) => void;
      onCameraMode: (callback: (isEnabled: boolean) => void) => void;
      onPlaySound: (callback: (soundPath: string) => void) => void;
      notifyAudioFinished: () => void;
      onFaceTrackingData: (callback: (data: any) => void) => void;
      onBlinkDetected: (callback: (blinkData: any) => void) => void;
      onVideoStream: (callback: (streamData: string) => void) => void;
      onThresholdUpdated: (callback: (threshold: number) => void) => void;
      requestVideoStream: () => void;
      skipExercise: () => void;
      snoozeExercise: () => void;
      onPopupEditorUpdate: (callback: (data: any) => void) => void;
      savePopupEditor: (data: any) => void;
      removeAllListeners: (channel: string) => void;
    };
  }
}