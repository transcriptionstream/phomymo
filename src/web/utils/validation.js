/**
 * Input Validation Utilities
 * Consistent validation across the application
 */

import {
  TEXT,
  IMAGE,
  ELEMENT,
  LABEL,
  PRINT,
  SHAPE,
  BARCODE,
  QR,
} from '../constants.js';

/**
 * Clamp a number within a range
 * @param {number} value - Value to clamp
 * @param {number} min - Minimum value
 * @param {number} max - Maximum value
 * @returns {number} Clamped value
 */
export function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

/**
 * Parse and clamp an integer
 * @param {string|number} value - Value to parse
 * @param {number} defaultVal - Default if invalid
 * @param {number} min - Minimum value
 * @param {number} max - Maximum value
 * @returns {number} Validated integer
 */
export function parseIntClamped(value, defaultVal, min = -Infinity, max = Infinity) {
  const parsed = parseInt(value, 10);
  if (isNaN(parsed)) return defaultVal;
  return clamp(parsed, min, max);
}

/**
 * Parse and clamp a float
 * @param {string|number} value - Value to parse
 * @param {number} defaultVal - Default if invalid
 * @param {number} min - Minimum value
 * @param {number} max - Maximum value
 * @returns {number} Validated float
 */
export function parseFloatClamped(value, defaultVal, min = -Infinity, max = Infinity) {
  const parsed = parseFloat(value);
  if (isNaN(parsed)) return defaultVal;
  return clamp(parsed, min, max);
}

/**
 * Validate font size
 * @param {string|number} value - Font size value
 * @returns {number} Valid font size
 */
export function validateFontSize(value) {
  return parseIntClamped(value, TEXT.DEFAULT_FONT_SIZE, TEXT.MIN_FONT_SIZE, TEXT.MAX_FONT_SIZE);
}

/**
 * Validate image scale percentage
 * @param {string|number} value - Scale percentage
 * @returns {number} Valid scale (10-200)
 */
export function validateImageScale(value) {
  return parseIntClamped(value, IMAGE.DEFAULT_SCALE, IMAGE.MIN_SCALE, IMAGE.MAX_SCALE);
}

/**
 * Validate element width
 * @param {string|number} value - Width value
 * @param {number} maxWidth - Maximum width (label width)
 * @returns {number} Valid width
 */
export function validateWidth(value, maxWidth = Infinity) {
  return parseFloatClamped(value, ELEMENT.MIN_WIDTH, ELEMENT.MIN_WIDTH, maxWidth);
}

/**
 * Validate element height
 * @param {string|number} value - Height value
 * @param {number} maxHeight - Maximum height (label height)
 * @returns {number} Valid height
 */
export function validateHeight(value, maxHeight = Infinity) {
  return parseFloatClamped(value, ELEMENT.MIN_HEIGHT, ELEMENT.MIN_HEIGHT, maxHeight);
}

/**
 * Validate label width
 * @param {string|number} value - Width value in mm
 * @returns {number} Valid label width
 */
export function validateLabelWidth(value) {
  return parseIntClamped(value, 40, LABEL.MIN_WIDTH, LABEL.MAX_WIDTH);
}

/**
 * Validate label height
 * @param {string|number} value - Height value in mm
 * @returns {number} Valid label height
 */
export function validateLabelHeight(value) {
  return parseIntClamped(value, 30, LABEL.MIN_HEIGHT, LABEL.MAX_HEIGHT);
}

/**
 * Validate print copies
 * @param {string|number} value - Number of copies
 * @returns {number} Valid copies count
 */
export function validateCopies(value) {
  return parseIntClamped(value, PRINT.DEFAULT_COPIES, PRINT.MIN_COPIES, PRINT.MAX_COPIES);
}

/**
 * Validate rotation angle
 * @param {string|number} value - Rotation in degrees
 * @returns {number} Valid rotation (normalized to 0-360)
 */
export function validateRotation(value) {
  const parsed = parseFloat(value);
  if (isNaN(parsed)) return 0;
  // Normalize to 0-360 range
  return ((parsed % 360) + 360) % 360;
}

