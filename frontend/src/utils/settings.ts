// Settings utility functions for managing app settings
import { useState } from 'react';

export interface AppSettings {
  minZoomForStops: number;
  darkMode: boolean;
  mapTheme: 'light' | 'dark' | 'auto';
  // Future settings can be added here
  // vehicleRefreshInterval: number;
  // distanceUnit: 'km' | 'miles';
}

export const DEFAULT_SETTINGS: AppSettings = {
  minZoomForStops: 15,
  darkMode: false,
  mapTheme: 'auto', // auto follows dark mode setting
};

// Get a specific setting from localStorage or return default
export const getSetting = <K extends keyof AppSettings>(
  key: K
): AppSettings[K] => {
  try {
    const saved = localStorage.getItem(key);
    if (saved !== null) {
      // Handle different data types
      if (key === 'minZoomForStops') {
        return parseInt(saved, 10) as AppSettings[K];
      }
      if (key === 'darkMode') {
        return (saved === 'true') as AppSettings[K];
      }
      if (key === 'mapTheme') {
        return saved as AppSettings[K];
      }
      return JSON.parse(saved) as AppSettings[K];
    }
  } catch (error) {
    console.warn(`Failed to load setting ${key}:`, error);
  }
  return DEFAULT_SETTINGS[key];
};

// Save a specific setting to localStorage
export const setSetting = <K extends keyof AppSettings>(
  key: K,
  value: AppSettings[K]
): void => {
  try {
    localStorage.setItem(key, value.toString());
  } catch (error) {
    console.error(`Failed to save setting ${key}:`, error);
  }
};

// Get all settings as an object
export const getAllSettings = (): AppSettings => {
  return {
    minZoomForStops: getSetting('minZoomForStops'),
    darkMode: getSetting('darkMode'),
    mapTheme: getSetting('mapTheme'),
  };
};

// Save all settings
export const saveAllSettings = (settings: AppSettings): void => {
  Object.entries(settings).forEach(([key, value]) => {
    setSetting(key as keyof AppSettings, value);
  });
};

// Reset all settings to defaults
export const resetAllSettings = (): AppSettings => {
  Object.entries(DEFAULT_SETTINGS).forEach(([key, value]) => {
    setSetting(key as keyof AppSettings, value);
  });
  return DEFAULT_SETTINGS;
};

// React hook for using settings (optional - for future enhancement)
export const useSettings = () => {
  const [settings, setSettings] = useState<AppSettings>(getAllSettings);

  const updateSetting = <K extends keyof AppSettings>(
    key: K,
    value: AppSettings[K]
  ) => {
    setSetting(key, value);
    setSettings(prev => ({ ...prev, [key]: value }));
  };

  const resetSettings = () => {
    const defaults = resetAllSettings();
    setSettings(defaults);
  };

  return {
    settings,
    updateSetting,
    resetSettings,
  };
};

// Utility function to get the effective map theme based on settings
export const getEffectiveMapTheme = (): 'light' | 'dark' => {
  const mapTheme = getSetting('mapTheme');
  const darkMode = getSetting('darkMode');
  
  if (mapTheme === 'auto') {
    return darkMode ? 'dark' : 'light';
  }
  
  return mapTheme as 'light' | 'dark';
};

// Map tile layer configurations
export const MAP_TILE_LAYERS = {
  light: {
    url: 'https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png',
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/">CARTO</a>',
    subdomains: 'abcd',
    maxZoom: 19,
  },
  dark: {
    url: 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png',
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/">CARTO</a>',
    subdomains: 'abcd',
    maxZoom: 19,
  }
};

// Get the appropriate tile layer config for current theme
export const getCurrentTileLayer = () => {
  const theme = getEffectiveMapTheme();
  return MAP_TILE_LAYERS[theme];
};
