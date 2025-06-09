using System;
using System.Collections.Generic;
using System.Globalization;
using System.IO;
using System.Net.Http;
using System.Text;
using System.Text.Json;
using System.Threading.Tasks;

class Program
{
    static async Task Main()
    {
        var jsonFile = "shape_points.json";
        var url = "http://localhost:5000/api/positions";

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

        using var httpClient = new HttpClient();
        var index = 0;

        while (true)
        {
            var point = points[index];
            var shapedPoint = new Dictionary<string, double>
            {
                { "shape_pt_lat", point["lat"] },
                { "shape_pt_lon", point["lon"] }
            };

            var content = new StringContent(JsonSerializer.Serialize(shapedPoint), Encoding.UTF8, "application/json");


            try
            {
                var response = await httpClient.PostAsync(url, content);
                Console.WriteLine($"Sent: {point["lat"]}, {point["lon"]} | Status: {response.StatusCode}");
            }
            catch (Exception ex)
            {
                Console.WriteLine($"Error sending point: {ex.Message}");
            }

            index = (index + 1) % points.Count;
            await Task.Delay(4000);
        }
    }
}
