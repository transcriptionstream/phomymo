/**
 * Printer protocol for Phomemo printers
 * Handles print commands for both USB and BLE transports
 * Supports M-series (M110, M200, M220, M260) and D-series (D30, D110)
 */

/**
 * Convert density level (1-8) to heat time value
 * Higher heat time = darker print
 */
function densityToHeatTime(density) {
  // Map density 1-8 to heat time values
  // Range approximately 40-200 (40=very light, 200=very dark)
  const heatTimes = [40, 60, 80, 100, 120, 140, 160, 200];
  return heatTimes[Math.max(0, Math.min(7, density - 1))];
}

// ESC/POS commands for M-series
const CMD = {
  INIT: new Uint8Array([0x1b, 0x40]),
  FEED: (dots) => new Uint8Array([0x1b, 0x4a, dots]),
  // Standard ESC/POS density (GS | n) - may not work on all printers
  DENSITY: (level) => new Uint8Array([0x1d, 0x7c, level]),
  // ESC 7 - Heat settings (n1=max dots, n2=heat time, n3=heat interval)
  // Heat time (n2): higher = darker, range ~3-255, default ~80
  // This command is common on Chinese thermal printers
  HEAT_SETTINGS: (maxDots, heatTime, heatInterval) =>
    new Uint8Array([0x1b, 0x37, maxDots, heatTime, heatInterval]),
  LINE_SPACING: (dots) => new Uint8Array([0x1b, 0x33, dots]),
  RASTER_HEADER: (widthBytes, heightLines) => new Uint8Array([
    0x1d, 0x76, 0x30, 0x00,
    widthBytes, 0x00,
    heightLines & 0xff, (heightLines >> 8) & 0xff,
  ]),
};

// D-series (D30, D110) specific commands
const D_CMD = {
  // D30 header includes init inline: ESC @ GS v 0 \0 widthLow widthHigh rowsLow rowsHigh
  HEADER: (widthBytes, rows) => new Uint8Array([
    0x1b, 0x40,           // ESC @ - Initialize
    0x1d, 0x76, 0x30, 0x00, // GS v 0 \0 - Raster bit image
    widthBytes % 256,
    Math.floor(widthBytes / 256),
    rows % 256,
    Math.floor(rows / 256),
  ]),
  END: new Uint8Array([0x1b, 0x64, 0x00]),
};

/**
 * Detect if device is D-series based on name
 */
export function isDSeriesPrinter(deviceName) {
  if (!deviceName) return false;
  const name = deviceName.toUpperCase();
  return name.startsWith('D30') || name.startsWith('D110') || name.startsWith('D');
}

/**
 * Detect if device is a narrow M-series printer (M110, M200)
 * These have 48mm print width vs 60mm+ for M220/M260
 */
export function isNarrowMSeriesPrinter(deviceName) {
  if (!deviceName) return false;
  const name = deviceName.toUpperCase();
  return name.startsWith('M110') || name.startsWith('M200');
}

/**
 * Get the maximum print width in bytes for a given printer
 * M110/M200: 48 bytes (384 pixels, ~48mm at 203 DPI)
 * M220/M260: 72 bytes (576 pixels, ~72mm at 203 DPI)
 * D-series: varies by label, handled separately
 */
export function getPrinterWidthBytes(deviceName) {
  if (isNarrowMSeriesPrinter(deviceName)) {
    return 48;  // 384 pixels = 48mm
  }
  return 72;  // 576 pixels = 72mm (M220, M260, etc.)
}

/**
 * Rotate raster data 90 degrees clockwise for D-series printers
 * D-series prints labels top-to-bottom, so we need to rotate the image
 *
 * @param {Uint8Array} data - Original raster data (1 bit per pixel, packed in bytes)
 * @param {number} widthBytes - Width in bytes (8 pixels per byte)
 * @param {number} heightLines - Height in lines
 * @returns {Object} { data, widthBytes, heightLines } - Rotated raster data
 */
function rotateRaster90CW(data, widthBytes, heightLines) {
  const srcWidthPx = widthBytes * 8;
  const srcHeightPx = heightLines;

  // After 90° CW rotation: new width = old height, new height = old width
  const dstWidthPx = srcHeightPx;
  const dstHeightPx = srcWidthPx;
  const dstWidthBytes = Math.ceil(dstWidthPx / 8);

  const rotated = new Uint8Array(dstWidthBytes * dstHeightPx);

  // For each pixel in source, calculate its position in destination
  for (let srcY = 0; srcY < srcHeightPx; srcY++) {
    for (let srcX = 0; srcX < srcWidthPx; srcX++) {
      // Get source pixel
      const srcByteIdx = srcY * widthBytes + Math.floor(srcX / 8);
      const srcBitIdx = 7 - (srcX % 8);
      const pixel = (data[srcByteIdx] >> srcBitIdx) & 1;

      // 90° CW rotation: (x, y) -> (height - 1 - y, x)
      const dstX = srcHeightPx - 1 - srcY;
      const dstY = srcX;

      // Set destination pixel
      const dstByteIdx = dstY * dstWidthBytes + Math.floor(dstX / 8);
      const dstBitIdx = 7 - (dstX % 8);
      if (pixel) {
        rotated[dstByteIdx] |= (1 << dstBitIdx);
      }
    }
  }

  return {
    data: rotated,
    widthBytes: dstWidthBytes,
    heightLines: dstHeightPx,
  };
}

