/**
 * Phomymo Label Designer Application
 * Multi-element label editor with drag, resize, and rotate
 */

import { CanvasRenderer } from './canvas.js?v=47';
import { BLETransport } from './ble.js?v=10';
import { USBTransport } from './usb.js?v=3';
import { print, printDensityTest } from './printer.js?v=6';
import {
  createTextElement,
  createImageElement,
  createBarcodeElement,
  createQRElement,
  createShapeElement,
  updateElement,
  deleteElement,
  duplicateElement,
  bringToFront,
  sendToBack,
  getElementAtPoint,
  constrainSize,
  groupElements,
  ungroupElements,
  getGroupMembers,
  getElementGroupId,
  getMultiElementBounds,
  moveElements,
  scaleElements,
  rotateElements,
} from './elements.js?v=8';
import {
  HandleType,
  getHandleAtPoint,
  getCursorForHandle,
  calculateResize,
  calculateRotation,
  snapRotation,
  getGroupHandleAtPoint,
  drawGroupHandles,
  calculateGroupResize,
  calculateGroupRotation,
} from './handles.js?v=5';
import {
  saveDesign,
  loadDesign,
  listDesigns,
  deleteDesign,
} from './storage.js?v=4';
import {
  extractFields,
  hasTemplateFields,
  substituteFields,
  parseCSV,
  createEmptyRecord,
} from './templates.js?v=1';

// DOM helpers
const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => document.querySelectorAll(sel);