/**
 * Validate stroke width
 * @param {string|number} value - Stroke width
 * @returns {number} Valid stroke width
 */
export function validateStrokeWidth(value) {
  return parseIntClamped(value, SHAPE.DEFAULT_STROKE_WIDTH, SHAPE.MIN_STROKE_WIDTH, SHAPE.MAX_STROKE_WIDTH);
}

/**
 * Validate corner radius
 * @param {string|number} value - Corner radius
 * @returns {number} Valid corner radius
 */
export function validateCornerRadius(value) {
  return parseIntClamped(value, 0, SHAPE.MIN_CORNER_RADIUS, SHAPE.MAX_CORNER_RADIUS);
}

/**
 * Validate barcode data for a specific format
 * @param {string} data - Barcode data
 * @param {string} format - Barcode format (CODE128, EAN13, etc.)
 * @returns {{ valid: boolean, error?: string, sanitized: string }}
 */
export function validateBarcodeData(data, format = 'CODE128') {
  if (!data || typeof data !== 'string') {
    return { valid: false, error: 'Barcode data is required', sanitized: '' };
  }

  const trimmed = data.trim();

  if (trimmed.length === 0) {
    return { valid: false, error: 'Barcode data cannot be empty', sanitized: '' };
  }

  const maxLength = BARCODE.MAX_LENGTH[format] || BARCODE.MAX_LENGTH.CODE128;
  const pattern = BARCODE.PATTERNS[format] || BARCODE.PATTERNS.CODE128;

  if (trimmed.length > maxLength) {
    return {
      valid: false,
      error: `Data too long (max ${maxLength} characters for ${format})`,
      sanitized: trimmed.slice(0, maxLength)
    };
  }

  if (!pattern.test(trimmed)) {
    const formatErrors = {
      EAN13: 'EAN-13 requires exactly 13 digits',
      UPC: 'UPC requires exactly 12 digits',
      CODE39: 'Code 39 only allows A-Z, 0-9, and -. $/+%',
      CODE128: 'Code 128 only allows ASCII characters',
    };
    return {
      valid: false,
      error: formatErrors[format] || 'Invalid characters in barcode data',
      sanitized: trimmed
    };
  }

  // Additional format-specific validation
  if (format === 'EAN13') {
    if (trimmed.length !== 13) {
      return { valid: false, error: 'EAN-13 requires exactly 13 digits', sanitized: trimmed };
    }
    // Validate EAN-13 check digit
    if (!validateEAN13CheckDigit(trimmed)) {
      return { valid: false, error: 'Invalid EAN-13 check digit', sanitized: trimmed };
    }
  }
  if (format === 'UPC') {
    if (trimmed.length !== 12) {
      return { valid: false, error: 'UPC requires exactly 12 digits', sanitized: trimmed };
    }
    // Validate UPC-A check digit
    if (!validateUPCCheckDigit(trimmed)) {
      return { valid: false, error: 'Invalid UPC-A check digit', sanitized: trimmed };
    }
  }

  return { valid: true, sanitized: trimmed };
}

/**
 * Validate EAN-13 check digit
 * @param {string} code - 13-digit EAN code
 * @returns {boolean} True if check digit is valid
 */
function validateEAN13CheckDigit(code) {
  if (code.length !== 13) return false;
  let sum = 0;
  for (let i = 0; i < 12; i++) {
    const digit = parseInt(code[i], 10);
    sum += digit * (i % 2 === 0 ? 1 : 3);
  }
  const checkDigit = (10 - (sum % 10)) % 10;
  return checkDigit === parseInt(code[12], 10);
}

/**
 * Validate UPC-A check digit
 * @param {string} code - 12-digit UPC code
 * @returns {boolean} True if check digit is valid
 */
function validateUPCCheckDigit(code) {
  if (code.length !== 12) return false;
  let sum = 0;
  for (let i = 0; i < 11; i++) {
    const digit = parseInt(code[i], 10);
    sum += digit * (i % 2 === 0 ? 3 : 1);
  }
  const checkDigit = (10 - (sum % 10)) % 10;
  return checkDigit === parseInt(code[11], 10);
}

