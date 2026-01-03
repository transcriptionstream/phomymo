#!/usr/bin/env node
/**
 * Label orientation test for 60x30mm labels
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
      c.on('data', () => {}); // Ignore responses
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
  await delay(50);
}

async function printLabel(widthBytes, heightLines, imageData, description) {
  console.log(`\n📄 ${description}`);
  console.log(`   Size: ${widthBytes} bytes x ${heightLines} lines`);

  await send([0x1b, 0x40]); // Init
  await delay(150);

  // Send raster in chunks of 255 lines max
  for (let startLine = 0; startLine < heightLines; startLine += 255) {
    const chunkLines = Math.min(255, heightLines - startLine);

    const header = [
      0x1d, 0x76, 0x30, 0x00,
      widthBytes & 0xFF, (widthBytes >> 8) & 0xFF,
      chunkLines & 0xFF, (chunkLines >> 8) & 0xFF
    ];
    await send(header);

    // Send this chunk's image data
    const chunkStart = startLine * widthBytes;
    const chunkEnd = (startLine + chunkLines) * widthBytes;
    const chunkData = imageData.slice(chunkStart, chunkEnd);

    // Send in 128-byte packets
    for (let i = 0; i < chunkData.length; i += 128) {
      await send(chunkData.slice(i, i + 128));
    }
  }

  await delay(200);
  await send([0x1b, 0x4a, 30]); // Small feed
  await delay(300);

  console.log('   ✓ Sent');
}

function createArrowImage(widthBytes, heightLines) {
  // Create an arrow pointing RIGHT and text "TOP" to show orientation
  // The arrow helps us understand which way is "forward" in print direction
  const data = new Uint8Array(widthBytes * heightLines);

  // Fill with white
  data.fill(0x00);

  // Draw border (1 byte thick)
  for (let y = 0; y < heightLines; y++) {
    data[y * widthBytes] = 0xFF; // Left border
    data[y * widthBytes + widthBytes - 1] = 0xFF; // Right border
  }
  for (let x = 0; x < widthBytes; x++) {
    data[x] = 0xFF; // Top border
    data[(heightLines - 1) * widthBytes + x] = 0xFF; // Bottom border
  }

  // Draw arrow pointing right (in the center)
  const centerY = Math.floor(heightLines / 2);
  const arrowLength = Math.floor(widthBytes * 0.6);
  const arrowStart = Math.floor(widthBytes * 0.2);

  // Arrow shaft
  for (let x = arrowStart; x < arrowStart + arrowLength; x++) {
    data[centerY * widthBytes + x] = 0xFF;
    data[(centerY - 1) * widthBytes + x] = 0xFF;
    data[(centerY + 1) * widthBytes + x] = 0xFF;
  }

  // Arrow head (pointing right)
  const headX = arrowStart + arrowLength;
  for (let i = 0; i < 10 && centerY - i >= 0 && centerY + i < heightLines; i++) {
    if (headX - i >= 0 && headX - i < widthBytes) {
      data[(centerY - i) * widthBytes + headX - i] = 0xFF;
      data[(centerY + i) * widthBytes + headX - i] = 0xFF;
    }
  }

  // Draw "T" in top-left corner (to mark TOP)
  const letterSize = Math.min(20, Math.floor(heightLines / 4));
  const letterX = 5;
  const letterY = 5;

  // T horizontal
  for (let x = letterX; x < letterX + letterSize && x < widthBytes; x++) {
    if (letterY < heightLines) data[letterY * widthBytes + x] = 0xFF;
    if (letterY + 1 < heightLines) data[(letterY + 1) * widthBytes + x] = 0xFF;
  }
  // T vertical
  const midX = letterX + Math.floor(letterSize / 2);
  for (let y = letterY; y < letterY + letterSize * 1.5 && y < heightLines; y++) {
    if (midX < widthBytes) data[y * widthBytes + midX] = 0xFF;
    if (midX + 1 < widthBytes) data[y * widthBytes + midX + 1] = 0xFF;
  }

  return data;
}

async function runTests() {
  // 60x30mm label at 8 pixels/mm
  // Possibility 1: Width = 60mm (480 pixels = 60 bytes), Height = 30mm (240 lines)
  // Possibility 2: Width = 30mm (240 pixels = 30 bytes), Height = 60mm (480 lines)

  console.log('Testing different orientations for 60x30mm labels\n');
  console.log('Each test prints an arrow and "T" marker to show orientation.');
  console.log('The arrow points in the "print direction" (toward paper exit).');
  console.log('The "T" marks the top-left corner.\n');

  // Test 1: Assume label is 60mm wide (horizontal), 30mm tall
  // 60mm = 480 pixels, but we'll use 60 bytes (480 pixels)
  // 30mm = 240 pixels
  console.log('═'.repeat(50));
  console.log('TEST 1: 60 bytes wide x 100 lines (small test)');
  console.log('═'.repeat(50));

  const test1Data = createArrowImage(60, 100);
  await printLabel(60, 100, test1Data, 'Orientation test 1 (60x100)');

  await delay(2000);

  // Test 2: Same but taller
  console.log('\n═'.repeat(50));
  console.log('TEST 2: 60 bytes wide x 200 lines');
  console.log('═'.repeat(50));

  const test2Data = createArrowImage(60, 200);
  await printLabel(60, 200, test2Data, 'Orientation test 2 (60x200)');

  await delay(2000);

  // Test 3: Rotated - 30 bytes wide, 200 lines
  console.log('\n═'.repeat(50));
  console.log('TEST 3: 30 bytes wide x 200 lines (rotated)');
  console.log('═'.repeat(50));

  const test3Data = createArrowImage(30, 200);
  await printLabel(30, 200, test3Data, 'Orientation test 3 (30x200)');

  await delay(2000);

  // Test 4: Full printer width
  console.log('\n═'.repeat(50));
  console.log('TEST 4: Full 72 bytes wide x 100 lines');
  console.log('═'.repeat(50));

  const test4Data = createArrowImage(72, 100);
  await printLabel(72, 100, test4Data, 'Orientation test 4 (72x100, full width)');

  console.log('\n' + '═'.repeat(50));
  console.log('TESTS COMPLETE');
  console.log('═'.repeat(50));
  console.log('\nPlease describe what you see:');
  console.log('- Which test(s) fit on a single label?');
  console.log('- Where is the arrow pointing?');
  console.log('- Where is the "T" located?');
}

async function main() {
  const device = await connect();
  try {
    await runTests();
    await delay(1000);
  } finally {
    console.log('\nDisconnecting...');
    await device.disconnectAsync();
  }
}

main().catch(console.error).finally(() => process.exit(0));
