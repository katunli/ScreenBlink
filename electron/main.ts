import { app, BrowserWindow, ipcMain, screen, globalShortcut, powerMonitor } from "electron";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import path from "node:path";
import Store from 'electron-store';
import { spawn, exec } from 'child_process';
import { existsSync } from 'fs';
import fs from 'fs';
import os from 'os';

// Suppress NSWindow panel styleMask warnings on macOS
if (process.platform === 'darwin') {
	process.env.NSWindowSupportsNonactivatingPanel = 'true';
}

// Enable console output for debugging in built version
if (process.platform === 'win32') {
	// Redirect console output to file for built version
	const logPath = path.join(process.env.APPDATA || process.env.USERPROFILE || '', 'ScreenBlink', 'app.log');
	
	// Ensure log directory exists
	const logDir = path.dirname(logPath);
	if (!existsSync(logDir)) {
		try {
			fs.mkdirSync(logDir, { recursive: true });
		} catch (error) {
			console.error('Failed to create log directory:', error);
		}
	}
	
	// Create write stream for logging
	const logStream = fs.createWriteStream(logPath, { flags: 'a' });
	
	// Override console methods to write to file
	const originalLog = console.log;
	const originalError = console.error;
	
	console.log = (...args) => {
		const timestamp = new Date().toISOString();
		const message = `[${timestamp}] LOG: ${args.join(' ')}\n`;
		logStream.write(message);
		originalLog(...args);
	};
	
	console.error = (...args) => {
		const timestamp = new Date().toISOString();
		const message = `[${timestamp}] ERROR: ${args.join(' ')}\n`;
		logStream.write(message);
		originalError(...args);
	};
	
	console.log('ScreenBlink app started - logs will be written to:', logPath);
}

createRequire(import.meta.url);
const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Initialize electron-store
const store = new Store();

// Built directory structure
// ├─┬─┬ dist
// │ │ └── index.html
// │ │
// │ ├─┬ dist-electron
// │ │ ├── main.js
// │ │ └── preload.mjs
// │
process.env.APP_ROOT = path.join(__dirname, "..");

// Use ['ENV_NAME'] avoid vite:define plugin - Vite@2.x
export const VITE_DEV_SERVER_URL = process.env["VITE_DEV_SERVER_URL"];
export const MAIN_DIST = path.join(process.env.APP_ROOT, "dist-electron");
export const RENDERER_DIST = path.join(process.env.APP_ROOT, "dist");

const isProd = app.isPackaged;

process.env.VITE_PUBLIC = VITE_DEV_SERVER_URL
	? path.join(process.env.APP_ROOT, "public")
	: RENDERER_DIST;

let win: BrowserWindow | null;
let blinkIntervalId: NodeJS.Timeout | null = null;
let blinkReminderActive = false;
let currentPopup: BrowserWindow | null = null;

// Camera detection state
let lastBlinkTime = Date.now();
let cameraMonitoringInterval: NodeJS.Timeout | null = null;
let isCameraReady = false;
let cameraRetryCount = 0;
const MAX_CAMERA_RETRIES = 20; // Max retries (20 * 3s = 1 minute)

let blinkDetectorProcess: any = null;
let isBlinkDetectorRunning = false;
let exerciseIntervalId: NodeJS.Timeout | null = null;
let exerciseSnoozeTimeout: NodeJS.Timeout | null = null;
let currentExercisePopup: BrowserWindow | null = null;
let isExerciseShowing = false;
let earThresholdUpdateTimeout: NodeJS.Timeout | null = null;
const FRAME_SKIP = 3; // Process every 3rd frame
let mgdReminderLoopActive = false;
let cameraWindow: BrowserWindow | null = null;

// Store state before sleep
let wasTrackingBeforeSleep = false;
let wasCameraEnabledBeforeSleep = false;

let popupEditorWindow: BrowserWindow | null = null;

// Windows process management
let isQuitting = false;
let childProcesses = new Set<any>();

const preferences = {
	darkMode: store.get('darkMode', true) as boolean,
	reminderInterval: store.get('reminderInterval', 5000) as number,
	cameraEnabled: store.get('cameraEnabled', false) as boolean,
	eyeExercisesEnabled: store.get('eyeExercisesEnabled', true) as boolean,
	exerciseInterval: store.get('exerciseInterval', 20) as number, // minutes
	popupPosition: store.get('popupPosition', { x: 40, y: 40 }) as { x: number, y: number },
	popupSize: store.get('popupSize', { width: 220, height: 80 }) as { width: number, height: number },
	popupColors: store.get('popupColors', {
		background: '#FFFFFF',
		text: '#00FF11',
		transparency: 0.3
	}) as {
		background: string;
		text: string;
		transparency: number;
	},
	popupMessage: store.get('popupMessage', 'Blink!') as string,
	isTracking: false,
	keyboardShortcut: store.get('keyboardShortcut', 'Ctrl+I') as string,
	blinkSensitivity: store.get('blinkSensitivity', 0.20) as number,
	mgdMode: store.get('mgdMode', false) as boolean,
	soundEnabled: store.get('soundEnabled', false) as boolean
};

// Windows-specific process killing function
function forceKillProcessTree(pid: number): Promise<void> {
	return new Promise((resolve) => {
		if (process.platform === 'win32') {
			console.log(`Attempting to kill process tree for PID: ${pid}`);
			
			// First attempt: Kill by PID with process tree
			exec(`taskkill /pid ${pid} /t /f`, (error, stdout) => {
				if (error) {
					console.log(`Failed to kill by PID ${pid}: ${error.message}`);
				} else {
					console.log(`Successfully killed process tree for PID ${pid}`);
					console.log(`Stdout: ${stdout}`);
				}
				resolve();
			});
		} else {
			// On non-Windows platforms, use SIGKILL
			try {
				process.kill(pid, 'SIGKILL');
				console.log(`Killed process ${pid} with SIGKILL`);
			} catch (error) {
				console.log(`Process ${pid} might already be dead`);
			}
			resolve();
		}
	});
}

