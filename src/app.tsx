import {
	Activity,
	Camera,
	Clock,
	Dumbbell,
	Eye,
	Moon,
	Palette,
	Play,
	Settings,
	Square,
	Sun,
	Volume2,
	VolumeX,
	Zap,
} from "lucide-react";
import { useCallback, useEffect, useState } from "react";

interface PopupColors {
	background: string;
	text: string;
	transparency: number;
}

interface UserPreferences {
	darkMode: boolean;
	reminderInterval: number;
	cameraEnabled: boolean;
	eyeExercisesEnabled: boolean;
	exerciseInterval: number;
	popupPosition: string;
	popupSize: { width: number; height: number };
	popupColors: PopupColors;
	popupMessage: string;
	isTracking: boolean;
	keyboardShortcut: string;
	mgdMode: boolean;
	showMgdInfo: boolean;
	showPopupColors: boolean;
	soundEnabled: boolean;
}

const DEFAULT_PREFERENCES: UserPreferences = {
	darkMode: true,
	reminderInterval: 5,
	cameraEnabled: false,
	eyeExercisesEnabled: true,
	exerciseInterval: 20,
	popupPosition: "top-right",
	popupSize: { width: 300, height: 120 },
	popupColors: {
		background: "#FFFFFF",
		text: "#00FF40",
		transparency: 0.3,
	},
	popupMessage: "Blink!",
	isTracking: false,
	keyboardShortcut: "Ctrl+I",
	mgdMode: false,
	showMgdInfo: false,
	showPopupColors: false,
	soundEnabled: false,
};

