#!/usr/bin/env node
/**
 * BLE Print Test for M260
 * Tries different print sequences to find what works
 */

import noble from '@abandonware/noble';

const targetPattern = process.argv[2] || 'M260';
let writeChar = null;
let notifyChar = null;
let notifications = [];

async function connect() {
  console.log('═'.repeat(60));
  console.log('  M260 BLE Print Test');
  console.log('═'.repeat(60));

  await new Promise((resolve, reject) => {
    if (noble.state === 'poweredOn') resolve();
    else noble.once('stateChange', (state) => {
      if (state === 'poweredOn') resolve();
      else reject(new Error(`Bluetooth: ${state}`));
    });
  });

  console.log(`\n🔍 Scanning for ${targetPattern}...`);

  let device = null;
  noble.on('discover', (p) => {
    const name = p.advertisement.localName || '';
    if (name.toLowerCase().includes(targetPattern.toLowerCase()) && !device) {
      device = p;
      console.log(`✓ Found ${name}`);
    }
  });

  await noble.startScanningAsync([], true);
  for (let i = 0; i < 10 && !device; i++) {
    await delay(500);
  }
  await noble.stopScanningAsync();

  if (!device) {
    console.log('Device not found');
    process.exit(1);
  }

  console.log('🔗 Connecting...');
  await device.connectAsync();
  console.log('✓ Connected\n');

  const services = await device.discoverServicesAsync(['ff00']);
  const chars = await services[0].discoverCharacteristicsAsync([]);

  for (const c of chars) {
    if (c.uuid === 'ff02') writeChar = c;
    if (c.uuid === 'ff03') {
      notifyChar = c;
      c.on('data', (data) => {
        const hex = data.toString('hex');
        notifications.push(hex);
        console.log(`  📩 Response: ${hex}`);
      });
      await c.subscribeAsync();
    }
  }

  return device;
}

async function send(data, desc) {
  const buf = Buffer.from(data);
  console.log(`\n📤 ${desc}`);
  console.log(`   Hex: ${buf.toString('hex')}`);
  notifications = [];
  await writeChar.writeAsync(buf, true);
  await delay(300);
  return notifications;
}

async function delay(ms) {
  return new Promise(r => setTimeout(r, ms));
}

