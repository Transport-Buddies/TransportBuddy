import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  MapPin,
  Flag,
  Menu,
  Map as MapIcon,
  Settings2,
  Crosshair,
  X,
} from 'lucide-react';
import { FaHistory } from 'react-icons/fa';
import throttle from 'lodash/throttle';
import { getSetting } from '../../utils/settings';
import './Home.css';

// Definition for history items
type TravelHistoryItem = {
  id: number;
  originName: string;
  destinationName: string;
  originCoords: {lat: number; lng: number};
  destinationCoords: {lat: number; lng: number};
  timestamp: string;
};

type Suggestion = {
  placePrediction: {
    mainText: { text: string };
    secondaryText: { text: string };
    placeId: string;
  };
};

const HomePage: React.FC = () => {
  const [origin, setOrigin] = useState('');
  const [destination, setDestination] = useState('');
  const [originSuggestions, setOriginSuggestions] = useState<Suggestion[]>([]);
  const [destinationSuggestions, setDestinationSuggestions] = useState<Suggestion[]>([]);
  const [originCoords, setOriginCoords] = useState<{lat: number; lng: number} | null>(null);
  const [destinationCoords, setDestinationCoords] = useState<{lat: number; lng: number} | null>(null);
  const placesRef = useRef<any>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [typed, setTyped] = useState('');
  const [sidebarOpen, setSidebarOpen] = useState(false);
  
  // Get dark mode from settings utility instead of local state
  const [darkMode, setDarkMode] = useState(() => getSetting('darkMode'));
  const [showHistoryPanel, setShowHistoryPanel] = useState(false);
  const [travelHistory, setTravelHistory] = useState<TravelHistoryItem[]>([]);
  const geocoderRef = useRef<google.maps.Geocoder | null>(null);
  const navigate = useNavigate();

  // Load the new API once
  useEffect(() => {
    if (!window.google?.maps?.importLibrary) {
      console.error('Google Maps v3.58+ required');
      return;
    }
    // Import the Places library
    google.maps.importLibrary('places')
      .then((lib) => {
        const placesLib = lib as google.maps.PlacesLibrary;
        placesRef.current = placesLib.AutocompleteSuggestion;
        // Initialize once maps lib is loaded
        geocoderRef.current = new google.maps.Geocoder();
      })
      .catch((e) => console.error('Places import failed', e));
  }, []);

  // Fetch suggestions from the Places API
  const fetchSuggestions = async (
    query: string,
    setter: React.Dispatch<React.SetStateAction<Suggestion[]>>
  ) => {
    if (!placesRef.current || !query) {
      setter([]);
      return;
    }
    try {
      const { suggestions } = await placesRef.current.fetchAutocompleteSuggestions({
        input: query,
        includedRegionCodes: ['NO'],
      });
      setter(suggestions || []);
    } catch (e) {
      console.error('Autocomplete fetch failed', e);
      setter([]);
    }
  };
  // Geocode and log the location
const geocodeAndStore = (placeId: string, label: 'Origin' | 'Destination') => {
  if (!geocoderRef.current) return console.error('Geocoder not ready');
  geocoderRef.current.geocode({ placeId }, (results, status) => {
    if (status === 'OK' && results?.[0]?.geometry?.location) {
      const loc = results[0].geometry.location;
      if (label === 'Origin') {
        setOriginCoords({ lat: loc.lat(), lng: loc.lng() });
      } else {
        setDestinationCoords({ lat: loc.lat(), lng: loc.lng() });
      }
    } else {
      console.error(`Geocode ${label} failed: ${status}`);
    }
  });
};
  // throttling the fetch calls
  const throttledOriginFetch = useRef(
    throttle((q: string) => fetchSuggestions(q, setOriginSuggestions), 300)
  ).current;
  const throttledDestFetch = useRef(
    throttle((q: string) => fetchSuggestions(q, setDestinationSuggestions), 300)
  ).current;

  // for origin input change
  const onOriginChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    setOrigin(val);
     throttledOriginFetch(val);
  };

  // Pick an origin from suggestions
  const pickOrigin = (s: Suggestion) => {
    const pid = s.placePrediction.placeId;
    setOrigin(`${s.placePrediction.mainText.text}, ${s.placePrediction.secondaryText.text}`);
    setOriginSuggestions([]);
    geocodeAndStore(pid, 'Origin');
  };

  // Mirror for destination
  const onDestinationChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    setDestination(val);
    throttledDestFetch(val);
  };
  
  // Pick a destination from suggestions
  const pickDestination = (s: Suggestion) => {
    const pid = s.placePrediction.placeId;
    setDestination(`${s.placePrediction.mainText.text}, ${s.placePrediction.secondaryText.text}`);
    setDestinationSuggestions([]);
    geocodeAndStore(pid, 'Destination');
  };

  // Fetch weather commentary on mount (unchanged)
  useEffect(() => {
    const apiUrl = process.env.REACT_APP_API_URL;
    if (!apiUrl) return;
    navigator.geolocation.getCurrentPosition(
      async ({ coords }) => {
        try {
          const res = await fetch(
            `${apiUrl}/api/weather-commentary?lat=${coords.latitude}&lon=${coords.longitude}`
          );
          const data = await res.json();
          setMessage(data.commentary);
        } catch (e) {
          console.error(e);
        }
      },
      (err) => console.error(err)
    );
  }, []);

  // Typewriter effect for the weather commentary with initial delay
  useEffect(() => {
    if (!message) return;
    
    // Initial delay before starting the typewriter effect
    const startDelay = setTimeout(() => {
      let i = 0;
      setTyped('');
      const timer = setInterval(() => {
        setTyped(message.slice(0, i + 1));
        i++;
        if (i >= message.length) clearInterval(timer);
      }, 15); // Slightly faster typing speed
      
      return () => clearInterval(timer);
    }, 500); // 500ms initial delay
    
    return () => clearTimeout(startDelay);
  }, [message]);

  // Load travel history from localStorage when component mounts
  useEffect(() => {
    const savedHistory = localStorage.getItem('transportBuddyHistory');
    if (savedHistory) {
      setTravelHistory(JSON.parse(savedHistory));
    }
  }, []);

  // Save dark mode preference to localStorage whenever it changes
  useEffect(() => {
    // Listen for settings changes and update dark mode accordingly
    const updateDarkMode = () => {
      setDarkMode(getSetting('darkMode'));
    };
    
    // Listen for storage changes (when settings are updated in another tab/component)
    const handleStorageChange = (e: StorageEvent) => {
      if (e.key === 'darkMode') {
        updateDarkMode();
      }
    };
    
    window.addEventListener('storage', handleStorageChange);
    
    // Apply dark mode to the document body
    if (darkMode) {
      document.body.classList.add('dark-mode');
    } else {
      document.body.classList.remove('dark-mode');
    }
    
    return () => {
      window.removeEventListener('storage', handleStorageChange);
    };
  }, [darkMode]);

  // Function to save a trip to history
  const saveToHistory = () => {
    if (!originCoords || !destinationCoords) return;
    
    // Create new history item
    const historyItem: TravelHistoryItem = {
      id: Date.now(),
      originName: origin,
      destinationName: destination,
      originCoords,
      destinationCoords,
      timestamp: new Date().toISOString()
    };
    
    // Update state with new history item
    const updatedHistory = [historyItem, ...travelHistory].slice(0, 20); // Keep most recent 20
    setTravelHistory(updatedHistory);
    
    // Save to localStorage
    localStorage.setItem('transportBuddyHistory', JSON.stringify(updatedHistory));
  };

  // Function to load a trip from history
  const loadFromHistory = (item: TravelHistoryItem) => {
    setOrigin(item.originName);
    setDestination(item.destinationName);
    setOriginCoords(item.originCoords);
    setDestinationCoords(item.destinationCoords);
    setShowHistoryPanel(false); // Close the panel after selection
  };

  // Handle routing logic
  const handleRoute = () => {
    //if there are no coordinates, log it. for debugging purposes
    if (!originCoords || !destinationCoords) {
      console.error('Missing coordinates. Did you pick both Origin and Destination?');
      return;
    }
    
    // Save trip to history
    saveToHistory();
    
    console.log(
      'Routing from',
      originCoords.lat, originCoords.lng,
      'to',
      destinationCoords.lat, destinationCoords.lng
    );
    
    // Navigate to the map page with origin and destination coordinates as query parameters
    navigate(`/maps?origin=${originCoords.lat},${originCoords.lng}&destination=${destinationCoords.lat},${destinationCoords.lng}`);
  };

  // Add travel history entry
