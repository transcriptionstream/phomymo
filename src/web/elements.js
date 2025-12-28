/**
 * Element system for Phomymo label designer
 * Handles creation, manipulation, and hit testing of label elements
 */

/**
 * Generate unique ID
 */
function generateId() {
  return 'el_' + Date.now().toString(36) + Math.random().toString(36).substr(2, 9);
}

/**
 * Create a text element
 */
export function createTextElement(text = 'Text', options = {}) {
  return {
    id: generateId(),
    type: 'text',
    x: options.x ?? 50,
    y: options.y ?? 50,
    width: options.width ?? 150,
    height: options.height ?? 40,
    rotation: options.rotation ?? 0,
    // Text-specific
    text: text,
    fontSize: options.fontSize ?? 24,
    color: options.color ?? 'black',              // 'black' or 'white'
    align: options.align ?? 'left',                 // horizontal: 'left', 'center', 'right'
    verticalAlign: options.verticalAlign ?? 'middle', // vertical: 'top', 'middle', 'bottom'
    fontFamily: options.fontFamily ?? 'Inter, sans-serif',
    fontWeight: options.fontWeight ?? 'normal',    // 'normal' or 'bold'
    fontStyle: options.fontStyle ?? 'normal',      // 'normal' or 'italic'
    textDecoration: options.textDecoration ?? 'none', // 'none' or 'underline'
    background: options.background ?? 'transparent', // 'transparent', 'white', or 'black'
    noWrap: options.noWrap ?? false,               // true = single line, no wrap
    clipOverflow: options.clipOverflow ?? false,   // true = clip text at box boundary
    autoScale: options.autoScale ?? false,         // true = auto-fit text to box size
  };
}

/**
 * Create an image element
 */
export function createImageElement(imageData, options = {}) {
  return {
    id: generateId(),
    type: 'image',
    x: options.x ?? 50,
    y: options.y ?? 50,
    width: options.width ?? 100,
    height: options.height ?? 100,
    rotation: options.rotation ?? 0,
    // Image-specific
    imageData: imageData, // Base64 data URL
    naturalWidth: options.naturalWidth ?? 100,
    naturalHeight: options.naturalHeight ?? 100,
    lockAspectRatio: options.lockAspectRatio ?? true,
  };
}

/**
 * Create a barcode element
 */
export function createBarcodeElement(data = '123456789012', options = {}) {
  return {
    id: generateId(),
    type: 'barcode',
    x: options.x ?? 50,
    y: options.y ?? 50,
    width: options.width ?? 180,
    height: options.height ?? 80,
    rotation: options.rotation ?? 0,
    // Barcode-specific
    barcodeData: data,
    barcodeFormat: options.barcodeFormat ?? 'CODE128',
  };
}

/**
 * Create a QR code element
 */
export function createQRElement(data = 'https://example.com', options = {}) {
  return {
    id: generateId(),
    type: 'qr',
    x: options.x ?? 50,
    y: options.y ?? 50,
    width: options.width ?? 100,
    height: options.height ?? 100,
    rotation: options.rotation ?? 0,
    // QR-specific
    qrData: data,
  };
}

/**
 * Create a shape element
 * @param {string} shapeType - 'rectangle', 'ellipse', 'line', 'triangle'
 * @param {object} options - Position, size, and shape-specific options
 */
export function createShapeElement(shapeType = 'rectangle', options = {}) {
  return {
    id: generateId(),
    type: 'shape',
    x: options.x ?? 50,
    y: options.y ?? 50,
    width: options.width ?? 80,
    height: options.height ?? 60,
    rotation: options.rotation ?? 0,
    // Shape-specific
    shapeType: shapeType,                         // 'rectangle', 'ellipse', 'line', 'triangle'
    fill: options.fill ?? 'black',                // 'white', 'black', 'dither-light', 'dither-medium', 'dither-dark'
    stroke: options.stroke ?? 'none',             // 'none', 'black', 'white'
    strokeWidth: options.strokeWidth ?? 2,        // Stroke width in pixels
    cornerRadius: options.cornerRadius ?? 0,      // For rounded rectangles
  };
}

/**
 * Update element properties
 */
export function updateElement(elements, id, changes) {
  return elements.map(el =>
    el.id === id ? { ...el, ...changes } : el
  );
}

/**
 * Delete element by ID
 */
export function deleteElement(elements, id) {
  return elements.filter(el => el.id !== id);
}

/**
 * Duplicate element with new ID and offset position
 */
export function duplicateElement(elements, id) {
  const original = elements.find(el => el.id === id);
  if (!original) return elements;

  const copy = {
    ...original,
    id: generateId(),
    x: original.x + 20,
    y: original.y + 20,
  };

  return [...elements, copy];
}

/**
 * Bring element to front (end of array = top of z-order)
 */
