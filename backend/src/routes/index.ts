import { generateWeatherCommentary } from "./components/aiWeather";
import mongoose from 'mongoose';
import { Router, Express } from 'express';
import axios from 'axios';
import dotenv from 'dotenv';
import path from 'path';
import fs from 'fs';

dotenv.config({ path: path.resolve(__dirname, '.env') });
require('dotenv').config().parsed;
const router = Router();

// MongoDB Schemas
const stopSchema = new mongoose.Schema({
  stop_id: String,
  stop_name: String,
  stop_lat: Number,
  stop_lon: Number,
  location_type: String,
});

const routeResolutionSchema = new mongoose.Schema({
  originRef: String,
  destinationRef: String,
  directionRef: String,
  resolvedRouteId: String,
  resolvedRouteName: String,
  confidence: Number,
  lastUsed: { type: Date, default: Date.now },
  createdAt: { type: Date, default: Date.now, expires: '24h' }
});

const vehicleDataSchema = new mongoose.Schema({
  vehicleRef: String,
  enhancedData: mongoose.Schema.Types.Mixed,
  lastUpdated: { type: Date, default: Date.now },
  createdAt: { type: Date, default: Date.now, expires: '1h' }
});

// Schema for GTFS stop times
const stopTimeSchema = new mongoose.Schema({
  trip_id: String,
  stop_id: String,
  arrival_time: String,
  departure_time: String,
  stop_sequence: String
});

// Models
const Stop = mongoose.model('Stop', stopSchema);
const RouteResolution = mongoose.model('RouteResolution', routeResolutionSchema);
const VehicleData = mongoose.model('VehicleData', vehicleDataSchema);
const StopTime = mongoose.model('StopTime', stopTimeSchema);

// initial test bus
// let busLocation = { shape_pt_lat: 58.969975, shape_pt_lon: 5.733107 };

// GTFS Data interfaces
interface GTFSRoute {
  route_id: string;
  route_short_name: string;
  route_long_name: string;
  route_type: string;
}

interface GTFSStopTime {
  trip_id: string;
  stop_id: string;
  arrival_time: string;
  departure_time: string;
  stop_sequence: string;
}

interface GTFSTrip {
  route_id: string;
  service_id: string;
  trip_id: string;
  direction_id: string;
}

// In-memory GTFS data cache
let gtfsRoutes: GTFSRoute[] = [];
let gtfsTrips: GTFSTrip[] = [];
let gtfsDataLoaded = false;
let isLoading = false;

// Simple CSV parser function with proper typing
function parseCSV(filePath: string, limit?: number): Promise<any[]> {
  return new Promise((resolve, reject) => {
    const results: any[] = [];
    let lineCount = 0;
    
    fs.createReadStream(filePath)
      .pipe(require('csv-parser')())
      .on('data', (data: any) => {
        if (!limit || lineCount < limit) {
          results.push(data);
          lineCount++;
        }
      })
      .on('end', () => resolve(results))
      .on('error', reject);
  });
}

// Load GTFS data on startup
async function loadGTFSData() {
  if (gtfsDataLoaded || isLoading) return;
  
  isLoading = true;
  
  try {
    console.log('Loading GTFS data...');
    
    // Load routes.txt
    const routesPath = path.join(__dirname, '../../transit_data/routes.txt');
    if (fs.existsSync(routesPath)) {
      gtfsRoutes = await parseCSV(routesPath);
      console.log(`Loaded ${gtfsRoutes.length} routes`);
    }
    
    // Load trips.txt
    const tripsPath = path.join(__dirname, '../../transit_data/trips.txt');
    if (fs.existsSync(tripsPath)) {
      gtfsTrips = await parseCSV(tripsPath);
      console.log(`Loaded ${gtfsTrips.length} trips`);
    }
    
    // Load stop_times.txt into MongoDB
    // NOTE: Stop times are loaded separately using load-stop-times.ts script
    // to avoid memory issues during app startup
    const existingStopTimesCount = await StopTime.countDocuments();
    if (existingStopTimesCount === 0) {
      console.log('No stop times found in MongoDB. Run: npm run load-stop-times');
    } else {
      console.log(`Found ${existingStopTimesCount} stop times in MongoDB`);
    }
    
    gtfsDataLoaded = true;
    console.log('GTFS data loaded successfully');
  } catch (error) {
    console.error('Error loading GTFS data:', error);
  } finally {
    isLoading = false;
  }
}

