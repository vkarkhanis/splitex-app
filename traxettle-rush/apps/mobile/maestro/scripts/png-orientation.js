#!/usr/bin/env node
/* eslint-disable no-console */
// Maestro's iOS screenshots in landscape keep the screen's portrait pixels and add an EXIF
// orientation tag (an eXIf chunk, and the same in XMP) that tells viewers to turn them. Store
// screenshots need upright pixels, so capture-screenshots.sh calls this, then turns the pixels
// with `sips -r`.
//
//   node png-orientation.js <file.png>
//
// Prints the EXIF orientation (1 = upright, 3 = 180°, 6 = turn 90° clockwise, 8 = turn 90°
// anticlockwise; 1 when there's no tag) and rewrites the file without its eXIf chunk and XMP text, so
// nothing turns it a second time. The image data is untouched.
const fs = require('fs');

const file = process.argv[2];
if (!file) {
  console.error('usage: png-orientation.js <file.png>');
  process.exit(2);
}
const buf = fs.readFileSync(file);
if (buf.subarray(0, 8).toString('binary') !== '\x89PNG\r\n\x1a\n') {
  console.error(`${file} isn't a PNG`);
  process.exit(1);
}

function exifOrientation(d) {
  const le = d.subarray(0, 2).toString('binary') === 'II';
  const u16 = (o) => (le ? d.readUInt16LE(o) : d.readUInt16BE(o));
  const u32 = (o) => (le ? d.readUInt32LE(o) : d.readUInt32BE(o));
  const ifd = u32(4);
  const count = u16(ifd);
  for (let k = 0; k < count; k += 1) {
    const at = ifd + 2 + 12 * k;
    if (u16(at) === 0x0112) return u16(at + 8);
  }
  return 1;
}

let orientation = 1;
const kept = [buf.subarray(0, 8)];
for (let i = 8; i < buf.length; ) {
  const len = buf.readUInt32BE(i);
  const type = buf.subarray(i + 4, i + 8).toString('binary');
  const chunk = buf.subarray(i, i + 12 + len);
  const data = buf.subarray(i + 8, i + 8 + len);
  if (type === 'eXIf') {
    orientation = exifOrientation(data);
  } else if (type === 'iTXt' && data.subarray(0, 17).toString('binary') === 'XML:com.adobe.xmp') {
    // XMP repeats the orientation (tiff:Orientation): drop it too.
  } else {
    kept.push(chunk);
  }
  i += 12 + len;
}
fs.writeFileSync(file, Buffer.concat(kept));
console.log(orientation);
