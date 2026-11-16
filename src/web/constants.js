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
// TOUCH GESTURES
// =============================================================================
export const TOUCH = {
  LONG_PRESS_DURATION_MS: 500,
  LONG_PRESS_MOVE_TOLERANCE: 10,
  PINCH_MIN_DISTANCE: 50,
  DOUBLE_TAP_DELAY_MS: 300,
};

// =============================================================================
// BLE TRANSPORT
// =============================================================================
export const BLE = {
  SERVICE_UUID: 0xff00,
  WRITE_CHAR_UUID: 0xff02,
  NOTIFY_CHAR_UUID: 0xff03,
  // Alternative service UUIDs for different printer models (PM-241, etc.)
  ALT_SERVICE_UUIDS: [
    0xff00,           // Standard Phomemo
    0xffe0,           // Common thermal printer service
    0xae30,           // Some label printers
    '49535343-fe7d-4ae5-8fa9-9fafd205e455', // ISS (Issc) service
    '0000ff00-0000-1000-8000-00805f9b34fb', // Full UUID variant
  ],
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
  LOCAL_FONTS_ENABLED: 'phomymo_local_fonts_enabled',
  CUSTOM_PRINTERS: 'phomymo_custom_printers',
  THEME: 'phomymo_theme',
};

// =============================================================================
// APP THEMES (UI chrome only - the label/canvas itself always stays white +
// black, since it represents the physical printed output. See the
// `[data-theme]` CSS rules in index.html for the actual color values.)
// =============================================================================
export const THEMES = [
  { id: 'light', label: 'Light', swatch: ['#ffffff', '#f3f4f6', '#2563eb'] },
  { id: 'material-dark', label: 'Material Dark', swatch: ['#121212', '#1e1e1e', '#90caf9'] },
  { id: 'oled-dark', label: 'OLED Dark', swatch: ['#000000', '#0d0d0d', '#4fc3f7'] },
  { id: 'dracula', label: 'Dracula', swatch: ['#282a36', '#383a4a', '#bd93f9'] },
  { id: 'nord', label: 'Nord', swatch: ['#2e3440', '#3b4252', '#88c0d0'] },
];

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

