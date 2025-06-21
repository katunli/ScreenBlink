import { ipcRenderer, contextBridge } from 'electron'

// --------- Expose some API to the Renderer process ---------
contextBridge.exposeInMainWorld('ipcRenderer', {
  on: (channel: string, func: (...args: any[]) => void) => {
    const validChannels = [
      'main-process-message', 
      'load-preferences',
      'camera-error',
      'video-stream',
      'camera-window-closed',
      'update-message'
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
      'update-dark-mode',
      'update-camera-enabled',
      'update-eye-exercises-enabled',
      'update-exercise-interval',
      'update-popup-message',
      'update-keyboard-shortcut',
      'blink-detected',
      'start-camera-tracking',
      'stop-camera-tracking',
      'update-blink-sensitivity',
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
      'update-sound-enabled'
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