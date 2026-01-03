#!/usr/bin/env node
/**
 * Raw BLE test - try different approaches
 */

import noble from '@abandonware/noble';

const targetPattern = process.argv[2] || 'M260';
let chars = {};

async function connect() {
  console.log('Connecting to M260...\n');

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
    if (name.toLowerCase().includes(targetPattern.toLowerCase()) && !device) {
      device = p;
    }
  });

  await noble.startScanningAsync([], true);
  for (let i = 0; i < 10 && !device; i++) await delay(500);
  await noble.stopScanningAsync();

  if (!device) throw new Error('Device not found');

  await device.connectAsync();
  console.log('✓ Connected\n');

  const services = await device.discoverServicesAsync([]);
  for (const svc of services) {
    const svcChars = await svc.discoverCharacteristicsAsync([]);
    for (const c of svcChars) {
      chars[`${svc.uuid}:${c.uuid}`] = c;
      console.log(`Found: ${svc.uuid}:${c.uuid} [${c.properties.join(', ')}]`);
    }
  }

  // Subscribe to notifications
  if (chars['ff00:ff03']) {
    chars['ff00:ff03'].on('data', (data) => {
      console.log(`📩 Notification: ${data.toString('hex')} = [${Array.from(data).join(', ')}]`);
    });
    await chars['ff00:ff03'].subscribeAsync();
  }

  return device;
}

function delay(ms) {
  return new Promise(r => setTimeout(r, ms));
}

async function send(charKey, data, desc) {
  const char = chars[charKey];
  if (!char) {
    console.log(`✗ Characteristic ${charKey} not found`);
    return;
  }

  const buf = Buffer.from(data);
  console.log(`\n📤 [${charKey}] ${desc}`);
  console.log(`   Bytes: ${Array.from(buf).map(b => b.toString(16).padStart(2, '0')).join(' ')}`);

  try {
    // Try write with response
    await char.writeAsync(buf, false);
    console.log('   ✓ Sent (with response)');
  } catch (e) {
    try {
      await char.writeAsync(buf, true);
      console.log('   ✓ Sent (without response)');
    } catch (e2) {
      console.log(`   ✗ Error: ${e2.message}`);
    }
  }
  await delay(300);
}

async function read(charKey) {
  const char = chars[charKey];
  if (!char) return null;

  try {
    const data = await char.readAsync();
    console.log(`\n📥 [${charKey}] Read: ${data.toString('hex')} = [${Array.from(data).join(', ')}]`);
    return data;
  } catch (e) {
    console.log(`\n📥 [${charKey}] Read error: ${e.message}`);
    return null;
  }
}

