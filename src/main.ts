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

    /*
    example:
    <wpt lat="49.29312" lon="008.69775">
    <time>2021-03-02T19:00:00Z</time>
    <name>GC96ZH7</name>
    <desc>OWK-Wanderwege: Blütenweg (Etappe 1 - 20 km) by Fredda*, Multi-cache (1.5/3.5)</desc>
    <url>https://coord.info/GC96ZH7</url>
    <urlname>OWK-Wanderwege: Blütenweg (Etappe 1 - 20 km)</urlname>
    <sym>Geocache</sym>
    <type>Geocache|Multi-cache</type>
    <groundspeak:cache id="8108679" available="True" archived="False" xmlns:groundspeak="http://www.groundspeak.com/cache/1/0/1">
      <groundspeak:name>OWK-Wanderwege: Blütenweg (Etappe 1 - 20 km)</groundspeak:name>
    */

    const geojson: FeatureCollection = gpx(xml); // convert standard GPX elements to GeoJSON (no custom namespaces/tags)

    // Parse <wpt> elements and map cache info by waypoint name
    const cacheInfoMap = new Map<string, string>();
    const wpts = xml.getElementsByTagName('wpt');
    for (let i = 0; i < wpts.length; i++) {
        const wpt = wpts[i];
        const nameElem = wpt.getElementsByTagName('name')[0];
        const wptName = nameElem ? nameElem.textContent || '' : '';
        const cacheElem = wpt.getElementsByTagName('groundspeak:cache')[0];
        if (cacheElem && wptName) {
            const typeElem = cacheElem.getElementsByTagName('groundspeak:type')[0];
            const cacheType = typeElem ? typeElem.textContent : '';
            const containerElem = cacheElem.getElementsByTagName('groundspeak:container')[0];
            const container = containerElem ? containerElem.textContent : '';
            const descElem = cacheElem.getElementsByTagName('groundspeak:long_description')[0];
            const longDesc = descElem ? descElem.textContent : '';
            cacheInfoMap.set(
                wptName,
                `Type: ${cacheType}\nContainer: ${container}\nDescription: ${longDesc}`
            );
        }
    }
    /*
    // Example: Get all <groundspeak:cache> elements
    const caches = xml.getElementsByTagName('groundspeak:cache');
    for (let i = 0; i < caches.length; i++) {
        const cache = caches[i];
        // Access attributes or child nodes
        const cacheName = cache.getAttribute('name');
        // Or get child elements, e.g. <groundspeak:type>
        const typeElem = cache.getElementsByTagName('groundspeak:type')[0];
        const cacheType = typeElem ? typeElem.textContent : '';
        console.log('Cache:', cacheName, cacheType);
    }
    */

    // example: geojson.features[0].properties
    // {name: 'GC9TXZ5', desc: 'MHR Multi L by hsp2510, Multi-cache (4.5/1.5)', type: 'Geocache|Multi-cache', time: '2022-07-21T00:00:00', sym: 'Geocache'}

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
            const feature = waypoints.find(wpt => {
                const coords = (wpt.geometry as Point).coordinates;
                const [lng, lat] = coords;
                // Compare with marker position
                const markerLatLng = marker.getLatLng();
                return markerLatLng.lat === lat && markerLatLng.lng === lng;
            });
            const name = (marker as any).waypointName;
            const coords = marker.getLatLng();
            const description = feature?.properties?.desc || 'No description';
            const cacheInfo = cacheInfoMap.get(name) || 'No cache info';

            // Show info in textarea
            const textarea = document.getElementById('waypointInfo') as HTMLTextAreaElement | null;
            if (textarea) {
                textarea.value =
                    `Name: ${name}\nLat: ${coords.lat}, Lng: ${coords.lng}\nDescription: ${description}\n\nCache Info:\n${cacheInfo}`;
            }

            const html = `
        <strong>${name}</strong>
        <br>
        <small>Lat: ${coords.lat.toFixed(6)}, Lng: ${coords.lng.toFixed(6)}</small>
        <details style="margin-top:4px;">
            <summary>More info</summary>
            <div style="margin-top:4px;">
                <em>${description}</em>
            </div>
        </details>
    `;
            popup
                .setLatLng(marker.getLatLng())
                .setContent(html)
                .openOn(map);

            //info from 'groundspeak:cache'
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
