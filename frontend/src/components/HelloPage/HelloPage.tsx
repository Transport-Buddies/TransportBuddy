import React, { useState, useEffect } from 'react';
import { useMediaQuery } from 'react-responsive';
import { FaHome, FaMapMarkedAlt } from 'react-icons/fa';
import { useNavigate } from 'react-router-dom';
import Loader from '../Loader/Loader';
import './HelloPage.css';

const HelloPage: React.FC = () => {
  const [message, setMessage] = useState<string | null>(null);
  const [typedMessage, setTypedMessage] = useState<string>('');
  const navigate = useNavigate()
  const [activeButton, setActiveButton] = useState<'home' | 'maps'>('home');
  const isMobile = useMediaQuery({ maxWidth: 767 });
  useEffect(() => {
    const fetchMessage = async () => {
      try {
        const apiUrl = process.env.REACT_APP_API_URL;
        if (!apiUrl) {
          throw new Error('REACT_APP_API_URL is not defined in the .env file');
        }
        // fetch /api/weather-commentary endpoint using city as geolocation api query
        navigator.geolocation.getCurrentPosition(
          async (position) => {
            const { latitude, longitude } = position.coords;
            const weatherResponse = await fetch(`${apiUrl}/api/weather-commentary?lat=${latitude}&lon=${longitude}`);
            const weatherData = await weatherResponse.json();
            console.log('Weather API response:', weatherData);
            setMessage(weatherData.commentary);
          },
          (error) => {
            console.error('Error getting geolocation:', error);
          }
        );
      } catch (error) {
        console.error('Error fetching message:', error);
      }
    };

    fetchMessage();
  }, []);
  // Typewriter effect for the message
  useEffect(() => {
    if (!message) return;

    setTypedMessage('');
    let currentIndex = 0;
    const intervalId = setInterval(() => {
      setTypedMessage((prev) => {
        const next = message.slice(0, currentIndex + 1);
        return next;
      });
      currentIndex += 1;
      if (currentIndex === message.length) {
        clearInterval(intervalId);
      }
    }, 20);

    return () => clearInterval(intervalId);
  }, [message]);
  const handleNavigation = (page: 'home' | 'maps') => {
    setActiveButton(page);
    if (page === 'maps') {
      navigate('/maps'); 
    } else {
      navigate('/');
    }
  };
  return (
    <div className="hello-page">
      {message ? (
        <div className="typewriter">
          <h1>
            <span className="typing-text">{typedMessage}</span>
            <span className="typing-caret"></span>
          </h1>
        </div>
      ) : (
        <Loader />
      )}
      <div
        className="navigation"
        style={{ width: isMobile ? '80%' : '30%' }}
      >
        <div
          className={`navigation-icon ${
            activeButton === 'home' ? 'active' : 'inactive'
          }`}
          onClick={() => handleNavigation('home')}
        >
          <FaHome size={30} />
          <p>Home</p>
        </div>

        <div
          className={`navigation-icon ${
            activeButton === 'maps' ? 'active' : 'inactive'
          }`}
          onClick={() => handleNavigation('maps')}>
          <FaMapMarkedAlt size={30} />
          <p>Maps</p>
        </div>
      </div>
    </div>
  );
};

export default HelloPage;