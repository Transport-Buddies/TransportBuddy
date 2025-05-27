// This file is responsible for setting up the express server and connecting to mongodb.

import express from 'express';
import cors from 'cors';
import bodyParser from 'body-parser';
import { setRoutes } from './routes/index';
import mongoose from 'mongoose';

const app = express();
const PORT = process.env.PORT || 5000; //todo: use environment variable for port in production
const mongoUri = process.env.MONGO_URI || 'mongodb://localhost:27017/transport_buddy'; //todo: no static URI in production, use environment variable

mongoose.connect(mongoUri)
  .then(() => console.log('Connected to MongoDB'))
  .catch((err: Error) => console.error('MongoDB connection error:', err));

app.use(cors({
  origin: '*', // TODO: should be restricted in production
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
}));

app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));

setRoutes(app);

app.listen(PORT, () => {
  console.log(`Server is running on http://localhost:${PORT}`);
});