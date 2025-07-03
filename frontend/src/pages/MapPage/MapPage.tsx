import React, { useEffect, useRef, useState } from 'react';
import L from 'leaflet';
import { useNavigate } from 'react-router-dom';
import { FaCircle, FaMapSigns, FaDotCircle, FaBus, FaHome, FaMapMarkerAlt, FaArrowLeft } from 'react-icons/fa';
import { createTransitIcon } from '../../components/TransitIcons/TransitIcon';
import { getSetting, getCurrentTileLayer, getEffectiveMapTheme } from '../../utils/settings';
import ReactDOMServer from 'react-dom/server';
import polyline from '@mapbox/polyline';
import 'leaflet/dist/leaflet.css';
import './MapPage.css';

// TODO: Componentlize the map page, it's getting a bit messy with all the logic in one place.
// there were soo many variables, so I put comments to keep track of them and make it easier to understand what they do.
const MapPage: React.FC = () => {
  // useNavigate hook from react-router-dom to navigate between pages and useRef to keep track of the map instance
  const navigate = useNavigate();
  const mapRef = useRef<L.Map | null>(null); 
  
  // Add state to track current map bounds
  const [mapBounds, setMapBounds] = useState<L.LatLngBounds | null>(null);

  // references for markers and polylines
  const originMarkerRef = useRef<L.Marker | null>(null);
  const destinationMarkerRef = useRef<L.Marker | null>(null);
  const busMarkerRef = useRef<L.Marker | null>(null);
  const routePolylineRefs = useRef<{ routeIndex: number; polyline: L.Polyline }[]>([]);
  
  // ref to track the current tile layer for theme switching
  const tileLayerRef = useRef<L.TileLayer | null>(null);

  // right click menu.
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; latlng: L.LatLng } | null>(null);

  // queue and animation refs for the bus
  //TODO: make a better algorithm for the bus marker movement
  const locationQueue = useRef<{ lat: number; lon: number }[]>([]);
  const isMoving = useRef(false);

  const vehicleMarkersRef = useRef<Map<string, { marker: L.Marker, animation?: number }>>(new Map());
  const vehiclePositionsRef = useRef<Map<string, { lat: number, lon: number }>>(new Map());
  const animationDuration = 4000; // ms

  // State to hold origin/destination (as lat,lng strings)
  const [origin, setOrigin] = useState<string | null>(null);
  const [destination, setDestination] = useState<string | null>(null);

  // state toggle for setting origin or destination(buttons)
  const [settingMode, setSettingMode] = useState<'origin' | 'destination' | null>(null);
  const settingModeRef = useRef<'origin' | 'destination' | null>(null);

  // State for fetched routes and route display
  const [routes, setRoutes] = useState<any[]>([]);
  const [activeRouteIndex, setActiveRouteIndex] = useState<number | null>(null);
  const [isRoutesVisible, setIsRoutesVisible] = useState<boolean>(true);
  const [showingRouteDetails, setShowingRouteDetails] = useState<boolean>(false);
  const [selectedRouteIndex, setSelectedRouteIndex] = useState<number | null>(null);

  // State for panel retraction
  const [isPanelExpanded, setIsPanelExpanded] = useState<boolean>(true);

  // Toggle function for panel expansion/collapse
  const togglePanel = () => {
    setIsPanelExpanded(!isPanelExpanded);
  };

  // a ref to hold all stop markers, to clear them when needed
  const stopMarkersRef = useRef<L.Marker[]>([]);
  // to keep track of when stops show up on the map. The higher, the more zoomed in you need to be to see it.
  const [minZoomForStops, setMinZoomForStops] = useState<number>(15);

  // Load settings from localStorage and listen for changes
  useEffect(() => {
    const loadMinZoom = () => {
      const savedMinZoom = getSetting('minZoomForStops');
      setMinZoomForStops(savedMinZoom);
    };
    
    loadMinZoom();
    
    // Listen for storage changes (when settings are updated in another tab/component)
    const handleStorageChange = (e: StorageEvent) => {
      if (e.key === 'minZoomForStops') {
        loadMinZoom();
      }
    };
    
    window.addEventListener('storage', handleStorageChange);
    
    return () => {
      window.removeEventListener('storage', handleStorageChange);
    };
  }, []);

  // Listen for theme changes and update tile layer
  useEffect(() => {
    const updateTileLayer = () => {
      const map = mapRef.current;
      const currentTileLayer = tileLayerRef.current;
      
      if (!map || !currentTileLayer) return;
      
      // Get the new tile layer configuration
      const newTileLayerConfig = getCurrentTileLayer();
      
      // Remove the current tile layer
      map.removeLayer(currentTileLayer);
      
      // Add the new tile layer
      const newTileLayer = L.tileLayer(newTileLayerConfig.url, {
        attribution: newTileLayerConfig.attribution,
        subdomains: newTileLayerConfig.subdomains,
        maxZoom: newTileLayerConfig.maxZoom,
      }).addTo(map);
      
      // Update the reference
      tileLayerRef.current = newTileLayer;
    };
    
    // Listen for storage changes that affect map theme
    const handleStorageChange = (e: StorageEvent) => {
      if (e.key === 'darkMode' || e.key === 'mapTheme') {
        updateTileLayer();
      }
    };
    
    window.addEventListener('storage', handleStorageChange);
    
    return () => {
      window.removeEventListener('storage', handleStorageChange);
    };
  }, []);

  // you are here marker ref for getting closest bus stops
  const userLocationRef = useRef<L.LatLng | null>(null);

  // There was a singular useEffect before and it was causing bugs, so I split it into multiple useEffects to asynchronously handle different parts of the map logic.
  // Syncs the ref whenever settingMode changes so the map's click handler always sees the latest
  useEffect(() => {
    settingModeRef.current = settingMode;
  }, [settingMode]);

  const farStopIcon = L.divIcon({
    className: 'custom-marker-icon',
    html: ReactDOMServer.renderToString(<FaCircle size={15} color="gray" />),
    iconSize: [24, 24],
    iconAnchor: [12, 12],
  });

  const closeStopIcon = L.divIcon({
    className: 'custom-marker-icon',
    html: ReactDOMServer.renderToString(<FaMapSigns size={24} color="black" />),
    iconSize: [24, 24],
    iconAnchor: [12, 12],
  });

  const fetchAndAnimateVehicles = async () => {
    if (!mapRef.current) return;
    try {
      // Get current map bounds
      const bounds = mapBounds || mapRef.current.getBounds();
      
      // Send visible bounds to backend for lazy loading optimization
      const visibleBounds = {
        north: bounds.getNorth(),
        south: bounds.getSouth(),
        east: bounds.getEast(),
        west: bounds.getWest()
      };
      
      const queryParams = new URLSearchParams({
        north: visibleBounds.north.toString(),
        south: visibleBounds.south.toString(),
        east: visibleBounds.east.toString(),
        west: visibleBounds.west.toString()
      });
      
      const response = await fetch(`${process.env.REACT_APP_API_URL}/api/vehicles?${queryParams}`);
      const vehicles = await response.json();
      
      // Track which vehicles are currently visible
      const visibleVehicleIds = new Set<string>();
      
      // Count total and visible vehicles for performance monitoring
      const totalVehicles = Object.keys(vehicles).length;
      let visibleVehicles = 0;

      Object.entries(vehicles).forEach(([id, vehicle]: [string, any]) => {
        const { latitude, longitude, bearing, vehicleMode, publishedLineName } = vehicle;
        const prev = vehiclePositionsRef.current.get(id);
        
        // Check if the vehicle is within the current map bounds
        const isInBounds = bounds.contains([latitude, longitude]);
        
        // If the vehicle is in bounds, track it and display/animate it
        if (isInBounds) {
          visibleVehicleIds.add(id);
          visibleVehicles++;
          
          // If marker doesn't exist, create it
          if (!vehicleMarkersRef.current.has(id)) {
            const icon = createTransitIcon({ id: publishedLineName || id, bearing, vehicleMode });
            const marker = L.marker([latitude, longitude], { icon }).addTo(mapRef.current!);
            marker.bindPopup(`<strong>Line:</strong> ${publishedLineName || id}`);
            vehicleMarkersRef.current.set(id, { marker });
            vehiclePositionsRef.current.set(id, { lat: latitude, lon: longitude });
            return;
          }
          
          // Animate marker from prev to new position
          if (prev) {
            // Update icon with new bearing
            const icon = createTransitIcon({ id: publishedLineName || id, bearing, vehicleMode });
            const markerObj = vehicleMarkersRef.current.get(id);
            if (markerObj) {
              markerObj.marker.setIcon(icon);
            }
            animateMarker(id, prev.lat, prev.lon, latitude, longitude);
          }
          vehiclePositionsRef.current.set(id, { lat: latitude, lon: longitude });
        } else {
          // If marker exists but is no longer in view, hide it (don't remove it)
          if (vehicleMarkersRef.current.has(id)) {
            const markerObj = vehicleMarkersRef.current.get(id)!;
            if (markerObj.animation) cancelAnimationFrame(markerObj.animation);
            markerObj.marker.remove();
            vehicleMarkersRef.current.delete(id);
          }
          // Keep position data for when it comes back into view
          vehiclePositionsRef.current.set(id, { lat: latitude, lon: longitude });
        }
      });
      
      // Don't remove any markers - let them be managed by the bounds checking above

      // Log performance improvement
      console.log(`Vehicle optimization: Showing ${visibleVehicles} of ${totalVehicles} vehicles (${Math.round((visibleVehicles/totalVehicles)*100)}%)`);
      
    } catch (err) {
      console.error('Error fetching vehicles:', err);
    }
  };

  const animateMarker = (id: string, startLat: number, startLon: number, endLat: number, endLon: number) => {
    const markerObj = vehicleMarkersRef.current.get(id);
    if (!markerObj) return;

    let startTime: number | null = null;

    const step = (timestamp: number) => {
      if (!startTime) startTime = timestamp;
      const elapsed = timestamp - startTime;
      const t = Math.min(elapsed / animationDuration, 1);

      // Ease-in-out for now.
      const easedT = t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t;

      const lat = startLat + (endLat - startLat) * easedT;
      const lon = startLon + (endLon - startLon) * easedT;

      markerObj.marker.setLatLng([lat, lon]);

      if (t < 1) {
        markerObj.animation = requestAnimationFrame(step);
      }
    };

    // Cancel any previous animation
    if (markerObj.animation) {
      cancelAnimationFrame(markerObj.animation);
    }
    markerObj.animation = requestAnimationFrame(step);
  };

    // fetching and rendering stops on the map
  const fetchAndRenderStops = async () => {
    const map = mapRef.current;
      if (!map) return;
      // stops don't show when zoomed out too far. crashed my pc without this check
      if (map.getZoom() < minZoomForStops) {
        stopMarkersRef.current.forEach((m) => m.remove());
        stopMarkersRef.current = [];
      return;
    }
    // stops show when geolocation is set
    if (!userLocationRef.current) {
      stopMarkersRef.current.forEach((m) => m.remove());
      stopMarkersRef.current = [];
      return;
    }
    stopMarkersRef.current.forEach((m) => m.remove());
    stopMarkersRef.current = [];
    // rad in degrees for the center of the map
    const center = map.getCenter();
    const ne = map.getBounds().getNorthEast();
    const radiusMeters = L.latLng(center).distanceTo(ne);
    const radiusDeg = radiusMeters / 111000;

    // clears any existing stop‐markers
    stopMarkersRef.current.forEach((m) => m.remove());
    stopMarkersRef.current = [];

    // fetches the stops from backend
    try {
      const resp = await fetch(
        `${process.env.REACT_APP_API_URL}/api/stops?lat=${center.lat}&lon=${center.lng}&radius=${radiusDeg}`
      );
      const stops: any[] = await resp.json();

      // when to render bus icons vs circle icons
      const closeThresholdMeters = 190;

      // for each stop, create a marker and add it to the map
      stops.forEach((stop) => {
        const stopLatLng = L.latLng(stop.stop_lat, stop.stop_lon);
        const userLatLng = userLocationRef.current!;
        const distanceToUser = stopLatLng.distanceTo(userLatLng);

        // if the stop is closer than threshold, show busIcon; else farStopIcon
        const chosenIcon = distanceToUser <= closeThresholdMeters ? closeStopIcon : farStopIcon;

        const marker = L.marker([stop.stop_lat, stop.stop_lon], { icon: chosenIcon }).addTo(map);
        marker.bindPopup(`<strong>${stop.stop_name}</strong><br/>Distance: ${Math.round(distanceToUser)} m`);

        stopMarkersRef.current.push(marker);
      });
    } catch (err) {
      console.error('Error fetching stops:', err);
    }
  };

  // Parse URL query parameters to get origin and destination
  useEffect(() => {
    const urlParams = new URLSearchParams(window.location.search);
    const originParam = urlParams.get('origin');
    const destinationParam = urlParams.get('destination');
    
    if (originParam) {
      const [lat, lng] = originParam.split(',').map(Number);
      setOrigin(`${lat},${lng}`);
    }
    
    if (destinationParam) {
      const [lat, lng] = destinationParam.split(',').map(Number);
      setDestination(`${lat},${lng}`);
    }
  }, []);

  //initialize the map and set up event listeners
  useEffect(() => {
    // Initial view set to Stavanger, i'm not imaginative :(
    const map = L.map('map').setView([58.969975, 5.733107], 13); 
    mapRef.current = map; 

    // Set initial bounds
    setMapBounds(map.getBounds());
    
    // Update bounds when map moves or zooms
    map.on('moveend', () => {
      setMapBounds(map.getBounds());
    });
    
    map.on('zoomend', () => {
      setMapBounds(map.getBounds());
    });

    // Initialize with the appropriate tile layer based on current theme
    const tileLayerConfig = getCurrentTileLayer();
    const tileLayer = L.tileLayer(tileLayerConfig.url, {
      attribution: tileLayerConfig.attribution,
      subdomains: tileLayerConfig.subdomains,
      maxZoom: tileLayerConfig.maxZoom,
    }).addTo(map);
    
    tileLayerRef.current = tileLayer;

    map.setMinZoom(10);// Set minimum zoom level to 10, so all vehicles dont load at once and the map doesn't break into loops

    const renderVehicleMarkers = async () => {
    const map = mapRef.current;
    if (!map) return;

    try {
      const response = await fetch("http://localhost:5000/api/vehicles");
      const data = await response.json();

      Object.entries(data).forEach(([id, vehicle]: [string, any]) => {
      const { latitude, longitude, bearing, vehicleMode, publishedLineName } = vehicle;

      const vehicleIcon = createTransitIcon({ id: publishedLineName || id, bearing, vehicleMode });
      const marker = L.marker([latitude, longitude], { icon: vehicleIcon }).addTo(map);
      marker.bindPopup(`<strong>Line:</strong> ${publishedLineName || id}`);
      });
    } catch (err) {
      console.error("Error fetching vehicle data:", err);
    }
    };

    // tracks if the map component is still mounted. stops memory leaks and runtime errors
    let isMounted = true; 

    // you are here marker
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (position) => {
          if (!isMounted) return; 
          const { latitude, longitude } = position.coords;
          userLocationRef.current = L.latLng(latitude, longitude);

          if (map && map.setView) {
            map.setView([latitude, longitude], 13);

            const customIcon = L.divIcon({
              className: 'custom-marker-icon', 
              html: ReactDOMServer.renderToString(<FaMapMarkerAlt size={30} color="black" />),
              iconSize: [30, 30], 
              iconAnchor: [15, 30], 
            });
              // Call it once on map init
            // renderVehicleMarkers();

            // Test marker for user location
            const userMarker = L.marker([latitude, longitude], { icon: customIcon }).addTo(map);
            // userMarker.bindPopup('u are here').openPopup();
          }
        },
        (error) => {
          if (isMounted) {
            console.error('Error getting location:', error);
            alert('Unable to retrieve your location. Please enable location services.');
          }
        }
      );
    } else {
      alert('Geolocation is not supported by your browser.');
    }

    //  settingModeRef to decide if setting origin or destination
    map.on('click', (e: L.LeafletMouseEvent) => {
      const mode = settingModeRef.current;
      const { lat, lng } = e.latlng;

      if (mode === 'origin') {
        setOrigin(`${lat},${lng}`);
        setSettingMode(null);
      } else if (mode === 'destination') {
        setDestination(`${lat},${lng}`);
        setSettingMode(null);
      }
    });
    map.on('moveend', () => {
      fetchAndRenderStops();
      // Update map bounds state
      setMapBounds(map.getBounds());
    });
    map.on('zoomend', () => {
      fetchAndRenderStops();
      // Update map bounds state
      setMapBounds(map.getBounds());
    });
    return () => {
      isMounted = false;
      map.off('moveend', fetchAndRenderStops);
      map.off('zoomend', fetchAndRenderStops);
      if (mapRef.current) {
        mapRef.current.remove();
        mapRef.current = null;
      }
    };

  }, [navigate]);

  // Fetch vehicles when map bounds change
  useEffect(() => {
    if (mapBounds) {
      fetchAndAnimateVehicles();
    }
  }, [mapBounds]);

  // Regular interval updates for real-time tracking (even when map isn't moving)
  useEffect(() => {
    const intervalId = setInterval(() => {
      fetchAndAnimateVehicles();
    }, 5000);
    
    return () => clearInterval(intervalId);
  }, []);

  // Vehicles fetching is now handled by both the bounds change and interval
  
  useEffect(() => {
    fetchAndRenderStops();
  }, []);

  // changes to origin will trigger this effect
  useEffect(() => {
    if (!mapRef.current) return;

    if (originMarkerRef.current) {
      originMarkerRef.current.remove();
      originMarkerRef.current = null;
    }
    if (origin) {
      const [lat, lng] = origin.split(',').map(Number);
      const markerIcon = L.divIcon({
        className: 'custom-marker-icon',
        html: ReactDOMServer.renderToString(<FaDotCircle size={24} color="black" />),
        iconSize: [24, 24],
        iconAnchor: [12, 12],
      });
      originMarkerRef.current = L.marker([lat, lng], { icon: markerIcon }).addTo(mapRef.current);
    }
  }, [origin]);

  // changes to destination will trigger this effect
  useEffect(() => {
    if (!mapRef.current) return;

    if (destinationMarkerRef.current) {
      destinationMarkerRef.current.remove();
      destinationMarkerRef.current = null;
    }
    if (destination) {
      const [lat, lng] = destination.split(',').map(Number);
      const markerIcon = L.divIcon({
        className: 'custom-marker-icon',
        html: ReactDOMServer.renderToString(<FaDotCircle size={24} color="black" />),
        iconSize: [24, 24],
        iconAnchor: [12, 12],
      });
      destinationMarkerRef.current = L.marker([lat, lng], { icon: markerIcon }).addTo(mapRef.current);
    }
  }, [destination]);

  // drawing routes when both origin and destination are set
  const fetchAndDisplayRoutes = async () => {
    if (!origin || !destination || !mapRef.current) return;

    try {
      const response = await fetch(
        `${process.env.REACT_APP_API_URL}/api/routes?origin=${origin}&destination=${destination}`
      );
      const data = await response.json();
      setRoutes(data.routes || []);

      // Clear old polylines
      routePolylineRefs.current.forEach((entry) => entry.polyline.remove());
      routePolylineRefs.current = [];

      // Drawing each section separately
      data.routes.forEach((route: any, i: number) => {
        route.sections.forEach((section: any) => {
          if (!section.polyline) return;

          // decode per sections
          const coords: L.LatLngExpression[] = polyline
            .decode(section.polyline)
            .map(([lat, lng]) => [lat, lng]);

          // If section is walking, use dashArray (just dashes), else solid line
          const isWalking = section.type === 'pedestrian';
          const style: L.PathOptions = {
            color: i === activeRouteIndex ? 'black' : 'gray',
            opacity: i === activeRouteIndex ? 1 : 0.2,
            ...(isWalking ? { dashArray: '6 6' } : {}),
          };

          const sectionPoly = L.polyline(coords, style).addTo(mapRef.current!);

          // When any part of a route is clicked, select the whole route and show details
          sectionPoly.on('click', () => {
            setActiveRouteIndex(i);
            setSelectedRouteIndex(i);
            setShowingRouteDetails(true);
          });

          // Add the polyline to the map
          routePolylineRefs.current.push({
          routeIndex: i,
          polyline: sectionPoly,
        });
        });
      });
    } catch (error) {
      console.error('Error fetching routes:', error);
    }
  };
  
  // Coloring for the active route
  useEffect(() => {
    routePolylineRefs.current.forEach((entry) => {
      entry.polyline.setStyle({
        color: entry.routeIndex === activeRouteIndex ? 'black' : 'gray',
        opacity: entry.routeIndex === activeRouteIndex ? 1 : 0.4,
        dashArray: entry.polyline.options.dashArray || undefined,
      });
    });
  }, [activeRouteIndex]);
  
  // Fetch routes when both origin and destination are set
  useEffect(() => {
    if (origin && destination) {
      fetchAndDisplayRoutes();
    }
  }, [origin, destination]);
  
    
  // Function to show detailed instructions for a route
  const showRouteDetails = (index: number) => {
    setSelectedRouteIndex(index);
    setShowingRouteDetails(true);
    setActiveRouteIndex(index); 
  };

  return (
    <div id="map-container" style={{ display: 'flex', height: '100vh', width: '100vw' }}>
      {/* Left side panel */}
      <div 
        className={`bg-gray-800 text-white p-6 flex flex-col justify-between z-[1000] overflow-auto sidebar-scrollbar transition-all duration-300 ease-in-out ${
          isPanelExpanded ? 'w-[220px]' : 'w-[60px]'
        }`}
      >
        {/* Toggle button */}
        <div className="flex justify-between items-center mb-4">
          {isPanelExpanded && (
            <div className="flex-1">
              {showingRouteDetails ? (
                <button
                  onClick={() => setShowingRouteDetails(false)}
                  className="text-gray-400 hover:text-white flex items-center"
                >
                  &lt; Back to Routes
                </button>
              ) : (
                <button
                  onClick={() => navigate('/')}
                  className="flex items-center space-x-2 text-gray-400 hover:text-white"
                >
                  <FaArrowLeft size={20}/> <span>Back to Home</span>
                </button>
              )}
            </div>
          )}
        </div>

        <div className={`flex-1 ${isPanelExpanded ? '' : 'hidden'}`}>
          {!showingRouteDetails && (
            <>
              <div className="mb-6">
                <p className="text-xs text-gray-400">Origin</p>
                <p className="font-bold">{origin || 'Not set'}</p>
              </div>
              <div style={{ marginBottom: '1.5rem' }}>
                <p className="text-xs text-gray-400">Destination</p>
                <p className="font-bold">{destination || 'Not set'}</p>
              </div>
            </>
          )}

          <hr className="border-gray-600 my-6" />

          {/* Show all routes list or detailed route view */}
          {showingRouteDetails && selectedRouteIndex !== null && routes[selectedRouteIndex] ? (
            <div>
              <h3 className="font-bold mb-4 text-lg">Route Details</h3>
              
              <div className="mb-4">
                <p className="text-xs text-gray-400">Distance</p>
                <p className="font-bold">{(routes[selectedRouteIndex].distance / 1609).toFixed(1)} miles</p>
              </div>

              <div className="mb-4">
                <p className="text-xs text-gray-400">Estimated Time</p>
                <p className="font-bold">{Math.round(routes[selectedRouteIndex].duration / 60)} minutes</p>
              </div>
              
              <div className="mt-4">
                <h4 className="text-sm font-medium mb-2">Steps:</h4>
                <ul className="space-y-3">
                  {routes[selectedRouteIndex].sections.map((section: any, index: number) => {
                    if (section.type === 'pedestrian') {
                      const destinationName = section.arrival?.place?.name || 'your destination';
                      return (
                        <li key={index} className="pl-2 border-l-2 border-gray-600">
                          <span className="font-medium">Walk</span> to <span className="font-medium">{destinationName}</span>
                          <div className="text-xs text-gray-400">{Math.round(section.distance)} meters</div>
                        </li>
                      );
                    }
                    if (section.type === 'transit') {
                      const mode = section.transport?.mode?.toLowerCase() || '';
                      const transitName = section.transport?.shortName || section.transport?.name || 'unknown';
                      const from = section.departure?.place?.name || 'unknown stop';
                      const to = section.arrival?.place?.name || 'unknown stop';
                      const isTrain = mode.includes('rail') || mode.includes('train') || /^l\d+$/i.test(transitName);
                      
                      return (
                        <li key={index} className="pl-2 border-l-2 border-gray-600">
                          Take <span className="font-medium">{isTrain ? 'Train' : 'Bus'} {transitName}</span> from <span className="font-medium">{from}</span> to <span className="font-medium">{to}</span>
                          <div className="flex items-center mt-1">
                            <div className="h-2 w-2 rounded-full bg-green-400 mr-2"></div>
                            <div className="text-xs">{section.departure?.time?.substring(11, 16) || ''}</div>
                            <div className="mx-1 text-xs">→</div>
                            <div className="text-xs">{section.arrival?.time?.substring(11, 16) || ''}</div>
                          </div>
                        </li>
                      );
                    }
                    return null;
                  })}
                </ul>
              </div>
            </div>
          ) : (
            <>
              {routes.length > 0 && (
                <div>
                  <h3 className="font-bold mb-4">Available Routes</h3>
                  <div className="space-y-4">
                    {routes.map((route, index) => (
                      <div 
                        key={index}
                        className={`p-3 rounded-md cursor-pointer transition-all route-item ${activeRouteIndex === index ? 'bg-gray-700' : 'bg-gray-900 hover:bg-gray-700'}`}
                        onClick={() => showRouteDetails(index)}
                      >
                        <div className="flex justify-between items-center mb-2">
                          <div className="font-bold">Route {index + 1}</div>
                          <div className="text-sm">{Math.round(route.duration / 60)} min</div>
                        </div>
                        <div className="text-xs text-gray-400">
                          {route.sections.map((section: any) => {
                            if (section.type === 'transit') {
                              const mode = section.transport?.mode?.toLowerCase() || '';
                              const transitName = section.transport?.shortName || '';
                              const isTrain = mode.includes('rail') || mode.includes('train') || /^l\d+$/i.test(transitName);
                              return (
                                <span key={section.id} className="mr-1">
                                  {isTrain ? '🚆' : '🚌'} {transitName}
                                </span>
                              );
                            }
                            return null;
                          })}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </>
          )}
        </div>

        <div className={`text-xs text-gray-600 mt-6 ${isPanelExpanded ? '' : 'hidden'}`}>
          Transport Buddy © 2025
        </div>
      </div>

      {/* Map */}
      <div
        id="map"
        style={{ flexGrow: 1 }}
        onContextMenu={(e) => {
          e.preventDefault();
          const containerPoint = mapRef.current?.mouseEventToContainerPoint(e.nativeEvent as MouseEvent);
          const latlng = mapRef.current?.containerPointToLatLng(containerPoint!);
          if (latlng) {
            setContextMenu({ x: e.clientX, y: e.clientY, latlng });
          }
          if (contextMenu && Math.abs(e.clientX - contextMenu.x) < 10 && Math.abs(e.clientY - contextMenu.y) < 10) {
            setContextMenu(null);
            return;
          }
        }}
      >
        {/* Floating Panel Toggle Button */}
        <button
          onClick={togglePanel}
          className="absolute left-4 top-1/2 transform -translate-y-1/2 z-[1001] bg-gray-800 text-white p-3 rounded-lg shadow-lg hover:bg-gray-700 transition-all duration-200 border border-gray-600"
          title={isPanelExpanded ? "Collapse panel" : "Expand panel"}
        >
          {isPanelExpanded ? '⫷' : '☰'}
        </button>
      </div>
      {contextMenu && (
      <div
        className="absolute bg-gray-800 text-white rounded shadow-lg"
        style={{
          left: contextMenu.x,
          top: contextMenu.y,
          padding: '8px 0',
          zIndex: 2000,
          minWidth: '160px'
        }}
        onMouseLeave={() => setContextMenu(null)}
      >
        <div
          className="p-2 cursor-pointer"
          onClick={() => {
            setOrigin(`${contextMenu.latlng.lat},${contextMenu.latlng.lng}`);
            setContextMenu(null);
          }}
        >
          Set as Origin
        </div>

        <div
          className="p-2 cursor-pointer"
          onClick={() => {
            setDestination(`${contextMenu.latlng.lat},${contextMenu.latlng.lng}`);
            setContextMenu(null);
          }}
        >
          Set as Destination
        </div>

        <div
          className="p-2 cursor-pointer"
          onClick={() => {
            setOrigin(null);
            setDestination(null);
            setRoutes([]);
            setActiveRouteIndex(null);
            if (originMarkerRef.current) originMarkerRef.current.remove();
            if (destinationMarkerRef.current) destinationMarkerRef.current.remove();
            routePolylineRefs.current.forEach((entry) => entry.polyline.remove());
            routePolylineRefs.current = [];
            setContextMenu(null);
          }}
        >
          Reset
        </div>
      </div>
    )}
    </div>
  );
};

export default MapPage;
