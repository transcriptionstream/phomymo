/**
 * Abstract base class for printer profiles
 * Defines printer-specific constants and behaviors
 */

const { COMMANDS, buildInitSequence, buildRasterHeader } = require('../core/protocol');
const { convertToRasterFormat, createTestPattern } = require('../core/raster');
const { processImage, calculateLabelPixels } = require('../core/image');
const { DELAY_BETWEEN_COMMANDS, DELAY_AFTER_INIT, PRINTER_FULL_WIDTH_BYTES } = require('../core/constants');

class PrinterProfile {
  /**
   * Create a printer profile
   * @param {PrinterTransport} transport - The transport to use
   */
  constructor(transport) {
    this.transport = transport;
  }

  /**
   * Get printer-specific constants
   * Must be overridden by subclasses
   */
  get constants() {
    throw new Error('constants getter must be implemented by subclass');
  }

  /**
   * Initialize the printer
   * @param {Object} options - Initialization options
   * @param {number} options.density - Print density (1-8)
   * @param {number} options.initialFeed - Initial feed in dots
   */
  async initialize(options = {}) {
    const {
      density = 6,
      initialFeed = 12,
    } = options;

    console.log('Initializing printer...');

    const isBLE = this.transport.getType().includes('ble');

    if (isBLE) {
      // BLE: skip init here - it's sent in _printImageBLE right before data
      console.log('BLE mode - init will be sent with print data');
    } else {
      // USB: full init sequence
      const initCommands = buildInitSequence({ density, lineSpacing: 0, center: true });

      for (const command of initCommands) {
        await this.transport.send(command);
        await this.transport.delay(DELAY_BETWEEN_COMMANDS);
      }

      await this.transport.delay(DELAY_AFTER_INIT);

      // Initial feed
      if (initialFeed > 0) {
        console.log(`Initial feed: ${initialFeed} dots`);
        await this.transport.send(COMMANDS.FEED_UNITS(initialFeed));
        await this.transport.delay(DELAY_AFTER_INIT);
      }
    }
  }

  /**
   * Print an image file
   * @param {string} imagePath - Path to the image
   * @param {Object} labelConfig - Label configuration
   * @param {number} labelConfig.widthMm - Label width in mm
   * @param {number} labelConfig.lengthMm - Label length in mm
   * @param {Object} options - Print options
   * @param {number} options.margin - Margin in mm
   * @param {number} options.offset - Horizontal offset in bytes
   * @param {number} options.voffset - Vertical offset in dots
   * @param {number} options.finalFeed - Final feed in dots
   */
  async printImage(imagePath, labelConfig, options = {}) {
    const {
      margin = 2,
      offset = 0,
      voffset = 0,
      finalFeed = 30,
    } = options;

    const isBLE = this.transport.getType().includes('ble');

    if (isBLE) {
      // BLE: use simple direct approach that works reliably
      await this._printImageBLE(imagePath, labelConfig, options);
    } else {
      // USB: use existing chunked approach
      await this._printImageUSB(imagePath, labelConfig, options);
    }
  }

