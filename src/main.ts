import './style.css';
import L from 'leaflet';
import 'leaflet.markercluster';
import type { MarkerClusterGroup } from 'leaflet';
import { ZipFile } from "./ZipFile";

export type ConfigEntryType = string | number | boolean;

type ConfigType = {
    debug: number;
    search: string;
};

const config: ConfigType = {
    debug: 0,
    search: ""
};


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
const popup = L.popup({ offset: L.point(0, -20) });

// Marker pool for reuse
const markerPool: MarkerType[] = [];

function deleteAllItems(items: Record<string, unknown>) {
    Object.keys(items).forEach(key => delete items[key]);
}

function debounce(fn: (...args: any[]) => void, delay: number) {
    let timeoutId: number | undefined;
    return (...args: any[]) => {
        clearTimeout(timeoutId);
        timeoutId = window.setTimeout(() => fn(...args), delay);
    };
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
function clearMarkersFromGroup(group: MarkerClusterGroup): void {
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

function getIcon(cacheType: string): L.DivIcon {
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
function renderMarkers(markersData: WaypointDataType[], keepView: boolean): void {
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
        if (!keepView) {
            map.fitBounds(waypointGroup.getBounds().pad(0.5));
        }
    }
}

// Filter logic
function filterWaypoints(query: string): void {
    const q = query.trim().toLowerCase();
    const keepView = document.getElementById('keepViewInput') as HTMLInputElement;
    const waypointData = Object.values(waypointDataMap);
    const waypointCount = document.getElementById('waypointCount') as HTMLSpanElement;
    if (!q) {
        renderMarkers(waypointData, keepView.checked);
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
    renderMarkers(filtered, keepView.checked);
    waypointCount.innerText = `${filtered.length} / ${waypointData.length}`;
}

function insertNewlineAtLastMatch(str: string, find: string, keepMatch: boolean): string {
    const lastMatch = str.lastIndexOf(find);
    if (lastMatch < 0) {
        return str;
    }
    const matchLen = find.length;
    const add = keepMatch ? 1 : matchLen;
    const result = [str.substring(0, lastMatch).trim(), str.substring(lastMatch + add).trim()].join('<br>\n');
    return result;
}

function position2dmm(lat: number, lon: number): string {
    const latAbs = Math.abs(lat);
    const lonAbs = Math.abs(lon);
    const latNS = lat >= 0 ? "N" : "S";
    const lonEW = lon >= 0 ? "E" : "W";
    const latDeg = Math.floor(latAbs);
    const latMin = (latAbs - latDeg) * 60;
    const lonDeg = Math.floor(lonAbs);
    const lonMin = (lonAbs - lonDeg) * 60;
    return latNS + " " + String(latDeg).padStart(2, '0') + "° " + latMin.toFixed(3).padStart(6, '0') + " " + lonEW + " " + String(lonDeg).padStart(3, '0') + "° " + lonMin.toFixed(3).padStart(6, '0');
}

function onWaypointGroupClick(e: L.LeafletMouseEvent): void {
    const marker = e.propagatedFrom as MarkerType;
    const data = waypointDataMap[marker.waypointName];
    const waypointInfo = document.getElementById('waypointInfo') as HTMLDivElement;

    const desc = insertNewlineAtLastMatch(insertNewlineAtLastMatch(data.desc, ' by ', true), ',', false);

    const dmm = position2dmm(data.lat, data.lon);

    const cacheInfoWithBr = data.cacheInfo ? `<br>\n${data.cacheInfo}<br>\n` : '';
    waypointInfo.innerHTML = `Name: ${data.name}<br>\n${dmm}<br>\n${data.desc}<br>\n${cacheInfoWithBr}`;

const moreInfo = data.cacheInfo ? `
<details style="margin-top:4px;">
    <summary>More info</summary>
    <div style="margin-top:4px;">
        <div style="margin:0;max-height:120px;overflow:auto;border:1px solid #ccc;padding:4px;background:#fafafa;">
            ${data.cacheInfo}
        </div>
    </div>
</details>` : '';

    const popupContent = `
<strong>${data.name}</strong><br>
<span>${desc}</span><br>
<small>${dmm}</small><br>
${moreInfo}
`;

    popup
        .setLatLng(marker.getLatLng())
        .setContent(popupContent)
        .openOn(map);

    //<details><summary>Solver</summary><div class="gc_solver"> ... </div></details>
    //const solverData = data.cacheInfo.match(/<div class="gc_solver">([\S\s]+?)<\/div>/);
    const solverData = data.cacheInfo.match(/<div class="gc_solver">(.+?)<\/div>/s);
    if (solverData && solverData[1]) {
        const solverCode = solverData[1].replace(/<br\/?>\n/g, '\n').trim();
        console.log("TTT: solverCode=", solverCode);
    }
}

function processZipFile(uint8Array: Uint8Array, zipName: string): string[] {
    const messages: string[] = []
    const zip = new ZipFile({
        data: uint8Array
    });

    let password = '';

    const zipDirectory = zip.getZipDirectory();
    const entries = Object.keys(zipDirectory);

    console.log(`processZipFile: ${zipName}: with ${entries.length} entries`);

    for (let i = 0; i < entries.length; i += 1) {
        const name = entries[i];

        if (zipDirectory[name].isDirectory) {
            console.log(`processZipFile: Ignoring directory: ${name}`);
        } else if (name.startsWith("__MACOSX/")) { // MacOS X creates some extra folder in ZIP files
            console.log(`processZipFile: Ignoring file: ${name}`);
        } else {
            if ((zipDirectory[name].flag & 0x01) && !password) { // encrypted and no password set, yet?
                password = prompt(`Password for ${name.split("/").pop()}:`) || '';
            }
            try {
                const binaryData = zip.readBinaryData(name, password);
                if (binaryData) {
                    if (name.endsWith('.zip') || ZipFile.isProbablyZipFile(binaryData)) {
                        console.log(`File ${name} is a ZIP file, processing recursively.`);
                        const messages2 = processZipFile(binaryData, name);
                        messages.push(...messages2);
                    } else {
                        const utf8Text = ZipFile.convertUint8ArrayToUtf8(binaryData);
                        const message = parseGpxFile(utf8Text, name);
                        messages.push(message);
                    }
                }
            } catch (e) {
                const errorMsg = e instanceof Error ? e.message : String(e);
                messages.push(`<span style="color: red">File ${name}: ${errorMsg}</span><br>\n`);
            }
        }
    }
    return messages;
}

function parseGpxFile(text: string, name: string): string {
    const parser = new DOMParser();
    if (text.includes("\v")) { // some special character?
        text = text.replaceAll("\v", " ");
        console.warn(`File ${name}: Special VT character(s) removed.`);
    }
    const xml = parser.parseFromString(text, 'application/xml');

    const errorNode = xml.querySelector("parsererror");
    if (errorNode) {
        throw new Error(`Error parsing ${name}: ${errorNode.textContent}`);
    }

    let overwritten = 0;
    const wpts = Array.from(xml.getElementsByTagName('wpt'));

    for (const wpt of wpts) {
        const lat = parseFloat(wpt.getAttribute('lat') || '0');
        const lon = parseFloat(wpt.getAttribute('lon') || '0');
        const name = wpt.getElementsByTagName('name')[0]?.textContent || 'Waypoint';
        const desc = wpt.getElementsByTagName('desc')[0]?.textContent || '';
        const type = wpt.getElementsByTagName('type')[0]?.textContent || '';

        const cacheElem = wpt.getElementsByTagName('groundspeak:cache')[0];
        let cacheInfo = '';
         if (cacheElem) {
            const archived = (cacheElem.getAttribute('archived') || '').toLowerCase() === 'true';
            const available = (cacheElem.getAttribute('available') || '').toLowerCase() === 'true';
            const cacheName = cacheElem.getElementsByTagName('groundspeak:name')[0]?.textContent || '';
            const cacheType = cacheElem.getElementsByTagName('groundspeak:type')[0]?.textContent || '';
            const container = cacheElem.getElementsByTagName('groundspeak:container')[0]?.textContent || '';
            const longDesc = cacheElem.getElementsByTagName('groundspeak:long_description')[0]?.textContent || '';
            const hints = cacheElem.getElementsByTagName('groundspeak:encoded_hints')[0]?.textContent || '';
            // TODO: logs?
            cacheInfo = `- Cache Name: ${cacheName}<br>\n- Type: ${cacheType}<br>\n- Container: ${container}<br>\n- Archived: ${archived}<br>\n- Available: ${available}<br>\n- Hints: ${hints}<br>\n- Description:<br>\n${longDesc}`;
        }
        if (name in waypointDataMap) {
            overwritten += 1;
        }
        waypointDataMap[name] = { name, lat, lon, type, desc, cacheInfo };
    }
    const overwrittenStr = overwritten ? ` (overwritten: ${overwritten})` : '';
    return `Processed file ${name} with ${wpts.length} waypoints${overwrittenStr}.`;
}

// Handle file upload
async function onGpxFileChange(event: Event): Promise<void> {
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

    inputElement.style.color = '';

    let infoHtml = '';
    for (const file of inputElement.files) {
        try {
            if (file.type === 'application/x-zip-compressed' || file.type === 'application/zip') {
                // on Mac OS it is "application/zip"
                const arrayBuffer = await file.arrayBuffer();
                const messages = processZipFile(new Uint8Array(arrayBuffer), file.name);
                infoHtml += messages.map((message) => `<span>${message}</span><br>\n`).join('');
            } else {
                const text = await file.text();
                const message = parseGpxFile(text, file.name);
                infoHtml += `<span>${message}</span><br>\n`;
            }
        } catch (e) {
            const errorMsg = e instanceof Error ? e.message : String(e);
            infoHtml += `<span style="color: red">${errorMsg}</span><br>\n`;
            inputElement.style.color = 'red';
        }
    }
    const waypointInfo = document.getElementById('waypointInfo') as HTMLDivElement;
    waypointInfo.innerHTML = infoHtml;

    const waypointSearch = document.getElementById('waypointSearch') as HTMLInputElement;
    filterWaypoints(waypointSearch.value);

    const endTime = Date.now();
    console.log(`Processed in ${endTime - startTime} ms`);
}


function fnDecodeUri(s: string): string {
    let decoded = "";

    try {
        decoded = decodeURIComponent(s.replace(/\+/g, " "));
    } catch (err) {
        if (err instanceof Error) {
            err.message += ": " + s;
        }
        console.error(err);
    }
    return decoded;
}

function parseUri(config: Record<string, ConfigEntryType>): string[] {
    const urlQuery = window.location.search.substring(1);
    const rSearch = /([^&=]+)=?([^&]*)/g;
    const args: string[] = [];
    let match: RegExpExecArray | null;

    while ((match = rSearch.exec(urlQuery)) !== null) {
        const name = fnDecodeUri(match[1]);
        const value = fnDecodeUri(match[2]);

        if (value !== null && config[name] !== undefined) {
            args.push(name + "=" + value);
        }
    }
    return args;
}

function parseArgs(args: string[], config: Record<string, ConfigEntryType>): Record<string, ConfigEntryType> {
    for (const arg of args) {
        const [name, ...valueParts] = arg.split("=");
        const nameType = typeof config[name];

        let value: ConfigEntryType = valueParts.join("=");
        if (value !== undefined) {
            if (nameType === "boolean") {
                value = value === "true";
            } else if (nameType === "number") {
                value = Number(value);
            }
            config[name] = value;
        }
    }
    return config;
}


function main(): void {
    const args = parseUri(config);
    parseArgs(args, config);

    map.setView([0, 0], 2);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '© OpenStreetMap'
    }).addTo(map);

    waypointGroup.on('click', onWaypointGroupClick);

    const gpxFile = document.getElementById('gpxFile') as HTMLInputElement;
    gpxFile.addEventListener('change', onGpxFileChange);

    const waypointSearch = document.getElementById('waypointSearch') as HTMLInputElement;
    waypointSearch.addEventListener('input', debounce((e) => {
        const value = (e.target as HTMLInputElement).value;
        filterWaypoints(value);
    }, 400));
    if (config.search) {
        waypointSearch.value = config.search;
    }

    const waypointSearchClear = document.getElementById('waypointSearchClear') as HTMLButtonElement;
    waypointSearchClear.addEventListener('click', (_e) => {
        waypointSearch.value = '';
        filterWaypoints(waypointSearch.value);
    });
}
main();
