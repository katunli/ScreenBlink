import { app, BrowserWindow, ipcMain, screen, globalShortcut, powerMonitor } from "electron";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import path from "node:path";
import Store from 'electron-store';
import { spawn } from 'child_process';
import { existsSync } from 'fs';

createRequire(import.meta.url);
const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Initialize electron-store
const store = new Store();

// The built directory structure
//
// ├─┬─┬ dist
// │ │ └── index.html
// │ │
// │ ├─┬ dist-electron
// │ │ ├── main.js
// │ │ └── preload.mjs
// │
process.env.APP_ROOT = path.join(__dirname, "..");

// 🚧 Use ['ENV_NAME'] avoid vite:define plugin - Vite@2.x
export const VITE_DEV_SERVER_URL = process.env["VITE_DEV_SERVER_URL"];
export const MAIN_DIST = path.join(process.env.APP_ROOT, "dist-electron");
export const RENDERER_DIST = path.join(process.env.APP_ROOT, "dist");

process.env.VITE_PUBLIC = VITE_DEV_SERVER_URL
	? path.join(process.env.APP_ROOT, "public")
	: RENDERER_DIST;

let win: BrowserWindow | null;
let blinkIntervalId: NodeJS.Timeout | null = null;
let blinkReminderActive = false;
let currentPopup: BrowserWindow | null = null;

// Camera-based blink detection state
let lastBlinkTime = Date.now();
let cameraMonitoringInterval: NodeJS.Timeout | null = null;

let pythonProcess: any = null;
let isPythonRunning = false;
let exerciseIntervalId: NodeJS.Timeout | null = null;
let exerciseSnoozeTimeout: NodeJS.Timeout | null = null;
let currentExercisePopup: BrowserWindow | null = null;
let isExerciseShowing = false;
let earThresholdUpdateTimeout: NodeJS.Timeout | null = null;
let frameCount = 0;
const FRAME_SKIP = 1; // Process every 2nd frame (changed from 3 to 1)
let mgdReminderLoopActive = false;
let cameraWindow: BrowserWindow | null = null;

let positionEditorWindow: BrowserWindow | null = null;
let positionUpdateTimeout: NodeJS.Timeout | null = null;

// Store state before sleep
let wasTrackingBeforeSleep = false;
let wasCameraEnabledBeforeSleep = false;

const preferences = {
	darkMode: store.get('darkMode', true) as boolean,
	reminderInterval: store.get('reminderInterval', 5000) as number,
	cameraEnabled: store.get('cameraEnabled', false) as boolean,
	eyeExercisesEnabled: store.get('eyeExercisesEnabled', true) as boolean,
	popupPosition: store.get('popupPosition', { x: 40, y: 40 }) as { x: number, y: number },
	popupColors: store.get('popupColors', {
		background: '#FFFFFF',
		text: '#00FF11',
		opacity: 0.7
	}) as {
		background: string;
		text: string;
		opacity: number;
	},
	isTracking: false,
	keyboardShortcut: store.get('keyboardShortcut', 'Meta+I') as string,
	blinkSensitivity: store.get('blinkSensitivity', 0.20) as number,
	mgdMode: store.get('mgdMode', false) as boolean
};

function createWindow() {
	win = new BrowserWindow({
		width: 500,
		height: 700,
		icon: path.join(process.env.VITE_PUBLIC, "electron-vite.svg"),
		webPreferences: {
			preload: path.join(__dirname, "preload.mjs"),
			nodeIntegration: false,
			contextIsolation: true,
			webSecurity: true
		},
	});

	// Test active push message to Renderer-process.
	win.webContents.on("did-finish-load", () => {
		win?.webContents.send("main-process-message", new Date().toLocaleString());
		// Send initial preferences to renderer
		win?.webContents.send("load-preferences", {
			...preferences,
			reminderInterval: preferences.reminderInterval / 1000 // Convert to seconds for the UI
		});
	});

	if (VITE_DEV_SERVER_URL) {
		win.loadURL(VITE_DEV_SERVER_URL);
	} else {
		// win.loadFile('dist/index.html')
		win.loadFile(path.join(RENDERER_DIST, "index.html"));
	}
}

