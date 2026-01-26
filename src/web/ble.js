/**
 * Web Bluetooth transport for Phomymo
 *
 * Features:
 * - First connection requires user to select device from picker
 * - Once connected, device is remembered for reconnection
 * - Automatic retry with exponential backoff for reliable connections
 * - Handles timing issues common with BLE GATT connections
 */

import { BLE } from './constants.js';

// Printer query commands (format: [0x1F, 0x11, X])
const QUERY_COMMANDS = {
  battery: [0x1F, 0x11, 0x08],
  firmware: [0x1F, 0x11, 0x07],
  serial: [0x1F, 0x11, 0x09],
  paper: [0x1F, 0x11, 0x11],
  cover: [0x1F, 0x11, 0x12],
  version: [0x1F, 0x11, 0x33],
  mac: [0x1F, 0x11, 0x20],
  power: [0x1F, 0x11, 0x0E],
  label: [0x1F, 0x11, 0x19],
};

// Singleton instance
let sharedInstance = null;

export class BLETransport {
  constructor() {
    this.device = null;
    this.server = null;
    this.service = null;
    this.writeChar = null;
    this.notifyChar = null;
    this.connected = false;
    this.onDisconnect = null;
    this.onPrinterInfo = null; // Callback for printer info updates
    this._useWriteWithResponse = false; // Some devices need writeValue instead of writeValueWithoutResponse
    this.printerInfo = {
      battery: null,
      paper: null,
      firmware: null,
      serial: null,
      cover: null,
      version: null,
      mac: null,
      power: null,
      label: null,
    };
  }

  static getShared() {
    if (!sharedInstance) {
      sharedInstance = new BLETransport();
    }
    return sharedInstance;
  }

  static isAvailable() {
    return 'bluetooth' in navigator;
  }

  /**
   * Main connect method
   * @param {Object} options - Connection options
   * @param {boolean} options.showAllDevices - If true, show all Bluetooth devices instead of filtering
   */
  async connect({ showAllDevices = false } = {}) {
    if (!BLETransport.isAvailable()) {
      throw new Error('Bluetooth not supported');
    }

    // Already connected?
    if (this.isConnected()) {
      console.log('Already connected');
      return true;
    }

    // Try reconnecting to known device (from this session)
    if (this.device) {
      try {
        console.log('Reconnecting to', this.device.name);
        await this.retryWithBackoff(
          () => this.connectGATT(),
          BLE.MAX_RETRIES,
          BLE.INITIAL_RETRY_DELAY_MS
        );
        return true;
      } catch (e) {
        console.log('Reconnect failed after retries:', e.message);
        this.device = null;
      }
    }

    // Skip trying previously paired devices - they're often "ghost" entries
    // that give "Unsupported device" errors. Go straight to picker where
    // the user can select the device showing signal strength.
    if ('getDevices' in navigator.bluetooth) {
      const devices = await navigator.bluetooth.getDevices();
      console.log('Skipping paired devices (may be ghosts):', devices.map(d => d.name).join(', ') || 'none');
    }

    // No paired device worked - show picker
    // May need multiple picker selections due to "Unsupported device" issue on first pairing
    for (let pickerAttempt = 0; pickerAttempt < 3; pickerAttempt++) {
      console.log('Showing device picker...');

      if (showAllDevices) {
        // User requested to see all devices (Shift+Click on Connect)
        console.log('Showing ALL Bluetooth devices (filter bypassed)');
        this.device = await navigator.bluetooth.requestDevice({
          acceptAllDevices: true,
          optionalServices: [BLE.SERVICE_UUID],
        });
      } else {
        // Use name prefix filter to show Phomemo printers
        // This helps filter out ghost devices while still showing the printer
        try {
          this.device = await navigator.bluetooth.requestDevice({
            filters: [
              { namePrefix: 'M' },      // M110, M220, M260, etc.
              { namePrefix: 'D' },      // D30, D110, etc.
              { namePrefix: 'P' },      // P12, P12 Pro
              { namePrefix: 'Q' },      // M110S (advertises as Q199E... pattern)
              { namePrefix: 'T' },      // T02
              { namePrefix: 'Mr.in' },  // Mr.in series
              { namePrefix: 'Phomemo' },
            ],
            optionalServices: [BLE.SERVICE_UUID],
          });
        } catch (filterError) {
          console.log('Name filter failed, trying acceptAllDevices:', filterError.message);
          this.device = await navigator.bluetooth.requestDevice({
            acceptAllDevices: true,
            optionalServices: [BLE.SERVICE_UUID],
          });
        }
      }

      // Log device name prominently so users can report unrecognized devices
      console.log('═══════════════════════════════════════════════════');
      console.log('SELECTED DEVICE NAME:', this.device.name);
      console.log('If this device is not recognized, please report this name');
      console.log('═══════════════════════════════════════════════════');

      // Wait for device to be ready
      await this.waitForDeviceReady();

      try {
        // Try to connect with retries
        await this.retryWithBackoff(
          () => this.connectGATT(),
          BLE.MAX_RETRIES,
          BLE.INITIAL_RETRY_DELAY_MS,
          (attempt, error) => console.log(`Connection attempt ${attempt} failed, retrying...`)
        );
        return true; // Success!
      } catch (error) {
        // If we get "Unsupported device", the device object from this requestDevice is broken
        // Clear it and try getting a fresh one from the picker
        if (error.message && error.message.includes('Unsupported')) {
          console.log('Device object appears broken, will request fresh device from picker...');
          this.device = null;
          // Small delay before showing picker again
          await this.delay(500);
          continue; // Try picker again
        }
        throw error; // Other errors, propagate up
      }
    }

    throw new Error('Failed to connect after multiple attempts');
  }

