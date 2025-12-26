/**
 * localStorage persistence for Phomymo label designs
 */

const STORAGE_KEY = 'phomymo_designs';

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
 * @returns {Array} - [{ name, savedAt, labelSize }]
 */
export function listDesigns() {
  const designs = getAllDesigns();
  return Object.entries(designs)
    .map(([name, design]) => ({
      name,
      savedAt: design.savedAt,
      labelSize: design.labelSize,
      elementCount: design.elements?.length || 0,
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
    version: 1,
    ...design,
  }, null, 2);
}

/**
 * Import design from JSON string
 * @param {string} jsonString - JSON data
 * @param {string} overrideName - Optional name override
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

    saveDesign(name, {
      elements: data.elements,
      labelSize: data.labelSize,
    });

    return name;
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