// Label size presets (width x height in mm)
const LABEL_SIZES = {
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

// App state
const state = {
  connectionType: 'ble',
  labelSize: { width: 40, height: 30 },
  elements: [],
  selectedIds: [],  // Array of selected element IDs (supports multi-select)
  transport: null,
  renderer: null,
  canPrint: true,   // Set to false if browser doesn't support Bluetooth/USB
  // Drag state
  isDragging: false,
  dragType: null, // 'move', 'resize', 'rotate'
  dragHandle: null,
  dragStartX: 0,
  dragStartY: 0,
  dragStartElements: null,  // Array of elements being dragged
  dragStartBounds: null,    // Group bounds at drag start
  dragStartAngle: 0,        // For group rotation
  // Zoom state
  zoom: 1,
  // Print settings
  printSettings: {
    density: 6,     // 1-8 (darkness)
    copies: 1,      // Number of copies
    feed: 32,       // Feed after print in dots (8 dots = 1mm)
  },
  // Template state
  templateFields: [],     // Detected field names from elements
  templateData: [],       // Array of data records for batch printing
  selectedRecords: [],    // Indices of selected records for printing
  currentPreviewIndex: 0, // Current label index in full preview
  // Undo/Redo history
  history: [],            // Array of previous element states
  historyIndex: -1,       // Current position in history (-1 = no history)
};

// Maximum history size
const MAX_HISTORY = 50;

/**
 * Update status message
 */
function setStatus(message) {
  $('#status-message').textContent = message;
}

/**
 * Save current state to history (call before modifications)
 */
function saveHistory() {
  // Deep clone current elements
  const snapshot = JSON.parse(JSON.stringify(state.elements));

  // If we're not at the end of history, truncate future states
  if (state.historyIndex < state.history.length - 1) {
    state.history = state.history.slice(0, state.historyIndex + 1);
  }

  // Add new state
  state.history.push(snapshot);

  // Limit history size
  if (state.history.length > MAX_HISTORY) {
    state.history.shift();
  } else {
    state.historyIndex++;
  }

  updateUndoRedoButtons();
}

/**
 * Undo last action
 */
function undo() {
  if (state.historyIndex < 0) return;

  // Save current state if we're at the end (so we can redo back to it)
  if (state.historyIndex === state.history.length - 1) {
    const current = JSON.parse(JSON.stringify(state.elements));
    state.history.push(current);
  }

  // Restore previous state
  state.elements = JSON.parse(JSON.stringify(state.history[state.historyIndex]));
  state.historyIndex--;

  // Clear selection if selected elements no longer exist
  state.selectedIds = state.selectedIds.filter(id =>
    state.elements.some(el => el.id === id)
  );

  state.renderer.clearCache();
  render();
  updatePropertiesPanel();
  updateToolbarState();
  detectTemplateFields();
  setStatus('Undo');
}

/**
 * Redo last undone action
 */
function redo() {
  if (state.historyIndex >= state.history.length - 2) return;

  state.historyIndex++;
  state.elements = JSON.parse(JSON.stringify(state.history[state.historyIndex + 1]));

  // Clear selection if selected elements no longer exist
  state.selectedIds = state.selectedIds.filter(id =>
    state.elements.some(el => el.id === id)
  );

  state.renderer.clearCache();
  render();
  updatePropertiesPanel();
  updateToolbarState();
  detectTemplateFields();
  setStatus('Redo');
}

/**
 * Update undo/redo button states
 */
function updateUndoRedoButtons() {
  const undoBtn = $('#undo-btn');
  const redoBtn = $('#redo-btn');
  if (undoBtn) undoBtn.disabled = state.historyIndex < 0;
  if (redoBtn) redoBtn.disabled = state.historyIndex >= state.history.length - 2;
}

/**
 * Reset history (call when loading a new design)
 */
function resetHistory() {
  state.history = [];
  state.historyIndex = -1;
  updateUndoRedoButtons();
}

/**
 * Show a toast notification
 * @param {string} message - Message to display
 * @param {string} type - 'success', 'error', 'info', or 'warning'
 * @param {number} duration - Duration in ms (default 2000)
 */
function showToast(message, type = 'info', duration = 2000) {
  const container = $('#toast-container');

  // Create toast element
  const toast = document.createElement('div');
  toast.className = 'px-4 py-2 rounded-lg shadow-lg text-sm font-medium transform transition-all duration-300 translate-y-2 opacity-0';

  // Set colors based on type
  switch (type) {
    case 'success':
      toast.classList.add('bg-green-600', 'text-white');
      break;
    case 'error':
      toast.classList.add('bg-red-600', 'text-white');
      break;
    case 'warning':
      toast.classList.add('bg-yellow-500', 'text-white');
      break;
    default:
      toast.classList.add('bg-gray-800', 'text-white');
  }

  toast.textContent = message;
  container.appendChild(toast);

  // Animate in
  requestAnimationFrame(() => {
    toast.classList.remove('translate-y-2', 'opacity-0');
  });

  // Remove after duration
  setTimeout(() => {
    toast.classList.add('translate-y-2', 'opacity-0');
    setTimeout(() => toast.remove(), 300);
  }, duration);
}

/**
 * Print progress state
 */
let printProgressCancelled = false;

/**
 * Show print progress modal
 */
function showPrintProgress(title, total) {
  printProgressCancelled = false;
  const modal = $('#print-progress-modal');
  $('#progress-title').textContent = title;
  $('#progress-subtitle').textContent = 'Preparing...';
  $('#progress-bar').style.width = '0%';
  $('#progress-detail').textContent = `0 of ${total}`;
  modal.classList.remove('hidden');
  modal.classList.add('flex');
}

/**
 * Update print progress
 */
function updatePrintProgress(current, total, sublabel = '') {
  const percent = Math.round((current / total) * 100);
  $('#progress-bar').style.width = `${percent}%`;
  $('#progress-detail').textContent = `${current} of ${total}`;
  $('#progress-subtitle').textContent = sublabel || `Printing label ${current}...`;
}

/**
 * Hide print progress modal
 */
function hidePrintProgress() {
  const modal = $('#print-progress-modal');
  modal.classList.add('hidden');
  modal.classList.remove('flex');
}

/**
 * Check if print was cancelled
 */
function isPrintCancelled() {
  return printProgressCancelled;
}

/**
 * Update connection status indicator
 */
function updateConnectionStatus(connected) {
  const dot = $('#status-dot');
  dot.classList.toggle('bg-green-500', connected);
  dot.classList.toggle('bg-gray-400', !connected);
}

/**
 * Update print size display
 */
function updatePrintSize() {
  const { width, height } = state.labelSize;
  $('#print-size').textContent = `${width} x ${height} mm`;
}

/**
 * Update zoom level display and apply transform
 */
function updateZoom() {
  $('#zoom-level').textContent = `${Math.round(state.zoom * 100)}%`;
  $('#canvas-container').style.transform = `scale(${state.zoom})`;
}

/**
 * Zoom in
 */
function zoomIn() {
  state.zoom = Math.min(state.zoom + 0.25, 3);
  updateZoom();
}

/**
 * Zoom out
 */
function zoomOut() {
  state.zoom = Math.max(state.zoom - 0.25, 0.25);
  updateZoom();
}

/**
 * Reset zoom to 100%
 */
function zoomReset() {
  state.zoom = 1;
  updateZoom();
}

/**
 * Render the canvas
 */
function render() {
  state.renderer.renderAll(state.elements, state.selectedIds);
}

/**
 * Detect template fields from current elements
 */
function detectTemplateFields() {
  const previousFields = [...state.templateFields];
  state.templateFields = extractFields(state.elements);

  // If fields changed significantly, clear template data
  const fieldsChanged = previousFields.length !== state.templateFields.length ||
    !previousFields.every(f => state.templateFields.includes(f));

  if (fieldsChanged && state.templateData.length > 0) {
    // Fields changed - keep data but user may need to re-map
    console.log('Template fields changed:', state.templateFields);
  }

  updateTemplateIndicator();
}

/**
 * Update template mode indicator in UI
 */
function updateTemplateIndicator() {
  const fieldCount = $('#template-field-count');
  const fieldTags = $('#template-field-tags');
  const dataCount = $('#template-data-count');
  const printCount = $('#template-print-count');
  const toolbarBtn = $('#template-toolbar-btn');
  const toolbarDivider = $('#template-toolbar-divider');
  const toolbarLabel = $('#template-toolbar-label');
  const templatePanel = $('#template-panel');

  const hasFields = state.templateFields.length > 0;

  if (hasFields) {
    fieldCount.textContent = state.templateFields.length;

    // Show field tags
    fieldTags.innerHTML = state.templateFields.map(f =>
      `<span class="px-2 py-1 bg-purple-100 text-purple-700 rounded-full font-medium">{{${f}}}</span>`
    ).join('');

    // Show toolbar button
    toolbarBtn.classList.remove('hidden');
    toolbarDivider.classList.remove('hidden');

    // Update toolbar label with record count
    if (state.templateData.length > 0) {
      toolbarLabel.textContent = `Template (${state.templateData.length})`;
    } else {
      toolbarLabel.textContent = 'Template';
    }
  } else {
    fieldTags.innerHTML = '<span class="text-purple-400 italic">None</span>';

    // Hide toolbar button and template panel
    toolbarBtn.classList.add('hidden');
    toolbarDivider.classList.add('hidden');
    templatePanel.classList.add('hidden');
  }

  // Update data count
  dataCount.textContent = state.templateData.length;
  printCount.textContent = state.templateData.length;

  // Update field dropdowns for insert field buttons
  updateFieldDropdowns();
}

/**
 * Toggle template panel visibility
 */
function toggleTemplatePanel() {
  const templatePanel = $('#template-panel');
  templatePanel.classList.toggle('hidden');
}

/**
 * Escape HTML for safe insertion
 */
function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

/**
 * Update field dropdowns for insert field buttons
 */
function updateFieldDropdowns() {
  const types = ['text', 'barcode', 'qr'];

  for (const type of types) {
    const fieldList = $(`#field-list-${type}`);
    if (!fieldList) continue;

    if (state.templateFields.length > 0) {
      fieldList.innerHTML = state.templateFields.map(f =>
        `<button class="field-option w-full text-left px-3 py-1.5 text-sm hover:bg-purple-50 text-gray-700" data-field="${f}" data-type="${type}">{{${f}}}</button>`
      ).join('');
    } else {
      fieldList.innerHTML = '<div class="px-3 py-2 text-xs text-gray-400 italic">No fields yet</div>';
    }
  }
}

/**
 * Insert a field placeholder into an input
 */
function insertFieldIntoInput(type, fieldName) {
  let inputEl;
  let propKey;

  switch (type) {
    case 'text':
      inputEl = $('#prop-text-content');
      propKey = 'text';
      break;
    case 'barcode':
      inputEl = $('#prop-barcode-data');
      propKey = 'barcodeData';
      break;
    case 'qr':
      inputEl = $('#prop-qr-data');
      propKey = 'qrData';
      break;
  }

  if (!inputEl) return;

  const fieldPlaceholder = `{{${fieldName}}}`;
  const start = inputEl.selectionStart || 0;
  const end = inputEl.selectionEnd || 0;
  const value = inputEl.value;

  // Insert at cursor position
  const newValue = value.substring(0, start) + fieldPlaceholder + value.substring(end);
  inputEl.value = newValue;

  // Update the element
  const element = getSelected();
  if (element) {
    modifyElement(element.id, { [propKey]: newValue });
  }

  // Move cursor after inserted field
  const newCursorPos = start + fieldPlaceholder.length;
  inputEl.setSelectionRange(newCursorPos, newCursorPos);
  inputEl.focus();

  // Close dropdown
  $(`#field-dropdown-${type}`).classList.add('hidden');
}

/**
 * Create a new field and insert it
 */
function createAndInsertField(type, fieldName) {
  if (!fieldName.trim()) return;

  // Clean field name (remove invalid characters)
  const cleanName = fieldName.trim().replace(/[{}]/g, '');
  if (!cleanName) return;

  insertFieldIntoInput(type, cleanName);
}

/**
 * Toggle field dropdown visibility
 */
function toggleFieldDropdown(type) {
  const dropdown = $(`#field-dropdown-${type}`);
  const isHidden = dropdown.classList.contains('hidden');

  // Close all dropdowns first
  $$('[id^="field-dropdown-"]').forEach(d => d.classList.add('hidden'));

  if (isHidden) {
    dropdown.classList.remove('hidden');
    // Focus the new field input
    $(`#new-field-${type}`).value = '';
    $(`#new-field-${type}`).focus();
  }
}

/**
 * Add a template data record
 */
function addTemplateRecord(record = null) {
  if (!record) {
    record = createEmptyRecord(state.templateFields);
  }
  state.templateData.push(record);
  state.selectedRecords.push(state.templateData.length - 1);
  updateTemplateDataTable();
}

/**
 * Update a template data record
 */
function updateTemplateRecord(index, field, value) {
  if (index >= 0 && index < state.templateData.length) {
    state.templateData[index][field] = value;
  }
}

/**
 * Delete a template data record
 */
function deleteTemplateRecord(index) {
  if (index >= 0 && index < state.templateData.length) {
    state.templateData.splice(index, 1);
    // Update selected records indices
    state.selectedRecords = state.selectedRecords
      .filter(i => i !== index)
      .map(i => i > index ? i - 1 : i);
    updateTemplateDataTable();
  }
}

/**
 * Clear all template data
 */
function clearTemplateData() {
  state.templateData = [];
  state.selectedRecords = [];
  updateTemplateDataTable();
}

/**
 * Toggle record selection for printing
 */
function toggleRecordSelection(index) {
  const idx = state.selectedRecords.indexOf(index);
  if (idx >= 0) {
    state.selectedRecords.splice(idx, 1);
  } else {
    state.selectedRecords.push(index);
    state.selectedRecords.sort((a, b) => a - b);
  }
  updateTemplateDataTable();
}

/**
 * Select all records for printing
 */
function selectAllRecords() {
  state.selectedRecords = state.templateData.map((_, i) => i);
  updateTemplateDataTable();
}

/**
 * Deselect all records
 */
function deselectAllRecords() {
  state.selectedRecords = [];
  updateTemplateDataTable();
}

/**
 * Update the template data table in the dialog
 */
function updateTemplateDataTable() {
  const tableBody = $('#template-data-body');
  const emptyState = $('#template-data-empty');
  const tableHeader = $('#template-data-header');
  const recordCount = $('#template-record-count');

  if (state.templateData.length === 0) {
    emptyState.classList.remove('hidden');
    tableHeader.classList.add('hidden');
    tableBody.innerHTML = '';
    recordCount.textContent = '0 records';
    updateTemplateIndicator();
    return;
  }

  emptyState.classList.add('hidden');
  tableHeader.classList.remove('hidden');

  // Build header
  tableHeader.innerHTML = `
    <th class="px-2 py-1 text-left text-xs font-medium text-gray-500 w-8">
      <input type="checkbox" id="template-select-all" class="rounded"
        ${state.selectedRecords.length === state.templateData.length ? 'checked' : ''}>
    </th>
    <th class="px-2 py-1 text-left text-xs font-medium text-gray-500 w-8">#</th>
    ${state.templateFields.map(f => `
      <th class="px-2 py-1 text-left text-xs font-medium text-gray-500">${f}</th>
    `).join('')}
    <th class="px-2 py-1 text-right text-xs font-medium text-gray-500 w-16">Actions</th>
  `;

  // Build rows
  tableBody.innerHTML = state.templateData.map((record, idx) => `
    <tr class="border-t border-gray-100 hover:bg-gray-50" data-index="${idx}">
      <td class="px-2 py-1">
        <input type="checkbox" class="template-row-select rounded"
          data-index="${idx}" ${state.selectedRecords.includes(idx) ? 'checked' : ''}>
      </td>
      <td class="px-2 py-1 text-xs text-gray-400">${idx + 1}</td>
      ${state.templateFields.map(f => `
        <td class="px-2 py-1">
          <input type="text" class="template-field-input w-full text-sm border-0 bg-transparent p-0 focus:ring-1 focus:ring-blue-500 rounded"
            data-index="${idx}" data-field="${f}" value="${escapeHtml(record[f] || '')}">
        </td>
      `).join('')}
      <td class="px-2 py-1 text-right">
        <button class="template-delete-row text-red-500 hover:text-red-700 text-xs" data-index="${idx}">Delete</button>
      </td>
    </tr>
  `).join('');

  recordCount.textContent = `${state.templateData.length} record${state.templateData.length !== 1 ? 's' : ''}`;

  // Bind event handlers
  bindTemplateTableEvents();

  // Update properties panel indicator
  updateTemplateIndicator();
}

/**
 * Bind event handlers for template data table
 */
function bindTemplateTableEvents() {
  // Select all checkbox
  const selectAll = $('#template-select-all');
  if (selectAll) {
    selectAll.addEventListener('change', (e) => {
      if (e.target.checked) {
        selectAllRecords();
      } else {
        deselectAllRecords();
      }
    });
  }

  // Row checkboxes
  $$('.template-row-select').forEach(cb => {
    cb.addEventListener('change', (e) => {
      toggleRecordSelection(parseInt(e.target.dataset.index));
    });
  });

  // Field inputs
  $$('.template-field-input').forEach(input => {
    input.addEventListener('change', (e) => {
      updateTemplateRecord(
        parseInt(e.target.dataset.index),
        e.target.dataset.field,
        e.target.value
      );
    });
  });

  // Delete buttons
  $$('.template-delete-row').forEach(btn => {
    btn.addEventListener('click', (e) => {
      deleteTemplateRecord(parseInt(e.target.dataset.index));
    });
  });
}

/**
 * Import CSV data
 */
function importCSVData(csvString) {
  const result = parseCSV(csvString);

  if (result.errors.length > 0) {
    console.warn('CSV parse warnings:', result.errors);
  }

  if (result.records.length === 0) {
    setStatus('No data found in CSV');
    return;
  }

  // Map CSV columns to template fields
  const mappedRecords = result.records.map(csvRecord => {
    const record = createEmptyRecord(state.templateFields);
    for (const field of state.templateFields) {
      // Try exact match first, then case-insensitive
      if (csvRecord.hasOwnProperty(field)) {
        record[field] = csvRecord[field];
      } else {
        const lowerField = field.toLowerCase();
        const matchingKey = Object.keys(csvRecord).find(k => k.toLowerCase() === lowerField);
        if (matchingKey) {
          record[field] = csvRecord[matchingKey];
        }
      }
    }
    return record;
  });

  state.templateData = mappedRecords;
  state.selectedRecords = mappedRecords.map((_, i) => i);
  updateTemplateDataTable();
  setStatus(`Imported ${mappedRecords.length} records`);
}

/**
 * Show template data dialog
 */
function showTemplateDataDialog() {
  $('#template-fields-list').textContent = state.templateFields.join(', ');
  updateTemplateDataTable();
  $('#template-data-dialog').classList.remove('hidden');
}

/**
 * Hide template data dialog
 */
function hideTemplateDataDialog() {
  $('#template-data-dialog').classList.add('hidden');
}

/**
 * Show preview dialog with label thumbnails
 */
function showPreviewDialog() {
  if (state.templateData.length === 0) {
    setStatus('No data to preview - add records first');
    return;
  }

  const grid = $('#preview-grid');
  const recordsToPreview = state.selectedRecords.length > 0
    ? state.selectedRecords
    : state.templateData.map((_, i) => i);

  // Generate thumbnails
  grid.innerHTML = recordsToPreview.map(idx => {
    const record = state.templateData[idx];
    const firstField = state.templateFields[0];
    const label = record[firstField] || `Record ${idx + 1}`;

    return `
      <div class="preview-thumbnail cursor-pointer hover:ring-2 hover:ring-blue-500 rounded-lg p-2 bg-gray-50"
           data-index="${idx}">
        <canvas class="preview-canvas bg-white shadow rounded w-full" data-index="${idx}"></canvas>
        <div class="text-xs text-gray-600 mt-1 truncate text-center">${escapeHtml(label)}</div>
        <div class="text-xs text-gray-400 text-center">#${idx + 1}</div>
      </div>
    `;
  }).join('');

  // Render previews
  requestAnimationFrame(() => {
    $$('.preview-canvas').forEach(canvas => {
      const idx = parseInt(canvas.dataset.index);
      renderPreviewThumbnail(canvas, idx);
    });
  });

  // Bind click handlers for full preview
  $$('.preview-thumbnail').forEach(thumb => {
    thumb.addEventListener('click', () => {
      showFullPreview(parseInt(thumb.dataset.index));
    });
  });

  $('#preview-count').textContent = `${recordsToPreview.length} label${recordsToPreview.length !== 1 ? 's' : ''}`;
  $('#preview-dialog').classList.remove('hidden');
}

/**
 * Hide preview dialog
 */
function hidePreviewDialog() {
  $('#preview-dialog').classList.add('hidden');
}

/**
 * Render a preview thumbnail
 */
function renderPreviewThumbnail(canvas, recordIndex) {
  const record = state.templateData[recordIndex];
  if (!record) return;

  // Substitute fields
  const mergedElements = substituteFields(state.elements, record);

  // Create a temporary renderer at smaller scale
  const scale = 0.5;
  const dims = state.renderer.getDimensions();
  canvas.width = dims.width * scale;
  canvas.height = dims.height * scale;

  const ctx = canvas.getContext('2d');
  ctx.scale(scale, scale);
  ctx.fillStyle = 'white';
  ctx.fillRect(0, 0, dims.width, dims.height);

  // Render elements (simplified - reuse main renderer logic)
  state.renderer.renderAllToContext(ctx, mergedElements, []);
}

/**
 * Show full-size preview of a single label
 */
function showFullPreview(recordIndex) {
  state.currentPreviewIndex = recordIndex;

  const record = state.templateData[recordIndex];
  const mergedElements = substituteFields(state.elements, record);

  // Render to full preview canvas
  const canvas = $('#full-preview-canvas');
  const dims = state.renderer.getDimensions();
  canvas.width = dims.width;
  canvas.height = dims.height;

  const ctx = canvas.getContext('2d');
  ctx.fillStyle = 'white';
  ctx.fillRect(0, 0, dims.width, dims.height);
  state.renderer.renderAllToContext(ctx, mergedElements, []);

  // Update label info
  const firstField = state.templateFields[0];
  const label = record[firstField] || `Record ${recordIndex + 1}`;
  $('#full-preview-title').textContent = `Label ${recordIndex + 1}: ${label}`;

  // Update include checkbox
  $('#full-preview-include').checked = state.selectedRecords.includes(recordIndex);

  $('#full-preview-dialog').classList.remove('hidden');
}

/**
 * Hide full preview dialog
 */
function hideFullPreview() {
  $('#full-preview-dialog').classList.add('hidden');
}

/**
 * Navigate to previous/next preview
 */
function navigatePreview(direction) {
  const indices = state.selectedRecords.length > 0
    ? state.selectedRecords
    : state.templateData.map((_, i) => i);

  const currentPos = indices.indexOf(state.currentPreviewIndex);
  let newPos = currentPos + direction;

  if (newPos < 0) newPos = indices.length - 1;
  if (newPos >= indices.length) newPos = 0;

  showFullPreview(indices[newPos]);
}

/**
 * Print batch of labels
 */
async function handleBatchPrint() {
  const recordsToPrint = state.selectedRecords.length > 0
    ? state.selectedRecords
    : state.templateData.map((_, i) => i);

  if (recordsToPrint.length === 0) {
    showToast('No records selected to print', 'warning');
    return;
  }

  const btn = $('#template-print-btn');
  const originalText = btn.textContent;
  const { density, feed } = state.printSettings;
  const total = recordsToPrint.length;

  try {
    btn.disabled = true;

    // Ensure connected
    if (!state.transport || !state.transport.isConnected()) {
      hideTemplateDataDialog();
      setStatus('Connecting...');
      await handleConnect();

      if (!state.transport || !state.transport.isConnected()) {
        throw new Error('Please connect to printer first');
      }
      showTemplateDataDialog();
    }

    // Show progress modal
    showPrintProgress(`Printing ${total} Label${total !== 1 ? 's' : ''}`, total);

    for (let i = 0; i < total; i++) {
      // Check for cancellation
      if (isPrintCancelled()) {
        showToast(`Printing cancelled after ${i} label${i !== 1 ? 's' : ''}`, 'warning');
        break;
      }

      const recordIndex = recordsToPrint[i];
      const record = state.templateData[recordIndex];

      updatePrintProgress(i + 1, total, `Printing label ${i + 1}...`);
      btn.textContent = `Printing ${i + 1}/${total}...`;

      // Substitute fields
      const mergedElements = substituteFields(state.elements, record);

      // Render to raster
      const rasterData = state.renderer.getRasterData(mergedElements);

      // Print
      await print(state.transport, rasterData, {
        isBLE: state.connectionType === 'ble',
        density,
        feed,
        onProgress: (progress) => {
          updatePrintProgress(i + 1, total, `Sending data... ${progress}%`);
        },
      });

      // Delay between prints
      if (i < total - 1 && !isPrintCancelled()) {
        updatePrintProgress(i + 1, total, 'Waiting...');
        await new Promise(r => setTimeout(r, 500));
      }
    }

    if (!isPrintCancelled()) {
      showToast(`Printed ${total} label${total !== 1 ? 's' : ''}!`, 'success');
      setStatus(`Printed ${total} label${total !== 1 ? 's' : ''}!`);
    }
    btn.textContent = originalText;

  } catch (error) {
    console.error('Batch print error:', error);
    showToast(error.message || 'Print failed', 'error');
    setStatus(error.message || 'Print failed');
    btn.textContent = originalText;
  } finally {
    btn.disabled = false;
    hidePrintProgress();
  }
}

/**
 * Print single label from preview
 */
async function handlePrintSinglePreview() {
  const recordIndex = state.currentPreviewIndex;
  const record = state.templateData[recordIndex];

  if (!record) {
    setStatus('No record to print');
    return;
  }

  const btn = $('#full-preview-print');
  const originalText = btn.textContent;
  const { density, feed } = state.printSettings;

  try {
    btn.disabled = true;
    btn.textContent = 'Printing...';

    // Ensure connected
    if (!state.transport || !state.transport.isConnected()) {
      hideFullPreview();
      setStatus('Connecting...');
      await handleConnect();

      if (!state.transport || !state.transport.isConnected()) {
        throw new Error('Please connect to printer first');
      }
    }

    // Substitute fields
    const mergedElements = substituteFields(state.elements, record);

    // Render to raster
    const rasterData = state.renderer.getRasterData(mergedElements);

    // Print
    await print(state.transport, rasterData, {
      isBLE: state.connectionType === 'ble',
      density,
      feed,
      onProgress: (progress) => {
        btn.textContent = `Printing... ${progress}%`;
      },
    });

    setStatus('Label printed!');
    btn.textContent = originalText;

  } catch (error) {
    console.error('Print error:', error);
    setStatus(error.message || 'Print failed');
    btn.textContent = originalText;
  } finally {
    btn.disabled = false;
  }
}

/**
 * Get selected elements
 */
function getSelectedElements() {
  return state.elements.filter(e => state.selectedIds.includes(e.id));
}

/**
 * Get single selected element (for properties panel - only when one selected)
 */
function getSelected() {
  if (state.selectedIds.length === 1) {
    return state.elements.find(e => e.id === state.selectedIds[0]);
  }
  return null;
}

/**
 * Select an element (replaces current selection)
 * If element is part of a group, select entire group
 */
function selectElement(id, addToSelection = false) {
  const element = state.elements.find(e => e.id === id);
  if (!element) return;

  // If element is in a group, get all group members
  let idsToSelect = [id];
  if (element.groupId) {
    const groupMembers = getGroupMembers(state.elements, element.groupId);
    idsToSelect = groupMembers.map(e => e.id);
  }

  if (addToSelection) {
    // Add to existing selection (Shift+click)
    const newIds = new Set([...state.selectedIds, ...idsToSelect]);
    state.selectedIds = Array.from(newIds);
  } else {
    // Replace selection
    state.selectedIds = idsToSelect;
  }

  updateToolbarState();
  updatePropertiesPanel();
  render();
}

/**
 * Toggle element selection (for Shift+click)
 */
function toggleElementSelection(id) {
  const element = state.elements.find(e => e.id === id);
  if (!element) return;

  // If element is in a group, toggle entire group
  let idsToToggle = [id];
  if (element.groupId) {
    const groupMembers = getGroupMembers(state.elements, element.groupId);
    idsToToggle = groupMembers.map(e => e.id);
  }

  const isSelected = state.selectedIds.includes(id);
  if (isSelected) {
    // Remove from selection
    state.selectedIds = state.selectedIds.filter(sid => !idsToToggle.includes(sid));
  } else {
    // Add to selection
    const newIds = new Set([...state.selectedIds, ...idsToToggle]);
    state.selectedIds = Array.from(newIds);
  }

  updateToolbarState();
  updatePropertiesPanel();
  render();
}

/**
 * Deselect all elements
 */
function deselect() {
  state.selectedIds = [];
  updateToolbarState();
  updatePropertiesPanel();
  render();
}

/**
 * Update element and re-render
 */
function modifyElement(id, changes) {
  state.elements = updateElement(state.elements, id, changes);

  // Only clear cache if content or size changed (not just position/rotation)
  const contentKeys = ['width', 'height', 'text', 'fontSize', 'fontFamily', 'fontWeight', 'fontStyle', 'textDecoration', 'background', 'noWrap', 'clipOverflow', 'autoScale', 'verticalAlign', 'imageData', 'barcodeData', 'barcodeFormat', 'qrData'];
  const needsCacheClear = Object.keys(changes).some(key => contentKeys.includes(key));
  if (needsCacheClear) {
    state.renderer.clearCache(id);
  }

  // Detect template fields if text/barcode/qr data changed
  const templateKeys = ['text', 'barcodeData', 'qrData'];
  if (Object.keys(changes).some(key => templateKeys.includes(key))) {
    detectTemplateFields();
  }

  render();
  updatePropertiesPanel();
}

/**
 * Update toolbar button states
 */
function updateToolbarState() {
  const hasSelection = state.selectedIds.length > 0;
  const hasMultipleSelected = state.selectedIds.length > 1;
  const selectedElements = getSelectedElements();

  // Check if selection contains any grouped elements
  const hasGroupedElements = selectedElements.some(e => e.groupId);
  // Check if all selected elements are in the same group
  const groupIds = new Set(selectedElements.map(e => e.groupId).filter(Boolean));
  const canUngroup = groupIds.size === 1 && hasGroupedElements;

  $('#duplicate-btn').disabled = !hasSelection;
  $('#delete-btn').disabled = !hasSelection;
  $('#bring-front').disabled = !hasSelection;
  $('#send-back').disabled = !hasSelection;

  // Group button: enabled when 2+ ungrouped elements selected
  const groupBtn = $('#group-btn');
  if (groupBtn) {
    groupBtn.disabled = !hasMultipleSelected || hasGroupedElements;
  }

  // Ungroup button: enabled when a group is selected
  const ungroupBtn = $('#ungroup-btn');
  if (ungroupBtn) {
    ungroupBtn.disabled = !canUngroup;
  }
}

/**
 * Update properties panel for selected element
 */
function updatePropertiesPanel() {
  const element = getSelected();
  const selectedCount = state.selectedIds.length;

  // Handle multi-selection or no selection
  if (!element) {
    if (selectedCount > 1) {
      // Multiple elements selected
      $('#props-empty').innerHTML = `<span class="text-gray-500">${selectedCount} elements selected</span>`;
    } else {
      $('#props-empty').innerHTML = '<span class="text-gray-400">Select an element to edit</span>';
    }
    $('#props-empty').classList.remove('hidden');
    $('#props-content').classList.add('hidden');
    return;
  }

  $('#props-empty').classList.add('hidden');
  $('#props-content').classList.remove('hidden');

  // Update common properties
  $('#prop-x').value = Math.round(element.x);
  $('#prop-y').value = Math.round(element.y);
  $('#prop-width').value = Math.round(element.width);
  $('#prop-height').value = Math.round(element.height);
  $('#prop-rotation').value = Math.round(element.rotation || 0);

  // Update layer number (1-indexed for display, position in array determines z-order)
  const layerIndex = state.elements.findIndex(el => el.id === element.id);
  $('#prop-layer').textContent = layerIndex + 1;
  $('#prop-layer-total').textContent = state.elements.length;

  // Hide all type-specific panels
  $('#props-text').classList.add('hidden');
  $('#props-image').classList.add('hidden');
  $('#props-barcode').classList.add('hidden');
  $('#props-qr').classList.add('hidden');
  $('#props-shape').classList.add('hidden');

  // Show and populate type-specific panel
  switch (element.type) {
    case 'text':
      $('#props-text').classList.remove('hidden');
      $('#prop-text-content').value = element.text || '';
      $('#prop-font-family').value = element.fontFamily || 'Inter, sans-serif';
      $('#prop-font-size').value = element.fontSize || 24;
      $('#prop-no-wrap').checked = element.noWrap || false;
      $('#prop-clip-overflow').checked = element.clipOverflow || false;
      $('#prop-auto-scale').checked = element.autoScale || false;
      // Update horizontal alignment buttons
      $$('.align-btn').forEach(btn => {
        btn.classList.toggle('bg-gray-100', btn.dataset.align === element.align);
      });
      // Update vertical alignment buttons
      const vAlign = element.verticalAlign || 'middle';
      $$('.valign-btn').forEach(btn => {
        btn.classList.toggle('bg-gray-100', btn.dataset.valign === vAlign);
      });
      // Update style buttons
      $('#style-bold').classList.toggle('bg-gray-200', element.fontWeight === 'bold');
      $('#style-italic').classList.toggle('bg-gray-200', element.fontStyle === 'italic');
      $('#style-underline').classList.toggle('bg-gray-200', element.textDecoration === 'underline');
      // Update text color buttons
      const colorValue = element.color || 'black';
      $$('.color-btn').forEach(btn => {
        btn.classList.toggle('bg-gray-100', btn.dataset.color === colorValue);
        btn.classList.toggle('ring-2', btn.dataset.color === colorValue);
        btn.classList.toggle('ring-blue-400', btn.dataset.color === colorValue);
      });
      // Update background buttons
      const bgValue = element.background || 'transparent';
      $$('.bg-btn').forEach(btn => {
        btn.classList.toggle('bg-gray-100', btn.dataset.bg === bgValue);
        btn.classList.toggle('ring-2', btn.dataset.bg === bgValue);
        btn.classList.toggle('ring-blue-400', btn.dataset.bg === bgValue);
      });
      break;

    case 'image':
      $('#props-image').classList.remove('hidden');
      // Calculate current scale based on natural size
      const scaleW = (element.width / element.naturalWidth) * 100;
      const scaleH = (element.height / element.naturalHeight) * 100;
      const currentScale = Math.round(Math.max(scaleW, scaleH));
      $('#prop-image-scale').value = currentScale;
      $('#prop-image-scale-input').value = currentScale;
      $('#prop-image-lock-ratio').checked = element.lockAspectRatio !== false;
      break;

    case 'barcode':
      $('#props-barcode').classList.remove('hidden');
      $('#prop-barcode-data').value = element.barcodeData || '';
      $('#prop-barcode-format').value = element.barcodeFormat || 'CODE128';
      break;

    case 'qr':
      $('#props-qr').classList.remove('hidden');
      $('#prop-qr-data').value = element.qrData || '';
      break;

    case 'shape':
      $('#props-shape').classList.remove('hidden');
      $('#prop-shape-type').value = element.shapeType || 'rectangle';
      $('#prop-stroke-width').value = element.strokeWidth || 2;
      $('#prop-corner-radius').value = element.cornerRadius || 0;
      // Show/hide corner radius based on shape type
      const showCornerRadius = element.shapeType === 'rectangle';
      $('#prop-corner-radius-group').classList.toggle('hidden', !showCornerRadius);
      // Update fill dropdown (map legacy values to new ones)
      let fillValue = element.fill || 'black';
      if (fillValue === 'dither-light') fillValue = 'dither-25';
      if (fillValue === 'dither-medium') fillValue = 'dither-50';
      if (fillValue === 'dither-dark') fillValue = 'dither-75';
      $('#shape-fill').value = fillValue;
      // Update stroke buttons
      const strokeValue = element.stroke || 'none';
      $$('.stroke-btn').forEach(btn => {
        btn.classList.toggle('bg-gray-100', btn.dataset.stroke === strokeValue);
        btn.classList.toggle('ring-2', btn.dataset.stroke === strokeValue);
        btn.classList.toggle('ring-blue-400', btn.dataset.stroke === strokeValue);
      });
      break;
  }
}

/**
 * Handle label size change
 */
function handleLabelSizeChange() {
  const select = $('#label-size');
  const value = select.value;

  if (value === 'custom') {
    $('#custom-size').classList.remove('hidden');
    const w = parseInt($('#custom-width').value) || 40;
    const h = parseInt($('#custom-height').value) || 30;
    state.labelSize = { width: w, height: h };
  } else {
    $('#custom-size').classList.add('hidden');
    const preset = LABEL_SIZES[value];
    if (preset) {
      state.labelSize = { ...preset };
    }
  }

  state.renderer.setDimensions(state.labelSize.width, state.labelSize.height);
  updatePrintSize();
  render();
}

/**
 * Handle custom size input
 */
function handleCustomSizeChange() {
  const w = parseInt($('#custom-width').value) || 40;
  const h = parseInt($('#custom-height').value) || 30;
  state.labelSize = { width: Math.max(10, Math.min(100, w)), height: Math.max(10, Math.min(200, h)) };
  state.renderer.setDimensions(state.labelSize.width, state.labelSize.height);
  updatePrintSize();
  render();
}

/**
 * Get mouse position relative to canvas (accounting for zoom)
 */
function getCanvasPos(e) {
  const rect = state.renderer.canvas.getBoundingClientRect();
  // Account for zoom when calculating scale
  const scaleX = state.renderer.canvas.width / (rect.width);
  const scaleY = state.renderer.canvas.height / (rect.height);
  return {
    x: (e.clientX - rect.left) * scaleX,
    y: (e.clientY - rect.top) * scaleY,
  };
}

/**
 * Handle canvas mouse down
 */
function handleCanvasMouseDown(e) {
  const pos = getCanvasPos(e);
  const selectedElements = getSelectedElements();
  const isMultiSelect = state.selectedIds.length > 1;

  // For multi-selection or groups, check group bounding box handles first
  if (isMultiSelect || (selectedElements.length === 1 && selectedElements[0].groupId)) {
    const bounds = getMultiElementBounds(selectedElements);
    if (bounds) {
      const handle = getGroupHandleAtPoint(pos.x, pos.y, bounds);
      if (handle) {
        saveHistory();
        state.isDragging = true;
        state.dragStartX = pos.x;
        state.dragStartY = pos.y;
        state.dragStartElements = selectedElements.map(el => ({ ...el }));
        state.dragStartBounds = { ...bounds };

        if (handle === HandleType.ROTATE) {
          state.dragType = 'group-rotate';
          // Calculate starting angle
          const angle = Math.atan2(pos.y - bounds.cy, pos.x - bounds.cx);
          state.dragStartAngle = (angle * 180) / Math.PI + 90;
        } else {
          state.dragType = 'group-resize';
          state.dragHandle = handle;
        }
        return;
      }
    }
  }

  // Single element: check individual handles
  if (state.selectedIds.length === 1) {
    const selected = selectedElements[0];
    if (selected) {
      const handle = getHandleAtPoint(pos.x, pos.y, selected);
      if (handle) {
        saveHistory();
        state.isDragging = true;
        state.dragStartX = pos.x;
        state.dragStartY = pos.y;
        state.dragStartElements = [{ ...selected }];

        if (handle === HandleType.ROTATE) {
          state.dragType = 'rotate';
        } else {
          state.dragType = 'resize';
          state.dragHandle = handle;
        }
        return;
      }
    }
  }

  // Check if clicking on an element
  const clickedElement = getElementAtPoint(pos.x, pos.y, state.elements);
  if (clickedElement) {
    // Shift+click toggles selection
    if (e.shiftKey) {
      toggleElementSelection(clickedElement.id);
    } else {
      // Check if clicking on already-selected element
      const alreadySelected = state.selectedIds.includes(clickedElement.id);
      if (!alreadySelected) {
        selectElement(clickedElement.id);
      }
    }

    // Start move drag for all selected elements
    const currentSelected = getSelectedElements();
    saveHistory();
    state.isDragging = true;
    state.dragType = currentSelected.length > 1 ? 'group-move' : 'move';
    state.dragStartX = pos.x;
    state.dragStartY = pos.y;
    state.dragStartElements = currentSelected.map(el => ({ ...el }));
    state.dragStartBounds = getMultiElementBounds(currentSelected);
    return;
  }

  // Clicked on empty area
  deselect();
}

/**
 * Handle canvas mouse move
 */
function handleCanvasMouseMove(e) {
  const pos = getCanvasPos(e);
  const canvas = state.renderer.canvas;

  if (state.isDragging && state.dragStartElements) {
    const dx = pos.x - state.dragStartX;
    const dy = pos.y - state.dragStartY;

    switch (state.dragType) {
      case 'move':
        // Single element move
        const el = state.dragStartElements[0];
        modifyElement(el.id, {
          x: el.x + dx,
          y: el.y + dy,
        });
        break;

      case 'group-move':
        // Multi-element move
        state.elements = moveElements(
          state.elements,
          state.dragStartElements.map(e => e.id),
          dx, dy
        );
        // Reset start positions for continuous drag
        state.dragStartElements = getSelectedElements().map(e => ({ ...e }));
        state.dragStartX = pos.x;
        state.dragStartY = pos.y;
        render();
        break;

      case 'resize':
        // Single element resize
        const resizeEl = state.dragStartElements[0];
        // For images with lockAspectRatio, preserve aspect by default (Shift to unlock)
        // For other elements, Shift preserves aspect
        const isLockedImage = resizeEl.type === 'image' && resizeEl.lockAspectRatio !== false;
        const preserveAspect = isLockedImage ? !e.shiftKey : e.shiftKey;
        const newBounds = calculateResize(resizeEl, state.dragHandle, dx, dy, preserveAspect);
        modifyElement(resizeEl.id, constrainSize({ ...resizeEl, ...newBounds }));
        break;

      case 'group-resize':
        // Multi-element resize - scale from original positions
        const { scaleX, scaleY } = calculateGroupResize(
          state.dragStartBounds,
          state.dragHandle,
          dx, dy,
          e.shiftKey
        );

        // Determine if this is a side handle (only one dimension changes)
        const isHorizontalSide = state.dragHandle === HandleType.E || state.dragHandle === HandleType.W;
        const isVerticalSide = state.dragHandle === HandleType.N || state.dragHandle === HandleType.S;

        // Apply scale to original elements, not current state
        const scaledElements = state.dragStartElements.map(origEl => {
          const elCx = origEl.x + origEl.width / 2;
          const elCy = origEl.y + origEl.height / 2;
          const centerX = state.dragStartBounds.cx;
          const centerY = state.dragStartBounds.cy;

          // For side handles, only scale in one direction
          const effectiveScaleX = isVerticalSide ? 1 : scaleX;
          const effectiveScaleY = isHorizontalSide ? 1 : scaleY;

          // Scale position relative to group center
          const newCx = centerX + (elCx - centerX) * effectiveScaleX;
          const newCy = centerY + (elCy - centerY) * effectiveScaleY;

          // Scale size - for side handles, only change one dimension
          const newWidth = Math.max(origEl.width * effectiveScaleX, 10);
          const newHeight = Math.max(origEl.height * effectiveScaleY, 10);

          return {
            ...origEl,
            x: newCx - newWidth / 2,
            y: newCy - newHeight / 2,
            width: newWidth,
            height: newHeight,
          };
        });

        // Update elements in state
        state.elements = state.elements.map(el => {
          const scaled = scaledElements.find(s => s.id === el.id);
          return scaled || el;
        });

        // Clear caches for resized elements
        state.dragStartElements.forEach(el => state.renderer.clearCache(el.id));
        render();
        break;

      case 'rotate':
        // Single element rotation
        const rotEl = state.dragStartElements[0];
        let rotation = calculateRotation(rotEl, pos.x, pos.y);
        if (!e.shiftKey) {
          rotation = snapRotation(rotation);
        }
        modifyElement(rotEl.id, { rotation });
        break;

      case 'group-rotate':
        // Multi-element rotation around group center
        const currentAngle = Math.atan2(pos.y - state.dragStartBounds.cy, pos.x - state.dragStartBounds.cx);
        let angleDelta = ((currentAngle * 180) / Math.PI + 90) - state.dragStartAngle;
        if (!e.shiftKey) {
          angleDelta = snapRotation(angleDelta);
        }
        state.elements = rotateElements(
          state.elements,
          state.dragStartElements.map(e => e.id),
          angleDelta,
          { x: state.dragStartBounds.cx, y: state.dragStartBounds.cy }
        );
        // Update start angle for continuous drag
        state.dragStartAngle = (currentAngle * 180) / Math.PI + 90;
        state.dragStartElements = getSelectedElements().map(e => ({ ...e }));
        render();
        break;
    }
    return;
  }

  // Update cursor based on what's under mouse
  const selectedElements = getSelectedElements();
  const isMultiSelect = state.selectedIds.length > 1;

  // Check group handles for multi-selection
  if (isMultiSelect || (selectedElements.length === 1 && selectedElements[0].groupId)) {
    const bounds = getMultiElementBounds(selectedElements);
    if (bounds) {
      const handle = getGroupHandleAtPoint(pos.x, pos.y, bounds);
      if (handle) {
        canvas.style.cursor = getCursorForHandle(handle, 0);
        return;
      }
    }
  }

  // Check single element handles
  if (state.selectedIds.length === 1) {
    const selected = selectedElements[0];
    if (selected) {
      const handle = getHandleAtPoint(pos.x, pos.y, selected);
      if (handle) {
        canvas.style.cursor = getCursorForHandle(handle, selected.rotation);
        return;
      }
    }
  }

  const hovered = getElementAtPoint(pos.x, pos.y, state.elements);
  canvas.style.cursor = hovered ? 'move' : 'crosshair';
}

/**
 * Handle canvas mouse up
 */
function handleCanvasMouseUp() {
  state.isDragging = false;
  state.dragType = null;
  state.dragHandle = null;
  state.dragStartElements = null;
  state.dragStartBounds = null;
  state.dragStartAngle = 0;
}

/**
 * Add a new text element
 */
function addTextElement() {
  saveHistory();
  const dims = state.renderer.getDimensions();
  const element = createTextElement('New Text', {
    x: dims.width / 2 - 75,
    y: dims.height / 2 - 20,
    width: 150,
    height: 40,
  });
  state.elements.push(element);
  selectElement(element.id);
  setStatus('Text added');
}

/**
 * Add a new image element
 */
async function addImageElement(file) {
  try {
    const { dataUrl, width, height } = await state.renderer.loadImageFile(file);

    // Use native size if it fits, otherwise scale down to fit
    const dims = state.renderer.getDimensions();
    const maxWidth = dims.width * 0.95;   // Leave small margin
    const maxHeight = dims.height * 0.95;

    // Only scale down if needed (scale <= 1), never scale up
    const scale = Math.min(maxWidth / width, maxHeight / height, 1);
    const scaledW = width * scale;
    const scaledH = height * scale;

    const element = createImageElement(dataUrl, {
      x: (dims.width - scaledW) / 2,
      y: (dims.height - scaledH) / 2,
      width: scaledW,
      height: scaledH,
      naturalWidth: width,
      naturalHeight: height,
    });

    saveHistory();
    state.elements.push(element);
    selectElement(element.id);
    setStatus(scale < 1 ? `Image scaled to ${Math.round(scale * 100)}%` : 'Image added');
  } catch (e) {
    console.error('Failed to load image:', e);
    showToast('Failed to load image', 'error');
    setStatus('Failed to load image');
  }
}

/**
 * Add a new barcode element
 */
function addBarcodeElement() {
  saveHistory();
  const dims = state.renderer.getDimensions();
  const element = createBarcodeElement('123456789012', {
    x: dims.width / 2 - 90,
    y: dims.height / 2 - 40,
    width: 180,
    height: 80,
  });
  state.elements.push(element);
  selectElement(element.id);
  setStatus('Barcode added');
}

/**
 * Add a new QR element
 */
function addQRElement() {
  saveHistory();
  const dims = state.renderer.getDimensions();
  const size = Math.min(dims.width, dims.height) * 0.5;
  const element = createQRElement('https://example.com', {
    x: (dims.width - size) / 2,
    y: (dims.height - size) / 2,
    width: size,
    height: size,
  });
  state.elements.push(element);
  selectElement(element.id);
  setStatus('QR code added');
}

/**
 * Add shape element
 */
function addShapeElement(shapeType = 'rectangle') {
  saveHistory();
  const dims = state.renderer.getDimensions();
  const width = shapeType === 'line' ? 100 : 80;
  const height = shapeType === 'line' ? 4 : 60;
  const element = createShapeElement(shapeType, {
    x: dims.width / 2 - width / 2,
    y: dims.height / 2 - height / 2,
    width: width,
    height: height,
    strokeWidth: shapeType === 'line' ? 3 : 2,
  });
  state.elements.push(element);
  selectElement(element.id);
  setStatus(`${shapeType.charAt(0).toUpperCase() + shapeType.slice(1)} added`);
}

/**
 * Handle connect button click
 */
async function handleConnect() {
  // Check if printing is supported in this browser
  if (!state.canPrint) {
    alert('Printing is not available in this browser.\n\nPlease use Chrome, Edge, or Opera on desktop for Bluetooth printing.');
    return;
  }

  const btn = $('#connect-btn');
  const originalText = btn.textContent;

  try {
    btn.disabled = true;
    btn.textContent = 'Connecting...';
    setStatus('Select printer with signal indicator (📶)');

    const isBLE = state.connectionType === 'ble';

    if (isBLE) {
      if (!BLETransport.isAvailable()) {
        throw new Error('Bluetooth is not supported');
      }
      state.transport = BLETransport.getShared();
    } else {
      if (!USBTransport.isAvailable()) {
        throw new Error('USB is not supported');
      }
      state.transport = USBTransport.getShared();
    }

    await state.transport.connect();

    if (!state.transport.isConnected()) {
      throw new Error('Connection failed');
    }

    updateConnectionStatus(true);
    btn.textContent = 'Connected';
    btn.classList.remove('bg-white', 'hover:bg-gray-50');
    btn.classList.add('bg-green-100', 'text-green-800', 'border-green-300');
    setStatus(`Connected to ${state.transport.getDeviceName()}`);

  } catch (error) {
    console.error('Connect error:', error);
    setStatus(error.message || 'Connection failed');
    btn.textContent = originalText;
    updateConnectionStatus(false);
  } finally {
    btn.disabled = false;
  }
}

/**
 * Handle print button click
 */
async function handlePrint() {
  const btn = $('#print-btn');
  const originalText = btn.textContent;
  const { density, copies, feed } = state.printSettings;

  try {
    btn.disabled = true;

    if (!state.transport || !state.transport.isConnected()) {
      setStatus('Connecting...');
      await handleConnect();

      if (!state.transport || !state.transport.isConnected()) {
        throw new Error('Please connect to printer first');
      }
    }

    btn.textContent = 'Printing...';
    const rasterData = state.renderer.getRasterData(state.elements);

    // Print multiple copies if requested
    for (let copy = 1; copy <= copies; copy++) {
      const copyText = copies > 1 ? ` (${copy}/${copies})` : '';
      setStatus(`Printing${copyText}...`);

      await print(state.transport, rasterData, {
        isBLE: state.connectionType === 'ble',
        density,
        feed,
        onProgress: (progress) => {
          btn.textContent = `Printing... ${progress}%`;
          setStatus(`Printing${copyText}... ${progress}%`);
        },
      });

      // Small delay between copies
      if (copy < copies) {
        await new Promise(r => setTimeout(r, 500));
      }
    }

    setStatus(copies > 1 ? `Printed ${copies} copies!` : 'Print complete!');
    btn.textContent = 'Print';

  } catch (error) {
    console.error('Print error:', error);
    setStatus(error.message || 'Print failed');
    btn.textContent = originalText;
  } finally {
    btn.disabled = false;
  }
}

/**
 * Show info dialog
 */
function showInfoDialog() {
  $('#info-dialog').classList.remove('hidden');
}

/**
 * Hide info dialog and mark as seen
 */
function hideInfoDialog() {
  $('#info-dialog').classList.add('hidden');
  try {
    localStorage.setItem('phomymo_info_seen', 'true');
  } catch (e) {
    // localStorage not available
  }
}

/**
 * Check if info dialog should show on first visit
 */
function shouldShowInfoOnLoad() {
  try {
    return !localStorage.getItem('phomymo_info_seen');
  } catch (e) {
    return false;
  }
}

/**
 * Show save dialog
 */
function showSaveDialog() {
  $('#save-dialog').classList.remove('hidden');
  $('#save-name').value = '';
  $('#save-name').focus();
}

/**
 * Hide save dialog
 */
function hideSaveDialog() {
  $('#save-dialog').classList.add('hidden');
}

/**
 * Save current design
 */
function handleSave() {
  const name = $('#save-name').value.trim();
  if (!name) {
    setStatus('Please enter a design name');
    return;
  }

  try {
    const designData = {
      elements: state.elements,
      labelSize: state.labelSize,
    };

    // Include template data if present
    if (state.templateFields.length > 0) {
      designData.isTemplate = true;
      designData.templateFields = state.templateFields;
    }
    if (state.templateData.length > 0) {
      designData.templateData = state.templateData;
    }

    saveDesign(name, designData);
    hideSaveDialog();

    const templateInfo = state.templateData.length > 0
      ? ` (with ${state.templateData.length} data records)`
      : '';
    setStatus(`Design "${name}" saved${templateInfo}`);
  } catch (e) {
    showToast(e.message, 'error');
    setStatus(e.message);
  }
}

/**
 * Show load dialog
 */
function showLoadDialog() {
  const designs = listDesigns();
  const listEl = $('#design-list');

  if (designs.length === 0) {
    listEl.innerHTML = '<div class="text-sm text-gray-400 text-center py-8">No saved designs</div>';
  } else {
    listEl.innerHTML = designs.map(d => {
      // Build info badges
      const badges = [];
      if (d.hasImages) {
        badges.push('<span class="px-1.5 py-0.5 text-xs bg-blue-100 text-blue-700 rounded">🖼️</span>');
      }
      if (d.isTemplate) {
        badges.push('<span class="px-1.5 py-0.5 text-xs bg-purple-100 text-purple-700 rounded">Template</span>');
      }
      if (d.templateDataCount > 0) {
        badges.push(`<span class="px-1.5 py-0.5 text-xs bg-green-100 text-green-700 rounded">${d.templateDataCount} records</span>`);
      }

      const badgeHtml = badges.length > 0 ? `<div class="flex gap-1 mt-1">${badges.join('')}</div>` : '';

      return `
        <div class="design-item flex items-center justify-between p-3 hover:bg-gray-50 rounded-lg cursor-pointer border border-gray-100 mb-2" data-name="${d.name}">
          <div class="flex-1">
            <div class="font-medium text-sm text-gray-900">${d.name}</div>
            <div class="text-xs text-gray-400">${d.labelSize.width}x${d.labelSize.height}mm · ${d.elementCount} elements</div>
            ${badgeHtml}
          </div>
          <button class="delete-design text-red-500 hover:text-red-700 text-xs px-2 py-1 ml-2" data-name="${d.name}">Delete</button>
        </div>
      `;
    }).join('');

    // Bind click handlers
    listEl.querySelectorAll('.design-item').forEach(item => {
      item.addEventListener('click', (e) => {
        if (e.target.classList.contains('delete-design')) {
          e.stopPropagation();
          const name = e.target.dataset.name;
          if (confirm(`Delete "${name}"?`)) {
            deleteDesign(name);
            showLoadDialog(); // Refresh list
            setStatus(`Design "${name}" deleted`);
          }
          return;
        }
        handleLoad(item.dataset.name);
      });
    });
  }

  $('#load-dialog').classList.remove('hidden');
}

/**
 * Hide load dialog
 */
function hideLoadDialog() {
  $('#load-dialog').classList.add('hidden');
}

/**
 * Export current design to file
 */
function handleExport() {
  if (state.elements.length === 0) {
    setStatus('Nothing to export');
    return;
  }

  // Build export data
  const exportData = {
    name: 'Untitled Design',
    version: 2,
    elements: state.elements,
    labelSize: state.labelSize,
    exportedAt: new Date().toISOString(),
  };

  // Include template data if present
  if (state.templateFields.length > 0) {
    exportData.isTemplate = true;
    exportData.templateFields = state.templateFields;
  }
  if (state.templateData.length > 0) {
    exportData.templateData = state.templateData;
  }

  // Create and download file
  const jsonString = JSON.stringify(exportData, null, 2);
  const blob = new Blob([jsonString], { type: 'application/json' });
  const url = URL.createObjectURL(blob);

  const a = document.createElement('a');
  a.href = url;
  a.download = `phomymo-design-${Date.now()}.json`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);

  setStatus('Design exported');
}

