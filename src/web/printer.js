/**
 * Printer protocol for Phomemo printers
 * Handles print commands for both USB and BLE transports
 * Supports M-series (M02, M110, M200, M220, M260) and D-series (D30, D110)
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

// M02-series specific commands
const M02_CMD = {
  // M02 requires a special prefix before standard ESC/POS commands
  PREFIX: new Uint8Array([0x10, 0xff, 0xfe, 0x01]),
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
 * Printer width configurations
 * Width in bytes (8 pixels per byte at 203 DPI)
 * Keys match the dropdown values in index.html
 */
const PRINTER_WIDTHS = {
  // P12 series (12mm tape / ~96px) - uses m02 protocol (assumed)
  'p12': 12,
  // M02 series (48mm / 384px) - uses m02 protocol
  'm02': 48,
  // M02 Pro (53mm at 300 DPI = 626px = 78 bytes) - uses m02 protocol
  'm02-pro': 78,
  // M110/M120 (48mm / 384px) - standard m-series protocol
  'm110': 48,
  // M03/T02 (53mm / 432px)
  'm03': 54,
  // M260 (72mm / 576px)
  'm260': 72,
  // M200/M250 (75mm / 608px)
  'm200': 76,
  'm250': 76,
  // M220/M221 (80mm / 648px)
  'm220': 81,
  // M04S multi-width options
  'm04s-53': 54,
  'm04s-80': 81,
  'm04s-110': 110,
  // D-series uses raw label width
  'd-series': null,
};

/**
 * Device name patterns for auto-detection
 * Matched against start of device name (case-insensitive)
 * More specific patterns should come first
 *
 * DPI: Most printers are 203 DPI, but M02 Pro is 300 DPI
 */
const DEVICE_PATTERNS = [
  // P12 series (12mm tape / ~96px at 203 DPI) - M-series protocol with rotation like D30
  { pattern: 'P12 PRO', width: 12, protocol: 'p12', dpi: 203 },
  { pattern: 'P12PRO', width: 12, protocol: 'p12', dpi: 203 },
  { pattern: 'P12', width: 12, protocol: 'p12', dpi: 203 },
  // M02 Pro series (53mm at 300 DPI = 626px = 78 bytes) - must come before generic M02 patterns
  { pattern: 'M02 PRO', width: 78, protocol: 'm02', dpi: 300 },
  { pattern: 'M02PRO', width: 78, protocol: 'm02', dpi: 300 },
  // M02 series (48mm / 384px at 203 DPI)
  { pattern: 'M02X', width: 48, protocol: 'm02', dpi: 203 },
  { pattern: 'M02S', width: 48, protocol: 'm02', dpi: 203 },
  { pattern: 'M02', width: 48, protocol: 'm02', dpi: 203 },
  // M03 and T02 (53mm / 432px)
  { pattern: 'M03', width: 54, protocol: 'm-series', dpi: 203 },
  { pattern: 'T02', width: 54, protocol: 'm-series', dpi: 203 },
  // M-series narrow (48mm)
  // Note: M110S uses Q-prefix pattern (e.g., Q199E5797220037), detected by M110S_PATTERN regex
  { pattern: 'M110', width: 48, protocol: 'm-series', dpi: 203 },
  { pattern: 'M120', width: 48, protocol: 'm-series', dpi: 203 },
  // M-series mid (75mm)
  { pattern: 'M200', width: 76, protocol: 'm-series', dpi: 203 },
  { pattern: 'M250', width: 76, protocol: 'm-series', dpi: 203 },
  // M-series wide (80mm)
  { pattern: 'M220', width: 81, protocol: 'm-series', dpi: 203 },
  { pattern: 'M221', width: 81, protocol: 'm-series', dpi: 203 },
  // M-series wide (72mm) - M260 and catch-all for M2xx
  { pattern: 'M260', width: 72, protocol: 'm-series', dpi: 203 },
  // M04 series (variable width, default to 54mm)
  { pattern: 'M04', width: 54, protocol: 'm-series', dpi: 203 },
  // D-series (rotated protocol)
  { pattern: 'D30', width: null, protocol: 'd-series', dpi: 203 },
  { pattern: 'D35', width: null, protocol: 'd-series', dpi: 203 },
  { pattern: 'D50', width: null, protocol: 'd-series', dpi: 203 },
  { pattern: 'Q30S', width: null, protocol: 'd-series', dpi: 203 },
  { pattern: 'Q30', width: null, protocol: 'd-series', dpi: 203 },
  // Generic D prefix last (catches D110, etc)
  { pattern: 'D', width: null, protocol: 'd-series', dpi: 203 },
];

