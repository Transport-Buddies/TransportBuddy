import React, { useEffect, useRef } from 'react';
import L from 'leaflet';
import { useNavigate } from 'react-router-dom';
import { FaHome, FaMapMarkerAlt } from 'react-icons/fa';
import ReactDOMServer from 'react-dom/server';
import 'leaflet/dist/leaflet.css';
import './MapPage.css';

const MapPage: React.FC = () => {
  const navigate = useNavigate();
  const mapRef = useRef<L.Map | null>(null); 

  useEffect(() => {
    const map = L.map('map').setView([58.969975, 5.733107], 13);
    mapRef.current = map; 

    L.tileLayer('https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png', {
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/">CARTO</a>',
      subdomains: 'abcd',
      maxZoom: 19,
    }).addTo(map);

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