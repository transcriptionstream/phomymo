/**
 * Selection handles and transform system for Phomymo label designer
 * Provides resize corners/edges and rotation handle
 */

import { HANDLES } from './constants.js';

// Use constants for handle configuration
const HANDLE_SIZE = HANDLES.SIZE;
const ROTATION_HANDLE_DISTANCE = HANDLES.ROTATION_DISTANCE;
const ROTATION_HANDLE_RADIUS = HANDLES.ROTATION_RADIUS;

// Handle types
export const HandleType = {
  NONE: 'none',
  MOVE: 'move',
  ROTATE: 'rotate',
  // Resize handles
  NW: 'nw',  // top-left
  N: 'n',    // top-center
  NE: 'ne',  // top-right
  E: 'e',    // right-center
  SE: 'se',  // bottom-right
  S: 's',    // bottom-center
  SW: 'sw',  // bottom-left
  W: 'w',    // left-center
};

/**
 * Get handle positions for an element (in canvas coordinates)
 */
export function getHandlePositions(element) {
  const { x, y, width, height, rotation } = element;
  const cx = x + width / 2;
  const cy = y + height / 2;
  const rad = (rotation * Math.PI) / 180;

  // Local positions (relative to center, before rotation)
  const localPositions = {
    [HandleType.NW]: { x: -width / 2, y: -height / 2 },
    [HandleType.N]: { x: 0, y: -height / 2 },
    [HandleType.NE]: { x: width / 2, y: -height / 2 },
    [HandleType.E]: { x: width / 2, y: 0 },
    [HandleType.SE]: { x: width / 2, y: height / 2 },
    [HandleType.S]: { x: 0, y: height / 2 },
    [HandleType.SW]: { x: -width / 2, y: height / 2 },
    [HandleType.W]: { x: -width / 2, y: 0 },
    [HandleType.ROTATE]: { x: 0, y: -height / 2 - ROTATION_HANDLE_DISTANCE },
  };

  // Rotate and translate to canvas coordinates
  const cos = Math.cos(rad);
  const sin = Math.sin(rad);
  const positions = {};

  for (const [type, local] of Object.entries(localPositions)) {
    positions[type] = {
      x: cx + local.x * cos - local.y * sin,
      y: cy + local.x * sin + local.y * cos,
    };
  }

  return positions;
}

/**
 * Check if point is on a handle
 * Returns the handle type or null
 */
export function getHandleAtPoint(px, py, element) {
  const positions = getHandlePositions(element);

  // Check rotation handle first (it's further away)
  const rotatePos = positions[HandleType.ROTATE];
  const rotDist = Math.hypot(px - rotatePos.x, py - rotatePos.y);
  if (rotDist <= ROTATION_HANDLE_RADIUS + 2) {
    return HandleType.ROTATE;
  }

  // Check resize handles
  const resizeHandles = [
    HandleType.NW, HandleType.N, HandleType.NE,
    HandleType.E, HandleType.SE, HandleType.S,
    HandleType.SW, HandleType.W,
  ];

  for (const type of resizeHandles) {
    const pos = positions[type];
    const dist = Math.hypot(px - pos.x, py - pos.y);
    if (dist <= HANDLE_SIZE / 2 + HANDLES.HIT_AREA_PADDING) {
      return type;
    }
  }

  return null;
}

/**
 * Draw selection handles on canvas
 */
