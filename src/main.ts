import './style.css';
import L from 'leaflet';
import 'leaflet.markercluster';
import type { FeatureGroup, MarkerClusterGroup } from 'leaflet';

import LatLng from "./LatLng";
import ScriptParser, { type ValueType, type VariableAccessType } from './ScriptParser';
import { ZipFile } from "./ZipFile";

declare global {
    interface Window {
        GPXmap: {
            addItem: (key: string, input: string) => void
        };
    }
}

export type ConfigEntryType = string | number | boolean;

type ConfigType = {
    debug: number;
    file: string,
    keepView: boolean;
    search: string;
    showLocation: boolean;
};


const defaultConfig: ConfigType = {
    debug: 0,
    file: "",
    keepView: false,
    search: "",
    showLocation: false
};
const config = { ...defaultConfig };


type WaypointDataType = {
    name: string;
    lat: number;
    lon: number;
    type: string;
    desc: string;
    cacheInfo: string;
    solverCode: string;
    solverCodeEdited?: string;
};

type WaypointDataMapType = Record<string, WaypointDataType>;

type MarkerType = L.Marker & {
    waypointName: string;
};

const waypointDataMap: WaypointDataMapType = {}; // Store markers data for filtering

const map = L.map('map');
const waypointGroup = L.markerClusterGroup();
const popup = L.popup();

const solverGroup = L.featureGroup();
const solverPopup = L.popup();

// Marker pool for reuse
const markerPool: MarkerType[] = [];

function asyncDelay(fn: () => void, timeout: number) {
    (() => {
        const timerId = window.setTimeout(fn, timeout);
        return timerId;
    })();
}

function deleteAllItems(items: Record<string, unknown>) {
    Object.keys(items).forEach(key => delete items[key]);
}

function debounce(fn: (e: Event) => void, delay: number) {
    let timeoutId: number | undefined;
    return (e: Event) => {
        clearTimeout(timeoutId);
        timeoutId = window.setTimeout(() => fn(e), delay);
    };
}

function getDefaultConfigMap(): ConfigType {
    return defaultConfig;
}

function getConfigMap(): ConfigType {
    return config;
}


function syncInputState(inputId: string, configValue: boolean): void {
        const input = window.document.getElementById(inputId) as HTMLInputElement;
        if (input.checked !== configValue) {
            input.checked = configValue;
            input.dispatchEvent(new Event("change"));
        }
    }

function updateConfigParameter(name: string, value: string | boolean) {
    const configAsRecord = getConfigMap() as Record<string, unknown>;
    const defaultConfigAsRecord = getDefaultConfigMap() as Record<string, unknown>;

    if (!(name in configAsRecord)) {
        console.error("updateConfigParameter: Unknown key:", name);
    }
    configAsRecord[name] = value;

    const url = new URL(window.location.href);
    if (configAsRecord[name] !== defaultConfigAsRecord[name]) {
        url.searchParams.set(name, String(value));
    } else {
        url.searchParams.delete(name);
    }
    history.pushState({}, "", url.href);
}

function setButtonDisabled(id: string, disabled: boolean) {
    const element = window.document.getElementById(id) as HTMLButtonElement;
    element.disabled = disabled;
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
function clearMarkersFromGroup(group: MarkerClusterGroup | FeatureGroup): void {
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
    'Geocache|Event Cache': 'fireBrick',
    'Geocache|Letterbox Hybrid': 'yellow',
    'Geocache|Multi-cache': 'orange',
    'Geocache|Traditional Cache': 'green',
    'Geocache|Unknown Cache': 'CornFlowerBlue', // Mystery Cache
    'Geocache|Webcam Cache': 'DarkTurquoise',
    'Waypoint|Parking Area': 'gray',
    'Waypoint|Physical Stage': 'gray',
    'Waypoint|Reference Point': 'gray',
    'Waypoint|Trailhead': 'gray',
    'Waypoint|Virtual Stage': 'lightblue',
    Location: 'transparent',
    Solver: 'transparent',
    Default: 'gray'
};

const iconCache: Record<string, L.DivIcon> = {};

function getIcon(cacheType: string): L.DivIcon {
    const color = iconColors[cacheType] || iconColors.Default;
    if (!iconCache[color]) {
        const size = cacheType === 'Location' ? 22 : 18; // size of the icon
        iconCache[cacheType] = L.divIcon({
            className: 'custom-cache-icon',
            // circle with x in the middle
            html: `<svg width="${size}" height="${size}" stroke="black" stroke-width="1">
            <circle cx="${size / 2}" cy="${size / 2}" r="${size / 2 - 1}" fill="${color}" />
            <line x1="${size * 0.27}" y1="${size * 0.27}" x2="${size * 0.73}" y2="${size * 0.73}" />
            <line x1="${size * 0.73}" y1="${size * 0.27}" x2="${size * 0.27}" y2="${size * 0.73}" />
            </svg>`,
            iconSize: [size, size],
            iconAnchor: [size / 2, size / 2],
            popupAnchor: [0, -size / 2]
        });
    }
    return iconCache[cacheType];
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
            waypointGroup.addLayer(marker);
        });
        waypointGroup.addTo(map);
        if (!keepView) {
            map.fitBounds(waypointGroup.getBounds().pad(0.5));
        }
    }
}

