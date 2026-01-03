/**
 * Phomemo M260 printer profile
 */

const PrinterProfile = require('./base');
const {
  PRINTER_DPI,
  PRINTER_FULL_WIDTH_BYTES,
  CHUNK_SIZE_USB,
  CHUNK_SIZE_BLE,
  BLE_PROFILES,
} = require('../core/constants');

class M260Printer extends PrinterProfile {
  /**
   * Create M260 printer profile
   * @param {PrinterTransport} transport - The transport to use
   */
  constructor(transport) {
    super(transport);
  }

  /**
   * Get M260-specific constants
   */
  get constants() {
    return {
      DPI: PRINTER_DPI,
      FULL_WIDTH_BYTES: PRINTER_FULL_WIDTH_BYTES,
      CHUNK_SIZE_USB,
      CHUNK_SIZE_BLE,
      // BLE UUIDs - start with D30 values, may need adjustment
      BLE_SERVICE_UUID: BLE_PROFILES.M260.SERVICE_UUID,
      BLE_CHAR_UUID: BLE_PROFILES.M260.CHARACTERISTIC_UUID,
    };
  }

  /**
   * Get label presets for M260
   */
  static get labelPresets() {
    return {
      'M260': { name: 'Phomemo M260 (53mm)', widthMm: 53, lengthMm: 30 },
      'M200': { name: 'Phomemo M200 (53mm)', widthMm: 53, lengthMm: 30 },
      '40x30': { name: 'Label 40mm x 30mm', widthMm: 40, lengthMm: 30 },
      '60x40': { name: 'Label 60mm x 40mm', widthMm: 60, lengthMm: 40 },
    };
  }

  /**
   * Get label configuration by name or custom dimensions
   * @param {string} labelType - Label type name or 'custom'
   * @param {number} customWidth - Custom width in mm (if labelType is 'custom')
   * @param {number} customHeight - Custom height in mm (if labelType is 'custom')
   * @returns {Object} Label configuration { widthMm, lengthMm }
   */
  static getLabelConfig(labelType, customWidth = null, customHeight = null) {
    if (labelType === 'custom') {
      if (!customWidth || !customHeight) {
        throw new Error('Custom label requires width and height');
      }
      return { widthMm: customWidth, lengthMm: customHeight };
    }

    const preset = M260Printer.labelPresets[labelType];
    if (!preset) {
      const available = Object.keys(M260Printer.labelPresets).join(', ');
      throw new Error(`Unknown label type: ${labelType}. Available: ${available}, custom`);
    }

    return { widthMm: preset.widthMm, lengthMm: preset.lengthMm };
  }
}

module.exports = M260Printer;
