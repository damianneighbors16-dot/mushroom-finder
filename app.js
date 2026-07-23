let map;
let stationMarkers = [];
let isLoadingStations = false;

function coloredIcon(color) {
    return L.icon({
        iconUrl: `https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-2x-${color}.png`,
        shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
        iconSize: [25, 41],
        iconAnchor: [12, 41],
        popupAnchor: [1, -34],
        shadowSize: [41, 41]
    });
}

async function findNearbyStations(lat, lon) {
    const pointRes = await fetch(`https://api.weather.gov/points/${lat},${lon}`);
    const pointData = await pointRes.json();
    const stationsUrl = pointData.properties.observationStations;
    const stationsRes = await fetch(stationsUrl);
    const stationsData = await stationsRes.json();
    return stationsData.features;
}

function clearStationMarkers() {
    stationMarkers.forEach(m => map.removeLayer(m));
    stationMarkers = [];
}

async function loadStationsForView() {
    if (isLoadingStations) return;
    isLoadingStations = true;

    document.getElementById("info").innerHTML = `🔍 Loading stations for this view...`;

    const center = map.getCenter();
    const bounds = map.getBounds();

    try {
        const stations = await findNearbyStations(center.lat, center.lng);

        clearStationMarkers();

        let onlineCount = 0;

        // Check all stations found near the center
        const checks = stations.map(async station => {
            const stLon = station.geometry.coordinates[0];
            const stLat = station.geometry.coordinates[1];
            const name = station.properties.name;
            const stationId = station.properties.stationIdentifier;

            // Skip stations outside the current visible map area
            if (!bounds.contains([stLat, stLon])) return;

            try {
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

                // Only show it if it's actually online (has a temp reading)
                if (tempF !== "N/A") {
                    const marker = L.marker([stLat, stLon], { icon: coloredIcon('green') }).addTo(map);
                    marker.bindPopup(`
                        <b>${name}</b><br>
                        🌡 Temp: ${tempF}°F<br>
                        💧 Humidity: ${humidity}%
                    `);
                    stationMarkers.push(marker);
                    onlineCount++;
                }
            } catch (e) {
                // Station failed to respond, skip it
            }
        });

        await Promise.all(checks);

        document.getElementById("info").innerHTML = `✅ ${onlineCount} online stations in view`;

    } catch (err) {
        document.getElementById("info").innerHTML = `⚠️ Could not load station data`;
    }

    isLoadingStations = false;
}

// Debounce so it doesn't fire too rapidly while dragging/zooming
let moveTimeout;
function onMapMoved() {
    clearTimeout(moveTimeout);
    moveTimeout = setTimeout(loadStationsForView, 800);
}

navigator.geolocation.getCurrentPosition(

function(position) {

    let lat = position.coords.latitude;
    let lon = position.coords.longitude;

    map = L.map('map').setView([lat, lon], 10);

    L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
        maxZoom: 19
    }).addTo(map);

    L.marker([lat, lon], { icon: coloredIcon('red') })
        .addTo(map)
        .bindPopup("📍 Your Location")
        .openPopup();

    // Load stations for the initial view
    loadStationsForView();

    // Reload stations whenever the map is panned or zoomed
    map.on('moveend', onMapMoved);

},

function() {
    document.getElementById("info").innerHTML = "Could not find location";
}

);