const addToHistory = () => {
  if (!originCoords || !destinationCoords) return;
  const newEntry: TravelHistoryItem = {
    id: Date.now(),
    originName: origin,
    destinationName: destination,
    originCoords: originCoords,
    destinationCoords: destinationCoords,
    timestamp: new Date().toISOString(),
  };
  setTravelHistory((prev) => [newEntry, ...prev]);
};

// Clear travel history
const clearHistory = () => {
  setTravelHistory([]);
};

// Re-route based on history item
const rerouteFromHistory = (item: TravelHistoryItem) => {
  setOrigin(item.originName);
  setDestination(item.destinationName);
  setOriginCoords(item.originCoords);
  setDestinationCoords(item.destinationCoords);
  // Optionally, navigate to map directly
  navigate(`/maps?origin=${item.originCoords.lat},${item.originCoords.lng}&destination=${item.destinationCoords.lat},${item.destinationCoords.lng}`);
};

  return (
    <div className="flex h-screen bg-gray-800">
      {/* Sidebar */}
      <aside className={`bg-gray-800 flex flex-col justify-between items-center py-6 transition-all duration-300 overflow-hidden ${sidebarOpen ? 'w-16 rounded-tr-2xl rounded-br-2xl' : 'w-0'}`}>
        <div className="flex-1 flex flex-col items-center space-y-6">
          <button onClick={() => navigate('/maps')} className="text-gray-300 hover:text-gray-500 focus:outline-none">
            <MapIcon size={35} />
          </button>
        </div>
        <button onClick={() => navigate('/settings')} className="text-gray-300 hover:text-gray-500 focus:outline-none mt-6">
          <Settings2 size={20} />
        </button>
      </aside>

      {/* Main */}
      <main className={`flex-1 flex items-center justify-center relative transition-all duration-300 rounded-l-2xl ${darkMode ? 'bg-gradient-to-br from-gray-900 via-gray-800 to-gray-900' : 'bg-[#B7B7B7]'}`}>
        {/* Toggles */}
        <button onClick={() => setSidebarOpen(p => !p)} className={`absolute top-4 z-50 bg-transparent p-2 rounded-md focus:outline-none transition-all ${sidebarOpen ? 'left-8' : 'left-4'} ${darkMode ? 'text-gray-300 hover:text-gray-500' : 'text-gray-900 hover:text-gray-300'}`}>
          <Menu size={20} />
        </button>
        <div className="absolute top-4 right-4 flex space-x-4 z-50">
          <button 
            onClick={() => setShowHistoryPanel(prev => !prev)} 
            className={`p-2 bg-transparent focus:outline-none ${darkMode ? 'text-gray-300 hover:text-gray-500' : 'text-gray-900 hover:text-gray-300'}`}
          >
            <FaHistory size={20} />
          </button>
        </div>

        {/* History Panel */}
        <div className={`history-panel fixed top-0 right-0 h-full w-80 transition-transform duration-300 ease-in-out z-60 transform ${showHistoryPanel ? 'translate-x-0' : 'translate-x-full'} ${darkMode ? 'bg-gray-800 text-gray-100' : 'bg-white text-gray-800'}`}>
          <div className="flex justify-between items-center p-4 border-b border-gray-200 dark:border-gray-700">
            <h3 className="font-medium text-lg">Travel History</h3>
            <button 
              onClick={() => setShowHistoryPanel(false)} 
              className={`p-1 rounded-full ${darkMode ? 'hover:bg-gray-700' : 'hover:bg-gray-200'}`}
            >
              <X size={18} />
            </button>
          </div>
          
          <div className="p-4 h-[calc(100%-120px)] overflow-y-auto sidebar-scrollbar">
            {travelHistory.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-full">
                <p className={`text-center ${darkMode ? 'text-gray-400' : 'text-gray-500'}`}>No travel history yet</p>
                <p className={`text-center text-sm mt-2 ${darkMode ? 'text-gray-500' : 'text-gray-400'}`}>
                  Your recent trips will appear here
                </p>
              </div>
            ) : (
              <div className="space-y-3">
                {travelHistory.map(item => (
                  <div 
                    key={item.id} 
                    className={`p-3 rounded-lg cursor-pointer transition-all ${
                      darkMode 
                        ? 'bg-gray-700 hover:bg-gray-600' 
                        : 'bg-gray-100 hover:bg-gray-200'
                    }`}
                    onClick={() => loadFromHistory(item)}
                  >
                    <div className="font-medium mb-1">
                      <div className="flex items-center">
                        <MapPin size={14} className="mr-1 flex-shrink-0" />
                        <span className="truncate">{item.originName}</span>
                      </div>
                      <div className="flex items-center mt-1">
                        <Flag size={14} className="mr-1 flex-shrink-0" />
                        <span className="truncate">{item.destinationName}</span>
                      </div>
                    </div>
                    <div className={`text-xs mt-2 ${darkMode ? 'text-gray-400' : 'text-gray-500'}`}>
                      {new Date(item.timestamp).toLocaleDateString()} at {new Date(item.timestamp).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
          
          {/* Footer with Clear All button */}
          {travelHistory.length > 0 && (
            <div className={`p-4 border-t ${darkMode ? 'border-gray-700' : 'border-gray-200'}`}>
              <button
                onClick={() => {
                  // Confirm before clearing
                  if (window.confirm('Are you sure you want to clear all travel history?')) {
                    setTravelHistory([]);
                    localStorage.removeItem('transportBuddyHistory');
                  }
                }}
                className={`w-full py-2 px-4 rounded-lg font-medium transition-all flex items-center justify-center ${
                  darkMode 
                    ? 'bg-red-700 text-white hover:bg-red-600' 
                    : 'bg-red-600 text-white hover:bg-red-500'
                }`}
              >
                Clear All History
              </button>
            </div>
          )}
        </div>

        <div className="w-full max-w-sm px-4">
          {/* Weather Commentary Container - With Fixed Height and Ellipsis */}
          <div className="flex justify-center mb-8 px-4">
            <div className={`weather-commentary-container text-center font-medium w-full ${darkMode ? 'text-gray-300' : 'text-gray-700'}`}>
              {message ? (
                <div className="animate-fade-in">
                  <p className="text-sm sm:text-base">
                    {typed}
                    <span className="animate-pulse">|</span>
                  </p>
                </div>
              ) : (
                <div className={`dots-loading py-4 ${darkMode ? 'dark-mode' : ''}`}>
                  <span></span>
                  <span></span>
                  <span></span>
                </div>
              )}
            </div>
          </div>
          
          <div className="space-y-4">
            {/* Origin Input */}
            <div className="relative">
              <div className="absolute inset-y-0 left-3 flex items-center pointer-events-none">
                <MapPin size={20} className="text-gray-400" />
              </div>
              {/* set the origin coordinates to current location */}
              <button className="absolute right-3 top-1/2 transform -translate-y-1/2 text-gray-300 hover:text-gray-500 focus:outline-none" onClick={() => {
                navigator.geolocation.getCurrentPosition(
                  ({ coords }) => {
                    setOriginCoords({ lat: coords.latitude, lng: coords.longitude });
                    setOrigin('Current Location');
                    setOriginSuggestions([]);
                });
              }}>
                <Crosshair size={20} />
              </button>
              <input
                type="text"
                value={origin}
                onChange={onOriginChange}
                placeholder="Origin"
                className={`w-full h-12 pl-12 pr-12 rounded-lg focus:outline-none focus:ring-2 focus:ring-gray-400 ${
                  darkMode ? 'bg-gray-700 text-gray-200 placeholder-gray-400' : 'bg-white text-gray-800 placeholder-gray-500'
                }`}
              />
              {/* Drop-down */}
              {originSuggestions.length > 0 && (
                <ul className={`absolute top-full left-0 right-0 shadow-lg rounded-b-lg max-h-48 overflow-auto z-10 ${
                  darkMode ? 'bg-gray-700 text-gray-200' : 'bg-white text-gray-800'
                }`}>
                  {originSuggestions.map((s, i) => (
                    <li
                      key={i}
                      onClick={() => pickOrigin(s)}
                      className={`px-4 py-2 cursor-pointer ${
                        darkMode ? 'hover:bg-gray-600' : 'hover:bg-gray-200'
                      }`}
                    >
                      {s.placePrediction.mainText.text}, {s.placePrediction.secondaryText.text}
                    </li>
                  ))}
                </ul>
              )}
            </div>

            {/* Destination Input */}
            <div className="relative">
              <div className="absolute inset-y-0 left-3 flex items-center pointer-events-none">
                <Flag size={20} className="text-gray-400" />
              </div>
              <input
                type="text"
                value={destination}
                onChange={onDestinationChange}
                placeholder="Destination"
                className={`w-full h-12 pl-12 pr-4 rounded-lg focus:outline-none focus:ring-2 focus:ring-gray-400 ${
                  darkMode ? 'bg-gray-700 text-gray-200 placeholder-gray-400' : 'bg-white text-gray-800 placeholder-gray-500'
                }`}
              />
              {destinationSuggestions.length > 0 && (
                <ul className={`absolute top-full left-0 right-0 shadow-lg rounded-b-lg max-h-48 overflow-auto z-10 ${
                  darkMode ? 'bg-gray-700 text-gray-200' : 'bg-white text-gray-800'
                }`}>
                  {destinationSuggestions.map((s, i) => (
                    <li
                      key={i}
                      onClick={() => pickDestination(s)}
                      className={`px-4 py-2 cursor-pointer ${
                        darkMode ? 'hover:bg-gray-600' : 'hover:bg-gray-200'
                      }`}
                    >
                      {s.placePrediction.mainText.text}, {s.placePrediction.secondaryText.text}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>

          <p className={`text-center mt-2 mb-6 ${darkMode ? 'text-gray-400' : 'text-gray-600'}`}>
            Where would you like to go today?
          </p>

          <button
            type="button"
            onClick={handleRoute}
            disabled={!originCoords || !destinationCoords}
            className={`w-full h-12 font-semibold rounded-lg transition ${
              darkMode 
                ? 'bg-gradient-to-r from-gray-700 to-gray-900 text-gray-200 hover:from-gray-600 hover:to-gray-800' 
                : 'bg-gray-800 text-white hover:bg-black'
            } ${(!originCoords || !destinationCoords) && 'opacity-70'}`}
          >
            Route
          </button>

          {/* Last Trip - Conditionally Rendered */}
          {travelHistory.length > 0 && (
            <div className="mt-8">
              <h2 className={`text-lg font-semibold mb-4 ${darkMode ? 'text-gray-300' : 'text-gray-800'}`}>
                Last Trip
              </h2>
              <div className={`rounded-lg shadow-md p-4 ${darkMode ? 'bg-gray-800' : 'bg-white'}`}>
                <div className="mb-2">
                  <div className="flex items-center mb-2">
                    <MapPin size={16} className={`mr-2 ${darkMode ? 'text-gray-400' : 'text-gray-600'}`} />
                    <p className={`font-medium ${darkMode ? 'text-gray-200' : 'text-gray-800'}`}>
                      {travelHistory[0].originName}
                    </p>
                  </div>
                  <div className="flex items-center">
                    <Flag size={16} className={`mr-2 ${darkMode ? 'text-gray-400' : 'text-gray-600'}`} />
                    <p className={`font-medium ${darkMode ? 'text-gray-200' : 'text-gray-800'}`}>
                      {travelHistory[0].destinationName}
                    </p>
                  </div>
                </div>
                <p className={`text-xs ${darkMode ? 'text-gray-400' : 'text-gray-500'} mb-3`}>
                  {new Date(travelHistory[0].timestamp).toLocaleString()}
                </p>
                <div className="flex space-x-3">
                  <button
                    onClick={() => rerouteFromHistory(travelHistory[0])}
                    className={`flex-1 py-2 text-sm rounded-lg font-medium transition-all ${
                      darkMode 
                        ? 'bg-gray-700 text-gray-200 hover:bg-gray-600' 
                        : 'bg-gray-800 text-white hover:bg-black'
                    }`}
                  >
                    Re-route
                  </button>
                  <button
                    onClick={() => setShowHistoryPanel(true)}
                    className={`flex-1 py-2 text-sm rounded-lg font-medium transition-all ${
                      darkMode 
                        ? 'bg-gray-700 text-gray-200 hover:bg-gray-600' 
                        : 'bg-gray-700 text-white hover:bg-gray-600'
                    }`}
                  >
                    View All History
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      </main>
    </div>
  );
};

export default HomePage;
