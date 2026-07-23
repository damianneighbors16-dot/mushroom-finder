let map;
let stationMarkers = [];
let soilMarkers = [];
let isLoadingStations = false;
let allSoilStations = null;

function coloredIcon(color) {
    const colors = {
        green: '#2ecc71',
        grey: '#95a5a6',
        blue: '#3498db',
        purple: '#9b59b6'
    };
    const fill = colors[color] || '#3388ff';

    return L.divIcon({
        className: '',
        html: `<div style="
            background:${fill};
            width:16px;
            height:16px;
            border-radius:50% 50% 50% 0;
            transform: rotate(-45deg);
            border: 2px solid white;
            box-shadow: 0 0 3px rgba(0,0,0,0.5);
        "></div>`,
        iconSize: [16, 16],
        iconAnchor: [8, 16],
        popupAnchor: [0, -16]
    });
}

// ---- NWS weather stations ----
async function getStationsInBounds(bounds) {
    // NWS API rejects coordinates with more than 4 decimal places, so round them
    const west = bounds.getWest().toFixed(4);
    const south = bounds.getSouth().toFixed(4);
    const east = bounds.getEast().toFixed(4);
    const north = bounds.getNorth().toFixed(4);

    const url = `https://api.weather.gov/stations?bbox=${west},${south},${east},${north}&limit=500`;
    const res = await fetch(url);

    if (!res.ok) {
        console.error("NWS stations request failed:", res.status, url);
        return []; // return empty list instead of crashing
    }

    const data = await res.json();
    return data.features || [];
}

function clearStationMarkers() {
    stationMarkers.forEach(m => map.removeLayer(m));
    stationMarkers = [];
}

// ---- NRCS SNOTEL/SCAN stations ----
async function getAllSoilStations() {
    if (allSoilStations) return allSoilStations;

    try {
        const url = `https://wcc.sc.egov.usda.gov/awdbRestApi/services/v1/stations?elements=STO,SMS,PRCP&activeOnly=true`;
        const res = await fetch(url);

        if (!res.ok) {
            console.error("NRCS stations request failed:", res.status);
            allSoilStations = [];
            return allSoilStations;
        }

        allSoilStations = await res.json();
        return allSoilStations;

    } catch (e) {
        console.error("NRCS stations fetch error:", e);
        allSoilStations = [];
        return allSoilStations;
    }
}

async function getSoilData(stationTriplet) {
    const today = new Date().toISOString().split('T')[0];
    const url = `https://wcc.sc.egov.usda.gov/awdbRestApi/services/v1/data?stationTriplets=${stationTriplet}&elements=STO,SMS,PRCP&duration=DAILY&beginDate=${today}&endDate=${today}`;

    const res = await fetch(url);
    if (!res.ok) return null;
    return await res.json();
}

function clearSoilMarkers() {
    soilMarkers.forEach(m => map.removeLayer(m));
    soilMarkers = [];
}

function labelForElement(code) {
    if (code === 'STO') return 'Soil temp';
    if (code === 'SMS') return 'Soil moisture';
    if (code === 'PRCP') return 'Precipitation (accum.)';
    return code;
}

async function loadSoilStationsForView(bounds) {
    try {
        const all = await getAllSoilStations();
        if (!all || all.length === 0) return;

        const inView = all.filter(s =>
            bounds.contains([s.latitude, s.longitude])
        );

        clearSoilMarkers();

        const checks = inView.slice(0, 15).map(async station => {
            try {
                const dataRes = await getSoilData(station.stationTriplet);
                if (!dataRes || !dataRes[0] || !dataRes[0].data) return;

                let lines = [];
                dataRes[0].data.forEach(d => {
                    const code = d.stationElement.elementCode;
                    const depth = d.stationElement.heightDepth;
                    const values = d.values;
                    if (values && values.length > 0) {
                        const latest = values[values.length - 1];
                        const label = labelForElement(code);
                        const depthText = depth !== null && depth !== undefined ? ` @ ${depth}in` : '';
                        lines.push(`${label}${depthText}: ${latest.value}`);
                    }
                });

                if (lines.length === 0) return;

                const marker = L.marker([station.latitude, station.longitude], {
                    icon: coloredIcon('purple')
                }).addTo(map);

                marker.bindPopup(`
                    <b>${station.name}</b><br>
                    <small>SNOTEL/SCAN station</small><br><br>
                    ${lines.join('<br>')}
                `);
                soilMarkers.push(marker);

            } catch (e) {
                // this station failed, skip it
            }
        });

        await Promise.all(checks);

    } catch (err) {
        console.error("Soil station error:", err);
    }
}

// ---- Main load function ----
async function loadStationsForView() {
    if (isLoadingStations) return;
    isLoadingStations = true;

    document.getElementById("info").innerHTML = `🔍 Loading stations for this view...`;

    const bounds = map.getBounds();

    try {
        const stations = await getStationsInBounds(bounds);
        clearStationMarkers();

        let onlineCount = 0;

        const checks = stations.map(async station => {
            const stLon = station.geometry.coordinates[0];
            const stLat = station.geometry.coordinates[1];
            const name = station.properties.name;
            const stationId = station.properties.stationIdentifier;

            try {
                const obs = await fetch(`https://api.weather.gov/stations/${stationId}/observations/latest`);
                if (!obs.ok) return;
                const obsData = await obs.json();
                const p = obsData.properties;

                let tempF = null;
                if (p.temperature && p.temperature.value !== null) {
                    tempF = Math.round(p.temperature.value * 9/5 + 32);
                }
                let humidity = null;
                if (p.relativeHumidity && p.relativeHumidity.value !== null) {
                    humidity = Math.round(p.relativeHumidity.value);
                }
                let precipIn = null;
                if (p.precipitationLastHour && p.precipitationLastHour.value !== null) {
                    precipIn = (p.precipitationLastHour.value / 25.4).toFixed(2);
                }

                if (tempF === null && humidity === null) return;

                onlineCount++;

                const marker = L.marker([stLat, stLon], { icon: coloredIcon('green') }).addTo(map);
                marker.bindPopup(`
                    <b>${name}</b><br>
                    🌡 Temp: ${tempF !== null ? tempF + '°F' : 'N/A'}<br>
                    💧 Humidity: ${humidity !== null ? humidity + '%' : 'N/A'}<br>
                    🌧 Precip (last hr): ${precipIn !== null ? precipIn + 'in' : 'N/A'}
                `);
                stationMarkers.push(marker);

            } catch (e) {}
        });

        await Promise.all(checks);

        await loadSoilStationsForView(bounds);

        document.getElementById("info").innerHTML = `
            ✅ ${onlineCount} weather stations<br>
            🟣 ${soilMarkers.length} soil/moisture stations in view
        `;

    } catch (err) {
        document.getElementById("info").innerHTML = `⚠️ Could not load station data`;
        console.error(err);
    }

    isLoadingStations = false;
}

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

    L.marker([lat, lon], { icon: coloredIcon('blue') })
        .addTo(map)
        .bindPopup("📍 Your Location")
        .openPopup();

    loadStationsForView();
    map.on('moveend', onMapMoved);
},

function() {
    document.getElementById("info").innerHTML = "Could not find location";
}

);
