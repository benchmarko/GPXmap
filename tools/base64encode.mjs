// base64encode.mjs
import fs from 'fs';
import path from 'path';

// Usage: node base64encode.mjs <inputfile>
if (process.argv.length < 3) {
  console.error('Usage: node base64encode.mjs <inputfile>');
  process.exit(1);
}

const inputFile = process.argv[2];
const filename = path.basename(inputFile);
const buffer = fs.readFileSync(inputFile);
const base64 = buffer.toString('base64');

const prefix = `
/* globals cpcBasic */

"use strict";

GPXmap.addItem("${filename}.b64", \`\n`;

const suffix = '\`);\n';

const outputFile = `${inputFile}.b64.js`;
fs.writeFileSync(outputFile, prefix + base64 + suffix);

// node base64encode.mjs file.zip
// => will create file.zip.b64.js with the base64-encoded content
// => and the prefix and suffix to be used in GPXmap
