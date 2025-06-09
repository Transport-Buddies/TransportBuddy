
import { generateWeatherCommentary } from "./components/aiWeather";
import mongoose from 'mongoose';
import { Router, Express } from 'express';
import axios from 'axios';
import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.resolve(__dirname, '.env') });
require('dotenv').config().parsed;
const router = Router();

// initial test bus
let busLocation = { shape_pt_lat: 58.969975, shape_pt_lon: 5.733107 };

const stopSchema = new mongoose.Schema({
  stop_id: String,
  stop_name: String,
  stop_lat: Number,
  stop_lon: Number,
  location_type: String,
});

// Create the Stop model
const Stop = mongoose.model('Stop', stopSchema);

// just a test route(/hello), to see if the API is working.
export const setRoutes = (app: Express) => {
    // Endpoint to get a static weather commentary
    router.get('/weather-commentary', async (req, res) => {
        res.setHeader('Access-Control-Allow-Origin', '*');
        const latitude = req.query.lat as string;
        const longitude = req.query.lon as string;
        const apiKey = process.env.OPENWEATHER_API_KEY;
        const url = `https://api.openweathermap.org/data/2.5/weather?lat=${latitude}&lon=${longitude}&appid=${apiKey}&units=metric`;
        try {
            const response = await axios.get(url);
            // parse the openweather response for the current weather
            const weatherData = response.data;
            const currentWeather = {
                temp: weatherData.main.temp,
                description: weatherData.weather[0].description,
                humidity: weatherData.main.humidity,
                windSpeed: weatherData.wind.speed,
                city: weatherData.name,
            };
            console.log('Current weather data:', currentWeather);
            const commentary = await generateWeatherCommentary(JSON.stringify(currentWeather));
            res.status(200).json({ commentary });
        } catch (error) {
            res.status(500).json({ error: 'Failed to fetch weather data' });
        }
    });

    router.get('/positions', (req, res) => {
        res.setHeader('Access-Control-Allow-Origin', '*');
        res.json({ location: busLocation });
    });

    // will be used by c# to post the bus locations
    router.post('/positions', (req, res) => {
        const { shape_pt_lat, shape_pt_lon } = req.body;
        // TODO: Make this lowercamelCase when c# endpoint is ready
        if (typeof shape_pt_lat === 'number' && typeof shape_pt_lon === 'number') {
        busLocation = { shape_pt_lat, shape_pt_lon };
        res.setHeader('Access-Control-Allow-Origin', '*');
        res.status(200).json({ message: 'bus location updated' });
        console.log(`Bus location updated to: ${JSON.stringify(busLocation)}`);
        } else {
        res.setHeader('Access-Control-Allow-Origin', '*');
        res.status(400).json({ error: 'Wrong format, pls make sure its { shape_pt_lat: latitude number, shape_pt_lon: longitude number }' });
        }
    });

    router.get('/routes', async (req, res): Promise<void> => {
    const { origin, destination } = req.query;
    // print getting origin and destination
    console.log(`Getting routes from ${origin} to ${destination}`);
    if (!origin || !destination) {
    res.status(400).json({ error: 'Origin and destination are required' });
    return;
  }

    const options = {
    method: 'GET',
    url: 'https://busmaps-gtfs-api.p.rapidapi.com/routes',
    params: {
      origin,
      destination,
      departureTime: new Date().toISOString(),
      transfers: '1',
    },
    headers: {
      'x-rapidapi-key': process.env.RAPIDAPI_KEY,
      'x-rapidapi-host': 'busmaps-gtfs-api.p.rapidapi.com',
    },
  };
  // console.log(options.headers['x-rapidapi-key']);
  try {
    if (!process.env.RAPIDAPI_KEY) {
      throw new Error('RAPIDAPI_KEY is not defined in the .env file');
    }
    const response = await axios.request(options);

    res.setHeader('Access-Control-Allow-Origin', '*');
    res.status(200).json(response.data);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Failed to fetch routes' });
  }
  });
  // Endpoint to get stops within a certain radius of a given latitude and longitude
  router.get('/stops', async (req, res) => {
    const lat = req.query.lat as string;
    const lon = req.query.lon as string;
    const radius = req.query.radius as string;
    if (!lat || !lon || !radius) {
      res.status(400).json({ error: 'long, lat and radius needed' });
      return;
    }
    const r = parseFloat(radius);
    // To stop crashing the pc with data
    if (r > 0.5) {
      res.setHeader('Access-Control-Allow-Origin', '*');
      res.status(200).json([]);
      return;
    }
    try {
      const stops = await Stop.find({
        stop_lat: { $gte: parseFloat(lat) - parseFloat(radius), $lte: parseFloat(lat) + parseFloat(radius) },
        stop_lon: { $gte: parseFloat(lon) - parseFloat(radius), $lte: parseFloat(lon) + parseFloat(radius) },
      });

      res.setHeader('Access-Control-Allow-Origin', '*');
      res.status(200).json(stops);
    } catch (error) {
      console.error('Error fetching stops:', error);
      res.status(500).json({ error: 'Failed to fetch stops' });
    }
  });
    
    app.use('/api', router);
};