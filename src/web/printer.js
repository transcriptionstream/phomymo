/**
 * Printer protocol for Phomemo printers
 * Handles print commands for both USB and BLE transports
 * Supports M-series (M02, M110, M200, M220, M260) and D-series (D30, D110)
 *
 * Printer definitions are data-driven from printers.json + user custom definitions.
 */

import { STORAGE_KEYS } from './constants.js';

// =============================================================================
// PRINTER DEFINITIONS MANAGER
// =============================================================================

// All loaded printer definitions (built-in + custom, custom wins on id collision)
let _allDefinitions = [];
// Built-in definitions loaded from printers.json
let _builtinDefinitions = [];
// Whether definitions have been loaded
let _loaded = false;

/**
 * Load built-in printer definitions from printers.json
 * Should be called once at app startup
 */
export async function loadPrinterDefinitions() {
  try {
    const resp = await fetch('./printers.json');
    const json = await resp.json();
    _builtinDefinitions = json.printers || [];
  } catch (e) {
    console.error('Failed to load printers.json:', e);
    _builtinDefinitions = [];
  }
  _loaded = true;
  _rebuildDefinitions();
}

/**
 * Get all printer definitions (built-in + custom, merged)
 * Custom definitions with the same id override built-in ones.
 * @returns {Array} All printer definitions
 */
export function getAllPrinterDefinitions() {
  if (!_loaded) {
    console.warn('Printer definitions not loaded yet; returning empty list');
    return [];
  }
  return _allDefinitions;
}

/**
 * Get a single printer definition by id
 * @param {string} id - Printer definition id
 * @returns {Object|null}
 */
export function getPrinterDefinition(id) {
  return _allDefinitions.find(d => d.id === id) || null;
}

/**
 * Get all custom (user-created/overridden) printer definitions from localStorage
 * @returns {Array}
 */
export function getCustomPrinterDefinitions() {
  try {
    const data = localStorage.getItem(STORAGE_KEYS.CUSTOM_PRINTERS);
    return data ? JSON.parse(data) : [];
  } catch (e) {
    console.error('Failed to load custom printers:', e);
    return [];
  }
}

/**
 * Save a custom printer definition (create or update)
 * @param {Object} def - Printer definition object
 */
export function saveCustomPrinterDefinition(def) {
  const customs = getCustomPrinterDefinitions();
  const idx = customs.findIndex(d => d.id === def.id);
  const saved = { ...def, builtin: false };
  if (idx >= 0) {
    customs[idx] = saved;
  } else {
    customs.push(saved);
  }
  localStorage.setItem(STORAGE_KEYS.CUSTOM_PRINTERS, JSON.stringify(customs));
  _rebuildDefinitions();
}

/**
 * Delete a custom printer definition
 * @param {string} id - Printer definition id to delete
 */
export function deleteCustomPrinterDefinition(id) {
  const customs = getCustomPrinterDefinitions().filter(d => d.id !== id);
  localStorage.setItem(STORAGE_KEYS.CUSTOM_PRINTERS, JSON.stringify(customs));
  _rebuildDefinitions();
}

/**
 * Check if a printer definition id is a built-in
 * @param {string} id
 * @returns {boolean}
 */
export function isBuiltinPrinter(id) {
  return _builtinDefinitions.some(d => d.id === id);
}

/**
 * Reset a customized built-in printer back to its original definition
 * @param {string} id
 */
export function resetBuiltinPrinter(id) {
  deleteCustomPrinterDefinition(id);
}

/**
 * Get the available protocol types (for the editor UI)
 */
export function getAvailableProtocols() {
  return [
    { value: 'm-series', label: 'M-series (ESC/POS Raster)' },
    { value: 'm02', label: 'M02-series (ESC/POS with Prefix)' },
    { value: 'm04', label: 'M04-series (300 DPI)' },
    { value: 'm110', label: 'M110-series (phomemo-tools)' },
    { value: 'd-series', label: 'D-series (Rotated)' },
    { value: 'p12', label: 'P12/Tape (Rotated, Continuous)' },
    { value: 'tspl', label: 'TSPL (Shipping Label)' },
  ];
}

