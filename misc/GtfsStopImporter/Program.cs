// to download and import GTFS stops into MongoDB
using System;
using System.IO;
using System.IO.Compression;
using System.Net.Http;
using System.Threading.Tasks;
using CsvHelper;
using CsvHelper.Configuration;
using MongoDB.Bson;
using MongoDB.Driver;
using System.Globalization;
using System.Linq;
using System.Collections.Generic;

public class Stop
{
    public string stopId { get; set; }
    public string stopName { get; set; }
    public double stopLat { get; set; }
    public double stopLon { get; set; }
    public string locationType { get; set; }
}

class Program
{
    static async Task Main(string[] args)
    {
        string url = "https://storage.googleapis.com/marduk-production/outbound/gtfs/rb_norway-aggregated-gtfs.zip";
        string downloadPath = "gtfs.zip";
        string extractPath = "gtfs_extracted";

        using (var client = new HttpClient())
        {
            Console.WriteLine("Downloading GTFS zip..."); // wanted to take out the debug lines but it is useful to see the progress
            var data = await client.GetByteArrayAsync(url);
            await File.WriteAllBytesAsync(downloadPath, data);
        }

        Console.WriteLine("Extracting zip...");
        ZipFile.ExtractToDirectory(downloadPath, extractPath, true);

        string stopsFile = Path.Combine(extractPath, "stops.txt");
        Console.WriteLine("Reading stops.txt...");

        var config = new CsvConfiguration(CultureInfo.InvariantCulture)
        {
            HeaderValidated = null,
            MissingFieldFound = null
        };

        using var reader = new StreamReader(stopsFile);
        using var csv = new CsvReader(reader, config);
        // thanfully the gtfs is structured to show types of stops between train and bus
        var records = csv.GetRecords<Stop>().Where(s => s.locationType == "0" || s.locationType == "1").ToList(); //0 = Stop, 1 = Station

        Console.WriteLine($"Found {records.Count} stops/stations.");

        foreach (var stop in records)
        {
            Console.WriteLine($"Name: {stop.stopName}, Lat: {stop.stopLat}, Lon: {stop.stopLon}, Type: {stop.locationType == "0" ? "stop" : "station"}");
        }

        // dont make the same mistake as me and forget to run the MongoDB when running the code
        Console.WriteLine("Inserting into MongoDB...");
        var mongoClient = new MongoClient("mongodb://localhost:27017");
        var database = mongoClient.GetDatabase("StopsandStations");
        var collection = database.GetCollection<BsonDocument>("stops");

        var documents = records.Select(r => new BsonDocument
        {
            {"stopId", r.stopId},
            {"stopName", r.stopName},
            {"stopLat", r.stopLat},
            {"stopLon", r.stopLon},
            {"locationType", r.locationType}
        });

        await collection.InsertManyAsync(documents);
        Console.WriteLine("Done.");
    }
}