export function drawHandles(ctx, element) {
  const positions = getHandlePositions(element);
  const { x, y, width, height, rotation } = element;

  ctx.save();

  // Translate to element center and rotate
  const cx = x + width / 2;
  const cy = y + height / 2;
  ctx.translate(cx, cy);
  ctx.rotate((rotation * Math.PI) / 180);

  // Draw selection rectangle
  ctx.strokeStyle = '#3b82f6';
  ctx.lineWidth = 1;
  ctx.setLineDash([]);
  ctx.strokeRect(-width / 2, -height / 2, width, height);

  // Draw line to rotation handle
  ctx.beginPath();
  ctx.moveTo(0, -height / 2);
  ctx.lineTo(0, -height / 2 - ROTATION_HANDLE_DISTANCE);
  ctx.stroke();

  ctx.restore();

  // Draw resize handles (in canvas coordinates, not rotated context)
  ctx.fillStyle = '#ffffff';
  ctx.strokeStyle = '#3b82f6';
  ctx.lineWidth = 1.5;

  const resizeHandles = [
    HandleType.NW, HandleType.N, HandleType.NE,
    HandleType.E, HandleType.SE, HandleType.S,
    HandleType.SW, HandleType.W,
  ];

  for (const type of resizeHandles) {
    const pos = positions[type];
    ctx.beginPath();
    ctx.rect(
      pos.x - HANDLE_SIZE / 2,
      pos.y - HANDLE_SIZE / 2,
      HANDLE_SIZE,
      HANDLE_SIZE
    );
    ctx.fill();
    ctx.stroke();
  }

  // Draw rotation handle (circle)
  const rotPos = positions[HandleType.ROTATE];
  ctx.beginPath();
  ctx.arc(rotPos.x, rotPos.y, ROTATION_HANDLE_RADIUS, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();

  // Add rotation icon inside
  ctx.save();
  ctx.translate(rotPos.x, rotPos.y);
  ctx.strokeStyle = '#3b82f6';
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.arc(0, 0, 3, -Math.PI * 0.7, Math.PI * 0.4);
  ctx.stroke();
  // Arrow head
  ctx.beginPath();
  ctx.moveTo(2, -2);
  ctx.lineTo(3, 1);
  ctx.lineTo(0, 0);
  ctx.closePath();
  ctx.fillStyle = '#3b82f6';
  ctx.fill();
  ctx.restore();
}

/**
 * Get cursor style for a handle type
 */
export function getCursorForHandle(handleType, rotation = 0) {
  if (handleType === HandleType.ROTATE) {
    return 'grab';
  }

  if (handleType === HandleType.MOVE) {
    return 'move';
  }

  // Adjust cursor based on rotation
  const cursors = {
    [HandleType.N]: 'ns-resize',
    [HandleType.S]: 'ns-resize',
    [HandleType.E]: 'ew-resize',
    [HandleType.W]: 'ew-resize',
    [HandleType.NE]: 'nesw-resize',
    [HandleType.SW]: 'nesw-resize',
    [HandleType.NW]: 'nwse-resize',
    [HandleType.SE]: 'nwse-resize',
  };

  // For more accurate cursor based on rotation, we'd need to map
  // the rotated handle to the appropriate cursor. For now, use base cursor.
  return cursors[handleType] || 'default';
}

/**
 * Calculate new element bounds after resize
 * Properly handles rotated elements by anchoring the opposite corner/edge
 * @param {object} element - Original element
 * @param {string} handleType - Which handle is being dragged
 * @param {number} dx - Mouse delta X (canvas coordinates)
 * @param {number} dy - Mouse delta Y (canvas coordinates)
 * @param {boolean} preserveAspect - Maintain aspect ratio (Shift key)
 */
export function calculateResize(element, handleType, dx, dy, preserveAspect = false) {
  const { x, y, width, height, rotation } = element;
  const rad = (rotation * Math.PI) / 180;
  const cos = Math.cos(rad);
  const sin = Math.sin(rad);

  // Element center
  const cx = x + width / 2;
  const cy = y + height / 2;

  // Transform mouse delta to element's local coordinate system (unrotated)
  const localDx = dx * cos + dy * sin;
  const localDy = -dx * sin + dy * cos;

  // Calculate new dimensions and anchor offset based on handle type
  // Anchor offset is in local coordinates, relative to center
  let newWidth = width;
  let newHeight = height;
  let anchorLocalX = 0; // Local X of the point that should stay fixed
  let anchorLocalY = 0; // Local Y of the point that should stay fixed

  switch (handleType) {
    case HandleType.E: // Anchor west edge
      newWidth = width + localDx;
      anchorLocalX = -width / 2;
      anchorLocalY = 0;
      break;
    case HandleType.W: // Anchor east edge
      newWidth = width - localDx;
      anchorLocalX = width / 2;
      anchorLocalY = 0;
      break;
    case HandleType.S: // Anchor north edge
      newHeight = height + localDy;
      anchorLocalX = 0;
      anchorLocalY = -height / 2;
      break;
    case HandleType.N: // Anchor south edge
      newHeight = height - localDy;
      anchorLocalX = 0;
      anchorLocalY = height / 2;
      break;
    case HandleType.SE: // Anchor NW corner
      newWidth = width + localDx;
      newHeight = height + localDy;
      anchorLocalX = -width / 2;
      anchorLocalY = -height / 2;
      break;
    case HandleType.NW: // Anchor SE corner
      newWidth = width - localDx;
      newHeight = height - localDy;
      anchorLocalX = width / 2;
      anchorLocalY = height / 2;
      break;
    case HandleType.NE: // Anchor SW corner
      newWidth = width + localDx;
      newHeight = height - localDy;
      anchorLocalX = -width / 2;
      anchorLocalY = height / 2;
      break;
    case HandleType.SW: // Anchor NE corner
      newWidth = width - localDx;
      newHeight = height + localDy;
      anchorLocalX = width / 2;
      anchorLocalY = -height / 2;
      break;
  }

  // Enforce minimum size
  newWidth = Math.max(newWidth, 10);
  newHeight = Math.max(newHeight, 10);

  // Apply aspect ratio constraint
  // For images, use natural dimensions; otherwise use current dimensions
  const aspect = (element.naturalWidth && element.naturalHeight)
    ? element.naturalWidth / element.naturalHeight
    : width / height;
  if (preserveAspect) {
    const isCorner = handleType === HandleType.NW || handleType === HandleType.NE ||
                     handleType === HandleType.SE || handleType === HandleType.SW;
    const isHorizontalSide = handleType === HandleType.E || handleType === HandleType.W;
    const isVerticalSide = handleType === HandleType.N || handleType === HandleType.S;

    if (isCorner) {
      // Corner handles: use dominant drag direction
      if (Math.abs(localDx) > Math.abs(localDy)) {
        newHeight = newWidth / aspect;
      } else {
        newWidth = newHeight * aspect;
      }
    } else if (isHorizontalSide) {
      // Horizontal side handles: width drives height
      newHeight = newWidth / aspect;
    } else if (isVerticalSide) {
      // Vertical side handles: height drives width
      newWidth = newHeight * aspect;
    }
  }

  // Calculate anchor point in world coordinates (before resize)
  const anchorWorldX = cx + anchorLocalX * cos - anchorLocalY * sin;
  const anchorWorldY = cy + anchorLocalX * sin + anchorLocalY * cos;

  // Calculate where the anchor should be in the NEW element's local coordinates
  let newAnchorLocalX, newAnchorLocalY;
  switch (handleType) {
    case HandleType.E:
      newAnchorLocalX = -newWidth / 2;
      newAnchorLocalY = 0;
      break;
    case HandleType.W:
      newAnchorLocalX = newWidth / 2;
      newAnchorLocalY = 0;
      break;
    case HandleType.S:
      newAnchorLocalX = 0;
      newAnchorLocalY = -newHeight / 2;
      break;
    case HandleType.N:
      newAnchorLocalX = 0;
      newAnchorLocalY = newHeight / 2;
      break;
    case HandleType.SE:
      newAnchorLocalX = -newWidth / 2;
      newAnchorLocalY = -newHeight / 2;
      break;
    case HandleType.NW:
      newAnchorLocalX = newWidth / 2;
      newAnchorLocalY = newHeight / 2;
      break;
    case HandleType.NE:
      newAnchorLocalX = -newWidth / 2;
      newAnchorLocalY = newHeight / 2;
      break;
    case HandleType.SW:
      newAnchorLocalX = newWidth / 2;
      newAnchorLocalY = -newHeight / 2;
      break;
  }

  // Calculate new center such that anchor point stays in place
  // anchorWorld = newCenter + rotate(newAnchorLocal)
  // newCenter = anchorWorld - rotate(newAnchorLocal)
  const newCx = anchorWorldX - (newAnchorLocalX * cos - newAnchorLocalY * sin);
  const newCy = anchorWorldY - (newAnchorLocalX * sin + newAnchorLocalY * cos);

  // Calculate new top-left position
  const newX = newCx - newWidth / 2;
  const newY = newCy - newHeight / 2;

  return {
    x: newX,
    y: newY,
    width: newWidth,
    height: newHeight,
  };
}

/**
 * Calculate rotation angle from drag
 * @param {object} element - Element being rotated
 * @param {number} mouseX - Current mouse X
 * @param {number} mouseY - Current mouse Y
 */
export function calculateRotation(element, mouseX, mouseY) {
  const cx = element.x + element.width / 2;
  const cy = element.y + element.height / 2;

  // Angle from center to mouse position
  const angle = Math.atan2(mouseY - cy, mouseX - cx);

  // Convert to degrees, offset by 90 (handle is at top)
  let degrees = (angle * 180) / Math.PI + 90;

  // Normalize to 0-360
  while (degrees < 0) degrees += 360;
  while (degrees >= 360) degrees -= 360;

  return degrees;
}

/**
 * Snap rotation to 15-degree increments
 */
export function snapRotation(degrees, snap = true) {
  if (!snap) return degrees;

  const snapAngle = 15;
  return Math.round(degrees / snapAngle) * snapAngle;
}

/**
 * Get handle positions for a group bounding box (no rotation)
 * @param {Object} bounds - { x, y, width, height, cx, cy }
 */
export function getGroupHandlePositions(bounds) {
  const { x, y, width, height } = bounds;
  const cx = x + width / 2;
  const cy = y + height / 2;

  return {
    [HandleType.NW]: { x: x, y: y },
    [HandleType.N]: { x: cx, y: y },
    [HandleType.NE]: { x: x + width, y: y },
    [HandleType.E]: { x: x + width, y: cy },
    [HandleType.SE]: { x: x + width, y: y + height },
    [HandleType.S]: { x: cx, y: y + height },
    [HandleType.SW]: { x: x, y: y + height },
    [HandleType.W]: { x: x, y: cy },
    [HandleType.ROTATE]: { x: cx, y: y - ROTATION_HANDLE_DISTANCE },
  };
}

/**
 * Check if point is on a group handle
 * @param {number} px - Point X
 * @param {number} py - Point Y
 * @param {Object} bounds - Group bounding box
 */
export function getGroupHandleAtPoint(px, py, bounds) {
  const positions = getGroupHandlePositions(bounds);

  // Check rotation handle first
  const rotatePos = positions[HandleType.ROTATE];
  const rotDist = Math.hypot(px - rotatePos.x, py - rotatePos.y);
  if (rotDist <= ROTATION_HANDLE_RADIUS + 2) {
    return HandleType.ROTATE;
  }

  // Check resize handles
  const resizeHandles = [
    HandleType.NW, HandleType.N, HandleType.NE,
    HandleType.E, HandleType.SE, HandleType.S,
    HandleType.SW, HandleType.W,
  ];

  for (const type of resizeHandles) {
    const pos = positions[type];
    const dist = Math.hypot(px - pos.x, py - pos.y);
    if (dist <= HANDLE_SIZE / 2 + HANDLES.HIT_AREA_PADDING) {
      return type;
    }
  }

  return null;
}

/**
 * Draw handles for a group bounding box
 * @param {CanvasRenderingContext2D} ctx
 * @param {Object} bounds - { x, y, width, height }
 */
export function drawGroupHandles(ctx, bounds) {
  const { x, y, width, height } = bounds;
  const positions = getGroupHandlePositions(bounds);

  ctx.save();

  // Draw dashed selection rectangle (to differentiate from single element)
  ctx.strokeStyle = '#3b82f6';
  ctx.lineWidth = 1.5;
  ctx.setLineDash([4, 4]);
  ctx.strokeRect(x, y, width, height);
  ctx.setLineDash([]);

  // Draw line to rotation handle
  ctx.beginPath();
  ctx.moveTo(x + width / 2, y);
  ctx.lineTo(x + width / 2, y - ROTATION_HANDLE_DISTANCE);
  ctx.stroke();

  // Draw resize handles
  ctx.fillStyle = '#ffffff';
  ctx.strokeStyle = '#3b82f6';
  ctx.lineWidth = 1.5;

  const resizeHandles = [
    HandleType.NW, HandleType.N, HandleType.NE,
    HandleType.E, HandleType.SE, HandleType.S,
    HandleType.SW, HandleType.W,
  ];

  for (const type of resizeHandles) {
    const pos = positions[type];
    ctx.beginPath();
    ctx.rect(
      pos.x - HANDLE_SIZE / 2,
      pos.y - HANDLE_SIZE / 2,
      HANDLE_SIZE,
      HANDLE_SIZE
    );
    ctx.fill();
    ctx.stroke();
  }

  // Draw rotation handle (circle)
  const rotPos = positions[HandleType.ROTATE];
  ctx.beginPath();
  ctx.arc(rotPos.x, rotPos.y, ROTATION_HANDLE_RADIUS, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();

  // Add rotation icon inside
  ctx.save();
  ctx.translate(rotPos.x, rotPos.y);
  ctx.strokeStyle = '#3b82f6';
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.arc(0, 0, 3, -Math.PI * 0.7, Math.PI * 0.4);
  ctx.stroke();
  // Arrow head
  ctx.beginPath();
  ctx.moveTo(2, -2);
  ctx.lineTo(3, 1);
  ctx.lineTo(0, 0);
  ctx.closePath();
  ctx.fillStyle = '#3b82f6';
  ctx.fill();
  ctx.restore();

  ctx.restore();
}

/**
 * Calculate scale factors for group resize
 * @param {Object} bounds - Original bounds { x, y, width, height }
 * @param {string} handleType - Which handle is being dragged
 * @param {number} dx - Mouse delta X
 * @param {number} dy - Mouse delta Y
 * @param {boolean} preserveAspect - Maintain aspect ratio
 * @returns {Object} { scaleX, scaleY, newBounds }
 */
export function calculateGroupResize(bounds, handleType, dx, dy, preserveAspect = false) {
  let { x, y, width, height } = bounds;
  const aspect = width / height;
  let newWidth = width;
  let newHeight = height;
  let newX = x;
  let newY = y;

  switch (handleType) {
    case HandleType.E:
      newWidth = width + dx;
      break;
    case HandleType.W:
      newWidth = width - dx;
      newX = x + dx;
      break;
    case HandleType.S:
      newHeight = height + dy;
      break;
    case HandleType.N:
      newHeight = height - dy;
      newY = y + dy;
      break;
    case HandleType.SE:
      newWidth = width + dx;
      newHeight = height + dy;
      break;
    case HandleType.NW:
      newWidth = width - dx;
      newHeight = height - dy;
      newX = x + dx;
      newY = y + dy;
      break;
    case HandleType.NE:
      newWidth = width + dx;
      newHeight = height - dy;
      newY = y + dy;
      break;
    case HandleType.SW:
      newWidth = width - dx;
      newHeight = height + dy;
      newX = x + dx;
      break;
  }

  // Apply aspect ratio constraint for corner handles
  if (preserveAspect && [HandleType.NW, HandleType.NE, HandleType.SE, HandleType.SW].includes(handleType)) {
    if (Math.abs(dx) > Math.abs(dy)) {
      newHeight = newWidth / aspect;
      if (handleType === HandleType.NW || handleType === HandleType.NE) {
        newY = y + height - newHeight;
      }
    } else {
      newWidth = newHeight * aspect;
      if (handleType === HandleType.NW || handleType === HandleType.SW) {
        newX = x + width - newWidth;
      }
    }
  }

  // Ensure minimum size
  newWidth = Math.max(newWidth, 20);
  newHeight = Math.max(newHeight, 20);

  const scaleX = newWidth / width;
  const scaleY = newHeight / height;

  return {
    scaleX,
    scaleY,
    newBounds: { x: newX, y: newY, width: newWidth, height: newHeight },
  };
}

/**
 * Calculate rotation angle for a group from mouse position
 * @param {Object} bounds - Group bounds { cx, cy }
 * @param {number} mouseX - Current mouse X
 * @param {number} mouseY - Current mouse Y
 * @param {number} startAngle - Starting angle when drag began
 */
export function calculateGroupRotation(bounds, mouseX, mouseY, startAngle = 0) {
  const { cx, cy } = bounds;

  // Angle from center to mouse position
  const angle = Math.atan2(mouseY - cy, mouseX - cx);

  // Convert to degrees, offset by 90 (handle is at top)
  let degrees = (angle * 180) / Math.PI + 90;

  // Return the delta from start angle
  return degrees - startAngle;
}
