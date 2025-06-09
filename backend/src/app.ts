// This file is responsible for setting up the express server and connecting to mongodb.

import express, { Express } from 'express';
import cors from 'cors';
import bodyParser from 'body-parser';
import { setRoutes } from './routes/index';
import mongoose from 'mongoose';
import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.resolve(__dirname, '.env') });
require('dotenv').config().parsed;
const app: Express = express();
const PORT = process.env.PORT;
const mongoUri = process.env.MONGO_URI;

mongoose.connect(mongoUri as string)
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