/**
 * Print raster data to a Phomemo printer
 *
 * @param {Object} transport - BLE or USB transport instance
 * @param {Object} rasterData - Raster data from canvas { data, widthBytes, heightLines }
 * @param {Object} options - Print options
 * @param {boolean} options.isBLE - Whether using BLE transport
 * @param {string} options.deviceName - Device name for protocol detection
 * @param {number} options.density - Print density 1-8 (default 6)
 * @param {number} options.feed - Feed after print in dots (default 32)
 * @param {Function} options.onProgress - Progress callback (percent)
 */
export async function print(transport, rasterData, options = {}) {
  const { isBLE = false, deviceName = '', density = 6, feed = 32, onProgress = null } = options;
  const { data, widthBytes, heightLines } = rasterData;

  const isDSeries = isDSeriesPrinter(deviceName);
  const isNarrowM = isNarrowMSeriesPrinter(deviceName);
  console.log(`Printing: ${widthBytes}x${heightLines} (${data.length} bytes)`);
  console.log(`Device: ${deviceName}, Protocol: ${isDSeries ? 'D-series' : isNarrowM ? 'M-series (narrow)' : 'M-series'}`);
  console.log(`Transport: ${isBLE ? 'BLE' : 'USB'}, Density: ${density}, Feed: ${feed}`);

  if (isDSeries && isBLE) {
    await printDSeries(transport, data, widthBytes, heightLines, onProgress, density);
  } else if (isBLE) {
    await printBLE(transport, data, widthBytes, heightLines, density, feed, onProgress);
  } else {
    await printUSB(transport, data, widthBytes, heightLines, density, feed, onProgress);
  }
}

/**
 * Print via BLE for D-series printers (D30, D110)
 */
async function printDSeries(transport, data, widthBytes, heightLines, onProgress, density = 6) {
  console.log('Using D-series protocol...');
  console.log(`Input: ${widthBytes} bytes wide x ${heightLines} rows (${data.length} bytes)`);

  // Rotate for D-series (they print labels sideways)
  const rotated = rotateRaster90CW(data, widthBytes, heightLines);
  console.log(`Rotated: ${rotated.widthBytes} bytes wide x ${rotated.heightLines} rows`);

  // Try to set heat/density before print (may help with thermal management)
  const heatTime = densityToHeatTime(density);
  console.log(`Setting density ${density} (heat time: ${heatTime})...`);
  await transport.send(CMD.HEAT_SETTINGS(7, heatTime, 2));
  await transport.delay(30);

  // D-series header
  console.log('Sending D-series header...');
  await transport.send(D_CMD.HEADER(rotated.widthBytes, rotated.heightLines));

  // Send data in chunks (D-series buffers all data before printing)
  console.log('Sending data...');
  const chunkSize = 128;

  for (let i = 0; i < rotated.data.length; i += chunkSize) {
    const chunk = rotated.data.slice(i, Math.min(i + chunkSize, rotated.data.length));
    await transport.send(chunk);
    await transport.delay(20);

    if (onProgress) {
      const progress = Math.round((i + chunk.length) / rotated.data.length * 100);
      onProgress(progress);
    }
  }

  // D-series end command
  await transport.delay(100);
  console.log('Sending D-series end command...');
  await transport.send(D_CMD.END);

  console.log('Print complete!');
}

/**
 * Print via BLE transport
 * Uses the protocol that works with M260
 */
