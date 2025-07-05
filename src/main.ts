import './style.css';
import L from 'leaflet';
import { gpx } from '@tmcw/togeojson';
import type { Feature, FeatureCollection, Point } from 'geojson';

let waypointGroup: L.FeatureGroup | null = null;

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

    /*
    // Listen for map moveend event (fires after fitBounds animation completes)
    map.once('moveend', () => {
        console.log(`Debug: Map rendering done (fitBounds complete, waypoints visible) after ${Date.now() - startTime} ms`);
    });
    */

    // Remove existing markers (remove previous feature group if present)
    // Inside your file upload handler, after parsing geojson:
    if (waypointGroup) {
        map.removeLayer(waypointGroup);
    }

    const waypoints = geojson.features.filter((f: Feature) => f.geometry?.type === 'Point');
    if (waypoints.length > 0) {
        const markers = waypoints.map((wpt: Feature) => {
            const coords = (wpt.geometry as Point).coordinates;
            const [lng, lat] = coords;
            return L.marker([lat, lng]).bindPopup(wpt.properties?.name || 'Waypoint');
        });
        waypointGroup = L.featureGroup(markers).addTo(map);
        map.fitBounds(waypointGroup.getBounds().pad(0.5));
    } else {
        alert('No waypoints found in this GPX file.');
        waypointGroup = null;
    }
    const endTime = Date.now();
    console.log(`Processed GPX file with ${waypoints.length} waypoint(s) in ${endTime - startTime} ms`);
});
