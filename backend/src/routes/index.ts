
import { Router, Express } from 'express';
// import axios from 'axios'; // uncomment it when we start using api's that need axios for API calls


const router = Router();

// just a test route(/hello), to see if the API is working.
export const setRoutes = (app: Express) => {
    router.get('/hello', (req, res) => {
        res.setHeader('Access-Control-Allow-Origin', '*');
        res.json({ message: 'Hello, World!' });
    });

    app.use('/api', router);
};