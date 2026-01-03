#!/usr/bin/env node
/**
 * Tiny test - should fit on any label
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
    if (name.toLowerCase().includes('m260') && !device) {
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
  await delay(30);
}

async function printTiny() {
  console.log('Printing TINY test: 10x10mm square (should fit on any label)\n');

  // 10mm x 10mm at 8 pixels/mm = 80x80 pixels
  // 80 pixels = 10 bytes width
  const widthBytes = 10;
  const heightLines = 80;

  // Create a simple filled square
  const data = new Uint8Array(widthBytes * heightLines);
  data.fill(0xFF); // All black

  console.log(`Size: ${widthBytes} bytes (${widthBytes * 8} pixels) x ${heightLines} lines`);
  console.log('Pattern: Solid black square\n');

  // Init
  await send([0x1b, 0x40]);
  await delay(200);

  // Raster header
  const header = [
    0x1d, 0x76, 0x30, 0x00,
    widthBytes, 0x00,
    heightLines, 0x00
  ];
  await send(header);

  // Send data
  for (let i = 0; i < data.length; i += 128) {
    await send(data.slice(i, Math.min(i + 128, data.length)));
  }

  await delay(300);

  // Feed
  await send([0x1b, 0x4a, 0x20]);
  await delay(500);

  console.log('✓ Sent!\n');
  console.log('You should see a small black square (about 10x10mm).');
  console.log('Where does it appear on the label?');
}

async function main() {
  const device = await connect();
  try {
    await printTiny();
    await delay(1000);
  } finally {
    console.log('\nDisconnecting...');
    await device.disconnectAsync();
  }
}

main().catch(console.error).finally(() => process.exit(0));
