#!/usr/bin/env node
/**
 * Test bit polarity - which value means "black"?
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

async function printTest(widthBytes, heightLines, fillByte, description) {
  console.log(`\n📄 ${description}`);
  console.log(`   Fill byte: 0x${fillByte.toString(16).padStart(2, '0')}`);

  const data = new Uint8Array(widthBytes * heightLines);
  data.fill(fillByte);

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
  await send([0x1b, 0x4a, 0x30]); // Feed
  await delay(500);

  console.log('   ✓ Sent');
}

async function runTests() {
  const w = 20;  // 20 bytes = 160 pixels wide
  const h = 50;  // 50 lines tall

  console.log('Testing bit polarity - which produces black output?\n');

  // Test 1: 0x00 (all zeros)
  await printTest(w, h, 0x00, 'TEST 1: Fill with 0x00');
  await delay(1500);

  // Test 2: 0xFF (all ones)
  await printTest(w, h, 0xFF, 'TEST 2: Fill with 0xFF');
  await delay(1500);

  // Test 3: 0xF0 (half and half per byte)
  await printTest(w, h, 0xF0, 'TEST 3: Fill with 0xF0 (1111 0000)');
  await delay(1500);

  // Test 4: 0x0F (opposite half)
  await printTest(w, h, 0x0F, 'TEST 4: Fill with 0x0F (0000 1111)');
  await delay(1500);

  console.log('\n' + '='.repeat(50));
  console.log('Which test(s) produced BLACK output?');
  console.log('- If TEST 1 (0x00) is black: polarity is 0=black');
  console.log('- If TEST 2 (0xFF) is black: polarity is 1=black');
  console.log('- TEST 3 and 4 should show vertical stripes');
  console.log('='.repeat(50));
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
