/**
 * Abstract base class for printer transports
 * Defines the interface that USB and BLE transports must implement
 */

const { CHUNK_SIZE_USB, DELAY_BETWEEN_CHUNKS } = require('../core/constants');

class PrinterTransport {
  /**
   * Create a new transport
   * @param {Object} options - Transport options
   * @param {number} options.chunkSize - Size of data chunks (default: 512 for USB)
   * @param {number} options.chunkDelay - Delay between chunks in ms (default: 20)
   */
  constructor(options = {}) {
    this.chunkSize = options.chunkSize || CHUNK_SIZE_USB;
    this.chunkDelay = options.chunkDelay || DELAY_BETWEEN_CHUNKS;
    this.connected = false;
  }

  /**
   * Connect to the printer device
   * @returns {Promise<void>}
   */
  async connect() {
    throw new Error('connect() must be implemented by subclass');
  }

  /**
   * Disconnect from the printer
   * @returns {Promise<void>}
   */
  async disconnect() {
    throw new Error('disconnect() must be implemented by subclass');
  }

  /**
   * Send raw bytes to the printer
   * @param {Buffer|Uint8Array} data - Data to send
   * @returns {Promise<void>}
   */
  async send(data) {
    throw new Error('send() must be implemented by subclass');
  }

  /**
   * Check if transport is connected
   * @returns {boolean}
   */
  isConnected() {
    return this.connected;
  }

  /**
   * Delay utility
   * @param {number} ms - Milliseconds to delay
   * @returns {Promise<void>}
   */
  delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Send data in chunks with delays between each chunk
   * @param {Buffer|Uint8Array} data - Data to send
   * @param {Function} onProgress - Optional progress callback (chunkIndex, totalChunks, bytesSent)
   * @returns {Promise<void>}
   */
  async sendChunked(data, onProgress = null) {
    const totalChunks = Math.ceil(data.length / this.chunkSize);

    for (let i = 0; i < data.length; i += this.chunkSize) {
      const chunk = data.slice(i, Math.min(i + this.chunkSize, data.length));
      await this.send(chunk);

      if (onProgress) {
        const chunkIndex = Math.floor(i / this.chunkSize) + 1;
        onProgress(chunkIndex, totalChunks, Math.min(i + this.chunkSize, data.length));
      }

      if (this.chunkDelay > 0 && i + this.chunkSize < data.length) {
        await this.delay(this.chunkDelay);
      }
    }
  }

  /**
   * Get transport type name
   * @returns {string}
   */
  getType() {
    return 'base';
  }
}

module.exports = PrinterTransport;
