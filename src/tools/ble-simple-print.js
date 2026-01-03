#!/usr/bin/env node
/**
 * Simple BLE print test - minimal working sequence
 */

import noble from '@abandonware/noble';

let writeChar = null;

async function connect() {
  console.log('Connecting to M260...');

  await new Promise((resolve, reject) => {
    if (noble.state === 'poweredOn') resolve();
    else noble.once('stateChange', (state) => {
      if (state === 'poweredOn') resolve();
      else reject(new Error(`Bluetooth: ${state}`));
    });
  });

  let device = null;
  noble.on('discover', (p) => {
    const name = p.advertisement.localName || '';
    if (name.toLowerCase().includes('m260') && !device) {
      device = p;
      console.log(`Found: ${name}`);
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
      c.on('data', (d) => console.log(`  Response: ${d.toString('hex')}`));
      await c.subscribeAsync();
    }
  }

  return device;
}

function delay(ms) {
  return new Promise(r => setTimeout(r, ms));
}

async function send(data, desc) {
  console.log(`📤 ${desc}`);
  await writeChar.writeAsync(Buffer.from(data), true);
  await delay(100);
}

async function simplePrint() {
  console.log('='.repeat(50));
  console.log('Simple print test - small pattern on one label');
  console.log('='.repeat(50));

  // Init
  await send([0x1b, 0x40], 'Initialize');
  await delay(200);

  // Label width: 40mm = 320 pixels = 40 bytes
  // Label height: 12mm = 96 pixels
  // But printer is 72 bytes wide (576 pixels)
  // So we'll print a 40-byte wide image centered

  const imageWidth = 40;  // 40 bytes = 320 pixels
  const imageHeight = 50; // 50 lines - a small square

  // Build a simple pattern: border rectangle
  const data = [];
  for (let y = 0; y < imageHeight; y++) {
    for (let x = 0; x < imageWidth; x++) {
      if (y === 0 || y === imageHeight - 1 || x === 0 || x === imageWidth - 1) {
        // Border - black
        data.push(0xFF);
      } else if (y === Math.floor(imageHeight / 2)) {
        // Middle line
        data.push(0xAA);
      } else {
        // Inside - white
        data.push(0x00);
      }
    }
  }

  console.log(`\nSending ${imageWidth}x${imageHeight} image (${data.length} bytes)`);

  // Raster command
  const header = [
    0x1d, 0x76, 0x30, 0x00,
    imageWidth & 0xFF, (imageWidth >> 8) & 0xFF,
    imageHeight & 0xFF, (imageHeight >> 8) & 0xFF
  ];

  // Send header + data together
  await send([...header, ...data], 'Raster image');
  await delay(500);

  // Feed to advance past the printed area
  await send([0x1b, 0x4a, 100], 'Feed 100 dots');
  await delay(500);

  console.log('\n✓ Done! Check the printer for a small rectangle pattern.');
}

async function main() {
  const device = await connect();
  try {
    await simplePrint();
    await delay(1000);
  } finally {
    console.log('\nDisconnecting...');
    await device.disconnectAsync();
  }
}

main().catch(console.error).finally(() => process.exit(0));