  /**
   * Wait for device to be ready by watching for advertisements
   * This helps with first-time pairing where the device isn't immediately usable
   */
  async waitForDeviceReady(timeout = 5000) {
    // Check if watchAdvertisements is supported
    if (!this.device.watchAdvertisements) {
      console.log('watchAdvertisements not supported, using 3s delay for pairing to complete...');
      await this.delay(3000);
      return;
    }

    return new Promise((resolve) => {
      const abortController = new AbortController();
      let resolved = false;

      // Timeout fallback
      const timeoutId = setTimeout(() => {
        if (!resolved) {
          resolved = true;
          abortController.abort();
          console.log('Device ready timeout, proceeding anyway...');
          resolve();
        }
      }, timeout);

      // Listen for advertisement
      this.device.addEventListener('advertisementreceived', () => {
        if (!resolved) {
          resolved = true;
          clearTimeout(timeoutId);
          abortController.abort();
          console.log('Device advertisement received, device is ready');
          resolve();
        }
      }, { once: true });

      // Start watching
      console.log('Waiting for device to be ready...');
      this.device.watchAdvertisements({ signal: abortController.signal })
        .catch((e) => {
          // watchAdvertisements may fail or be aborted, that's okay
          if (!resolved) {
            resolved = true;
            clearTimeout(timeoutId);
            console.log('watchAdvertisements ended:', e.message);
            resolve();
          }
        });
    });
  }

