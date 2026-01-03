/**
 * USB transport for Phomemo printers
 * Uses the 'usb' package for direct USB communication
 */

const usb = require('usb');
const { select } = require('@inquirer/prompts');
const PrinterTransport = require('./base');
const { DEFAULT_USB_VENDOR_ID, DEFAULT_USB_PRODUCT_ID, CHUNK_SIZE_USB } = require('../core/constants');

class USBTransport extends PrinterTransport {
  /**
   * Create a USB transport
   * @param {Object} options - Transport options
   * @param {number} options.vendorId - USB vendor ID (default: 0x483)
   * @param {number} options.productId - USB product ID (default: 0x5740)
   */
  constructor(options = {}) {
    super({ chunkSize: CHUNK_SIZE_USB, ...options });

    this.vendorId = this._parseHexId(options.vendorId, DEFAULT_USB_VENDOR_ID);
    this.productId = this._parseHexId(options.productId, DEFAULT_USB_PRODUCT_ID);

    this.device = null;
    this.interface = null;
    this.endpoint = null;
  }

  /**
   * Parse hex string or number to integer
   */
  _parseHexId(value, defaultValue) {
    if (value === undefined || value === null) return defaultValue;
    if (typeof value === 'number') return value;
    if (typeof value === 'string' && value.startsWith('0x')) {
      return parseInt(value, 16);
    }
    return parseInt(value);
  }

  /**
   * List all available USB devices
   * @returns {Array} List of USB devices
   */
  static listDevices() {
    const devices = usb.getDeviceList();
    console.log(`\nAvailable USB devices (${devices.length} total):`);

    devices.forEach((device, index) => {
      const vid = device.deviceDescriptor.idVendor;
      const pid = device.deviceDescriptor.idProduct;
      console.log(`${index + 1}. Vendor ID: 0x${vid.toString(16)}, Product ID: 0x${pid.toString(16)}`);
    });

    return devices;
  }

  /**
   * Find USB device by vendor and product ID
   * @returns {Object|null} USB device or null
   */
  findDevice() {
    console.log(`Looking for USB device with vendor ID: 0x${this.vendorId.toString(16)} and product ID: 0x${this.productId.toString(16)}`);

    const devices = usb.getDeviceList();
    console.log(`Found ${devices.length} USB devices`);

    const matchingDevices = devices.filter(device => {
      return device.deviceDescriptor.idVendor === this.vendorId &&
             device.deviceDescriptor.idProduct === this.productId;
    });

    console.log(`Found ${matchingDevices.length} matching devices`);
    return matchingDevices.length > 0 ? matchingDevices[0] : null;
  }

  /**
   * Prompt user to select a USB device
   * @returns {Promise<Object>} Selected USB device
   */
  async selectDevice() {
    const devices = usb.getDeviceList();

    if (devices.length === 0) {
      throw new Error('No USB devices found');
    }

    const choices = devices.map((device, index) => ({
      name: `${index + 1}. Vendor ID: 0x${device.deviceDescriptor.idVendor.toString(16)}, Product ID: 0x${device.deviceDescriptor.idProduct.toString(16)}`,
      value: index,
    }));

    const deviceIndex = await select({
      message: 'Select a USB device:',
      choices,
    });

    return devices[deviceIndex];
  }

  /**
   * Connect to the USB device
   * @param {Object} options - Connection options
   * @param {boolean} options.autoSelect - Prompt for device selection if not found
   */
  async connect(options = {}) {
    const { autoSelect = true } = options;

    // List devices for debugging
    USBTransport.listDevices();

    // Try to find the configured device
    this.device = this.findDevice();

    // If not found and autoSelect is enabled, prompt user
    if (!this.device && autoSelect) {
      console.log('\nSpecified device not found. Please select from available devices:');
      this.device = await this.selectDevice();
    }

    if (!this.device) {
      throw new Error('No USB device selected');
    }

    try {
      // Open the device
      this.device.open();

      // Find the interface
      const interfaces = this.device.interfaces;

      if (interfaces.length === 0) {
        throw new Error('No interfaces found on the device');
      }

      console.log(`Device has ${interfaces.length} interfaces`);

      // Try to find a printer interface (typically class 7)
      const printerInterfaces = interfaces.filter(iface =>
        iface.descriptor.bInterfaceClass === 7
      );

      if (printerInterfaces.length > 0) {
        console.log(`Found ${printerInterfaces.length} printer interfaces`);
        this.interface = printerInterfaces[0];
      } else {
        console.log('No printer interfaces found, using the first interface');
        this.interface = interfaces[0];
      }

      // Log interface details
      console.log(`Using interface ${this.interface.interfaceNumber}`);
      console.log(`Interface class: ${this.interface.descriptor.bInterfaceClass}`);
      console.log(`Interface subclass: ${this.interface.descriptor.bInterfaceSubClass}`);
      console.log(`Interface protocol: ${this.interface.descriptor.bInterfaceProtocol}`);

      // Try to claim the interface
      try {
        this.interface.claim();
      } catch (error) {
        console.warn(`Warning: Could not claim interface: ${error.message}`);
        console.log('Attempting to proceed anyway...');
      }

      // Find OUT endpoint (to send data to printer)
      const endpoints = this.interface.endpoints;
      console.log(`Interface has ${endpoints.length} endpoints`);

      endpoints.forEach((endpoint, i) => {
        console.log(`Endpoint ${i + 1}: Address 0x${endpoint.descriptor.bEndpointAddress.toString(16)}, Direction: ${endpoint.direction === 'out' ? 'OUT' : 'IN'}`);
      });

      this.endpoint = endpoints.find(endpoint => endpoint.direction === 'out');

      if (!this.endpoint) {
        throw new Error('No OUT endpoint found for sending data');
      }

      console.log(`Using OUT endpoint with address 0x${this.endpoint.descriptor.bEndpointAddress.toString(16)}`);

      this.connected = true;
    } catch (error) {
      // Clean up on error
      if (this.device && this.device.opened) {
        this.device.close();
      }
      throw error;
    }
  }

  /**
   * Send data to the printer
   * @param {Buffer|Uint8Array} data - Data to send
   */
  async send(data) {
    if (!this.connected || !this.endpoint) {
      throw new Error('Not connected to USB device');
    }

    return new Promise((resolve, reject) => {
      const buffer = Buffer.isBuffer(data) ? data : Buffer.from(data);
      this.endpoint.transfer(buffer, (error) => {
        if (error) reject(error);
        else resolve();
      });
    });
  }

  /**
   * Disconnect from the USB device
   */
  async disconnect() {
    if (this.interface) {
      try {
        await new Promise((resolve, reject) => {
          this.interface.release(true, (err) => {
            if (err) {
              console.warn(`Warning: Error releasing interface: ${err.message}`);
            }
            resolve();
          });
        });
      } catch (err) {
        console.warn(`Warning: Error during interface release: ${err.message}`);
      }
    }

    if (this.device && this.device.opened) {
      try {
        this.device.close();
        console.log('USB device closed');
      } catch (err) {
        console.warn(`Warning: Error closing device: ${err.message}`);
      }
    }

    this.connected = false;
    this.device = null;
    this.interface = null;
    this.endpoint = null;
  }

  /**
   * Get transport type name
   */
  getType() {
    return 'usb';
  }
}

module.exports = USBTransport;
