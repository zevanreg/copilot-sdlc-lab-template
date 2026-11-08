using System.Net;
using System.Net.Http.Json;
using HotelBooking.Api.Contracts;
using HotelBooking.Api.Data;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.DependencyInjection.Extensions;

namespace HotelBooking.Api.Tests;

public sealed class BookingApiTests(BookingApiFactory factory)
    : IClassFixture<BookingApiFactory>
{
    private readonly HttpClient _client = factory.CreateClient();

    [Fact]
    public async Task Booking_a_room_blocks_overlapping_dates()
    {
        var rooms = await _client.GetFromJsonAsync<List<RoomResponse>>(
            "/api/rooms?checkIn=2035-06-10&checkOut=2035-06-12");

        Assert.NotNull(rooms);
        Assert.Equal(6, rooms.Count);
        Assert.All(rooms, room => Assert.True(room.IsAvailable));

        var request = new CreateBookingRequest(
            rooms[0].Id,
            "Ada Lovelace",
            "ada@example.com",
            new DateOnly(2035, 6, 10),
            new DateOnly(2035, 6, 12));

        var created = await _client.PostAsJsonAsync("/api/bookings", request);
        Assert.Equal(HttpStatusCode.Created, created.StatusCode);

        var conflict = await _client.PostAsJsonAsync("/api/bookings", request);
        Assert.Equal(HttpStatusCode.Conflict, conflict.StatusCode);

        var refreshedRooms = await _client.GetFromJsonAsync<List<RoomResponse>>(
            "/api/rooms?checkIn=2035-06-11&checkOut=2035-06-13");

        Assert.False(refreshedRooms!.Single(room => room.Id == rooms[0].Id).IsAvailable);
    }

    [Fact]
    public async Task Invalid_date_range_returns_bad_request()
    {
        var response = await _client.GetAsync(
            "/api/rooms?checkIn=2035-06-12&checkOut=2035-06-10");

        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
    }

    [Fact]
    public async Task Concurrent_requests_cannot_double_book_a_room()
    {
        var rooms = await _client.GetFromJsonAsync<List<RoomResponse>>(
            "/api/rooms?checkIn=2037-08-10&checkOut=2037-08-12");
        var request = new CreateBookingRequest(
            rooms![1].Id,
            "Grace Hopper",
            "grace@example.com",
            new DateOnly(2037, 8, 10),
            new DateOnly(2037, 8, 12));

        var responses = await Task.WhenAll(
            _client.PostAsJsonAsync("/api/bookings", request),
            _client.PostAsJsonAsync("/api/bookings", request));

        Assert.Contains(responses, response => response.StatusCode == HttpStatusCode.Created);
        Assert.Contains(responses, response => response.StatusCode == HttpStatusCode.Conflict);
    }

    [Fact]
    public async Task Sqlite_can_query_rooms_ordered_by_price()
    {
        var databasePath = Path.Combine(Path.GetTempPath(), $"hotel-booking-{Guid.NewGuid()}.db");

        try
        {
            await using var factory = new SqliteBookingApiFactory(databasePath);
            using var client = factory.CreateClient();

            var response = await client.GetAsync(
                "/api/rooms?checkIn=2035-07-10&checkOut=2035-07-12");

            response.EnsureSuccessStatusCode();
            var rooms = await response.Content.ReadFromJsonAsync<List<RoomResponse>>();
            Assert.Equal(6, rooms!.Count);
            Assert.Equal(rooms.OrderBy(room => room.PricePerNight), rooms);
        }
        finally
        {
            File.Delete(databasePath);
            File.Delete($"{databasePath}-shm");
            File.Delete($"{databasePath}-wal");
        }
    }
}

public sealed class BookingApiFactory : WebApplicationFactory<Program>
{
    private readonly string _databaseName = $"HotelBookingTests-{Guid.NewGuid()}";

    protected override void ConfigureWebHost(IWebHostBuilder builder)
    {
        builder.ConfigureServices(services =>
        {
            services.RemoveAll<DbContextOptions<HotelBookingContext>>();
            services.AddDbContext<HotelBookingContext>(options =>
                options.UseInMemoryDatabase(_databaseName));
        });
    }
}

public sealed class SqliteBookingApiFactory(string databasePath) : WebApplicationFactory<Program>
{
    protected override void ConfigureWebHost(IWebHostBuilder builder)
    {
        builder.ConfigureServices(services =>
        {
            services.RemoveAll<DbContextOptions<HotelBookingContext>>();
            services.AddDbContext<HotelBookingContext>(options =>
                options.UseSqlite($"Data Source={databasePath};Pooling=False"));
        });
    }
}