// Default configuration when no pattern matches
const DEFAULT_CONFIG = { width: 72, protocol: 'm-series', dpi: 203 };

// M110S advertises with names like Q199E5797220037 (Q + 3 digits + letter + 10 digits)
const M110S_PATTERN = /^Q\d{3}[A-Z]\d{10}$/i;

/**
 * Get printer configuration from device name
 * @param {string} deviceName - BLE device name
 * @returns {Object} { width, protocol, dpi, recognized, matchedPattern }
 */
function detectPrinterConfig(deviceName) {
  if (!deviceName) return { ...DEFAULT_CONFIG, recognized: false, matchedPattern: null };

  const name = deviceName.toUpperCase();

  // Check for M110S pattern first (Q + 3 digits + letter + 10 digits)
  if (M110S_PATTERN.test(deviceName)) {
    return { width: 48, protocol: 'm-series', dpi: 203, recognized: true, matchedPattern: 'M110S' };
  }

  for (const { pattern, width, protocol, dpi } of DEVICE_PATTERNS) {
    if (name.startsWith(pattern)) {
      return { width, protocol, dpi: dpi || 203, recognized: true, matchedPattern: pattern };
    }
  }
  return { ...DEFAULT_CONFIG, recognized: false, matchedPattern: null };
}

/**
 * Check if a device name is recognized (matches a known pattern)
 * @param {string} deviceName - BLE device name
 * @returns {boolean} True if device matches a known pattern
 */
export function isDeviceRecognized(deviceName) {
  return detectPrinterConfig(deviceName).recognized;
}

/**
 * Get the matched pattern for a device name (e.g., "M110", "D30")
 * @param {string} deviceName - BLE device name
 * @returns {string|null} Matched pattern or null if not recognized
 */
export function getMatchedPattern(deviceName) {
  return detectPrinterConfig(deviceName).matchedPattern;
}

/**
 * Get printer configuration from manual override
 * @param {string} modelOverride - Manual model selection
 * @returns {Object|null} { width, protocol } or null if auto
 */
function getOverrideConfig(modelOverride) {
  if (!modelOverride || modelOverride === 'auto') return null;

  if (modelOverride === 'd-series') {
    return { width: null, protocol: 'd-series', dpi: 203 };
  }

  // P12 uses M-series protocol with rotation
  if (modelOverride === 'p12') {
    return { width: PRINTER_WIDTHS['p12'], protocol: 'p12', dpi: 203 };
  }

  // M02 uses special protocol
  if (modelOverride === 'm02') {
    return { width: PRINTER_WIDTHS['m02'], protocol: 'm02', dpi: 203 };
  }

  // M02 Pro uses special protocol and 300 DPI
  if (modelOverride === 'm02-pro') {
    return { width: PRINTER_WIDTHS['m02-pro'], protocol: 'm02', dpi: 300 };
  }

  const width = PRINTER_WIDTHS[modelOverride];
  if (width !== undefined) {
    return { width, protocol: 'm-series', dpi: 203 };
  }

  return null;
}

/**
 * Detect if device is D-series based on name or override
 * @param {string} deviceName - BLE device name
 * @param {string} modelOverride - Manual model selection
 */
export function isDSeriesPrinter(deviceName, modelOverride = 'auto') {
  // Manual override takes precedence
  const overrideConfig = getOverrideConfig(modelOverride);
  if (overrideConfig) {
    return overrideConfig.protocol === 'd-series';
  }

  // Auto-detect from device name
  const config = detectPrinterConfig(deviceName);
  return config.protocol === 'd-series';
}

/**
 * Detect if device is M02-series based on name or override
 * M02 series uses a special prefix and different feed behavior
 * @param {string} deviceName - BLE device name
 * @param {string} modelOverride - Manual model selection
 */
export function isM02Printer(deviceName, modelOverride = 'auto') {
  // Manual override takes precedence
  if (modelOverride === 'm02') {
    return true;
  }

  // For other overrides, use the override's protocol
  const overrideConfig = getOverrideConfig(modelOverride);
  if (overrideConfig) {
    return overrideConfig.protocol === 'm02';
  }

  // Auto-detect from device name
  const config = detectPrinterConfig(deviceName);
  return config.protocol === 'm02';
}