  /**
   * Connect to GATT server and get characteristics
   */
  async connectGATT() {
    // Setup disconnect handler (only once per device)
    if (!this.device._hasDisconnectHandler) {
      this.device.addEventListener('gattserverdisconnected', () => {
        console.log('Disconnected');
        this.connected = false;
        this.server = null;
        this.service = null;
        this.writeChar = null;
        // Remove notification listener to prevent memory leaks
        if (this.notifyChar && this._notificationHandler) {
          this.notifyChar.removeEventListener('characteristicvaluechanged', this._notificationHandler);
        }
        this.notifyChar = null;
        this._notificationHandler = null;
        if (this.onDisconnect) this.onDisconnect();
      });
      this.device._hasDisconnectHandler = true;
    }

    // Reset state before attempting connection (important for retries)
    this.connected = false;
    this.server = null;
    this.service = null;
    this.writeChar = null;
    this.notifyChar = null;

    console.log('Connecting GATT...');
    this.server = await this.device.gatt.connect();

    // Small delay after GATT connect before service discovery
    // This helps with timing issues on some devices
    await this.delay(100);

    console.log('Getting service...');
    this.service = await this.server.getPrimaryService(BLE.SERVICE_UUID);

    console.log('Getting characteristics...');
    this.writeChar = await this.service.getCharacteristic(BLE.WRITE_CHAR_UUID);

    // Log characteristic properties for debugging
    const props = this.writeChar.properties;
    console.log('Write characteristic properties:', {
      write: props.write,
      writeWithoutResponse: props.writeWithoutResponse,
      read: props.read,
      notify: props.notify,
    });

    // Determine if we need to use writeValue instead of writeValueWithoutResponse
    this._useWriteWithResponse = !props.writeWithoutResponse && props.write;
    if (this._useWriteWithResponse) {
      console.log('Device requires writeValue (with response)');
    }

    try {
      this.notifyChar = await this.service.getCharacteristic(BLE.NOTIFY_CHAR_UUID);
      await this.notifyChar.startNotifications();

      // Set up notification handler (store reference for cleanup)
      this._notificationHandler = (event) => {
        this.handleNotification(event);
      };
      this.notifyChar.addEventListener('characteristicvaluechanged', this._notificationHandler);

      console.log('Notifications enabled');
    } catch (e) {
      console.warn('Notifications not available:', e.message);
    }

    this.connected = true;
    console.log('Connected to', this.device.name);
  }

  /**
   * Disconnect from device
   */
  async disconnect() {
    // Stop notifications and remove listener before disconnecting
    if (this.notifyChar) {
      try {
        if (this._notificationHandler) {
          this.notifyChar.removeEventListener('characteristicvaluechanged', this._notificationHandler);
        }
        await this.notifyChar.stopNotifications();
      } catch (e) {
        // Ignore errors during cleanup (device may already be disconnected)
      }
    }
    if (this.device && this.device.gatt?.connected) {
      this.device.gatt.disconnect();
    }
    this.connected = false;
    this.device = null;
    this.server = null;
    this.service = null;
    this.writeChar = null;
    this.notifyChar = null;
    this._notificationHandler = null;
  }

  /**
   * Send data to the printer
   */
  async send(data) {
    if (!this.isConnected()) {
      throw new Error('Not connected');
    }

    // Ensure we have a proper ArrayBuffer with only the data we want
    let buffer;
    if (data instanceof ArrayBuffer) {
      buffer = data;
    } else if (data instanceof Uint8Array) {
      // Create a new buffer with just this data (handles slices correctly)
      buffer = new Uint8Array(data).buffer;
    } else {
      buffer = new Uint8Array(data).buffer;
    }

    // Use the appropriate write method based on characteristic properties
    if (this._useWriteWithResponse) {
      await this.writeChar.writeValue(buffer);
    } else {
      try {
        await this.writeChar.writeValueWithoutResponse(buffer);
      } catch (e) {
        // Fallback to writeValue if writeValueWithoutResponse fails
        console.warn('writeValueWithoutResponse failed, trying writeValue:', e.message);
        this._useWriteWithResponse = true;
        await this.writeChar.writeValue(buffer);
      }
    }
  }

