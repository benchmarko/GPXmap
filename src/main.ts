import './style.css';
import L from 'leaflet';
import { gpx } from '@tmcw/togeojson';
import type { Feature, FeatureCollection, Point } from 'geojson';

// Replace #app with our UI
const app = document.querySelector<HTMLDivElement>('#app');
if (app) {
    app.innerHTML = `
    <h1>GPX Waypoint Viewer</h1>
    <input type="file" id="gpxFile" accept=".gpx,application/gpx+xml" />
    <div id="xmlError" style="color: red; padding: 1em;"></div>
    <div id="map" style="height: 500px; margin-top: 1em;"></div>
  `;
}

// Initialize Leaflet map
const map = L.map('map').setView([0, 0], 2);
L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    attribution: '© OpenStreetMap contributors'
}).addTo(map);

// Handle file upload
document.getElementById('gpxFile')?.addEventListener('change', async (event) => {
    const startTime = Date.now();
    const input = event.target as HTMLInputElement;
    if (!input.files || input.files.length === 0) return;
    const file = input.files[0];
    const text = await file.text();
    const parser = new DOMParser();
    const xml = parser.parseFromString(text, 'application/xml');

    const errorNode = xml.querySelector("parsererror");
    const textContent = errorNode ? `Error parsing GPX file: ${errorNode.textContent}` : '';
    const xmlErrorDiv = document.getElementById('xmlError');
    if (xmlErrorDiv) {
        xmlErrorDiv.innerText = textContent;
    }
    if (textContent) {
        return;
    }

    const geojson: FeatureCollection = gpx(xml);

    // Remove existing markers
    map.eachLayer(layer => {
        if ((layer as any).options && (layer as any).options.pane === 'markerPane') {
            map.removeLayer(layer);
        }
    });

    // Add waypoints as markers
    const waypoints = geojson.features.filter((f: Feature) => f.geometry?.type === 'Point');
    waypoints.forEach((wpt: Feature) => {
        const coords = (wpt.geometry as Point).coordinates;
        const [lng, lat] = coords;
        L.marker([lat, lng]).addTo(map)
            .bindPopup(wpt.properties?.name || 'Waypoint');
    });
    if (waypoints.length > 0) {
        const group = L.featureGroup(waypoints.map((wpt: Feature) => {
            const coords = (wpt.geometry as Point).coordinates;
            return L.marker([coords[1], coords[0]]);
        }));
        map.fitBounds(group.getBounds().pad(0.5));
    } else {
        alert('No waypoints found in this GPX file.');
    }
    const endTime = Date.now();
    console.log(`Processed GPX file with ${waypoints.length} waypoint(s) in ${endTime - startTime} ms`);
});