/**
 * Detect if device is P12-series based on name or override
 * P12 series uses M-series protocol but prints rotated like D30 (continuous tape)
 * @param {string} deviceName - BLE device name
 * @param {string} modelOverride - Manual model selection
 */
export function isP12Printer(deviceName, modelOverride = 'auto') {
  // Manual override takes precedence
  if (modelOverride === 'p12') {
    return true;
  }

  // For other overrides, use the override's protocol
  const overrideConfig = getOverrideConfig(modelOverride);
  if (overrideConfig) {
    return overrideConfig.protocol === 'p12';
  }

  // Auto-detect from device name
  const config = detectPrinterConfig(deviceName);
  return config.protocol === 'p12';
}

/**
 * Detect if device is a rotated printer (D-series or P12-series)
 * These printers print labels sideways and need raw raster data with rotation
 * @param {string} deviceName - BLE device name
 * @param {string} modelOverride - Manual model selection
 */
export function isRotatedPrinter(deviceName, modelOverride = 'auto') {
  return isDSeriesPrinter(deviceName, modelOverride) || isP12Printer(deviceName, modelOverride);
}

/**
 * Detect if device is a narrow M-series printer (M110, M120)
 * @param {string} deviceName - BLE device name
 * @param {string} modelOverride - Manual model selection
 */
export function isNarrowMSeriesPrinter(deviceName, modelOverride = 'auto') {
  const width = getPrinterWidthBytes(deviceName, modelOverride);
  return width === 48;
}

/**
 * Get the maximum print width in bytes for a given printer
 * @param {string} deviceName - BLE device name
 * @param {string} modelOverride - Manual model selection
 * @returns {number} Width in bytes (48, 54, 72, 76, or 81)
 */
export function getPrinterWidthBytes(deviceName, modelOverride = 'auto') {
  // Manual override takes precedence
  const overrideConfig = getOverrideConfig(modelOverride);
  if (overrideConfig && overrideConfig.width !== null) {
    return overrideConfig.width;
  }

  // Auto-detect from device name
  const config = detectPrinterConfig(deviceName);
  return config.width ?? DEFAULT_CONFIG.width;
}

/**
 * Get the DPI (dots per inch) for a printer
 * Most printers are 203 DPI, but M02 Pro is 300 DPI
 * @param {string} deviceName - BLE device name
 * @param {string} modelOverride - Manual model selection
 * @returns {number} DPI value (203 or 300)
 */
export function getPrinterDpi(deviceName, modelOverride = 'auto') {
  // Manual override takes precedence
  const overrideConfig = getOverrideConfig(modelOverride);
  if (overrideConfig && overrideConfig.dpi) {
    return overrideConfig.dpi;
  }

  // Auto-detect from device name
  const config = detectPrinterConfig(deviceName);
  return config.dpi || 203;
}

/**
 * Get a human-readable description of the detected printer type
 * @param {string} deviceName - BLE device name
 * @param {string} modelOverride - Manual model selection
 * @returns {string} Description like "M-series (48mm)" or "D-series" or "M02-series"
 */