// Aggressive Windows process cleanup
async function aggressiveWindowsCleanup(): Promise<void> {
	if (process.platform !== 'win32') return;
	
	console.log('Starting aggressive Windows process cleanup...');
	
	// Kill all blink_detector.exe processes by name
	await new Promise<void>((resolve) => {
		exec('taskkill /im blink_detector.exe /f /t', (error, stdout) => {
			if (error) {
				console.log('No blink_detector.exe processes found or already killed');
			} else {
				console.log('Killed all blink_detector.exe processes by name');
				console.log(`Stdout: ${stdout}`);
			}
			resolve();
		});
	});
	
	// Kill all Console Window Host processes associated with our app
	await new Promise<void>((resolve) => {
		exec('taskkill /im conhost.exe /f', (error, stdout) => {
			if (error) {
				console.log('No conhost.exe processes found or failed to kill');
			} else {
				console.log('Killed conhost.exe processes');
				console.log(`Stdout: ${stdout}`);
			}
			resolve();
		});
	});
	
	// Additional cleanup: Kill any remaining processes that might be related
	const processesToKill = ['blink_detector.exe', 'python.exe', 'pythonw.exe'];
	
	for (const processName of processesToKill) {
		await new Promise<void>((resolve) => {
			exec(`taskkill /im ${processName} /f /t`, (error) => {
				if (error) {
					console.log(`No ${processName} processes found`);
				} else {
					console.log(`Killed all ${processName} processes`);
				}
				resolve();
			});
		});
	}
	
	console.log('Aggressive Windows cleanup completed');
}

// Nuclear cleanup option for Windows
async function nuclearWindowsCleanup(): Promise<void> {
	if (process.platform !== 'win32') return;
	
	console.log('Starting nuclear Windows cleanup...');
	
	// Get current process PID
	const currentPid = process.pid;
	console.log(`Current process PID: ${currentPid}`);
	
	// Create a delayed cleanup script that will run after the main process exits
	const cleanupScript = `
@echo off
echo Starting delayed cleanup...
timeout /t 2 /nobreak > nul
echo Killing any remaining ScreenBlink processes...
taskkill /im ScreenBlink.exe /f /t 2>nul
taskkill /im blink_detector.exe /f /t 2>nul
taskkill /im conhost.exe /f 2>nul
taskkill /im python.exe /f /t 2>nul
taskkill /im pythonw.exe /f /t 2>nul
echo Cleanup complete
del "%~f0"
`;
	
	// Write cleanup script to temp file
	const cleanupPath = path.join(os.tmpdir(), 'screenblink_cleanup.bat');
	
	try {
		fs.writeFileSync(cleanupPath, cleanupScript);
		console.log(`Cleanup script written to: ${cleanupPath}`);
		
		// Start the cleanup script in detached mode
		const cleanupProcess = spawn('cmd', ['/c', cleanupPath], {
			detached: true,
			stdio: 'ignore',
			windowsHide: true
		});
		
		cleanupProcess.unref();
		console.log('Cleanup script started in detached mode');
		
	} catch (error) {
		console.error('Failed to create cleanup script:', error);
	}
	
	// Kill the entire process tree including this process
	await new Promise<void>((resolve) => {
		exec(`taskkill /pid ${currentPid} /t /f`, (error) => {
			if (error) {
				console.log(`Failed to kill main process tree: ${error.message}`);
			} else {
				console.log('Main process tree killed');
			}
			resolve();
		});
	});
	
	console.log('Nuclear cleanup completed');
}

// Function to kill all tracked child processes
async function killAllChildProcesses(): Promise<void> {
	console.log('Killing all child processes...');
	const killPromises = Array.from(childProcesses).map(child => {
		return new Promise<void>(async (resolve) => {
			if (child && child.pid && !child.killed) {
				try {
					await forceKillProcessTree(child.pid);
					console.log(`Killed child process ${child.pid}`);
				} catch (error) {
					console.error(`Error killing child process ${child.pid}:`, error);
				}
			}
			resolve();
		});
	});
	
	await Promise.all(killPromises);
	childProcesses.clear();
	console.log('All child processes killed');
}