/**
 * Get the available label preset groups (for the editor UI)
 */
export function getAvailableLabelPresets() {
  return [
    { value: 'm-series', label: 'M-series (standard labels)' },
    { value: 'd-series', label: 'D-series (small labels)' },
    { value: 'tape', label: 'Tape (continuous tape)' },
    { value: 'pm241', label: 'PM-241 (shipping labels)' },
  ];
}

/**
 * Rebuild the merged definitions list from built-in + custom
 */
function _rebuildDefinitions() {
  const customs = getCustomPrinterDefinitions();
  const customIds = new Set(customs.map(d => d.id));

  // Start with built-ins that haven't been overridden
  _allDefinitions = _builtinDefinitions
    .filter(d => !customIds.has(d.id))
    .map(d => ({ ...d }));

  // Add all custom definitions
  for (const c of customs) {
    _allDefinitions.push({ ...c });
  }
}

// =============================================================================
// DETECTION AND CONFIG (data-driven from definitions)
// =============================================================================

// Default configuration when no definition matches
const DEFAULT_CONFIG = { width: 72, protocol: 'm-series', dpi: 203 };

/**
 * Build a flat name-pattern list from all definitions for auto-detection.
 * More specific (longer) patterns come first to avoid false matches.
 * Custom definitions' patterns come before built-in ones.
 */
function _buildPatternList() {
  const customs = _allDefinitions.filter(d => !d.builtin);
  const builtins = _allDefinitions.filter(d => d.builtin);

  const list = [];
  for (const def of [...customs, ...builtins]) {
    if (!def.namePatterns) continue;
    for (const pat of def.namePatterns) {
      list.push({ pattern: pat.toUpperCase(), def });
    }
  }
  // Sort longer patterns first for specificity
  list.sort((a, b) => b.pattern.length - a.pattern.length);
  return list;
}

/**
 * Get printer configuration from device name (auto-detect)
 * @param {string} deviceName - BLE device name
 * @returns {Object} { width, protocol, dpi, recognized, matchedPattern, definition }
 */
function detectPrinterConfig(deviceName) {
  if (!deviceName) return { ...DEFAULT_CONFIG, recognized: false, matchedPattern: null, definition: null };

  const name = deviceName.toUpperCase();
  const patterns = _buildPatternList();

  for (const { pattern, def } of patterns) {
    if (name.startsWith(pattern)) {
      return {
        width: def.widthBytes,
        protocol: def.protocol,
        dpi: def.dpi || 203,
        recognized: true,
        matchedPattern: pattern,
        definition: def,
      };
    }
  }
  return { ...DEFAULT_CONFIG, recognized: false, matchedPattern: null, definition: null };
}

/**
 * Get printer configuration from manual model override
 * @param {string} modelOverride - Manual model selection (printer definition id)
 * @returns {Object|null}
 */
function getOverrideConfig(modelOverride) {
  if (!modelOverride || modelOverride === 'auto') return null;

  const def = getPrinterDefinition(modelOverride);
  if (def) {
    return {
      width: def.widthBytes,
      protocol: def.protocol,
      dpi: def.dpi || 203,
      definition: def,
    };
  }
  return null;
}

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
  END: new Uint8Array([0x1b, 0x64, 0x00]),  // ESC d 0 - print, no feed (gap detection for die-cut)
  FEED: (dots) => new Uint8Array([0x1b, 0x4a, dots & 0xff]),  // ESC J n - feed n dots (for continuous tape)
};

// M110-series specific commands (based on phomemo-tools project)
// These commands are tested and working for M110/M110S printers
const M110_CMD = {
  // ESC N 0x0D <speed> - Set print speed (default 5)
  SPEED: (speed) => new Uint8Array([0x1b, 0x4e, 0x0d, speed]),
  // ESC N 0x04 <density> - Set print density (range ~1-15, default 10)
  DENSITY: (density) => new Uint8Array([0x1b, 0x4e, 0x04, density]),
  // 1F 11 <type> - Set media type (10 = labels with gaps)
  MEDIA_TYPE: (type) => new Uint8Array([0x1f, 0x11, type]),
  // Footer sequence to finalize print
  FOOTER: new Uint8Array([0x1f, 0xf0, 0x05, 0x00, 0x1f, 0xf0, 0x03, 0x00]),
};

