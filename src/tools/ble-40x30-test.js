#!/usr/bin/env node
/**
 * Test for 40x30mm labels
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
  await delay(20);
}

async function printLabel(widthBytes, heightLines, description) {
  console.log(`\n${description}`);
  console.log(`Size: ${widthBytes} bytes x ${heightLines} lines`);

  const data = new Uint8Array(widthBytes * heightLines);

  // Create a clear border pattern
  for (let y = 0; y < heightLines; y++) {
    for (let x = 0; x < widthBytes; x++) {
      // Border
      if (y < 3 || y >= heightLines - 3 || x < 3 || x >= widthBytes - 3) {
        data[y * widthBytes + x] = 0xFF;
      }
      // X pattern (diagonals)
      else if (Math.abs((y / heightLines) - (x / widthBytes)) < 0.05 ||
               Math.abs((y / heightLines) - (1 - x / widthBytes)) < 0.05) {
        data[y * widthBytes + x] = 0xFF;
      }
      else {
        data[y * widthBytes + x] = 0x00;
      }
    }
  }

  // Init
  await send([0x1b, 0x40]);
  await delay(200);

  // Send raster
  await send([
    0x1d, 0x76, 0x30, 0x00,
    widthBytes, 0x00,
    heightLines & 0xFF, (heightLines >> 8) & 0xFF
  ]);

  for (let i = 0; i < data.length; i += 128) {
    await send(data.slice(i, Math.min(i + 128, data.length)));
  }

  await delay(300);
  await send([0x1b, 0x4a, 0x20]);
  await delay(1000);

  console.log('✓ Sent');
}

async function main() {
  const device = await connect();
  try {
    // 40x30mm at 8 pixels/mm:
    // Width = 40mm = 320 pixels = 40 bytes (we use 72 to cover full print head)
    // Height = 30mm = 240 pixels

    await printLabel(72, 200, 'TEST 1: 72 x 200 lines (25mm)');
    await delay(2000);

    await printLabel(72, 240, 'TEST 2: 72 x 240 lines (30mm)');
    await delay(2000);

    await printLabel(72, 180, 'TEST 3: 72 x 180 lines (22.5mm)');
    await delay(1000);

    console.log('\n' + '='.repeat(50));
    console.log('Which test fits on ONE label with an X pattern?');
    console.log('='.repeat(50));

  } finally {
    console.log('\nDisconnecting...');
    await device.disconnectAsync();
  }
}

main().catch(console.error).finally(() => process.exit(0));