export default function ScreenBlinkHomepage() {
	useEffect(() => {
		const style = document.createElement("style");
		style.textContent = `
      @keyframes fadeOut {
        from { opacity: 1; transform: translateY(0); }
        to { opacity: 0; transform: translateY(-20px); }
      }
      .animate-fade-out {
        animation: fadeOut 1s ease-out forwards;
      }
    `;
		document.head.appendChild(style);
		return () => style.remove();
	}, []);

	const [preferences, setPreferences] = useState<UserPreferences>(() => {
		return DEFAULT_PREFERENCES;
	});
	const [isRecordingShortcut, setIsRecordingShortcut] = useState(false);
	const [tempShortcut, setTempShortcut] = useState("");
	const [shortcutError, setShortcutError] = useState("");
	const [isCameraWindowOpen, setIsCameraWindowOpen] = useState(false);
	const [isEditingMessage, setIsEditingMessage] = useState(false);
	const [tempMessage, setTempMessage] = useState("");
	const [cameraError, setCameraError] = useState<string | null>(null);

	// Load preferences from main process
	useEffect(() => {
		const handlePreferences = (savedPreferences: any) => {
			setPreferences((prev) => ({
				...prev,
				...savedPreferences,
			}));
		};

		window.ipcRenderer?.on("load-preferences", handlePreferences);

		return () => {
			window.ipcRenderer?.off("load-preferences", handlePreferences);
		};
	}, []);

	useEffect(() => {
		const handleCameraError = (_event: any, error: string) => {
			console.error("Camera error:", error);
			setCameraError(error);

			// Clear error after 10 seconds
			setTimeout(() => {
				setCameraError(null);
			}, 10000);
		};

		window.ipcRenderer?.on("camera-error", handleCameraError);

		return () => {
			window.ipcRenderer?.off("camera-error", handleCameraError);
		};
	}, []);

	useEffect(() => {
		const handleShortcutError = (_event: any, shortcut: string | null) => {
			if (shortcut) {
				setShortcutError(
					"Invalid shortcut: " +
						shortcut +
						". Please use only ASCII characters and valid combinations.",
				);
				setIsRecordingShortcut(true);
			} else {
				setShortcutError("");
			}
		};
		window.ipcRenderer?.on("shortcut-error", handleShortcutError);
		return () => {
			window.ipcRenderer?.off("shortcut-error", handleShortcutError);
		};
	}, []);

	const validateShortcut = useCallback((shortcut: string): boolean => {
		if (!shortcut) return false;
		const parts = shortcut.split("+");
		if (parts.length < 2) return false;
		return true;
	}, []);

	const isAscii = (str: string) => /^[\x00-\x7F]*$/.test(str);

	const handleSaveShortcut = useCallback(() => {
		if (!isAscii(tempShortcut)) {
			setShortcutError("Shortcut must only contain ASCII characters.");
			return;
		}
		if (validateShortcut(tempShortcut)) {
			setPreferences((prev) => ({ ...prev, keyboardShortcut: tempShortcut }));
			setIsRecordingShortcut(false);
			setShortcutError("");
			window.ipcRenderer?.send("update-keyboard-shortcut", tempShortcut);
		} else {
			setShortcutError(
				"Please use at least one modifier key (Ctrl, Shift, Alt) and one regular key",
			);
		}
	}, [tempShortcut, validateShortcut]);

	// Update main process whenever preferences change
	useEffect(() => {
		if (preferences.darkMode) {
			document.documentElement.classList.add("dark");
		} else {
			document.documentElement.classList.remove("dark");
		}

		window.ipcRenderer?.send("update-dark-mode", preferences.darkMode);
		window.ipcRenderer?.send(
			"update-camera-enabled",
			preferences.cameraEnabled,
		);
		window.ipcRenderer?.send(
			"update-eye-exercises-enabled",
			preferences.eyeExercisesEnabled,
		);
		window.ipcRenderer?.send(
			"update-exercise-interval",
			preferences.exerciseInterval,
		);
		window.ipcRenderer?.send("update-popup-colors", preferences.popupColors);
		window.ipcRenderer?.send(
			"update-popup-transparency",
			preferences.popupColors.transparency,
		);
		window.ipcRenderer?.send("update-popup-message", preferences.popupMessage);
		window.ipcRenderer?.send(
			"update-interval",
			preferences.reminderInterval * 1000,
		);
		window.ipcRenderer?.send(
			"update-keyboard-shortcut",
			preferences.keyboardShortcut,
		);
		window.ipcRenderer?.send("update-sound-enabled", preferences.soundEnabled);
	}, [preferences]);

	useEffect(() => {
		const handleKeyDown = (e: KeyboardEvent) => {
			if (isRecordingShortcut) {
				e.preventDefault();

				if (e.key === "Enter") {
					handleSaveShortcut();
					return;
				}
				if (e.key === "Escape") {
					setIsRecordingShortcut(false);
					setTempShortcut("");
					setShortcutError("");
					return;
				}

				const keys = [];
				if (e.ctrlKey) keys.push("Ctrl");
				if (e.shiftKey) keys.push("Shift");
				if (e.altKey) keys.push("Alt");
				if (e.metaKey) keys.push("Meta");

				// Only add the key if it's not a modifier
				if (
					!["Control", "Shift", "Alt", "Meta", "Enter", "Escape"].includes(
						e.key,
					)
				) {
					keys.push(e.key.toUpperCase());
				}

				if (keys.length > 0) {
					setTempShortcut(keys.join("+"));
				}
			} else if (preferences.keyboardShortcut) {
				const pressedKeys = [];

				if (e.ctrlKey) pressedKeys.push("Ctrl");
				if (e.shiftKey) pressedKeys.push("Shift");
				if (e.altKey) pressedKeys.push("Alt");
				if (e.metaKey) pressedKeys.push("Meta");
				if (!["Control", "Shift", "Alt", "Meta"].includes(e.key)) {
					pressedKeys.push(e.key.toUpperCase());
				}

				if (pressedKeys.join("+") === preferences.keyboardShortcut) {
					e.preventDefault(); // Prevent default browser behavior

					// First update the state
					setPreferences((prev) => ({ ...prev, isTracking: !prev.isTracking }));

					if (preferences.isTracking) {
						window.ipcRenderer?.send("stop-blink-reminders");
					} else {
						window.ipcRenderer?.send(
							"start-blink-reminders",
							preferences.reminderInterval * 1000,
						);
					}
				}
			}
		};

		window.addEventListener("keydown", handleKeyDown);
		return () => window.removeEventListener("keydown", handleKeyDown);
	}, [
		isRecordingShortcut,
		preferences.keyboardShortcut,
		preferences.isTracking,
		preferences.reminderInterval,
		tempShortcut,
		handleSaveShortcut,
	]);

	useEffect(() => {
		const handleCameraWindowClosed = () => setIsCameraWindowOpen(false);
		window.ipcRenderer?.on("camera-window-closed", handleCameraWindowClosed);
		return () => {
			window.ipcRenderer?.off("camera-window-closed", handleCameraWindowClosed);
		};
	}, []);

	const handleStartStop = () => {
		setPreferences((prev) => ({ ...prev, isTracking: !prev.isTracking }));
		if (!preferences.isTracking) {
			window.ipcRenderer?.send(
				"start-blink-reminders",
				preferences.reminderInterval * 1000,
			);
		} else {
			window.ipcRenderer?.send("stop-blink-reminders");
		}
	};

	// Add reset preferences function
	const handleResetPreferences = () => {
		if (
			window.confirm(
				"Are you sure you want to reset all preferences to default values?",
			)
		) {
			window.ipcRenderer?.send("reset-preferences");
		}
	};

	return (
		<div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 dark:from-gray-900 dark:to-gray-800 p-4 sm:p-6">
			<div className="max-w-4xl mx-auto">
				{/* Header */}
				<div className="text-center mb-6 sm:mb-8">
					<div className="flex justify-center items-center gap-2 sm:gap-3 mb-3 sm:mb-4">
						<Eye className="w-10 h-10 sm:w-12 sm:h-12 text-blue-600 dark:text-blue-400" />
						<h1 className="text-3xl sm:text-4xl font-bold text-gray-800 dark:text-white">
							ScreenBlink
						</h1>
					</div>
					<p className="text-base sm:text-lg text-gray-600 dark:text-gray-300 px-4">
						Keep your eyes healthy with smart blink reminders
					</p>
				</div>

				{/* Camera Error Banner */}
				{cameraError && (
					<div className="bg-red-100 dark:bg-red-900/30 border border-red-300 dark:border-red-700 text-red-700 dark:text-red-300 px-4 py-3 rounded-lg mx-4 mt-4">
						<div className="flex items-center justify-between">
							<div className="flex items-center gap-2">
								<Camera className="w-4 h-4" />
								<span className="font-medium">Camera Error:</span>
								<span>{cameraError}</span>
							</div>
							<button
								onClick={() => setCameraError(null)}
								className="text-red-500 hover:text-red-700 dark:text-red-400 dark:hover:text-red-200"
							>
								×
							</button>
						</div>
					</div>
				)}

				{/* Main Control Panel */}
				<div className="bg-white dark:bg-gray-800 rounded-2xl shadow-xl p-4 sm:p-6 lg:p-8 mb-6">
					<div className="grid lg:grid-cols-2 gap-6 lg:gap-8">
						{/* Left Column - Main Controls */}
						<div className="space-y-6">
							<div className="flex justify-between items-center">
								<h2 className="text-xl sm:text-2xl font-semibold text-gray-800 dark:text-white flex items-center gap-2">
									<Settings className="w-5 h-5 sm:w-6 sm:h-6" />
									Control Panel
								</h2>
								<button
									onClick={() =>
										setPreferences((prev) => ({
											...prev,
											darkMode: !prev.darkMode,
										}))
									}
									className="p-2 rounded-lg bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors"
									aria-label="Toggle dark mode"
								>
									{preferences.darkMode ? (
										<Sun className="w-5 h-5 text-yellow-500" />
									) : (
										<Moon className="w-5 h-5 text-gray-600" />
									)}
								</button>
							</div>

							{/* Reminder Interval Setting */}
							<div className="bg-gray-50 dark:bg-gray-700 rounded-lg p-4 sm:p-6">
								<label className="block text-sm font-medium text-gray-700 dark:text-gray-200 mb-3 flex items-center gap-2">
									<Clock className="w-4 h-4" />
									Reminder Interval
								</label>
								<div className="flex flex-col sm:flex-row items-center gap-3 sm:gap-4">
									<input
										type="range"
										min="1"
										max="10"
										value={preferences.reminderInterval}
										onChange={(e) => {
											const newInterval = Number.parseInt(e.target.value);
											setPreferences((prev) => ({
												...prev,
												reminderInterval: newInterval,
											}));
											if (preferences.isTracking) {
												window.ipcRenderer?.send(
													"update-interval",
													newInterval * 1000,
												);
											}
										}}
										className="w-full sm:flex-1 h-2 bg-blue-200 dark:bg-blue-900 rounded-lg appearance-none cursor-pointer"
										style={{
											background: `linear-gradient(to right, #3B82F6 0%, #3B82F6 ${((preferences.reminderInterval - 1) / 9) * 100}%, ${preferences.darkMode ? "#1E3A8A" : "#E5E7EB"} ${((preferences.reminderInterval - 1) / 9) * 100}%, ${preferences.darkMode ? "#1E3A8A" : "#E5E7EB"} 100%)`,
										}}
									/>
									<div className="bg-blue-100 dark:bg-blue-900 text-blue-800 dark:text-blue-200 px-3 py-1 rounded-full font-semibold min-w-[80px] text-center">
										{preferences.reminderInterval}s
									</div>
								</div>
								<p className="text-xs sm:text-sm text-gray-500 dark:text-gray-400 mt-2">
									{preferences.cameraEnabled
										? `Show reminder if you haven't blinked for ${preferences.reminderInterval} second${preferences.reminderInterval !== 1 ? "s" : ""}`
										: `Show reminder every ${preferences.reminderInterval} second${preferences.reminderInterval !== 1 ? "s" : ""}`
									}
								</p>
							</div>

							{/* Start/Stop Button */}
							<div className="text-center">
								<button
									onClick={handleStartStop}
									className={`inline-flex items-center gap-2 sm:gap-3 px-6 sm:px-8 py-3 sm:py-4 rounded-xl text-base sm:text-lg font-semibold transition-all duration-200 transform hover:scale-105 active:scale-95 ${
										preferences.isTracking
											? "bg-red-500 hover:bg-red-600 text-white shadow-lg shadow-red-200 dark:shadow-red-900/30"
											: "bg-green-500 hover:bg-green-600 text-white shadow-lg shadow-green-200 dark:shadow-green-900/30"
									}`}
								>
									{preferences.isTracking ? (
										<>
											<Square className="w-5 h-5 sm:w-6 sm:h-6" />
											Stop Reminders
										</>
									) : (
										<>
											<Play className="w-5 h-5 sm:w-6 sm:h-6" />
											Start Reminders
										</>
									)}
								</button>

								{preferences.isTracking && (
									<div className="mt-4 flex items-center justify-center gap-2 text-green-600 dark:text-green-400">
										<Activity className="w-4 h-4" />
										<span className="text-sm font-medium">
											Reminders active
										</span>
									</div>
								)}
							</div>

							{/* Camera Toggle */}
							<div className="flex items-center justify-between bg-gray-50 dark:bg-gray-700 rounded-lg p-4">
								<label className="flex items-center gap-2 text-sm font-medium text-gray-700 dark:text-gray-200">
									<Camera className="w-4 h-4" />
									Camera Detection
								</label>
								<div className="flex items-center gap-2">
									{preferences.isTracking &&
										preferences.cameraEnabled &&
										(isCameraWindowOpen ? (
											<button
												onClick={() => {
													window.ipcRenderer?.send("close-camera-window");
													setIsCameraWindowOpen(false);
												}}
												className="px-3 py-1 text-sm bg-red-600 text-white rounded hover:bg-red-700 transition-colors"
											>
												Stop Showing
											</button>
										) : (
											<button
												onClick={() => {
													window.ipcRenderer?.send("show-camera-window");
													setIsCameraWindowOpen(true);
												}}
												className="px-3 py-1 text-sm bg-blue-600 text-white rounded hover:bg-blue-700 transition-colors"
											>
												Show Camera
											</button>
										))}
									<button
										onClick={() => {
											const newCameraEnabled = !preferences.cameraEnabled;

											// If reminders are active, stop them first
											if (preferences.isTracking) {
												window.ipcRenderer?.send("stop-blink-reminders");
												// Wait a brief moment to ensure reminders are stopped before updating camera setting
												setTimeout(() => {
													setPreferences((prev) => ({
														...prev,
														isTracking: false,
														cameraEnabled: newCameraEnabled,
													}));

													if (newCameraEnabled) {
														window.ipcRenderer?.send("start-camera-tracking");
													} else {
														window.ipcRenderer?.send("stop-camera-tracking");
													}
												}, 100);
											} else {
												// If reminders are not active, just update the camera setting
												setPreferences((prev) => ({
													...prev,
													cameraEnabled: newCameraEnabled,
												}));

												if (newCameraEnabled) {
													window.ipcRenderer?.send("start-camera-tracking");
												} else {
													window.ipcRenderer?.send("stop-camera-tracking");
												}
											}
										}}
										className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 ${
											preferences.cameraEnabled
												? "bg-blue-600"
												: "bg-gray-200 dark:bg-gray-600"
										}`}
									>
										<span
											className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
												preferences.cameraEnabled
													? "translate-x-6"
													: "translate-x-1"
											}`}
										/>
									</button>
								</div>
							</div>

							{/* Blink Detection Sensitivity - Only shown when camera is enabled */}
							{preferences.cameraEnabled && (
								<div className="space-y-4">


									{/* MGD Toggle Box */}
									<div className="bg-gray-50 dark:bg-gray-700 rounded-lg p-4">
										<div className="flex items-center justify-between mb-3">
											<div className="flex items-center gap-2">
												<Activity className="w-4 h-4 text-gray-600 dark:text-gray-400" />
												<span className="text-sm font-medium text-gray-700 dark:text-gray-200">
													Meibomian Gland Dysfunction (MGD) Mode
												</span>
											</div>
											<button
												onClick={() => {
													const newMgdMode = !preferences.mgdMode;
													// If reminders are active, stop them first
													if (preferences.isTracking) {
														window.ipcRenderer?.send("stop-blink-reminders");
														setPreferences((prev) => ({
															...prev,
															isTracking: false,
															mgdMode: newMgdMode,
														}));
													} else {
														setPreferences((prev) => ({
															...prev,
															mgdMode: newMgdMode,
														}));
													}
													window.ipcRenderer?.send(
														"update-mgd-mode",
														newMgdMode,
													);
												}}
												className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
													preferences.mgdMode
														? "bg-blue-600"
														: "bg-gray-300 dark:bg-gray-600"
												}`}
											>
												<span
													className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
														preferences.mgdMode
															? "translate-x-6"
															: "translate-x-1"
													}`}
												/>
											</button>
										</div>
										<div className="flex items-center gap-2">
											<button
												onClick={() =>
													setPreferences((prev) => ({
														...prev,
														showMgdInfo: !prev.showMgdInfo,
													}))
												}
												className="text-xs text-blue-600 dark:text-blue-400 hover:text-blue-700 dark:hover:text-blue-300 transition-colors"
											>
												{preferences.showMgdInfo ? "Hide Info" : "Learn More"}
											</button>
											{preferences.mgdMode && (
												<span className="text-xs text-green-600 dark:text-green-400 bg-green-50 dark:bg-green-900/30 px-2 py-1 rounded">
													MGD mode is active
												</span>
											)}
										</div>
										{preferences.showMgdInfo && (
											<div className="mt-2 p-3 bg-blue-50 dark:bg-blue-900/30 rounded-lg">
												<p className="text-xs sm:text-sm text-gray-600 dark:text-gray-400">
													MGD is a common condition where the meibomian glands
													in your eyelids don't produce enough oil, leading to
													dry eyes. When enabled, reminders will appear at
													regular intervals regardless of detected blinks,
													helping you maintain a consistent blinking pattern and
													express the meibomian glands more effectively. The
													popup will still close when a blink is detected.
												</p>
											</div>
										)}
									</div>
								</div>
							)}
						</div>

						{/* Right Column - Feature Toggles */}
						<div className="space-y-6">
							<h2 className="text-xl sm:text-2xl font-semibold text-gray-800 dark:text-white">
								Preferences
							</h2>

							{/* Eye Exercises Toggle */}
							<div className="bg-gray-50 dark:bg-gray-700 rounded-lg p-4 sm:p-6">
								<div className="flex items-center justify-between mb-3">
									<div className="flex items-center gap-2">
										<Dumbbell className="w-5 h-5 text-gray-600 dark:text-gray-400" />
										<span className="font-medium text-gray-800 dark:text-white text-sm sm:text-base">
											Eye Exercises
										</span>
									</div>
									<button
										onClick={() =>
											setPreferences((prev) => ({
												...prev,
												eyeExercisesEnabled: !prev.eyeExercisesEnabled,
											}))
										}
										className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
											preferences.eyeExercisesEnabled
												? "bg-blue-600"
												: "bg-gray-300 dark:bg-gray-600"
										}`}
									>
										<span
											className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
												preferences.eyeExercisesEnabled
													? "translate-x-6"
													: "translate-x-1"
											}`}
										/>
									</button>
								</div>
								<p className="text-xs sm:text-sm text-gray-600 dark:text-gray-400 mb-3">
									Get prompted for eye exercises every{" "}
									{preferences.exerciseInterval} minute
									{preferences.exerciseInterval !== 1 ? "s" : ""} to help reduce
									eye strain
								</p>

								{/* Exercise Interval Setting - Only show when enabled */}
								{preferences.eyeExercisesEnabled && (
									<div className="mt-4 pt-3 border-t border-gray-200 dark:border-gray-600">
										<div className="flex items-center gap-2 mb-2">
											<Clock className="w-3 h-3 text-gray-500 dark:text-gray-400" />
											<span className="text-xs font-medium text-gray-600 dark:text-gray-300">
												Interval
											</span>
										</div>
										<div className="flex items-center gap-2">
											<input
												type="range"
												min="5"
												max="60"
												value={preferences.exerciseInterval}
												onChange={(e) => {
													const newInterval = Number.parseInt(e.target.value);
													setPreferences((prev) => ({
														...prev,
														exerciseInterval: newInterval,
													}));
												}}
												className="flex-1 h-1.5 bg-blue-200 dark:bg-blue-900 rounded-lg appearance-none cursor-pointer"
												style={{
													background: `linear-gradient(to right, #3B82F6 0%, #3B82F6 ${((preferences.exerciseInterval - 5) / 55) * 100}%, ${preferences.darkMode ? "#1E3A8A" : "#E5E7EB"} ${((preferences.exerciseInterval - 5) / 55) * 100}%, ${preferences.darkMode ? "#1E3A8A" : "#E5E7EB"} 100%)`,
												}}
											/>
											<div className="text-xs font-medium text-blue-600 dark:text-blue-400 min-w-[40px] text-center">
												{preferences.exerciseInterval}m
											</div>
										</div>
									</div>
								)}

								{preferences.eyeExercisesEnabled && (
									<div className="mt-2 text-xs text-green-600 dark:text-green-400 bg-green-50 dark:bg-green-900/30 px-2 py-1 rounded">
										Exercise reminders will appear periodically
									</div>
								)}
							</div>

							{/* Keyboard Shortcut Settings */}
							<div className="bg-gray-50 dark:bg-gray-700 rounded-lg p-4 sm:p-6">
								<div className="flex items-center justify-between mb-3">
									<div className="flex items-center gap-2">
										<Zap className="w-5 h-5 text-gray-600 dark:text-gray-400" />
										<span className="font-medium text-gray-800 dark:text-white text-sm sm:text-base">
											Keyboard Shortcut
										</span>
									</div>
								</div>
								<div className="space-y-4">
									<div className="flex items-center gap-2">
										<div className="flex-1 px-3 py-2 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded text-sm">
											{isRecordingShortcut ? (
												<span className="text-blue-600 dark:text-blue-400">
													{tempShortcut || "Press keys..."}
												</span>
											) : (
												preferences.keyboardShortcut
											)}
										</div>
										{!isRecordingShortcut ? (
											<button
												onClick={() => {
													setIsRecordingShortcut(true);
													setTempShortcut(preferences.keyboardShortcut);
													setShortcutError("");
												}}
												className="px-3 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 transition-colors"
											>
												Change
											</button>
										) : (
											<div className="flex gap-2">
												<button
													onClick={() => {
														setIsRecordingShortcut(false);
														setTempShortcut("");
														setShortcutError("");
													}}
													className="px-3 py-2 bg-gray-600 text-white rounded hover:bg-gray-700 transition-colors"
												>
													Cancel
												</button>
												<button
													onClick={handleSaveShortcut}
													className="px-3 py-2 bg-green-600 text-white rounded hover:bg-green-700 transition-colors"
												>
													Save
												</button>
											</div>
										)}
									</div>
									{shortcutError && (
										<p className="text-red-500 text-sm">{shortcutError}</p>
									)}
									<p className="text-xs sm:text-sm text-gray-600 dark:text-gray-400">
										Press the shortcut to start/stop reminders. Use at least one
										modifier key (Ctrl, Shift, Alt, Cmd, Win) and one regular key.
									</p>
								</div>
							</div>

							{/* Popup Position and Size Settings */}
							<div className="bg-gray-50 dark:bg-gray-700 rounded-lg p-4 sm:p-6">
								<div className="flex items-center justify-between mb-3">
									<div className="flex items-center gap-2">
										<Settings className="w-5 h-5 text-gray-600 dark:text-gray-400" />
										<span className="font-medium text-gray-800 dark:text-white text-sm sm:text-base">
											Popup Settings
										</span>
									</div>
									<button
										onClick={() =>
											setPreferences((prev) => ({
												...prev,
												showPopupColors: !prev.showPopupColors,
											}))
										}
										className="text-xs text-blue-600 dark:text-blue-400 hover:text-blue-700 dark:hover:text-blue-300 transition-colors"
									>
										{preferences.showPopupColors
											? "Hide"
											: "Customize Appearance"}
									</button>
								</div>
								<div className="mt-2">
									<button
										onClick={() =>
											window.ipcRenderer?.send("show-popup-editor")
										}
										className="w-full px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors flex items-center justify-center gap-2"
									>
										<Settings className="w-4 h-4" />
										Change Position or Size
									</button>
								</div>
								<p className="text-xs sm:text-sm text-gray-600 dark:text-gray-400 mt-2">
									Current size: {preferences.popupSize.width}px ×{" "}
									{preferences.popupSize.height}px
								</p>

								{/* Popup Color Settings - Collapsible */}
								{preferences.showPopupColors && (
									<div className="mt-4 pt-4 border-t border-gray-200 dark:border-gray-600">
										<div className="flex items-center gap-2 mb-3">
											<Palette className="w-4 h-4 text-gray-600 dark:text-gray-400" />
											<span className="font-medium text-gray-800 dark:text-white text-sm">
												Popup Appearance
											</span>
										</div>
										<div className="space-y-4">
											{/* Message Customization */}
											<div>
												<label className="block text-xs text-gray-600 dark:text-gray-400 mb-1">
													Popup Message
												</label>
												{isEditingMessage ? (
													<div className="space-y-2">
														<input
															type="text"
															value={tempMessage}
															onChange={(e) => setTempMessage(e.target.value)}
															onKeyDown={(e) => {
																if (e.key === "Enter") {
																	setPreferences((prev) => ({
																		...prev,
																		popupMessage: tempMessage,
																	}));
																	setIsEditingMessage(false);
																} else if (e.key === "Escape") {
																	setIsEditingMessage(false);
																}
															}}
															className="w-full px-2 py-1 text-sm bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded"
															autoFocus
														/>
														<div className="flex items-center gap-2">
															<button
																onClick={() => {
																	setPreferences((prev) => ({
																		...prev,
																		popupMessage: tempMessage,
																	}));
																	setIsEditingMessage(false);
																}}
																className="px-2 py-1 text-xs bg-green-600 text-white rounded hover:bg-green-700"
															>
																Save
															</button>
															<button
																onClick={() => setIsEditingMessage(false)}
																className="px-2 py-1 text-xs bg-gray-600 text-white rounded hover:bg-gray-700"
															>
																Cancel
															</button>
														</div>
													</div>
												) : (
													<div className="flex items-center gap-2">
														<p className="flex-1 text-sm text-gray-800 dark:text-gray-200 truncate">
															"{preferences.popupMessage}"
														</p>
														<button
															onClick={() => {
																setTempMessage(preferences.popupMessage);
																setIsEditingMessage(true);
															}}
															className="text-xs text-blue-600 dark:text-blue-400 hover:underline"
														>
															Edit
														</button>
													</div>
												)}
											</div>

											{/* Color Pickers */}
											<div>
												<label className="block text-xs text-gray-600 dark:text-gray-400 mb-1">
													Background Color
												</label>
												<div className="flex items-center gap-2">
													<input
														type="color"
														value={preferences.popupColors.background}
														onChange={(e) =>
															setPreferences((prev) => ({
																...prev,
																popupColors: {
																	...prev.popupColors,
																	background: e.target.value,
																},
															}))
														}
														className="w-10 h-10 rounded cursor-pointer"
													/>
													<input
														type="text"
														value={preferences.popupColors.background}
														onChange={(e) =>
															setPreferences((prev) => ({
																...prev,
																popupColors: {
																	...prev.popupColors,
																	background: e.target.value,
																},
															}))
														}
														className="flex-1 px-2 py-1 text-sm bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded"
														placeholder="#000000"
													/>
												</div>
											</div>
											<div>
												<label className="block text-xs text-gray-600 dark:text-gray-400 mb-1">
													Text Color
												</label>
												<div className="flex items-center gap-2">
													<input
														type="color"
														value={preferences.popupColors.text}
														onChange={(e) =>
															setPreferences((prev) => ({
																...prev,
																popupColors: {
																	...prev.popupColors,
																	text: e.target.value,
																},
															}))
														}
														className="w-10 h-10 rounded cursor-pointer"
													/>
													<input
														type="text"
														value={preferences.popupColors.text}
														onChange={(e) =>
															setPreferences((prev) => ({
																...prev,
																popupColors: {
																	...prev.popupColors,
																	text: e.target.value,
																},
															}))
														}
														className="flex-1 px-2 py-1 text-sm bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded"
														placeholder="#FFFFFF"
													/>
												</div>
											</div>
											<div>
												<label className="block text-xs text-gray-600 dark:text-gray-400 mb-1">
													Window Transparency
												</label>
												<div className="flex items-center gap-2">
													<input
														type="range"
														min="0"
														max="1"
														step="0.1"
														value={preferences.popupColors.transparency}
														onChange={(e) =>
															setPreferences((prev) => ({
																...prev,
																popupColors: {
																	...prev.popupColors,
																	transparency: Number.parseFloat(
																		e.target.value,
																	),
																},
															}))
														}
														className="flex-1 h-2 bg-blue-200 dark:bg-blue-900 rounded-lg appearance-none cursor-pointer"
													/>
													<span className="text-sm text-gray-600 dark:text-gray-400 w-12 text-right">
														{Math.round(
															preferences.popupColors.transparency * 100,
														)}
														%
													</span>
												</div>
											</div>
										</div>
										<p className="text-xs sm:text-sm text-gray-600 dark:text-gray-400 mt-2">
											Customize the transparency of the entire popup window.
											Higher values make the window more transparent, allowing
											you to see through to what's behind it.
										</p>
									</div>
								)}
							</div>

							{/* Sound Toggle */}
							<div className="bg-gray-50 dark:bg-gray-700 rounded-lg p-4 sm:p-6">
								<div className="flex items-center justify-between mb-3">
									<div className="flex items-center gap-2">
										{preferences.soundEnabled ? (
											<Volume2 className="w-5 h-5 text-gray-600 dark:text-gray-400" />
										) : (
											<VolumeX className="w-5 h-5 text-gray-600 dark:text-gray-400" />
										)}
										<span className="font-medium text-gray-800 dark:text-white text-sm sm:text-base">
											Notification Sound
										</span>
									</div>
									<button
										onClick={() =>
											setPreferences((prev) => ({
												...prev,
												soundEnabled: !prev.soundEnabled,
											}))
										}
										className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
											preferences.soundEnabled
												? "bg-blue-600"
												: "bg-gray-300 dark:bg-gray-600"
										}`}
									>
										<span
											className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
												preferences.soundEnabled
													? "translate-x-6"
													: "translate-x-1"
											}`}
										/>
									</button>
								</div>
								<p className="text-xs sm:text-sm text-gray-600 dark:text-gray-400">
									Play sounds for blink reminders and exercise prompts
								</p>
							</div>
						</div>
					</div>
				</div>

				<div className="flex justify-center items-center mt-4">
					<button
						onClick={handleResetPreferences}
						className="px-4 py-2 text-sm bg-red-600 text-white rounded hover:bg-red-700 transition-colors"
					>
						Reset Preferences
					</button>
				</div>

				{/* Gaming Disclaimer */}
				<div className="mt-6 bg-amber-50 dark:bg-amber-900/30 border border-amber-200 dark:border-amber-800 rounded-xl p-6">
					<h3 className="font-semibold text-amber-800 dark:text-amber-300 mb-2">
						🎮 Gaming Notice
					</h3>
					<p className="text-sm text-amber-700 dark:text-amber-200">
						<strong>Important:</strong> If you plan to use blink reminders while
						playing video games, please use <strong>Borderless Windowed</strong>{" "}
						or <strong>Windowed</strong> mode instead of Fullscreen. Fullscreen
						games may be interrupted when popups appear, causing you to exit the
						game unexpectedly.
					</p>
				</div>
			</div>
		</div>
	);
}
