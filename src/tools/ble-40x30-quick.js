#!/usr/bin/env node
/**
 * Quick 40x30mm label test - 240 lines height
 */

const noble = require('@abandonware/noble');

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

async function printTestPattern(widthBytes, heightLines) {
  console.log(`Printing: ${widthBytes} bytes x ${heightLines} lines`);
  console.log(`(40mm x 30mm label)\n`);

  const data = new Uint8Array(widthBytes * heightLines);

  // Create test pattern: border + X + corner markers
  for (let y = 0; y < heightLines; y++) {
    for (let x = 0; x < widthBytes; x++) {
      // Border (3 bytes thick)
      if (y < 3 || y >= heightLines - 3 || x < 3 || x >= widthBytes - 3) {
        data[y * widthBytes + x] = 0xFF;
      }
      // X diagonals
      else if (Math.abs((y / heightLines) - (x / widthBytes)) < 0.04 ||
               Math.abs((y / heightLines) - (1 - x / widthBytes)) < 0.04) {
        data[y * widthBytes + x] = 0xFF;
      }
      // Center crosshair
      else if ((Math.abs(y - heightLines/2) < 2) || (Math.abs(x - widthBytes/2) < 2)) {
        data[y * widthBytes + x] = 0xFF;
      }
      else {
        data[y * widthBytes + x] = 0x00;
      }
    }
  }

  // Init printer
  await send([0x1b, 0x40]);
  await delay(200);

  // Raster command
  await send([
    0x1d, 0x76, 0x30, 0x00,
    widthBytes, 0x00,
    heightLines & 0xFF, (heightLines >> 8) & 0xFF
  ]);

  // Send data in chunks
  for (let i = 0; i < data.length; i += 128) {
    await send(data.slice(i, Math.min(i + 128, data.length)));
  }

  // Feed
  await delay(300);
  await send([0x1b, 0x4a, 0x20]);
  await delay(800);

  console.log('✓ Done');
}

async function main() {
  const device = await connect();
  try {
    // 40x30mm: 72 bytes width (full head), 240 lines height
    await printTestPattern(72, 240);
  } finally {
    console.log('\nDisconnecting...');
    await device.disconnectAsync();
  }
}

main().catch(console.error).finally(() => process.exit(0));
