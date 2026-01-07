/**
 * localStorage persistence for Phomymo label designs
 */

import { STORAGE_KEYS } from './constants.js';

const STORAGE_KEY = STORAGE_KEYS.DESIGNS;
const MULTI_LABEL_PRESETS_KEY = STORAGE_KEYS.MULTI_LABEL_PRESETS;

/**
 * Get all saved designs from localStorage
 */
function getAllDesigns() {
  try {
    const data = localStorage.getItem(STORAGE_KEY);
    return data ? JSON.parse(data) : {};
  } catch (e) {
    console.error('Failed to load designs:', e);
    return {};
  }
}

/**
 * Save all designs to localStorage
 */
function setAllDesigns(designs) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(designs));
    return true;
  } catch (e) {
    console.error('Failed to save designs:', e);
    return false;
  }
}

/**
 * Save a design to localStorage
 * @param {string} name - Design name
 * @param {object} design - { elements: [], labelSize: { width, height } }
 */
export function saveDesign(name, design) {
  if (!name || !name.trim()) {
    throw new Error('Design name is required');
  }

  const designs = getAllDesigns();
  designs[name.trim()] = {
    ...design,
    savedAt: Date.now(),
  };

  if (!setAllDesigns(designs)) {
    throw new Error('Failed to save design');
  }

  return true;
}

/**
 * Load a design from localStorage
 * @param {string} name - Design name
 * @returns {object|null} - { elements: [], labelSize: { width, height }, savedAt: number }
 */
export function loadDesign(name) {
  const designs = getAllDesigns();
  return designs[name] || null;
}

/**
 * Get list of saved design names with metadata
 * @returns {Array} - [{ name, savedAt, labelSize, elementCount, isTemplate, templateDataCount, isMultiLabel }]
 */
export function listDesigns() {
  const designs = getAllDesigns();
  return Object.entries(designs)
    .map(([name, design]) => ({
      name,
      savedAt: design.savedAt,
      labelSize: design.labelSize,
      elementCount: design.elements?.length || 0,
      isTemplate: design.isTemplate || false,
      templateFieldCount: design.templateFields?.length || 0,
      templateDataCount: design.templateData?.length || 0,
      hasImages: design.elements?.some(el => el.type === 'image') || false,
      isMultiLabel: design.multiLabel?.enabled || false,
      multiLabel: design.multiLabel || null,
    }))
    .sort((a, b) => b.savedAt - a.savedAt); // Most recent first
}

/**
 * Delete a design from localStorage
 * @param {string} name - Design name
 */
export function deleteDesign(name) {
  const designs = getAllDesigns();
  if (!(name in designs)) {
    return false;
  }

  delete designs[name];
  return setAllDesigns(designs);
}

/**
 * Rename a design
 * @param {string} oldName - Current name
 * @param {string} newName - New name
 */
export function renameDesign(oldName, newName) {
  if (!newName || !newName.trim()) {
    throw new Error('New name is required');
  }

  const designs = getAllDesigns();
  if (!(oldName in designs)) {
    throw new Error('Design not found');
  }

  const trimmedNew = newName.trim();
  if (trimmedNew !== oldName && trimmedNew in designs) {
    throw new Error('A design with that name already exists');
  }

  designs[trimmedNew] = designs[oldName];
  if (trimmedNew !== oldName) {
    delete designs[oldName];
  }

  return setAllDesigns(designs);
}

/**
 * Check if a design name exists
 * @param {string} name - Design name
 */
export function designExists(name) {
  const designs = getAllDesigns();
  return name in designs;
}

/**
 * Export design as JSON string (for file download)
 * @param {string} name - Design name
 */
export function exportDesign(name) {
  const design = loadDesign(name);
  if (!design) {
    throw new Error('Design not found');
  }

  return JSON.stringify({
    name,
    version: 3, // Version 3 includes multi-label support
    ...design,
  }, null, 2);
}

/**
 * Import design from JSON string
 * @param {string} jsonString - JSON data
 * @param {string} overrideName - Optional name override
 * @returns {object} - { name, hasTemplateData, hasMultiLabel }
 */
