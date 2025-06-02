
import { Router, Express } from 'express';
// import axios from 'axios'; // uncomment it when we start using api's that need axios for API calls


const router = Router();

// initial bus
let busLocation = { shape_pt_lat: 58.969975, shape_pt_lon: 5.733107 };

// just a test route(/hello), to see if the API is working.
export const setRoutes = (app: Express) => {
    router.get('/hello', (req, res) => {
        res.setHeader('Access-Control-Allow-Origin', '*');
        res.json({ message: 'Hello, World!' });
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
    
    app.use('/api', router);
};