function showBlinkPopup() {
	if (currentPopup) {
		currentPopup.close();
		currentPopup = null;
	}
	const popupWidth = 220;
	const popupHeight = 80;
	
	const x = preferences.popupPosition.x;
	const y = preferences.popupPosition.y;

	const popup = new BrowserWindow({
		width: popupWidth,
		height: popupHeight,
		x,
		y,
		frame: false,
		transparent: true,
		alwaysOnTop: true,
		resizable: false,
		skipTaskbar: true,
		focusable: false,
		show: false,
		hasShadow: false,
		acceptFirstMouse: false,
		webPreferences: {
			nodeIntegration: true,
			contextIsolation: false,
		},
	});

	currentPopup = popup;
	popup.loadFile(path.join(process.env.APP_ROOT, "electron", "blink.html"));
	popup.webContents.on('did-finish-load', () => {
		popup.webContents.send('update-colors', preferences.popupColors);
		popup.webContents.send('camera-mode', preferences.cameraEnabled);
		popup.setIgnoreMouseEvents(true);
	});
	popup.once("ready-to-show", () => {
		popup.showInactive();
	});

	// Only auto-close if camera is not enabled
	if (!preferences.cameraEnabled) {
		setTimeout(() => {
			if (currentPopup === popup) {
				popup.close();
				currentPopup = null;
			}
		}, 2500);
	}
}

function showStoppedPopup() {
	if (currentPopup) {
		currentPopup.close();
		currentPopup = null;
	}

	const popupWidth = 220;
	const popupHeight = 80;
	
	const x = preferences.popupPosition.x;
	const y = preferences.popupPosition.y;

	const popup = new BrowserWindow({
		width: popupWidth,
		height: popupHeight,
		x,
		y,
		frame: false,
		transparent: true,
		alwaysOnTop: true,
		resizable: false,
		skipTaskbar: true,
		focusable: false,
		show: false,
		hasShadow: false,
		acceptFirstMouse: false,
		webPreferences: {
			nodeIntegration: true,
			contextIsolation: false,
		},
	});

	currentPopup = popup;
	popup.loadFile(path.join(process.env.APP_ROOT, "electron", "stopped.html"));
	popup.webContents.on('did-finish-load', () => {
		popup.webContents.send('update-colors', preferences.popupColors);
		popup.setIgnoreMouseEvents(true);
	});
	popup.once("ready-to-show", () => {
		popup.showInactive();
	});
	
	// Auto-close the stopped popup after 2.5 seconds
	setTimeout(() => {
		if (currentPopup === popup) {
			popup.close();
			currentPopup = null;
		}
	}, 2500);
}

function showPositionEditor() {
	if (positionEditorWindow) {
		positionEditorWindow.focus();
		return;
	}

	const popupWidth = 220; 
	const popupHeight = 80; 

	// Start at current popup position
	const x = preferences.popupPosition.x;
	const y = preferences.popupPosition.y;

	positionEditorWindow = new BrowserWindow({
		width: popupWidth,
		height: popupHeight,
		x,
		y,
		frame: false,
		transparent: true,
		alwaysOnTop: true,
		resizable: false,
		skipTaskbar: true,
		focusable: true,
		show: false,
		hasShadow: false,
		movable: true,
		webPreferences: {
			nodeIntegration: true,
			contextIsolation: false,
		},
	});

	positionEditorWindow.loadFile(path.join(process.env.APP_ROOT, "electron", "position-editor.html"));
	
	positionEditorWindow.webContents.on('did-finish-load', () => {
		positionEditorWindow?.webContents.send('update-colors', preferences.popupColors);
		positionEditorWindow?.webContents.send('current-position', preferences.popupPosition);
	});
	
	positionEditorWindow.once("ready-to-show", () => {
		positionEditorWindow?.show();
	});

	// Handle window movement
	positionEditorWindow.on('moved', () => {
		if (positionEditorWindow) {
			const [x, y] = positionEditorWindow.getPosition();
			
			// Clear any existing timeout
			if (positionUpdateTimeout) {
				clearTimeout(positionUpdateTimeout);
			}
			
			// Set a new timeout to update the position after 500ms of no movement
			positionUpdateTimeout = setTimeout(() => {
				preferences.popupPosition = { x, y };
				store.set('popupPosition', { x, y });
				positionEditorWindow?.webContents.send('position-saved', { x, y });
			}, 500);
		}
	});

	positionEditorWindow.on('closed', () => {
		positionEditorWindow = null;
		if (positionUpdateTimeout) {
			clearTimeout(positionUpdateTimeout);
			positionUpdateTimeout = null;
		}
	});
}

