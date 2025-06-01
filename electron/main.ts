import { app, BrowserWindow, ipcMain, screen, globalShortcut } from "electron";
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
let isCameraMonitoring = false;

// Add these variables at the top with other state variables
let pythonProcess: any = null;
let isPythonRunning = false;
let exerciseIntervalId: NodeJS.Timeout | null = null;
let exerciseSnoozeTimeout: NodeJS.Timeout | null = null;
let currentExercisePopup: BrowserWindow | null = null;
let isExerciseShowing = false;
let earThresholdUpdateTimeout: NodeJS.Timeout | null = null;
let frameCount = 0;
const FRAME_SKIP = 1; // Process every 2nd frame (changed from 3 to 1)

// Load all preferences from store
const preferences = {
	darkMode: store.get('darkMode', false) as boolean,
	reminderInterval: store.get('reminderInterval', 5000) as number,
	cameraEnabled: store.get('cameraEnabled', false) as boolean,
	eyeExercisesEnabled: store.get('eyeExercisesEnabled', true) as boolean,
	popupPosition: store.get('popupPosition', 'top-right') as string,
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
	keyboardShortcut: store.get('keyboardShortcut', 'Ctrl+Shift+B') as string,
	blinkSensitivity: store.get('blinkSensitivity', 0.20) as number
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
	// Close any existing popup
	if (currentPopup) {
		currentPopup.close();
		currentPopup = null;
	}

	const display = screen.getPrimaryDisplay();
	const { width } = display.workAreaSize;
	const { height } = display.workAreaSize;
	const popupWidth = 220;
	const popupHeight = 80;
	
	// Calculate position based on settings
	let x = 40;
	let y = 40;
	
	switch (preferences.popupPosition) {
		case 'top-left':
			x = 40;
			y = 40;
			break;
		case 'top-right':
			x = width - popupWidth - 40;
			y = 40;
			break;
		case 'bottom-left':
			x = 40;
			y = height - popupHeight - 40;
			break;
		case 'bottom-right':
			x = width - popupWidth - 40;
			y = height - popupHeight - 40;
			break;
	}

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
	// Close any existing popup first
	if (currentPopup) {
		currentPopup.close();
		currentPopup = null;
	}

	const display = screen.getPrimaryDisplay();
	const { width } = display.workAreaSize;
	const { height } = display.workAreaSize;
	const popupWidth = 220;
	const popupHeight = 80;
	
	// Calculate position based on settings
	let x = 40;
	let y = 40;
	
	switch (preferences.popupPosition) {
		case 'top-left':
			x = 40;
			y = 40;
			break;
		case 'top-right':
			x = width - popupWidth - 40;
			y = 40;
			break;
		case 'bottom-left':
			x = 40;
			y = height - popupHeight - 40;
			break;
		case 'bottom-right':
			x = width - popupWidth - 40;
			y = height - popupHeight - 40;
			break;
	}

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

async function startBlinkReminderLoop(interval: number) {
	blinkReminderActive = true;
	preferences.reminderInterval = interval;
	
	// Start Python process if camera is enabled
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
	
	// Stop Python process if it's running
	stopPythonBlinkDetector();
	
	// Close any existing popup immediately
	if (currentPopup) {
		currentPopup.close();
		currentPopup = null;
	}
	
	// If camera was enabled, stop it
	if (preferences.cameraEnabled) {
		preferences.isTracking = false;
		// Notify renderer to stop camera
		win?.webContents.send('stop-camera');
	}
}

function registerGlobalShortcut(shortcut: string) {
	// Unregister any existing shortcut first
	globalShortcut.unregisterAll();
	
	// Register the new shortcut
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
			// Stop reminders
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

					console.log('Blink detected!', parsed);
					// Handle blink detection
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
}

function startCameraMonitoring() {
	if (cameraMonitoringInterval) {
		clearInterval(cameraMonitoringInterval);
	}
	
	// Reset the last blink time when starting monitoring
	lastBlinkTime = Date.now();
	frameCount = 0;
	
	// Start Python process instead of using MediaPipe
	startPythonBlinkDetector();
	
	cameraMonitoringInterval = setInterval(() => {
		const timeSinceLastBlink = Date.now() - lastBlinkTime;
		if (timeSinceLastBlink >= preferences.reminderInterval && !currentPopup) {
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

function stopCameraMonitoring() {
	if (cameraMonitoringInterval) {
		clearInterval(cameraMonitoringInterval);
		cameraMonitoringInterval = null;
	}
	stopPythonBlinkDetector();
}

// Camera-based blink detection IPC handlers
ipcMain.on("blink-detected", () => {
	// Update last blink time
	lastBlinkTime = Date.now();
	
	// Close any existing popup when a blink is detected
	try {
		if (currentPopup && !currentPopup.isDestroyed()) {
			currentPopup.close();
			currentPopup = null;
		}
	} catch (error) {
		console.log('Popup already destroyed');
		currentPopup = null;
	}
});

ipcMain.on("start-blink-reminders", (event, interval: number) => {
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

ipcMain.on("update-popup-position", (event, position: string) => {
	preferences.popupPosition = position;
	store.set('popupPosition', position);
});

ipcMain.on("update-interval", (event, interval: number) => {
	preferences.reminderInterval = interval;
	store.set('reminderInterval', interval);
});

ipcMain.on("update-popup-colors", (event, colors) => {
	preferences.popupColors = colors;
	store.set('popupColors', colors);
});

ipcMain.on("update-dark-mode", (event, darkMode: boolean) => {
	preferences.darkMode = darkMode;
	store.set('darkMode', darkMode);
});

ipcMain.on("update-camera-enabled", (event, enabled: boolean) => {
	preferences.cameraEnabled = enabled;
	store.set('cameraEnabled', enabled);
	
	// Update camera mode status in popup if it exists
	if (currentPopup) {
		currentPopup.webContents.send('camera-mode', enabled);
	}
});

ipcMain.on("update-eye-exercises-enabled", (event, enabled: boolean) => {
	preferences.eyeExercisesEnabled = enabled;
	store.set('eyeExercisesEnabled', enabled);
	
	if (enabled) {
		startExerciseMonitoring();
	} else {
		stopExerciseMonitoring();
	}
});

ipcMain.on("update-keyboard-shortcut", (event, shortcut: string) => {
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

ipcMain.on("update-blink-sensitivity", (event, sensitivity: number) => {
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

// Add this function to show the exercise popup
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

// Add this function to start exercise monitoring
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

// Add this function to stop exercise monitoring
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

// Add these IPC handlers
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

// Add cleanup for Python process in the app quit handler
app.on('before-quit', () => {
	stopPythonBlinkDetector();
	stopExerciseMonitoring();
	if (earThresholdUpdateTimeout) {
		clearTimeout(earThresholdUpdateTimeout);
		earThresholdUpdateTimeout = null;
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