  /**
   * Print image via BLE using simple direct approach
   */
  async _printImageBLE(imagePath, labelConfig, options = {}) {
    const { finalFeed = 30 } = options;
    const sharp = require('sharp');

    // For BLE, use full printer width and calculate height from label
    const widthBytes = PRINTER_FULL_WIDTH_BYTES;  // 72 bytes = 576 pixels
    const widthPixels = widthBytes * 8;

    // Calculate height: use 8 pixels per mm (203 DPI ≈ 8 px/mm)
    const heightLines = Math.round(labelConfig.lengthMm * 8);

    console.log(`BLE print: ${widthBytes} bytes x ${heightLines} lines`);

    // Process image to fit label
    const image = await sharp(imagePath)
      .resize({
        width: widthPixels,
        height: heightLines,
        fit: 'contain',
        background: { r: 255, g: 255, b: 255 }
      })
      .greyscale()
      .threshold(128)
      .raw()
      .toBuffer({ resolveWithObject: true });

    console.log(`Processed: ${image.info.width}x${image.info.height}`);

    // Convert to 1-bit raster (black=1, white=0)
    const data = Buffer.alloc(widthBytes * heightLines, 0);

    for (let y = 0; y < heightLines; y++) {
      for (let byteX = 0; byteX < widthBytes; byteX++) {
        let byte = 0;
        for (let bit = 0; bit < 8; bit++) {
          const x = byteX * 8 + bit;
          if (x >= image.info.width) continue;

          const pixelPos = y * image.info.width + x;
          const pixelValue = image.data[pixelPos];

          // Black pixel = set bit to 1
          if (pixelValue < 128) {
            byte |= (1 << (7 - bit));
          }
        }
        data[y * widthBytes + byteX] = byte;
      }
    }

    // BLE: Send init here (must be right before raster data)
    console.log('Sending init...');
    await this.transport.send(Buffer.from([0x1b, 0x40]));
    await this.transport.delay(200);

    // Send raster header separately (critical for BLE!)
    console.log('Sending header...');
    await this.transport.send(Buffer.from([
      0x1d, 0x76, 0x30, 0x00,
      widthBytes, 0x00,
      heightLines & 0xFF, (heightLines >> 8) & 0xFF
    ]));

    // Send data in chunks
    console.log('Sending data...');
    const chunkSize = 128;
    const totalChunks = Math.ceil(data.length / chunkSize);

    for (let i = 0; i < data.length; i += chunkSize) {
      const chunk = data.slice(i, Math.min(i + chunkSize, data.length));
      await this.transport.send(Buffer.from(chunk));
      await this.transport.delay(20);

      const chunkNum = Math.floor(i / chunkSize) + 1;
      const progress = Math.round((i + chunk.length) / data.length * 100);
      console.log(`Sent chunk ${chunkNum}/${totalChunks} (${progress}%)`);
    }

    // Feed after print
    await this.transport.delay(300);
    console.log('Sending feed...');
    await this.transport.send(Buffer.from([0x1b, 0x4a, 0x20]));
    await this.transport.delay(800);

    console.log('\nPrint job completed!');
  }

  /**
   * Print image via USB using chunked approach
   */
  async _printImageUSB(imagePath, labelConfig, options = {}) {
    const {
      margin = 2,
      offset = 0,
      voffset = 0,
      finalFeed = 30,
    } = options;

    // Calculate label dimensions
    const labelPixels = calculateLabelPixels(labelConfig.widthMm, labelConfig.lengthMm);
    console.log(`Label dimensions: ${labelPixels.widthPixels}x${labelPixels.heightPixels} pixels`);

    // Process the image
    console.log('\nProcessing image...');
    const imageData = await processImage(imagePath, labelPixels, {
      marginMm: margin,
      verticalOffset: voffset,
    });

    // Convert to raster format
    const rasterData = convertToRasterFormat(imageData, {
      printerWidthBytes: this.constants.FULL_WIDTH_BYTES,
      offset,
    });
    console.log(`Generated ${rasterData.length} bytes of raster data`);

    // Send raster data
    console.log('\nSending data to printer...');
    await this.transport.sendChunked(rasterData, (chunk, total, bytes) => {
      const progress = Math.round((bytes / rasterData.length) * 100);
      console.log(`Sent chunk ${chunk}/${total} (${progress}%)`);
    });

    // Final feed
    if (finalFeed > 0) {
      console.log(`Final feed: ${finalFeed} dots`);
      await this.transport.send(COMMANDS.FEED_UNITS(finalFeed));
    }

    console.log('\nPrint job completed!');
  }

  /**
   * Print a test pattern
   * @param {Object} options - Test pattern options
   * @param {number} options.horizontalOffset - Horizontal offset in bytes
   * @param {number} options.finalFeed - Final feed in dots
   */
  async printTestPattern(options = {}) {
    const {
      horizontalOffset = 0,
      finalFeed = 30,
    } = options;

    console.log('Printing test pattern to help with alignment...');

    const testPatternData = createTestPattern({
      widthBytes: this.constants.FULL_WIDTH_BYTES,
      horizontalOffset,
    });

    await this.transport.send(testPatternData);

    if (finalFeed > 0) {
      console.log(`Final feed: ${finalFeed} dots`);
      await this.transport.send(COMMANDS.FEED_UNITS(finalFeed));
    }

    console.log('Test pattern printed successfully!');
  }
}

module.exports = PrinterProfile;