async function startBlinkReminderLoop(interval: number) {
	blinkReminderActive = true;
	preferences.reminderInterval = interval;
	
	if (preferences.cameraEnabled) {
		startPythonBlinkDetector();
	}
	
	while (blinkReminderActive) {
		await new Promise((resolve) => {
			showBlinkPopup();
			setTimeout(resolve, 2500); // Wait for popup to fade out
		});
		if (!blinkReminderActive) break;
		await new Promise((resolve) => setTimeout(resolve, preferences.reminderInterval));
	}
}

function stopBlinkReminderLoop() {
	blinkReminderActive = false;
	if (blinkIntervalId) {
		clearInterval(blinkIntervalId);
		blinkIntervalId = null;
	}
	if (cameraMonitoringInterval) {
		clearInterval(cameraMonitoringInterval);
		cameraMonitoringInterval = null;
	}
	
	stopPythonBlinkDetector();
	
	if (currentPopup) {
		currentPopup.close();
		currentPopup = null;
	}
	
	if (preferences.cameraEnabled) {
		preferences.isTracking = false;
		// Notify renderer to stop camera
		win?.webContents.send('stop-camera');
	}
}

function registerGlobalShortcut(shortcut: string) {
	globalShortcut.unregisterAll();
	
	globalShortcut.register(shortcut, () => {
		preferences.isTracking = !preferences.isTracking;
		if (preferences.isTracking) {
			// Start reminders
			blinkReminderActive = false;
			if (blinkIntervalId) clearInterval(blinkIntervalId);
			if (cameraMonitoringInterval) clearInterval(cameraMonitoringInterval);
			
			// Close any existing popup when starting/restarting
			if (currentPopup) {
				currentPopup.close();
				currentPopup = null;
			}
			
			preferences.isTracking = true;
			
			if (preferences.cameraEnabled) {
				// Reset last blink time and start camera monitoring
				lastBlinkTime = Date.now();
				startCameraMonitoring();
			} else {
				startBlinkReminderLoop(preferences.reminderInterval);
			}
		} else {
			stopBlinkReminderLoop();
			showStoppedPopup();
		}
		// Notify the renderer process about the state change
		win?.webContents.send('load-preferences', {
			...preferences,
			reminderInterval: preferences.reminderInterval / 1000
		});
	});
}

function showCameraWindow() {
	if (cameraWindow) {
		cameraWindow.focus();
		return;
	}

	const display = screen.getPrimaryDisplay();
	const { width, height } = display.workAreaSize;
	const windowWidth = Math.min(640, width * 0.8);
	const windowHeight = Math.min(480, height * 0.8);

	cameraWindow = new BrowserWindow({
		width: windowWidth,
		height: windowHeight,
		title: 'Camera Visualization',
		webPreferences: {
			nodeIntegration: true,
			contextIsolation: false,
		},
	});

	cameraWindow.loadFile(path.join(process.env.APP_ROOT, 'electron', 'camera.html'));
	
	// Wait for window to be ready before sending video stream
	cameraWindow.webContents.on('did-finish-load', () => {
		// Request video stream from Python process
		if (pythonProcess && pythonProcess.stdin) {
			pythonProcess.stdin.write(JSON.stringify({ 
				request_video: true 
			}) + '\n');
		}
	});
	
	// Handle window close event
	cameraWindow.on('closed', () => {
		cameraWindow = null;
		notifyCameraWindowClosed();
	});

	// Handle window close button click
	cameraWindow.on('close', () => {
		notifyCameraWindowClosed();
	});
}

