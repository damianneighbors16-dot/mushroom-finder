let map;

async function findNearbyStations(lat, lon) {
    const pointRes = await fetch(`https://api.weather.gov/points/${lat},${lon}`);
    const pointData = await pointRes.json();

    const stationsUrl = pointData.properties.observationStations;

    const stationsRes = await fetch(stationsUrl);
    const stationsData = await stationsRes.json();

    return stationsData.features;
}

navigator.geolocation.getCurrentPosition(

async function(position) {

    let lat = position.coords.latitude;
    let lon = position.coords.longitude;

    map = L.map('map').setView([lat, lon], 10);

    L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
        maxZoom: 19
    }).addTo(map);

    L.marker([lat, lon])
        .addTo(map)
        .bindPopup("📍 Your Location")
        .openPopup();

    document.getElementById("info").innerHTML = `
        <h3>Location Found</h3>
        Latitude: ${lat}<br>
        Longitude: ${lon}<br><br>
        🔍 Finding nearby weather stations...
    `;

    try {
        const stations = await findNearbyStations(lat, lon);

        stations.slice(0, 10).forEach(station => {
            const stLon = station.geometry.coordinates[0];
            const stLat = station.geometry.coordinates[1];
            const name = station.properties.name;
            const stationId = station.properties.stationIdentifier;

            const marker = L.marker([stLat, stLon]).addTo(map);

            marker.bindPopup(`<b>${name}</b><br>Click again to load data...`);

            marker.on('click', async function() {
                const obs = await fetch(`https://api.weather.gov/stations/${stationId}/observations/latest`);
                const obsData = await obs.json();
                const p = obsData.properties;

                let tempF = "N/A";
                if (p.temperature.value !== null) {
                    tempF = (p.temperature.value * 9/5 + 32).toFixed(1);
                }

                let humidity = "N/A";
                if (p.relativeHumidity.value !== null) {
                    humidity = p.relativeHumidity.value.toFixed(0);
                }

                marker.setPopupContent(`
                    <b>${name}</b><br>
                    🌡 Temp: ${tempF}°F<br>
                    💧 Humidity: ${humidity}%
                `);
            });
        });

        document.getElementById("info").innerHTML += `<br>✅ Found ${stations.length} nearby stations`;

    } catch (err) {
        document.getElementById("info").innerHTML += `<br>⚠️ Could not load station data`;
    }

},

function() {
    document.getElementById("info").innerHTML = "Could not find location";
}

);