const polylineGroup = L.featureGroup(); // featureGroup for polyline

function privSetPolyline(path: L.LatLng[]) {
    const aLayers = polylineGroup.getLayers();

    if (aLayers.length) {
        const oPolyline = aLayers[0] as L.Polyline;
        oPolyline.setLatLngs(path);
    } else {
        const mPolylineOptions = {
            color: "blue", // "red", // default: #3388FF
            weight: 2, // default: 3
            opacity: 0.7 // default: 1
        };
        const oPolyline = new L.Polyline(path, mPolylineOptions);
        oPolyline.addTo(polylineGroup);
    }
}

function setPolyline(solverMarkersData: WaypointDataType[]) { // for update
    polylineGroup.clearLayers();
    const aPath = [];
    for (let i = 0; i < solverMarkersData.length; i += 1) {
        const oItem = solverMarkersData[i];
        const oPosition = new L.LatLng(oItem.lat, oItem.lon); //oItem.position.clone();
        aPath.push(oPosition);
    }

    privSetPolyline(aPath);
}

const solverDataMap: WaypointDataMapType = {};

function renderSolverMarkers(solverMarkersData: WaypointDataType[]): void {
    if (map.hasLayer(solverGroup)) {
        clearMarkersFromGroup(solverGroup);
        map.removeLayer(solverGroup);
    }
    deleteAllItems(solverDataMap);

    if (solverMarkersData.length > 0) {
        solverMarkersData.forEach(data => {
            const marker = getPooledMarker(data.lat, data.lon, getIcon(data.type), data.name);
            solverGroup.addLayer(marker);
            solverDataMap[data.name] = data;
        });
        solverGroup.addTo(map);
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

const directions = ["N", "NNE", "NE", "ENE", "E", "ESE", "SE", "SSE", "S", "SSW", "SW", "WSW", "W", "WNW", "NW", "NNW"];

function getDirection(bearing: number): string {
    return directions[Math.round(bearing / (360 / directions.length)) % directions.length];
}

function formatDistance(distance: number) {
    if (distance > 1000) {
        return (distance / 1000).toFixed(3) + ' km';
    }
    return distance.toFixed(2) + ' m';
}

function getBearing(from: L.LatLng, to: L.LatLng): number {
    const toRad = (deg: number) => deg * Math.PI / 180;
    const toDeg = (rad: number) => rad * 180 / Math.PI;

    const lat1 = toRad(from.lat);
    const lat2 = toRad(to.lat);
    const dLon = toRad(to.lng - from.lng);

    const y = Math.sin(dLon) * Math.cos(lat2);
    const x = Math.cos(lat1) * Math.sin(lat2) -
        Math.sin(lat1) * Math.cos(lat2) * Math.cos(dLon);
    const brng = Math.atan2(y, x);
    return (toDeg(brng) + 360) % 360; // Normalize to 0-360
}

function preparePopupContent(data: WaypointDataType, solverCodeInHtml: string, distance: number, bearing: number): string {
    let moreInfo = '';

    if (data.cacheInfo) {
        moreInfo = `
    <details style="margin-top:4px;">
        <summary>More info</summary>
        <div style="margin-top:4px;">
            <div style="margin:0;max-height:120px;overflow:auto;border:1px solid #ccc;padding:4px;background:#fafafa;">
                ${data.cacheInfo}${solverCodeInHtml}
            </div>
        </div>
    </details>`;
    } else if (data.type === 'Solver' && selectedMarker) {
        // With markerCluster, the marker position may be different than the position in the data!
        const searchPoint = L.latLng(data.lat, data.lon);
        const threshold = 1; // threshold in meters
        const mainData = waypointDataMap[selectedMarker.waypointName];
        const mainLatLng = mainData ? L.latLng(mainData.lat, mainData.lon) : null;
        if (mainLatLng && (searchPoint.distanceTo(mainLatLng) <= threshold)) {
            const wpPopupContent = popup.getContent() as string;
            moreInfo = `
    <details style="margin-top:4px;">
        <summary>Marker ${selectedMarker.waypointName}</summary>
        <div style="margin-top:4px;">
            <div style="margin:0;max-height:120px;overflow:auto;border:1px solid #ccc;padding:4px;background:#fafafa;">
                ${wpPopupContent}
            </div>
        </div>
    </details>`;
        }

    }

    const dmm = position2dmm(data.lat, data.lon);
    const desc = insertNewlineAtLastMatch(insertNewlineAtLastMatch(data.desc, ' by ', true), ',', false);
    const distanceStr = distance >= 0 ? `<br>Distance: ${formatDistance(distance)} ${getDirection(bearing)} (${bearing.toFixed(0)}°)` : '';
    const name = data.name;
    const nameStr = name.startsWith("GC") ? `<a href="https://coord.info/${name}" target="_blank">${name}</a>` : name;

    return `
<strong>${nameStr}</strong><br>
<span>${desc}</span><br>
<small>${dmm}${distanceStr}</small>
${moreInfo}
`;
}

function getWaypointFromLocalStorage(key: string): WaypointDataType | undefined {
    const storedData = window.localStorage.getItem(key);
    if (storedData) {
        try {
            const data = JSON.parse(storedData) as Partial<WaypointDataType>;
            if (key !== data.name) {
                console.warn("getWaypointFromLocalStorage: Key and name mismatch for key ", key, data.name);
                return undefined;
            }
            const wp: WaypointDataType = {
                name: data.name || '',
                lat: Number(data.lat) || 0,
                lon: Number(data.lon) || 0,
                type: data.type || '',
                desc: data.desc || '',
                cacheInfo: data.cacheInfo || '',
                solverCode: data.solverCode || '',
                solverCodeEdited: data.solverCodeEdited,
            };
            return wp;
        } catch (e) {
            console.warn("getWaypointFromLocalStorage: Cannot parse data for key ", key, String(e));
        }
    }
    return undefined;
}

function getSolverCode(key: string) {
    const data = waypointDataMap[key];
    return data ? data.solverCodeEdited || data.solverCode : '';
}

function putWaypointAndSolverIntoLocalStorage(key: string, waypoint: WaypointDataType) {
    window.localStorage.setItem(key, JSON.stringify(waypoint));
}

function removeKeyFromLocalStorage(key: string) {
    window.localStorage.removeItem(key);
}

function loadWaypointsFromLocalStorage() {
    for (let i = 0; i < window.localStorage.length; i++) {
        const key = window.localStorage.key(i);
        if (key && key.startsWith('GC')) { // Only load geocache waypoints
            const waypoint = getWaypointFromLocalStorage(key);
            if (waypoint) {
                waypointDataMap[key] = waypoint; // always override
            }
        }
    }
}

function getSolverCodeInHtml(solverCode: string) {
    if (solverCode) {
        const solverCodePrepared = solverCode.replace(/\n/g, '<br>\n');
        return `<details><summary>Solver</summary><div class="gc_solver">${solverCodePrepared}<br>\n</div></details>\n`;
    }
    return '';
}

function prepareInfoContent(data: WaypointDataType, solverCodeInHtml: string, distance: number, bearing: number): string {
    const cacheInfo = `<br>\n${data.cacheInfo || ''}${solverCodeInHtml}<br>\n`;

    const dmm = position2dmm(data.lat, data.lon);
    const distanceStr = distance >= 0 ? `Distance: ${formatDistance(distance)} ${getDirection(bearing)} (${bearing.toFixed(0)}°)<br>\n` : ''
    const name = data.name;
    const nanmeStr = name.startsWith("GC") ? `<a href="https://coord.info/${name}" target="_blank">${name}</a>` : name;
    const infoContent = `${nanmeStr}<br>\n${dmm}<br>\n${distanceStr}${data.desc}<br>\n${cacheInfo}`;
    return infoContent;
}

function getWaypointInfoHtml(): string {
    const waypointInfo = document.getElementById('waypointInfo') as HTMLDivElement;
    return waypointInfo.innerHTML;
}

function setWaypointInfoHtml(html: string): void {
    const waypointInfo = document.getElementById('waypointInfo') as HTMLDivElement;
    waypointInfo.innerHTML = html;
}

function parseSolverCode(input: string, variables: Record<string, ValueType>) {
    if (input.includes('\u2013')) {
        console.warn("strange '-' found: '\u2013'.");
    }

    const variableAccess: VariableAccessType = {
        vars: {},
        get: (name: string) => {
            let value = variables[name];
            if (value === undefined) {
                if (name.startsWith("$")) {
                    const name2 = name.substring(1);
                    const waypointData = waypointDataMap[name2];
                    if (waypointData) {
                        value = position2dmm(waypointData.lat, waypointData.lon);
                    }
                }
            }
            return value;
        },
        set: (name: string, value: ValueType) => {
            variables[name] = value;
        }
    }

    try {
        const output = new ScriptParser().calculate(input, variableAccess);
        if (config.debug > 1) {
            console.debug("DEBUG: parseSolverCode: ", output, variables);
        }
        return String(output);
    } catch (e) {
        const errorMsg = String(e);
        console.error(errorMsg);
        return `<span style="color: red">Error: ${errorMsg}</span><br>\n`;
    }
}

function prepareSolverMarkersData(solverPoints: [string, string | number][]) {
    const markersData = solverPoints.map((entry) => {
        const [key, value] = entry;
        const latLon = new LatLng().parse(String(value));
        return {
            name: key,
            lat: latLon.getLat(),
            lon: latLon.getLng(),
            type: "Solver",
            desc: latLon.getComment(),
            cacheInfo: '',
            solverCode: ''
        }
    });
    return markersData;
}

let selectedMarker: MarkerType | undefined = undefined;

function selectMarker(marker: MarkerType): void {
    selectedMarker = marker;
    const data = waypointDataMap[marker.waypointName];

    setButtonDisabled('editButton', false);
    setButtonDisabled('saveButton', true); // TODO: do we need to save something?
    setButtonDisabled('cancelButton', true);

    const currentLatLng = locationMarker.getLatLng();
    const isInitialLocation = currentLatLng.lat === 0 && currentLatLng.lng === 0;

    // With markerCluster, the marker position may be different than the position in the data!
    const dataLatLng = L.latLng(data.lat, data.lon);

    const distance = isInitialLocation ? -1 : dataLatLng.distanceTo(currentLatLng);
    const bearing = getBearing(currentLatLng, dataLatLng);

    const solverCode = getSolverCode(data.name); // or: marker.waypointName
    const solverCodeInHtml = getSolverCodeInHtml(solverCode);
    let infoContent = prepareInfoContent(data, solverCodeInHtml, distance, bearing);

    const popupContent = preparePopupContent(data, solverCodeInHtml, distance, bearing);

    popup
        .setLatLng(marker.getLatLng()) // use actual marker position for the popup position
        .setContent(popupContent);

    if (solverCode) {
        const variables: Record<string, string | number> = {};
        const text = parseSolverCode(solverCode, variables);
        infoContent += `<br>Solver Result:<br>`;
        if (text) {
            infoContent += text.replace(/\n/g, '<br>\n');;
        }
        const solverPoints = Object.entries(variables).filter(([key]) => key.startsWith("$"));
        const solverMarkersData = prepareSolverMarkersData(solverPoints);
        renderSolverMarkers(solverMarkersData);
        setPolyline(solverMarkersData);
    }

    setWaypointInfoHtml(infoContent);
}

function selectSolverMarker(marker: MarkerType): void {
    // no not set selectedMarker, keep it
    const data = solverDataMap[marker.waypointName];
    if (!data) {
        console.error("selectSolverMarker: data not found for marker ", marker.waypointName);
        solverPopup
            .setLatLng(marker.getLatLng()) // use actual marker position for the popup position
            .setContent(`<strong>${marker.waypointName}</strong><br><span style="color: red">Data not found!</span>`);
        return;
    }

    const currentLatLng = locationMarker.getLatLng();
    const isInitialLocation = currentLatLng.lat === 0 && currentLatLng.lng === 0;

    // With markerCluster, the marker position may be different than the position in the data!
    const dataLatLng = L.latLng(data.lat, data.lon);
    const distance = isInitialLocation ? -1 : dataLatLng.distanceTo(currentLatLng);
    const bearing = getBearing(currentLatLng, dataLatLng);

    const popupContent = preparePopupContent(data, '', distance, bearing);

    solverPopup
        .setLatLng(marker.getLatLng()) // use actual marker position for the popup position
        .setContent(popupContent);
}

function clearSolverLayers(): void {
    if (map.hasLayer(solverGroup)) {
        clearMarkersFromGroup(solverGroup);
        map.removeLayer(solverGroup);
        polylineGroup.clearLayers();
    }
}

function onWaypointGroupClick(e: L.LeafletMouseEvent): void {
    clearSolverLayers();
    const marker = e.propagatedFrom as MarkerType;
    selectMarker(marker);
}

function onSolverGroupClick(e: L.LeafletMouseEvent): void {
    const marker = e.propagatedFrom as MarkerType;
    selectSolverMarker(marker);
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
                console.error(`File ${name}:`, errorMsg);
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
        let solverCode = '';
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

            // Extract solverCode from cacheInfo if present
            const match = cacheInfo.match(/<details><summary>Solver<\/summary><div class="gc_solver">(.+?)<\/div><\/details>/s);
            if (match && match[1]) {
                solverCode = match[1].replace(/<br\/?>(\n)?/g, '\n').trim();
                const index = match.index || -1;
                if (index >= 0) {
                    cacheInfo = cacheInfo.substring(0, index); // strip solverCode
                }
            }
        }
        if (name in waypointDataMap) {
            overwritten += 1;
        }
        waypointDataMap[name] = { name, lat, lon, type, desc, cacheInfo, solverCode };
    }
    const overwrittenStr = overwritten ? ` (overwritten: ${overwritten})` : '';
    return `Processed file ${name} with ${wpts.length} waypoints${overwrittenStr}.`;
}