export function bringToFront(elements, id) {
  const el = elements.find(e => e.id === id);
  if (!el) return elements;
  return [...elements.filter(e => e.id !== id), el];
}

/**
 * Send element to back (start of array = bottom of z-order)
 */
export function sendToBack(elements, id) {
  const el = elements.find(e => e.id === id);
  if (!el) return elements;
  return [el, ...elements.filter(e => e.id !== id)];
}

/**
 * Move element up one level in z-order
 */
export function moveUp(elements, id) {
  const idx = elements.findIndex(e => e.id === id);
  if (idx < 0 || idx >= elements.length - 1) return elements;

  const result = [...elements];
  [result[idx], result[idx + 1]] = [result[idx + 1], result[idx]];
  return result;
}

/**
 * Move element down one level in z-order
 */
export function moveDown(elements, id) {
  const idx = elements.findIndex(e => e.id === id);
  if (idx <= 0) return elements;

  const result = [...elements];
  [result[idx], result[idx - 1]] = [result[idx - 1], result[idx]];
  return result;
}

/**
 * Get element bounds (axis-aligned bounding box considering rotation)
 */
export function getElementBounds(element) {
  const { x, y, width, height, rotation } = element;
  const cx = x + width / 2;
  const cy = y + height / 2;

  if (rotation === 0) {
    return { x, y, width, height, cx, cy };
  }

  // Calculate rotated corners
  const rad = (rotation * Math.PI) / 180;
  const cos = Math.cos(rad);
  const sin = Math.sin(rad);

  const corners = [
    { x: -width / 2, y: -height / 2 },
    { x: width / 2, y: -height / 2 },
    { x: width / 2, y: height / 2 },
    { x: -width / 2, y: height / 2 },
  ];

  const rotated = corners.map(c => ({
    x: cx + c.x * cos - c.y * sin,
    y: cy + c.x * sin + c.y * cos,
  }));

  const xs = rotated.map(c => c.x);
  const ys = rotated.map(c => c.y);

  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  const minY = Math.min(...ys);
  const maxY = Math.max(...ys);

  return {
    x: minX,
    y: minY,
    width: maxX - minX,
    height: maxY - minY,
    cx,
    cy,
  };
}

/**
 * Check if point is inside element (considering rotation)
 */
export function pointInElement(px, py, element) {
  const { x, y, width, height, rotation } = element;
  const cx = x + width / 2;
  const cy = y + height / 2;

  // Transform point to element's local coordinate system
  const rad = (-rotation * Math.PI) / 180;
  const cos = Math.cos(rad);
  const sin = Math.sin(rad);

  // Translate point relative to element center
  const dx = px - cx;
  const dy = py - cy;

  // Rotate point
  const localX = dx * cos - dy * sin;
  const localY = dx * sin + dy * cos;

  // Check if point is within element bounds (centered at origin)
  return (
    localX >= -width / 2 &&
    localX <= width / 2 &&
    localY >= -height / 2 &&
    localY <= height / 2
  );
}

/**
 * Get element at point (returns topmost element)
 */
export function getElementAtPoint(px, py, elements) {
  // Iterate in reverse order (top to bottom)
  for (let i = elements.length - 1; i >= 0; i--) {
    if (pointInElement(px, py, elements[i])) {
      return elements[i];
    }
  }
  return null;
}

/**
 * Minimum sizes for each element type
 */
export const MIN_SIZES = {
  text: { width: 50, height: 20 },
  image: { width: 30, height: 30 },
  barcode: { width: 80, height: 40 },
  qr: { width: 50, height: 50 },
  shape: { width: 10, height: 10 },
};

/**
 * Constrain element size to minimum
 */
export function constrainSize(element) {
  const min = MIN_SIZES[element.type] || { width: 20, height: 20 };
  return {
    ...element,
    width: Math.max(element.width, min.width),
    height: Math.max(element.height, min.height),
  };
}

/**
 * Clone element with new ID
 */
export function cloneElement(element) {
  return {
    ...element,
    id: generateId(),
  };
}

/**
 * Generate unique group ID
 */
function generateGroupId() {
  return 'grp_' + Date.now().toString(36) + Math.random().toString(36).substr(2, 9);
}

/**
 * Group multiple elements together
 * @param {Array} elements - All elements
 * @param {Array} ids - IDs of elements to group
 * @returns {Object} { elements, groupId }
 */
export function groupElements(elements, ids) {
  if (ids.length < 2) return { elements, groupId: null };

  const groupId = generateGroupId();
  const updatedElements = elements.map(el =>
    ids.includes(el.id) ? { ...el, groupId } : el
  );

  return { elements: updatedElements, groupId };
}

/**
 * Ungroup elements by removing their groupId
 * @param {Array} elements - All elements
 * @param {string} groupId - Group ID to ungroup
 */
