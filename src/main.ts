import './style.css';
import L from 'leaflet';
import 'leaflet.markercluster';
import type { MarkerClusterGroup } from 'leaflet';

const map = L.map('map');

let waypointGroup: MarkerClusterGroup | null = null;

// Handle file upload
async function onGpxFileChange(event: Event) {
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
    if (xmlErrorDiv) xmlErrorDiv.innerText = textContent;
    if (textContent) return;

    // Remove previous markers
    if (waypointGroup) {
        map.removeLayer(waypointGroup);
    }

    const wpts = Array.from(xml.getElementsByTagName('wpt'));
    const markers: L.Marker[] = [];
    const popup = L.popup({ offset: L.point(0, -30) });

    for (const wpt of wpts) {
        const lat = parseFloat(wpt.getAttribute('lat') || '0');
        const lon = parseFloat(wpt.getAttribute('lon') || '0');
        const name = wpt.getElementsByTagName('name')[0]?.textContent || 'Waypoint';
        const desc = wpt.getElementsByTagName('desc')[0]?.textContent || '';
        // Parse groundspeak:cache info
        const cacheElem = wpt.getElementsByTagName('groundspeak:cache')[0];
        let cacheInfo = '';
        if (cacheElem) {
            const cacheName = cacheElem.getElementsByTagName('groundspeak:name')[0]?.textContent || '';
            const cacheType = cacheElem.getElementsByTagName('groundspeak:type')[0]?.textContent || '';
            const container = cacheElem.getElementsByTagName('groundspeak:container')[0]?.textContent || '';
            const longDesc = cacheElem.getElementsByTagName('groundspeak:long_description')[0]?.textContent || '';
            cacheInfo = `Cache Name: ${cacheName}\nType: ${cacheType}\nContainer: ${container}\nDescription: ${longDesc}`;
        }

        const marker = L.marker([lat, lon]);
        // Store all info on marker for easy access
        (marker as any).waypointData = { name, lat, lon, desc, cacheInfo };
        markers.push(marker);
    }

    waypointGroup = L.markerClusterGroup();
    markers.forEach(marker => waypointGroup!.addLayer(marker));
    waypointGroup.addTo(map);

    waypointGroup.on('click', (e: L.LeafletMouseEvent) => {
        const marker = e.propagatedFrom as L.Marker;
        const data = (marker as any).waypointData;
        const textarea = document.getElementById('waypointInfo') as HTMLTextAreaElement | null;
        if (textarea) {
            textarea.value =
                `Name: ${data.name}\nLat: ${data.lat}, Lng: ${data.lon}\nDescription: ${data.desc}\n\nCache Info:\n${data.cacheInfo || 'No cache info'}`;
        }
        const html = `
            <strong>${data.name}</strong><br>
            <small>Lat: ${data.lat.toFixed(6)}, Lng: ${data.lon.toFixed(6)}</small>
            <details style="margin-top:4px;">
                <summary>More info</summary>
                <div style="margin-top:4px;">
                    <em>${data.desc}</em>
                    <pre style="white-space:pre-wrap;margin:0;">${data.cacheInfo}</pre>
                </div>
            </details>
        `;
        popup
            .setLatLng(marker.getLatLng())
            .setContent(html)
            .openOn(map);
    });

    if (markers.length > 0) {
        map.fitBounds(waypointGroup.getBounds().pad(0.5));
    } else {
        alert('No waypoints found in this GPX file.');
        waypointGroup = null;
    }
    const endTime = Date.now();
    console.log(`Processed GPX file with ${markers.length} waypoint(s) in ${endTime - startTime} ms`);
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
