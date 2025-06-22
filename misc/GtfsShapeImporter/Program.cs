

using System;
using System.Collections.Generic;
using System.Globalization;
using System.IO;
using System.Text.Json;
using System.Threading.Tasks;
using System.Threading;
using System.Threading.Tasks;
using System.Xml.Linq;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Http;
using Microsoft.Extensions.Hosting;

// Demo for xml file with vehicle positions, used to populate the leaflet map, for test purposes.
// record Vehicle(string id, double latitude, double longitude, double? bearing, string vehicleMode);

// class Program
// {
//     static async Task Main()
//     {
//         var jsonFile = "test2.json";

//         var builder = WebApplication.CreateBuilder();
//         var app = builder.Build();
//         app.Urls.Add("http://localhost:5052");

//         app.MapGet("/vehicles", async (HttpContext context) =>
//         {
//             if (File.Exists(jsonFile))
//             {
//                 context.Response.ContentType = "application/json";
//                 var jsonData = await File.ReadAllTextAsync(jsonFile);
//                 await context.Response.WriteAsync(jsonData);
//             }
//             else
//             {
//                 context.Response.StatusCode = StatusCodes.Status404NotFound;
//                 await context.Response.WriteAsync("JSON file not found.");
//             }
//         });

//         Console.WriteLine("Listening on /vehicle...");
//         await app.RunAsync();
//     }
// }

// ###################################### DEMO for single vehicle #############################
class Program
{
    static async Task Main()
    {
        var jsonFile = "shape_points.json";

        if (!File.Exists(jsonFile))
        {
            var targetShapeId = "KOL:JourneyPattern:2019_Inbound_250221104607332_250221104592116";
            var inputFile = "shapes.txt";
            var latLonPoints = new List<Dictionary<string, double>>();

            using var reader = new StreamReader(inputFile);
            var header = reader.ReadLine();

            while (!reader.EndOfStream)
            {
                var line = reader.ReadLine();
                var parts = line.Split(',');

                if (parts.Length < 5)
                    continue;

                var shapeId = parts[0];

                if (shapeId != targetShapeId)
                    continue;

                if (!double.TryParse(parts[2], NumberStyles.Float, CultureInfo.InvariantCulture, out double lat) ||
                    !double.TryParse(parts[3], NumberStyles.Float, CultureInfo.InvariantCulture, out double lon))
                    continue;

                latLonPoints.Add(new Dictionary<string, double>
                {
                    { "lat", lat },
                    { "lon", lon }
                });
            }

            var jsonOptions = new JsonSerializerOptions { WriteIndented = true };
            var json = JsonSerializer.Serialize(latLonPoints, jsonOptions);
            await File.WriteAllTextAsync(jsonFile, json);

            Console.WriteLine("done..." + jsonFile);
        }

        var jsonText = await File.ReadAllTextAsync(jsonFile);
        var points = JsonSerializer.Deserialize<List<Dictionary<string, double>>>(jsonText);

        if (points == null || points.Count == 0)
        {
            Console.WriteLine("json file is empty. Nothing to loop through here.");
            return;
        }

        var index = 0;
        var currentPoint = new Dictionary<string, double>();
        var updateTask = Task.Run(async () =>
        {
            while (true)
            {
                currentPoint = points[index];
                index = (index + 1) % points.Count;
                await Task.Delay(4000); // Update every 4 seconds
            }
        });
        var builder = WebApplication.CreateBuilder();
        var app = builder.Build();
        app.Urls.Add("http://localhost:5052");
        app.MapGet("/positions", async (HttpContext context) =>
        {
            context.Response.ContentType = "application/json";
            await context.Response.WriteAsync(JsonSerializer.Serialize(new Dictionary<string, double>
            {
                { "shape_pt_lat", currentPoint["lat"] },
                { "shape_pt_lon", currentPoint["lon"] }
            }));
        });

        Console.WriteLine(" Listening on /positions...");
        await app.RunAsync();
    }
}



// #########################################################################################################################

