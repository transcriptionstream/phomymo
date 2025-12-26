/**
 * Phomymo Label Designer Application
 * Multi-element label editor with drag, resize, and rotate
 */

import { CanvasRenderer } from './canvas.js?v=8';
import { BLETransport } from './ble.js?v=10';
import { USBTransport } from './usb.js?v=3';
import { print, printDensityTest } from './printer.js?v=6';
import {
  createTextElement,
  createImageElement,
  createBarcodeElement,
  createQRElement,
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
} from './elements.js?v=6';
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
} from './handles.js?v=4';
import {
  saveDesign,
  loadDesign,
  listDesigns,
  deleteDesign,
} from './storage.js?v=3';

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
};

/**
 * Update status message
 */
function setStatus(message) {
  $('#status-message').textContent = message;
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
  const contentKeys = ['width', 'height', 'text', 'fontSize', 'fontFamily', 'fontWeight', 'fontStyle', 'textDecoration', 'imageData', 'barcodeData', 'barcodeFormat', 'qrData'];
  const needsCacheClear = Object.keys(changes).some(key => contentKeys.includes(key));
  if (needsCacheClear) {
    state.renderer.clearCache(id);
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

  // Show and populate type-specific panel
  switch (element.type) {
    case 'text':
      $('#props-text').classList.remove('hidden');
      $('#prop-text-content').value = element.text || '';
      $('#prop-font-family').value = element.fontFamily || 'Inter, sans-serif';
      $('#prop-font-size').value = element.fontSize || 24;
      // Update alignment buttons
      $$('.align-btn').forEach(btn => {
        btn.classList.toggle('bg-gray-100', btn.dataset.align === element.align);
      });
      // Update style buttons
      $('#style-bold').classList.toggle('bg-gray-200', element.fontWeight === 'bold');
      $('#style-italic').classList.toggle('bg-gray-200', element.fontStyle === 'italic');
      $('#style-underline').classList.toggle('bg-gray-200', element.textDecoration === 'underline');
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
        // Multi-element proportional resize - always scale from original positions
        const { scaleX, scaleY } = calculateGroupResize(
          state.dragStartBounds,
          state.dragHandle,
          dx, dy,
          e.shiftKey
        );
        // Apply scale to original elements, not current state
        const scaledElements = state.dragStartElements.map(origEl => {
          const elCx = origEl.x + origEl.width / 2;
          const elCy = origEl.y + origEl.height / 2;
          const centerX = state.dragStartBounds.cx;
          const centerY = state.dragStartBounds.cy;

          // Scale position relative to group center
          const newCx = centerX + (elCx - centerX) * scaleX;
          const newCy = centerY + (elCy - centerY) * scaleY;

          // Scale size
          const newWidth = Math.max(origEl.width * scaleX, 10);
          const newHeight = Math.max(origEl.height * scaleY, 10);

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

    state.elements.push(element);
    selectElement(element.id);
    setStatus(scale < 1 ? `Image scaled to ${Math.round(scale * 100)}%` : 'Image added at native size');
  } catch (e) {
    console.error('Failed to load image:', e);
    setStatus('Failed to load image');
  }
}

/**
 * Add a new barcode element
 */
function addBarcodeElement() {
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
 * Handle connect button click
 */
async function handleConnect() {
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
    saveDesign(name, {
      elements: state.elements,
      labelSize: state.labelSize,
    });
    hideSaveDialog();
    setStatus(`Design "${name}" saved`);
  } catch (e) {
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
    listEl.innerHTML = designs.map(d => `
      <div class="design-item flex items-center justify-between p-3 hover:bg-gray-50 rounded-lg cursor-pointer border border-gray-100 mb-2" data-name="${d.name}">
        <div>
          <div class="font-medium text-sm text-gray-900">${d.name}</div>
          <div class="text-xs text-gray-400">${d.labelSize.width}x${d.labelSize.height}mm - ${d.elementCount} elements</div>
        </div>
        <button class="delete-design text-red-500 hover:text-red-700 text-xs px-2 py-1" data-name="${d.name}">Delete</button>
      </div>
    `).join('');

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
  updatePrintSize();
  updateToolbarState();
  updatePropertiesPanel();
  render();

  hideLoadDialog();
  setStatus(`Loaded "${name}"`);
}

/**
 * Handle keyboard shortcuts
 */
function handleKeyDown(e) {
  const selectedElements = getSelectedElements();
  const hasSelection = selectedElements.length > 0;

  // Delete key - delete all selected elements
  if (e.key === 'Delete' || e.key === 'Backspace') {
    if (hasSelection && document.activeElement.tagName !== 'INPUT' && document.activeElement.tagName !== 'TEXTAREA') {
      e.preventDefault();
      // Delete all selected elements
      state.selectedIds.forEach(id => {
        state.elements = deleteElement(state.elements, id);
      });
      deselect();
      setStatus(selectedElements.length > 1 ? `${selectedElements.length} elements deleted` : 'Element deleted');
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
    setStatus('Select at least 2 elements to group');
    return;
  }

  // Check if any are already grouped
  if (selectedElements.some(e => e.groupId)) {
    setStatus('Cannot group elements that are already grouped');
    return;
  }

  const result = groupElements(state.elements, state.selectedIds);
  state.elements = result.elements;
  render();
  updateToolbarState();
  setStatus('Elements grouped');
}

/**
 * Ungroup selected elements
 */
function handleUngroup() {
  const selectedElements = getSelectedElements();
  const groupIds = new Set(selectedElements.map(e => e.groupId).filter(Boolean));

  if (groupIds.size === 0) {
    setStatus('No groups to ungroup');
    return;
  }

  // Ungroup all selected groups
  groupIds.forEach(groupId => {
    state.elements = ungroupElements(state.elements, groupId);
  });

  render();
  updateToolbarState();
  setStatus('Elements ungrouped');
}

/**
 * Check browser compatibility
 */
function checkCompatibility() {
  const errors = [];

  if (!window.isSecureContext) {
    errors.push('HTTPS required - this app must be served over a secure connection');
  }

  if (!('bluetooth' in navigator)) {
    errors.push('Web Bluetooth not supported - please use Chrome, Edge, or Opera');
  }

  if (!('usb' in navigator)) {
    console.warn('WebUSB not supported - USB printing will not be available');
  }

  if (errors.length > 0) {
    const overlay = document.createElement('div');
    overlay.className = 'fixed inset-0 bg-gray-900 bg-opacity-90 flex items-center justify-center z-50';
    overlay.innerHTML = `
      <div class="bg-white rounded-xl p-8 max-w-md mx-4 text-center">
        <div class="text-red-500 text-5xl mb-4">!</div>
        <h2 class="text-xl font-semibold text-gray-900 mb-4">Browser Not Supported</h2>
        <div class="text-gray-600 space-y-2 mb-6">
          ${errors.map(e => `<p>${e}</p>`).join('')}
        </div>
        <div class="text-sm text-gray-500">
          <p class="mb-2"><strong>Recommended:</strong> Chrome on desktop</p>
          <p>Make sure you're accessing via HTTPS</p>
        </div>
      </div>
    `;
    document.body.appendChild(overlay);
    return false;
  }

  return true;
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

  // Element actions
  $('#duplicate-btn').addEventListener('click', () => {
    const selected = getSelected();
    if (selected) {
      state.elements = duplicateElement(state.elements, selected.id);
      selectElement(state.elements[state.elements.length - 1].id);
      setStatus('Element duplicated');
    }
  });

  $('#delete-btn').addEventListener('click', () => {
    const selected = getSelected();
    if (selected) {
      state.elements = deleteElement(state.elements, selected.id);
      deselect();
      setStatus('Element deleted');
    }
  });

  $('#bring-front').addEventListener('click', () => {
    if (state.selectedIds.length > 0) {
      // Bring all selected elements to front (in order)
      state.selectedIds.forEach(id => {
        state.elements = bringToFront(state.elements, id);
      });
      render();
    }
  });

  $('#send-back').addEventListener('click', () => {
    if (state.selectedIds.length > 0) {
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

  // Zoom controls
  $('#zoom-in').addEventListener('click', zoomIn);
  $('#zoom-out').addEventListener('click', zoomOut);
  $('#zoom-reset').addEventListener('click', zoomReset);

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
  $('#prop-font-size').addEventListener('change', (e) => {
    const id = state.selectedIds[0];
    if (id) modifyElement(id, { fontSize: parseInt(e.target.value) || 24 });
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

  // Initial render
  render();

  // Show info dialog on first visit
  if (shouldShowInfoOnLoad()) {
    showInfoDialog();
  }

  console.log('Phomymo Label Designer initialized');
}

// Initialize when DOM is ready
document.addEventListener('DOMContentLoaded', init);