function startPythonBlinkDetector() {
	if (isPythonRunning) return;

	const pythonPath = path.join(process.env.APP_ROOT, 'python', 'blink_detector.py');
	const venvPythonPath = path.join(process.env.APP_ROOT, 'python', 'venv', 'bin', 'python');
	
	// Use the virtual environment Python if it exists, otherwise fall back to system Python
	const pythonExecutable = process.platform === 'win32' 
		? path.join(process.env.APP_ROOT, 'python', 'venv', 'Scripts', 'python.exe')
		: venvPythonPath;

	// Check if virtual environment exists
	if (!existsSync(pythonExecutable)) {
		console.error('Python virtual environment not found. Please run setup.sh first.');
		return;
	}

	console.log('Starting Python process with:', pythonExecutable);
	pythonProcess = spawn(pythonExecutable, [pythonPath], {
		stdio: ['pipe', 'pipe', 'pipe']
	});

	let buffer = '';
	pythonProcess.stdout.on('data', (data: Buffer) => {
		buffer += data.toString();
		
		// Process complete JSON messages
		let newlineIndex;
		while ((newlineIndex = buffer.indexOf('\n')) !== -1) {
			const message = buffer.slice(0, newlineIndex);
			buffer = buffer.slice(newlineIndex + 1);
			
			try {
				const parsed = JSON.parse(message);
				if (parsed.blink) {
					frameCount++;
					if (frameCount % FRAME_SKIP !== 0) {
						continue;
					}
					lastBlinkTime = Date.now();
					try {
						if (currentPopup && !currentPopup.isDestroyed()) {
							currentPopup.close();
							currentPopup = null;
						}
					} catch (error) {
						console.log('Popup already destroyed');
						currentPopup = null;
					}
				} else if (parsed.error) {
					console.error('Python error:', parsed.error);
					stopPythonBlinkDetector();
				} else if (parsed.status) {
					console.log('Python status:', parsed);
					// If the process is ready, send the initial sensitivity value
					if (parsed.status === "Camera opened successfully" && pythonProcess.stdin) {
						pythonProcess.stdin.write(JSON.stringify({ 
							ear_threshold: preferences.blinkSensitivity,
							frame_skip: FRAME_SKIP // Send frame skip setting to Python
						}) + '\n');
					}
				} else if (parsed.faceData) {
					// Send face tracking data to camera window
					if (cameraWindow && !cameraWindow.isDestroyed()) {
						cameraWindow.webContents.send('face-tracking-data', parsed.faceData);
					}
				} else if (parsed.videoStream) {
					// Handle video stream data
					if (cameraWindow && !cameraWindow.isDestroyed()) {
						cameraWindow.webContents.send('video-stream', parsed.videoStream);
					}
				}
			} catch (error) {
				console.error('Failed to parse Python output:', error);
			}
		}
	});

	pythonProcess.stderr.on('data', (data: Buffer) => {
		console.error('Python stderr:', data.toString());
	});

	pythonProcess.on('close', (code: number) => {
		console.log('Python process exited with code:', code);
		isPythonRunning = false;
		pythonProcess = null;
	});

	isPythonRunning = true;
}

function stopPythonBlinkDetector() {
	if (pythonProcess) {
		pythonProcess.kill();
		pythonProcess = null;
	}
	isPythonRunning = false;
	
	if (cameraWindow) {
		cameraWindow.close();
		cameraWindow = null;
	}
}

function startCameraMonitoring() {
	if (cameraMonitoringInterval) {
		clearInterval(cameraMonitoringInterval);
	}
	
	// Reset the last blink time when starting monitoring
	lastBlinkTime = Date.now();
	frameCount = 0;
	
	// Ensure Python process is running
	if (!isPythonRunning) {
		startPythonBlinkDetector();
	}
	
	if (preferences.mgdMode) {
		// In MGD mode, use the same interval-based approach as startBlinkReminderLoop
		mgdReminderLoopActive = true;
		async function mgdReminderLoop() {
			while (mgdReminderLoopActive && preferences.isTracking && preferences.mgdMode && isPythonRunning) {
				await new Promise((resolve) => {
					showBlinkPopup();
					// Always close popup after 2.5 seconds in MGD mode
					setTimeout(() => {
						try {
							if (currentPopup && !currentPopup.isDestroyed()) {
								currentPopup.close();
								currentPopup = null;
							}
						} catch (error) {
							console.log('Popup already destroyed');
							currentPopup = null;
						}
						resolve(null);
					}, 2500);
				});
				if (!mgdReminderLoopActive || !preferences.isTracking || !preferences.mgdMode || !isPythonRunning) break;
				await new Promise((resolve) => setTimeout(resolve, preferences.reminderInterval));
			}
		}
		mgdReminderLoop();
	} else {
		// Normal mode - only show popup if no blink detected
		cameraMonitoringInterval = setInterval(() => {
			const timeSinceLastBlink = Date.now() - lastBlinkTime;
			if (timeSinceLastBlink >= preferences.reminderInterval && !currentPopup && isPythonRunning) {
				showBlinkPopup();
				// Auto-close popup after 2.5 seconds
				setTimeout(() => {
					try {
						if (currentPopup && !currentPopup.isDestroyed()) {
							currentPopup.close();
							currentPopup = null;
							// Update lastBlinkTime when popup closes
							lastBlinkTime = Date.now();
						}
					} catch (error) {
						console.log('Popup already destroyed');
						currentPopup = null;
						lastBlinkTime = Date.now();
					}
				}, 2500);
			}
		}, 100); // Check every 100ms
	}
}