// Handle file upload (or file drop on map)
async function onFileInputChange(event: Event): Promise<void> {
    let infoHtml = '';
    setWaypointInfoHtml(infoHtml);

    setButtonDisabled('editButton', true);
    // TODO: save if something was changed?
    setButtonDisabled('saveButton', true);

    if (popup.isOpen()) {
        popup.close();
    }
    if (solverPopup.isOpen()) {
        solverPopup.close();
    }
    const startTime = Date.now();

    // dataTransfer for drag&drop (with event.type="drop"), target.files for file input 
    const dataTransfer = (event as DragEvent).dataTransfer;
    const files = dataTransfer ? dataTransfer.files : (event.target as HTMLInputElement).files;
    const inputElement = !dataTransfer ? (event.target as HTMLInputElement) : null;

    if (!files || files.length === 0) {
        return;
    }

    deleteAllItems(waypointDataMap); // Reset waypoint data map
    deleteAllItems(solverDataMap); // Reset solver data map
    clearSolverLayers();
    filterWaypoints("");

    if (inputElement) {
        inputElement.style.color = '';
    }

    for (const file of files) {
        try {
            if (file.type === 'application/x-zip-compressed' || file.type === 'application/zip') {
                // on Mac OS it is "application/zip"
                const arrayBuffer = await file.arrayBuffer();
                const messages = processZipFile(new Uint8Array(arrayBuffer), file.name);
                infoHtml += messages.map((message) => `<span>${message}</span><br>\n`).join('');
            } else {
                let fileName = file.name;
                let text = await file.text();
                if (file.type === 'text/javascript' || file.type === 'application/x-javascript') { // FireFox and Safari use 'application/x-javascript'
                    // We expect somewhere in the .js file: GPXmap.addItem("<filename>", `<content>`), maybe spanning multiple lines. Filename can also have extension, e.g. file.zip.b64
                    const result = /GPXmap\.addItem\("([^"]+)", `\s*([^`]*)`\)/.exec(text);
                    if (result) {
                        // Note: Since we cannot get the full path, it does  not make sense to set updateConfigParameter("file", fileName)
                        const itemFileName = result[1];
                        text = result[2];
                        addItem(itemFileName, text);
                    } else {
                        throw new Error("onFileInputChange: GPXmap.addItem not found in JS file " + fileName);
                    }
                } else {
                    if (fileName.endsWith('.b64')) { // assuming Basic64 encoding
                        text = atob(text);
                        fileName = fileName.slice(0, -4); // Remove .b64 suffix
                    }
                    if (fileName.endsWith('.zip')) {
                        const binaryData = new Uint8Array(text.split('').map(c => c.charCodeAt(0)));
                        const messages = processZipFile(binaryData, fileName);
                        infoHtml += messages.map((message) => `<span>${message}</span><br>\n`).join('');
                    } else { //if (fileName.endsWith('.gpx')) {
                        // Process GPX file
                        const message = parseGpxFile(text, fileName);
                        infoHtml += `<span>${message}</span><br>\n`;
                    }
                }
            }
        } catch (e) {
            const errorMsg = e instanceof Error ? e.message : String(e);
            console.error(errorMsg);
            infoHtml += `<span style="color: red">${errorMsg}</span><br>\n`;
            if (inputElement) {
                inputElement.style.color = 'red';
            }
        }
    }
    setWaypointInfoHtml(getWaypointInfoHtml() + infoHtml); // add info (in debuggung mode there could be already some output)

    const waypointSearch = document.getElementById('waypointSearch') as HTMLInputElement;
    filterWaypoints(waypointSearch.value);

    const endTime = Date.now();
    console.log(`Processed in ${endTime - startTime} ms`);
}


