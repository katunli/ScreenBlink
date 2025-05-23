import { useState } from 'react';
import { Eye, Camera, Play, Square, Settings, Activity, Clock, Zap } from 'lucide-react';

export default function DryEyeHealthHomepage() {
  const [reminderInterval, setReminderInterval] = useState(20);
  const [isTracking, setIsTracking] = useState(false);
  const [cameraEnabled, setCameraEnabled] = useState(false);
  const [eyeExercisesEnabled, setEyeExercisesEnabled] = useState(true);

  const handleStartStop = () => {
    setIsTracking(!isTracking);
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 p-4 sm:p-6">
      <div className="max-w-4xl mx-auto">
        {/* Header */}
        <div className="text-center mb-6 sm:mb-8">
          <div className="flex justify-center items-center gap-2 sm:gap-3 mb-3 sm:mb-4">
            <Eye className="w-10 h-10 sm:w-12 sm:h-12 text-blue-600" />
            <h1 className="text-3xl sm:text-4xl font-bold text-gray-800">DryEyeHealth</h1>
          </div>
          <p className="text-base sm:text-lg text-gray-600 px-4">Keep your eyes healthy with smart blink reminders</p>
        </div>

        {/* Main Control Panel */}
        <div className="bg-white rounded-2xl shadow-xl p-4 sm:p-6 lg:p-8 mb-6">
          <div className="grid lg:grid-cols-2 gap-6 lg:gap-8">
            {/* Left Column - Main Controls */}
            <div className="space-y-6">
              <h2 className="text-xl sm:text-2xl font-semibold text-gray-800 flex items-center gap-2">
                <Settings className="w-5 h-5 sm:w-6 sm:h-6" />
                Control Panel
              </h2>
              
              {/* Reminder Interval Setting */}
              <div className="bg-gray-50 rounded-lg p-4 sm:p-6">
                <label className="block text-sm font-medium text-gray-700 mb-3 flex items-center gap-2">
                  <Clock className="w-4 h-4" />
                  Reminder Interval
                </label>
                <div className="flex flex-col sm:flex-row items-center gap-3 sm:gap-4">
                  <input
                    type="range"
                    min="1"
                    max="60"
                    value={reminderInterval}
                    onChange={(e) => setReminderInterval(parseInt(e.target.value))}
                    className="w-full sm:flex-1 h-2 bg-blue-200 rounded-lg appearance-none cursor-pointer"
                    style={{
                      background: `linear-gradient(to right, #3B82F6 0%, #3B82F6 ${(reminderInterval - 1) / 59 * 100}%, #E5E7EB ${(reminderInterval - 1) / 59 * 100}%, #E5E7EB 100%)`
                    }}
                  />
                  <div className="bg-blue-100 text-blue-800 px-3 py-1 rounded-full font-semibold min-w-[80px] text-center">
                    {reminderInterval}s
                  </div>
                </div>
                <p className="text-xs sm:text-sm text-gray-500 mt-2">
                  Get reminded to blink every {reminderInterval} second{reminderInterval !== 1 ? 's' : ''}
                </p>
              </div>

              {/* Start/Stop Button */}
              <div className="text-center">
                <button
                  onClick={handleStartStop}
                  className={`inline-flex items-center gap-2 sm:gap-3 px-6 sm:px-8 py-3 sm:py-4 rounded-xl text-base sm:text-lg font-semibold transition-all duration-200 transform hover:scale-105 active:scale-95 ${
                    isTracking
                      ? 'bg-red-500 hover:bg-red-600 text-white shadow-lg shadow-red-200'
                      : 'bg-green-500 hover:bg-green-600 text-white shadow-lg shadow-green-200'
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
                  <div className="mt-4 flex items-center justify-center gap-2 text-green-600">
                    <Activity className="w-4 h-4 animate-pulse" />
                    <span className="text-sm font-medium">Tracking active</span>
                  </div>
                )}
              </div>
            </div>

            {/* Right Column - Feature Toggles */}
            <div className="space-y-6">
              <h2 className="text-xl sm:text-2xl font-semibold text-gray-800">Features</h2>
              
              {/* Camera Eye Tracking Toggle */}
              <div className="bg-gray-50 rounded-lg p-4 sm:p-6">
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-2">
                    <Camera className="w-5 h-5 text-gray-600" />
                    <span className="font-medium text-gray-800 text-sm sm:text-base">Camera Eye Tracking</span>
                  </div>
                  <button
                    onClick={() => setCameraEnabled(!cameraEnabled)}
                    className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                      cameraEnabled ? 'bg-blue-600' : 'bg-gray-300'
                    }`}
                  >
                    <span
                      className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                        cameraEnabled ? 'translate-x-6' : 'translate-x-1'
                      }`}
                    />
                  </button>
                </div>
                <p className="text-xs sm:text-sm text-gray-600">
                  Use your camera to automatically detect when you blink, in order to close reminders and track your blink rate
                </p>
                {cameraEnabled && (
                  <div className="mt-2 text-xs text-blue-600 bg-blue-50 px-2 py-1 rounded">
                    Camera access will be requested when tracking starts
                  </div>
                )}
              </div>

              {/* Eye Exercises Toggle */}
              <div className="bg-gray-50 rounded-lg p-4 sm:p-6">
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-2">
                    <Zap className="w-5 h-5 text-gray-600" />
                    <span className="font-medium text-gray-800 text-sm sm:text-base">Eye Exercises</span>
                  </div>
                  <button
                    onClick={() => setEyeExercisesEnabled(!eyeExercisesEnabled)}
                    className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                      eyeExercisesEnabled ? 'bg-blue-600' : 'bg-gray-300'
                    }`}
                  >
                    <span
                      className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                        eyeExercisesEnabled ? 'translate-x-6' : 'translate-x-1'
                      }`}
                    />
                  </button>
                </div>
                <p className="text-xs sm:text-sm text-gray-600">
                  Get prompted for eye exercises at different intervals to help reduce eye strain
                </p>
                {eyeExercisesEnabled && (
                  <div className="mt-2 text-xs text-green-600 bg-green-50 px-2 py-1 rounded">
                    Exercise reminders will appear periodically
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Status Bar */}
        <div className="bg-white rounded-xl shadow-lg p-3 sm:p-4">
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between text-sm gap-3 sm:gap-0">
            <div className="flex items-center gap-3 sm:gap-4">
              <div className="flex items-center gap-2">
                <div className={`w-3 h-3 rounded-full ${isTracking ? 'bg-green-400' : 'bg-gray-300'}`}></div>
                <span className="text-gray-600">
                  Status: {isTracking ? 'Active' : 'Inactive'}
                </span>
              </div>
              <div className="text-gray-400 hidden sm:block">|</div>
              <span className="text-gray-600">
                Interval: {reminderInterval}s
              </span>
            </div>
            <div className="flex items-center gap-3 sm:gap-4 text-gray-500 text-xs sm:text-sm">
              <span>Camera: {cameraEnabled ? 'On' : 'Off'}</span>
              <span>Exercises: {eyeExercisesEnabled ? 'On' : 'Off'}</span>
            </div>
          </div>
        </div>

        {/* Tips Section */}
        <div className="mt-6 bg-blue-50 border border-blue-200 rounded-xl p-6">
          <h3 className="font-semibold text-blue-800 mb-2">💡 Tips for Better Eye Health</h3>
          <ul className="text-sm text-blue-700 space-y-2">
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