ipcMain.on("blink-detected", () => {
	lastBlinkTime = Date.now();
	
	// Only close popup in normal mode (not MGD mode)
	if (!preferences.mgdMode) {
		try {
			if (currentPopup && !currentPopup.isDestroyed()) {
				currentPopup.close();
				currentPopup = null;
			}
		} catch (error) {
			console.log('Popup already destroyed');
			currentPopup = null;
		}
	}
});

ipcMain.on("start-blink-reminders", (_event, interval: number) => {
	stopBlinkReminderLoop(); // Stop any existing processes first
	
	// Close any existing popup when starting/restarting
	if (currentPopup) {
		currentPopup.close();
		currentPopup = null;
	}
	
	preferences.isTracking = true;
	
	if (preferences.cameraEnabled) {
		// Reset last blink time and start camera monitoring
		lastBlinkTime = Date.now();
		startCameraMonitoring();
	} else {
		startBlinkReminderLoop(interval);
	}
});

ipcMain.on("stop-blink-reminders", () => {
	stopBlinkReminderLoop();
	showStoppedPopup();
});

ipcMain.on("update-popup-position", (_event, position: { x: number, y: number }) => {
	preferences.popupPosition = position;
	store.set('popupPosition', position);
});

ipcMain.on("update-interval", (_event, interval: number) => {
	preferences.reminderInterval = interval;
	store.set('reminderInterval', interval);
});

ipcMain.on("update-popup-colors", (_event, colors) => {
	preferences.popupColors = colors;
	store.set('popupColors', colors);
});

ipcMain.on("update-dark-mode", (_event, darkMode: boolean) => {
	preferences.darkMode = darkMode;
	store.set('darkMode', darkMode);
});

ipcMain.on("update-camera-enabled", (_event, enabled: boolean) => {
	preferences.cameraEnabled = enabled;
	store.set('cameraEnabled', enabled);
	
	// Update camera mode status in popup if it exists
	if (currentPopup) {
		currentPopup.webContents.send('camera-mode', enabled);
	}
});

ipcMain.on("update-eye-exercises-enabled", (_event, enabled: boolean) => {
	preferences.eyeExercisesEnabled = enabled;
	store.set('eyeExercisesEnabled', enabled);
	
	if (enabled) {
		startExerciseMonitoring();
	} else {
		stopExerciseMonitoring();
	}
});

ipcMain.on("update-keyboard-shortcut", (_event, shortcut: string) => {
	preferences.keyboardShortcut = shortcut;
	store.set('keyboardShortcut', shortcut);
	registerGlobalShortcut(shortcut);
});

ipcMain.on("start-camera-tracking", () => {
	// If reminders are active, stop them first
	if (preferences.isTracking) {
		stopBlinkReminderLoop();
		showStoppedPopup();
	}
	
	// Update the preference flag
	preferences.cameraEnabled = true;
	store.set('cameraEnabled', true);
});

ipcMain.on("stop-camera-tracking", () => {
	// If reminders are active, stop them first
	if (preferences.isTracking) {
		stopBlinkReminderLoop();
		showStoppedPopup();
	}
	
	// Update the preference flag
	preferences.cameraEnabled = false;
	store.set('cameraEnabled', false);
});

ipcMain.on("update-blink-sensitivity", (_event, sensitivity: number) => {
	preferences.blinkSensitivity = sensitivity;
	store.set('blinkSensitivity', sensitivity);
	
	// Clear any existing timeout
	if (earThresholdUpdateTimeout) {
		clearTimeout(earThresholdUpdateTimeout);
	}
	
	// Set a new timeout to update the threshold after 500ms of no changes
	earThresholdUpdateTimeout = setTimeout(() => {
		// Send the new threshold to the Python process if it's running
		if (pythonProcess && pythonProcess.stdin) {
			pythonProcess.stdin.write(JSON.stringify({ ear_threshold: sensitivity }) + '\n');
		}
	}, 500);
});