function onEditButtonClick() {
    if (!selectedMarker) {
        console.error("No marker selected.");
        return;
    }
    const key = selectedMarker.waypointName;
    const code = getSolverCode(key);
    const waypointInfo = document.getElementById('waypointInfo') as HTMLDivElement;
    waypointInfo.innerText = code || '';
    waypointInfo.setAttribute('contenteditable', "true");
    setButtonDisabled('editButton', true);
    setButtonDisabled('saveButton', false);
    setButtonDisabled('cancelButton', false);
    // no cancel?
}

function onSaveButtonClick() {
    if (!selectedMarker) {
        console.error("No marker selected.");
        return;
    }
    const waypointInfo = document.getElementById('waypointInfo') as HTMLDivElement;
    waypointInfo.setAttribute('contenteditable', "false");

    const solverCodeEdited = waypointInfo.innerText.trim(); // to be sure, we want text only
    const key = selectedMarker.waypointName;
    const data = waypointDataMap[key];
    if (data) {
        if (solverCodeEdited) {
            data.solverCodeEdited = solverCodeEdited; // update in memory
            putWaypointAndSolverIntoLocalStorage(key, data);
        } else {
            delete data.solverCodeEdited; // remove from memory
            removeKeyFromLocalStorage(key);
        }
    }
    selectMarker(selectedMarker);
    setButtonDisabled('editButton', false);
    setButtonDisabled('cancelButton', true);
}