export function getPrinterDescription(deviceName, modelOverride = 'auto') {
  const isDSeries = isDSeriesPrinter(deviceName, modelOverride);
  if (isDSeries) return 'D-series';

  const isP12 = isP12Printer(deviceName, modelOverride);
  if (isP12) return 'P12-series (12mm)';

  const isM02 = isM02Printer(deviceName, modelOverride);
  const width = getPrinterWidthBytes(deviceName, modelOverride);
  const widthMm = Math.round(width * 8 / 8); // bytes * 8 pixels / 8 px per mm

  if (isM02) return `M02-series (${widthMm}mm)`;
  return `M-series (${widthMm}mm)`;
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
 * @param {string} options.printerModel - Manual model override ('auto', 'narrow', 'wide', 'd-series')
 * @param {number} options.density - Print density 1-8 (default 6)
 * @param {number} options.feed - Feed after print in dots (default 32)
 * @param {Function} options.onProgress - Progress callback (percent)
 */
export async function print(transport, rasterData, options = {}) {
  const { isBLE = false, deviceName = '', printerModel = 'auto', density = 6, feed = 32, onProgress = null } = options;
  const { data, widthBytes, heightLines } = rasterData;

  const isDSeries = isDSeriesPrinter(deviceName, printerModel);
  const isP12 = isP12Printer(deviceName, printerModel);
  const isM02 = isM02Printer(deviceName, printerModel);
  const printerDesc = getPrinterDescription(deviceName, printerModel);
  console.log(`Printing: ${widthBytes}x${heightLines} (${data.length} bytes)`);
  console.log(`Device: ${deviceName}, Model: ${printerModel}, Detected: ${printerDesc}`);
  console.log(`Transport: ${isBLE ? 'BLE' : 'USB'}, Density: ${density}, Feed: ${feed}`);

  if (isDSeries && isBLE) {
    await printDSeries(transport, data, widthBytes, heightLines, onProgress, density);
  } else if (isP12) {
    // P12 uses M-series protocol with rotation, works for both BLE and USB
    await printP12(transport, data, widthBytes, heightLines, density, onProgress, isBLE);
  } else if (isM02 && isBLE) {
    await printM02(transport, data, widthBytes, heightLines, density, onProgress);
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
 * Print for P12-series printers (P12, P12 Pro)
 * Uses M-series protocol (like M110/M120/M220) but with rotation like D30
 * Supports both BLE and USB transports
 */
async function printP12(transport, data, widthBytes, heightLines, density, onProgress, isBLE = true) {
  console.log('Using P12-series protocol (M-series with rotation)...');
  console.log(`Input: ${widthBytes} bytes wide x ${heightLines} rows (${data.length} bytes)`);

  // Rotate for P12 (prints labels sideways like D30)
  const rotated = rotateRaster90CW(data, widthBytes, heightLines);
  console.log(`Rotated: ${rotated.widthBytes} bytes wide x ${rotated.heightLines} rows`);

  // Init
  console.log('Sending init...');
  await transport.send(CMD.INIT);
  await transport.delay(100);

  // Set density using ESC 7 heat command
  const heatTime = densityToHeatTime(density);
  console.log(`Setting density to ${density} (heat time: ${heatTime})...`);
  await transport.send(CMD.HEAT_SETTINGS(7, heatTime, 2));
  await transport.delay(30);

  // Raster header with rotated dimensions
  console.log('Sending header...');
  await transport.send(CMD.RASTER_HEADER(rotated.widthBytes, rotated.heightLines));

  // Send data in chunks (128 for BLE, 512 for USB)
  console.log('Sending data...');
  const chunkSize = isBLE ? 128 : 512;

  for (let i = 0; i < rotated.data.length; i += chunkSize) {
    const chunk = rotated.data.slice(i, Math.min(i + chunkSize, rotated.data.length));
    await transport.send(chunk);
    await transport.delay(isBLE ? 20 : 10);

    if (onProgress) {
      const progress = Math.round((i + chunk.length) / rotated.data.length * 100);
      onProgress(progress);
    }
  }

  // P12 uses continuous tape - minimal feed to clear print head
  await transport.delay(300);
  console.log('Sending minimal feed (8 dots for continuous tape)...');
  await transport.send(CMD.FEED(8));
  await transport.delay(500);

  console.log('Print complete!');
}

/**
 * Print via BLE for M02-series printers
 * M02 uses a special prefix and minimal/no feed (continuous paper)
 */
async function printM02(transport, data, widthBytes, heightLines, density, onProgress) {
  console.log('Using M02-series protocol...');

  // M02 requires a special prefix before commands
  console.log('Sending M02 prefix...');
  await transport.send(M02_CMD.PREFIX);
  await transport.delay(50);

  // Standard init
  console.log('Sending init...');
  await transport.send(CMD.INIT);
  await transport.delay(100);

  // Set density using ESC 7 heat command
  const heatTime = densityToHeatTime(density);
  console.log(`Setting density to ${density} (heat time: ${heatTime})...`);
  await transport.send(CMD.HEAT_SETTINGS(7, heatTime, 2));
  await transport.delay(30);

  // Raster header
  console.log('Sending header...');
  await transport.send(CMD.RASTER_HEADER(widthBytes, heightLines));

  // Send data in 128-byte chunks
  console.log('Sending data...');
  const chunkSize = 128;

  for (let i = 0; i < data.length; i += chunkSize) {
    const chunk = data.slice(i, Math.min(i + chunkSize, data.length));
    await transport.send(chunk);
    await transport.delay(20);

    if (onProgress) {
      const progress = Math.round((i + chunk.length) / data.length * 100);
      onProgress(progress);
    }
  }

  // M02 uses continuous paper - minimal feed just to clear print head
  // Too much feed wastes paper on continuous rolls
  await transport.delay(300);
  console.log('Sending minimal feed (8 dots for continuous paper)...');
  await transport.send(CMD.FEED(8));
  await transport.delay(500);

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