/**
 * Import design from file
 */
function handleImportFile(file) {
  const reader = new FileReader();
  reader.onload = (e) => {
    try {
      const data = JSON.parse(e.target.result);

      // Validate the data
      if (!data.elements || !Array.isArray(data.elements)) {
        throw new Error('Invalid design file: missing elements');
      }

      // Load the design
      state.elements = data.elements;

      // Load label size if present
      if (data.labelSize) {
        state.labelSize = data.labelSize;
        // Update the label size dropdown
        const sizeKey = `${data.labelSize.width}x${data.labelSize.height}`;
        const select = $('#label-size');
        if (LABEL_SIZES[sizeKey]) {
          select.value = sizeKey;
          $('#custom-size').classList.add('hidden');
        } else {
          select.value = 'custom';
          $('#custom-size').classList.remove('hidden');
          $('#custom-width').value = data.labelSize.width;
          $('#custom-height').value = data.labelSize.height;
        }
      }

      // Load template data if present
      if (data.templateData && Array.isArray(data.templateData)) {
        state.templateData = data.templateData;
        state.selectedRecords = data.templateData.map((_, i) => i); // Select all by default
      }

      // Clear selection and update renderer
      state.selectedIds = [];
      state.renderer.setDimensions(state.labelSize.width, state.labelSize.height);
      state.renderer.clearCache();
      resetHistory();
      updatePrintSize();
      updateToolbarState();
      updatePropertiesPanel();

      // Detect template fields from elements
      detectTemplateFields();

      render();
      hideLoadDialog();

      const name = data.name || 'Imported design';
      setStatus(`Imported: ${name}`);
    } catch (err) {
      console.error('Import error:', err);
      showToast('Import failed', 'error');
      setStatus(`Import failed: ${err.message}`);
    }
  };
  reader.readAsText(file);
}

