
import { generateWeatherCommentary } from "./components/aiWeather";
import { Router, Express } from 'express';
import axios from 'axios';
import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.resolve(__dirname, '.env') });
require('dotenv').config().parsed;
const router = Router();

//just a place holder weather json for open ai to comment on
const staticWeatherJson = JSON.stringify({
  current: {
    temp: 295.15,
    weather: [{ description: "clear sky" }],
  },
  daily: [
    { temp: { min: 288.7, max: 298.4 }, weather: [{ description: "few clouds" }] },
  ],
});

// initial bus
let busLocation = { shape_pt_lat: 58.969975, shape_pt_lon: 5.733107 };

// just a test route(/hello), to see if the API is working.
export const setRoutes = (app: Express) => {
    router.get('/hello', (req, res) => {
        res.setHeader('Access-Control-Allow-Origin', '*');
        res.json({ message: 'Hello, World!' });
    });

    // route to get the weather commentary
    router.get('/weather-commentary', async (req, res) => {
        res.setHeader('Access-Control-Allow-Origin', '*');
        try {
            const commentary = await generateWeatherCommentary(staticWeatherJson);
            res.status(200).json({ commentary });
            console.log('Weather commentary generated successfully:', commentary);
        } catch (error) {
            console.error('Error generating weather commentary:', error);
            res.status(500).json({ error: 'Failed to generate weather commentary' });
        }
    });

    router.get('/positions', (req, res) => {
        res.setHeader('Access-Control-Allow-Origin', '*');
        res.json({ location: busLocation });
    });

    // will be used by c# to post the bus locations
    router.post('/positions', (req, res) => {
        const { shape_pt_lat, shape_pt_lon } = req.body;

        if (typeof shape_pt_lat === 'number' && typeof shape_pt_lon === 'number') {
        busLocation = { shape_pt_lat, shape_pt_lon };
        res.setHeader('Access-Control-Allow-Origin', '*');
        res.status(200).json({ message: 'bus location updated' });
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
    
    app.use('/api', router);
};