  /**
   * Wait for a response from the printer (BLE notification)
   * Used by P12 protocol to wait for status query responses
   * @param {number} timeout - Maximum time to wait in ms (default 500)
   * @returns {Promise<DataView|null>} Response data or null if timeout
   */
  async waitForResponse(timeout = 500) {
    if (!this.notifyChar) {
      // No notification characteristic, use delay fallback
      await this.delay(timeout);
      return null;
    }

    return new Promise((resolve) => {
      const timer = setTimeout(() => {
        this.notifyChar.removeEventListener('characteristicvaluechanged', handler);
        resolve(null);
      }, timeout);

      const handler = (event) => {
        clearTimeout(timer);
        this.notifyChar.removeEventListener('characteristicvaluechanged', handler);
        const data = new Uint8Array(event.target.value.buffer);
        console.log('[BLE Response]', Array.from(data).map(b => b.toString(16).padStart(2, '0')).join(' '));
        resolve(event.target.value);
      };

      this.notifyChar.addEventListener('characteristicvaluechanged', handler);
    });
  }

  /**
   * Send data in chunks with delays
   */
  async sendChunked(data, onProgress = null) {
    const bytes = data instanceof Uint8Array ? data : new Uint8Array(data);
    const totalChunks = Math.ceil(bytes.length / BLE.CHUNK_SIZE);

    for (let i = 0; i < bytes.length; i += BLE.CHUNK_SIZE) {
      const chunk = bytes.slice(i, Math.min(i + BLE.CHUNK_SIZE, bytes.length));
      await this.send(chunk);
      await this.delay(BLE.CHUNK_DELAY_MS);

      if (onProgress) {
        const chunkNum = Math.floor(i / BLE.CHUNK_SIZE) + 1;
        const progress = Math.round((i + chunk.length) / bytes.length * 100);
        onProgress(chunkNum, totalChunks, progress);
      }
    }
  }