/**
 * Update elements list dropdown
 */
function updateElementsList() {
  const container = $('#elements-list');

  if (state.elements.length === 0) {
    container.innerHTML = '<div class="px-3 py-2 text-gray-400 text-center">No elements</div>';
    return;
  }

  // Build list HTML - elements in z-order (bottom to top)
  const html = state.elements.map((el, index) => {
    const isSelected = state.selectedIds.includes(el.id);
    const icon = getElementIcon(el.type);
    const label = getElementLabel(el);
    const layerNum = index + 1;

    return `
      <button class="element-list-item w-full px-3 py-1.5 text-left hover:bg-gray-100 flex items-center gap-2 ${isSelected ? 'bg-blue-50 text-blue-700' : ''}"
              data-element-id="${el.id}">
        <span class="text-gray-400 text-xs w-4">${layerNum}</span>
        ${icon}
        <span class="flex-1 truncate">${escapeHtml(label)}</span>
        ${el.groupId ? '<span class="text-xs text-gray-400">G</span>' : ''}
      </button>
    `;
  }).reverse().join(''); // Reverse to show top layer first

  container.innerHTML = html;

  // Add click handlers
  container.querySelectorAll('.element-list-item').forEach(btn => {
    btn.addEventListener('click', () => {
      const id = btn.dataset.elementId;
      selectElement(id);
      $('#elements-dropdown').classList.add('hidden');
    });
  });
}