function onCancelButtonClick() {
    if (!selectedMarker) {
        console.error("No marker selected.");
        return;
    }
    const waypointInfo = document.getElementById('waypointInfo') as HTMLDivElement;
    waypointInfo.setAttribute('contenteditable', "false");
    selectMarker(selectedMarker);
    setButtonDisabled('editButton', false);
    setButtonDisabled('cancelButton', true);
}

function onMapDragover(ev: DragEvent) {
    ev.stopPropagation();
    ev.preventDefault();
    if (ev.dataTransfer !== null) {
        ev.dataTransfer.dropEffect = "copy"; // explicitly show this is a copy
    }
}

function getMarkerFromPopup(popup: L.Popup) {
    return (popup as L.Popup & { _source: MarkerType })._source; // fast hack
}


function onWaypointSearchInput(event: Event): void {
    const waypointSearchInput = event.target as HTMLInputElement;
    filterWaypoints(waypointSearchInput.value);
    asyncDelay(() => {
        updateConfigParameter("search", waypointSearchInput.value);
    }, 1500);
}


function onWwaypointSearchClearClick(): void {
    const waypointSearch = document.getElementById('waypointSearch') as HTMLInputElement;
    waypointSearch.value = '';
    waypointSearch.dispatchEvent(new Event("input"));
}