async function testPrintSequences() {
  console.log('─'.repeat(60));
  console.log('TEST 1: USB-style sequence (what works over USB)');
  console.log('─'.repeat(60));

  // Exact USB sequence
  await send([0x1b, 0x40], 'ESC @ (init)');
  await delay(100);

  await send([0x1d, 0x7c, 0x06], 'GS | 6 (density)');
  await delay(50);

  await send([0x1b, 0x33, 0x00], 'ESC 3 0 (line spacing)');
  await delay(50);

  await send([0x1b, 0x4a, 0x0c], 'ESC J 12 (initial feed)');
  await delay(100);

  // 10 lines of test pattern
  const width = 72;
  const lines = 10;
  const header = [0x1d, 0x76, 0x30, 0x00, width, 0x00, lines, 0x00];
  const data = [];
  for (let y = 0; y < lines; y++) {
    for (let x = 0; x < width; x++) {
      data.push(y % 2 === 0 ? 0xAA : 0x55);
    }
  }
  await send([...header, ...data], `GS v 0 + ${lines} lines of pattern`);
  await delay(500);

  await send([0x1b, 0x4a, 0x1e], 'ESC J 30 (final feed)');
  await delay(1000);

  console.log('\n─'.repeat(60));
  console.log('TEST 2: Different init sequence');
  console.log('─'.repeat(60));

  // Try with proprietary init
  await send([0x1b, 0x40], 'ESC @ (init)');
  await delay(100);

  await send([0x1f, 0x11, 0x02, 0x04], 'Phomemo proprietary init');
  await delay(100);

  // Same raster
  await send([...header, ...data], `GS v 0 + ${lines} lines`);
  await delay(500);

  await send([0x1b, 0x64, 0x02], 'ESC d 2 (feed lines)');
  await delay(1000);

  console.log('\n─'.repeat(60));
  console.log('TEST 3: Try opposite bit polarity (black=0)');
  console.log('─'.repeat(60));

  await send([0x1b, 0x40], 'ESC @ (init)');
  await delay(100);

  // Invert the pattern: 0xAA -> 0x55, 0x55 -> 0xAA
  const invertedData = data.map(b => b ^ 0xFF);
  await send([...header, ...invertedData], `GS v 0 + inverted pattern`);
  await delay(500);

  await send([0x1b, 0x4a, 0x1e], 'ESC J 30 (feed)');
  await delay(1000);

  console.log('\n─'.repeat(60));
  console.log('TEST 4: Smaller width (48 bytes like D30)');
  console.log('─'.repeat(60));

  await send([0x1b, 0x40], 'ESC @ (init)');
  await delay(100);

  const smallWidth = 48;
  const smallHeader = [0x1d, 0x76, 0x30, 0x00, smallWidth, 0x00, lines, 0x00];
  const smallData = [];
  for (let y = 0; y < lines; y++) {
    for (let x = 0; x < smallWidth; x++) {
      smallData.push(0xFF); // All black
    }
  }
  await send([...smallHeader, ...smallData], `GS v 0 width=${smallWidth}`);
  await delay(500);

  await send([0x1b, 0x4a, 0x1e], 'ESC J 30 (feed)');
  await delay(1000);

  console.log('\n─'.repeat(60));
  console.log('TEST 5: Just feed commands (should move paper)');
  console.log('─'.repeat(60));

  await send([0x1b, 0x40], 'ESC @ (init)');
  await delay(200);

  await send([0x1b, 0x4a, 0x50], 'ESC J 80 (feed 80 dots)');
  await delay(500);

  await send([0x1b, 0x64, 0x03], 'ESC d 3 (feed 3 lines)');
  await delay(500);

  await send([0x0c], 'FF (form feed)');
  await delay(1000);

  console.log('\n─'.repeat(60));
  console.log('TEST 6: Graphics mode (GS ( L) - alternative raster');
  console.log('─'.repeat(60));

  await send([0x1b, 0x40], 'ESC @ (init)');
  await delay(100);

  // GS ( L - Download graphics data
  // Format: 1D 28 4C pL pH m fn [params] [data]
  const imgWidth = 72;
  const imgHeight = 10;
  const imgData = new Array(imgWidth * imgHeight).fill(0xFF);
  const pL = ((imgData.length + 10) & 0xFF);
  const pH = ((imgData.length + 10) >> 8);

  await send([
    0x1d, 0x28, 0x4c, pL, pH, // GS ( L pL pH
    0x30, 0x70, 0x30,          // m=48, fn=112, a=48
    0x01, 0x01,                // bx=1, by=1
    0x31,                      // c=49 (color)
    imgWidth & 0xFF, (imgWidth >> 8) & 0xFF,
    imgHeight & 0xFF, (imgHeight >> 8) & 0xFF,
    ...imgData
  ], 'GS ( L - Download graphics');
  await delay(500);

  // Print downloaded graphics
  await send([
    0x1d, 0x28, 0x4c, 0x02, 0x00, 0x30, 0x32
  ], 'GS ( L - Print graphics');
  await delay(1000);

  console.log('\n═'.repeat(60));
  console.log('TESTS COMPLETE');
  console.log('═'.repeat(60));
  console.log('\nDid any of the tests cause paper movement or printing?');
  console.log('Look for: paper advancing, any marks on paper, sounds, etc.');
}

async function main() {
  const device = await connect();

  try {
    await testPrintSequences();
  } finally {
    console.log('\n🔌 Disconnecting...');
    await device.disconnectAsync();
  }
}

main().catch(console.error).finally(() => process.exit(0));
