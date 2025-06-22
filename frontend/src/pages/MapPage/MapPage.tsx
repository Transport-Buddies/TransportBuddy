import React, { useEffect, useRef, useState } from 'react';
import L from 'leaflet';
import { useNavigate } from 'react-router-dom';
import { FaCircle, FaMapSigns, FaDotCircle, FaBus, FaHome, FaMapMarkerAlt } from 'react-icons/fa';
import { createTransitIcon } from '../../components/TransitIcons/TransitIcon';
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

  // references for markers and polylines
  const originMarkerRef = useRef<L.Marker | null>(null);
  const destinationMarkerRef = useRef<L.Marker | null>(null);
  const busMarkerRef = useRef<L.Marker | null>(null);
  const routePolylineRefs = useRef<{ routeIndex: number; polyline: L.Polyline }[]>([]);

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

  // State for fetched routes and active route index
  const [routes, setRoutes] = useState<any[]>([]);
  const [activeRouteIndex, setActiveRouteIndex] = useState<number | null>(null);
  const [isRoutesVisible, setIsRoutesVisible] = useState<boolean>(true);

  // a ref to hold all stop markers, to clear them when needed
  const stopMarkersRef = useRef<L.Marker[]>([]);
  // to keep track of when stops show up on the map. The higher, the more zoomed in you need to be to see it.
  const minZoomfForStops = 15;

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
      const response = await fetch(`${process.env.REACT_APP_API_URL}/api/vehicles`);
      const vehicles = await response.json();

      Object.entries(vehicles).forEach(([id, vehicle]: [string, any]) => {
        const { latitude, longitude, bearing, vehicleMode, publishedLineName } = vehicle;
        const prev = vehiclePositionsRef.current.get(id);

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
      });
      vehicleMarkersRef.current.forEach((value, id) => {
        if (!vehicles[id]) {
          if (value.animation) cancelAnimationFrame(value.animation);
          value.marker.remove();
          vehicleMarkersRef.current.delete(id);
          vehiclePositionsRef.current.delete(id);
        }
      });
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
      if (map.getZoom() < minZoomfForStops) {
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

  //initialize the map and set up event listeners
  useEffect(() => {
    // Initial view set to Stavanger, i'm not imaginative :(
    const map = L.map('map').setView([58.969975, 5.733107], 13); 
    mapRef.current = map; 

    L.tileLayer('https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png', {
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/">CARTO</a>',
      subdomains: 'abcd',
      maxZoom: 19,
    }).addTo(map);

    map.setMinZoom(3);// Set minimum zoom level to 3, so the map doesn't break into loops

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


    // home button below the zoom controls
    const HomeButton = L.Control.extend({
      options: { position: 'topleft' },
      onAdd: () => {
        const div = L.DomUtil.create('div', 'leaflet-bar leaflet-control leaflet-control-custom');
        div.style.display = 'flex';
        div.style.alignItems = 'center';
        div.style.justifyContent = 'center';
        div.style.backgroundColor = 'white';
        div.style.border = '1px solid #ccc';
        div.style.borderRadius = '4px';
        div.style.padding = '5px';
        div.style.cursor = 'pointer';
        div.style.boxShadow = '0 2px 6px rgba(58, 58, 58, 0.2)';
        div.innerHTML = ReactDOMServer.renderToString(<FaHome size={20} style={{ color: 'currentColor' }}/>);
        div.onclick = () => navigate('/');
        return div;
      },
    });
    map.addControl(new HomeButton());

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
    map.on('moveend', fetchAndRenderStops);
    map.on('zoomend', fetchAndRenderStops);
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

  useEffect(() => {
    const intervalId = setInterval(() => {
      fetchAndAnimateVehicles();
    }, animationDuration);

    fetchAndAnimateVehicles();

    return () => clearInterval(intervalId);
  }, []);
  
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

          // When any part of a route is clicked, select the whole route logic
          sectionPoly.on('click', () => {
            setActiveRouteIndex(i);
            setRoutes([route]);
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
  
  return (
    <div id="map-container">
      <div id="map" style={{ height: '100vh', width: '100%' }} />

      <div className="controls" style={{ position: 'absolute', bottom: 10, left: 10, zIndex: 1000 }}>
        <button
          onClick={() => {
            setSettingMode('origin');
          }}
          style={{
            marginRight: '8px',
            backgroundColor: settingMode === 'origin' ? '#808080' : '#ffffff',
            color: settingMode === 'origin' ? '#ffffff' : '#000000',
            border: '1px solid #ccc',
            padding: '6px 12px',
            borderRadius: '4px',
            cursor: 'pointer',
          }}
        >
          {origin ? `Origin Set` : `Set Origin`}
        </button>

        <button
          onClick={() => {
            setSettingMode('destination');
          }}
          style={{
            marginRight: '8px',
            backgroundColor: settingMode === 'destination' ? '#808080' : '#ffffff',
            color: settingMode === 'destination' ? '#ffffff' : '#000000',
            border: '1px solid #ccc',
            padding: '6px 12px',
            borderRadius: '4px',
            cursor: 'pointer',
          }}
        >
          {destination ? `Destination Set` : `Set Destination`}
        </button>

        <button
          onClick={fetchAndDisplayRoutes}
          disabled={!origin || !destination}
          style={{
            marginRight: '8px',
            backgroundColor: !origin || !destination ? '#dddddd' : '#000000',
            color: !origin || !destination ? '#666666' : '#ffffff',
            border: '1px solid #ccc',
            padding: '6px 12px',
            borderRadius: '4px',
            cursor: !origin || !destination ? 'not-allowed' : 'pointer',
          }}
        >
          Get Routes
        </button>

        <button
          onClick={() => {
            setOrigin(null);
            setDestination(null);
            setRoutes([]);
            setActiveRouteIndex(null);
            if (originMarkerRef.current) originMarkerRef.current.remove();
            if (destinationMarkerRef.current) destinationMarkerRef.current.remove();
            routePolylineRefs.current.forEach((entry) => {
              entry.polyline.remove();
            });
            routePolylineRefs.current = [];
          }}
          style={{
            backgroundColor: '#000000',
            color: '#ffffff',
            border: '1px solid #ccc',
            padding: '6px 12px',
            borderRadius: '4px',
            cursor: 'pointer',
          }}
        >
          Reset
        </button>
      </div>

      <button
        className="toggle-button"
        onClick={() => setIsRoutesVisible(!isRoutesVisible)}
      >
        {isRoutesVisible ? 'Hide Routes' : 'Show Routes'}
      </button>

      <div className={`route-panel ${isRoutesVisible ? 'visible' : 'hidden'}`}>
        <div style={{ padding: '0.5rem 1rem' }}>
            <h3>&gt; Routes</h3>
        </div>
        {routes.length > 0 ? (
          <ul>
            {routes.map((route, routeIndex) => (
              <li key={routeIndex}>
                <p>Duration: {Math.round(route.duration / 60)} mins</p>
                <ul>
                  {route.sections.map((section: any, index: number) => {
                    if (section.type === 'pedestrian') {
                      const destinationName = section.arrival.place?.name || 'your destination';
                      return (
                        <li key={index}>
                          Walk to <strong>{destinationName}</strong>
                        </li>
                      );
                    }
                    if (section.type === 'transit') {
                      const mode = section.transport?.mode?.toLowerCase() || '';
                      const transitName = section.transport?.shortName || section.transport?.name || 'unknown';
                      const from = section.departure.place?.name || 'unknown stop';
                      const to = section.arrival.place?.name || 'unknown stop';
                      // couldn't deferentiate bus and train(for now), so using regex to check if the name starts with 'l' and is followed by digits.
                      //TODO: add a better way to differentiate bus and train
                      const isTrain = mode.includes('rail') || mode.includes('train') || /^l\d+$/i.test(transitName);
                      return (
                        <li key={index}>
                          Take <strong>{isTrain ? 'Train' : 'Bus'} {transitName}</strong> from <strong>{from}</strong> to <strong>{to}</strong>
                        </li>
                      );
                    }
                    return null;
                  })}
                </ul>
              </li>
            ))}
          </ul>
        ) : (
          <div style={{ padding: '0.5rem 1rem' }}><p>
              {!origin || !destination
                ? 'So far only doing clicks to set origin and destination. Click the buttons above to set them.'
                : 'Now click "Get Routes" to see available routes.'}
            </p></div>
        )}
      </div>
    </div>
  );
};

export default MapPage;