/**
 * Get icon SVG for element type
 */
function getElementIcon(type) {
  const icons = {
    text: '<svg class="w-4 h-4 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 6h16M4 12h8m-8 6h16"/></svg>',
    image: '<svg class="w-4 h-4 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z"/></svg>',
    barcode: '<svg class="w-4 h-4 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v1m6 11h2m-6 0h-2v4m0-11v3m0 0h.01M12 12h4.01M16 20h2M4 12h2m10 0h2"/></svg>',
    qr: '<svg class="w-4 h-4 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v1m6 11h2m-6 0h-2v4m0-11v3m0 0h.01M12 12h4.01M16 20h2M4 12h2m10 0h2"/></svg>',
    shape: '<svg class="w-4 h-4 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 5a1 1 0 011-1h14a1 1 0 011 1v14a1 1 0 01-1 1H5a1 1 0 01-1-1V5z"/></svg>',
  };
  return icons[type] || icons.shape;
}

/**
 * Get label for element
 */
function getElementLabel(el) {
  switch (el.type) {
    case 'text':
      return el.text ? (el.text.substring(0, 20) + (el.text.length > 20 ? '...' : '')) : 'Text';
    case 'image':
      return 'Image';
    case 'barcode':
      return el.barcodeData ? `Barcode: ${el.barcodeData.substring(0, 10)}` : 'Barcode';
    case 'qr':
      return el.qrData ? `QR: ${el.qrData.substring(0, 15)}` : 'QR Code';
    case 'shape':
      const shapeNames = { rectangle: 'Rectangle', ellipse: 'Ellipse', triangle: 'Triangle', line: 'Line' };
      return shapeNames[el.shapeType] || 'Shape';
    default:
      return 'Element';
  }
}