// Route resolution function
async function resolveRoute(originRef: string, destinationRef: string, directionRef?: string): Promise<{routeId: string, routeName: string, confidence: number} | null> {
  if (!gtfsDataLoaded) {
    return null; // Don't try to load here, only load on startup
  }
  
  // Check cache first
  const cacheKey = { originRef, destinationRef, directionRef };
  const cached = await RouteResolution.findOne(cacheKey);
  if (cached && cached.resolvedRouteId && cached.resolvedRouteName && cached.confidence !== null && cached.confidence !== undefined) {
    // Update last used timestamp
    cached.lastUsed = new Date();
    await cached.save();
    return {
      routeId: cached.resolvedRouteId,
      routeName: cached.resolvedRouteName,
      confidence: cached.confidence
    };
  }
  
  try {
    // Find trips that have both origin and destination stops using single MongoDB query
    const stopTimes = await StopTime.find({ 
      stop_id: { $in: [originRef, destinationRef] } 
    });
    
    // Separate by origin and destination
    const tripsWithOrigin = stopTimes.filter(st => st.stop_id === originRef);
    const tripsWithDestination = stopTimes.filter(st => st.stop_id === destinationRef);
    
    // Find common trip_ids
    const originTripIds = new Set(tripsWithOrigin.map(st => st.trip_id));
    const commonTrips = tripsWithDestination.filter(st => originTripIds.has(st.trip_id));
    
    if (commonTrips.length === 0) {
      return null;
    }
    
    // Get route info for common trips
    const tripIds = new Set(commonTrips.map(st => st.trip_id));
    const matchingTrips = gtfsTrips.filter(trip => tripIds.has(trip.trip_id));
    
    if (matchingTrips.length === 0) {
      return null;
    }
    
    // Find the most common route_id
    const routeCounts = matchingTrips.reduce((acc, trip) => {
      acc[trip.route_id] = (acc[trip.route_id] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);
    
    const mostCommonRouteId = Object.keys(routeCounts).reduce((a, b) => 
      routeCounts[a] > routeCounts[b] ? a : b
    );
    
    // Get route name from routes.txt
    const route = gtfsRoutes.find(r => r.route_id === mostCommonRouteId);
    const routeName = route?.route_short_name || route?.route_long_name || mostCommonRouteId;
    
    // Calculate confidence based on frequency
    const confidence = Math.min(routeCounts[mostCommonRouteId] / 10, 1.0);
    
    // Cache the result
    const resolution = new RouteResolution({
      originRef,
      destinationRef,
      directionRef,
      resolvedRouteId: mostCommonRouteId,
      resolvedRouteName: routeName,
      confidence
    });
    await resolution.save();
    
    return {
      routeId: mostCommonRouteId,
      routeName,
      confidence
    };
    
  } catch (error) {
    console.error('Error resolving route:', error);
    return null;
  }
}

// Enhanced vehicle data processing - only process vehicles that need route resolution
async function enhanceVehicleData(vehicles: any, visibleBounds?: {north: number, south: number, east: number, west: number}): Promise<any> {
  const enhanced = { ...vehicles };
  
  for (const [vehicleId, vehicleData] of Object.entries(vehicles)) {
    const data = vehicleData as any;
    
    // Skip if publishedLineName is already present
    if (data.publishedLineName && data.publishedLineName.trim() !== '') {
      continue;
    }
    
    // If visible bounds provided, only process vehicles within those bounds
    if (visibleBounds) {
      const lat = data.latitude;
      const lon = data.longitude;
      
      if (lat < visibleBounds.south || lat > visibleBounds.north || 
          lon < visibleBounds.west || lon > visibleBounds.east) {
        continue; // Skip vehicles outside visible area
      }
    }
    
    // Try to resolve route if we have origin and destination
    if (data.originRef && data.destinationRef) {
      const resolution = await resolveRoute(
        data.originRef, 
        data.destinationRef, 
        data.directionRef
      );
      
      if (resolution && resolution.confidence > 0.3) {
        // Update the vehicle data with resolved route name
        (enhanced as any)[vehicleId] = {
          ...data,
          publishedLineName: resolution.routeName,
          resolvedRoute: true,
          confidence: resolution.confidence
        };
        
        // Cache the enhanced data
        await VehicleData.findOneAndUpdate(
          { vehicleRef: vehicleId },
          { 
            vehicleRef: vehicleId,
            enhancedData: (enhanced as any)[vehicleId],
            lastUpdated: new Date()
          },
          { upsert: true }
        );
      }
    }
  }
  
  return enhanced;
}

// Cleanup function for server shutdown
async function cleanupVehicleData() {
  try {
    console.log('Cleaning up vehicle data cache...');
    await VehicleData.deleteMany({});
    await RouteResolution.deleteMany({});
    console.log('Vehicle data cache cleaned up successfully');
  } catch (error) {
    console.error('Error cleaning up vehicle data:', error);
  }
}

export const setRoutes = (app: Express) => {
    // Load GTFS data on startup
    loadGTFSData();
    
    // Setup cleanup on server shutdown
    process.on('SIGINT', async () => {
        await cleanupVehicleData();
        process.exit(0);
    });
    
    process.on('SIGTERM', async () => {
        await cleanupVehicleData();
        process.exit(0);
    });

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
            console.error('Error fetching weather data:', error);
            res.status(500).json({ error: 'Failed to fetch weather data' });
        }
    });

    // Enhanced vehicles endpoint with route resolution(not efficient.)
    // router.get('/vehicles', async (req, res) => {
    //     try {
    //         res.setHeader('Access-Control-Allow-Origin', '*');
    //         const microserviceUrl = 'https://transport-buddy-microservice.norwayeast.cloudapp.azure.com/vehicles';
    //         // const microserviceUrl = 'http://localhost:5052/vehicles';

    //         const response = await axios.get(microserviceUrl);

    //         if (response.status === 200) {
    //             const vehicles = response.data;
                
    //             // Extract visible bounds from query parameters for lazy loading
    //             let visibleBounds = undefined;
    //             const { north, south, east, west } = req.query;
                
    //             if (north && south && east && west) {
    //                 visibleBounds = {
    //                     north: parseFloat(north as string),
    //                     south: parseFloat(south as string),
    //                     east: parseFloat(east as string),
    //                     west: parseFloat(west as string)
    //                 };
    //                 console.log('Lazy loading: Processing vehicles within bounds:', visibleBounds);
    //             }
                
    //             // Enhance vehicle data with route resolution (lazy loading if bounds provided)
    //             const enhancedVehicles = await enhanceVehicleData(vehicles, visibleBounds);
                
    //             res.status(200).json(enhancedVehicles);
    //         } else {
    //             res.status(response.status).json({ error: 'Failed to fetch vehicle data from microservice' });
    //         }
    //     } catch (error) {
    //         console.error('Error fetching vehicle data:', error);
    //         res.status(500).json({ error: 'Failed to fetch vehicle data' });
    //     }
    // });

    router.get('/vehicles', async (req, res) => {
    try {
        res.setHeader('Access-Control-Allow-Origin', '*');
        const microserviceUrl = 'https://transport-buddy-microservice.norwayeast.cloudapp.azure.com/vehicles';
        // const microserviceUrl = 'http://localhost:5052/vehicles';

        const response = await axios.get(microserviceUrl);

        if (response.status === 200) {
            const vehicles = response.data;
            // const enhancedVehicles = await enhanceVehicleData(vehicles);
                
            // res.status(200).json(enhancedVehicles);
            res.status(200).json(vehicles);
        } else {
            res.status(response.status).json({ error: 'Failed to fetch vehicle data from microservice' });
        }
    } catch (error) {
        console.error('Error fetching vehicle data:', error);
        res.status(500).json({ error: 'Failed to fetch vehicle data' });
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