// M04-series specific commands (reverse-engineered from BTSnoop HCI logs)
// M04S/M04AS use 300 DPI and a proprietary init sequence
// Tested on real hardware by @ramiorg (github.com/transcriptionstream/phomymo/issues/23)
const M04_CMD = {
  // 1F 11 02 <density> - Set print density (0x00-0x0F, default 0x04)
  DENSITY: (level) => new Uint8Array([0x1f, 0x11, 0x02, level]),
  // 1F 11 37 <param> - Set heat/speed parameter
  HEAT: (param) => new Uint8Array([0x1f, 0x11, 0x37, param]),
  // 1F 11 0B - Init command (required, purpose undetermined)
  INIT: new Uint8Array([0x1f, 0x11, 0x0b]),
  // 1F 11 35 <mode> - Compression mode (0x00=raw, 0x01=LZO; raw is sufficient)
  COMPRESSION: (mode) => new Uint8Array([0x1f, 0x11, 0x35, mode]),
  // M04 raster header - same opcodes as standard ESC/POS but with proper 16-bit LE width
  RASTER_HEADER: (widthBytes, heightLines) => new Uint8Array([
    0x1d, 0x76, 0x30, 0x00,
    widthBytes % 256,
    Math.floor(widthBytes / 256),
    heightLines % 256,
    Math.floor(heightLines / 256),
  ]),
  // 1B 64 02 - Paper feed
  FEED: new Uint8Array([0x1b, 0x64, 0x02]),
};

// P12-series specific commands (based on soburi/phomemo_p12 protocol)
const P12_CMD = {
  // P12 init sequence - grouped into 6 packets as per soburi protocol
  // Each packet should be followed by waiting for printer response
  INIT_SEQUENCE: [
    new Uint8Array([0x1f, 0x11, 0x38]),
    new Uint8Array([0x1f, 0x11, 0x11, 0x1f, 0x11, 0x12, 0x1f, 0x11, 0x09, 0x1f, 0x11, 0x13]),
    new Uint8Array([0x1f, 0x11, 0x09]),
    new Uint8Array([0x1f, 0x11, 0x19, 0x1f, 0x11, 0x11]),
    new Uint8Array([0x1f, 0x11, 0x19]),
    new Uint8Array([0x1f, 0x11, 0x07]),
  ],
  // P12 print header: ESC @ + GS v 0 + dimensions
  HEADER: (widthBytes, rows) => new Uint8Array([
    0x1b, 0x40,           // ESC @ - Initialize
    0x1d, 0x76, 0x30, 0x00, // GS v 0 \0 - Raster bit image
    widthBytes % 256,
    Math.floor(widthBytes / 256),
    rows % 256,
    Math.floor(rows / 256),
  ]),
  // P12 feed: ESC d 13 (feed 13 lines)
  FEED: new Uint8Array([0x1b, 0x64, 0x0d]),
};