async function runTests() {
  console.log('\n' + '='.repeat(60));
  console.log('APPROACH 1: Read status first, then write');
  console.log('='.repeat(60));

  await read('ff00:ff01');
  await delay(200);

  // Send init
  await send('ff00:ff02', [0x1b, 0x40], 'ESC @ init');
  await delay(500);

  // Read status again
  await read('ff00:ff01');

  console.log('\n' + '='.repeat(60));
  console.log('APPROACH 2: Send data in smaller packets');
  console.log('='.repeat(60));

  await send('ff00:ff02', [0x1b, 0x40], 'ESC @ init');
  await delay(200);

  // Send raster header first
  await send('ff00:ff02', [0x1d, 0x76, 0x30, 0x00, 0x48, 0x00, 0x05, 0x00], 'Raster header: 72w x 5h');
  await delay(100);

  // Send data line by line
  for (let line = 0; line < 5; line++) {
    const lineData = new Array(72).fill(line % 2 === 0 ? 0xFF : 0x00);
    await send('ff00:ff02', lineData, `Line ${line + 1} data`);
    await delay(50);
  }

  await send('ff00:ff02', [0x1b, 0x4a, 0x30], 'Feed');
  await delay(500);

  console.log('\n' + '='.repeat(60));
  console.log('APPROACH 3: Query printer first');
  console.log('='.repeat(60));

  // Various status/query commands
  await send('ff00:ff02', [0x10, 0x04, 0x01], 'DLE EOT 1 - transmit status');
  await delay(300);

  await send('ff00:ff02', [0x10, 0x04, 0x02], 'DLE EOT 2 - offline cause');
  await delay(300);

  await send('ff00:ff02', [0x10, 0x04, 0x03], 'DLE EOT 3 - error cause');
  await delay(300);

  await send('ff00:ff02', [0x10, 0x04, 0x04], 'DLE EOT 4 - paper sensor');
  await delay(300);

  await send('ff00:ff02', [0x1d, 0x49, 0x01], 'GS I 1 - printer ID');
  await delay(300);

  await send('ff00:ff02', [0x1d, 0x49, 0x02], 'GS I 2 - printer type');
  await delay(300);

  console.log('\n' + '='.repeat(60));
  console.log('APPROACH 4: Phomemo mobile app style');
  console.log('='.repeat(60));

  // Mobile apps often use wrapper protocols
  // Try sending with length prefix

  const printData = [
    0x1b, 0x40,  // init
    0x1d, 0x76, 0x30, 0x00,  // raster
    0x48, 0x00,  // width 72
    0x01, 0x00,  // height 1
    ...new Array(72).fill(0xAA)  // pattern
  ];

  // Try with 0x00 prefix (some protocols use this)
  await send('ff00:ff02', [0x00, ...printData], 'With 0x00 prefix');
  await delay(500);

  // Try with STX/ETX wrapper
  await send('ff00:ff02', [0x02, ...printData, 0x03], 'With STX/ETX wrapper');
  await delay(500);

  // Try with length header
  const len = printData.length;
  await send('ff00:ff02', [len & 0xFF, (len >> 8) & 0xFF, ...printData], 'With length header');
  await delay(500);

  console.log('\n' + '='.repeat(60));
  console.log('APPROACH 5: Different raster commands');
  console.log('='.repeat(60));

  await send('ff00:ff02', [0x1b, 0x40], 'ESC @ init');
  await delay(100);

  // ESC * - bit image mode
  await send('ff00:ff02', [
    0x1b, 0x2a, 0x00,  // ESC * m (m=0: 8-dot single density)
    0x48, 0x00,        // nL nH (72 dots)
    ...new Array(72).fill(0xFF)
  ], 'ESC * 0 - bit image');
  await delay(300);

  await send('ff00:ff02', [0x0a], 'LF');
  await delay(100);

  // GS * - define downloaded bit image
  await send('ff00:ff02', [
    0x1d, 0x2a, 0x08, 0x01,  // GS * x y (8 cols, 1 row of 8 bytes)
    ...new Array(8).fill(0xFF)
  ], 'GS * - define image');
  await delay(300);

  await send('ff00:ff02', [0x1d, 0x2f, 0x00], 'GS / 0 - print image');
  await delay(500);

  console.log('\n' + '='.repeat(60));
  console.log('APPROACH 6: Try ff01 for writing (maybe read/write?)');
  console.log('='.repeat(60));

  // Some printers use different characteristics
  const ff01 = chars['ff00:ff01'];
  if (ff01 && ff01.properties.includes('write')) {
    await send('ff00:ff01', [0x1b, 0x40], 'ESC @ to ff01');
    await delay(300);
  } else {
    console.log('ff01 is not writable');
  }

  console.log('\n' + '='.repeat(60));
  console.log('TESTS COMPLETE');
  console.log('='.repeat(60));
}

async function main() {
  const device = await connect();
  try {
    await runTests();
    await delay(2000);  // Wait for any delayed notifications
  } finally {
    console.log('\n🔌 Disconnecting...');
    await device.disconnectAsync();
  }
}

main().catch(console.error).finally(() => process.exit(0));
