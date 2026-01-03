#!/usr/bin/env node
/**
 * Full width test - use all 72 bytes to see label mapping
 */

import noble from '@abandonware/noble';

let writeChar = null;

async function connect() {
  console.log('Connecting to M260...');

  await new Promise((resolve) => {
    if (noble.state === 'poweredOn') resolve();
    else noble.once('stateChange', (state) => { if (state === 'poweredOn') resolve(); });
  });

  let device = null;
  noble.on('discover', (p) => {
    const name = p.advertisement.localName || '';
    if (name.toLowerCase().includes('m260') && !device) device = p;
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
  await delay(30);
}

async function printFullWidth() {
  // Full printer width: 72 bytes = 576 pixels
  // Create a pattern that shows position markers
  const widthBytes = 72;
  const heightLines = 100;

  console.log('Printing FULL WIDTH test pattern');
  console.log(`Size: ${widthBytes} bytes (${widthBytes * 8} pixels) x ${heightLines} lines\n`);

  const data = new Uint8Array(widthBytes * heightLines);

  for (let y = 0; y < heightLines; y++) {
    for (let x = 0; x < widthBytes; x++) {
      // Create distinct sections to identify positioning:
      // Left third: vertical stripes
      // Middle third: solid black
      // Right third: horizontal lines every 10 rows

      if (x < 24) {
        // Left third: vertical stripes (alternating bytes)
        data[y * widthBytes + x] = (x % 2 === 0) ? 0xFF : 0x00;
      } else if (x < 48) {
        // Middle third: solid black
        data[y * widthBytes + x] = 0xFF;
      } else {
        // Right third: horizontal lines
        data[y * widthBytes + x] = (y % 10 < 3) ? 0xFF : 0x00;
      }
    }
  }

  // Also add borders
  for (let y = 0; y < heightLines; y++) {
    data[y * widthBytes] = 0xFF; // Left edge
    data[y * widthBytes + widthBytes - 1] = 0xFF; // Right edge
  }
  for (let x = 0; x < widthBytes; x++) {
    data[x] = 0xFF; // Top edge
    data[(heightLines - 1) * widthBytes + x] = 0xFF; // Bottom edge
  }

  // Init
  await send([0x1b, 0x40]);
  await delay(200);

  // Raster header
  await send([
    0x1d, 0x76, 0x30, 0x00,
    widthBytes, 0x00,
    heightLines, 0x00
  ]);

  // Data
  for (let i = 0; i < data.length; i += 128) {
    await send(data.slice(i, Math.min(i + 128, data.length)));
  }

  await delay(300);
  await send([0x1b, 0x4a, 0x40]); // Feed
  await delay(500);

  console.log('✓ Sent!\n');
  console.log('The pattern has 3 sections:');
  console.log('  LEFT:   Vertical stripes');
  console.log('  MIDDLE: Solid black');
  console.log('  RIGHT:  Horizontal lines');
  console.log('\nWhich section(s) appear on your label?');
  console.log('This tells us where the label sits relative to the print head.');
}

async function main() {
  const device = await connect();
  try {
    await printFullWidth();
    await delay(1000);
  } finally {
    console.log('\nDisconnecting...');
    await device.disconnectAsync();
  }
}

main().catch(console.error).finally(() => process.exit(0));