// TSPL commands for shipping label printers (PM-241, etc.)
// TSPL is a text-based protocol used by many Chinese thermal label printers
const TSPL = {
  // Helper to create command string with CRLF
  cmd: (str) => new TextEncoder().encode(str + '\r\n'),

  // Set label size in mm
  SIZE: (widthMm, heightMm) => new TextEncoder().encode(`SIZE ${widthMm} mm, ${heightMm} mm\r\n`),

  // Set gap between labels (0 for continuous)
  GAP: (gapMm) => new TextEncoder().encode(`GAP ${gapMm} mm, 0 mm\r\n`),

  // Set print density (0-15)
  DENSITY: (level) => new TextEncoder().encode(`DENSITY ${level}\r\n`),

  // Set print speed (1-10)
  SPEED: (speed) => new TextEncoder().encode(`SPEED ${speed}\r\n`),

  // Set print direction (0=normal, 1=reversed)
  DIRECTION: (dir) => new TextEncoder().encode(`DIRECTION ${dir}\r\n`),

  // Clear image buffer
  CLS: () => new TextEncoder().encode('CLS\r\n'),

  // BITMAP header: x, y, widthBytes, heightDots, mode (0=overwrite)
  // Binary data follows immediately after this
  BITMAP_HEADER: (x, y, widthBytes, heightDots) =>
    new TextEncoder().encode(`BITMAP ${x},${y},${widthBytes},${heightDots},0,`),

  // Print n copies
  PRINT: (copies = 1) => new TextEncoder().encode(`PRINT ${copies}\r\n`),

  // End command
  END: () => new TextEncoder().encode('END\r\n'),
};

// =============================================================================
// PROTOCOL DETECTION HELPERS (data-driven from definitions)
// =============================================================================

/**
 * Resolve the effective config for a device name + model override.
 * Returns { width, protocol, dpi, definition }
 */
function _resolveConfig(deviceName, modelOverride = 'auto') {
  const overrideConfig = getOverrideConfig(modelOverride);
  if (overrideConfig) return overrideConfig;
  return detectPrinterConfig(deviceName);
}

/**
 * Check if a device name is recognized (matches a known pattern)
 */
export function isDeviceRecognized(deviceName) {
  return detectPrinterConfig(deviceName).recognized;
}

/**
 * Get the matched pattern for a device name
 */
export function getMatchedPattern(deviceName) {
  return detectPrinterConfig(deviceName).matchedPattern;
}

/**
 * Get the definition that matched a device name (for auto-detect)
 */
export function getDetectedDefinition(deviceName) {
  return detectPrinterConfig(deviceName).definition;
}

export function isDSeriesPrinter(deviceName, modelOverride = 'auto') {
  return _resolveConfig(deviceName, modelOverride).protocol === 'd-series';
}

export function isM02Printer(deviceName, modelOverride = 'auto') {
  return _resolveConfig(deviceName, modelOverride).protocol === 'm02';
}

export function isP12Printer(deviceName, modelOverride = 'auto') {
  return _resolveConfig(deviceName, modelOverride).protocol === 'p12';
}

export function isA30Printer(deviceName, modelOverride = 'auto') {
  const def = _resolveConfig(deviceName, modelOverride).definition;
  return def?.id === 'a30';
}

export function isTapePrinter(deviceName, modelOverride = 'auto') {
  const config = _resolveConfig(deviceName, modelOverride);
  const def = config.definition;
  if (def) return !!def.tape;
  return config.protocol === 'p12';
}

export function isPM241Printer(deviceName, modelOverride = 'auto') {
  return _resolveConfig(deviceName, modelOverride).protocol === 'tspl';
}

export function isTSPLPrinter(deviceName, modelOverride = 'auto') {
  return _resolveConfig(deviceName, modelOverride).protocol === 'tspl';
}

function isM110Printer(deviceName, modelOverride = 'auto') {
  return _resolveConfig(deviceName, modelOverride).protocol === 'm110';
}

function isM04Printer(deviceName, modelOverride = 'auto') {
  return _resolveConfig(deviceName, modelOverride).protocol === 'm04';
}

export function isRotatedPrinter(deviceName, modelOverride = 'auto') {
  const config = _resolveConfig(deviceName, modelOverride);
  const def = config.definition;
  if (def) return !!def.rotated;
  // Fallback: D-series and P12 protocols are rotated
  return config.protocol === 'd-series' || config.protocol === 'p12';
}

export function isNarrowMSeriesPrinter(deviceName, modelOverride = 'auto') {
  return getPrinterWidthBytes(deviceName, modelOverride) === 48;
}

export function getPrinterAlignment(deviceName, modelOverride = 'auto') {
  const config = _resolveConfig(deviceName, modelOverride);
  const def = config.definition;
  if (def && def.alignment) return def.alignment;
  return 'center';
}

