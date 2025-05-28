import React, { useState, useEffect } from 'react';
import { useMediaQuery } from 'react-responsive';
import { FaHome, FaMapMarkedAlt } from 'react-icons/fa';
import { useNavigate } from 'react-router-dom';
import './HelloPage.css';

const HelloPage: React.FC = () => {
  const [message, setMessage] = useState<string | null>(null);
  const isMobile = useMediaQuery({ maxWidth: 767 });
  useEffect(() => {
    const fetchMessage = async () => {
      try {
        const apiUrl = process.env.REACT_APP_API_URL;
        if (!apiUrl) {
          throw new Error('REACT_APP_API_URL is not defined in the .env file');
        }
        const response = await fetch(`${apiUrl}/api/hello`);
        console.log('Response status:', response.status);
        const data = await response.json();
        console.log('API response:', data);
        setMessage(data.message);
      } catch (error) {
        console.error('Error fetching message:', error);
      }
    };

    fetchMessage();
  }, []);
  const [activeButton, setActiveButton] = useState<'home' | 'maps'>('home');
  const navigate = useNavigate(); // React Router hook for navigation

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
      <h1 className="message">{message || 'Loading...'}</h1>
      
      <div 
      className="navigation" style={{ width: isMobile ? '80%' : '30%' }}>
        <div className={`navigation-icon ${activeButton === 'home' ? 'active' : 'inactive'}`}
          onClick={() => handleNavigation('home')}>
          <FaHome size={30} />
          <p>Home</p>
        </div>

        <div className={`navigation-icon ${activeButton === 'maps' ? 'active' : 'inactive'}`}
          onClick={() => handleNavigation('maps')}>
          <FaMapMarkedAlt size={30} />
          <p>Maps</p>
        </div>
      </div>
    </div>
  );
};

export default HelloPage;