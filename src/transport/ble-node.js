/**
 * Bluetooth Low Energy transport for Node.js
 * Uses @abandonware/noble for BLE communication
 */

const PrinterTransport = require('./base');
const { CHUNK_SIZE_BLE, BLE_PROFILES } = require('../core/constants');

// Try to load noble - it's an optional dependency
let noble;
try {
  noble = require('@abandonware/noble');
} catch (err) {
  noble = null;
}

class NodeBLETransport extends PrinterTransport {
  /**
   * Create a BLE transport for Node.js
   * @param {Object} options - Transport options
   * @param {string} options.serviceUUID - BLE service UUID
   * @param {string} options.characteristicUUID - BLE characteristic UUID
   * @param {string} options.deviceName - Optional device name filter
   * @param {number} options.scanTimeout - Scan timeout in ms (default: 30000)
   */
  constructor(options = {}) {
    super({ chunkSize: CHUNK_SIZE_BLE, chunkDelay: 20, ...options });

    if (!noble) {
      throw new Error(
        'Bluetooth support requires @abandonware/noble.\n' +
        'Install it with: npm install @abandonware/noble\n' +
        'Note: On some systems, additional Bluetooth libraries may be required.'
      );
    }

    // Use provided UUIDs or fall back to M260 defaults
    this.serviceUUID = (options.serviceUUID || BLE_PROFILES.M260.SERVICE_UUID).toLowerCase();
    this.characteristicUUID = (options.characteristicUUID || BLE_PROFILES.M260.CHARACTERISTIC_UUID).toLowerCase();
    this.deviceName = options.deviceName || null;
    this.scanTimeout = options.scanTimeout || 30000;

    this.peripheral = null;
    this.characteristic = null;
    this._stateHandler = null;
    this._discoverHandler = null;
  }

  /**
   * Check if a peripheral is a Phomemo printer
   */
  _isPhomemoPrinter(peripheral) {
    const name = peripheral.advertisement.localName || '';

    // Match common Phomemo device names
    const phomemoPatterns = [
      /phomemo/i,
      /m260/i,
      /m200/i,
      /d30/i,
      /printer/i,
    ];

    // If device name filter is set, use it
    if (this.deviceName) {
      return name.toLowerCase().includes(this.deviceName.toLowerCase());
    }

    // Otherwise check for Phomemo patterns
    return phomemoPatterns.some(pattern => pattern.test(name));
  }

