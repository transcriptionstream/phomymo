#!/usr/bin/env node
/**
 * BLE Debug Tool for Phomemo M260
 * Explores all services/characteristics and tests communication
 *
 * Usage: node ble-debug.js [device-name-pattern]
 * Example: node ble-debug.js M260
 */

import noble from '@abandonware/noble';

let connectedPeripheral = null;
let characteristics = {};

// Target device pattern from command line or default to M260
const targetPattern = process.argv[2] || 'M260';

async function startScanning() {
  console.log(`\n🔍 Scanning for "${targetPattern}"...\n`);

  let foundDevice = null;
  const allDevices = [];

  noble.on('discover', (peripheral) => {
    const name = peripheral.advertisement.localName || '';
    const addr = peripheral.address || peripheral.id;

    if (name) {
      console.log(`  Found: ${name} (${addr})`);
      allDevices.push({ name, addr, peripheral });

      // Auto-select if matches pattern
      if (name.toLowerCase().includes(targetPattern.toLowerCase()) && !foundDevice) {
        foundDevice = peripheral;
        console.log(`  ✓ Matched target pattern!`);
      }
    }
  });

  await noble.startScanningAsync([], true);

  // Scan for 8 seconds or until found
  for (let i = 0; i < 16; i++) {
    await new Promise(resolve => setTimeout(resolve, 500));
    if (foundDevice) break;
  }

  await noble.stopScanningAsync();

  if (!foundDevice) {
    console.log(`\n❌ Device matching "${targetPattern}" not found.`);
    console.log('\nDevices seen:');
    if (allDevices.length === 0) {
      console.log('  (none)');
    } else {
      allDevices.forEach(d => console.log(`  - ${d.name} (${d.addr})`));
    }
    console.log('\nTips:');
    console.log('  - Make sure printer is ON');
    console.log('  - Disconnect from Mac Bluetooth settings');
    console.log('  - Close any web pages connected to it');
    process.exit(1);
  }

  return foundDevice;
}

async function exploreServices(peripheral) {
  console.log('\n📡 Discovering services and characteristics...\n');

  const services = await peripheral.discoverServicesAsync([]);

  for (const service of services) {
    const uuid = service.uuid;
    console.log(`\n📦 Service: ${uuid}`);

    const chars = await service.discoverCharacteristicsAsync([]);

    for (const char of chars) {
      const props = [];
      if (char.properties.includes('read')) props.push('READ');
      if (char.properties.includes('write')) props.push('WRITE');
      if (char.properties.includes('writeWithoutResponse')) props.push('WRITE_NO_RESP');
      if (char.properties.includes('notify')) props.push('NOTIFY');
      if (char.properties.includes('indicate')) props.push('INDICATE');

      console.log(`  └─ Characteristic: ${char.uuid}`);
      console.log(`     Properties: ${props.join(', ') || 'none'}`);

      // Store for later use
      characteristics[`${service.uuid}:${char.uuid}`] = {
        service: service,
        characteristic: char,
        properties: char.properties
      };

      // If readable, try to read it
      if (char.properties.includes('read')) {
        try {
          const data = await char.readAsync();
          console.log(`     Current value: ${data.toString('hex')} (${data.length} bytes)`);
        } catch (e) {
          console.log(`     Read error: ${e.message}`);
        }
      }

      // Subscribe to notifications
      if (char.properties.includes('notify') || char.properties.includes('indicate')) {
        try {
          char.on('data', (data) => {
            console.log(`\n📩 Notification from ${char.uuid}: ${data.toString('hex')}`);
          });
          await char.subscribeAsync();
          console.log(`     ✓ Subscribed to notifications`);
        } catch (e) {
          console.log(`     Subscribe error: ${e.message}`);
        }
      }
    }
  }

  return characteristics;
}

async function testWrite(char, data, description) {
  console.log(`\n📤 Sending: ${description}`);
  console.log(`   Bytes: ${Buffer.from(data).toString('hex')}`);

  try {
    // Try writeWithoutResponse first (faster)
    if (char.properties.includes('writeWithoutResponse')) {
      await char.writeAsync(Buffer.from(data), true);
      console.log('   ✓ Sent (without response)');
    } else if (char.properties.includes('write')) {
      await char.writeAsync(Buffer.from(data), false);
      console.log('   ✓ Sent (with response)');
    } else {
      console.log('   ✗ Characteristic is not writable');
      return false;
    }
    return true;
  } catch (e) {
    console.log(`   ✗ Write error: ${e.message}`);
    return false;
  }
}