async function printBLE(transport, data, widthBytes, heightLines, density, feed, onProgress) {
  // Init - must be right before data
  console.log('Sending init...');
  await transport.send(CMD.INIT);
  await transport.delay(100);

  // Set density using ESC 7 heat command (more widely supported)
  const heatTime = densityToHeatTime(density);
  console.log(`Setting density to ${density} (heat time: ${heatTime})...`);
  await transport.send(CMD.HEAT_SETTINGS(7, heatTime, 2));
  await transport.delay(30);
  // Also send standard density command as backup
  await transport.send(CMD.DENSITY(density));
  await transport.delay(50);

  // Raster header
  console.log('Sending header...');
  await transport.send(CMD.RASTER_HEADER(widthBytes, heightLines));

  // Send data in 128-byte chunks
  console.log('Sending data...');
  const chunkSize = 128;
  const totalChunks = Math.ceil(data.length / chunkSize);

  for (let i = 0; i < data.length; i += chunkSize) {
    const chunk = data.slice(i, Math.min(i + chunkSize, data.length));
    await transport.send(chunk);
    await transport.delay(20);

    if (onProgress) {
      const progress = Math.round((i + chunk.length) / data.length * 100);
      onProgress(progress);
    }
  }

  // Feed after print
  await transport.delay(300);
  console.log(`Sending feed (${feed} dots)...`);
  await transport.send(CMD.FEED(feed));
  await transport.delay(800);

  console.log('Print complete!');
}

/**
 * Print via USB transport
 */
async function printUSB(transport, data, widthBytes, heightLines, density, feed, onProgress) {
  // Init
  console.log('Sending init...');
  await transport.send(CMD.INIT);
  await transport.delay(100);

  // Density and line spacing
  console.log(`Setting density to ${density}...`);
  await transport.send(CMD.DENSITY(density));
  await transport.send(CMD.LINE_SPACING(0)); // Line spacing 0

  // Initial feed
  await transport.send(CMD.FEED(0x0c)); // 12 dots
  await transport.delay(50);

  // Raster header
  console.log('Sending header...');
  await transport.send(CMD.RASTER_HEADER(widthBytes, heightLines));

  // Send data in 512-byte chunks
  console.log('Sending data...');
  const chunkSize = 512;
  const totalChunks = Math.ceil(data.length / chunkSize);

  for (let i = 0; i < data.length; i += chunkSize) {
    const chunk = data.slice(i, Math.min(i + chunkSize, data.length));
    await transport.send(chunk);
    await transport.delay(20);

    if (onProgress) {
      const progress = Math.round((i + chunk.length) / data.length * 100);
      onProgress(progress);
    }
  }

  // Final feed
  await transport.delay(100);
  console.log(`Sending feed (${feed} dots)...`);
  await transport.send(CMD.FEED(feed));

  console.log('Print complete!');
}

/**
 * Print a density test pattern - 8 strips at different density levels
 * This helps verify that the density setting is working correctly
 *
 * @param {Object} transport - BLE or USB transport instance
 * @param {boolean} isBLE - Whether using BLE transport
 * @param {Function} onProgress - Progress callback
 */
export async function printDensityTest(transport, isBLE = true, onProgress = null) {
  console.log('Printing density test pattern (using ESC 7 heat command)...');

  // Create a test pattern: 8 strips, each 30 pixels tall, 320 pixels wide
  const stripHeight = 30;
  const stripWidth = 320;  // 40mm * 8 dots/mm
  const widthBytes = stripWidth / 8;  // 40 bytes per row
  const gap = 8;  // Gap between strips

  for (let density = 1; density <= 8; density++) {
    if (onProgress) {
      onProgress(Math.round((density - 1) / 8 * 100));
    }

    const heatTime = densityToHeatTime(density);
    console.log(`Printing strip at density ${density} (heat time: ${heatTime})...`);

    // Create strip data - solid black rectangle
    const stripData = new Uint8Array(widthBytes * stripHeight);
    stripData.fill(0xFF);  // All black

    // Init
    await transport.send(CMD.INIT);
    await transport.delay(50);

    // Try ESC 7 heat settings (maxDots=7, heatTime=variable, heatInterval=2)
    await transport.send(CMD.HEAT_SETTINGS(7, heatTime, 2));
    await transport.delay(30);

    // Also try standard density command in case it works
    await transport.send(CMD.DENSITY(density));
    await transport.delay(30);

    // Raster header
    await transport.send(CMD.RASTER_HEADER(widthBytes, stripHeight));

    // Send strip data
    const chunkSize = isBLE ? 128 : 512;
    for (let i = 0; i < stripData.length; i += chunkSize) {
      const chunk = stripData.slice(i, Math.min(i + chunkSize, stripData.length));
      await transport.send(chunk);
      await transport.delay(isBLE ? 20 : 10);
    }

    // Small feed between strips (except after last)
    if (density < 8) {
      await transport.delay(200);
      await transport.send(CMD.FEED(gap));
      await transport.delay(300);
    }
  }

  // Final feed
  await transport.delay(300);
  await transport.send(CMD.FEED(48));
  await transport.delay(500);

  if (onProgress) {
    onProgress(100);
  }

  console.log('Density test complete! You should see 8 strips from light (1) to dark (8).');
}