function showExercisePopup() {
	// Prevent overlapping exercises
	if (isExerciseShowing || currentExercisePopup) {
		return;
	}

	isExerciseShowing = true;

	// Close any existing exercise popup (extra safety)
	if (currentExercisePopup) {
		(currentExercisePopup as BrowserWindow).close();
		currentExercisePopup = null;
	}

	const display = screen.getPrimaryDisplay();
	const { width, height } = display.workAreaSize;
	const popupWidth = 340;
	const popupHeight = 200;

	// Position in the middle of the screen
	const x = Math.floor((width - popupWidth) / 2);
	const y = Math.floor((height - popupHeight) / 2);

	const popup = new BrowserWindow({
		width: popupWidth,
		height: popupHeight,
		x,
		y,
		frame: false,
		transparent: true,
		alwaysOnTop: true,
		resizable: false,
		skipTaskbar: true,
		focusable: true,
		show: false,
		hasShadow: false,
		webPreferences: {
			nodeIntegration: true,
			contextIsolation: false,
		},
	});

	currentExercisePopup = popup;
	popup.loadFile(path.join(process.env.APP_ROOT, "electron", "exercise.html"));
	
	popup.webContents.on('did-finish-load', () => {
		popup.webContents.send('update-colors', { darkMode: preferences.darkMode });
	});
	
	popup.once("ready-to-show", () => {
		popup.show();
	});

	// Handle window close
	popup.on('closed', () => {
		if (currentExercisePopup === popup) {
			currentExercisePopup = null;
			isExerciseShowing = false;
		}
	});

	// Auto-close after 1 minute
	setTimeout(() => {
		if (currentExercisePopup === popup) {
			popup.close();
			currentExercisePopup = null;
			isExerciseShowing = false;
		}
	}, 15000);
}

function startExerciseMonitoring() {
	if (exerciseIntervalId) {
		clearInterval(exerciseIntervalId);
	}

	// Check every minute
	exerciseIntervalId = setInterval(() => {
		const now = Date.now();
		const timeSinceLastExercise = now - (store.get('lastExerciseTime', 0) as number);

		// Show exercise every 20 minutes
		if (preferences.eyeExercisesEnabled && 
			!isExerciseShowing && 
			timeSinceLastExercise >= 20 * 60 * 1000) {
			showExercisePopup();
			store.set('lastExerciseTime', now);
		}
	}, 60 * 1000); // Check every minute
}

function stopExerciseMonitoring() {
	if (exerciseIntervalId) {
		clearInterval(exerciseIntervalId);
		exerciseIntervalId = null;
	}
	if (exerciseSnoozeTimeout) {
		clearTimeout(exerciseSnoozeTimeout);
		exerciseSnoozeTimeout = null;
	}
	if (currentExercisePopup) {
		(currentExercisePopup as BrowserWindow).close();
		currentExercisePopup = null;
	}
	isExerciseShowing = false;
}

ipcMain.on("skip-exercise", () => {
	if (currentExercisePopup) {
		(currentExercisePopup as BrowserWindow).close();
		currentExercisePopup = null;
		isExerciseShowing = false;
	}
	store.set('lastExerciseTime', Date.now());
});

ipcMain.on("snooze-exercise", () => {
	if (currentExercisePopup) {
		(currentExercisePopup as BrowserWindow).close();
		currentExercisePopup = null;
		isExerciseShowing = false;
	}
	if (exerciseSnoozeTimeout) {
		clearTimeout(exerciseSnoozeTimeout);
	}
	exerciseSnoozeTimeout = setTimeout(() => {
		showExercisePopup();
	}, 5 * 60 * 1000); // Snooze for 5 minutes
});

ipcMain.on("update-mgd-mode", (_event, enabled: boolean) => {
	preferences.mgdMode = enabled;
	store.set('mgdMode', enabled);
});

// Add cleanup for Python process in the app quit handler
app.on('before-quit', () => {
	stopPythonBlinkDetector();
	stopExerciseMonitoring();
	if (earThresholdUpdateTimeout) {
		clearTimeout(earThresholdUpdateTimeout);
		earThresholdUpdateTimeout = null;
	}
});