/**
 * Load a design
 */
function handleLoad(name) {
  const design = loadDesign(name);
  if (!design) {
    setStatus('Design not found');
    return;
  }

  state.elements = design.elements || [];
  state.labelSize = design.labelSize || { width: 40, height: 30 };
  state.selectedIds = [];

  // Restore template data if present
  state.templateData = design.templateData || [];
  state.selectedRecords = state.templateData.map((_, i) => i); // Select all by default

  // Update label size dropdown
  const sizeKey = `${state.labelSize.width}x${state.labelSize.height}`;
  const select = $('#label-size');
  if (LABEL_SIZES[sizeKey]) {
    select.value = sizeKey;
    $('#custom-size').classList.add('hidden');
  } else {
    select.value = 'custom';
    $('#custom-size').classList.remove('hidden');
    $('#custom-width').value = state.labelSize.width;
    $('#custom-height').value = state.labelSize.height;
  }

  state.renderer.setDimensions(state.labelSize.width, state.labelSize.height);
  state.renderer.clearCache();
  resetHistory();
  updatePrintSize();
  updateToolbarState();
  updatePropertiesPanel();

  // Detect template fields from loaded elements
  detectTemplateFields();

  render();

  hideLoadDialog();

  // Show status with template info
  const templateInfo = state.templateData.length > 0
    ? ` (${state.templateData.length} data records)`
    : '';
  setStatus(`Loaded "${name}"${templateInfo}`);
}

/**
 * Handle keyboard shortcuts
 */
function handleKeyDown(e) {
  // Undo: Ctrl/Cmd + Z
  if ((e.ctrlKey || e.metaKey) && e.key === 'z' && !e.shiftKey) {
    if (document.activeElement.tagName !== 'INPUT' && document.activeElement.tagName !== 'TEXTAREA') {
      e.preventDefault();
      undo();
      return;
    }
  }

  // Redo: Ctrl/Cmd + Shift + Z or Ctrl/Cmd + Y
  if ((e.ctrlKey || e.metaKey) && (e.key === 'Z' || e.key === 'y')) {
    if (document.activeElement.tagName !== 'INPUT' && document.activeElement.tagName !== 'TEXTAREA') {
      e.preventDefault();
      redo();
      return;
    }
  }

  const selectedElements = getSelectedElements();
  const hasSelection = selectedElements.length > 0;

  // Delete key - delete all selected elements
  if (e.key === 'Delete' || e.key === 'Backspace') {
    if (hasSelection && document.activeElement.tagName !== 'INPUT' && document.activeElement.tagName !== 'TEXTAREA') {
      e.preventDefault();
      saveHistory();
      const count = selectedElements.length;
      // Delete all selected elements
      state.selectedIds.forEach(id => {
        state.elements = deleteElement(state.elements, id);
      });
      deselect();
      setStatus(count > 1 ? `${count} elements deleted` : 'Element deleted');
    }
  }

  // Arrow keys for nudging - move all selected elements
  if (hasSelection && ['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.key)) {
    if (document.activeElement.tagName !== 'INPUT' && document.activeElement.tagName !== 'TEXTAREA') {
      e.preventDefault();
      const step = e.shiftKey ? 10 : 1;
      let dx = 0, dy = 0;
      switch (e.key) {
        case 'ArrowUp': dy = -step; break;
        case 'ArrowDown': dy = step; break;
        case 'ArrowLeft': dx = -step; break;
        case 'ArrowRight': dx = step; break;
      }
      state.elements = moveElements(state.elements, state.selectedIds, dx, dy);
      render();
    }
  }

  // Escape to deselect
  if (e.key === 'Escape') {
    if ($('#info-dialog').classList.contains('hidden') === false) {
      hideInfoDialog();
    } else if ($('#save-dialog').classList.contains('hidden') === false) {
      hideSaveDialog();
    } else if ($('#load-dialog').classList.contains('hidden') === false) {
      hideLoadDialog();
    } else {
      deselect();
    }
  }

  // Ctrl/Cmd + D to duplicate
  if ((e.ctrlKey || e.metaKey) && e.key === 'd' && hasSelection) {
    e.preventDefault();
    saveHistory();
    // Duplicate all selected elements
    const newIds = [];
    selectedElements.forEach(el => {
      state.elements = duplicateElement(state.elements, el.id);
      newIds.push(state.elements[state.elements.length - 1].id);
    });
    state.selectedIds = newIds;
    updateToolbarState();
    render();
    setStatus(selectedElements.length > 1 ? `${selectedElements.length} elements duplicated` : 'Element duplicated');
  }

  // Ctrl/Cmd + G to group
  if ((e.ctrlKey || e.metaKey) && e.key === 'g' && !e.shiftKey && selectedElements.length > 1) {
    e.preventDefault();
    handleGroup();
  }

  // Ctrl/Cmd + Shift + G to ungroup
  if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key === 'G') {
    e.preventDefault();
    handleUngroup();
  }
}

/**
 * Group selected elements
 */
function handleGroup() {
  const selectedElements = getSelectedElements();
  if (selectedElements.length < 2) {
    showToast('Select at least 2 elements to group', 'warning');
    return;
  }

  // Check if any are already grouped
  if (selectedElements.some(e => e.groupId)) {
    showToast('Cannot group elements that are already grouped', 'warning');
    return;
  }

  saveHistory();
  const result = groupElements(state.elements, state.selectedIds);
  state.elements = result.elements;
  render();
  updateToolbarState();
  showToast('Elements grouped', 'success');
  setStatus('Elements grouped');
}

/**
 * Ungroup selected elements
 */
function handleUngroup() {
  const selectedElements = getSelectedElements();
  const groupIds = new Set(selectedElements.map(e => e.groupId).filter(Boolean));

  if (groupIds.size === 0) {
    showToast('No groups to ungroup', 'warning');
    return;
  }

  saveHistory();
  // Ungroup all selected groups
  groupIds.forEach(groupId => {
    state.elements = ungroupElements(state.elements, groupId);
  });

  render();
  updateToolbarState();
  showToast('Elements ungrouped', 'success');
  setStatus('Elements ungrouped');
}

/**
 * Check browser compatibility
 */
function checkCompatibility() {
  const warnings = [];
  let canPrint = true;

  if (!window.isSecureContext) {
    warnings.push('HTTPS required for printing - this app must be served over a secure connection');
    canPrint = false;
  }

  if (!('bluetooth' in navigator)) {
    warnings.push('Web Bluetooth not supported - printing requires Chrome, Edge, or Opera');
    canPrint = false;
  }

  if (!('usb' in navigator)) {
    console.warn('WebUSB not supported - USB printing will not be available');
  }

  // Store print capability in state for disabling print buttons
  state.canPrint = canPrint;

  if (warnings.length > 0) {
    const overlay = document.createElement('div');
    overlay.id = 'compatibility-warning';
    overlay.className = 'fixed inset-0 bg-gray-900 bg-opacity-90 flex items-center justify-center z-50';
    overlay.innerHTML = `
      <div class="bg-white rounded-xl p-8 max-w-md mx-4 text-center">
        <div class="text-yellow-500 text-5xl mb-4">⚠</div>
        <h2 class="text-xl font-semibold text-gray-900 mb-4">Limited Browser Support</h2>
        <div class="text-gray-600 space-y-2 mb-6">
          ${warnings.map(w => `<p>${w}</p>`).join('')}
        </div>
        <div class="text-sm text-gray-500 mb-6">
          <p class="mb-2"><strong>For printing:</strong> Use Chrome, Edge, or Opera on desktop</p>
          <p>You can still design, save, and export labels without printing.</p>
        </div>
        <button id="dismiss-warning-btn" class="px-6 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 transition-colors">
          Continue Anyway
        </button>
      </div>
    `;
    document.body.appendChild(overlay);

    // Set up dismiss button
    document.getElementById('dismiss-warning-btn').addEventListener('click', () => {
      overlay.remove();
    });
  }

  return true; // Always return true to allow app to initialize
}