// Round/circle labels for M-series printers - diameter in mm
export const M_SERIES_ROUND_LABELS = {
  '20mm Round': { width: 20, height: 20, round: true },
  '30mm Round': { width: 30, height: 30, round: true },
  '40mm Round': { width: 40, height: 40, round: true },
  '50mm Round': { width: 50, height: 50, round: true },
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

// D-series continuous tape sizes (no die-cut gaps)
export const D_SERIES_CONTINUOUS_SIZES = {
  '40x12 cont': { width: 40, height: 12, continuous: true },
  '30x12 cont': { width: 30, height: 12, continuous: true },
  '22x12 cont': { width: 22, height: 12, continuous: true },
  '40x15 cont': { width: 40, height: 15, continuous: true },
  '30x15 cont': { width: 30, height: 15, continuous: true },
};

// Round/circle labels for D-series printers - diameter in mm
export const D_SERIES_ROUND_LABELS = {
  '14mm Round': { width: 14, height: 14, round: true },
};

// Tape printers (P12, A30) - continuous tape with variable widths
// Height = tape width (12mm, 14mm, 15mm), Width = label length
export const TAPE_LABEL_SIZES = {
  // 12mm tape
  '40x12': { width: 40, height: 12, tapeWidth: 12 },
  '30x12': { width: 30, height: 12, tapeWidth: 12 },
  '22x12': { width: 22, height: 12, tapeWidth: 12 },
  '12x12': { width: 12, height: 12, tapeWidth: 12 },
  // 14mm tape
  '40x14': { width: 40, height: 14, tapeWidth: 14 },
  '30x14': { width: 30, height: 14, tapeWidth: 14 },
  '22x14': { width: 22, height: 14, tapeWidth: 14 },
  '14x14': { width: 14, height: 14, tapeWidth: 14 },
  // 15mm tape
  '40x15': { width: 40, height: 15, tapeWidth: 15 },
  '30x15': { width: 30, height: 15, tapeWidth: 15 },
  '22x15': { width: 22, height: 15, tapeWidth: 15 },
  '15x15': { width: 15, height: 15, tapeWidth: 15 },
};

// PM-241 series printers (PM-241-BT) - 4-inch (102mm) shipping label printer
// Standard shipping label sizes in mm
export const PM241_LABEL_SIZES = {
  '102x152': { width: 102, height: 152 },  // 4x6" - standard shipping label
  '102x102': { width: 102, height: 102 },  // 4x4" - square label
  '102x76': { width: 102, height: 76 },    // 4x3" - smaller shipping label
  '102x51': { width: 102, height: 51 },    // 4x2" - return address label
  '100x150': { width: 100, height: 150 },  // Common metric size
  '100x100': { width: 100, height: 100 },  // Square metric
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
  { value: 'diamond', label: 'Diamond' },
  { value: 'pentagon', label: 'Pentagon' },
  { value: 'hexagon', label: 'Hexagon' },
  { value: 'octagon', label: 'Octagon' },
  { value: 'star', label: 'Star' },
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

// =============================================================================
// SYMBOL LIBRARY (for the "Symbols" picker)
// Path data is from Google's Material Symbols (Apache License 2.0),
// fetched from fonts.gstatic.com's public static icon host - same
// viewBox convention ("0 -960 960 960") for every entry, filled style.
// See NOTICE.md for attribution.
// =============================================================================
export const SYMBOL_LIBRARY = [
  { id: 'star', label: 'Star', path: 'm233-120 65-281L80-590l288-25 112-265 112 265 288 25-218 189 65 281-247-149-247 149Z' },
  { id: 'favorite', label: 'Heart', path: 'm480-120-58-52q-101-91-167-157T150-447.5Q111-500 95.5-544T80-634q0-94 63-157t157-63q52 0 99 22t81 62q34-40 81-62t99-22q94 0 157 63t63 157q0 46-15.5 90T810-447.5Q771-395 705-329T538-172l-58 52Z' },
  { id: 'check_circle', label: 'Check', path: 'm424-296 282-282-56-56-226 226-114-114-56 56 170 170Zm56 216q-83 0-156-31.5T197-197q-54-54-85.5-127T80-480q0-83 31.5-156T197-763q54-54 127-85.5T480-880q83 0 156 31.5T763-763q54 54 85.5 127T880-480q0 83-31.5 156T763-197q-54 54-127 85.5T480-80Z' },
  { id: 'cancel', label: 'X / Cancel', path: 'm336-280 144-144 144 144 56-56-144-144 144-144-56-56-144 144-144-144-56 56 144 144-144 144 56 56ZM480-80q-83 0-156-31.5T197-197q-54-54-85.5-127T80-480q0-83 31.5-156T197-763q54-54 127-85.5T480-880q83 0 156 31.5T763-763q54 54 85.5 127T880-480q0 83-31.5 156T763-197q-54 54-127 85.5T480-80Z' },
  { id: 'warning', label: 'Warning', path: 'm40-120 440-760 440 760H40Zm468.5-131.5Q520-263 520-280t-11.5-28.5Q497-320 480-320t-28.5 11.5Q440-297 440-280t11.5 28.5Q463-240 480-240t28.5-11.5ZM440-360h80v-200h-80v200Z' },
  { id: 'info', label: 'Info', path: 'M440-280h80v-240h-80v240Zm68.5-331.5Q520-623 520-640t-11.5-28.5Q497-680 480-680t-28.5 11.5Q440-657 440-640t11.5 28.5Q463-600 480-600t28.5-11.5ZM480-80q-83 0-156-31.5T197-197q-54-54-85.5-127T80-480q0-83 31.5-156T197-763q54-54 127-85.5T480-880q83 0 156 31.5T763-763q54 54 85.5 127T880-480q0 83-31.5 156T763-197q-54 54-127 85.5T480-80Z' },
  { id: 'home', label: 'Home', path: 'M160-120v-480l320-240 320 240v480H560v-280H400v280H160Z' },
  { id: 'flag', label: 'Flag', path: 'M200-120v-680h360l16 80h224v400H520l-16-80H280v280h-80Z' },
  { id: 'notifications', label: 'Bell', path: 'M160-200v-80h80v-280q0-83 50-147.5T420-792v-28q0-25 17.5-42.5T480-880q25 0 42.5 17.5T540-820v28q80 20 130 84.5T720-560v280h80v80H160ZM480-80q-33 0-56.5-23.5T400-160h160q0 33-23.5 56.5T480-80Z' },
  { id: 'redeem', label: 'Gift', path: 'M160-280v80h640v-80H160Zm0-440h88q-5-9-6.5-19t-1.5-21q0-50 35-85t85-35q30 0 55.5 15.5T460-826l20 26 20-26q18-24 44-39t56-15q50 0 85 35t35 85q0 11-1.5 21t-6.5 19h88q33 0 56.5 23.5T880-640v440q0 33-23.5 56.5T800-120H160q-33 0-56.5-23.5T80-200v-440q0-33 23.5-56.5T160-720Zm0 320h640v-240H596l84 114-64 46-136-184-136 184-64-46 82-114H160v240Zm228.5-331.5Q400-743 400-760t-11.5-28.5Q377-800 360-800t-28.5 11.5Q320-777 320-760t11.5 28.5Q343-720 360-720t28.5-11.5ZM600-720q17 0 28.5-11.5T640-760q0-17-11.5-28.5T600-800q-17 0-28.5 11.5T560-760q0 17 11.5 28.5T600-720Z' },
  { id: 'wb_sunny', label: 'Sun', path: 'M440-800v-120h80v120h-80Zm0 760v-120h80v120h-80Zm360-400v-80h120v80H800Zm-760 0v-80h120v80H40Zm708-252-56-56 70-72 58 58-72 70ZM198-140l-58-58 72-70 56 56-70 72Zm564 0-70-72 56-56 72 70-58 58ZM212-692l-72-70 58-58 70 72-56 56Zm98 382q-70-70-70-170t70-170q70-70 170-70t170 70q70 70 70 170t-70 170q-70 70-170 70t-170-70Z' },
  { id: 'nightlight', label: 'Moon', path: 'M560-80q-82 0-155-31.5t-127.5-86Q223-252 191.5-325T160-480.5q0-82.5 31.5-155t86-127Q332-817 405-848.5T560-880q54 0 105 14t95 40q-91 53-145.5 143.5T560-480q0 112 54.5 202.5T760-134q-44 26-95 40T560-80Z' },
  { id: 'cloud', label: 'Cloud', path: 'M260-160q-91 0-155.5-63T40-377q0-78 47-139t123-78q25-92 100-149t170-57q117 0 198.5 81.5T760-520q69 8 114.5 59.5T920-340q0 75-52.5 127.5T740-160H260Z' },
  { id: 'ac_unit', label: 'Snowflake', path: 'M440-80v-166L310-118l-56-56 186-186v-80h-80L174-254l-56-56 128-130H80v-80h166L118-650l56-56 186 186h80v-80L254-786l56-56 130 128v-166h80v166l130-128 56 56-186 186v80h80l186-186 56 56-128 130h166v80H714l128 130-56 56-186-186h-80v80l186 186-56 56-130-128v166h-80Z' },
  { id: 'local_fire_department', label: 'Flame', path: 'M160-400q0-105 50-187t110-138q60-56 110-85.5l50-29.5v132q0 37 25 58.5t56 21.5q17 0 32.5-7t28.5-23l18-22q72 42 116 116.5T800-400q0 88-43 160.5T644-125q17-24 26.5-52.5T680-238q0-40-15-75.5T622-377L480-516 339-377q-29 29-44 64t-15 75q0 32 9.5 60.5T316-125q-70-42-113-114.5T160-400Zm320-4 85 83q17 17 26 38t9 45q0 49-35 83.5T480-120q-50 0-85-34.5T360-238q0-23 9-44.5t26-38.5l85-83Z' },
  { id: 'forest', label: 'Tree', path: 'M520-80v-120h160v120H520Zm-240 0v-160H0l154-240H80l280-400 280 400h-74l155 240H440v160H280Zm490-160L640-440h77L505-743l95-137 280 400h-74l154 240H770Z' },
  { id: 'pets', label: 'Paw', path: 'M180-475q-42 0-71-29t-29-71q0-42 29-71t71-29q42 0 71 29t29 71q0 42-29 71t-71 29Zm109-189q-29-29-29-71t29-71q29-29 71-29t71 29q29 29 29 71t-29 71q-29 29-71 29t-71-29Zm240 0q-29-29-29-71t29-71q29-29 71-29t71 29q29 29 29 71t-29 71q-29 29-71 29t-71-29Zm251 189q-42 0-71-29t-29-71q0-42 29-71t71-29q42 0 71 29t29 71q0 42-29 71t-71 29ZM266-75q-45 0-75.5-34.5T160-191q0-52 35.5-91t70.5-77q29-31 50-67.5t50-68.5q22-26 51-43t63-17q34 0 63 16t51 42q28 32 49.5 69t50.5 69q35 38 70.5 77t35.5 91q0 47-30.5 81.5T694-75q-54 0-107-9t-107-9q-54 0-107 9t-107 9Z' },
  { id: 'anchor', label: 'Anchor', path: 'M355-102q-64-22-116-60t-85.5-89Q120-302 120-360v-120l160 120-62 62q29 51 92 88t130 47v-357H320v-80h120v-47q-35-13-57.5-43.5T360-760q0-50 35-85t85-35q50 0 85 35t35 85q0 39-22.5 69.5T520-647v47h120v80H520v357q67-10 130-47t92-88l-62-62 160-120v120q0 58-33.5 109T721-162q-52 38-116 60T480-80q-61 0-125-22Zm125-618q17 0 28.5-11.5T520-760q0-17-11.5-28.5T480-800q-17 0-28.5 11.5T440-760q0 17 11.5 28.5T480-720Z' },
  { id: 'music_note', label: 'Music Note', path: 'M287-167q-47-47-47-113t47-113q47-47 113-47 23 0 42.5 5.5T480-418v-422h240v160H560v400q0 66-47 113t-113 47q-66 0-113-47Z' },
  { id: 'photo_camera', label: 'Camera', path: 'M480-260q75 0 127.5-52.5T660-440q0-75-52.5-127.5T480-620q-75 0-127.5 52.5T300-440q0 75 52.5 127.5T480-260Zm0-80q-42 0-71-29t-29-71q0-42 29-71t71-29q42 0 71 29t29 71q0 42-29 71t-71 29ZM160-120q-33 0-56.5-23.5T80-200v-480q0-33 23.5-56.5T160-760h126l74-80h240l74 80h126q33 0 56.5 23.5T880-680v480q0 33-23.5 56.5T800-120H160Z' },
  { id: 'bolt', label: 'Lightning', path: 'm320-80 40-280H160l360-520h80l-40 320h240L400-80h-80Z' },
  { id: 'lock', label: 'Lock', path: 'M240-80q-33 0-56.5-23.5T160-160v-400q0-33 23.5-56.5T240-640h40v-80q0-83 58.5-141.5T480-920q83 0 141.5 58.5T680-720v80h40q33 0 56.5 23.5T800-560v400q0 33-23.5 56.5T720-80H240Zm296.5-223.5Q560-327 560-360t-23.5-56.5Q513-440 480-440t-56.5 23.5Q400-393 400-360t23.5 56.5Q447-280 480-280t56.5-23.5ZM360-640h240v-80q0-50-35-85t-85-35q-50 0-85 35t-35 85v80Z' },
  { id: 'key', label: 'Key', path: 'M365-395q35-35 35-85t-35-85q-35-35-85-35t-85 35q-35 35-35 85t35 85q35 35 85 35t85-35Zm-85 155q-100 0-170-70T40-480q0-100 70-170t170-70q81 0 141.5 46T506-560h335l79 79-140 160-100-79-80 80-80-80h-14q-25 72-87 116t-139 44Z' },
  { id: 'skull', label: 'Skull', path: 'M420-330h120l-60-120-60 120Zm-80-110q33 0 56.5-23.5T420-520q0-33-23.5-56.5T340-600q-33 0-56.5 23.5T260-520q0 33 23.5 56.5T340-440Zm280 0q33 0 56.5-23.5T700-520q0-33-23.5-56.5T620-600q-33 0-56.5 23.5T540-520q0 33 23.5 56.5T620-440ZM240-80v-170q-39-17-68.5-45.5t-50-64.5q-20.5-36-31-77T80-520q0-158 112-259t288-101q176 0 288 101t112 259q0 42-10.5 83t-31 77q-20.5 36-50 64.5T720-250v170H600v-80h-80v80h-80v-80h-80v80H240Z' },
  { id: 'thumb_up', label: 'Thumbs Up', path: 'M720-120H320v-520l280-280 50 50q7 7 11.5 19t4.5 23v14l-44 174h218q32 0 56 24t24 56v80q0 7-1.5 15t-4.5 15L794-168q-9 20-30 34t-44 14ZM240-640v520H80v-520h160Z' },
];

// =============================================================================
// ORNAMENT LIBRARY (for the "Ornaments" corner-decoration picker)
// Each is a small, original, hand-authored decorative motif anchored to the
// top-left corner of its 100x100 viewBox - rotate the placed element (the
// app already supports rotating any element) to mirror it into any corner.
// "currentColor" lets the picker preview inherit the button's text color;
// addOrnamentElement() swaps it for literal black before rasterizing.
// =============================================================================
export const ORNAMENT_LIBRARY = [
  {
    id: 'bracket',
    label: 'Bracket',
    svg: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><path d="M10 40 L10 10 L40 10" fill="none" stroke="currentColor" stroke-width="5" stroke-linecap="round"/><path d="M22 32 L22 22 L32 22" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round"/></svg>',
  },
  {
    id: 'dots',
    label: 'Dot Border',
    svg: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><circle cx="10" cy="90" r="4" fill="currentColor"/><circle cx="10" cy="70" r="4" fill="currentColor"/><circle cx="10" cy="50" r="4" fill="currentColor"/><circle cx="10" cy="30" r="4" fill="currentColor"/><circle cx="10" cy="10" r="4" fill="currentColor"/><circle cx="30" cy="10" r="4" fill="currentColor"/><circle cx="50" cy="10" r="4" fill="currentColor"/><circle cx="70" cy="10" r="4" fill="currentColor"/><circle cx="90" cy="10" r="4" fill="currentColor"/></svg>',
  },
  {
    id: 'diamonds',
    label: 'Diamond Border',
    svg: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><path d="M10 2 L18 10 L10 18 L2 10 Z" fill="currentColor"/><path d="M34 2 L42 10 L34 18 L26 10 Z" fill="currentColor"/><path d="M58 2 L66 10 L58 18 L50 10 Z" fill="currentColor"/><path d="M10 26 L18 34 L10 42 L2 34 Z" fill="currentColor"/><path d="M10 50 L18 58 L10 66 L2 58 Z" fill="currentColor"/></svg>',
  },
  {
    id: 'vine',
    label: 'Vine',
    svg: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><path d="M6 94 C6 60 10 20 48 10 C68 5 82 16 80 30 C78 44 60 46 55 34 C51 24 60 17 70 20" fill="none" stroke="currentColor" stroke-width="4" stroke-linecap="round"/><path d="M26 58 C18 52 17 40 26 34 C35 28 45 35 42 46 C40 54 32 58 26 58Z" fill="currentColor"/></svg>',
  },
  {
    id: 'laurel',
    label: 'Laurel Sprig',
    svg: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><path d="M14 86 Q26 76 20 60 Q36 66 30 82 Q24 92 14 86Z" fill="currentColor"/><path d="M36 64 Q48 54 42 38 Q58 44 52 60 Q46 70 36 64Z" fill="currentColor"/><path d="M58 42 Q70 32 64 16 Q80 22 74 38 Q68 48 58 42Z" fill="currentColor"/></svg>',
  },
];