  /**
   * Delay helper
   */
  delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Retry a function with exponential backoff
   * @param {Function} fn - Async function to retry
   * @param {number} maxRetries - Maximum number of retries
   * @param {number} delay - Initial delay in ms (doubles each retry)
   * @param {Function} onRetry - Optional callback on retry (receives attempt number, error)
   */
  async retryWithBackoff(fn, maxRetries = BLE.MAX_RETRIES, delay = BLE.INITIAL_RETRY_DELAY_MS, onRetry = null) {
    let lastError;
    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        return await fn();
      } catch (error) {
        lastError = error;
        if (attempt < maxRetries) {
          const waitTime = delay * Math.pow(2, attempt);
          console.log(`Attempt ${attempt + 1} failed: ${error.message}. Retrying in ${waitTime}ms...`);
          if (onRetry) onRetry(attempt + 1, error);
          await this.delay(waitTime);
        }
      }
    }
    throw lastError;
  }

  /**
   * Check if connected and ready to send data
   */
  isConnected() {
    return this.connected &&
           this.device?.gatt?.connected &&
           this.writeChar !== null;
  }

  /**
   * Get device name
   */
  getDeviceName() {
    return this.device?.name || 'Unknown';
  }

  /**
   * Handle notification data from printer
   * Response format: 0x1A, type, data...
   */
  handleNotification(event) {
    const data = new Uint8Array(event.target.value.buffer);
    console.log('[BLE <<<]', Array.from(data).map(b => b.toString(16).padStart(2, '0')).join(' '));

    if (data.length < 2) return;

    // Handle special result/printer type responses (2-3 bytes)
    if (data.length === 2 && data[0] === 0x01) {
      console.log('Result:', data[1]);
      return;
    }
    if (data.length === 3 && data[0] === 0x02) {
      console.log('Printer type:', data[1]);
      return;
    }

    // Standard response format: 0x1A, type, data...
    if (data[0] !== 0x1A) return;
    if (data.length < 3) return; // Need at least 3 bytes for type + value

    const type = data[1];
    let value = null;
    let field = null;

    switch (type) {
      case 0x03: // Hot/heating status
        if (data[2] === 0xA9) value = -1;
        else if (data[2] === 0xA8) value = 0;
        else value = 1;
        field = 'hot';
        break;

      case 0x04: // Battery
        if (data[2] === 0xA4) value = 0;
        else if (data[2] === 0xA3) value = 3;
        else if (data[2] === 0xA2) value = 5;
        else if (data[2] === 0xA1) value = 10;
        else value = data[2];
        field = 'battery';
        this.printerInfo.battery = value;
        break;

      case 0x05: // Cover
        value = data[2] === 0x98 ? 'open' : (data[2] === 0x99 ? 'closed' : 'unknown');
        field = 'cover';
        this.printerInfo.cover = value;
        break;

      case 0x06: // Paper
        value = data[2] === 0x88 ? 'out' : 'ok';
        field = 'paper';
        this.printerInfo.paper = value;
        break;

      case 0x07: // Firmware
        value = this.data2dots(data, 2);
        field = 'firmware';
        this.printerInfo.firmware = value;
        break;

      case 0x08: // Serial
        value = this.data2string(data, 2);
        field = 'serial';
        this.printerInfo.serial = value;
        break;

      case 0x09: // Power
        value = data[2];
        field = 'power';
        this.printerInfo.power = value;
        break;

      case 0x0B: // Print status
        value = data[2] === 0xB8 ? -1 : data[2];
        field = 'print';
        break;

      case 0x0C: // Label
        if (data[2] === 0x0B) value = 0;
        else if (data[2] === 0x26) value = 3;
        else value = 2;
        field = 'label';
        this.printerInfo.label = value;
        break;

      case 0x0D: // MAC
        value = this.data2string(data, 2);
        field = 'mac';
        this.printerInfo.mac = value;
        break;

      case 0x0F: // Print status alt
        value = data[2] === 0x0C ? 1 : data[2];
        field = 'print';
        break;

      case 0x11: // Version
        value = this.data2dots(data, 2);
        field = 'version';
        this.printerInfo.version = value;
        break;

      case 0x17: // Chip
        value = data[2];
        field = 'chip';
        break;

      default:
        console.log('Unknown response type:', type.toString(16));
        return;
    }

    console.log(`Printer ${field}:`, value);

    // Notify callback if set
    if (this.onPrinterInfo) {
      this.onPrinterInfo(field, value, this.printerInfo);
    }
  }

  /**
   * Convert data bytes to dot-separated string (for firmware/version)
   */
  data2dots(data, start) {
    let str = '';
    for (let i = start; i < data.length; i++) {
      str += data[i];
      if (i < data.length - 1) str += '.';
    }
    return str;
  }

  /**
   * Convert data bytes to ASCII string
   */
  data2string(data, start) {
    let str = '';
    for (let i = start; i < data.length; i++) {
      str += String.fromCharCode(data[i]);
    }
    return str;
  }

  /**
   * Query printer for status information
   * @param {string} queryType - One of: battery, firmware, serial, paper, cover, version, mac, power, label
   */
  async query(queryType) {
    if (!this.isConnected()) {
      throw new Error('Not connected');
    }

    const command = QUERY_COMMANDS[queryType];
    if (!command) {
      throw new Error(`Unknown query type: ${queryType}`);
    }

    console.log(`Querying ${queryType}...`);
    await this.send(new Uint8Array(command));
  }

  /**
   * Query all available printer info
   */
  async queryAll() {
    if (!this.isConnected()) {
      throw new Error('Not connected');
    }

    console.log('Querying all printer info...');

    // Query each type with a small delay between
    const queries = ['battery', 'paper', 'firmware', 'serial'];
    for (const q of queries) {
      try {
        await this.query(q);
        await this.delay(100);
      } catch (e) {
        console.warn(`Query ${q} failed:`, e.message);
      }
    }
  }

  /**
   * Get current printer info
   */
  getPrinterInfo() {
    return { ...this.printerInfo };
  }

  /**
   * Reset printer info (on disconnect)
   */
  resetPrinterInfo() {
    this.printerInfo = {
      battery: null,
      paper: null,
      firmware: null,
      serial: null,
      cover: null,
      version: null,
      mac: null,
      power: null,
      label: null,
    };
  }
}