/**
 * Initialize the application
 */
function init() {
  if (!checkCompatibility()) {
    return;
  }

  // Create canvas renderer
  const canvas = $('#preview-canvas');
  state.renderer = new CanvasRenderer(canvas);
  state.renderer.setDimensions(state.labelSize.width, state.labelSize.height);
  // Re-render when async content (barcodes, QR codes) finishes loading
  // Use requestAnimationFrame to batch multiple async loads
  let asyncRenderPending = false;
  state.renderer.onAsyncLoad = () => {
    if (!asyncRenderPending) {
      asyncRenderPending = true;
      requestAnimationFrame(() => {
        asyncRenderPending = false;
        render();
      });
    }
  };
  updatePrintSize();

  // Label size
  $('#label-size').addEventListener('change', handleLabelSizeChange);
  $('#custom-width').addEventListener('change', handleCustomSizeChange);
  $('#custom-height').addEventListener('change', handleCustomSizeChange);

  // Connection type
  const connType = $('#conn-type');
  if (!('usb' in navigator)) {
    const usbOption = connType.querySelector('option[value="usb"]');
    if (usbOption) usbOption.remove();
  }
  connType.addEventListener('change', (e) => {
    state.connectionType = e.target.value;
    const btn = $('#connect-btn');
    btn.textContent = 'Connect';
    btn.classList.remove('bg-green-100', 'text-green-800', 'border-green-300');
    btn.classList.add('bg-white', 'hover:bg-gray-50');
    updateConnectionStatus(false);
  });

  // Info dialog
  $('#info-btn').addEventListener('click', showInfoDialog);
  $('#info-close').addEventListener('click', hideInfoDialog);
  $('#info-dialog').addEventListener('click', (e) => {
    if (e.target === e.currentTarget) hideInfoDialog();
  });

  // Connect and print
  $('#connect-btn').addEventListener('click', handleConnect);
  $('#print-btn').addEventListener('click', handlePrint);

  // Print settings dialog
  const printSettingsDialog = $('#print-settings-dialog');
  const densitySlider = $('#print-density');
  const densityValue = $('#print-density-value');
  const copiesInput = $('#print-copies');
  const feedSelect = $('#print-feed');

  // Load saved print settings from localStorage
  const savedPrintSettings = localStorage.getItem('phomymo_print_settings');
  if (savedPrintSettings) {
    try {
      const settings = JSON.parse(savedPrintSettings);
      state.printSettings = { ...state.printSettings, ...settings };
      densitySlider.value = state.printSettings.density;
      densityValue.textContent = state.printSettings.density;
      copiesInput.value = state.printSettings.copies;
      feedSelect.value = state.printSettings.feed;
    } catch (e) {
      console.warn('Failed to load print settings:', e);
    }
  }

  $('#print-settings-btn').addEventListener('click', () => {
    // Update dialog with current values
    densitySlider.value = state.printSettings.density;
    densityValue.textContent = state.printSettings.density;
    copiesInput.value = state.printSettings.copies;
    feedSelect.value = state.printSettings.feed;
    printSettingsDialog.classList.remove('hidden');
  });

  $('#print-settings-close').addEventListener('click', () => {
    printSettingsDialog.classList.add('hidden');
  });

  densitySlider.addEventListener('input', (e) => {
    densityValue.textContent = e.target.value;
  });

  $('#print-settings-reset').addEventListener('click', () => {
    state.printSettings = { density: 6, copies: 1, feed: 32 };
    densitySlider.value = 6;
    densityValue.textContent = '6';
    copiesInput.value = 1;
    feedSelect.value = 32;
  });

  $('#print-settings-save').addEventListener('click', () => {
    state.printSettings.density = parseInt(densitySlider.value);
    state.printSettings.copies = Math.max(1, Math.min(99, parseInt(copiesInput.value) || 1));
    state.printSettings.feed = parseInt(feedSelect.value);

    // Save to localStorage
    localStorage.setItem('phomymo_print_settings', JSON.stringify(state.printSettings));

    printSettingsDialog.classList.add('hidden');
    setStatus('Print settings saved');
  });

  // Close dialog on backdrop click
  printSettingsDialog.addEventListener('click', (e) => {
    if (e.target === printSettingsDialog) {
      printSettingsDialog.classList.add('hidden');
    }
  });

  // Density test button
  $('#print-density-test').addEventListener('click', async () => {
    const btn = $('#print-density-test');
    const originalText = btn.innerHTML;

    try {
      // Ensure connected
      if (!state.transport || !state.transport.isConnected()) {
        printSettingsDialog.classList.add('hidden');
        setStatus('Connecting...');
        await handleConnect();

        if (!state.transport || !state.transport.isConnected()) {
          throw new Error('Please connect to printer first');
        }
      }

      btn.disabled = true;
      btn.innerHTML = '🧪 Printing test...';
      printSettingsDialog.classList.add('hidden');
      setStatus('Printing density test (8 strips)...');

      await printDensityTest(
        state.transport,
        state.connectionType === 'ble',
        (progress) => setStatus(`Printing density test... ${progress}%`)
      );

      setStatus('Density test complete! Compare the 8 strips (1=lightest, 8=darkest)');
    } catch (error) {
      console.error('Density test error:', error);
      setStatus(error.message || 'Density test failed');
    } finally {
      btn.disabled = false;
      btn.innerHTML = originalText;
    }
  });

  // Add element buttons
  $('#add-text').addEventListener('click', addTextElement);
  $('#add-image').addEventListener('click', () => $('#image-file-input').click());
  $('#image-file-input').addEventListener('change', (e) => {
    if (e.target.files[0]) {
      addImageElement(e.target.files[0]);
      e.target.value = '';
    }
  });
  $('#add-barcode').addEventListener('click', addBarcodeElement);
  $('#add-qr').addEventListener('click', addQRElement);

  // Shape dropdown toggle
  $('#add-shape-btn').addEventListener('click', (e) => {
    e.stopPropagation();
    $('#shape-dropdown').classList.toggle('hidden');
  });

  // Shape options
  $$('.shape-option').forEach(btn => {
    btn.addEventListener('click', () => {
      const shapeType = btn.dataset.shape;
      addShapeElement(shapeType);
      $('#shape-dropdown').classList.add('hidden');
    });
  });

  // Close shape dropdown when clicking outside
  document.addEventListener('click', (e) => {
    if (!e.target.closest('#add-shape-btn') && !e.target.closest('#shape-dropdown')) {
      $('#shape-dropdown').classList.add('hidden');
    }
  });

  // Element actions
  $('#duplicate-btn').addEventListener('click', () => {
    const selected = getSelected();
    if (selected) {
      saveHistory();
      state.elements = duplicateElement(state.elements, selected.id);
      selectElement(state.elements[state.elements.length - 1].id);
      setStatus('Element duplicated');
    }
  });

  $('#delete-btn').addEventListener('click', () => {
    const selected = getSelected();
    if (selected) {
      saveHistory();
      state.elements = deleteElement(state.elements, selected.id);
      deselect();
      setStatus('Element deleted');
    }
  });

  // Undo/Redo buttons
  $('#undo-btn').addEventListener('click', undo);
  $('#redo-btn').addEventListener('click', redo);

  $('#bring-front').addEventListener('click', () => {
    if (state.selectedIds.length > 0) {
      saveHistory();
      // Bring all selected elements to front (in order)
      state.selectedIds.forEach(id => {
        state.elements = bringToFront(state.elements, id);
      });
      render();
    }
  });

  $('#send-back').addEventListener('click', () => {
    if (state.selectedIds.length > 0) {
      saveHistory();
      // Send all selected elements to back (in reverse order)
      [...state.selectedIds].reverse().forEach(id => {
        state.elements = sendToBack(state.elements, id);
      });
      render();
    }
  });

  // Group/Ungroup
  $('#group-btn').addEventListener('click', handleGroup);
  $('#ungroup-btn').addEventListener('click', handleUngroup);

  // Save/Load
  $('#save-btn').addEventListener('click', showSaveDialog);
  $('#save-cancel').addEventListener('click', hideSaveDialog);
  $('#save-confirm').addEventListener('click', handleSave);
  $('#save-name').addEventListener('keydown', (e) => {
    if (e.key === 'Enter') handleSave();
  });

  $('#load-btn').addEventListener('click', showLoadDialog);
  $('#load-cancel').addEventListener('click', hideLoadDialog);

  // Import from file
  $('#import-file-btn').addEventListener('click', () => $('#import-file-input').click());
  $('#import-file-input').addEventListener('change', (e) => {
    if (e.target.files[0]) {
      handleImportFile(e.target.files[0]);
      e.target.value = '';
    }
  });

  // Export button
  $('#export-btn').addEventListener('click', handleExport);

  // Print progress cancel button
  $('#progress-cancel').addEventListener('click', () => {
    printProgressCancelled = true;
    $('#progress-subtitle').textContent = 'Cancelling...';
  });

  // Elements dropdown
  $('#elements-btn').addEventListener('click', (e) => {
    e.stopPropagation();
    updateElementsList();
    $('#elements-dropdown').classList.toggle('hidden');
  });

  // Close elements dropdown when clicking outside
  document.addEventListener('click', (e) => {
    if (!e.target.closest('#elements-btn') && !e.target.closest('#elements-dropdown')) {
      $('#elements-dropdown').classList.add('hidden');
    }
  });

  // Zoom controls
  $('#zoom-in').addEventListener('click', zoomIn);
  $('#zoom-out').addEventListener('click', zoomOut);
  $('#zoom-reset').addEventListener('click', zoomReset);

  // Mobile properties panel toggle
  const propsPanel = $('#props-panel');
  const propsBackdrop = $('#props-backdrop');
  const propsToggle = $('#props-toggle');
  const propsClose = $('#props-close');

  function openPropsPanel() {
    propsPanel.classList.add('panel-open');
    propsBackdrop.classList.add('backdrop-visible');
  }

  function closePropsPanel() {
    propsPanel.classList.remove('panel-open');
    propsBackdrop.classList.remove('backdrop-visible');
  }

  if (propsToggle) {
    propsToggle.addEventListener('click', openPropsPanel);
  }
  if (propsClose) {
    propsClose.addEventListener('click', closePropsPanel);
  }
  if (propsBackdrop) {
    propsBackdrop.addEventListener('click', closePropsPanel);
  }

  // Properties panel - common (only works for single selection)
  $('#prop-x').addEventListener('change', (e) => {
    const id = state.selectedIds[0];
    if (id) modifyElement(id, { x: parseFloat(e.target.value) || 0 });
  });
  $('#prop-y').addEventListener('change', (e) => {
    const id = state.selectedIds[0];
    if (id) modifyElement(id, { y: parseFloat(e.target.value) || 0 });
  });
  $('#prop-width').addEventListener('change', (e) => {
    const id = state.selectedIds[0];
    if (id) modifyElement(id, { width: Math.max(10, parseFloat(e.target.value) || 10) });
  });
  $('#prop-height').addEventListener('change', (e) => {
    const id = state.selectedIds[0];
    if (id) modifyElement(id, { height: Math.max(10, parseFloat(e.target.value) || 10) });
  });
  $('#prop-rotation').addEventListener('change', (e) => {
    const id = state.selectedIds[0];
    if (id) modifyElement(id, { rotation: parseFloat(e.target.value) || 0 });
  });

  // Properties panel - text
  $('#prop-text-content').addEventListener('input', (e) => {
    const id = state.selectedIds[0];
    if (id) modifyElement(id, { text: e.target.value });
  });
  $('#prop-font-family').addEventListener('change', (e) => {
    const id = state.selectedIds[0];
    if (id) modifyElement(id, { fontFamily: e.target.value });
  });
  $('#prop-font-size').addEventListener('input', (e) => {
    const id = state.selectedIds[0];
    const size = Math.max(6, Math.min(200, parseInt(e.target.value) || 24));
    if (id) modifyElement(id, { fontSize: size });
  });
  $$('.align-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const id = state.selectedIds[0];
      if (id) {
        modifyElement(id, { align: btn.dataset.align });
        $$('.align-btn').forEach(b => b.classList.toggle('bg-gray-100', b === btn));
      }
    });
  });

  // Vertical alignment buttons
  $$('.valign-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const id = state.selectedIds[0];
      if (id) {
        modifyElement(id, { verticalAlign: btn.dataset.valign });
        $$('.valign-btn').forEach(b => b.classList.toggle('bg-gray-100', b === btn));
      }
    });
  });

  // No wrap checkbox
  $('#prop-no-wrap').addEventListener('change', (e) => {
    const element = getSelected();
    if (element && element.type === 'text') {
      modifyElement(element.id, { noWrap: e.target.checked });
    }
  });

  // Clip overflow checkbox
  $('#prop-clip-overflow').addEventListener('change', (e) => {
    const element = getSelected();
    if (element && element.type === 'text') {
      modifyElement(element.id, { clipOverflow: e.target.checked });
    }
  });

  // Auto-scale checkbox
  $('#prop-auto-scale').addEventListener('change', (e) => {
    const element = getSelected();
    if (element && element.type === 'text') {
      modifyElement(element.id, { autoScale: e.target.checked });
    }
  });

  // Font style buttons (bold, italic, underline)
  $('#style-bold').addEventListener('click', () => {
    const element = getSelected();
    if (element && element.type === 'text') {
      const newWeight = element.fontWeight === 'bold' ? 'normal' : 'bold';
      modifyElement(element.id, { fontWeight: newWeight });
    }
  });

  $('#style-italic').addEventListener('click', () => {
    const element = getSelected();
    if (element && element.type === 'text') {
      const newStyle = element.fontStyle === 'italic' ? 'normal' : 'italic';
      modifyElement(element.id, { fontStyle: newStyle });
    }
  });

  $('#style-underline').addEventListener('click', () => {
    const element = getSelected();
    if (element && element.type === 'text') {
      const newDecoration = element.textDecoration === 'underline' ? 'none' : 'underline';
      modifyElement(element.id, { textDecoration: newDecoration });
    }
  });

  // Background buttons
  $$('.bg-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const element = getSelected();
      if (element && element.type === 'text') {
        modifyElement(element.id, { background: btn.dataset.bg });
        // Update button states
        $$('.bg-btn').forEach(b => {
          b.classList.toggle('bg-gray-100', b === btn);
          b.classList.toggle('ring-2', b === btn);
          b.classList.toggle('ring-blue-400', b === btn);
        });
      }
    });
  });

  // Text color buttons
  $$('.color-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const element = getSelected();
      if (element && element.type === 'text') {
        modifyElement(element.id, { color: btn.dataset.color });
        // Update button states
        $$('.color-btn').forEach(b => {
          b.classList.toggle('bg-gray-100', b === btn);
          b.classList.toggle('ring-2', b === btn);
          b.classList.toggle('ring-blue-400', b === btn);
        });
      }
    });
  });

  // Shape properties
  $('#prop-shape-type').addEventListener('change', (e) => {
    const element = getSelected();
    if (element && element.type === 'shape') {
      modifyElement(element.id, { shapeType: e.target.value });
      // Show/hide corner radius based on shape type
      $('#prop-corner-radius-group').classList.toggle('hidden', e.target.value !== 'rectangle');
    }
  });

  // Shape fill dropdown
  $('#shape-fill').addEventListener('change', (e) => {
    const element = getSelected();
    if (element && element.type === 'shape') {
      modifyElement(element.id, { fill: e.target.value });
    }
  });

  // Shape stroke buttons
  $$('.stroke-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const element = getSelected();
      if (element && element.type === 'shape') {
        modifyElement(element.id, { stroke: btn.dataset.stroke });
        $$('.stroke-btn').forEach(b => {
          b.classList.toggle('bg-gray-100', b === btn);
          b.classList.toggle('ring-2', b === btn);
          b.classList.toggle('ring-blue-400', b === btn);
        });
      }
    });
  });

  // Shape stroke width
  $('#prop-stroke-width').addEventListener('input', (e) => {
    const element = getSelected();
    if (element && element.type === 'shape') {
      modifyElement(element.id, { strokeWidth: parseInt(e.target.value) || 2 });
    }
  });

  // Shape corner radius
  $('#prop-corner-radius').addEventListener('input', (e) => {
    const element = getSelected();
    if (element && element.type === 'shape') {
      modifyElement(element.id, { cornerRadius: parseInt(e.target.value) || 0 });
    }
  });

  // Properties panel - image
  $('#prop-replace-image').addEventListener('click', () => $('#prop-image-input').click());
  $('#prop-image-input').addEventListener('change', async (e) => {
    const id = state.selectedIds[0];
    if (e.target.files[0] && id) {
      try {
        const { dataUrl } = await state.renderer.loadImageFile(e.target.files[0]);
        modifyElement(id, { imageData: dataUrl });
        setStatus('Image replaced');
      } catch (err) {
        setStatus('Failed to load image');
      }
      e.target.value = '';
    }
  });

  // Image scale slider
  const applyImageScale = (scalePercent) => {
    const element = getSelected();
    if (element && element.type === 'image') {
      const scale = scalePercent / 100;
      const newWidth = element.naturalWidth * scale;
      const newHeight = element.naturalHeight * scale;
      // Keep centered on current center point
      const cx = element.x + element.width / 2;
      const cy = element.y + element.height / 2;
      modifyElement(element.id, {
        width: newWidth,
        height: newHeight,
        x: cx - newWidth / 2,
        y: cy - newHeight / 2,
      });
    }
  };

  $('#prop-image-scale').addEventListener('input', (e) => {
    const scale = parseInt(e.target.value);
    $('#prop-image-scale-input').value = scale;
    applyImageScale(scale);
  });

  $('#prop-image-scale-input').addEventListener('change', (e) => {
    const scale = Math.max(10, Math.min(200, parseInt(e.target.value) || 100));
    $('#prop-image-scale').value = scale;
    $('#prop-image-scale-input').value = scale;
    applyImageScale(scale);
  });

  // Lock aspect ratio checkbox
  $('#prop-image-lock-ratio').addEventListener('change', (e) => {
    const element = getSelected();
    if (element && element.type === 'image') {
      modifyElement(element.id, { lockAspectRatio: e.target.checked });
    }
  });

  // Reset image to native size
  $('#prop-image-reset').addEventListener('click', () => {
    const element = getSelected();
    if (element && element.type === 'image') {
      const cx = element.x + element.width / 2;
      const cy = element.y + element.height / 2;
      modifyElement(element.id, {
        width: element.naturalWidth,
        height: element.naturalHeight,
        x: cx - element.naturalWidth / 2,
        y: cy - element.naturalHeight / 2,
      });
      setStatus('Image reset to native size');
    }
  });

  // Properties panel - barcode
  $('#prop-barcode-data').addEventListener('input', (e) => {
    const id = state.selectedIds[0];
    if (id) modifyElement(id, { barcodeData: e.target.value });
  });
  $('#prop-barcode-format').addEventListener('change', (e) => {
    const id = state.selectedIds[0];
    if (id) modifyElement(id, { barcodeFormat: e.target.value });
  });

  // Properties panel - QR
  $('#prop-qr-data').addEventListener('input', (e) => {
    const id = state.selectedIds[0];
    if (id) modifyElement(id, { qrData: e.target.value });
  });

  // Canvas mouse events
  canvas.addEventListener('mousedown', handleCanvasMouseDown);
  canvas.addEventListener('mousemove', handleCanvasMouseMove);
  canvas.addEventListener('mouseup', handleCanvasMouseUp);
  canvas.addEventListener('mouseleave', handleCanvasMouseUp);

  // Keyboard shortcuts
  document.addEventListener('keydown', handleKeyDown);

  // Template toolbar button - toggle template panel
  $('#template-toolbar-btn').addEventListener('click', toggleTemplatePanel);

  // Template panel close button
  $('#template-panel-close').addEventListener('click', () => {
    $('#template-panel').classList.add('hidden');
  });

  // Template panel: Manage Data button opens the dialog
  $('#template-manage-data').addEventListener('click', showTemplateDataDialog);

  // Template data dialog close
  $('#template-data-close').addEventListener('click', hideTemplateDataDialog);
  $('#template-data-dialog').addEventListener('click', (e) => {
    if (e.target === e.currentTarget) hideTemplateDataDialog();
  });

  // Template quick actions (properties panel)
  $('#template-quick-preview').addEventListener('click', showPreviewDialog);
  $('#template-quick-print').addEventListener('click', handleBatchPrint);

  // Template data actions
  $('#template-import-csv').addEventListener('click', () => $('#template-csv-input').click());
  $('#template-csv-input').addEventListener('change', (e) => {
    if (e.target.files[0]) {
      const reader = new FileReader();
      reader.onload = (evt) => {
        importCSVData(evt.target.result);
      };
      reader.readAsText(e.target.files[0]);
      e.target.value = '';
    }
  });
  $('#template-add-row').addEventListener('click', () => addTemplateRecord());
  $('#template-clear-all').addEventListener('click', () => {
    if (confirm('Clear all template data?')) {
      clearTemplateData();
    }
  });

  // Template preview
  $('#template-preview-btn').addEventListener('click', () => {
    hideTemplateDataDialog();
    showPreviewDialog();
  });
  $('#template-print-btn').addEventListener('click', handleBatchPrint);

  // Insert field buttons
  ['text', 'barcode', 'qr'].forEach(type => {
    // Toggle dropdown on button click
    $(`#insert-field-${type}`).addEventListener('click', (e) => {
      e.stopPropagation();
      toggleFieldDropdown(type);
    });

    // Handle new field input (Enter key)
    $(`#new-field-${type}`).addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        createAndInsertField(type, e.target.value);
      }
    });

    // Handle clicking on existing field options (delegated)
    $(`#field-list-${type}`).addEventListener('click', (e) => {
      const fieldOption = e.target.closest('.field-option');
      if (fieldOption) {
        const fieldName = fieldOption.dataset.field;
        insertFieldIntoInput(type, fieldName);
      }
    });
  });

  // Close dropdowns when clicking outside
  document.addEventListener('click', (e) => {
    if (!e.target.closest('[id^="field-dropdown-"]') && !e.target.closest('[id^="insert-field-"]')) {
      $$('[id^="field-dropdown-"]').forEach(d => d.classList.add('hidden'));
    }
  });

  // Preview dialog
  $('#preview-close').addEventListener('click', hidePreviewDialog);
  $('#preview-dialog').addEventListener('click', (e) => {
    if (e.target === e.currentTarget) hidePreviewDialog();
  });
  $('#preview-print-selected').addEventListener('click', () => {
    hidePreviewDialog();
    handleBatchPrint();
  });

  // Full preview dialog
  $('#full-preview-close').addEventListener('click', hideFullPreview);
  $('#full-preview-dialog').addEventListener('click', (e) => {
    if (e.target === e.currentTarget) hideFullPreview();
  });
  $('#full-preview-prev').addEventListener('click', () => navigatePreview(-1));
  $('#full-preview-next').addEventListener('click', () => navigatePreview(1));
  $('#full-preview-include').addEventListener('change', (e) => {
    const idx = state.currentPreviewIndex;
    if (e.target.checked) {
      if (!state.selectedRecords.includes(idx)) {
        state.selectedRecords.push(idx);
        state.selectedRecords.sort((a, b) => a - b);
      }
    } else {
      state.selectedRecords = state.selectedRecords.filter(i => i !== idx);
    }
  });
  $('#full-preview-print').addEventListener('click', handlePrintSinglePreview);

  // Initial render
  render();

  // Detect template fields on load
  detectTemplateFields();

  // Show info dialog on first visit
  if (shouldShowInfoOnLoad()) {
    showInfoDialog();
  }

  console.log('Phomymo Label Designer initialized');
}

// Initialize when DOM is ready
document.addEventListener('DOMContentLoaded', init);