export function getPrinterWidthBytes(deviceName, modelOverride = 'auto') {
  const overrideConfig = getOverrideConfig(modelOverride);
  if (overrideConfig && overrideConfig.width !== null) return overrideConfig.width;
  const config = detectPrinterConfig(deviceName);
  return config.width ?? DEFAULT_CONFIG.width;
}

export function getPrinterDpi(deviceName, modelOverride = 'auto') {
  const config = _resolveConfig(deviceName, modelOverride);
  return config.dpi || 203;
}

export function getPrinterDescription(deviceName, modelOverride = 'auto') {
  const config = _resolveConfig(deviceName, modelOverride);
  const def = config.definition;
  if (def) {
    const widthMm = def.widthBytes ? Math.round(def.widthBytes * 8 / 8) : null;
    return def.name + (widthMm ? ` (${widthMm}mm)` : '');
  }
  // Fallback for unrecognized printers
  const width = getPrinterWidthBytes(deviceName, modelOverride);
  const widthMm = Math.round(width * 8 / 8);
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
 * Rotate raster data 90 degrees counter-clockwise
 * Used for P12 printers which may need opposite rotation from D30
 *
 * @param {Uint8Array} data - Original raster data (1 bit per pixel, packed in bytes)
 * @param {number} widthBytes - Width in bytes (8 pixels per byte)
 * @param {number} heightLines - Height in lines
 * @returns {Object} { data, widthBytes, heightLines } - Rotated raster data
 */
function rotateRaster90CCW(data, widthBytes, heightLines) {
  const srcWidthPx = widthBytes * 8;
  const srcHeightPx = heightLines;

  // After 90° CCW rotation: new width = old height, new height = old width
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

      // 90° CCW rotation: (x, y) -> (y, width - 1 - x)
      const dstX = srcY;
      const dstY = srcWidthPx - 1 - srcX;

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
  const { isBLE = false, deviceName = '', printerModel = 'auto', density = 6, feed = 32, continuous = false, onProgress = null } = options;
  const { data, widthBytes, heightLines } = rasterData;

  const isDSeries = isDSeriesPrinter(deviceName, printerModel);
  const isP12 = isP12Printer(deviceName, printerModel);
  const isM02 = isM02Printer(deviceName, printerModel);
  const isM04 = isM04Printer(deviceName, printerModel);
  const isM110 = isM110Printer(deviceName, printerModel);
  const isTSPL = isTSPLPrinter(deviceName, printerModel);
  const printerDesc = getPrinterDescription(deviceName, printerModel);
  console.log(`Printing: ${widthBytes}x${heightLines} (${data.length} bytes)`);
  console.log(`Device: ${deviceName}, Model: ${printerModel}, Detected: ${printerDesc}`);
  console.log(`Transport: ${isBLE ? 'BLE' : 'USB'}, Density: ${density}, Feed: ${feed}`);

  if (isTSPL) {
    // TSPL protocol for shipping label printers (PM-241, etc.)
    // Get label dimensions in mm from raster data
    const labelWidthMm = Math.round(widthBytes * 8 / 8); // 8 dots/mm at 203 DPI
    const labelHeightMm = Math.round(heightLines / 8);
    await printTSPL(transport, data, widthBytes, heightLines, labelWidthMm, labelHeightMm, density, onProgress);
  } else if (isP12 && isBLE) {
    // P12 uses its own protocol with proprietary init sequence
    await printP12(transport, data, widthBytes, heightLines, onProgress);
  } else if (isDSeries && isBLE) {
    // D-series (D30, D110, etc.)
    await printDSeries(transport, data, widthBytes, heightLines, onProgress, density, continuous, feed);
  } else if (isM02 && isBLE) {
    await printM02(transport, data, widthBytes, heightLines, density, onProgress);
  } else if (isM04 && isBLE) {
    await printM04(transport, data, widthBytes, heightLines, density, feed, onProgress);
  } else if (isM110 && isBLE) {
    // M110/M110S/M120 uses phomemo-tools protocol
    await printM110(transport, data, widthBytes, heightLines, density, onProgress);
  } else if (isBLE) {
    await printBLE(transport, data, widthBytes, heightLines, density, feed, onProgress);
  } else {
    await printUSB(transport, data, widthBytes, heightLines, density, feed, onProgress);
  }
}

/**
 * Print via BLE for D-series printers (D30, D110, etc.)
 * Uses rotated printing with D-series protocol
 */
async function printDSeries(transport, data, widthBytes, heightLines, onProgress, density = 6, continuous = false, feed = 0) {
  console.log('Using D-series protocol...');
  console.log(`Input: ${widthBytes} bytes wide x ${heightLines} rows (${data.length} bytes)`);

  // Rotate for D-series (they print labels sideways)
  const rotated = rotateRaster90CW(data, widthBytes, heightLines);
  console.log(`Rotated: ${rotated.widthBytes} bytes wide x ${rotated.heightLines} rows`);

  // For continuous tape, pad raster with blank rows to push content past the cutter
  // ESC J feed is ignored in continuous mode, so we bake the feed into the image data
  let printData = rotated.data;
  let printRows = rotated.heightLines;
  if (continuous && feed > 0) {
    // The D30 has ~7mm (56 dots) from print head to cutter edge - content needs this
    // padding just to reach the cut point, then 'feed' adds extra margin beyond that
    const cutterOffset = 56; // ~7mm head-to-cutter distance at 203 DPI
    const paddingRows = cutterOffset + feed;
    const paddingBytes = paddingRows * rotated.widthBytes;
    const padded = new Uint8Array(rotated.data.length + paddingBytes);
    padded.set(rotated.data);
    // Rest is already zeros (blank rows)
    printData = padded;
    printRows = rotated.heightLines + paddingRows;
    console.log(`Continuous tape: added ${paddingRows} blank rows (${cutterOffset} cutter offset + ${feed} feed, ${printRows} total rows)`);
  }

  // Set heat/density before header
  const heatTime = densityToHeatTime(density);
  console.log(`Setting density ${density} (heat time: ${heatTime})...`);
  await transport.send(CMD.HEAT_SETTINGS(7, heatTime, 2));
  await transport.delay(30);

  // Set media type: continuous (0x0B) disables gap detection, gaps (0x0A) enables it
  const mediaType = continuous ? 0x0b : 0x0a;
  console.log(`Setting media type to ${continuous ? 'continuous' : 'gaps'} (1F 11 ${mediaType.toString(16).padStart(2, '0')})...`);
  await transport.send(new Uint8Array([0x1f, 0x11, mediaType]));
  await transport.delay(30);

  // Send D-series header (includes ESC @ init)
  console.log('Sending D-series header...');
  await transport.send(D_CMD.HEADER(rotated.widthBytes, printRows));

  // Send data in chunks
  console.log('Sending data...');
  const chunkSize = 128;

  for (let i = 0; i < printData.length; i += chunkSize) {
    const chunk = printData.slice(i, Math.min(i + chunkSize, printData.length));
    await transport.send(chunk);
    await transport.delay(20);

    if (onProgress) {
      const progress = Math.round((i + chunk.length) / printData.length * 100);
      onProgress(progress);
    }
  }

  // D-series end command (ESC d 0 - gap detection for die-cut, no-op for continuous)
  await transport.delay(100);
  console.log('Sending D-series end command...');
  await transport.send(D_CMD.END);

  console.log('Print complete!');
}

/**
 * Print via BLE for P12-series printers (P12, P12 Pro)
 * Continuous tape printer - uses proprietary init sequence to fix print positioning
 */
async function printP12(transport, data, widthBytes, heightLines, onProgress) {
  console.log('Using P12-series protocol...');
  console.log(`Input: ${widthBytes} bytes wide x ${heightLines} rows (${data.length} bytes)`);

  // Rotate for P12 (prints labels sideways like D30)
  const rotated = rotateRaster90CW(data, widthBytes, heightLines);
  console.log(`Rotated: ${rotated.widthBytes} bytes wide x ${rotated.heightLines} rows`);

  // Send P12 init sequence with response waiting (as per soburi protocol)
  console.log('Sending P12 init sequence...');
  for (let i = 0; i < P12_CMD.INIT_SEQUENCE.length; i++) {
    const cmd = P12_CMD.INIT_SEQUENCE[i];
    console.log(`  Init packet ${i + 1}/${P12_CMD.INIT_SEQUENCE.length}...`);
    await transport.send(cmd);
    // Wait for printer response before sending next packet
    if (transport.waitForResponse) {
      await transport.waitForResponse(500);
    } else {
      await transport.delay(100); // Fallback delay if no waitForResponse
    }
  }

  // Send P12 header (ESC @ + GS v 0 + dimensions)
  console.log('Sending P12 header...');
  await transport.send(P12_CMD.HEADER(rotated.widthBytes, rotated.heightLines));

  // Send data in chunks
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

  // P12 feed command (ESC d 13, twice as per soburi protocol)
  await transport.delay(100);
  console.log('Sending P12 feed...');
  await transport.send(P12_CMD.FEED);
  await transport.delay(50);
  await transport.send(P12_CMD.FEED);

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
 * Print via BLE for M04-series printers (M04S, M04AS)
 * Uses proprietary init sequence and 300 DPI
 * Tested on real hardware by @ramiorg
 */
async function printM04(transport, data, widthBytes, heightLines, density, feed, onProgress) {
  console.log('Using M04-series protocol (300 DPI)...');

  // Map density 1-8 to M04 range 0x00-0x0F (default 0x04)
  const m04Density = Math.round((density / 8) * 15);
  // Heat parameter - tested range on real hardware
  const m04Heat = Math.round(100 + (density - 1) * 50 / 3);

  // Step 1: Set density
  console.log(`Setting density to ${density} (M04 value: 0x${m04Density.toString(16).padStart(2, '0')})...`);
  await transport.send(M04_CMD.DENSITY(m04Density));
  await transport.delay(30);

  // Step 2: Set heat/speed
  console.log(`Setting heat/speed (${m04Heat})...`);
  await transport.send(M04_CMD.HEAT(m04Heat));
  await transport.delay(30);

  // Step 3: Init
  console.log('Sending M04 init...');
  await transport.send(M04_CMD.INIT);
  await transport.delay(30);

  // Step 4: Set compression mode to raw (no LZO)
  console.log('Setting compression mode (raw)...');
  await transport.send(M04_CMD.COMPRESSION(0x00));
  await transport.delay(30);

  // Step 5: M04-specific raster header (proper 16-bit LE width/height)
  console.log('Sending raster header...');
  await transport.send(M04_CMD.RASTER_HEADER(widthBytes, heightLines));

  // Step 6: Send data in 256-byte chunks
  console.log('Sending data (256-byte chunks)...');
  const chunkSize = 256;

  for (let i = 0; i < data.length; i += chunkSize) {
    const chunk = data.slice(i, Math.min(i + chunkSize, data.length));
    await transport.send(chunk);
    await transport.delay(20);

    if (onProgress) {
      const progress = Math.round((i + chunk.length) / data.length * 100);
      onProgress(progress);
    }
  }

  // Step 7: Feed - number of feed commands based on feed setting
  await transport.delay(300);
  const feedCount = Math.max(1, Math.round(feed / 16));
  console.log(`Sending feed (${feedCount} lines)...`);
  for (let i = 0; i < feedCount; i++) {
    await transport.send(M04_CMD.FEED);
    await transport.delay(30);
  }
  await transport.delay(500);

  console.log('Print complete!');
}

/**
 * Print via BLE transport for M110/M110S/M120 printers
 * Uses the phomemo-tools protocol which is tested and working
 */
async function printM110(transport, data, widthBytes, heightLines, density, onProgress) {
  console.log('Using M110 protocol (phomemo-tools)...');

  // Map our density (1-8) to M110 density (~1-15, default 10)
  // Our scale: 1=lightest, 8=darkest
  // M110 scale: higher = darker, default 10
  const m110Density = Math.round(5 + density * 1.25); // Maps 1-8 to ~6-15

  // Set speed (default 5)
  console.log('Setting speed...');
  await transport.send(M110_CMD.SPEED(5));
  await transport.delay(30);

  // Set density
  console.log(`Setting density to ${density} (M110 value: ${m110Density})...`);
  await transport.send(M110_CMD.DENSITY(m110Density));
  await transport.delay(30);

  // Set media type (10 = labels with gaps)
  console.log('Setting media type...');
  await transport.send(M110_CMD.MEDIA_TYPE(10));
  await transport.delay(30);

  // Raster header (same format as standard M-series)
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

  // Send footer to finalize print
  await transport.delay(300);
  console.log('Sending footer...');
  await transport.send(M110_CMD.FOOTER);
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
 * Print via TSPL protocol (for shipping label printers like PM-241)
 * TSPL is a text-based command language used by many Chinese thermal label printers
 */
async function printTSPL(transport, data, widthBytes, heightLines, labelWidthMm, labelHeightMm, density, onProgress) {
  console.log('Using TSPL protocol...');
  console.log(`Label size: ${labelWidthMm}mm x ${labelHeightMm}mm`);
  console.log(`Raster: ${widthBytes} bytes wide x ${heightLines} rows`);

  // Map density 1-8 to TSPL density 0-15
  const tsplDensity = Math.round((density / 8) * 15);

  // Build TSPL command sequence
  console.log('Sending TSPL setup commands...');

  // SIZE command - label dimensions
  await transport.send(TSPL.SIZE(labelWidthMm, labelHeightMm));
  await transport.delay(50);

  // GAP command - gap between labels (3mm typical for die-cut labels)
  await transport.send(TSPL.GAP(3));
  await transport.delay(50);

  // OFFSET command - shift print down to center on label (negative = down)
  await transport.send(new TextEncoder().encode('OFFSET -3 mm\r\n'));
  await transport.delay(50);

  // DENSITY command
  console.log(`Setting TSPL density to ${tsplDensity}...`);
  await transport.send(TSPL.DENSITY(tsplDensity));
  await transport.delay(50);

  // SPEED command (use moderate speed)
  await transport.send(TSPL.SPEED(4));
  await transport.delay(50);

  // DIRECTION command (normal direction)
  await transport.send(TSPL.DIRECTION(0));
  await transport.delay(50);

  // CLS - clear image buffer
  await transport.send(TSPL.CLS());
  await transport.delay(50);

  // BITMAP command header
  console.log('Sending BITMAP header...');
  await transport.send(TSPL.BITMAP_HEADER(0, 0, widthBytes, heightLines));

  // Invert bitmap data - TSPL expects 0=black, 1=white (opposite of our format)
  console.log('Inverting bitmap data for TSPL...');
  const invertedData = new Uint8Array(data.length);
  for (let i = 0; i < data.length; i++) {
    invertedData[i] = data[i] ^ 0xFF;
  }

  // Send binary bitmap data in chunks
  console.log('Sending bitmap data...');
  const chunkSize = 512;

  for (let i = 0; i < invertedData.length; i += chunkSize) {
    const chunk = invertedData.slice(i, Math.min(i + chunkSize, invertedData.length));
    await transport.send(chunk);
    await transport.delay(10);

    if (onProgress) {
      const progress = Math.round((i + chunk.length) / invertedData.length * 100);
      onProgress(progress);
    }
  }

  // Need CRLF after bitmap data
  await transport.send(new TextEncoder().encode('\r\n'));
  await transport.delay(50);

  // PRINT command
  console.log('Sending PRINT command...');
  await transport.send(TSPL.PRINT(1));
  await transport.delay(50);

  // END command
  await transport.send(TSPL.END());

  console.log('TSPL print complete!');
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
