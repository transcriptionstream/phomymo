#!/usr/bin/env node
/**
 * BLE Discovery Tool
 * Scans for Bluetooth devices and lists their services and characteristics
 * Use this to find the correct UUIDs for your Phomemo printer
 */

let noble;
try {
  noble = require('@abandonware/noble');
} catch (err) {
  console.error('Error: @abandonware/noble is not installed.');
  console.error('Install it with: npm install @abandonware/noble');
  process.exit(1);
}

const SCAN_DURATION = 10000; // 10 seconds scan
const CONNECT_TIMEOUT = 15000; // 15 seconds to connect and discover

// Devices found during scan
const foundDevices = [];

console.log('=== Phomemo BLE Discovery Tool ===\n');
console.log('This tool will scan for Bluetooth devices and display their services.');
console.log('Use this to find the correct UUIDs for your M260 printer.\n');

// Handle noble state
noble.on('stateChange', async (state) => {
  console.log(`Bluetooth adapter state: ${state}`);

  if (state === 'poweredOn') {
    console.log('\nScanning for devices...\n');
    noble.startScanning([], false);

    // Stop scanning after duration
    setTimeout(() => {
      noble.stopScanning();
      console.log('\n=== Scan Complete ===\n');

      if (foundDevices.length === 0) {
        console.log('No devices found. Make sure your printer is on and in pairing mode.');
        process.exit(0);
      }

      console.log(`Found ${foundDevices.length} device(s). Examining each...\n`);
      examineDevices();
    }, SCAN_DURATION);
  } else {
    console.error(`Bluetooth is ${state}. Please enable Bluetooth and try again.`);
    process.exit(1);
  }
});

// Handle device discovery
noble.on('discover', (peripheral) => {
  const name = peripheral.advertisement.localName || 'Unknown';
  const address = peripheral.address || 'unknown';
  const uuid = peripheral.uuid || peripheral.id || 'unknown';
  const rssi = peripheral.rssi;

  // Check if it might be a Phomemo device
  const isLikelyPrinter = /phomemo|m260|m200|d30|printer|label/i.test(name);

  // Check if address matches known M260 pattern (user's device)
  const addressMatch = address.toLowerCase().includes('cd:37:23') ||
                       uuid.toLowerCase().includes('cd3723');

  console.log(`Found: ${name.padEnd(20)} Addr: ${address.padEnd(18)} UUID: ${uuid.substring(0, 12)}... RSSI: ${rssi} ${isLikelyPrinter ? '** PRINTER **' : ''} ${addressMatch ? '** M260 **' : ''}`);

  foundDevices.push({
    peripheral,
    name,
    address,
    uuid,
    isLikelyPrinter: isLikelyPrinter || addressMatch,
  });
});

/**
 * Examine each found device for services
 */
