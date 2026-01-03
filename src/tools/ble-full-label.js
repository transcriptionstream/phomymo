#!/usr/bin/env node
/**
 * Full label test - correct dimensions
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

async function printFullLabel() {
  // Based on testing:
  // - Width: 72 bytes works great
  // - Height: 100 lines = 1/3 label, so ~300 lines for full label
  // Let's try 280 lines (slightly under to leave margin)

  const widthBytes = 72;
  const heightLines = 280;

  console.log('Printing FULL LABEL test');
  console.log(`Size: ${widthBytes} bytes x ${heightLines} lines\n`);

  const data = new Uint8Array(widthBytes * heightLines);

  // Create a nice border with "HI" text pattern in center
  for (let y = 0; y < heightLines; y++) {
    for (let x = 0; x < widthBytes; x++) {
      // Border (3 bytes thick)
      if (y < 3 || y >= heightLines - 3 || x < 3 || x >= widthBytes - 3) {
        data[y * widthBytes + x] = 0xFF;
      }
      // Corner markers (small squares in each corner)
      else if ((y < 15 && x < 10) || (y < 15 && x >= widthBytes - 10) ||
               (y >= heightLines - 15 && x < 10) || (y >= heightLines - 15 && x >= widthBytes - 10)) {
        data[y * widthBytes + x] = 0xFF;
      }
      // Center cross
      else if ((y > heightLines/2 - 3 && y < heightLines/2 + 3 && x > 20 && x < widthBytes - 20) ||
               (x > widthBytes/2 - 2 && x < widthBytes/2 + 2 && y > 50 && y < heightLines - 50)) {
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

  // Send in chunks of 255 lines max (protocol limit)
  let linesSent = 0;
  while (linesSent < heightLines) {
    const chunkLines = Math.min(255, heightLines - linesSent);

    // Raster header for this chunk
    await send([
      0x1d, 0x76, 0x30, 0x00,
      widthBytes, 0x00,
      chunkLines & 0xFF, (chunkLines >> 8) & 0xFF
    ]);

    // Send this chunk's data
    const chunkStart = linesSent * widthBytes;
    const chunkEnd = (linesSent + chunkLines) * widthBytes;
    const chunkData = data.slice(chunkStart, chunkEnd);

    for (let i = 0; i < chunkData.length; i += 128) {
      await send(chunkData.slice(i, Math.min(i + 128, chunkData.length)));
    }

    linesSent += chunkLines;
    console.log(`  Sent ${linesSent}/${heightLines} lines`);
  }

  await delay(300);
  await send([0x1b, 0x4a, 0x30]); // Feed
  await delay(500);

  console.log('\n✓ Done!');
  console.log('\nYou should see:');
  console.log('  - Border around entire label');
  console.log('  - Small squares in each corner');
  console.log('  - Cross in the center');
  console.log('\nDoes it fill the whole label?');
}

async function main() {
  const device = await connect();
  try {
    await printFullLabel();
    await delay(1000);
  } finally {
    console.log('\nDisconnecting...');
    await device.disconnectAsync();
  }
}

main().catch(console.error).finally(() => process.exit(0));
