import { useState, useEffect } from 'react';
import { Eye, Camera, Play, Square, Settings, Activity, Clock, Zap, Moon, Sun, Palette } from 'lucide-react';

interface PopupColors {
  background: string;
  text: string;
  opacity: number;
}

export default function DryEyeHealthHomepage() {
  const [reminderInterval, setReminderInterval] = useState(5);
  const [isTracking, setIsTracking] = useState(false);
  const [cameraEnabled, setCameraEnabled] = useState(false);
  const [eyeExercisesEnabled, setEyeExercisesEnabled] = useState(true);
  const [popupPosition, setPopupPosition] = useState('top-right');
  const [isDarkMode, setIsDarkMode] = useState(() => {
    const saved = localStorage.getItem('darkMode');
    return saved ? JSON.parse(saved) : false;
  });
  const [popupColors, setPopupColors] = useState<PopupColors>(() => {
    const saved = localStorage.getItem('popupColors');
    return saved ? JSON.parse(saved) : {
      background: '#1E1E1E',
      text: '#FFFFFF',
      opacity: 0.5
    };
  });

  useEffect(() => {
    localStorage.setItem('darkMode', JSON.stringify(isDarkMode));
    if (isDarkMode) {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
  }, [isDarkMode]);

  useEffect(() => {
    localStorage.setItem('popupColors', JSON.stringify(popupColors));
    window.ipcRenderer?.send('update-popup-colors', popupColors);
  }, [popupColors]);

  const handleStartStop = () => {
    if (!isTracking) {
      // Start reminders: send interval in ms
      window.ipcRenderer?.send('start-blink-reminders', reminderInterval * 1000);
    } else {
      // Stop reminders
      window.ipcRenderer?.send('stop-blink-reminders');
    }
    setIsTracking(!isTracking);
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 dark:from-gray-900 dark:to-gray-800 p-4 sm:p-6">
      <div className="max-w-4xl mx-auto">
        {/* Header */}
        <div className="text-center mb-6 sm:mb-8">
          <div className="flex justify-center items-center gap-2 sm:gap-3 mb-3 sm:mb-4">
            <Eye className="w-10 h-10 sm:w-12 sm:h-12 text-blue-600 dark:text-blue-400" />
            <h1 className="text-3xl sm:text-4xl font-bold text-gray-800 dark:text-white">DryEyeHealth</h1>
          </div>
          <p className="text-base sm:text-lg text-gray-600 dark:text-gray-300 px-4">Keep your eyes healthy with smart blink reminders</p>
        </div>

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
                  onClick={() => setIsDarkMode(!isDarkMode)}
                  className="p-2 rounded-lg bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors"
                  aria-label="Toggle dark mode"
                >
                  {isDarkMode ? (
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
                    max="60"
                    value={reminderInterval}
                    onChange={(e) => {
                      const newInterval = parseInt(e.target.value);
                      setReminderInterval(newInterval);
                      if (isTracking) {
                        window.ipcRenderer?.send('update-interval', newInterval * 1000);
                      }
                    }}
                    className="w-full sm:flex-1 h-2 bg-blue-200 dark:bg-blue-900 rounded-lg appearance-none cursor-pointer"
                    style={{
                      background: `linear-gradient(to right, #3B82F6 0%, #3B82F6 ${(reminderInterval - 1) / 59 * 100}%, ${isDarkMode ? '#1E3A8A' : '#E5E7EB'} ${(reminderInterval - 1) / 59 * 100}%, ${isDarkMode ? '#1E3A8A' : '#E5E7EB'} 100%)`
                    }}
                  />
                  <div className="bg-blue-100 dark:bg-blue-900 text-blue-800 dark:text-blue-200 px-3 py-1 rounded-full font-semibold min-w-[80px] text-center">
                    {reminderInterval}s
                  </div>
                </div>
                <p className="text-xs sm:text-sm text-gray-500 dark:text-gray-400 mt-2">
                  Get reminded to blink every {reminderInterval} second{reminderInterval !== 1 ? 's' : ''}
                </p>
              </div>

              {/* Start/Stop Button */}
              <div className="text-center">
                <button
                  onClick={handleStartStop}
                  className={`inline-flex items-center gap-2 sm:gap-3 px-6 sm:px-8 py-3 sm:py-4 rounded-xl text-base sm:text-lg font-semibold transition-all duration-200 transform hover:scale-105 active:scale-95 ${
                    isTracking
                      ? 'bg-red-500 hover:bg-red-600 text-white shadow-lg shadow-red-200 dark:shadow-red-900/30'
                      : 'bg-green-500 hover:bg-green-600 text-white shadow-lg shadow-green-200 dark:shadow-green-900/30'
                  }`}
                >
                  {isTracking ? (
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
                
                {isTracking && (
                  <div className="mt-4 flex items-center justify-center gap-2 text-green-600 dark:text-green-400">
                    <Activity className="w-4 h-4 animate-pulse" />
                    <span className="text-sm font-medium">Tracking active</span>
                  </div>
                )}
              </div>
            </div>

            {/* Right Column - Feature Toggles */}
            <div className="space-y-6">
              <h2 className="text-xl sm:text-2xl font-semibold text-gray-800 dark:text-white">Features</h2>
              
              {/* Camera Eye Tracking Toggle */}
              <div className="bg-gray-50 dark:bg-gray-700 rounded-lg p-4 sm:p-6">
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-2">
                    <Camera className="w-5 h-5 text-gray-600 dark:text-gray-400" />
                    <span className="font-medium text-gray-800 dark:text-white text-sm sm:text-base">Camera Eye Tracking</span>
                  </div>
                  <button
                    onClick={() => setCameraEnabled(!cameraEnabled)}
                    className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                      cameraEnabled ? 'bg-blue-600' : 'bg-gray-300 dark:bg-gray-600'
                    }`}
                  >
                    <span
                      className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                        cameraEnabled ? 'translate-x-6' : 'translate-x-1'
                      }`}
                    />
                  </button>
                </div>
                <p className="text-xs sm:text-sm text-gray-600 dark:text-gray-400">
                  Use your camera to automatically detect when you blink, in order to close reminders and track your blink rate
                </p>
                {cameraEnabled && (
                  <div className="mt-2 text-xs text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-900/30 px-2 py-1 rounded">
                    Camera access will be requested when tracking starts
                  </div>
                )}
              </div>

              {/* Eye Exercises Toggle */}
              <div className="bg-gray-50 dark:bg-gray-700 rounded-lg p-4 sm:p-6">
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-2">
                    <Zap className="w-5 h-5 text-gray-600 dark:text-gray-400" />
                    <span className="font-medium text-gray-800 dark:text-white text-sm sm:text-base">Eye Exercises</span>
                  </div>
                  <button
                    onClick={() => setEyeExercisesEnabled(!eyeExercisesEnabled)}
                    className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                      eyeExercisesEnabled ? 'bg-blue-600' : 'bg-gray-300 dark:bg-gray-600'
                    }`}
                  >
                    <span
                      className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                        eyeExercisesEnabled ? 'translate-x-6' : 'translate-x-1'
                      }`}
                    />
                  </button>
                </div>
                <p className="text-xs sm:text-sm text-gray-600 dark:text-gray-400">
                  Get prompted for eye exercises at different intervals to help reduce eye strain
                </p>
                {eyeExercisesEnabled && (
                  <div className="mt-2 text-xs text-green-600 dark:text-green-400 bg-green-50 dark:bg-green-900/30 px-2 py-1 rounded">
                    Exercise reminders will appear periodically
                  </div>
                )}
              </div>

              {/* Popup Position Settings */}
              <div className="bg-gray-50 dark:bg-gray-700 rounded-lg p-4 sm:p-6">
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-2">
                    <Settings className="w-5 h-5 text-gray-600 dark:text-gray-400" />
                    <span className="font-medium text-gray-800 dark:text-white text-sm sm:text-base">Popup Position</span>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-2 mt-2">
                  {['top-left', 'top-right', 'bottom-left', 'bottom-right'].map((pos) => (
                    <button
                      key={pos}
                      onClick={() => {
                        setPopupPosition(pos);
                        window.ipcRenderer?.send('update-popup-position', pos);
                      }}
                      className={`px-3 py-2 text-sm rounded-lg transition-colors ${
                        popupPosition === pos
                          ? 'bg-blue-600 text-white'
                          : 'bg-gray-200 dark:bg-gray-600 text-gray-700 dark:text-gray-300 hover:bg-gray-300 dark:hover:bg-gray-500'
                      }`}
                    >
                      {pos.split('-').map(word => word.charAt(0).toUpperCase() + word.slice(1)).join(' ')}
                    </button>
                  ))}
                </div>
                <p className="text-xs sm:text-sm text-gray-600 dark:text-gray-400 mt-2">
                  Choose where the blink reminder popup appears on your screen
                </p>
              </div>

              {/* Popup Color Settings */}
              <div className="bg-gray-50 dark:bg-gray-700 rounded-lg p-4 sm:p-6">
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-2">
                    <Palette className="w-5 h-5 text-gray-600 dark:text-gray-400" />
                    <span className="font-medium text-gray-800 dark:text-white text-sm sm:text-base">Popup Colors</span>
                  </div>
                </div>
                <div className="space-y-4">
                  <div>
                    <label className="block text-xs text-gray-600 dark:text-gray-400 mb-1">Background Color</label>
                    <div className="flex items-center gap-2">
                      <input
                        type="color"
                        value={popupColors.background}
                        onChange={(e) => setPopupColors(prev => ({ ...prev, background: e.target.value }))}
                        className="w-10 h-10 rounded cursor-pointer"
                      />
                      <input
                        type="text"
                        value={popupColors.background}
                        onChange={(e) => setPopupColors(prev => ({ ...prev, background: e.target.value }))}
                        className="flex-1 px-2 py-1 text-sm bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded"
                        placeholder="#000000"
                      />
                    </div>
                  </div>
                  <div>
                    <label className="block text-xs text-gray-600 dark:text-gray-400 mb-1">Text Color</label>
                    <div className="flex items-center gap-2">
                      <input
                        type="color"
                        value={popupColors.text}
                        onChange={(e) => setPopupColors(prev => ({ ...prev, text: e.target.value }))}
                        className="w-10 h-10 rounded cursor-pointer"
                      />
                      <input
                        type="text"
                        value={popupColors.text}
                        onChange={(e) => setPopupColors(prev => ({ ...prev, text: e.target.value }))}
                        className="flex-1 px-2 py-1 text-sm bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded"
                        placeholder="#FFFFFF"
                      />
                    </div>
                  </div>
                  <div>
                    <label className="block text-xs text-gray-600 dark:text-gray-400 mb-1">Background Opacity</label>
                    <div className="flex items-center gap-2">
                      <input
                        type="range"
                        min="0"
                        max="1"
                        step="0.1"
                        value={popupColors.opacity}
                        onChange={(e) => setPopupColors(prev => ({ ...prev, opacity: parseFloat(e.target.value) }))}
                        className="flex-1 h-2 bg-blue-200 dark:bg-blue-900 rounded-lg appearance-none cursor-pointer"
                      />
                      <span className="text-sm text-gray-600 dark:text-gray-400 w-12 text-right">
                        {Math.round(popupColors.opacity * 100)}%
                      </span>
                    </div>
                  </div>
                </div>
                <p className="text-xs sm:text-sm text-gray-600 dark:text-gray-400 mt-2">
                  Customize the appearance of the blink reminder popup
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* Status Bar */}
        <div className="bg-white dark:bg-gray-800 rounded-xl shadow-lg p-3 sm:p-4">
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between text-sm gap-3 sm:gap-0">
            <div className="flex items-center gap-3 sm:gap-4">
              <div className="flex items-center gap-2">
                <div className={`w-3 h-3 rounded-full ${isTracking ? 'bg-green-400' : 'bg-gray-300 dark:bg-gray-600'}`}></div>
                <span className="text-gray-600 dark:text-gray-300">
                  Status: {isTracking ? 'Active' : 'Inactive'}
                </span>
              </div>
              <div className="text-gray-400 dark:text-gray-500 hidden sm:block">|</div>
              <span className="text-gray-600 dark:text-gray-300">
                Interval: {reminderInterval}s
              </span>
            </div>
            <div className="flex items-center gap-3 sm:gap-4 text-gray-500 dark:text-gray-400 text-xs sm:text-sm">
              <span>Camera: {cameraEnabled ? 'On' : 'Off'}</span>
              <span>Exercises: {eyeExercisesEnabled ? 'On' : 'Off'}</span>
            </div>
          </div>
        </div>

        {/* Tips Section */}
        <div className="mt-6 bg-blue-50 dark:bg-blue-900/30 border border-blue-200 dark:border-blue-800 rounded-xl p-6">
          <h3 className="font-semibold text-blue-800 dark:text-blue-300 mb-2">💡 Tips for Better Eye Health</h3>
          <ul className="text-sm text-blue-700 dark:text-blue-200 space-y-2">
            <li>• Follow the 20-20-20 rule: Every 20 minutes, look at something 20 feet away for 20 seconds</li>
            <li>• Blink frequently to keep your eyes moist, especially when using screens</li>
            <li>• Adjust your screen brightness to match your surroundings</li>
            <li>• Keep your screen about arm's length away from your eyes</li>
          </ul>
        </div>
      </div>
    </div>
  );
}