function onKeepViewInputChange(event: Event): void {
    const keepViewInput = event.target as HTMLInputElement;
    updateConfigParameter("keepView", keepViewInput.checked);
}

// *** start location service

function locationShowPosition(position: GeolocationPosition) {
    const latitude = position.coords.latitude;
    const longitude = position.coords.longitude;
    const oldLocation = locationMarker.getLatLng();
    const isInitialLocation = oldLocation.lat === 0 && oldLocation.lng === 0;
    const dmm = position2dmm(latitude, longitude);
    locationMarker.setLatLng([latitude, longitude]);
    locationMarker.getPopup()?.setContent(`You are here!<br>${dmm}`);

    if (isInitialLocation) {
        const keepView = document.getElementById('keepViewInput') as HTMLInputElement;
        if (!keepView.checked) {
            const zoom = map.getZoom() > 12 ? map.getZoom() : 12;
            map.setView([latitude, longitude], zoom);
        }
        locationMarker.addTo(map);
    }

    if (popup.isOpen()) {
        const marker = getMarkerFromPopup(popup);
        const data = waypointDataMap[marker.waypointName];
        const currentLatLng = locationMarker.getLatLng();

        // With markerCluster, the marker position may be different than the position in the data!
        const dataLatLng = L.latLng(data.lat, data.lon);
        const distance = dataLatLng.distanceTo(currentLatLng);
        const bearing = getBearing(currentLatLng, dataLatLng);

        const popupContent = preparePopupContent(data, '', distance, bearing);
        popup.setContent(popupContent);
    }
    // TODO: update also waypoint info?
}

