using System;
using System.Net.Http;
using System.Net.Http.Headers;
using System.Text.Json;
using System.Threading;
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
const string publicUrl = "https://transport-buddy-microservice.norwayeast.cloudapp.azure.com";

// Create an instance of our state class for tracking feed status
var feedState = new FeedState();
app.Lifetime.ApplicationStarted.Register(async () =>
{
    try
    {
        var callbackUrl = $"{publicUrl}/siri/vm";
        logger.LogInformation("Entur callback url: {url}", callbackUrl);
        await SendSubscriptionRequestAsync(callbackUrl, logger);
        
        // Enhanced feed monitoring with multiple strategies
        _ = Task.Run(async () =>
        {
            int reconnectAttempt = 0;
            
            // Strategy 1: Check frequently for short outages
            _ = Task.Run(async () =>
            {
                while (true)
                {
                    await Task.Delay(TimeSpan.FromSeconds(30)); // Check every 30 seconds
                    
                    var timeSinceLastMessage = DateTime.UtcNow - feedState.LastMessageTime;
                    
                    // If no messages for 1 minute, try quick reconnect
                    if (timeSinceLastMessage.TotalMinutes > 1)
                    {
                        logger.LogWarning("Quick check: No messages for {seconds}s. Attempting reconnection.", 
                            Math.Round(timeSinceLastMessage.TotalSeconds));
                        await SendSubscriptionRequestAsync(callbackUrl, logger);
                        
                        // Update timestamp after resubscription attempt to avoid immediate retry
                        feedState.LastSubscriptionAttempt = DateTime.UtcNow;
                    }
                }
            });
            
            // Strategy 2: Periodic full reconnect
            while (true)
            {
                await Task.Delay(TimeSpan.FromMinutes(3)); // Check every 3 minutes
                
                var timeSinceLastMessage = DateTime.UtcNow - feedState.LastMessageTime;
                var timeSinceLastSubscription = DateTime.UtcNow - feedState.LastSubscriptionAttempt;
                
                // Don't try to reconnect if we've just attempted a subscription in the last minute
                if (timeSinceLastSubscription.TotalMinutes < 1)
                {
                    continue;
                }
                
                // If no messages for 3+ minutes, do forced reconnect
                if (timeSinceLastMessage.TotalMinutes > 3)
                {
                    reconnectAttempt++;
                    logger.LogWarning("No messages received for {minutes} minutes. Forced resubscription attempt #{attempt}...", 
                        Math.Round(timeSinceLastMessage.TotalMinutes, 1), reconnectAttempt);
                    
                    await SendSubscriptionRequestAsync(callbackUrl, logger);
                    feedState.LastSubscriptionAttempt = DateTime.UtcNow;
                }
                else if (reconnectAttempt > 0 && timeSinceLastMessage.TotalSeconds < 60)
                {
                    // If we're receiving data again after a reconnection, log it
                    logger.LogInformation("Feed is active again - receiving data (reconnect attempts: {attempts})", 
                        reconnectAttempt);
                    reconnectAttempt = 0;
                }
                
                // Strategy 3: Periodic health log
                if (reconnectAttempt == 0)
                {
                    logger.LogInformation("Feed health check: Last message {seconds}s ago, {vehicles} vehicles tracked", 
                        Math.Round(timeSinceLastMessage.TotalSeconds), db.HashLength("vehicles"));
                }
            }
        });
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

            // Extract additional fields for route resolution
            var originRef = mvj.Element(ns + "OriginRef")?.Value;
            var originName = mvj.Element(ns + "OriginName")?.Value;
            var destinationRef = mvj.Element(ns + "DestinationRef")?.Value;
            var destinationName = mvj.Element(ns + "DestinationName")?.Value;
            var directionRef = mvj.Element(ns + "DirectionRef")?.Value;
            var destinationAimedArrivalTime = mvj.Element(ns + "DestinationAimedArrivalTime")?.Value;
            var lineRef = mvj.Element(ns + "LineRef")?.Value;
            
            // Extract DatedVehicleJourneyRef from FramedVehicleJourneyRef
            var framedVehicleJourneyRef = mvj.Element(ns + "FramedVehicleJourneyRef");
            var datedVehicleJourneyRef = framedVehicleJourneyRef?.Element(ns + "DatedVehicleJourneyRef")?.Value;
            var dataFrameRef = framedVehicleJourneyRef?.Element(ns + "DataFrameRef")?.Value;

            // skip if refId, lat or lon is missing
            if (string.IsNullOrWhiteSpace(refId) || lat == null || lon == null)
                continue;

            var payload = new
            {
                latitude = double.Parse(lat),
                longitude = double.Parse(lon),
                bearing = double.Parse(bearing ?? "0"),
                publishedLineName = line,
                vehicleMode = mode,
                // Additional fields for route resolution
                originRef = originRef,
                originName = originName,
                destinationRef = destinationRef,
                destinationName = destinationName,
                directionRef = directionRef,
                destinationAimedArrivalTime = destinationAimedArrivalTime,
                lineRef = lineRef,
                datedVehicleJourneyRef = datedVehicleJourneyRef,
                dataFrameRef = dataFrameRef,
                vehicleRef = refId,
                // Add timestamp for data freshness
                lastUpdated = DateTime.UtcNow.ToString("O")
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
        
        // Update the timestamp when we receive data
        feedState.LastMessageTime = DateTime.UtcNow;
        
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

// health check endpoint to monitor feed status
app.MapGet("/health", () =>
{
    var timeSinceLastMessage = DateTime.UtcNow - feedState.LastMessageTime;
    var isHealthy = timeSinceLastMessage.TotalMinutes <= 5;
    
    return Results.Json(new {
        status = isHealthy ? "healthy" : "unhealthy",
        lastMessageReceived = feedState.LastMessageTime,
        minutesSinceLastMessage = Math.Round(timeSinceLastMessage.TotalMinutes, 1),
        lastSubscriptionAttempt = feedState.LastSubscriptionAttempt,
        vehicleCount = db.HashLength("vehicles")
    });
});

app.Run("http://localhost:5000");

static async Task SendSubscriptionRequestAsync(string callbackUrl, ILogger logger)
{
    const string requestorRef = "TestingXmlDATALayout123";
    const int maxRetries = 5; // incase of network issues, retry up to 5 times
    
    for (int attempt = 0; attempt < maxRetries; attempt++)
    {
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
            httpClient.Timeout = TimeSpan.FromSeconds(4); // 4 second timeout
            var content = new StringContent(requestXml);
            content.Headers.ContentType = new System.Net.Http.Headers.MediaTypeHeaderValue("application/xml");

            logger.LogInformation("Sending subscription request (attempt {attempt}/{maxRetries})...", attempt + 1, maxRetries);
            var response = await httpClient.PostAsync("https://api.entur.io/realtime/v1/subscribe", content);

            var responseBody = await response.Content.ReadAsStringAsync();

            logger.LogDebug("Entur subscription response:\n{xml}", responseBody);

            if (response.IsSuccessStatusCode)
            {
                logger.LogInformation("successfully subscribed to Entur SIRI VM feed!");
                return; // Success, exit the retry loop
            }
            else
            {
                logger.LogWarning("subscription failed. status: {Status}, body:\n{Body}", response.StatusCode, responseBody);
                
                // If this isn't the last attempt, we'll retry
                if (attempt < maxRetries - 1)
                {
                    logger.LogInformation("Retrying subscription request in 2 seconds...");
                    await Task.Delay(2000); // Wait 2 seconds before retry
                }
            }
        }
        catch (TimeoutException ex)
        {
            logger.LogWarning("Subscription request timed out after 4 seconds (attempt {attempt}/{maxRetries})", attempt + 1, maxRetries);
            
            if (attempt < maxRetries - 1)
            {
                logger.LogInformation("Retrying subscription request in 2 seconds...");
                await Task.Delay(2000); // Wait 2 seconds before retry
            }
            else
            {
                logger.LogError(ex, "All subscription attempts timed out after 4 seconds each.");
            }
        }
        catch (Exception ex)
        {
            logger.LogError(ex, "Error sending subscription request (attempt {attempt}/{maxRetries})", attempt + 1, maxRetries);
            
            if (attempt < maxRetries - 1)
            {
                logger.LogInformation("Retrying subscription request in 2 seconds...");
                await Task.Delay(2000); // Wait 2 seconds before retry
            }
        }
    }
    
    logger.LogError("Failed to subscribe to Entur SIRI VM feed after {maxRetries} attempts", maxRetries);
}

// This class holds the shared state for tracking feed status
class FeedState
{
    public DateTime LastMessageTime { get; set; } = DateTime.UtcNow;
    public DateTime LastSubscriptionAttempt { get; set; } = DateTime.UtcNow;
}