  /**
   * Wait for Noble to be powered on
   */
  async _waitForPowerOn() {
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(new Error('Bluetooth adapter timeout. Make sure Bluetooth is enabled.'));
      }, 10000);

      if (noble.state === 'poweredOn') {
        clearTimeout(timeout);
        resolve();
        return;
      }

      this._stateHandler = (state) => {
        if (state === 'poweredOn') {
          clearTimeout(timeout);
          noble.removeListener('stateChange', this._stateHandler);
          resolve();
        } else if (state === 'poweredOff' || state === 'unauthorized') {
          clearTimeout(timeout);
          noble.removeListener('stateChange', this._stateHandler);
          reject(new Error(`Bluetooth is ${state}. Please enable Bluetooth.`));
        }
      };

      noble.on('stateChange', this._stateHandler);
    });
  }

  /**
   * Scan for Phomemo printers
   */
  async _scanForPrinter() {
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        noble.stopScanning();
        noble.removeListener('discover', this._discoverHandler);
        reject(new Error('Scan timeout. No Phomemo printer found.'));
      }, this.scanTimeout);

      console.log('Scanning for Bluetooth devices...');
      console.log(`Looking for service UUID: ${this.serviceUUID}`);

      this._discoverHandler = (peripheral) => {
        const name = peripheral.advertisement.localName || 'Unknown';
        const address = peripheral.address || 'unknown';
        console.log(`Found device: ${name} (${address})`);

        if (this._isPhomemoPrinter(peripheral)) {
          clearTimeout(timeout);
          noble.stopScanning();
          noble.removeListener('discover', this._discoverHandler);
          console.log(`\nSelected printer: ${name}`);
          resolve(peripheral);
        }
      };

      noble.on('discover', this._discoverHandler);

      // Start scanning - we don't filter by service UUID during scan
      // because some devices don't advertise all their services
      noble.startScanning([], false);
    });
  }

  /**
   * Connect to a peripheral and find the write characteristic
   */
  async _connectToPeripheral(peripheral) {
    console.log('\nConnecting to device...');

    await new Promise((resolve, reject) => {
      peripheral.connect((err) => {
        if (err) reject(err);
        else resolve();
      });
    });

    console.log('Connected. Discovering services...');

    // Discover services and characteristics
    const { services, characteristics } = await new Promise((resolve, reject) => {
      peripheral.discoverAllServicesAndCharacteristics((err, services, characteristics) => {
        if (err) reject(err);
        else resolve({ services, characteristics });
      });
    });

    console.log(`Found ${services.length} services`);

    // Find our target service
    // Handle both short (ff00) and long (0000ff00-0000-...) UUID formats
    const normalizeUUID = (uuid) => uuid.toLowerCase().replace(/-/g, '');
    const shortUUID = (uuid) => {
      const normalized = normalizeUUID(uuid);
      // If it's a full 128-bit UUID, extract the short form (chars 4-8)
      if (normalized.length === 32 && normalized.startsWith('0000') && normalized.endsWith('00001000800000805f9b34fb')) {
        return normalized.slice(4, 8);
      }
      return normalized;
    };

    const targetServiceShort = shortUUID(this.serviceUUID);
    const targetService = services.find(s => {
      const serviceShort = shortUUID(s.uuid);
      return serviceShort === targetServiceShort || normalizeUUID(s.uuid) === normalizeUUID(this.serviceUUID);
    });

    if (!targetService) {
      // List available services for debugging
      console.log('\nAvailable services:');
      services.forEach(s => {
        console.log(`  - ${s.uuid}`);
      });
      throw new Error(`Service ${this.serviceUUID} not found. Try --ble-service with a different UUID.`);
    }

    console.log(`Found target service: ${targetService.uuid}`);

    // Find the write characteristic
    const targetCharShort = shortUUID(this.characteristicUUID);
    const targetChar = characteristics.find(c => {
      const charShort = shortUUID(c.uuid);
      const matchesChar = charShort === targetCharShort || normalizeUUID(c.uuid) === normalizeUUID(this.characteristicUUID);
      return matchesChar && c._serviceUuid === targetService.uuid;
    });

    if (!targetChar) {
      // List available characteristics for debugging
      console.log('\nAvailable characteristics in target service:');
      characteristics
        .filter(c => c._serviceUuid === targetService.uuid)
        .forEach(c => {
          console.log(`  - ${c.uuid} (properties: ${JSON.stringify(c.properties)})`);
        });
      throw new Error(`Characteristic ${this.characteristicUUID} not found. Try --ble-char with a different UUID.`);
    }

    console.log(`Found target characteristic: ${targetChar.uuid}`);
    console.log(`Properties: ${JSON.stringify(targetChar.properties)}`);

    // Subscribe to notification characteristic (ff03) - required for printer to accept data
    const notifyChar = characteristics.find(c =>
      c.uuid === 'ff03' && c._serviceUuid === targetService.uuid
    );
    if (notifyChar) {
      console.log('Subscribing to notifications on ff03...');
      notifyChar.on('data', () => {}); // Empty handler
      await notifyChar.subscribeAsync();
    }

    return targetChar;
  }

  /**
   * Connect to the printer
   */
  async connect() {
    // Wait for Bluetooth to be ready
    await this._waitForPowerOn();

    // Scan for printer
    this.peripheral = await this._scanForPrinter();

    // Connect and find characteristic
    this.characteristic = await this._connectToPeripheral(this.peripheral);

    this.connected = true;
    console.log('\nBluetooth connection established!');
  }

  /**
   * Send data to the printer
   */
  async send(data) {
    if (!this.connected || !this.characteristic) {
      throw new Error('Not connected to BLE device');
    }

    const buffer = Buffer.isBuffer(data) ? data : Buffer.from(data);

    // Use writeAsync with withoutResponse=true (matches working test)
    await this.characteristic.writeAsync(buffer, true);
  }

  /**
   * Disconnect from the printer
   */
  async disconnect() {
    if (this.peripheral) {
      try {
        await new Promise((resolve) => {
          this.peripheral.disconnect((err) => {
            if (err) console.warn(`Warning: Error disconnecting: ${err.message}`);
            resolve();
          });
        });
        console.log('Bluetooth device disconnected');
      } catch (err) {
        console.warn(`Warning: Error during disconnect: ${err.message}`);
      }
    }

    // Clean up handlers
    if (noble) {
      if (this._stateHandler) {
        noble.removeListener('stateChange', this._stateHandler);
      }
      if (this._discoverHandler) {
        noble.removeListener('discover', this._discoverHandler);
      }
    }

    this.connected = false;
    this.peripheral = null;
    this.characteristic = null;
  }

  /**
   * Get transport type name
   */
  getType() {
    return 'ble-node';
  }

  /**
   * Check if Noble is available
   */
  static isAvailable() {
    return noble !== null;
  }
}

module.exports = NodeBLETransport;