/**
 * Validate QR code data
 * @param {string} data - QR data
 * @returns {{ valid: boolean, error?: string, sanitized: string }}
 */
export function validateQRData(data) {
  if (!data || typeof data !== 'string') {
    return { valid: false, error: 'QR data is required', sanitized: '' };
  }

  const trimmed = data.trim();

  if (trimmed.length === 0) {
    return { valid: false, error: 'QR data cannot be empty', sanitized: '' };
  }

  if (trimmed.length > QR.MAX_DATA_LENGTH) {
    return {
      valid: false,
      error: `Data too long (max ${QR.MAX_DATA_LENGTH} characters)`,
      sanitized: trimmed.slice(0, QR.MAX_DATA_LENGTH)
    };
  }

  return { valid: true, sanitized: trimmed };
}

/**
 * Validate text content (non-empty after trim)
 * @param {string} text - Text content
 * @param {number} maxLength - Maximum length (default 10000)
 * @returns {{ valid: boolean, error?: string, sanitized: string }}
 */
export function validateTextContent(text, maxLength = 10000) {
  if (text === null || text === undefined) {
    return { valid: true, sanitized: '' };
  }

  const str = String(text);

  if (str.length > maxLength) {
    return {
      valid: false,
      error: `Text too long (max ${maxLength} characters)`,
      sanitized: str.slice(0, maxLength)
    };
  }

  return { valid: true, sanitized: str };
}

/**
 * Validate design name
 * @param {string} name - Design name
 * @returns {{ valid: boolean, error?: string, sanitized: string }}
 */
