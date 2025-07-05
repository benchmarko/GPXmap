import './style.css';
import L from 'leaflet';
import 'leaflet.markercluster';
import type { MarkerClusterGroup } from 'leaflet';

const map = L.map('map');
const popup = L.popup({ offset: L.point(0, -30) });
let waypointGroup: MarkerClusterGroup | null = null;

// Define custom icons for cache types
const iconColors: Record<string, string> = {
    'Geocache|Earthcache': 'brown',
    'Geocache|Event Cache': 'red',
    'Geocache|Letterbox Hybrid': 'yellow',
    'Geocache|Multi-cache': 'orange',
    'Geocache|Traditional Cache': 'green',
    'Geocache|Unknown (Mystery) Cache': 'blue',
    'Geocache|Unknown Cache': 'red',
    'Waypoint|Parking Area': 'gray',
    'Waypoint|Physical Stage': 'gray',
    'Waypoint|Reference Point': 'gray',
    'Waypoint|Trailhead': 'gray',
    'Waypoint|Virtual Stage': 'gray',
    Default: 'gray'
};

const iconCache: Record<string, L.DivIcon> = {};

function getIcon(cacheType: string) {
    const color = iconColors[cacheType] || iconColors.Default;
    if (!iconCache[color]) {
        iconCache[color] = L.divIcon({
            className: 'custom-cache-icon',
            html: `<svg width="24" height="24"><circle cx="12" cy="12" r="10" fill="${color}" stroke="black" stroke-width="2"/></svg>`,
            iconSize: [24, 24],
            iconAnchor: [12, 24],
            popupAnchor: [0, -24]
        });
    }
    return iconCache[color];
}

// Handle file upload
async function onGpxFileChange(event: Event) {
    if (popup.isOpen()) {
        popup.close();
    }
    const startTime = Date.now();
    const inputElement = event.target as HTMLInputElement;
    if (!inputElement.files || inputElement.files.length === 0) return;
    const file = inputElement.files[0];
    const text = await file.text();
    const parser = new DOMParser();
    const xml = parser.parseFromString(text, 'application/xml');

    const waypointInfo = document.getElementById('waypointInfo') as HTMLDivElement;
    const errorNode = xml.querySelector("parsererror");
    if (errorNode) {
        waypointInfo.innerHTML = `<span style="color: red">Error parsing GPX file: ${errorNode.textContent}</span>`;
        inputElement.style = 'color:red';
        return;
    }
    waypointInfo.innerHTML = '';
    inputElement.style = '';

    // Remove previous markers
    if (waypointGroup) {
        map.removeLayer(waypointGroup);
    }

    const wpts = Array.from(xml.getElementsByTagName('wpt'));
    const markers: L.Marker[] = [];

    for (const wpt of wpts) {
        const lat = parseFloat(wpt.getAttribute('lat') || '0');
        const lon = parseFloat(wpt.getAttribute('lon') || '0');
        const name = wpt.getElementsByTagName('name')[0]?.textContent || 'Waypoint';
        const desc = wpt.getElementsByTagName('desc')[0]?.textContent || '';
        const type = wpt.getElementsByTagName('type')[0]?.textContent || '';
        // Parse groundspeak:cache info
        const cacheElem = wpt.getElementsByTagName('groundspeak:cache')[0];
        let cacheInfo = '';
        let cacheType = '';
        if (cacheElem) {
            const cacheName = cacheElem.getElementsByTagName('groundspeak:name')[0]?.textContent || '';
            cacheType = cacheElem.getElementsByTagName('groundspeak:type')[0]?.textContent || '';
            const container = cacheElem.getElementsByTagName('groundspeak:container')[0]?.textContent || '';
            const longDesc = cacheElem.getElementsByTagName('groundspeak:long_description')[0]?.textContent || '';
            cacheInfo = `Cache Name: ${cacheName}\nType: ${cacheType}\nContainer: ${container}\nDescription: ${longDesc}`;
        }

        const marker = L.marker([lat, lon], {
            icon: getIcon(type)
        });

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
        //const waypointInfo = document.getElementById('waypointInfo') as HTMLDivElement | null;
        waypointInfo.innerHTML = `Name: ${data.name}<br>
Lat: ${data.lat}, Lng: ${data.lon}<br>
Description: ${data.desc}<br>
Cache Info:<br>
${data.cacheInfo || 'No cache info'}`;

        const html = `
<strong>${data.name}</strong><br>
<small>Lat: ${data.lat.toFixed(6)}, Lng: ${data.lon.toFixed(6)}</small>
<details style="margin-top:4px;">
    <summary>More info</summary>
    <div style="margin-top:4px;">
        <em>${data.desc}</em>
        <div style="margin:0;max-height:120px;overflow:auto;border:1px solid #ccc;padding:4px;background:#fafafa;">
            ${data.cacheInfo}
        </div>
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
        attribution: '© OpenStreetMap'
    }).addTo(map);

    document.getElementById('gpxFile')?.addEventListener('change', onGpxFileChange);
}
main();
