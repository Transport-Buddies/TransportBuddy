import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { FaArrowLeft, FaCog, FaMap, FaEye, FaSave } from 'react-icons/fa';
import { useSettings } from '../../utils/settings';
import './Settings.css';

const Settings: React.FC = () => {
  const navigate = useNavigate();
  const { settings, updateSetting, resetSettings } = useSettings();
  
  // Use dark mode from settings utility instead of separate state
  const darkMode = settings.darkMode;
  
  // Local state for UI
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState<boolean>(false);
  const [localMinZoom, setLocalMinZoom] = useState<number>(settings.minZoomForStops);

  // Update local state when settings change
  useEffect(() => {
    setLocalMinZoom(settings.minZoomForStops);
  }, [settings.minZoomForStops]);

  // Apply dark mode to body based on settings
  useEffect(() => {
    if (darkMode) {
      document.body.classList.add('dark-mode');
    } else {
      document.body.classList.remove('dark-mode');
    }
  }, [darkMode]);

  // Handle zoom level change
  const handleZoomChange = (value: number) => {
    setLocalMinZoom(value);
    setHasUnsavedChanges(true);
  };

  // Save settings
  const saveSettings = () => {
    updateSetting('minZoomForStops', localMinZoom);
    setHasUnsavedChanges(false);
    
    // Show a brief success message
    const successMessage = document.createElement('div');
    successMessage.textContent = 'Settings saved!';
    successMessage.className = 'fixed top-4 right-4 bg-green-600 text-white px-4 py-2 rounded shadow-lg z-50';
    document.body.appendChild(successMessage);
    
    setTimeout(() => {
      document.body.removeChild(successMessage);
    }, 2000);
  };

  // Reset to default values
  const resetToDefaults = () => {
    resetSettings();
    setLocalMinZoom(15); // Default value
    setHasUnsavedChanges(true);
  };

  return (
    <div className={`settings-page transition-colors duration-300 ${darkMode ? 'bg-gray-900' : 'bg-gray-100'}`}>
      <div className="settings-content">
        {/* Header */}
        <div className={`shadow-sm border-b transition-colors duration-300 ${darkMode ? 'bg-gray-800 border-gray-700' : 'bg-white border-gray-200'}`}>
        <div className="max-w-4xl mx-auto px-4 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-4">
              <button
                onClick={() => navigate('/')}
                className={`flex items-center space-x-2 transition-colors ${darkMode ? 'text-gray-300 hover:text-gray-100' : 'text-gray-600 hover:text-gray-800'}`}
              >
                <FaArrowLeft size={20} />
                <span>Back to Home</span>
              </button>
            </div>
            
            <div className="flex items-center space-x-4">
              <div className="flex items-center space-x-2">
                <FaCog className={`${darkMode ? 'text-gray-300' : 'text-gray-600'}`} size={24} />
                <h1 className={`text-2xl font-bold ${darkMode ? 'text-gray-100' : 'text-gray-800'}`}>Settings</h1>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="max-w-4xl mx-auto px-4 py-8">
        <div className={`rounded-lg shadow-sm border transition-colors duration-300 ${darkMode ? 'bg-gray-800 border-gray-700' : 'bg-white border-gray-200'}`}>
          <div className="p-6">
            <h2 className={`text-xl font-semibold mb-6 flex items-center ${darkMode ? 'text-gray-100' : 'text-gray-800'}`}>
              <FaMap className={`mr-2 ${darkMode ? 'text-gray-300' : 'text-gray-800'}`} />
              Map Settings
            </h2>

            {/* Zoom Level Setting */}
            <div className="space-y-4">
              <div className={`border rounded-lg p-4 transition-colors duration-300 ${darkMode ? 'border-gray-600 bg-gray-750' : 'border-gray-200 bg-white'}`}>
                <div className="flex items-center justify-between mb-4">
                  <div>
                    <h3 className={`font-medium flex items-center ${darkMode ? 'text-gray-100' : 'text-gray-800'}`}>
                      <FaEye className={`mr-2 ${darkMode ? 'text-gray-300' : 'text-gray-800'}`} />
                      Stop Visibility Zoom Level
                    </h3>
                    <p className={`text-sm mt-1 ${darkMode ? 'text-gray-400' : 'text-gray-600'}`}>
                      Controls at what zoom level bus stops become visible on the map
                    </p>
                  </div>
                  <div className="text-right">
                    <span className={`text-2xl font-bold ${darkMode ? 'text-gray-100' : 'text-gray-800'}`}>{localMinZoom}</span>
                    <p className={`text-xs ${darkMode ? 'text-gray-400' : 'text-gray-500'}`}>Current Level</p>
                  </div>
                </div>

                {/* Slider */}
                <div className="space-y-4">
                  <div className="flex items-center space-x-4">
                    <label className={`text-sm w-12 ${darkMode ? 'text-gray-400' : 'text-gray-600'}`}>Low</label>
                    <input
                      type="range"
                      min="10"
                      max="18"
                      step="1"
                      value={localMinZoom}
                      onChange={(e) => handleZoomChange(parseInt(e.target.value, 10))}
                      className={`flex-1 h-2 rounded-lg appearance-none cursor-pointer slider ${darkMode ? 'slider-dark' : 'slider-light'}`}
                    />
                    <label className={`text-sm w-12 text-right ${darkMode ? 'text-gray-400' : 'text-gray-600'}`}>High</label>
                  </div>
                  
                  {/* Zoom level descriptions */}
                  <div className="grid grid-cols-3 gap-4 text-xs">
                    <div className="text-center">
                      <div className={`font-medium ${darkMode ? 'text-gray-300' : 'text-gray-700'}`}>10-12</div>
                      <div className={`${darkMode ? 'text-gray-400' : 'text-gray-500'}`}>City view</div>
                      <div className={`${darkMode ? 'text-gray-400' : 'text-gray-500'}`}>Many stops visible</div>
                    </div>
                    <div className="text-center">
                      <div className={`font-medium ${darkMode ? 'text-gray-300' : 'text-gray-700'}`}>13-15</div>
                      <div className={`${darkMode ? 'text-gray-400' : 'text-gray-500'}`}>Neighborhood view</div>
                      <div className={`${darkMode ? 'text-gray-400' : 'text-gray-500'}`}>Balanced visibility</div>
                    </div>
                    <div className="text-center">
                      <div className={`font-medium ${darkMode ? 'text-gray-300' : 'text-gray-700'}`}>16-18</div>
                      <div className={`${darkMode ? 'text-gray-400' : 'text-gray-500'}`}>Street view</div>
                      <div className={`${darkMode ? 'text-gray-400' : 'text-gray-500'}`}>Fewer stops visible</div>
                    </div>
                  </div>
                </div>

                {/* Info box */}
                <div className={`mt-4 p-3 border rounded transition-colors duration-300 ${darkMode ? 'bg-gray-700 border-gray-600' : 'bg-gray-50 border-gray-200'}`}>
                  <p className={`text-sm ${darkMode ? 'text-gray-300' : 'text-gray-700'}`}>
                    <strong>Current setting:</strong> Bus stops will appear when you zoom to level {localMinZoom} or higher. 
                    Lower values show stops earlier (more crowded), higher values show stops later (less crowded).
                  </p>
                </div>
              </div>
            </div>

            {/* Action Buttons */}
            <div className={`flex items-center justify-between mt-8 pt-6 border-t transition-colors duration-300 ${darkMode ? 'border-gray-600' : 'border-gray-200'}`}>
              <button
                onClick={resetToDefaults}
                className={`px-4 py-2 border rounded transition-colors ${darkMode ? 'text-gray-300 border-gray-600 hover:bg-gray-700' : 'text-gray-600 border-gray-300 hover:bg-gray-50'}`}
              >
                Reset to Defaults
              </button>
              
              <div className="flex items-center space-x-3">
                {hasUnsavedChanges && (
                  <span className={`text-sm font-medium ${darkMode ? 'text-orange-400' : 'text-orange-600'}`}>
                    You have unsaved changes
                  </span>
                )}
                <button
                  onClick={saveSettings}
                  disabled={!hasUnsavedChanges}
                  className={`flex items-center space-x-2 px-6 py-2 rounded font-medium transition-colors ${
                    hasUnsavedChanges
                      ? darkMode 
                        ? 'bg-gray-100 text-gray-900 hover:bg-white'
                        : 'bg-gray-800 text-white hover:bg-gray-900'
                      : darkMode
                        ? 'bg-gray-600 text-gray-400 cursor-not-allowed'
                        : 'bg-gray-300 text-gray-500 cursor-not-allowed'
                  }`}
                >
                  <FaSave size={16} />
                  <span>Save Settings</span>
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* Appearance Settings */}
        <div className={`rounded-lg shadow-sm border mt-6 transition-colors duration-300 ${darkMode ? 'bg-gray-800 border-gray-700' : 'bg-white border-gray-200'}`}>
          <div className="p-6">
            <h2 className={`text-xl font-semibold mb-6 flex items-center ${darkMode ? 'text-gray-100' : 'text-gray-800'}`}>
              <FaCog className={`mr-2 ${darkMode ? 'text-gray-300' : 'text-gray-800'}`} />
              Appearance
            </h2>

            {/* Dark Mode Toggle */}
            <div className="space-y-4">
              <div className={`border rounded-lg p-4 transition-colors duration-300 ${darkMode ? 'border-gray-600 bg-gray-750' : 'border-gray-200 bg-white'}`}>
                <div className="flex items-center justify-between">
                  <div>
                    <h3 className={`font-medium flex items-center ${darkMode ? 'text-gray-100' : 'text-gray-800'}`}>
                      Dark Mode
                    </h3>
                    <p className={`text-sm mt-1 ${darkMode ? 'text-gray-400' : 'text-gray-600'}`}>
                      Switch between light and dark themes for the app and map
                    </p>
                  </div>
                  <div className="flex items-center">
                    <button
                      onClick={() => updateSetting('darkMode', !darkMode)}
                      className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-offset-2 ${
                        darkMode 
                          ? 'bg-gray-100 focus:ring-gray-500' 
                          : 'bg-gray-800 focus:ring-gray-500'
                      }`}
                    >
                      <span
                        className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                          darkMode ? 'translate-x-6' : 'translate-x-1'
                        }`}
                      />
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Future Settings Placeholder */}
        <div className={`rounded-lg shadow-sm border mt-6 transition-colors duration-300 ${darkMode ? 'bg-gray-800 border-gray-700' : 'bg-white border-gray-200'}`}>
          <div className="p-6">
            <h2 className={`text-xl font-semibold mb-4 ${darkMode ? 'text-gray-100' : 'text-gray-800'}`}>
              More Settings Coming Soon
            </h2>
            <div className="space-y-3">
              <div className="flex items-center space-x-3">
                <div className={`w-2 h-2 rounded-full ${darkMode ? 'bg-gray-500' : 'bg-gray-300'}`}></div>
                <span className={`${darkMode ? 'text-gray-300' : 'text-gray-600'}`}>Vehicle refresh interval</span>
              </div>
              <div className="flex items-center space-x-3">
                <div className={`w-2 h-2 rounded-full ${darkMode ? 'bg-gray-500' : 'bg-gray-300'}`}></div>
                <span className={`${darkMode ? 'text-gray-300' : 'text-gray-600'}`}>Map theme selection</span>
              </div>
              <div className="flex items-center space-x-3">
                <div className={`w-2 h-2 rounded-full ${darkMode ? 'bg-gray-500' : 'bg-gray-300'}`}></div>
                <span className={`${darkMode ? 'text-gray-300' : 'text-gray-600'}`}>Distance units (km/miles)</span>
              </div>
              <div className="flex items-center space-x-3">
                <div className={`w-2 h-2 rounded-full ${darkMode ? 'bg-gray-500' : 'bg-gray-300'}`}></div>
                <span className={`${darkMode ? 'text-gray-300' : 'text-gray-600'}`}>Notification preferences</span>
              </div>
            </div>
          </div>
        </div>
      </div>
      </div>
    </div>
  );
};

export default Settings;
