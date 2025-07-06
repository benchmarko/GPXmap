import './style.css';
import L from 'leaflet';
import 'leaflet.markercluster';
import type { MarkerClusterGroup } from 'leaflet';
import { ZipFile } from "./ZipFile";


type WaypointDataType = {
    name: string;
    lat: number;
    lon: number;
    type: string;
    desc: string;
    cacheInfo: string;
};

type WaypointDataMapType = Record<string, WaypointDataType>;

type MarkerType = L.Marker & {
    waypointName: string;
};

const waypointDataMap: WaypointDataMapType = {}; // Store markers data for filtering

const map = L.map('map');
const waypointGroup = L.markerClusterGroup();
const popup = L.popup({ offset: L.point(0, -30) });

// Marker pool for reuse
const markerPool: MarkerType[] = [];

function deleteAllItems(items: Record<string, unknown>) {
    Object.keys(items).forEach(key => delete items[key]);
}

// Get a marker from the pool or create a new one
function getPooledMarker(lat: number, lon: number, icon: L.DivIcon, name: string): MarkerType {
    let marker: MarkerType;
    if (markerPool.length > 0) {
        marker = markerPool.pop()!;
        marker.setLatLng([lat, lon]);
        marker.setIcon(icon);
    } else {
        marker = L.marker([lat, lon], { icon }) as MarkerType;
    }
    marker.waypointName = name;
    return marker;
}

// When clearing markers, return them to the pool
function clearMarkersFromGroup(group: MarkerClusterGroup) {
    group.eachLayer(layer => {
        if (layer instanceof L.Marker) {
            markerPool.push(layer as MarkerType);
        }
    });
    group.clearLayers();
}

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

// Helper to render (filtered) markers
function renderMarkers(markersData: WaypointDataType[]) {
    if (map.hasLayer(waypointGroup)) {
        clearMarkersFromGroup(waypointGroup);
        map.removeLayer(waypointGroup);
    }

    if (markersData.length > 0) {
        markersData.forEach(data => {
            const marker = getPooledMarker(data.lat, data.lon, getIcon(data.type), data.name);
            waypointGroup!.addLayer(marker);
        });
        waypointGroup.addTo(map);
        map.fitBounds(waypointGroup.getBounds().pad(0.5));
    }
}

// Filter logic
function filterWaypoints(query: string) {
    const q = query.trim().toLowerCase();
    const waypointData = Object.values(waypointDataMap);
    const waypointCount = document.getElementById('waypointCount') as HTMLSpanElement;
    if (!q) {
        renderMarkers(waypointData);
        waypointCount.innerText = String(waypointData.length);
        return;
    }
    const filtered = waypointData.filter(data => {
        return (
            data.name.toLowerCase().includes(q) ||
            data.desc.toLowerCase().includes(q) ||
            data.cacheInfo.toLowerCase().includes(q)
        );
    });
    renderMarkers(filtered);
    waypointCount.innerText = `${filtered.length} / ${waypointData.length}`;
}

function onWaypointGroupClick(e: L.LeafletMouseEvent) {
    const marker = e.propagatedFrom as MarkerType;
    const data = waypointDataMap[marker.waypointName];
    const waypointInfo = document.getElementById('waypointInfo') as HTMLDivElement;
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
}

function processZipFile(uint8Array: Uint8Array, name: string) {
    const messages: string[] = []
    const zip = new ZipFile({
        data: uint8Array, // rather data
        zipName: name
    });

    const zipDirectory = zip.getZipDirectory(),
        entries = Object.keys(zipDirectory);

    for (let i = 0; i < entries.length; i += 1) {
        const name2 = entries[i];

        if (name2.startsWith("__MACOSX/")) { // MacOS X creates some extra folder in ZIP files
            console.log("processZipFile: Ignoring file:", name2);
        } else {
            let data2: string | undefined;

            data2 = zip.readData(name2);
            if (data2) {
                messages.push(parseGpxFile(data2, name2));
            }
        }
    }
    return messages;
}

function parseGpxFile(text: string, name: string) {
    const parser = new DOMParser();
    const xml = parser.parseFromString(text, 'application/xml');

    const errorNode = xml.querySelector("parsererror");
    if (errorNode) {
        throw new Error(`Error parsing GPX file ${name}: ${errorNode.textContent}`);
    }

    const wpts = Array.from(xml.getElementsByTagName('wpt'));

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
            cacheInfo = `Cache Name: ${cacheName}<br>\nType: ${cacheType}<br>\nContainer: ${container}<br>\nDescription: ${longDesc}`;
        }

        /*
        // Test: check for UTF-8 chars >= 0x100
        let utf8Chars = '';
        for (let i = 0; i < desc.length; i++) {
            if (desc.charCodeAt(i) >= 0x100) {
                utf8Chars += desc.charAt(i);
            }
        }
        if (utf8Chars) {
            console.log("DDD:", name, `>${utf8Chars}<`);
        }
        */

        waypointDataMap[name] = { name, lat, lon, type, desc, cacheInfo };
    }
    return `Processed file ${name} with ${wpts.length} waypoints.`;
}

// Handle file upload
async function onGpxFileChange(event: Event) {
    if (popup.isOpen()) {
        popup.close();
    }
    const startTime = Date.now();
    const inputElement = event.target as HTMLInputElement;
    if (!inputElement.files || inputElement.files.length === 0) {
        return;
    }

    deleteAllItems(waypointDataMap); // Reset waypoint data map
    filterWaypoints("");

    const waypointInfo = document.getElementById('waypointInfo') as HTMLDivElement;
    waypointInfo.innerHTML = '';
    inputElement.style = '';

    for (const file of inputElement.files) {
        try {
            let text = '';
            if (file.type === 'application/x-zip-compressed' || file.type === 'application/zip') {
                // on Mac OS it is "application/zip"
                const arrayBuffer = await file.arrayBuffer();
                const messages = processZipFile(new Uint8Array(arrayBuffer), file.name);
                waypointInfo.innerHTML += messages.map((message) => `<span>${message}</span><br>\n`).join('');
            } else {
                text = await file.text();
                const message = parseGpxFile(text, file.name);
                waypointInfo.innerHTML += `<span>${message}</span><br>\n`;
            }
        } catch (e) {
            waypointInfo.innerHTML += `<span style="color: red">${e}</span><br>\n`;
            inputElement.style = 'color:red';
        }
    }

    const waypointSearch = document.getElementById('waypointSearch') as HTMLInputElement;
    filterWaypoints(waypointSearch.value);

    const endTime = Date.now();
    console.log(`Processed in ${endTime - startTime} ms`);
}

function main() {
    // Initialize Leaflet map
    map.setView([0, 0], 2);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '© OpenStreetMap'
    }).addTo(map);

    waypointGroup.on('click', onWaypointGroupClick);

    const gpxFile = document.getElementById('gpxFile') as HTMLInputElement;
    gpxFile.addEventListener('change', onGpxFileChange);

    const waypointSearch = document.getElementById('waypointSearch') as HTMLInputElement;
    waypointSearch.addEventListener('input', (e) => {
        const value = (e.target as HTMLInputElement).value;
        filterWaypoints(value);
    });

    const waypointSearchClear = document.getElementById('waypointSearchClear') as HTMLButtonElement;
    waypointSearchClear.addEventListener('click', (_e) => {
        waypointSearch.value = '';
        filterWaypoints(waypointSearch.value);
    });
}
main();
