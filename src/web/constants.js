/**
 * Application Constants
 * Single source of truth for all magic numbers and configuration
 */

// =============================================================================
// ZOOM
// =============================================================================
export const ZOOM = {
  MIN: 0.25,
  MAX: 3,
  STEP: 0.25,
  DEFAULT: 1,
};

// =============================================================================
// TEXT ELEMENTS
// =============================================================================
export const TEXT = {
  MIN_FONT_SIZE: 6,
  MAX_FONT_SIZE: 200,
  DEFAULT_FONT_SIZE: 24,
};

// =============================================================================
// IMAGE ELEMENTS
// =============================================================================
export const IMAGE = {
  MIN_SCALE: 10,
  MAX_SCALE: 200,
  DEFAULT_SCALE: 100,
};

// =============================================================================
// ELEMENT DIMENSIONS
// =============================================================================
export const ELEMENT = {
  MIN_WIDTH: 10,
  MIN_HEIGHT: 10,
};

// =============================================================================
// LABEL DIMENSIONS
// =============================================================================
export const LABEL = {
  MIN_WIDTH: 10,
  MAX_WIDTH: 100,
  MIN_HEIGHT: 10,
  MAX_HEIGHT: 200,
};

// =============================================================================
// MULTI-LABEL ROLL CONFIGURATION
// =============================================================================
export const MULTI_LABEL = {
  MIN_LABELS_ACROSS: 1,
  MAX_LABELS_ACROSS: 8,
  DEFAULT_LABELS_ACROSS: 4,
  MIN_GAP: 0,
  MAX_GAP: 10,
  DEFAULT_GAP: 2,
};

// =============================================================================
// PRINT SETTINGS
// =============================================================================
export const PRINT = {
  MIN_COPIES: 1,
  MAX_COPIES: 99,
  DEFAULT_COPIES: 1,
  DEFAULT_DENSITY: 6,
  DEFAULT_FEED: 32,
};

// =============================================================================
// HISTORY (UNDO/REDO)
// =============================================================================
export const HISTORY = {
  MAX_SIZE: 50,
};

// =============================================================================
// ALIGNMENT GUIDES
// =============================================================================
export const GUIDES = {
  SNAP_THRESHOLD: 5, // pixels
};

// =============================================================================
// SELECTION HANDLES
// =============================================================================
export const HANDLES = {
  SIZE: 8,
  HIT_AREA_PADDING: 2,
  ROTATION_DISTANCE: 25,
  ROTATION_RADIUS: 6,
};

// =============================================================================
// BLE TRANSPORT
// =============================================================================
export const BLE = {
  SERVICE_UUID: 0xff00,
  WRITE_CHAR_UUID: 0xff02,
  NOTIFY_CHAR_UUID: 0xff03,
  CHUNK_SIZE: 128,
  CHUNK_DELAY_MS: 20,
  MAX_RETRIES: 1,
  INITIAL_RETRY_DELAY_MS: 300,
};

// =============================================================================
// STORAGE KEYS
// =============================================================================
export const STORAGE_KEYS = {
  DEVICE_MAPPING: 'phomymo_device_models',
  DESIGNS: 'phomymo_designs',
  SETTINGS: 'phomymo_settings',
  MULTI_LABEL_PRESETS: 'phomymo_multi_label_presets',
};

// =============================================================================
// LABEL SIZE PRESETS
// =============================================================================

// M-series printers (M110, M220, etc.) - width x height in mm
export const M_SERIES_LABEL_SIZES = {
  '12x40': { width: 12, height: 40 },
  '15x30': { width: 15, height: 30 },
  '20x30': { width: 20, height: 30 },
  '25x50': { width: 25, height: 50 },
  '30x20': { width: 30, height: 20 },
  '30x40': { width: 30, height: 40 },
  '40x30': { width: 40, height: 30 },
  '40x60': { width: 40, height: 60 },
  '50x25': { width: 50, height: 25 },
  '50x30': { width: 50, height: 30 },
  '50x80': { width: 50, height: 80 },
  '60x40': { width: 60, height: 40 },
};

