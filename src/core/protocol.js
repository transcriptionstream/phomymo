/**
 * ESC/POS protocol command builders for Phomemo printers
 */

// Command constants
const COMMANDS = {
  // ESC @ - Initialize printer
  INIT: Buffer.from([0x1B, 0x40]),

  // ESC d n - Feed n lines
  FEED: (lines) => Buffer.from([0x1B, 0x64, lines]),

  // ESC J n - Feed by units (dots)
  FEED_UNITS: (units) => Buffer.from([0x1B, 0x4A, units]),

  // ESC 3 n - Set line spacing to n dots
  LINE_SPACING: (dots) => Buffer.from([0x1B, 0x33, dots]),

  // ESC 2 - Default line spacing
  DEFAULT_LINE_SPACING: Buffer.from([0x1B, 0x32]),

  // ESC a 1 - Center alignment
  CENTER_ALIGN: Buffer.from([0x1B, 0x61, 0x01]),

  // ESC a 0 - Left alignment
  LEFT_ALIGN: Buffer.from([0x1B, 0x61, 0x00]),

  // GS | n - Set print density (1-8)
  DENSITY: (level) => Buffer.from([0x1D, 0x7C, level]),

  // GS v 0 0 - Start raster graphic mode
  RASTER: Buffer.from([0x1D, 0x76, 0x30, 0x00]),
};

/**
 * Build a raster header for USB printing
 * @param {number} widthBytes - Width in bytes
 * @param {number} heightLines - Height in lines
 * @returns {Buffer}
 */
function buildRasterHeader(widthBytes, heightLines) {
  return Buffer.from([
    0x1D, 0x76, 0x30, 0x00,  // GS v 0 0
    widthBytes & 0xFF,
    (widthBytes >> 8) & 0xFF,
    heightLines & 0xFF,
    (heightLines >> 8) & 0xFF,
  ]);
}

/**
 * Build a combined header for BLE printing (D30 style)
 * Combines INIT + RASTER command
 * @param {number} mmWidth - Width in mm (for BLE, this is image width / 8)
 * @param {number} bytesPerRow - Bytes per row of image data
 * @returns {Uint8Array}
 */
function buildBleHeader(mmWidth, bytesPerRow) {
  return new Uint8Array([
    0x1B, 0x40,              // ESC @ - Initialize
    0x1D, 0x76, 0x30, 0x00,  // GS v 0 0 - Raster mode
    mmWidth % 256,
    Math.floor(mmWidth / 256),
    bytesPerRow % 256,
    Math.floor(bytesPerRow / 256),
  ]);
}

/**
 * Build end sequence for BLE printing
 * @returns {Uint8Array}
 */
function buildBleEndSequence() {
  return new Uint8Array([0x1B, 0x64, 0x00]);
}

/**
 * Build initialization sequence for USB printing
 * @param {Object} options - Print options
 * @param {number} options.density - Print density (1-8)
 * @param {number} options.lineSpacing - Line spacing in dots
 * @param {boolean} options.center - Whether to center align
 * @returns {Buffer[]} Array of command buffers to send in sequence
 */
function buildInitSequence(options = {}) {
  const {
    density = 6,
    lineSpacing = 0,
    center = true,
  } = options;

  const commands = [
    COMMANDS.INIT,
    COMMANDS.LINE_SPACING(lineSpacing),
    center ? COMMANDS.CENTER_ALIGN : COMMANDS.LEFT_ALIGN,
    COMMANDS.DENSITY(density),
  ];

  return commands;
}

module.exports = {
  COMMANDS,
  buildRasterHeader,
  buildBleHeader,
  buildBleEndSequence,
  buildInitSequence,
};