function locationHandleError(error: GeolocationPositionError) {
    switch (error.code) {
        case error.PERMISSION_DENIED:
            console.error("User denied the request for Geolocation.");
            break;
        case error.POSITION_UNAVAILABLE:
            console.error("Location information is unavailable.");
            break;
        case error.TIMEOUT:
            console.error("The request to get user location timed out.");
            break;
        default:
            console.error("An unknown error occurred.");
            break;
    }
}

let locationWatchId: number;
const locationMarker = L.marker([0, 0], { icon: getIcon('Location') });
const locationPopup = L.popup();

function onShowLocationInputChange(event: Event): void {
    const showLocationInput = event.target as HTMLInputElement;
    updateConfigParameter("showLocation", showLocationInput.checked);

    if (!("geolocation" in navigator)) {
        console.warn("Geolocation is not supported by this browser.");
        return
    }

    if (showLocationInput.checked) {
        locationWatchId = navigator.geolocation.watchPosition(
            (position) => locationShowPosition(position),
            locationHandleError,
            { enableHighAccuracy: true }
        );
    } else {
        navigator.geolocation.clearWatch(locationWatchId);
        locationWatchId = 0;
        locationMarker.remove();
        locationMarker.setLatLng([0, 0]);
        if (popup.isOpen()) { // remove distance from popup...
            const marker = getMarkerFromPopup(popup);
            const data = waypointDataMap[marker.waypointName];
            const popupContent = preparePopupContent(data, '', -1, -1); // no distance and bearing
            popup.setContent(popupContent);
        }
    }
}

// *** end location service

function addItem(key: string, input: string): void {
    input = input.replace(/^\n/, "").replace(/\n$/, ""); // remove preceding and trailing newlines

    if (!key) { // maybe ""
        console.warn("addItem: no key!");
        key = "unknown";
    }

    const fileInput = document.getElementById('fileInput') as HTMLInputElement;

    // see also: https://pqina.nl/blog/set-value-to-file-input/
    const type = key.endsWith('.zip') ? 'application/zip' : 'text/plain';
    //key.endsWith('.gpx') ? 'application/gpx+xml' : 'text/plain';
    const myFile = new File([input], key, {
        type, //'text/plain',
        lastModified: Date.now()
    });

    const dataTransfer = new DataTransfer();
    dataTransfer.items.add(myFile);
    fileInput.files = dataTransfer.files;
    fileInput.dispatchEvent(new Event("change"));
};

async function loadScriptOrStyle(script: HTMLScriptElement | HTMLLinkElement): Promise<string> {
    return new Promise((resolve, reject) => {
        const onScriptLoad = function (event: Event) {
            const type = event.type; // "load" or "error"
            const node = event.currentTarget as HTMLScriptElement | HTMLLinkElement;
            const key = node.getAttribute("data-key") as string;

            node.removeEventListener("load", onScriptLoad, false);
            node.removeEventListener("error", onScriptLoad, false);

            if (type === "load") {
                resolve(key);
            } else {
                reject(new Error(`Loading failed for ${key}`));
            }
        };
        script.addEventListener("load", onScriptLoad, false);
        script.addEventListener("error", onScriptLoad, false);
        document.getElementsByTagName("head")[0].appendChild(script);
    });
}

