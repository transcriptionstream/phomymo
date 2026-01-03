/**
 * Shared constants for Phomymo printer
 */

// Printer resolution
const PRINTER_DPI = 203;

// Standard printer width for thermal printers (72 bytes = 576 pixels)
const PRINTER_FULL_WIDTH_BYTES = 72;

// Chunk sizes for different transports
const CHUNK_SIZE_USB = 512;
const CHUNK_SIZE_BLE = 128;

// Delays between operations (milliseconds)
const DELAY_BETWEEN_CHUNKS = 20;
const DELAY_BETWEEN_COMMANDS = 50;
const DELAY_AFTER_INIT = 100;

// Default print density (1-8)
const DEFAULT_DENSITY = 6;

// Default margins in mm
const DEFAULT_MARGIN_MM = 2;

// Define common label sizes (width in mm, length in mm)
const LABEL_SIZES = {
  'M200': { name: 'Phomemo M200 (53mm)', widthMm: 53, lengthMm: 30 },
  'M260': { name: 'Phomemo M260 (53mm)', widthMm: 53, lengthMm: 30 },
  '40x30': { name: 'Label 40mm x 30mm', widthMm: 40, lengthMm: 30 },
  '60x40': { name: 'Label 60mm x 40mm', widthMm: 60, lengthMm: 40 },
  'custom': { name: 'Custom Size', widthMm: null, lengthMm: null }
};

// BLE UUIDs - starting with D30 values, may need adjustment for M260
const BLE_PROFILES = {
  D30: {
    SERVICE_UUID: '0000ff00-0000-1000-8000-00805f9b34fb',
    CHARACTERISTIC_UUID: '0000ff02-0000-1000-8000-00805f9b34fb',
  },
  M260: {
    // Start with D30 values - will update after discovery
    SERVICE_UUID: '0000ff00-0000-1000-8000-00805f9b34fb',
    CHARACTERISTIC_UUID: '0000ff02-0000-1000-8000-00805f9b34fb',
  },
  // Alternative ISSC profile used by some Phomemo printers
  ISSC: {
    SERVICE_UUID: '49535343-fe7d-4ae5-8fa9-9fafd205e455',
    CHARACTERISTIC_TX_UUID: '49535343-8841-43f4-a8d4-ecbe34729bb3',
    CHARACTERISTIC_RX_UUID: '49535343-1e4d-4bd9-ba61-23c647249616',
  },
};

// Default USB IDs for Phomemo printers
const DEFAULT_USB_VENDOR_ID = 0x483;
const DEFAULT_USB_PRODUCT_ID = 0x5740;

// Utility functions
function mmToPixels(mm) {
  const inches = mm / 25.4;
  return Math.floor(inches * PRINTER_DPI);
}

function pixelsToBytes(pixels) {
  return Math.ceil(pixels / 8);
}

module.exports = {
  PRINTER_DPI,
  PRINTER_FULL_WIDTH_BYTES,
  CHUNK_SIZE_USB,
  CHUNK_SIZE_BLE,
  DELAY_BETWEEN_CHUNKS,
  DELAY_BETWEEN_COMMANDS,
  DELAY_AFTER_INIT,
  DEFAULT_DENSITY,
  DEFAULT_MARGIN_MM,
  LABEL_SIZES,
  BLE_PROFILES,
  DEFAULT_USB_VENDOR_ID,
  DEFAULT_USB_PRODUCT_ID,
  mmToPixels,
  pixelsToBytes,
};
