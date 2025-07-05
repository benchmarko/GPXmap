import './style.css';
import L from 'leaflet';
import { gpx } from '@tmcw/togeojson';
import type { Feature, FeatureCollection, Point } from 'geojson';

const map = L.map('map');

let waypointGroup: L.FeatureGroup | null = null;

// Handle file upload
async function onGpxFileChange(event: Event) {
    const startTime = Date.now();
    const input = event.target as HTMLInputElement;
    if (!input.files || input.files.length === 0) {
        return;
    }
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

    // Remove existing markers (remove previous feature group if present)
    // Inside your file upload handler, after parsing geojson:
    if (waypointGroup) {
        map.removeLayer(waypointGroup);
    }

 const waypoints = geojson.features.filter((f: Feature) => f.geometry?.type === 'Point');
if (waypoints.length > 0) {
    const popup = L.popup(
        {
            offset: L.point(0, -30) // Adjust -30 to move the popup higher above the marker
        }
    );
    const markers = waypoints.map((wpt: Feature) => {
        const coords = (wpt.geometry as Point).coordinates;
        const [lng, lat] = coords;
        const marker = L.marker([lat, lng]);
        // Store the name as marker data for easy access in the click handler
        (marker as any).waypointName = wpt.properties?.name || 'Waypoint';
        return marker;
    });
    waypointGroup = L.featureGroup(markers).addTo(map);

    // Attach a single popup to the feature group
    waypointGroup.on('click', (e: L.LeafletMouseEvent) => {
        const marker = e.propagatedFrom as L.Marker;
        const name = (marker as any).waypointName;
        popup
            .setLatLng(e.latlng) //.setLatLng(marker.getLatLng()) //.setLatLng(e.latlng)
            .setContent(name)
            .openOn(map);
    });

    map.fitBounds(waypointGroup.getBounds().pad(0.5));
} else {
    alert('No waypoints found in this GPX file.');
    waypointGroup = null;
}
    const endTime = Date.now();
    console.log(`Processed GPX file with ${waypoints.length} waypoint(s) in ${endTime - startTime} ms`);
}

function main() {
    // Initialize Leaflet map
    map.setView([0, 0], 2);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '© OpenStreetMap contributors'
    }).addTo(map);

    document.getElementById('gpxFile')?.addEventListener('change', onGpxFileChange);
}
main();
