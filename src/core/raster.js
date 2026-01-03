/**
 * Raster conversion for thermal printers
 * Converts grayscale image data to 1-bit raster format
 */

const { PRINTER_FULL_WIDTH_BYTES, pixelsToBytes } = require('./constants');
const { buildRasterHeader } = require('./protocol');

/**
 * Convert grayscale pixel data to raster format for USB printing
 * Uses black=1, white=0 bit polarity
 *
 * @param {Object} imageData - Image data object
 * @param {Buffer|Uint8Array} imageData.data - Grayscale pixel values (0-255)
 * @param {number} imageData.width - Image width in pixels
 * @param {number} imageData.height - Image height in pixels
 * @param {Object} options - Conversion options
 * @param {number} options.printerWidthBytes - Full printer width in bytes (default: 72)
 * @param {number} options.offset - Horizontal offset in bytes (default: 0)
 * @param {number} options.threshold - Black/white threshold (default: 128)
 * @returns {Buffer} Raster data ready to send to printer
 */
function convertToRasterFormat(imageData, options = {}) {
  const {
    printerWidthBytes = PRINTER_FULL_WIDTH_BYTES,
    offset = 0,
    threshold = 128,
  } = options;

  const { data, width, height } = imageData;
  const imageBytesPerLine = pixelsToBytes(width);

  let rasterData = [];

  // Process the image in chunks of up to 255 lines (protocol limit)
  for (let startLine = 0; startLine < height; startLine += 255) {
    const chunkLines = Math.min(255, height - startLine);

    // Add raster command header
    const header = buildRasterHeader(printerWidthBytes, chunkLines);
    rasterData.push(...header);

    // Process each line in this chunk
    for (let y = 0; y < chunkLines; y++) {
      const lineIndex = startLine + y;

      // Create a full-width buffer for this line, initialized to zeros (white)
      const lineBuffer = Buffer.alloc(printerWidthBytes, 0);

      // Calculate left position including offset
      const leftPosition = Math.floor((printerWidthBytes - imageBytesPerLine) / 2) + offset;

      // For each byte in our image
      for (let x = 0; x < imageBytesPerLine; x++) {
        const targetPos = leftPosition + x;

        // Skip if this position is outside the printable width
        if (targetPos < 0 || targetPos >= printerWidthBytes) continue;

        // Create the byte from 8 pixels
        let byte = 0;
        for (let bit = 0; bit < 8; bit++) {
          const pixelX = x * 8 + bit;

          // Skip pixels beyond the width
          if (pixelX >= width) continue;

          // Get the pixel value from the image data
          const pixelPos = lineIndex * width + pixelX;
          const pixelValue = pixelPos < data.length ? data[pixelPos] : 255;

          // Set the bit if the pixel is black (< threshold)
          // USB uses black=1, white=0
          if (pixelValue < threshold) {
            byte |= (1 << (7 - bit));
          }
        }

        lineBuffer[targetPos] = byte;
      }

      // Add the entire line buffer to the raster data
      for (let i = 0; i < printerWidthBytes; i++) {
        rasterData.push(lineBuffer[i]);
      }
    }
  }

  return Buffer.from(rasterData);
}

/**
 * Convert canvas image data to raster format for BLE printing
 * Uses black=0, white=1 bit polarity (D30 style)
 *
 * @param {Uint8Array} imageData - RGBA image data from canvas
 * @param {number} width - Image width in pixels
 * @param {number} height - Image height in pixels
 * @returns {Uint8Array} Raster data (without header)
 */
function convertCanvasToRaster(imageData, width, height) {
  const bytesPerRow = Math.ceil(width / 8);
  const data = new Uint8Array(bytesPerRow * height);
  let offset = 0;

  for (let y = 0; y < height; y++) {
    for (let byteX = 0; byteX < bytesPerRow; byteX++) {
      let byte = 0;
      for (let bit = 0; bit < 8; bit++) {
        const x = byteX * 8 + bit;
        if (x >= width) continue;

        // Get RGBA values
        const idx = (y * width + x) * 4;
        const r = imageData[idx];
        const g = imageData[idx + 1];
        const b = imageData[idx + 2];

        // BLE uses black=0, white=1
        // If any color channel > 0, treat as white (don't print)
        const isWhite = (r + g + b) > 0 ? 1 : 0;
        byte |= (isWhite << (7 - bit));
      }
      data[offset++] = byte;
    }
  }

  return data;
}

/**
 * Create an alignment test pattern
 *
 * @param {Object} options - Test pattern options
 * @param {number} options.widthBytes - Width in bytes (default: 72)
 * @param {number} options.height - Height in dots (default: 120)
 * @param {number} options.horizontalOffset - Horizontal offset in bytes (default: 0)
 * @returns {Buffer} Complete raster data including header
 */
function createTestPattern(options = {}) {
  const {
    widthBytes = PRINTER_FULL_WIDTH_BYTES,
    height = 120,
    horizontalOffset = 0,
  } = options;

  let patternData = [];

  // Add raster command header
  const header = buildRasterHeader(widthBytes, height);
  patternData.push(...header);

  const centerPos = Math.floor(widthBytes / 2) + horizontalOffset;

  for (let y = 0; y < height; y++) {
    const lineBuffer = Buffer.alloc(widthBytes, 0);

    // Horizontal grid lines every 10 dots
    if (y % 10 === 0) {
      for (let x = 0; x < widthBytes; x++) {
        lineBuffer[x] = 0xFF;
      }
    }

    // Add markers and patterns for other lines
    for (let x = 0; x < widthBytes; x++) {
      // Center line
      if (x === Math.max(0, Math.min(widthBytes - 1, centerPos)) && y % 5 !== 0) {
        lineBuffer[x] = 0xFF;
      }
      // Left and right edges
      else if ((x === 0 || x === widthBytes - 1) && y % 10 !== 0) {
        lineBuffer[x] = 0xFF;
      }
      // Vertical grid lines every 8 bytes
      else if (x % 8 === 0 && y % 10 !== 0 && y % 5 !== 0) {
        lineBuffer[x] = 0x80;
      }
    }

    // Mid-height reference line
    if (y === Math.floor(height / 2)) {
      for (let x = 0; x < widthBytes; x++) {
        lineBuffer[x] = 0xAA;
      }
    }

    for (let i = 0; i < widthBytes; i++) {
      patternData.push(lineBuffer[i]);
    }
  }

  return Buffer.from(patternData);
}

module.exports = {
  convertToRasterFormat,
  convertCanvasToRaster,
  createTestPattern,
};
