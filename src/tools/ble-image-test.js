#!/usr/bin/env node
/**
 * Test printing an actual image via BLE using the simple approach
 */

const noble = require('@abandonware/noble');
const sharp = require('sharp');

let writeChar = null;

async function connect() {
  console.log('Scanning for M260...');

  await new Promise((resolve) => {
    if (noble.state === 'poweredOn') resolve();
    else noble.once('stateChange', (state) => { if (state === 'poweredOn') resolve(); });
  });

  let device = null;
  noble.on('discover', (p) => {
    const name = p.advertisement.localName || '';
    if (name.toLowerCase().includes('m260') && !device) {
      console.log(`Found: ${name}`);
      device = p;
    }
  });

  await noble.startScanningAsync([], true);
  for (let i = 0; i < 10 && !device; i++) await delay(500);
  await noble.stopScanningAsync();

  if (!device) throw new Error('M260 not found');

  await device.connectAsync();
  console.log('Connected!\n');

  const services = await device.discoverServicesAsync(['ff00']);
  const chars = await services[0].discoverCharacteristicsAsync([]);

  for (const c of chars) {
    if (c.uuid === 'ff02') writeChar = c;
    if (c.uuid === 'ff03') {
      c.on('data', () => {});
      await c.subscribeAsync();
    }
  }

  return device;
}

function delay(ms) {
  return new Promise(r => setTimeout(r, ms));
}

async function send(data) {
  await writeChar.writeAsync(Buffer.from(data), true);
  await delay(20);
}

async function processImage(imagePath) {
  // 40x30mm label: 72 bytes width (full head), 240 lines height
  const widthBytes = 72;
  const heightLines = 240;
  const widthPixels = widthBytes * 8;  // 576 pixels

  console.log(`Processing image for ${widthBytes}x${heightLines} (${widthPixels}x${heightLines} pixels)`);

  // Load and process image
  const image = await sharp(imagePath)
    .resize({
      width: widthPixels,
      height: heightLines,
      fit: 'contain',
      background: { r: 255, g: 255, b: 255 }
    })
    .greyscale()
    .threshold(128)
    .raw()
    .toBuffer({ resolveWithObject: true });

  console.log(`Processed: ${image.info.width}x${image.info.height}`);

  // Convert to 1-bit raster
  const data = new Uint8Array(widthBytes * heightLines);

  for (let y = 0; y < heightLines; y++) {
    for (let byteX = 0; byteX < widthBytes; byteX++) {
      let byte = 0;
      for (let bit = 0; bit < 8; bit++) {
        const x = byteX * 8 + bit;
        if (x >= image.info.width) continue;

        const pixelPos = y * image.info.width + x;
        const pixelValue = image.data[pixelPos];

        // Black pixel (value < 128) = set bit to 1
        if (pixelValue < 128) {
          byte |= (1 << (7 - bit));
        }
      }
      data[y * widthBytes + byteX] = byte;
    }
  }

  return { data, widthBytes, heightLines };
}

async function printImage(imagePath) {
  const { data, widthBytes, heightLines } = await processImage(imagePath);

  console.log(`\nPrinting: ${widthBytes} bytes x ${heightLines} lines`);

  // Init - just the simple init command
  await send([0x1b, 0x40]);
  await delay(200);

  // Raster header - send separately
  await send([
    0x1d, 0x76, 0x30, 0x00,
    widthBytes, 0x00,
    heightLines & 0xFF, (heightLines >> 8) & 0xFF
  ]);

  // Send data in 128-byte chunks
  for (let i = 0; i < data.length; i += 128) {
    await send(data.slice(i, Math.min(i + 128, data.length)));
    if (i % 1280 === 0) {
      process.stdout.write(`\rSending: ${Math.round(i / data.length * 100)}%`);
    }
  }
  console.log('\rSending: 100%');

  // Feed
  await delay(300);
  await send([0x1b, 0x4a, 0x20]);
  await delay(800);

  console.log('✓ Done');
}

async function main() {
  const imagePath = process.argv[2] || 'test.png';
  console.log(`Image: ${imagePath}\n`);

  const device = await connect();
  try {
    await printImage(imagePath);
  } finally {
    console.log('\nDisconnecting...');
    await device.disconnectAsync();
  }
}

main().catch(console.error).finally(() => process.exit(0));