export function importDesign(jsonString, overrideName = null) {
  try {
    const data = JSON.parse(jsonString);

    if (!data.elements || !Array.isArray(data.elements)) {
      throw new Error('Invalid design format: missing elements');
    }

    if (!data.labelSize || typeof data.labelSize.width !== 'number') {
      throw new Error('Invalid design format: missing label size');
    }

    const name = overrideName || data.name || `Imported ${new Date().toLocaleString()}`;

    const designData = {
      elements: data.elements,
      labelSize: data.labelSize,
    };

    // Import template data if present
    if (data.isTemplate) {
      designData.isTemplate = true;
    }
    if (data.templateFields && Array.isArray(data.templateFields)) {
      designData.templateFields = data.templateFields;
    }
    if (data.templateData && Array.isArray(data.templateData)) {
      designData.templateData = data.templateData;
    }

    // Import multi-label configuration if present
    if (data.multiLabel && typeof data.multiLabel === 'object') {
      designData.multiLabel = {
        enabled: data.multiLabel.enabled || false,
        labelWidth: data.multiLabel.labelWidth || 10,
        labelHeight: data.multiLabel.labelHeight || 20,
        labelsAcross: data.multiLabel.labelsAcross || 4,
        gapMm: data.multiLabel.gapMm || 2,
        cloneMode: data.multiLabel.cloneMode !== false, // Default to true
      };
    }

    saveDesign(name, designData);

    return {
      name,
      hasTemplateData: (data.templateData?.length || 0) > 0,
      templateDataCount: data.templateData?.length || 0,
      hasMultiLabel: data.multiLabel?.enabled || false,
    };
  } catch (e) {
    if (e instanceof SyntaxError) {
      throw new Error('Invalid JSON format');
    }
    throw e;
  }
}

/**
 * Get storage usage info
 */
export function getStorageInfo() {
  const designs = getAllDesigns();
  const designCount = Object.keys(designs).length;
  const dataSize = JSON.stringify(designs).length;

  return {
    designCount,
    dataSize,
    dataSizeKB: (dataSize / 1024).toFixed(2),
  };
}

// =============================================================================
// MULTI-LABEL PRESETS
// =============================================================================

/**
 * Get all saved multi-label presets from localStorage
 * @returns {object} - { presetName: { labelWidth, labelHeight, labelsAcross, gapMm }, ... }
 */
export function getMultiLabelPresets() {
  try {
    const data = localStorage.getItem(MULTI_LABEL_PRESETS_KEY);
    return data ? JSON.parse(data) : {};
  } catch (e) {
    console.error('Failed to load multi-label presets:', e);
    return {};
  }
}

/**
 * Save a multi-label preset
 * @param {string} name - Preset name
 * @param {object} config - { labelWidth, labelHeight, labelsAcross, gapMm }
 */
export function saveMultiLabelPreset(name, config) {
  if (!name || !name.trim()) {
    throw new Error('Preset name is required');
  }

  const presets = getMultiLabelPresets();
  presets[name.trim()] = {
    labelWidth: config.labelWidth,
    labelHeight: config.labelHeight,
    labelsAcross: config.labelsAcross,
    gapMm: config.gapMm,
  };

  try {
    localStorage.setItem(MULTI_LABEL_PRESETS_KEY, JSON.stringify(presets));
    return true;
  } catch (e) {
    console.error('Failed to save multi-label preset:', e);
    throw new Error('Failed to save preset');
  }
}

/**
 * Delete a multi-label preset
 * @param {string} name - Preset name
 */
export function deleteMultiLabelPreset(name) {
  const presets = getMultiLabelPresets();
  if (!(name in presets)) {
    return false;
  }

  delete presets[name];
  try {
    localStorage.setItem(MULTI_LABEL_PRESETS_KEY, JSON.stringify(presets));
    return true;
  } catch (e) {
    console.error('Failed to delete multi-label preset:', e);
    return false;
  }
}

/**
 * List all multi-label presets
 * @returns {Array} - [{ name, labelWidth, labelHeight, labelsAcross, gapMm }]
 */
export function listMultiLabelPresets() {
  const presets = getMultiLabelPresets();
  return Object.entries(presets).map(([name, config]) => ({
    name,
    ...config,
  }));
}