async function examineDevices() {
  // Sort so likely printers are first, then by signal strength
  foundDevices.sort((a, b) => {
    if (a.isLikelyPrinter && !b.isLikelyPrinter) return -1;
    if (!a.isLikelyPrinter && b.isLikelyPrinter) return 1;
    return b.peripheral.rssi - a.peripheral.rssi; // Stronger signal first
  });

  // Remove duplicates by keeping the first (strongest signal) of each name
  const seen = new Set();
  const uniqueDevices = foundDevices.filter(d => {
    const key = d.name + d.address;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  console.log('\nSelect a device to examine (your printer is CD:37:23:7A:FA:10):');
  console.log('Look for UUID containing "cd3723" or similar\n');
  uniqueDevices.forEach((d, i) => {
    const marker = d.isLikelyPrinter ? ' ** LIKELY PRINTER **' : '';
    const uuid = d.uuid ? d.uuid.substring(0, 20) : 'unknown';
    console.log(`  ${i + 1}. ${d.name.padEnd(20)} UUID: ${uuid.padEnd(22)} RSSI: ${d.peripheral.rssi}${marker}`);
  });

  // Use readline to get user input
  const readline = require('readline');
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
  });

  rl.question('\nEnter device number to examine (or "all" for likely printers, "q" to quit): ', async (answer) => {
    rl.close();

    if (answer.toLowerCase() === 'q') {
      process.exit(0);
    }

    let devicesToExamine = [];

    if (answer.toLowerCase() === 'all') {
      devicesToExamine = uniqueDevices.filter(d => d.isLikelyPrinter);
      if (devicesToExamine.length === 0) {
        console.log('No likely printers found. Try selecting a specific device number.');
        process.exit(0);
      }
    } else {
      const num = parseInt(answer);
      if (isNaN(num) || num < 1 || num > uniqueDevices.length) {
        console.log('Invalid selection.');
        process.exit(1);
      }
      devicesToExamine = [uniqueDevices[num - 1]];
    }

    for (const device of devicesToExamine) {
      console.log(`\n${'='.repeat(60)}`);
      console.log(`Examining: ${device.name} (${device.address})`);
      console.log('='.repeat(60));

      try {
        await examineDevice(device.peripheral);
      } catch (err) {
        console.log(`  Error: ${err.message}`);
      }

      // Disconnect before moving to next device
      try {
        device.peripheral.disconnect();
      } catch (e) {
        // Ignore disconnect errors
      }
    }

    console.log('\n=== Discovery Complete ===\n');
    console.log('To use a discovered UUID, run:');
    console.log('  node phomymo-cli.js --bluetooth --ble-service <SERVICE_UUID> --ble-char <CHAR_UUID>\n');

    process.exit(0);
  });
}

/**
 * Connect to a device and list its services
 */
async function examineDevice(peripheral) {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      reject(new Error('Connection timeout'));
    }, CONNECT_TIMEOUT);

    peripheral.connect((err) => {
      if (err) {
        clearTimeout(timeout);
        reject(err);
        return;
      }

      console.log('  Connected. Discovering services...\n');

      peripheral.discoverAllServicesAndCharacteristics((err, services, characteristics) => {
        clearTimeout(timeout);

        if (err) {
          reject(err);
          return;
        }

        console.log(`  Found ${services.length} service(s):\n`);

        for (const service of services) {
          const uuid = formatUUID(service.uuid);
          const isKnownPrinter = isPrinterService(uuid);

          console.log(`  Service: ${uuid} ${isKnownPrinter ? '** PRINTER SERVICE **' : ''}`);

          // Find characteristics for this service
          const serviceChars = characteristics.filter(c => c._serviceUuid === service.uuid);

          for (const char of serviceChars) {
            const charUUID = formatUUID(char.uuid);
            const props = char.properties.join(', ');
            const isWritable = char.properties.includes('write') || char.properties.includes('writeWithoutResponse');

            console.log(`    Characteristic: ${charUUID}`);
            console.log(`      Properties: ${props} ${isWritable ? '** CAN WRITE **' : ''}`);
          }

          console.log('');
        }

        resolve();
      });
    });
  });
}

/**
 * Format UUID to standard format
 */
function formatUUID(uuid) {
  if (uuid.length === 32) {
    // Add dashes to make it readable
    return `${uuid.slice(0, 8)}-${uuid.slice(8, 12)}-${uuid.slice(12, 16)}-${uuid.slice(16, 20)}-${uuid.slice(20)}`;
  }
  return uuid;
}

/**
 * Check if UUID matches known printer services
 */
function isPrinterService(uuid) {
  const normalized = uuid.toLowerCase().replace(/-/g, '');
  const knownServices = [
    '0000ff00', // D30 service
    '49535343', // ISSC service prefix
    '18f0',     // Generic printer service
  ];

  return knownServices.some(known => normalized.startsWith(known));
}

// Handle errors
noble.on('scanStop', () => {
  console.log('Scan stopped.');
});

process.on('SIGINT', () => {
  console.log('\nInterrupted. Cleaning up...');
  noble.stopScanning();
  process.exit(0);
});