// Comprehensive shutdown function
async function gracefulShutdown(): Promise<void> {
	if (isQuitting) return;
	isQuitting = true;
	
	console.log('Starting graceful shutdown...');
	
	try {
		// Stop all intervals and timeouts first
		console.log('Stopping all intervals and timeouts...');
		if (blinkIntervalId) {
			clearInterval(blinkIntervalId);
			blinkIntervalId = null;
		}
		if (cameraMonitoringInterval) {
			clearInterval(cameraMonitoringInterval);
			cameraMonitoringInterval = null;
		}
		if (exerciseIntervalId) {
			clearInterval(exerciseIntervalId);
			exerciseIntervalId = null;
		}
		if (exerciseSnoozeTimeout) {
			clearTimeout(exerciseSnoozeTimeout);
			exerciseSnoozeTimeout = null;
		}
		if (earThresholdUpdateTimeout) {
			clearTimeout(earThresholdUpdateTimeout);
			earThresholdUpdateTimeout = null;
		}
		
		// Reset flags
		blinkReminderActive = false;
		mgdReminderLoopActive = false;
		isExerciseShowing = false;
		
		// Close all windows
		console.log('Closing all windows...');
		const windows = BrowserWindow.getAllWindows();
		windows.forEach(window => {
			if (!window.isDestroyed()) {
				try {
					window.destroy();
				} catch (error) {
					console.log('Error destroying window:', error);
				}
			}
		});
		
		// Close specific windows
		if (currentPopup && !currentPopup.isDestroyed()) {
			currentPopup.destroy();
			currentPopup = null;
		}
		if (cameraWindow && !cameraWindow.isDestroyed()) {
			cameraWindow.destroy();
			cameraWindow = null;
		}
		if (currentExercisePopup && !currentExercisePopup.isDestroyed()) {
			currentExercisePopup.destroy();
			currentExercisePopup = null;
		}
		if (popupEditorWindow && !popupEditorWindow.isDestroyed()) {
			popupEditorWindow.destroy();
			popupEditorWindow = null;
		}
		
		// Kill all tracked child processes
		console.log('Killing tracked child processes...');
		await killAllChildProcesses();
		
		// Platform-specific cleanup
		if (process.platform === 'win32') {
			// Windows-specific aggressive cleanup
			console.log('Running aggressive Windows cleanup...');
			await aggressiveWindowsCleanup();
		} else {
			// For macOS and other platforms, just wait a moment for processes to die
			await new Promise(resolve => setTimeout(resolve, 500));
		}
		
		// Reset all flags
		isBlinkDetectorRunning = false;
		isCameraReady = false;
		
		console.log('Shutdown complete, exiting...');
		
	} catch (error) {
		console.error('Error during shutdown:', error);
	}
}

// Setup comprehensive shutdown handlers
function setupGracefulShutdown() {
	console.log('Setting up graceful shutdown handlers...');
	
	// Handle before-quit event
	app.on('before-quit', async (event) => {
		console.log('before-quit event triggered');
		if (!isQuitting) {
			event.preventDefault();
			await gracefulShutdown();
			app.quit();
		}
	});
	
	// Platform-specific shutdown handlers
	if (process.platform === 'win32') {
		// Windows-specific comprehensive shutdown handling
		console.log('Setting up Windows-specific shutdown handlers...');
		
		// Handle window-all-closed event for Windows
		app.on('window-all-closed', async () => {
			console.log('window-all-closed event triggered');
			if (!isQuitting) {
				await gracefulShutdown();
				app.quit();
			}
		});
		
		// Handle app will-quit event (last chance)
		app.on('will-quit', async (event) => {
			console.log('will-quit event triggered');
			if (!isQuitting) {
				event.preventDefault();
				await gracefulShutdown();
				app.quit();
			}
		});
		
		// Handle process termination signals
		process.on('SIGINT', async () => {
			console.log('SIGINT received');
			if (!isQuitting) {
				await gracefulShutdown();
				process.exit(0);
			}
		});
		
		process.on('SIGTERM', async () => {
			console.log('SIGTERM received');
			if (!isQuitting) {
				await gracefulShutdown();
				process.exit(0);
			}
		});
		
		// Windows-specific signal
		process.on('SIGBREAK', async () => {
			console.log('SIGBREAK received');
			if (!isQuitting) {
				await gracefulShutdown();
				process.exit(0);
			}
		});
		
		// Handle uncaught exceptions
		process.on('uncaughtException', async (error) => {
			console.error('Uncaught exception:', error);
			if (!isQuitting) {
				await gracefulShutdown();
				process.exit(1);
			}
		});
		
		// Handle unhandled promise rejections
		process.on('unhandledRejection', async (reason, promise) => {
			console.error('Unhandled Rejection at:', promise, 'reason:', reason);
			if (!isQuitting) {
				await gracefulShutdown();
				process.exit(1);
			}
		});
		
		// Windows-specific: Handle console control events
		process.on('SIGBREAK', async () => {
			console.log('Console control event received');
			if (!isQuitting) {
				await gracefulShutdown();
				process.exit(0);
			}
		});
	} else {
		// macOS and other platforms use simpler shutdown handling
		console.log('Setting up macOS/Unix shutdown handlers...');
		
		// Handle uncaught exceptions (minimal handling for macOS)
		process.on('uncaughtException', async (error) => {
			console.error('Uncaught exception:', error);
			if (!isQuitting) {
				await gracefulShutdown();
				process.exit(1);
			}
		});
		
		// Handle unhandled promise rejections (minimal handling for macOS)
		process.on('unhandledRejection', async (reason, promise) => {
			console.error('Unhandled Rejection at:', promise, 'reason:', reason);
			if (!isQuitting) {
				await gracefulShutdown();
				process.exit(1);
			}
		});
	}
	
	console.log('Graceful shutdown handlers setup complete');
}

