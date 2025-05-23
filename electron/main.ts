import { app, BrowserWindow, ipcMain, screen } from "electron";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import path from "node:path";

createRequire(import.meta.url);
const __dirname = path.dirname(fileURLToPath(import.meta.url));

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
let popupPosition = 'top-right';
let currentInterval = 5000;
let popupColors = {
	background: '#1E1E1E',
	text: '#FFFFFF',
	opacity: 0.5
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
	
	switch (popupPosition) {
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
		webPreferences: {
			nodeIntegration: true,
			contextIsolation: false,
		},
	});
	popup.loadFile(path.join(process.env.APP_ROOT, "electron", "blink.html"));
	popup.webContents.on('did-finish-load', () => {
		popup.webContents.send('update-colors', popupColors);
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
	currentInterval = interval;
	while (blinkReminderActive) {
		await new Promise((resolve) => {
			showBlinkPopup();
			setTimeout(resolve, 2500); // Wait for popup to fade out
		});
		if (!blinkReminderActive) break;
		await new Promise((resolve) => setTimeout(resolve, currentInterval));
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
	popupPosition = position;
});

ipcMain.on("update-interval", (event, interval: number) => {
	currentInterval = interval;
});

ipcMain.on("update-popup-colors", (event, colors) => {
	popupColors = colors;
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