// D-series printers (D30, D110) - max width is 12-15mm
// User designs in landscape, printer rotates output
export const D_SERIES_LABEL_SIZES = {
  '40x12': { width: 40, height: 12 },
  '30x12': { width: 30, height: 12 },
  '22x12': { width: 22, height: 12 },
  '12x12': { width: 12, height: 12 },
  '30x14': { width: 30, height: 14 },
  '22x14': { width: 22, height: 14 },
  '40x15': { width: 40, height: 15 },
  '30x15': { width: 30, height: 15 },
};

// =============================================================================
// DEFAULT ELEMENT VALUES
// =============================================================================
export const DEFAULTS = {
  text: {
    fontFamily: 'Inter, sans-serif',
    fontSize: 24,
    fontWeight: 'normal',
    fontStyle: 'normal',
    textDecoration: 'none',
    textAlign: 'center',
    verticalAlign: 'top',
    color: 'black',
    background: 'transparent',
    noWrap: false,
    clipOverflow: false,
    autoScale: false,
  },
  image: {
    lockAspectRatio: true,
  },
  barcode: {
    format: 'CODE128',
  },
  qr: {
    errorCorrection: 'M',
  },
  shape: {
    shapeType: 'rectangle',
    fill: 'none',
    stroke: 'black',
    strokeWidth: 2,
    cornerRadius: 0,
  },
};

// =============================================================================
// SHAPE CONSTRAINTS
// =============================================================================
export const SHAPE = {
  MIN_STROKE_WIDTH: 1,
  MAX_STROKE_WIDTH: 20,
  DEFAULT_STROKE_WIDTH: 2,
  MIN_CORNER_RADIUS: 0,
  MAX_CORNER_RADIUS: 50,
};

// =============================================================================
// BARCODE VALIDATION
// =============================================================================
export const BARCODE = {
  MAX_LENGTH: {
    CODE128: 80,
    EAN13: 13,
    CODE39: 43,
    UPC: 12,
  },
  PATTERNS: {
    EAN13: /^\d{0,13}$/,
    UPC: /^\d{0,12}$/,
    CODE39: /^[A-Z0-9\-. $/+%]*$/i,
    CODE128: /^[\x00-\x7F]*$/, // ASCII only
  },
};

// =============================================================================
// QR CODE CONSTRAINTS
// =============================================================================
export const QR = {
  MAX_DATA_LENGTH: 2953, // QR version 40, error correction L
};

// =============================================================================
// CANVAS RENDERING
// =============================================================================
export const CANVAS = {
  SELECTION_COLOR: '#3b82f6',
  SELECTION_LINE_WIDTH: 1,
  GUIDE_COLOR: '#3b82f6',
  GUIDE_LINE_WIDTH: 1,
  BACKGROUND_PATTERN_SIZE: 10,
};

// =============================================================================
// AVAILABLE FONTS
// =============================================================================
export const FONTS = [
  { value: 'Inter, sans-serif', label: 'Inter' },
  { value: 'Arial, sans-serif', label: 'Arial' },
  { value: 'Helvetica, sans-serif', label: 'Helvetica' },
  { value: 'Georgia, serif', label: 'Georgia' },
  { value: 'Times New Roman, serif', label: 'Times' },
  { value: 'Courier New, monospace', label: 'Courier' },
  { value: 'Verdana, sans-serif', label: 'Verdana' },
  { value: 'Trebuchet MS, sans-serif', label: 'Trebuchet' },
];

// =============================================================================
// SHAPE TYPES
// =============================================================================
export const SHAPE_TYPES = [
  { value: 'rectangle', label: 'Rectangle' },
  { value: 'ellipse', label: 'Ellipse' },
  { value: 'triangle', label: 'Triangle' },
  { value: 'line', label: 'Line' },
];

// =============================================================================
// BARCODE FORMATS
// =============================================================================
export const BARCODE_FORMATS = [
  { value: 'CODE128', label: 'Code 128' },
  { value: 'EAN13', label: 'EAN-13' },
  { value: 'CODE39', label: 'Code 39' },
  { value: 'UPC', label: 'UPC-A' },
];