export function validateDesignName(name) {
  if (!name || typeof name !== 'string') {
    return { valid: false, error: 'Design name is required', sanitized: '' };
  }

  const trimmed = name.trim();

  if (trimmed.length === 0) {
    return { valid: false, error: 'Design name cannot be empty', sanitized: '' };
  }

  if (trimmed.length > 100) {
    return {
      valid: false,
      error: 'Design name too long (max 100 characters)',
      sanitized: trimmed.slice(0, 100)
    };
  }

  // Check for invalid filename characters
  const invalidChars = /[<>:"/\\|?*]/;
  if (invalidChars.test(trimmed)) {
    return {
      valid: false,
      error: 'Name contains invalid characters',
      sanitized: trimmed.replace(invalidChars, '')
    };
  }

  return { valid: true, sanitized: trimmed };
}

/**
 * Validate file for image upload
 * @param {File} file - File object
 * @param {number} maxSizeMB - Maximum file size in MB (default 10)
 * @returns {{ valid: boolean, error?: string }}
 */
export function validateImageFile(file, maxSizeMB = 10) {
  if (!file) {
    return { valid: false, error: 'No file provided' };
  }

  const validTypes = ['image/png', 'image/jpeg', 'image/gif', 'image/webp', 'image/svg+xml', 'application/pdf'];

  if (!validTypes.includes(file.type)) {
    return {
      valid: false,
      error: 'Invalid file type. Use PNG, JPEG, GIF, WebP, SVG, or PDF'
    };
  }

  const maxBytes = maxSizeMB * 1024 * 1024;
  if (file.size > maxBytes) {
    return {
      valid: false,
      error: `File too large (max ${maxSizeMB}MB)`
    };
  }

  return { valid: true };
}

/**
 * Validate CSV file
 * @param {File} file - File object
 * @param {number} maxSizeMB - Maximum file size in MB (default 5)
 * @returns {{ valid: boolean, error?: string }}
 */
export function validateCSVFile(file, maxSizeMB = 5) {
  if (!file) {
    return { valid: false, error: 'No file provided' };
  }

  const validTypes = ['text/csv', 'application/vnd.ms-excel', 'text/plain'];
  const validExtensions = ['.csv', '.txt'];

  const hasValidType = validTypes.includes(file.type) || file.type === '';
  const hasValidExtension = validExtensions.some(ext => file.name.toLowerCase().endsWith(ext));

  if (!hasValidType && !hasValidExtension) {
    return { valid: false, error: 'Invalid file type. Use CSV or TXT files' };
  }

  const maxBytes = maxSizeMB * 1024 * 1024;
  if (file.size > maxBytes) {
    return { valid: false, error: `File too large (max ${maxSizeMB}MB)` };
  }

  return { valid: true };
}

/**
 * Validate JSON design file
 * @param {File} file - File object
 * @param {number} maxSizeMB - Maximum file size in MB (default 10)
 * @returns {{ valid: boolean, error?: string }}
 */
export function validateJSONFile(file, maxSizeMB = 10) {
  if (!file) {
    return { valid: false, error: 'No file provided' };
  }

  const validTypes = ['application/json', 'text/plain'];
  const validExtensions = ['.json', '.txt'];

  const hasValidType = validTypes.includes(file.type) || file.type === '';
  const hasValidExtension = validExtensions.some(ext => file.name.toLowerCase().endsWith(ext));

  if (!hasValidType && !hasValidExtension) {
    return { valid: false, error: 'Invalid file type. Use JSON files' };
  }

  const maxBytes = maxSizeMB * 1024 * 1024;
  if (file.size > maxBytes) {
    return { valid: false, error: `File too large (max ${maxSizeMB}MB)` };
  }

  return { valid: true };
}

/**
 * Validate position (x or y coordinate)
 * @param {string|number} value - Position value
 * @param {number} labelDimension - Label width or height
 * @returns {number} Valid position
 */
export function validatePosition(value, labelDimension = 1000) {
  const parsed = parseFloat(value);
  if (isNaN(parsed)) return 0;
  // Allow negative positions and positions beyond label (for partial visibility)
  return clamp(parsed, -500, labelDimension + 500);
}

/**
 * Sanitize HTML to prevent XSS (basic)
 * @param {string} str - String to sanitize
 * @returns {string} Sanitized string
 */
export function sanitizeHTML(str) {
  if (!str || typeof str !== 'string') return '';
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

/**
 * Check if a value is a valid non-empty string
 * @param {*} value - Value to check
 * @returns {boolean}
 */
export function isNonEmptyString(value) {
  return typeof value === 'string' && value.trim().length > 0;
}

/**
 * Check if a value is a positive number
 * @param {*} value - Value to check
 * @returns {boolean}
 */
export function isPositiveNumber(value) {
  return typeof value === 'number' && !isNaN(value) && value > 0;
}

/**
 * Validate and normalize element properties
 * @param {Object} props - Element properties to validate
 * @param {string} elementType - Element type ('text', 'image', etc.)
 * @returns {Object} Validated properties
 */
export function validateElementProps(props, elementType) {
  const validated = { ...props };

  // Common properties
  if ('x' in props) validated.x = parseFloat(props.x) || 0;
  if ('y' in props) validated.y = parseFloat(props.y) || 0;
  if ('width' in props) validated.width = validateWidth(props.width);
  if ('height' in props) validated.height = validateHeight(props.height);
  if ('rotation' in props) validated.rotation = validateRotation(props.rotation);

  // Type-specific properties
  switch (elementType) {
    case 'text':
      if ('fontSize' in props) validated.fontSize = validateFontSize(props.fontSize);
      if ('text' in props) validated.text = validateTextContent(props.text).sanitized;
      break;

    case 'image':
      // Scale is handled as percentage
      break;

    case 'barcode':
      if ('barcodeData' in props) {
        const result = validateBarcodeData(props.barcodeData, props.barcodeFormat);
        validated.barcodeData = result.sanitized;
      }
      break;

    case 'qr':
      if ('qrData' in props) {
        const result = validateQRData(props.qrData);
        validated.qrData = result.sanitized;
      }
      break;

    case 'shape':
      if ('strokeWidth' in props) validated.strokeWidth = validateStrokeWidth(props.strokeWidth);
      if ('cornerRadius' in props) validated.cornerRadius = validateCornerRadius(props.cornerRadius);
      break;
  }

  return validated;
}