function createWindow() {
	win = new BrowserWindow({
		width: 500,
		height: 700,
		icon: path.join(process.env.VITE_PUBLIC, "electron-vite.svg"),
		autoHideMenuBar: true,
		webPreferences: {
			preload: path.join(__dirname, "preload.mjs"),
			nodeIntegration: false,
			contextIsolation: true,
			webSecurity: true
		},
	});

	// Show console window in built version for debugging (remove this line for production)
	if (process.platform === 'win32' && !VITE_DEV_SERVER_URL) {
		// Uncomment the next line to show console window in built version
		// win.webContents.openDevTools();
	}

	// Handle window close event (X button clicked)
	win.on('close', (event) => {
		console.log('Main window close event triggered');
		
		if (process.platform === 'darwin') {
			// On macOS, hide the window instead of quitting
			event.preventDefault();
			win?.hide();
		} else {
			// On Windows and other platforms, perform full shutdown
			event.preventDefault();
			
			// Start graceful shutdown with timeout
			const shutdownTimeout = setTimeout(() => {
				console.log('Graceful shutdown timed out, using nuclear option');
				nuclearWindowsCleanup().then(() => {
					process.exit(0);
				});
			}, 5000); // 5 second timeout
			
			// Start graceful shutdown
			gracefulShutdown().then(() => {
				clearTimeout(shutdownTimeout);
				
				// After cleanup is complete, use nuclear option on Windows
				if (process.platform === 'win32') {
					console.log('Using nuclear cleanup to ensure complete termination');
					nuclearWindowsCleanup().then(() => {
						process.exit(0);
					});
				} else {
					// On non-Windows, destroy window and quit normally
					if (win && !win.isDestroyed()) {
						win.destroy();
					}
					app.quit();
				}
			}).catch((error) => {
				console.error('Error during graceful shutdown:', error);
				clearTimeout(shutdownTimeout);
				// Fallback to nuclear cleanup
				nuclearWindowsCleanup().then(() => {
					process.exit(1);
				});
			});
		}
	});

	// Send initial message to renderer
	win.webContents.on("did-finish-load", () => {
		win?.webContents.send("main-process-message", new Date().toLocaleString());
		// Send initial preferences
		win?.webContents.send("load-preferences", {
			...preferences,
			reminderInterval: preferences.reminderInterval / 1000
		});
	});

	if (VITE_DEV_SERVER_URL) {
		win.loadURL(VITE_DEV_SERVER_URL);
	} else {
		win.loadFile(path.join(RENDERER_DIST, "index.html"));
	}
}

function showStartingPopup() {
	if (currentPopup) {
		currentPopup.close();
		currentPopup = null;
	}
	
	const x = preferences.popupPosition.x;
	const y = preferences.popupPosition.y;

	const popup = new BrowserWindow({
		width: preferences.popupSize.width,
		height: preferences.popupSize.height,
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
		type: 'panel', // Float on top of fullscreen apps on macOS
		webPreferences: {
			nodeIntegration: true,
			contextIsolation: false,
		},
	});

	// Set window level to stay on top
	const level = process.platform === 'darwin' ? 'floating' : 'screen-saver';
	popup.setAlwaysOnTop(true, level);
	
	// Make popup visible on all workspaces
	popup.setVisibleOnAllWorkspaces(true, { 
		visibleOnFullScreen: true,
		skipTransformProcessType: true 
	});

	popup.setOpacity(1 - preferences.popupColors.transparency);

	currentPopup = popup;
	popup.loadFile(path.join(process.env.VITE_PUBLIC, "starting.html"));
	popup.webContents.on('did-finish-load', () => {
		popup.webContents.send('update-colors', preferences.popupColors);
		popup.setIgnoreMouseEvents(true);
	});
	popup.once("ready-to-show", () => {
		popup.showInactive();
	});
}

function showBlinkPopup() {
	if (currentPopup) {
		currentPopup.close();
		currentPopup = null;
	}
	
	// Play notification sound
	playNotificationSound('blink');
	
	const x = preferences.popupPosition.x;
	const y = preferences.popupPosition.y;

	const popup = new BrowserWindow({
		width: preferences.popupSize.width,
		height: preferences.popupSize.height,
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
		type: 'panel', // Float on top of fullscreen apps on macOS
		webPreferences: {
			nodeIntegration: true,
			contextIsolation: false,
		},
	});

	// Set window level to stay on top
	const level = process.platform === 'darwin' ? 'floating' : 'screen-saver';
	popup.setAlwaysOnTop(true, level);
	
	// Make popup visible on all workspaces
	popup.setVisibleOnAllWorkspaces(true, { 
		visibleOnFullScreen: true,
		skipTransformProcessType: true 
	});

	popup.setOpacity(1 - preferences.popupColors.transparency);

	currentPopup = popup;
	popup.loadFile(path.join(process.env.VITE_PUBLIC, "blink.html"));
	popup.webContents.on('did-finish-load', () => {
		popup.webContents.send('update-colors', preferences.popupColors);
		popup.webContents.send('update-message', preferences.popupMessage);
		popup.webContents.send('camera-mode', preferences.cameraEnabled);
		popup.setIgnoreMouseEvents(true);
	});
	popup.once("ready-to-show", () => {
		popup.showInactive();
	});

	// Auto-close if camera is not enabled
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

	const x = preferences.popupPosition.x;
	const y = preferences.popupPosition.y;

	const popup = new BrowserWindow({
		width: preferences.popupSize.width,
		height: preferences.popupSize.height,
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
		type: 'panel', // Float on top of fullscreen apps on macOS
		webPreferences: {
			nodeIntegration: true,
			contextIsolation: false,
		},
	});

	// Set window level to stay on top
	const level = process.platform === 'darwin' ? 'floating' : 'screen-saver';
	popup.setAlwaysOnTop(true, level);
	
	// Make popup visible on all workspaces
	popup.setVisibleOnAllWorkspaces(true, { 
		visibleOnFullScreen: true,
		skipTransformProcessType: true 
	});

	popup.setOpacity(1 - preferences.popupColors.transparency);

	currentPopup = popup;
	popup.loadFile(path.join(process.env.VITE_PUBLIC, "stopped.html"));
	popup.webContents.on('did-finish-load', () => {
		popup.webContents.send('update-colors', preferences.popupColors);
		popup.setIgnoreMouseEvents(true);
	});
	popup.once("ready-to-show", () => {
		popup.showInactive();
	});
	
	// Auto-close after 2.5 seconds
	setTimeout(() => {
		if (currentPopup === popup) {
			popup.close();
			currentPopup = null;
		}
	}, 2500);
}