export function ungroupElements(elements, groupId) {
  return elements.map(el =>
    el.groupId === groupId ? { ...el, groupId: null } : el
  );
}

/**
 * Get all elements in a group
 */
export function getGroupMembers(elements, groupId) {
  if (!groupId) return [];
  return elements.filter(el => el.groupId === groupId);
}

/**
 * Get the group ID for an element (if any)
 */
export function getElementGroupId(elements, elementId) {
  const el = elements.find(e => e.id === elementId);
  return el?.groupId || null;
}

/**
 * Get all elements in the same group as the given element
 */
export function getGroupMembersForElement(elements, elementId) {
  const groupId = getElementGroupId(elements, elementId);
  if (!groupId) return [];
  return getGroupMembers(elements, groupId);
}

/**
 * Get bounding box that encompasses multiple elements
 * @param {Array} elementsToMeasure - Elements to measure
 * @returns {Object} { x, y, width, height, cx, cy }
 */
export function getMultiElementBounds(elementsToMeasure) {
  if (!elementsToMeasure || elementsToMeasure.length === 0) {
    return null;
  }

  if (elementsToMeasure.length === 1) {
    return getElementBounds(elementsToMeasure[0]);
  }

  // Get bounds of all elements
  const allBounds = elementsToMeasure.map(el => getElementBounds(el));

  const minX = Math.min(...allBounds.map(b => b.x));
  const minY = Math.min(...allBounds.map(b => b.y));
  const maxX = Math.max(...allBounds.map(b => b.x + b.width));
  const maxY = Math.max(...allBounds.map(b => b.y + b.height));

  const width = maxX - minX;
  const height = maxY - minY;

  return {
    x: minX,
    y: minY,
    width,
    height,
    cx: minX + width / 2,
    cy: minY + height / 2,
  };
}

/**
 * Get all unique group IDs from elements
 */
export function getAllGroupIds(elements) {
  const groupIds = new Set();
  elements.forEach(el => {
    if (el.groupId) groupIds.add(el.groupId);
  });
  return Array.from(groupIds);
}

/**
 * Move multiple elements by delta
 */
export function moveElements(elements, ids, dx, dy) {
  return elements.map(el =>
    ids.includes(el.id) ? { ...el, x: el.x + dx, y: el.y + dy } : el
  );
}

/**
 * Scale multiple elements proportionally from a center point
 * @param {Array} elements - All elements
 * @param {Array} ids - IDs of elements to scale
 * @param {number} scaleX - X scale factor
 * @param {number} scaleY - Y scale factor
 * @param {Object} center - Center point { x, y } to scale from
 */
export function scaleElements(elements, ids, scaleX, scaleY, center) {
  return elements.map(el => {
    if (!ids.includes(el.id)) return el;

    // Get element center
    const elCx = el.x + el.width / 2;
    const elCy = el.y + el.height / 2;

    // Calculate new center position (scaled from group center)
    const newCx = center.x + (elCx - center.x) * scaleX;
    const newCy = center.y + (elCy - center.y) * scaleY;

    // Calculate new size
    const newWidth = el.width * scaleX;
    const newHeight = el.height * scaleY;

    // Calculate new top-left position
    const newX = newCx - newWidth / 2;
    const newY = newCy - newHeight / 2;

    return {
      ...el,
      x: newX,
      y: newY,
      width: Math.max(newWidth, 10),
      height: Math.max(newHeight, 10),
    };
  });
}

/**
 * Rotate multiple elements around a center point
 * @param {Array} elements - All elements
 * @param {Array} ids - IDs of elements to rotate
 * @param {number} angleDelta - Angle change in degrees
 * @param {Object} center - Center point { x, y } to rotate around
 */
export function rotateElements(elements, ids, angleDelta, center) {
  const rad = (angleDelta * Math.PI) / 180;
  const cos = Math.cos(rad);
  const sin = Math.sin(rad);

  return elements.map(el => {
    if (!ids.includes(el.id)) return el;

    // Get element center
    const elCx = el.x + el.width / 2;
    const elCy = el.y + el.height / 2;

    // Rotate element center around group center
    const dx = elCx - center.x;
    const dy = elCy - center.y;
    const newCx = center.x + dx * cos - dy * sin;
    const newCy = center.y + dx * sin + dy * cos;

    // Calculate new top-left position
    const newX = newCx - el.width / 2;
    const newY = newCy - el.height / 2;

    // Add angle to element's own rotation
    let newRotation = (el.rotation || 0) + angleDelta;
    // Normalize to 0-360
    while (newRotation < 0) newRotation += 360;
    while (newRotation >= 360) newRotation -= 360;

    return {
      ...el,
      x: newX,
      y: newY,
      rotation: newRotation,
    };
  });
}
