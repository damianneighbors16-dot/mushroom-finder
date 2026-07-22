let map;


navigator.geolocation.getCurrentPosition(

function(position){

let lat = position.coords.latitude;
let lon = position.coords.longitude;


map = L.map('map').setView(
    [lat, lon],
    10
);


L.tileLayer(
'https://tile.openstreetmap.org/{z}/{x}/{y}.png',
{
    maxZoom:19
}
).addTo(map);



L.marker([lat,lon])
.addTo(map)
.bindPopup(
"📍 Your Location"
)
.openPopup();



document.getElementById("info").innerHTML =
`
<h3>Location Found</h3>
Latitude: ${lat}<br>
Longitude: ${lon}<br><br>

🍄 Mushroom system starting...
`;

},


function(){

document.getElementById("info").innerHTML =
"Could not find location";

}

);
