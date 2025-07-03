import mongoose from 'mongoose';
import path from 'path';
import fs from 'fs';
import dotenv from 'dotenv';

// Load environment variables
dotenv.config({ path: path.resolve(__dirname, '.env') });

// Schema for GTFS stop times
const stopTimeSchema = new mongoose.Schema({
  trip_id: String,
  stop_id: String,
  arrival_time: String,
  departure_time: String,
  stop_sequence: String
});

const StopTime = mongoose.model('StopTime', stopTimeSchema);

// Batch CSV parser for large files
function parseCSVInBatches(filePath: string, batchSize: number = 5000): Promise<void> {
  return new Promise((resolve, reject) => {
    let headers: string[] = [];
    let batch: any[] = [];
    let isFirstRow = true;
    let totalProcessed = 0;

    const stream = fs.createReadStream(filePath)
      .pipe(require('csv-parser')())
      .on('headers', (headerList: string[]) => {
        headers = headerList;
        console.log('CSV headers:', headers);
      })
      .on('data', async (data: any) => {
        if (isFirstRow) {
          isFirstRow = false;
          return;
        }

        batch.push(data);

        if (batch.length >= batchSize) {
          // Pause the stream while we process this batch
          stream.pause();
          
          try {
            await StopTime.insertMany(batch, { ordered: false });
            totalProcessed += batch.length;
            console.log(`Processed ${totalProcessed} stop times...`);
            batch = [];
            
            // Resume the stream
            stream.resume();
          } catch (error) {
            console.error('Error inserting batch:', error);
            // Continue with next batch even if some fail
            batch = [];
            stream.resume();
          }
        }
      })
      .on('end', async () => {
        // Process remaining items in the last batch
        if (batch.length > 0) {
          try {
            await StopTime.insertMany(batch, { ordered: false });
            totalProcessed += batch.length;
          } catch (error) {
            console.error('Error inserting final batch:', error);
          }
        }
        console.log(`Finished processing ${totalProcessed} total stop times`);
        resolve();
      })
      .on('error', reject);
  });
}

async function loadStopTimes() {
  try {
    // Connect to MongoDB
    const mongoUri = process.env.MONGODB_URI || 'mongodb://localhost:27017/transport_buddy';
    await mongoose.connect(mongoUri);
    console.log('Connected to MongoDB');

    // Check if stop times already exist
    const existingCount = await StopTime.countDocuments();
    if (existingCount > 0) {
      console.log(`Stop times already loaded: ${existingCount} records found`);
      console.log('Delete existing records first if you want to reload');
      return;
    }

    // Load stop times from CSV
    const stopTimesPath = path.join(__dirname, '../transit_data/stop_times.txt');
    
    if (!fs.existsSync(stopTimesPath)) {
      console.error(`Stop times file not found: ${stopTimesPath}`);
      return;
    }

    console.log('Starting to load stop times in batches...');
    console.log('This may take several minutes for large files...');
    
    const startTime = Date.now();
    await parseCSVInBatches(stopTimesPath, 2000); // Smaller batch size to be safe
    const endTime = Date.now();
    
    const finalCount = await StopTime.countDocuments();
    console.log(`\nLoad complete!`);
    console.log(`Total records loaded: ${finalCount}`);
    console.log(`Time taken: ${(endTime - startTime) / 1000} seconds`);

  } catch (error) {
    console.error('Error loading stop times:', error);
  } finally {
    await mongoose.disconnect();
    console.log('Disconnected from MongoDB');
    process.exit(0);
  }
}

loadStopTimes();
