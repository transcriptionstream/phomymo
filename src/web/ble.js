/**
 * Web Bluetooth transport for Phomymo
 *
 * Features:
 * - First connection requires user to select device from picker
 * - Once connected, device is remembered for reconnection
 * - Automatic retry with exponential backoff for reliable connections
 * - Handles timing issues common with BLE GATT connections
 */

// Default UUIDs for Phomemo printers
const DEFAULT_SERVICE_UUID = 0xff00;
const DEFAULT_WRITE_CHAR_UUID = 0xff02;
const DEFAULT_NOTIFY_CHAR_UUID = 0xff03;

// BLE transfer settings
const CHUNK_SIZE = 128;
const CHUNK_DELAY = 20;

// Connection retry settings
const MAX_RETRIES = 1;  // Reduced - we'll get a fresh device from picker if "Unsupported"
const INITIAL_RETRY_DELAY = 300; // ms

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
   */
  async connect() {
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
          MAX_RETRIES,
          INITIAL_RETRY_DELAY
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

      // Use name prefix filter to show Phomemo printers
      // This helps filter out ghost devices while still showing the printer
      try {
        this.device = await navigator.bluetooth.requestDevice({
          filters: [
            { namePrefix: 'M' },      // M110, M220, M260, etc.
            { namePrefix: 'D' },      // D30, D110, etc.
            { namePrefix: 'Phomemo' },
          ],
          optionalServices: [DEFAULT_SERVICE_UUID],
        });
      } catch (filterError) {
        console.log('Name filter failed, trying acceptAllDevices:', filterError.message);
        this.device = await navigator.bluetooth.requestDevice({
          acceptAllDevices: true,
          optionalServices: [DEFAULT_SERVICE_UUID],
        });
      }

      console.log('Selected:', this.device.name);

      // Wait for device to be ready
      await this.waitForDeviceReady();

      try {
        // Try to connect with retries
        await this.retryWithBackoff(
          () => this.connectGATT(),
          MAX_RETRIES,
          INITIAL_RETRY_DELAY,
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
        this.notifyChar = null;
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
    this.service = await this.server.getPrimaryService(DEFAULT_SERVICE_UUID);

    console.log('Getting characteristics...');
    this.writeChar = await this.service.getCharacteristic(DEFAULT_WRITE_CHAR_UUID);

    try {
      this.notifyChar = await this.service.getCharacteristic(DEFAULT_NOTIFY_CHAR_UUID);
      await this.notifyChar.startNotifications();
      console.log('Notifications enabled');
    } catch (e) {
      console.warn('Notifications not available');
    }

    this.connected = true;
    console.log('Connected to', this.device.name);
  }

  /**
   * Disconnect from device
   */
  async disconnect() {
    if (this.device && this.device.gatt.connected) {
      this.device.gatt.disconnect();
    }
    this.connected = false;
    this.device = null;
    this.server = null;
    this.service = null;
    this.writeChar = null;
    this.notifyChar = null;
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

    await this.writeChar.writeValueWithoutResponse(buffer);
  }

  /**
   * Send data in chunks with delays
   */
  async sendChunked(data, onProgress = null) {
    const bytes = data instanceof Uint8Array ? data : new Uint8Array(data);
    const totalChunks = Math.ceil(bytes.length / CHUNK_SIZE);

    for (let i = 0; i < bytes.length; i += CHUNK_SIZE) {
      const chunk = bytes.slice(i, Math.min(i + CHUNK_SIZE, bytes.length));
      await this.send(chunk);
      await this.delay(CHUNK_DELAY);

      if (onProgress) {
        const chunkNum = Math.floor(i / CHUNK_SIZE) + 1;
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
  async retryWithBackoff(fn, maxRetries = MAX_RETRIES, delay = INITIAL_RETRY_DELAY, onRetry = null) {
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
}
