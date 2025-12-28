/**
 * Template system for variable data printing
 * Handles field detection, substitution, and CSV parsing
 */

// Field pattern: {{FieldName}}
const FIELD_PATTERN = /\{\{([^}]+)\}\}/g;

/**
 * Extract all field names from elements
 * @param {Array} elements - Array of label elements
 * @returns {Array} - Array of unique field names
 */
export function extractFields(elements) {
  const fields = new Set();

  for (const el of elements) {
    // Check text content
    if (el.text) {
      extractFromString(el.text, fields);
    }
    // Check barcode data
    if (el.barcodeData) {
      extractFromString(el.barcodeData, fields);
    }
    // Check QR data
    if (el.qrData) {
      extractFromString(el.qrData, fields);
    }
  }

  return Array.from(fields);
}

/**
 * Extract field names from a string
 * @param {string} str - String to search
 * @param {Set} fields - Set to add field names to
 */
function extractFromString(str, fields) {
  // Reset regex lastIndex for fresh search
  FIELD_PATTERN.lastIndex = 0;
  let match;
  while ((match = FIELD_PATTERN.exec(str)) !== null) {
    fields.add(match[1].trim());
  }
}

/**
 * Check if elements contain any template fields
 * @param {Array} elements - Array of label elements
 * @returns {boolean}
 */
export function hasTemplateFields(elements) {
  return extractFields(elements).length > 0;
}

/**
 * Substitute fields in elements with values from a record
 * @param {Array} elements - Array of label elements
 * @param {Object} record - Object with field values { FieldName: 'value', ... }
 * @returns {Array} - New array of elements with substituted values
 */
export function substituteFields(elements, record) {
  return elements.map(el => {
    const clone = { ...el };

    if (clone.text) {
      clone.text = substituteString(clone.text, record);
    }
    if (clone.barcodeData) {
      clone.barcodeData = substituteString(clone.barcodeData, record);
    }
    if (clone.qrData) {
      clone.qrData = substituteString(clone.qrData, record);
    }

    return clone;
  });
}

/**
 * Substitute fields in a string
 * @param {string} str - String with {{field}} placeholders
 * @param {Object} record - Object with field values
 * @returns {string} - String with substituted values
 */
function substituteString(str, record) {
  return str.replace(FIELD_PATTERN, (match, field) => {
    const trimmedField = field.trim();
    // Return the value if it exists, otherwise keep the placeholder
    return record.hasOwnProperty(trimmedField) ? record[trimmedField] : match;
  });
}

/**
 * Validate that a record has all required fields
 * @param {Array} fields - Array of required field names
 * @param {Object} record - Record to validate
 * @returns {Object} - { valid: boolean, missing: Array }
 */
export function validateRecord(fields, record) {
  const missing = fields.filter(f => !record.hasOwnProperty(f) || record[f] === '');
  return {
    valid: missing.length === 0,
    missing,
  };
}

/**
 * Parse CSV string to array of records
 * Handles:
 * - Header row (first row becomes field names)
 * - Quoted values with commas
 * - Escaped quotes ("" inside quoted values)
 * - Empty rows (skipped)
 *
 * @param {string} csvString - CSV content
 * @returns {Object} - { headers: Array, records: Array, errors: Array }
 */
export function parseCSV(csvString) {
  const lines = csvString.split(/\r?\n/);
  const errors = [];
  const records = [];

  if (lines.length === 0) {
    return { headers: [], records: [], errors: ['Empty CSV file'] };
  }

  // Parse header row
  const headers = parseCSVLine(lines[0]);
  if (headers.length === 0) {
    return { headers: [], records: [], errors: ['No headers found in CSV'] };
  }

  // Parse data rows
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue; // Skip empty lines

    const values = parseCSVLine(line);

    if (values.length !== headers.length) {
      errors.push(`Row ${i + 1}: Expected ${headers.length} columns, got ${values.length}`);
      continue;
    }

    // Create record object
    const record = {};
    for (let j = 0; j < headers.length; j++) {
      record[headers[j]] = values[j];
    }
    records.push(record);
  }

  return { headers, records, errors };
}

/**
 * Parse a single CSV line into values
 * Handles quoted values and escaped quotes
 * @param {string} line - CSV line
 * @returns {Array} - Array of values
 */
function parseCSVLine(line) {
  const values = [];
  let current = '';
  let inQuotes = false;
  let i = 0;

  while (i < line.length) {
    const char = line[i];

    if (inQuotes) {
      if (char === '"') {
        // Check for escaped quote
        if (i + 1 < line.length && line[i + 1] === '"') {
          current += '"';
          i += 2;
          continue;
        }
        // End of quoted value
        inQuotes = false;
        i++;
        continue;
      }
      current += char;
      i++;
    } else {
      if (char === '"') {
        // Start of quoted value
        inQuotes = true;
        i++;
        continue;
      }
      if (char === ',') {
        // End of value
        values.push(current.trim());
        current = '';
        i++;
        continue;
      }
      current += char;
      i++;
    }
  }

  // Add last value
  values.push(current.trim());

  return values;
}

/**
 * Convert records to CSV string
 * @param {Array} headers - Array of field names
 * @param {Array} records - Array of record objects
 * @returns {string} - CSV content
 */
export function toCSV(headers, records) {
  const lines = [];

  // Header row
  lines.push(headers.map(h => escapeCSVValue(h)).join(','));

  // Data rows
  for (const record of records) {
    const values = headers.map(h => escapeCSVValue(record[h] || ''));
    lines.push(values.join(','));
  }

  return lines.join('\n');
}

/**
 * Escape a value for CSV output
 * @param {string} value - Value to escape
 * @returns {string} - Escaped value
 */
function escapeCSVValue(value) {
  const str = String(value);
  // Quote if contains comma, quote, or newline
  if (str.includes(',') || str.includes('"') || str.includes('\n')) {
    return '"' + str.replace(/"/g, '""') + '"';
  }
  return str;
}

/**
 * Create an empty record with all fields
 * @param {Array} fields - Array of field names
 * @returns {Object} - Record with empty values
 */
export function createEmptyRecord(fields) {
  const record = {};
  for (const field of fields) {
    record[field] = '';
  }
  return record;
}

/**
 * Generate sample data for preview/testing
 * @param {Array} fields - Array of field names
 * @param {number} count - Number of records to generate
 * @returns {Array} - Array of sample records
 */
export function generateSampleData(fields, count = 3) {
  const records = [];
  for (let i = 1; i <= count; i++) {
    const record = {};
    for (const field of fields) {
      record[field] = `${field} ${i}`;
    }
    records.push(record);
  }
  return records;
}