function startBlinkReminderLoop(interval: number) {
	blinkReminderActive = true;
	preferences.reminderInterval = interval;
	
	if (preferences.cameraEnabled) {
		startCameraMonitoring();
		return; 
	}
	
	// Clear any existing interval
	if (blinkIntervalId) {
		clearInterval(blinkIntervalId);
	}
	
	// Show initial popup
	showBlinkPopup();
	
	// Set up interval for subsequent popups
	blinkIntervalId = setInterval(() => {
		if (blinkReminderActive) {
			showBlinkPopup();
		}
	}, preferences.reminderInterval + 2500); // Add 2.5s for popup fade out
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
	
	// Stop camera but keep blink detector process running
	stopCamera();
	
	if (currentPopup) {
		currentPopup.close();
		currentPopup = null;
	}
	
	if (preferences.cameraEnabled) {
		preferences.isTracking = false;
		// Notify renderer to stop camera
		win?.webContents.send('stop-camera');
	}
	
	// Reset camera retry counter when stopping
	cameraRetryCount = 0;
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
				// Start camera monitoring
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

	cameraWindow.loadFile(path.join(process.env.VITE_PUBLIC, 'camera.html'));
	
	// Wait for window to be ready before sending video stream
	cameraWindow.webContents.on('did-finish-load', () => {
		// Request video stream from blink detector process
		if (blinkDetectorProcess && blinkDetectorProcess.stdin) {
			blinkDetectorProcess.stdin.write(JSON.stringify({ 
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


function startBlinkDetector() {
	console.log('startBlinkDetector called, isBlinkDetectorRunning:', isBlinkDetectorRunning);
	if (isBlinkDetectorRunning) {
		console.log('Blink detector already running, skipping...');
		return;
	}
	
	// Kill any existing blink detector processes before starting
	if (process.platform === 'win32') {
		console.log('Killing any existing blink detector processes...');
		exec('taskkill /im blink_detector.exe /f /t', (error) => {
			if (error) {
				console.log('No existing blink detector processes found');
			} else {
				console.log('Killed existing blink detector processes');
			}
		});
	}
	
	// Use the standalone binary instead of Python script
	const binaryPath = isProd
		? path.join(process.resourcesPath, 'app.asar.unpacked', 'electron', 'resources', 'blink_detector')
		: path.join(process.env.APP_ROOT, 'electron', 'resources', 'blink_detector');

	// Add .exe extension for Windows
	const executablePath = process.platform === 'win32' ? binaryPath + '.exe' : binaryPath;

	// Check if binary exists
	if (!existsSync(executablePath)) {
		console.error('Blink detector binary not found. Please run the build script first: cd python && ./build_and_install.sh');
		return;
	}

	console.log('Starting blink detector process:', executablePath);
	isBlinkDetectorRunning = true; // Set flag immediately to prevent race conditions
	
	// Double-check that we don't already have a process
	if (blinkDetectorProcess) {
		console.log('Warning: blinkDetectorProcess already exists, cleaning up...');
		try {
			// More aggressive cleanup of existing process
			if (blinkDetectorProcess.pid) {
				if (process.platform === 'win32') {
					exec(`taskkill /pid ${blinkDetectorProcess.pid} /t /f`, (error) => {
						if (error) {
							console.log('Failed to kill existing process, might already be dead');
						} else {
							console.log('Successfully killed existing process');
						}
					});
				} else {
					blinkDetectorProcess.kill('SIGKILL');
				}
			}
			childProcesses.delete(blinkDetectorProcess);
		} catch (error) {
			console.error('Error killing existing process:', error);
		}
		blinkDetectorProcess = null;
	}
	
	// Wait a moment before starting new process
	setTimeout(() => {
		blinkDetectorProcess = spawn(executablePath, [], {
			stdio: ['pipe', 'pipe', 'pipe'],
			// Windows-specific options for better process management
			...(process.platform === 'win32' && {
				windowsHide: true,
				detached: false,
				shell: false
			})
		});

		// Track the child process
		childProcesses.add(blinkDetectorProcess);
		
		// Remove from tracking when process exits
		blinkDetectorProcess.on('exit', (code: number | null) => {
			console.log(`Blink detector process exited with code: ${code}`);
			childProcesses.delete(blinkDetectorProcess);
			isBlinkDetectorRunning = false;
			blinkDetectorProcess = null;
			isCameraReady = false;
		});

		blinkDetectorProcess.on('error', (error: Error) => {
			console.error('Blink detector process error:', error);
			win?.webContents.send('camera-error', `Process error: ${error.message}`);
			childProcesses.delete(blinkDetectorProcess);
			isBlinkDetectorRunning = false;
			blinkDetectorProcess = null;
			isCameraReady = false;
		});

		let buffer = '';
		blinkDetectorProcess.stdout.on('data', (data: Buffer) => {
			buffer += data.toString();
			
			// Process complete JSON messages
			let newlineIndex;
			while ((newlineIndex = buffer.indexOf('\n')) !== -1) {
				const message = buffer.slice(0, newlineIndex);
				buffer = buffer.slice(newlineIndex + 1);
				
				try {
					const parsed = JSON.parse(message);
					
					// Log all debug messages to console
					if (parsed.debug) {
						console.log('Blink detector debug:', parsed.debug);
					}
					
					if (parsed.blink) {
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
						console.error('Blink detector error:', parsed.error);
						// Send error to renderer for display in dev tools
						win?.webContents.send('camera-error', parsed.error);
						
						// Don't stop the blink detector process on camera errors
						// Instead, just mark camera as not ready and let the retry mechanism handle it
						isCameraReady = false;
						
						// If this is a camera-related error and we're tracking, try to restart camera after a delay
						if (preferences.isTracking && preferences.cameraEnabled && 
							(parsed.error.includes('camera') || parsed.error.includes('permission') || parsed.error.includes('access'))) {
							
							cameraRetryCount++;
							
							if (cameraRetryCount <= MAX_CAMERA_RETRIES) {
								console.log(`Camera error detected, retry ${cameraRetryCount}/${MAX_CAMERA_RETRIES} in 3 seconds...`);
								setTimeout(() => {
									if (preferences.isTracking && preferences.cameraEnabled && isBlinkDetectorRunning) {
										console.log('Retrying camera start after error...');
										startCamera();
									}
								}, 3000);
							} else {
								console.error('Max camera retries reached, stopping attempts');
								win?.webContents.send('camera-error', 'Camera access failed after multiple attempts. Please check camera permissions and restart tracking.');
								// Reset retry count for next time
								cameraRetryCount = 0;
							}
						}
					} else if (parsed.status) {
						console.log('Blink detector status:', parsed.status);
						// If the process is ready, send the initial sensitivity value
						if (parsed.status === "Models loaded successfully, ready for camera activation" && blinkDetectorProcess.stdin) {
							// Send initial configuration with performance optimizations
							const config = {
								ear_threshold: preferences.blinkSensitivity,
								frame_skip: FRAME_SKIP,
								target_fps: 10, // Fixed for efficiency
								processing_resolution: [320, 240] // Fixed for efficiency
							};
							blinkDetectorProcess.stdin.write(JSON.stringify(config) + '\n');
						} else if (parsed.status === "Camera opened successfully" && blinkDetectorProcess.stdin) {
							isCameraReady = true; // Set camera ready flag
							cameraRetryCount = 0; // Reset retry counter on successful camera start
							console.log('Camera started successfully, resetting retry counter');
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
					console.error('Failed to parse blink detector output:', error);
				}
			}
		});

		blinkDetectorProcess.stderr.on('data', (data: Buffer) => {
			console.error('Blink detector stderr:', data.toString());
			// Send stderr to renderer for debugging
			win?.webContents.send('camera-error', `Stderr: ${data.toString()}`);
		});
	}, 500); // Wait 500ms before starting new process
}

function startCamera() {
	if (!isBlinkDetectorRunning || !blinkDetectorProcess || !blinkDetectorProcess.stdin) {
		console.error('Blink detector not running');
		return false;
	}
	
	blinkDetectorProcess.stdin.write(JSON.stringify({ start_camera: true }) + '\n');
	return true;
}

function stopCamera() {
	if (!isBlinkDetectorRunning || !blinkDetectorProcess || !blinkDetectorProcess.stdin) {
		return;
	}
	
	blinkDetectorProcess.stdin.write(JSON.stringify({ stop_camera: true }) + '\n');
	isCameraReady = false;
}

async function startCameraMonitoring() {
	if (cameraMonitoringInterval) {
		clearInterval(cameraMonitoringInterval);
	}
	isCameraReady = false; // Reset camera ready flag
	cameraRetryCount = 0; // Reset retry counter for new tracking session
	
	// Show "Starting" popup immediately when tracking starts
	showStartingPopup();
	
	// Auto-close the initial popup after 2.5 seconds
	setTimeout(() => {
		try {
			if (currentPopup && !currentPopup.isDestroyed()) {
				currentPopup.close();
				currentPopup = null;
			}
		} catch (error) {
			console.log('Initial popup already destroyed');
			currentPopup = null;
		}
	}, 2500);
	
	// Ensure blink detector process is running
	if (!isBlinkDetectorRunning) {
		startBlinkDetector();
	}
	
	if (startCamera()) {
		// Wait for camera to be ready before starting monitoring loop
		const waitForCamera = setInterval(() => {
			if (isBlinkDetectorRunning && isCameraReady) {
				clearInterval(waitForCamera);
				
				// Set lastBlinkTime now that camera is ready
				lastBlinkTime = Date.now();
				
				if (preferences.mgdMode) {
					// In MGD mode, use interval-based approach
					mgdReminderLoopActive = true;
					
					// Clear any existing interval
					if (blinkIntervalId) {
						clearInterval(blinkIntervalId);
					}
					
					// Set up interval for subsequent popups
					blinkIntervalId = setInterval(() => {
						if (mgdReminderLoopActive && preferences.isTracking && preferences.mgdMode && isBlinkDetectorRunning) {
							showBlinkPopup();
						}
					}, preferences.reminderInterval + 2500); // Add 2.5s for popup fade out
				} else {
					// Normal mode - only show popup if no blink detected
					cameraMonitoringInterval = setInterval(() => {
						const timeSinceLastBlink = Date.now() - lastBlinkTime;
						if (timeSinceLastBlink >= preferences.reminderInterval && !currentPopup && isBlinkDetectorRunning) {
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
		}, 100); // Check every 100ms for camera readiness
	} else {
		console.error('Failed to start camera initially, but will keep trying...');
		// Don't send error immediately, let the retry mechanism handle it
		// The Python process will retry internally, and we'll retry from the error handler
	}
}

ipcMain.on("blink-detected", () => {
	lastBlinkTime = Date.now();
	
	// Close popup in both normal and MGD modes
	// The Python process now handles frame skipping internally
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

ipcMain.on("start-blink-reminders", (_event, interval: number) => {
	// Close any existing popup when starting/restarting
	if (currentPopup) {
		currentPopup.close();
		currentPopup = null;
	}
	preferences.isTracking = true;
	if (preferences.cameraEnabled) {
		// Start camera monitoring (lastBlinkTime will be set when camera is ready)
		startCameraMonitoring();
	} else {
		startBlinkReminderLoop(interval);
	}
});

ipcMain.on("stop-blink-reminders", () => {
	stopBlinkReminderLoop();
	preferences.isTracking = false;
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
	
	// Update transparency of current popup if it exists
	if (currentPopup && !currentPopup.isDestroyed()) {
		currentPopup.setOpacity(1 - colors.transparency);
	}
	
	// Update transparency of popup editor window if it exists
	if (popupEditorWindow && !popupEditorWindow.isDestroyed()) {
		popupEditorWindow.setOpacity(1 - colors.transparency);
	}
});

ipcMain.on("update-popup-transparency", (_event, transparency: number) => {
	preferences.popupColors.transparency = transparency;
	store.set('popupColors', preferences.popupColors);
	
	// Update transparency of current popup if it exists
	if (currentPopup && !currentPopup.isDestroyed()) {
		currentPopup.setOpacity(1 - transparency);
	}
	
	// Update transparency of popup editor window if it exists
	if (popupEditorWindow && !popupEditorWindow.isDestroyed()) {
		popupEditorWindow.setOpacity(1 - transparency);
	}
});

ipcMain.on("update-popup-message", (_event, message: string) => {
	preferences.popupMessage = message;
	store.set('popupMessage', message);
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

ipcMain.on("update-exercise-interval", (_event, interval: number) => {
	preferences.exerciseInterval = interval;
	store.set('exerciseInterval', interval);
	
	// Restart exercise monitoring if it's currently enabled to apply the new interval
	if (preferences.eyeExercisesEnabled) {
		stopExerciseMonitoring();
		startExerciseMonitoring();
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
		if (blinkDetectorProcess && blinkDetectorProcess.stdin) {
			blinkDetectorProcess.stdin.write(JSON.stringify({ ear_threshold: sensitivity }) + '\n');
		}
	}, 500);
});

function showExercisePopup() {
	// Prevent overlapping exercises
	if (isExerciseShowing || currentExercisePopup) {
		return;
	}

	// Play notification sound
	playNotificationSound('exercise');

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
		type: 'panel', // Enable floating on top of full-screened apps on macOS
		webPreferences: {
			nodeIntegration: true,
			contextIsolation: false,
		},
	});

	// Set window level to stay on top of fullscreen applications
	// Use 'floating' for macOS and 'screen-saver' for other platforms
	const level = process.platform === 'darwin' ? 'floating' : 'screen-saver';
	popup.setAlwaysOnTop(true, level);
	
	// Make popup visible on all workspaces and fullscreen applications
	// Use skipTransformProcessType to prevent dock hiding
	popup.setVisibleOnAllWorkspaces(true, { 
		visibleOnFullScreen: true,
		skipTransformProcessType: true 
	});

	currentExercisePopup = popup;
	popup.loadFile(path.join(process.env.VITE_PUBLIC, "exercise.html"));
	
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
			timeSinceLastExercise >= preferences.exerciseInterval * 60 * 1000) {
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

// Add IPC handler for sound preference
ipcMain.on("update-sound-enabled", (_event, enabled: boolean) => {
	preferences.soundEnabled = enabled;
	store.set('soundEnabled', enabled);
});

// Add IPC handler for performance mode
// Removed as performance mode is no longer configurable - using fixed efficient values

// Add cleanup for Python process in the app quit handler
app.on('before-quit', () => {
	gracefulShutdown();
});

// Add system sleep/wake handlers
powerMonitor.on('suspend', () => {
	// Store current state before sleep
	wasTrackingBeforeSleep = preferences.isTracking;
	wasCameraEnabledBeforeSleep = preferences.cameraEnabled;
	
	// Stop camera but keep blink detector process running
	stopCamera();
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
	// Reset exercise timer when computer wakes from sleep
	// This ensures exercise popup shows 20 minutes after user returns
	store.set('lastExerciseTime', Date.now());
	
	// If reminders were active and camera was enabled before sleep, restart them
	if (wasTrackingBeforeSleep && wasCameraEnabledBeforeSleep) {
		// Reset last blink time and start camera monitoring
		lastBlinkTime = Date.now();
		
		// Ensure blink detector is running (it should be from app startup)
		if (!isBlinkDetectorRunning) {
			console.log('Blink detector not running after resume, starting...');
			startBlinkDetector();
		} else {
			console.log('Blink detector already running after resume');
		}
		
		// Wait a brief moment to ensure blink detector process is ready
		setTimeout(() => {
			if (isBlinkDetectorRunning) {
				// Start camera monitoring (which will start the camera)
				startCameraMonitoring();
			} else {
				// If blink detector process failed to start, stop tracking
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
// Note: This is now handled in setupGracefulShutdown() with platform-specific logic

app.on("activate", () => {
	// On macOS, show the main window when dock icon is clicked
	if (process.platform === 'darwin') {
		if (win && !win.isDestroyed()) {
			// If window exists but is hidden, show it
			if (!win.isVisible()) {
				win.show();
			}
			win.focus();
		} else {
			// If window doesn't exist, create a new one
			createWindow();
		}
	} else {
		// On other platforms, re-create a window if none exist
		if (BrowserWindow.getAllWindows().length === 0) {
			createWindow();
		}
	}
});

app.whenReady().then(() => {
	// Setup comprehensive shutdown handlers
	setupGracefulShutdown();
	
	createWindow();
	// Register the initial shortcut
	registerGlobalShortcut(preferences.keyboardShortcut);
	
	// Reset exercise timer when app starts
	store.set('lastExerciseTime', Date.now());
	
	if (preferences.eyeExercisesEnabled) {
		startExerciseMonitoring();
	}
	
	// Initialize blink detector on app startup (in standby mode)
	if (!isBlinkDetectorRunning) {
		console.log('Starting blink detector on app startup...');
		startBlinkDetector();
	} else {
		console.log('Blink detector already running on app startup');
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

function showPopupEditor() {
	if (popupEditorWindow) {
		popupEditorWindow.focus();
		return;
	}

	// Start at current popup size and position
	const width = preferences.popupSize.width;
	const height = preferences.popupSize.height;
	const x = preferences.popupPosition.x;
	const y = preferences.popupPosition.y;

	popupEditorWindow = new BrowserWindow({
		width: width,
		height: height,
		x,
		y,
		minWidth: 200,
		minHeight: 80,
		resizable: true,
		frame: false,
		transparent: true,
		alwaysOnTop: true,
		skipTaskbar: true,
		focusable: true,
		show: false,
		hasShadow: false,
		movable: true,
		type: 'panel', // Enable floating on top of full-screened apps on macOS
		webPreferences: {
			nodeIntegration: true,
			contextIsolation: false,
		},
	});

	// Set window level to stay on top of fullscreen applications
	// Use 'floating' for macOS and 'screen-saver' for other platforms
	const level = process.platform === 'darwin' ? 'floating' : 'screen-saver';
	popupEditorWindow.setAlwaysOnTop(true, level);
	
	// Make popup visible on all workspaces and fullscreen applications
	// Use skipTransformProcessType to prevent dock hiding
	popupEditorWindow.setVisibleOnAllWorkspaces(true, { 
		visibleOnFullScreen: true,
		skipTransformProcessType: true 
	});

	// Set initial transparency
	popupEditorWindow.setOpacity(1 - preferences.popupColors.transparency);

	popupEditorWindow.loadFile(path.join(process.env.VITE_PUBLIC, "popup-editor.html"));
	
	popupEditorWindow.webContents.on('did-finish-load', () => {
		popupEditorWindow?.webContents.send('update-colors', preferences.popupColors);
		popupEditorWindow?.webContents.send('current-popup-state', {
			size: preferences.popupSize,
			position: preferences.popupPosition
		});
	});
	
	popupEditorWindow.once("ready-to-show", () => {
		popupEditorWindow?.show();
	});

	popupEditorWindow.on('closed', () => {
		popupEditorWindow = null;
	});
}

// Replace the show-position-editor and show-size-editor handlers with a single handler
ipcMain.on("show-popup-editor", () => {
	showPopupEditor();
});

// Add handler for the combined save event
ipcMain.on("popup-editor-saved", (_event, { size, position }) => {
	preferences.popupSize = size;
	preferences.popupPosition = position;
	store.set('popupSize', size);
	store.set('popupPosition', position);
	
	// If there's an active popup, update its size and position
	if (currentPopup && !currentPopup.isDestroyed()) {
		currentPopup.setSize(size.width, size.height);
		currentPopup.setPosition(position.x, position.y);
	}

	// Notify renderer of updated preferences
	win?.webContents.send('load-preferences', {
		...preferences,
		reminderInterval: preferences.reminderInterval / 1000
	});
});

ipcMain.on('reset-preferences', () => {
  // Stop any active reminders first
  if (preferences.isTracking) {
    stopBlinkReminderLoop();
    showStoppedPopup();
  }
  
  // Stop exercise monitoring if active
  stopExerciseMonitoring();
  
  // Clear all stored preferences
  store.clear();
  
  
  // Reset preferences to defaults
  preferences.darkMode = true;
  preferences.reminderInterval = 5000;
  preferences.cameraEnabled = false;
  preferences.eyeExercisesEnabled = true;
  preferences.exerciseInterval = 20;
  preferences.popupPosition = { x: 40, y: 40 };
  preferences.popupSize = { width: 220, height: 80 };
  preferences.popupColors = {
    background: '#FFFFFF',
    text: '#00FF11',
    transparency: 0.3
  };
  preferences.popupMessage = 'Blink!';
  preferences.isTracking = false;
  preferences.keyboardShortcut = 'Ctrl+I';
  preferences.blinkSensitivity = 0.20;
  preferences.mgdMode = false;
  preferences.soundEnabled = false;
  
  // Re-register the default keyboard shortcut
  registerGlobalShortcut(preferences.keyboardShortcut);
  
  // Notify renderer of updated preferences
  win?.webContents.send('load-preferences', {
    ...preferences,
    reminderInterval: preferences.reminderInterval / 1000
  });
});

// Add sound playing function
function playNotificationSound(soundType: 'blink' | 'exercise' | 'stopped' = 'blink') {
	if (preferences.soundEnabled) {
		let soundFileName: string;
		
		switch (soundType) {
			case 'exercise':
				soundFileName = 'exercisePopup.mp3';
				break;
			case 'stopped':
				soundFileName = 'stoppedPopup.mp3';
				break;
			case 'blink':
			default:
				soundFileName = 'notification.mp3';
				break;
		}
		
		const soundPath = isProd
			? path.join(process.resourcesPath, 'app.asar.unpacked', 'public', 'sounds', soundFileName)
			: path.join(process.env.APP_ROOT, 'public', 'sounds', soundFileName);
				
		// Create a hidden window to play the sound
		const soundWindow = new BrowserWindow({
			width: 1,
			height: 1,
			show: false,
			webPreferences: {
				nodeIntegration: true,
				contextIsolation: false,
			},
		});
		
		soundWindow.loadFile(path.join(process.env.VITE_PUBLIC, 'sound-player.html'));
		soundWindow.webContents.on('did-finish-load', () => {
			soundWindow.webContents.send('play-sound', soundPath);
		});
		
		// Close the window after playing
		setTimeout(() => {
			if (!soundWindow.isDestroyed()) {
				soundWindow.close();
			}
		}, 1000);
	}
}
