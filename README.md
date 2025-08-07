# GPX Map Viewer

This is a Vite-based TypeScript web app that allows users to upload a GPX file and displays its waypoints as markers on an interactive Leaflet map.

## Features

- Upload a GPX file (GPX/XML format) or a ZIP file conaining GPX file(s)
- Parse and display waypoints on a Leaflet map
- Show current location
- Modern, user-friendly interface

## Links

- [GPXmap on Github](https://benchmarko.github.io/GPXmap/)
- [GPXmap on Github, starting with gc0001.gpx.js](https://benchmarko.github.io/GPXmap//?file=examples/gc0001.gpx.js)

## Getting Started (local installation)

1. Install dependencies:

   ```sh
   npm install
   ```

2. Start the development server:

   ```sh
   npm run dev
   ```

3. Open your browser at the provided local address.

## Tech Stack

- [Vite](https://vitejs.dev/) (TypeScript)
- [Leaflet](https://leafletjs.com/)
- [TypeScript](https://www.typescriptlang.org/)

## Tools: Encoding Files for GPXmap

You can convert ZIP compresses GPX files to special encoded formats for use with GPXmap using the script in the `tools/` directory:

### Base64 (MIME)

Convert a file to MIME Base64 and wrap it for use in GPXmap:

```sh
node tools/base64encode.mjs <inputfile>
```

This creates `<inputfile>.b64.js` containing the Base64-encoded data and a wrapper for `GPXmap.addItem`.

The script output file can be loaded by GPXmap for testing or demo purposee, using the file URL parameter.

## Done

- [x] Add file upload UI
- [x] Parse GPX and extract waypoints
- [x] Display waypoints on Leaflet map

## Other Links

- [Setting up a modern typescript project with Vite](https://medium.com/@robinviktorsson/setting-up-a-modern-typescript-project-with-vite-no-framework-07ea2d3a22b5)

- [GPS Visualizer: Generating a map from a GPX file, dynamically; barrett_spur.gpx](https://www.gpsvisualizer.com/examples/leaflet_gpx.php)
- [GPS Visualizer: Dynamic data](https://www.gpsvisualizer.com/map_input?form=leaflet#highlight=dynamic_data)