// Add system sleep/wake handlers
powerMonitor.on('suspend', () => {
	// Store current state before sleep
	wasTrackingBeforeSleep = preferences.isTracking;
	wasCameraEnabledBeforeSleep = preferences.cameraEnabled;
	
	// Stop Python process and camera monitoring
	stopPythonBlinkDetector();
	if (cameraMonitoringInterval) {
		clearInterval(cameraMonitoringInterval);
		cameraMonitoringInterval = null;
	}
	
	// Stop MGD reminder loop if active
	if (mgdReminderLoopActive) {
		mgdReminderLoopActive = false;
	}
});

powerMonitor.on('resume', () => {
	// If reminders were active and camera was enabled before sleep, restart them
	if (wasTrackingBeforeSleep && wasCameraEnabledBeforeSleep) {
		// Reset last blink time and start camera monitoring
		lastBlinkTime = Date.now();
		
		// Start Python process first
		startPythonBlinkDetector();
		
		// Wait a brief moment to ensure Python process is ready
		setTimeout(() => {
			if (isPythonRunning) {
				// Only start camera monitoring if Python process is running
				startCameraMonitoring();
			} else {
				// If Python process failed to start, stop tracking
				preferences.isTracking = false;
				win?.webContents.send('load-preferences', {
					...preferences,
					reminderInterval: preferences.reminderInterval / 1000
				});
			}
		}, 1000);
	}
});

// Quit when all windows are closed, except on macOS. There, it's common
// for applications and their menu bar to stay active until the user quits
// explicitly with Cmd + Q.
app.on("window-all-closed", () => {
	if (process.platform !== "darwin") {
		app.quit();
		win = null;
	}
});

app.on("activate", () => {
	// On OS X it's common to re-create a window in the app when the
	// dock icon is clicked and there are no other windows open.
	if (BrowserWindow.getAllWindows().length === 0) {
		createWindow();
	}
});

app.whenReady().then(() => {
	createWindow();
	// Register the initial shortcut
	registerGlobalShortcut(preferences.keyboardShortcut);
	
	// Start exercise monitoring if enabled
	if (preferences.eyeExercisesEnabled) {
		startExerciseMonitoring();
	}
});

ipcMain.on('show-camera-window', () => {
	showCameraWindow();
});

// When camera window is closed, notify renderer
function notifyCameraWindowClosed() {
	if (win && !win.isDestroyed()) {
		win.webContents.send('camera-window-closed');
	}
}

ipcMain.on('close-camera-window', () => {
	if (cameraWindow && !cameraWindow.isDestroyed()) {
		cameraWindow.close();
		cameraWindow = null;
	}
});

ipcMain.on("show-position-editor", () => {
	showPositionEditor();
});

// Add function to reset preferences to defaults
function resetPreferencesToDefaults() {
	// Stop any active reminders first
	if (preferences.isTracking) {
		stopBlinkReminderLoop();
		showStoppedPopup();
	}

	store.clear(); // Clear all stored preferences
	store.set('darkMode', true);
	store.set('reminderInterval', 5000);
	store.set('cameraEnabled', false);
	store.set('eyeExercisesEnabled', true);
	store.set('popupPosition', { x: 40, y: 40 });
	store.set('popupColors', {
		background: '#FFFFFF',
		text: '#00FF11',
		opacity: 0.7
	});
	store.set('keyboardShortcut', 'Meta+I');
	store.set('blinkSensitivity', 0.20);
	store.set('mgdMode', false);
	
	// Update current preferences
	preferences.darkMode = true;
	preferences.reminderInterval = 5000;
	preferences.cameraEnabled = false;
	preferences.eyeExercisesEnabled = true;
	preferences.popupPosition = { x: 40, y: 40 };
	preferences.popupColors = {
		background: '#FFFFFF',
		text: '#00FF11',
		opacity: 0.7
	};
	preferences.keyboardShortcut = 'Meta+I';
	preferences.blinkSensitivity = 0.20;
	preferences.mgdMode = false;
	preferences.isTracking = false; // Ensure tracking is stopped
	
	// Notify renderer of updated preferences
	win?.webContents.send('load-preferences', {
		...preferences,
		reminderInterval: preferences.reminderInterval / 1000
	});
}

// Add IPC handler for resetting preferences
ipcMain.on('reset-preferences', () => {
	resetPreferencesToDefaults();
});