async function runTests(chars) {
  console.log('\n' + '='.repeat(60));
  console.log('🧪 RUNNING TESTS');
  console.log('='.repeat(60));

  // Find writable characteristics
  const writableChars = Object.entries(chars).filter(([key, val]) =>
    val.properties.includes('write') || val.properties.includes('writeWithoutResponse')
  );

  if (writableChars.length === 0) {
    console.log('No writable characteristics found!');
    return;
  }

  console.log(`\nFound ${writableChars.length} writable characteristic(s):`);
  writableChars.forEach(([key], i) => {
    console.log(`  [${i + 1}] ${key}`);
  });

  // Test all writable characteristics
  const toTest = writableChars;

  for (const [key, val] of toTest) {
    console.log(`\n${'─'.repeat(60)}`);
    console.log(`Testing: ${key}`);
    console.log('─'.repeat(60));

    const char = val.characteristic;

    // Test 1: ESC @ (Initialize)
    console.log('\n[Test 1] ESC @ - Initialize printer');
    await testWrite(char, [0x1b, 0x40], 'ESC @');
    await new Promise(r => setTimeout(r, 500));

    // Test 2: Status query (some printers respond to this)
    console.log('\n[Test 2] Status query');
    await testWrite(char, [0x10, 0x04, 0x01], 'DLE EOT 1');
    await new Promise(r => setTimeout(r, 500));

    // Test 3: Proprietary Phomemo init
    console.log('\n[Test 3] Proprietary init (0x1f 0x11 series)');
    await testWrite(char, [0x1f, 0x11, 0x02, 0x04], 'Phomemo init');
    await new Promise(r => setTimeout(r, 500));

    // Test 4: Feed command
    console.log('\n[Test 4] Feed paper');
    await testWrite(char, [0x1b, 0x4a, 0x20], 'ESC J 32 (feed 32 dots)');
    await new Promise(r => setTimeout(r, 500));

    // Test 5: Simple raster (1 line of black)
    console.log('\n[Test 5] Simple raster - 1 line of black');
    const rasterCmd = [
      0x1d, 0x76, 0x30, 0x00,  // GS v 0 0
      0x48, 0x00,              // width = 72 bytes
      0x01, 0x00,              // height = 1 line
      ...new Array(72).fill(0xff)  // 72 bytes of black
    ];
    await testWrite(char, rasterCmd, 'GS v 0 + 1 line of 0xff');
    await new Promise(r => setTimeout(r, 1000));

    // Test 6: Feed after raster
    console.log('\n[Test 6] Feed after raster');
    await testWrite(char, [0x1b, 0x4a, 0x50], 'ESC J 80');
    await new Promise(r => setTimeout(r, 500));
  }

  console.log('\n✅ Tests complete. Check if the printer responded to any commands.');
  console.log('   Watch for paper movement, sounds, or status light changes.\n');
}

async function main() {
  console.log('═'.repeat(60));
  console.log('  Phomemo M260 BLE Debug Tool');
  console.log('═'.repeat(60));

  // Wait for Bluetooth to be ready
  await new Promise((resolve, reject) => {
    if (noble.state === 'poweredOn') {
      resolve();
    } else {
      noble.once('stateChange', (state) => {
        if (state === 'poweredOn') resolve();
        else reject(new Error(`Bluetooth state: ${state}`));
      });
    }
  });

  try {
    // Scan and select device
    const peripheral = await startScanning();
    connectedPeripheral = peripheral;

    console.log(`\n🔗 Connecting to ${peripheral.advertisement.localName || peripheral.id}...`);
    await peripheral.connectAsync();
    console.log('✓ Connected!\n');

    // Explore services
    const chars = await exploreServices(peripheral);

    // Run tests
    await runTests(chars);

    // Wait a moment to see any notifications
    console.log('\n⏳ Waiting 3 seconds for any printer responses...');
    await new Promise(r => setTimeout(r, 3000));

    console.log('\n' + '='.repeat(60));
    console.log('📋 SUMMARY');
    console.log('='.repeat(60));
    console.log('\nCheck if the printer:');
    console.log('  - Made any sounds');
    console.log('  - Moved paper (even slightly)');
    console.log('  - Status light changed');
    console.log('  - Sent any notifications (shown above)');
    console.log('\nIf none of the tests caused a response, the M260 may use');
    console.log('a different protocol over BLE than standard ESC/POS.');

  } catch (error) {
    console.error('Error:', error.message);
  } finally {
    if (connectedPeripheral) {
      console.log('\n🔌 Disconnecting...');
      await connectedPeripheral.disconnectAsync();
    }
    process.exit(0);
  }
}

main().catch(console.error);
