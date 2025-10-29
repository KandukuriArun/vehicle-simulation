// app.js - Vehicle movement simulation (vanilla JS + Leaflet)

/*
Features:
- Loads dummy-route.json
- Shows full grey route + blue live polyline
- Moves a bike icon smoothly along the route
- Play/Pause/Reset + Speed controls
- Displays live data (lat, lng, timestamp, speed, etc.)
*/

const MAP_DIV_ID = 'map';
const ROUTE_FILE = 'dummy-route.json';

let map, fullPolyline, livePolyline, bikeMarker;
let route = [];
let index = 0;
let playing = false;
let speedMultiplier = 1.0;
let animRequest = null;
let segmentStartTime = null;
let segmentDuration = 2000;
let segmentFrom = null;
let segmentTo = null;
let startSimTime = null;

const playPauseBtn = document.getElementById('playPauseBtn');
const speedRange = document.getElementById('speedRange');
const speedValue = document.getElementById('speedValue');
const resetBtn = document.getElementById('resetBtn');
const latEl = document.getElementById('lat');
const lngEl = document.getElementById('lng');
const timestampEl = document.getElementById('timestamp');
const elapsedEl = document.getElementById('elapsed');
const speedEl = document.getElementById('speed');
const progressEl = document.getElementById('progress');

function toDate(ts) {
  return ts ? new Date(ts) : null;
}

function formatTime(ms) {
  const s = Math.floor(ms / 1000) % 60;
  const m = Math.floor(ms / 60000) % 60;
  const h = Math.floor(ms / 3600000);
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

function haversine([lat1, lon1], [lat2, lon2]) {
  const R = 6371000;
  const toRad = (v) => v * Math.PI / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

function lerp(a, b, t) {
  return a + (b - a) * t;
}

// --- Initialize Map ---
function initMap(center = [17.385044, 78.486671], zoom = 15) {
  map = L.map(MAP_DIV_ID).setView(center, zoom);

  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    maxZoom: 19,
    attribution: '© OpenStreetMap contributors'
  }).addTo(map);

  fullPolyline = L.polyline([], { color: '#888', weight: 4, opacity: 0.5 }).addTo(map);
  livePolyline = L.polyline([], { color: '#007bff', weight: 5, opacity: 0.9 }).addTo(map);

  // ✅ Bike icon (Flaticon)
  const bikeIcon = L.icon({
    iconUrl: 'https://cdn-icons-png.flaticon.com/512/744/744465.png',
    iconSize: [40, 40],
    iconAnchor: [20, 20]
  });

  bikeMarker = L.marker(center, { icon: bikeIcon }).addTo(map);
}

// --- Load Route ---
async function loadRoute() {
  const resp = await fetch(ROUTE_FILE);
  if (!resp.ok) throw new Error('Unable to load route file: ' + resp.status);
  const json = await resp.json();
  route = json.map((p) => ({
    lat: p.latitude,
    lng: p.longitude,
    timestamp: p.timestamp ? toDate(p.timestamp) : null
  }));

  if (route.length === 0) throw new Error('Route empty');

  fullPolyline.setLatLngs(route.map((p) => [p.lat, p.lng]));
  map.fitBounds(fullPolyline.getBounds(), { padding: [50, 50] });

  index = 0;
  livePolyline.setLatLngs([]);
  bikeMarker.setLatLng([route[0].lat, route[0].lng]);
  updateInfo(0);
}

// --- Start a new segment ---
function startSegment(i) {
  if (i >= route.length - 1) {
    playing = false;
    playPauseBtn.textContent = 'Play';
    return;
  }
  segmentFrom = route[i];
  segmentTo = route[i + 1];
  segmentStartTime = performance.now();

  if (segmentFrom.timestamp && segmentTo.timestamp) {
    let dt = segmentTo.timestamp - segmentFrom.timestamp;
    if (dt <= 0) dt = 2000;
    segmentDuration = dt / speedMultiplier;
  } else {
    segmentDuration = 2000 / speedMultiplier;
  }
}

// --- Animate movement ---
function animate(now) {
  if (!playing) return;
  if (!segmentStartTime) segmentStartTime = now;

  const elapsed = now - segmentStartTime;
  const t = Math.min(1, elapsed / segmentDuration);

  const lat = lerp(segmentFrom.lat, segmentTo.lat, t);
  const lng = lerp(segmentFrom.lng, segmentTo.lng, t);
  bikeMarker.setLatLng([lat, lng]);
  livePolyline.addLatLng([lat, lng]); // always extend the blue path

  const distM = haversine([segmentFrom.lat, segmentFrom.lng], [lat, lng]);
  const segMs = segmentTo.timestamp - segmentFrom.timestamp;
  const segDist = haversine([segmentFrom.lat, segmentFrom.lng], [segmentTo.lat, segmentTo.lng]);
  const segSpeed = segMs > 0 ? (segDist / (segMs / 1000)) * 3.6 : 0;

  latEl.textContent = lat.toFixed(6);
  lngEl.textContent = lng.toFixed(6);
  timestampEl.textContent = segmentFrom.timestamp
    ? new Date(segmentFrom.timestamp.getTime() + t * segMs).toISOString()
    : '—';
  elapsedEl.textContent = formatTime(now - startSimTime);
  speedEl.textContent = `${segSpeed.toFixed(2)} km/h`;
  progressEl.textContent = `${index + 1} / ${route.length}`;

  if (t >= 1) {
    index++;
    if (index < route.length - 1) {
      startSegment(index);
      animRequest = requestAnimationFrame(animate);
    } else {
      playing = false;
      playPauseBtn.textContent = 'Play';
    }
  } else {
    animRequest = requestAnimationFrame(animate);
  }
}

// --- Controls ---
playPauseBtn.addEventListener('click', () => {
  if (!route.length) return;

  if (!playing) {
    if (index >= route.length - 1) resetSimulation();
    playing = true;
    playPauseBtn.textContent = 'Pause';
    startSimTime = performance.now();
    startSegment(index);
    animRequest = requestAnimationFrame(animate);
  } else {
    playing = false;
    playPauseBtn.textContent = 'Play';
    cancelAnimationFrame(animRequest);
  }
});

speedRange.addEventListener('input', (e) => {
  speedMultiplier = parseFloat(e.target.value);
  speedValue.textContent = `${speedMultiplier}×`;
});

resetBtn.addEventListener('click', () => resetSimulation());

function resetSimulation() {
  playing = false;
  cancelAnimationFrame(animRequest);
  index = 0;
  livePolyline.setLatLngs([]);
  bikeMarker.setLatLng([route[0].lat, route[0].lng]);
  updateInfo(0);
  playPauseBtn.textContent = 'Play';
}

function updateInfo(i) {
  const p = route[i];
  latEl.textContent = p.lat.toFixed(6);
  lngEl.textContent = p.lng.toFixed(6);
  timestampEl.textContent = p.timestamp ? p.timestamp.toISOString() : '—';
  elapsedEl.textContent = '00:00:00';
  speedEl.textContent = '—';
  progressEl.textContent = `${i + 1} / ${route.length}`;
}

// --- Initialize everything ---
(async function () {
  try {
    initMap();
    await loadRoute();
    speedValue.textContent = `${speedMultiplier}×`;
  } catch (err) {
    alert('Error loading route: ' + err.message);
    console.error(err);
  }
})();