async function loadScript(url: string, key: string): Promise<string> {
    const script = document.createElement("script");

    script.type = "text/javascript";
    script.async = true;
    script.src = url;

    script.setAttribute("data-key", key);

    return loadScriptOrStyle(script);
}

// *** start args

function fnDecodeUri(s: string): string {
    let decoded = "";

    try {
        decoded = decodeURIComponent(s.replace(/\+/g, " "));
    } catch (e) {
        if (e instanceof Error) {
            e.message += ": " + s;
        }
        console.error(e);
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

function debugRedirectConsoleToWaypointInfo() {
    const waypointInfo = document.getElementById('waypointInfo') as HTMLDivElement;
    const colors: Record<string, string> = {
        error: 'red',
        warn: 'orange',
        log: 'gray',
        debug: 'blue'
    };

    (['error', 'warn', 'log', 'debug'] as const).forEach(method => {
        const orig = console[method];
        console[method] = (...args: unknown[]) => {
            orig(...args);
            waypointInfo.innerHTML += `<span style="color:${colors[method]}">${args.join(' ')}</span><br>`;
        };
    });
    console.log("console messages will be redirected.");
}

// *** end args

function main(): void {
    const args = parseUri(config);
    parseArgs(args, config);

    if (config.debug >= 10) {
        debugRedirectConsoleToWaypointInfo();
    }

    map.setView([0, 0], 2);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '© OpenStreetMap'
    }).addTo(map);

    waypointGroup.on('click', onWaypointGroupClick);
    waypointGroup.bindPopup(popup);

    solverGroup.on('click', onSolverGroupClick);
    solverGroup.bindPopup(solverPopup);

    const fileInput = document.getElementById('fileInput') as HTMLInputElement;
    fileInput.addEventListener('change', (e: Event) => void onFileInputChange(e));

    const mapElement = document.getElementById('map') as HTMLDivElement;
    mapElement.addEventListener("dragover", onMapDragover, false);
    mapElement.addEventListener("drop", (ev: Event) => {
        ev.stopPropagation();
        ev.preventDefault(); // required for FireFox
        void onFileInputChange(ev);
        fileInput.style.color = 'lightgrey'; // outdated
    }, false); // onMapDrop

    const waypointSearch = document.getElementById('waypointSearch') as HTMLInputElement;
    waypointSearch.addEventListener('input', debounce((e) => {
        onWaypointSearchInput(e);
    }, 400));

    const waypointSearchClear = document.getElementById('waypointSearchClear') as HTMLButtonElement;
    waypointSearchClear.addEventListener('click', onWwaypointSearchClearClick);

    const keepViewInput = document.getElementById('keepViewInput') as HTMLInputElement;
    keepViewInput.addEventListener('change', onKeepViewInputChange);

    const showLocationInput = document.getElementById('showLocationInput') as HTMLInputElement;
    showLocationInput.addEventListener('change', onShowLocationInputChange);

    locationMarker.bindPopup(locationPopup);

    window.GPXmap = {
        addItem: (key: string, input: string) => {
            addItem(key, input);
        }
    };

    const editButton = document.getElementById('editButton') as HTMLButtonElement;
    editButton.addEventListener('click', onEditButtonClick);

    const saveButton = document.getElementById('saveButton') as HTMLButtonElement;
    saveButton.addEventListener('click', onSaveButtonClick);

    const cancelButton = document.getElementById('cancelButton') as HTMLButtonElement;
    cancelButton.addEventListener('click', onCancelButtonClick);

    polylineGroup.addTo(map);

    // Sync UI state with config
    syncInputState("keepViewInput", config.keepView);
    syncInputState("showLocationInput", config.showLocation);

    asyncDelay(() => {
        if (waypointSearch.value !== config.search) {
            waypointSearch.value = config.search;
            waypointSearch.dispatchEvent(new Event("input"));
        }
        if (config.file) {
            const scriptName = config.file;
            const key = config.file;
            loadScript(scriptName, key).catch((e) => { console.error(e) });
        } else {
            loadWaypointsFromLocalStorage();
            filterWaypoints(waypointSearch.value);
        }
    }, 10);
}

window.onload = () => {
    main();
}
