import { app, BrowserWindow, ipcMain, screen } from "electron";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import path from "node:path";
import Store from 'electron-store';

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

// Load all preferences from store
const preferences = {
	darkMode: store.get('darkMode', false) as boolean,
	reminderInterval: store.get('reminderInterval', 5000) as number,
	cameraEnabled: store.get('cameraEnabled', false) as boolean,
	eyeExercisesEnabled: store.get('eyeExercisesEnabled', true) as boolean,
	popupPosition: store.get('popupPosition', 'top-right') as string,
	popupColors: store.get('popupColors', {
		background: '#1E1E1E',
		text: '#FFFFFF',
		opacity: 0.5
	}) as {
		background: string;
		text: string;
		opacity: number;
	},
	isTracking: false,
	keyboardShortcut: store.get('keyboardShortcut', 'Ctrl+Shift+B') as string
};

function createWindow() {
	win = new BrowserWindow({
		width: 500,
		height: 700,
		icon: path.join(process.env.VITE_PUBLIC, "electron-vite.svg"),
		webPreferences: {
			preload: path.join(__dirname, "preload.mjs"),
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
	popup.loadFile(path.join(process.env.APP_ROOT, "electron", "blink.html"));
	popup.webContents.on('did-finish-load', () => {
		popup.webContents.send('update-colors', preferences.popupColors);
		popup.setIgnoreMouseEvents(true);
	});
	popup.once("ready-to-show", () => {
		popup.showInactive();
	});
	setTimeout(() => {
		popup.close();
	}, 2500);
}

async function startBlinkReminderLoop(interval: number) {
	blinkReminderActive = true;
	preferences.reminderInterval = interval;
	while (blinkReminderActive) {
		await new Promise((resolve) => {
			showBlinkPopup();
			setTimeout(resolve, 2500); // Wait for popup to fade out
		});
		if (!blinkReminderActive) break;
		await new Promise((resolve) => setTimeout(resolve, preferences.reminderInterval));
	}
}

ipcMain.on("start-blink-reminders", (event, interval: number) => {
	blinkReminderActive = false;
	if (blinkIntervalId) clearInterval(blinkIntervalId);
	startBlinkReminderLoop(interval);
});

ipcMain.on("stop-blink-reminders", () => {
	blinkReminderActive = false;
	if (blinkIntervalId) {
		clearInterval(blinkIntervalId);
		blinkIntervalId = null;
	}
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
});

ipcMain.on("update-eye-exercises-enabled", (event, enabled: boolean) => {
	preferences.eyeExercisesEnabled = enabled;
	store.set('eyeExercisesEnabled', enabled);
});

ipcMain.on("update-keyboard-shortcut", (event, shortcut: string) => {
	preferences.keyboardShortcut = shortcut;
	store.set('keyboardShortcut', shortcut);
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

app.whenReady().then(createWindow);
