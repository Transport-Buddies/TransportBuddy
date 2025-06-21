using System;
using System.Net.Http;
using System.Net.Http.Headers;
using System.Text.Json;
using System.Threading.Tasks;
using System.Xml.Linq;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Http;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Logging;
using StackExchange.Redis;

var builder = WebApplication.CreateBuilder(args);

builder.Logging.ClearProviders();
builder.Logging.AddConsole();

// configure and connect redis
var redisOptions = ConfigurationOptions.Parse("localhost:6379");
redisOptions.ConnectTimeout = 10_000;
redisOptions.AsyncTimeout = 10_000;
redisOptions.SyncTimeout = 10_000;
redisOptions.AbortOnConnectFail = false;

var multiplexer = await ConnectionMultiplexer.ConnectAsync(redisOptions);
builder.Services.AddSingleton<IConnectionMultiplexer>(multiplexer);

var db = multiplexer.GetDatabase();
await db.KeyDeleteAsync("vehicles"); // nuke old JSON-string

var app    = builder.Build();
var logger = app.Logger;

// startup hook to subscribe to Entur SIRI VM feed
const string publicUrl = "https://199f-85-167-175-214.ngrok-free.app";

app.Lifetime.ApplicationStarted.Register(async () =>
{
    try
    {
        var callbackUrl = $"{publicUrl}/siri/vm";
        logger.LogInformation("Entur callback url: {url}", callbackUrl);
        await SendSubscriptionRequestAsync(callbackUrl, logger);
    }
    catch (Exception ex)
    {
        logger.LogError(ex, "Failed during startup.");
    }
});

// Endpoint to receive SIRI VM XML and update redis hash
app.MapPost("/siri/vm", async (HttpRequest request) =>
{
    try
    {
        var doc = await XDocument.LoadAsync(request.Body, LoadOptions.None, default);
        XNamespace ns = "http://www.siri.org.uk/siri";

        var dbLocal = multiplexer.GetDatabase();
        foreach (var activity in doc.Descendants(ns + "VehicleActivity"))
        {
            var mvj = activity.Element(ns + "MonitoredVehicleJourney");
            if (mvj == null) continue;

            var refId = mvj.Element(ns + "VehicleRef")?.Value;
            var bearing = mvj.Element(ns + "Bearing")?.Value;
            var line = mvj.Element(ns + "PublishedLineName")?.Value;
            var loc = mvj.Element(ns + "VehicleLocation");
            var lon = loc?.Element(ns + "Longitude")?.Value;
            var lat = loc?.Element(ns + "Latitude")?.Value;
            var mode = mvj.Element(ns + "VehicleMode")?.Value ?? "bus";

            // skip if refId, lat or lon is missing
            if (string.IsNullOrWhiteSpace(refId) || lat == null || lon == null)
                continue;

            var payload = new
            {
                latitude = double.Parse(lat),
                longitude = double.Parse(lon),
                bearing = double.Parse(bearing ?? "0"),
                publishedLineName = line,
                vehicleMode = mode
            };
            // store vehicle data in redis hash
            await dbLocal.HashSetAsync(
                key: "vehicles",
                hashField: refId,
                value: JsonSerializer.Serialize(payload)
            );
        }

        var count = await dbLocal.HashLengthAsync("vehicles");
        logger.LogInformation("Updated vehicle positions. Count: {count}", count);
        return Results.Ok();
    }
    catch (Exception ex)
    {
        logger.LogError(ex, "Failed to parse and update vehicles in Redis.");
        return Results.Problem("Invalid SIRI VM XML.");
    }
});

// debug endpoint to view all vehicles in redis
app.MapGet("/vehicles", async () =>
{
    var db = multiplexer.GetDatabase();
    var all = await db.HashGetAllAsync("vehicles");
    var dict = all.ToDictionary(
        entry  => (string)entry.Name,
        entry  => JsonSerializer.Deserialize<object>(entry.Value)
    );
    return Results.Json(dict);
});

app.Run("http://localhost:5052");

static async Task SendSubscriptionRequestAsync(string callbackUrl, ILogger logger)
{
    const string requestorRef = "TestingXmlDATALayout123";
    var subscriptionId = $"sub-{Guid.NewGuid()}";
    var now = DateTime.UtcNow;
    var requestXml = $@"
    <Siri xmlns=""http://www.siri.org.uk/siri"" version=""2.0"">
    <SubscriptionRequest>
        <RequestTimestamp>{now:O}</RequestTimestamp>
        <RequestorRef>TestingXmlDATALayout123</RequestorRef>
        <MessageIdentifier>{Guid.NewGuid()}</MessageIdentifier>

        <ConsumerAddress>{callbackUrl}</ConsumerAddress>

        <SubscriptionContext>
        <HeartbeatInterval>PT1M</HeartbeatInterval>
        </SubscriptionContext>

        <VehicleMonitoringSubscriptionRequest>
        <SubscriberRef>TestingXmlDATALayout123</SubscriberRef>
        <SubscriptionIdentifier>sub-{Guid.NewGuid()}</SubscriptionIdentifier>
        <InitialTerminationTime>{now.AddHours(1):O}</InitialTerminationTime>

        <VehicleMonitoringRequest version=""2.0"">
            <RequestTimestamp>{now:O}</RequestTimestamp>
        </VehicleMonitoringRequest>
        </VehicleMonitoringSubscriptionRequest>
    </SubscriptionRequest>
    </Siri>";

    try
    {
        using var httpClient = new HttpClient();
        var content = new StringContent(requestXml);
        content.Headers.ContentType = new System.Net.Http.Headers.MediaTypeHeaderValue("application/xml");

        var response = await httpClient.PostAsync("https://api.entur.io/realtime/v1/subscribe", content);

        var responseBody = await response.Content.ReadAsStringAsync();

        logger.LogDebug("Entur subscription response:\n{xml}", responseBody);


        if (response.IsSuccessStatusCode)
        {
            logger.LogInformation("successfully subscribed to Entur SIRI VM feed!");
        }
        else
        {
            logger.LogWarning("subscription failed. status: {Status}, body:\n{Body}", response.StatusCode, responseBody);
        }
    }
    catch (Exception ex)
    {
        logger.LogError(ex, "Error sending subscription request.");
    }
}
