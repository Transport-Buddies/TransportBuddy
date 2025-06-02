import React, { useEffect, useRef } from 'react';
import L from 'leaflet';
import { useNavigate } from 'react-router-dom';
import { FaBus, FaHome, FaMapMarkerAlt } from 'react-icons/fa';
import ReactDOMServer from 'react-dom/server';
import 'leaflet/dist/leaflet.css';
import './MapPage.css';

const MapPage: React.FC = () => {
  const navigate = useNavigate();
  const mapRef = useRef<L.Map | null>(null); 
  const busMarkerRef = useRef<L.Marker | null>(null); 
  const locationQueue = useRef<{ lat: number; lon: number }[]>([]); 
  const isMoving = useRef(false);

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

    const homeButton = new HomeButton();
    map.addControl(homeButton);

    const busIcon = L.divIcon({
      className: 'custom-marker-icon',
      html: ReactDOMServer.renderToString(<FaBus size={30} color="blue" />),
      iconSize: [30, 30],
      iconAnchor: [15, 30],
    });

    const busMarker = L.marker([58.969975, 5.733107], { icon: busIcon }).addTo(map);
    busMarkerRef.current = busMarker;

     const fetchBusLocation = async () => {
      try {
        const response = await fetch(`${process.env.REACT_APP_API_URL}/api/positions`);
        const data = await response.json();
        const { shape_pt_lat, shape_pt_lon } = data.location;

        // used queue to smooth the bus movement
        locationQueue.current.push({ lat: shape_pt_lat, lon: shape_pt_lon });

        if (!isMoving.current) {
          processQueue();
        }
      } catch (error) {
        console.error('Error fetching bus location:', error);
      }
    };
    const processQueue = () => {
      if (locationQueue.current.length === 0) {
        isMoving.current = false;
        return;
      }

      isMoving.current = true;
      const nextLocation = locationQueue.current.shift();

      if (nextLocation && busMarkerRef.current) {
        smoothMoveMarker(
          busMarkerRef.current.getLatLng().lat,
          busMarkerRef.current.getLatLng().lng,
          nextLocation.lat,
          nextLocation.lon,
          () => {
            // encountered a bug where the bus marker wouldn't move, here hoping this ductape holds the logic together
            setTimeout(() => {
              processQueue();
            }, 50);
          }
        );
      }
    };
    // smoothly moves the bus marker from its current position to the new position
    const smoothMoveMarker = (
      startLat: number,
      startLon: number,
      endLat: number,
      endLon: number,
      onComplete: () => void
    ) => {
      const duration = 5000; // 5 seconds for the animation to make it look "in realtime"
      const steps = 50;
      const interval = duration / steps;
      let step = 0;

      const latStep = (endLat - startLat) / steps;
      const lonStep = (endLon - startLon) / steps;

      const animate = () => {
        if (step < steps) {
          const newLat = startLat + latStep * step;
          const newLon = startLon + lonStep * step;

          if (busMarkerRef.current) {
            busMarkerRef.current.setLatLng([newLat, newLon]);
          }

          step++;
          setTimeout(animate, interval);
        } else {
          onComplete();
        }
      };

      animate();
    };
    const intervalId = setInterval(fetchBusLocation, 5000);

    // tracks if the map component is still mounted. stops memory leaks and runtime errors
    let isMounted = true; 

    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (position) => {
          if (!isMounted) return; 

          const { latitude, longitude } = position.coords;

          if (map && map.setView) {
            map.setView([latitude, longitude], 13);

            const customIcon = L.divIcon({
              className: 'custom-marker-icon', 
              html: ReactDOMServer.renderToString(<FaMapMarkerAlt size={30} color="black" />),
              iconSize: [30, 30], 
              iconAnchor: [15, 30], 
            });

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

    return () => {
      clearInterval(intervalId);
      isMounted = false; 
      if (mapRef.current) {
        mapRef.current.remove(); 
        mapRef.current = null; 
      }
    };
  }, [navigate]);

  return <div id="map" style={{ height: '100vh', width: '100%' }}></div>;
};

export default MapPage;