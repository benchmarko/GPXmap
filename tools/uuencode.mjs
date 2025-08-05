// uuencode.mjs - TODO (unused, but kept for reference)
//const fs = require('fs');
//const path = require('path');
import fs from 'fs';
import path from 'path';

function uuencode(buffer, filename) {
  let result = [];
  result.push(`begin 644 ${filename}`);

  for (let i = 0; i < buffer.length; i += 45) {
    const chunk = buffer.slice(i, i + 45);
    result.push(encodeLine(chunk));
  }

  result.push('`');
  result.push('end');
  return result.join('\n');
}

function encodeLine(chunk) {
  let line = String.fromCharCode(32 + chunk.length);
  for (let i = 0; i < chunk.length; i += 3) {
    let a = chunk[i];
    let b = chunk[i + 1] || 0;
    let c = chunk[i + 2] || 0;
    let n = (a << 16) | (b << 8) | c;
    for (let j = 18; j >= 0; j -= 6) {
      let v = (n >> j) & 0x3f;
      line += String.fromCharCode(32 + (v ? v : 0));
    }
  }
  return line;
}

// Usage: node uuencode.js <inputfile>
if (process.argv.length < 3) {
  console.error('Usage: node uuencode.js <inputfile>');
  process.exit(1);
}

const inputFile = process.argv[2];
const filename = path.basename(inputFile);
const buffer = fs.readFileSync(inputFile);
const uuencoded = uuencode(buffer, filename);

const prefix = `
/* globals cpcBasic */

"use strict";

GPXmap.addItem("${filename}.uu", \`\n`;

const suffix = '\`);\n';

const outputFile = `${inputFile}.uu.js`;
fs.writeFileSync(outputFile, prefix + uuencoded.replaceAll('`', '\\`') + suffix);

//console.log(prefix + uuencoded + '\\`);`;

// node uuencode.js file.zip
// => will create file.zip.uu.js with the uuencoded content
// => and the prefix and suffix to be used in GPXmap
//