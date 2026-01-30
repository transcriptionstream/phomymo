/**
 * Canvas rendering and raster conversion for Phomymo label designer
 * Supports multi-element rendering with transforms
 */

import { drawHandles, drawGroupHandles } from './handles.js?v=5';
import { logError, ErrorLevel } from './utils/errors.js';

// Pixels per mm (203 DPI ≈ 8 px/mm)
const PX_PER_MM = 8;

// Default printer width in bytes (72 bytes = 576 pixels for M260)
// M110/M200 use 48 bytes (384 pixels)
const DEFAULT_PRINTER_WIDTH_BYTES = 72;
const PRINTER_WIDTH_BYTES = DEFAULT_PRINTER_WIDTH_BYTES;
const PRINTER_WIDTH_PIXELS = PRINTER_WIDTH_BYTES * 8;

// Overflow area padding in pixels (visible area around label)
const OVERFLOW_PADDING = 120;

// Maximum cache entries to prevent memory leaks
const MAX_RENDER_CACHE_SIZE = 100;
const MAX_IMAGE_CACHE_SIZE = 50;

/**
 * Canvas renderer class
 */
export class CanvasRenderer {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.widthMm = 40;
    this.heightMm = 30;

    // Label dimensions in pixels (without overflow, at base resolution)
    this.labelWidth = 0;
    this.labelHeight = 0;

    // Round label flag (circular instead of rectangular)
    this.isRound = false;

    // Base offset where label starts (without zoom)
    this.baseLabelOffsetX = OVERFLOW_PADDING;
    this.baseLabelOffsetY = OVERFLOW_PADDING;

    // Current offset (scaled by zoom)
    this.labelOffsetX = OVERFLOW_PADDING;
    this.labelOffsetY = OVERFLOW_PADDING;

    // Zoom level for high-resolution rendering
    this.zoom = 1;

    // Image cache for elements
    this.imageCache = new Map();
    // Track images currently loading to prevent race conditions
    this.loadingImages = new Set();

    // Barcode/QR render cache
    this.renderCache = new Map();

    // Callback for when async content (barcodes, QR) finishes loading
    this.onAsyncLoad = null;

    // Multi-label configuration
    this.multiLabel = {
      enabled: false,
      labelWidth: 0,       // Single label width in pixels
      labelHeight: 0,      // Single label height in pixels
      labelsAcross: 1,     // Number of labels
      gapPx: 0,            // Gap between labels in pixels
      zones: [],           // Array of zone boundaries { x, y, width, height }
    };
    this.activeZone = 0;   // Currently active zone for editing
  }

  /**
   * Set label dimensions and resize canvas
   * @param {number} widthMm - Label width in mm
   * @param {number} heightMm - Label height in mm
   * @param {number} zoom - Zoom level (1 = 100%, 2 = 200%, etc.)
   * @param {boolean} round - Whether the label is circular
   */
  setDimensions(widthMm, heightMm, zoom = this.zoom, round = false) {
    this.widthMm = widthMm;
    this.heightMm = heightMm;
    this.zoom = zoom;
    this.isRound = round;

    // Label dimensions in pixels (base resolution, used for element coordinates)
    this.labelWidth = Math.round(widthMm * PX_PER_MM);
    this.labelHeight = Math.round(heightMm * PX_PER_MM);

    // Calculate base canvas size (without zoom)
    const baseCanvasWidth = this.labelWidth + (OVERFLOW_PADDING * 2);
    const baseCanvasHeight = this.labelHeight + (OVERFLOW_PADDING * 2);

    // Scale canvas internal resolution by zoom for crisp rendering
    this.canvas.width = Math.round(baseCanvasWidth * zoom);
    this.canvas.height = Math.round(baseCanvasHeight * zoom);

    // Scale CSS size by zoom so canvas appears larger when zoomed
    this.canvas.style.width = `${baseCanvasWidth * zoom}px`;
    this.canvas.style.height = `${baseCanvasHeight * zoom}px`;

    // Scale label offset by zoom for rendering
    this.labelOffsetX = Math.round(this.baseLabelOffsetX * zoom);
    this.labelOffsetY = Math.round(this.baseLabelOffsetY * zoom);

    // Return label dimensions (what elements use for positioning - base resolution)
    return { width: this.labelWidth, height: this.labelHeight };
  }

  /**
   * Set zoom level and re-render
   * @param {number} zoom - Zoom level (1 = 100%, 2 = 200%, etc.)
   */
  setZoom(zoom) {
    if (this.multiLabel.enabled) {
      this.setMultiLabelDimensions(
        this.multiLabel.labelWidth / PX_PER_MM,
        this.multiLabel.labelHeight / PX_PER_MM,
        this.multiLabel.labelsAcross,
        this.multiLabel.gapPx / PX_PER_MM,
        zoom
      );
    } else {
      this.setDimensions(this.widthMm, this.heightMm, zoom);
    }
  }

  /**
   * Set multi-label roll dimensions
   * @param {number} labelWidthMm - Individual label width in mm
   * @param {number} labelHeightMm - Individual label height in mm
   * @param {number} labelsAcross - Number of labels across
   * @param {number} gapMm - Gap between labels in mm
   * @param {number} zoom - Zoom level
   */
  setMultiLabelDimensions(labelWidthMm, labelHeightMm, labelsAcross, gapMm, zoom = this.zoom) {
    this.zoom = zoom;

    // Individual label dimensions in pixels
    const labelWidthPx = Math.round(labelWidthMm * PX_PER_MM);
    const labelHeightPx = Math.round(labelHeightMm * PX_PER_MM);
    const gapPx = Math.round(gapMm * PX_PER_MM);

    // Total canvas dimensions
    const totalWidth = (labelWidthPx * labelsAcross) + (gapPx * (labelsAcross - 1));
    const totalHeight = labelHeightPx;

    // Store for rendering
    this.multiLabel = {
      enabled: true,
      labelWidth: labelWidthPx,
      labelHeight: labelHeightPx,
      labelsAcross: labelsAcross,
      gapPx: gapPx,
      zones: [],
    };

    // Calculate zone boundaries
    for (let i = 0; i < labelsAcross; i++) {
      this.multiLabel.zones.push({
        x: i * (labelWidthPx + gapPx),
        y: 0,
        width: labelWidthPx,
        height: labelHeightPx,
      });
    }

    // Set overall label dimensions (used by parent canvas sizing)
    this.widthMm = labelWidthMm * labelsAcross + gapMm * (labelsAcross - 1);
    this.heightMm = labelHeightMm;
    this.labelWidth = totalWidth;
    this.labelHeight = totalHeight;

    // Calculate base canvas size (without zoom)
    const baseCanvasWidth = totalWidth + (OVERFLOW_PADDING * 2);
    const baseCanvasHeight = totalHeight + (OVERFLOW_PADDING * 2);

    // Scale canvas internal resolution by zoom for crisp rendering
    this.canvas.width = Math.round(baseCanvasWidth * zoom);
    this.canvas.height = Math.round(baseCanvasHeight * zoom);

    // Scale CSS size by zoom so canvas appears larger when zoomed
    this.canvas.style.width = `${baseCanvasWidth * zoom}px`;
    this.canvas.style.height = `${baseCanvasHeight * zoom}px`;

    // Scale label offset by zoom for rendering
    this.labelOffsetX = Math.round(this.baseLabelOffsetX * zoom);
    this.labelOffsetY = Math.round(this.baseLabelOffsetY * zoom);

    // Return single label dimensions (what elements use for positioning)
    return { width: labelWidthPx, height: labelHeightPx };
  }

  /**
   * Disable multi-label mode and return to single label
   */
  disableMultiLabel() {
    this.multiLabel = {
      enabled: false,
      labelWidth: 0,
      labelHeight: 0,
      labelsAcross: 1,
      gapPx: 0,
      zones: [],
    };
    this.activeZone = 0;
  }

  /**
   * Set active zone for editing
   * @param {number} zone - Zone index (0-based)
   */
  setActiveZone(zone) {
    this.activeZone = Math.max(0, Math.min(zone, this.multiLabel.labelsAcross - 1));
  }

  /**
   * Get zone at a point (in label coordinates, not canvas)
   * @param {number} x - X coordinate in label space
   * @param {number} y - Y coordinate in label space
   * @returns {number|null} Zone index or null if not in any zone
   */
  getZoneAtPoint(x, y) {
    if (!this.multiLabel.enabled) return 0;

    for (let i = 0; i < this.multiLabel.zones.length; i++) {
      const zone = this.multiLabel.zones[i];
      if (x >= zone.x && x < zone.x + zone.width &&
          y >= zone.y && y < zone.y + zone.height) {
        return i;
      }
    }
    return null; // In gap or outside
  }

  /**
   * Get single label dimensions (for element positioning within a zone)
   */
  getSingleLabelDimensions() {
    if (this.multiLabel.enabled) {
      return {
        width: this.multiLabel.labelWidth,
        height: this.multiLabel.labelHeight,
      };
    }
    return {
      width: this.labelWidth,
      height: this.labelHeight,
    };
  }

  /**
   * Get label dimensions in pixels (for element positioning)
   */
  getDimensions() {
    return {
      width: this.labelWidth,
      height: this.labelHeight,
      widthMm: this.widthMm,
      heightMm: this.heightMm,
    };
  }

  /**
   * Clear canvas - checkerboard overflow area with white label(s)
   */
  clear() {
    const ctx = this.ctx;
    const zoom = this.zoom;

    // Draw checkerboard pattern for entire canvas (overflow area)
    this.drawCheckerboard(ctx, 0, 0, this.canvas.width, this.canvas.height);

    if (this.multiLabel.enabled) {
      // Draw each label zone as a white area
      for (let i = 0; i < this.multiLabel.zones.length; i++) {
        const zone = this.multiLabel.zones[i];
        const isActive = (i === this.activeZone);

        // Draw white label area
        ctx.fillStyle = 'white';
        ctx.beginPath();
        ctx.roundRect(
          this.labelOffsetX + zone.x * zoom,
          this.labelOffsetY + zone.y * zoom,
          zone.width * zoom,
          zone.height * zoom,
          4 * zoom
        );
        ctx.fill();

        // Draw zone border (highlight active zone)
        ctx.strokeStyle = isActive ? '#3b82f6' : '#d1d5db';
        ctx.lineWidth = isActive ? 2 * zoom : 1 * zoom;
        ctx.stroke();

        // Draw zone number label
        ctx.fillStyle = isActive ? '#3b82f6' : '#9ca3af';
        ctx.font = `${10 * zoom}px Inter, sans-serif`;
        ctx.textAlign = 'center';
        ctx.fillText(
          `${i + 1}`,
          this.labelOffsetX + (zone.x + zone.width / 2) * zoom,
          this.labelOffsetY + zone.y * zoom - 4 * zoom
        );
      }
    } else {
      // Single label mode - draw one white area
      ctx.fillStyle = 'white';
      ctx.beginPath();
      if (this.isRound) {
        // Round label - draw a circle
        const centerX = this.labelOffsetX + (this.labelWidth * zoom) / 2;
        const centerY = this.labelOffsetY + (this.labelHeight * zoom) / 2;
        const radius = Math.min(this.labelWidth, this.labelHeight) * zoom / 2;
        ctx.arc(centerX, centerY, radius, 0, Math.PI * 2);
      } else {
        // Rectangular label - draw rounded rectangle
        ctx.roundRect(
          this.labelOffsetX,
          this.labelOffsetY,
          this.labelWidth * zoom,
          this.labelHeight * zoom,
          8 * zoom
        );
      }
      ctx.fill();

      // Draw border for round labels to make the boundary visible
      if (this.isRound) {
        ctx.strokeStyle = '#d1d5db';
        ctx.lineWidth = 1 * zoom;
        ctx.stroke();
      }
    }
  }

  /**
   * Draw a checkerboard pattern
   */
  drawCheckerboard(ctx, x, y, width, height) {
    // Scale square size by zoom for consistent visual appearance
    const squareSize = 10 * this.zoom;
    const lightColor = '#f0f0f0';
    const darkColor = '#d0d0d0';

    // Fill with light color first
    ctx.fillStyle = lightColor;
    ctx.fillRect(x, y, width, height);

    // Draw dark squares
    ctx.fillStyle = darkColor;
    for (let row = 0; row < Math.ceil(height / squareSize); row++) {
      for (let col = 0; col < Math.ceil(width / squareSize); col++) {
        if ((row + col) % 2 === 1) {
          ctx.fillRect(
            x + col * squareSize,
            y + row * squareSize,
            squareSize,
            squareSize
          );
        }
      }
    }
  }

  /**
   * Render all elements
   * @param {Array} elements - Array of elements to render
   * @param {Array|string|null} selectedIds - Array of selected element IDs (or single ID for backwards compatibility)
   * @param {Array} alignmentGuides - Array of alignment guides { type: 'h'|'v', pos: number }
   */
  renderAll(elements, selectedIds = null, alignmentGuides = []) {
    this.clear();

    const ctx = this.ctx;
    const zoom = this.zoom;

    // Normalize to array
    const selectedArray = selectedIds
      ? (Array.isArray(selectedIds) ? selectedIds : [selectedIds])
      : [];

    // Translate to label origin and scale by zoom for element rendering
    ctx.save();
    ctx.translate(this.labelOffsetX, this.labelOffsetY);
    ctx.scale(zoom, zoom);

    // Render elements in z-order (first = bottom)
    if (this.multiLabel.enabled) {
      // Multi-label mode: render elements with zone offsets
      for (const element of elements) {
        const zone = this.multiLabel.zones[element.zone ?? 0];
        if (zone) {
          // Create offset element for rendering
          const offsetElement = {
            ...element,
            x: element.x + zone.x,
            y: element.y + zone.y,
          };
          this.renderElement(offsetElement);
        }
      }
    } else {
      // Single label mode
      for (const element of elements) {
        this.renderElement(element);
      }
    }

    // Draw alignment guides (after elements, before handles)
    this.drawAlignmentGuides(alignmentGuides);

    // Draw handles based on selection
    if (selectedArray.length === 1) {
      // Single selection - check if it's part of a group
      const selected = elements.find(e => e.id === selectedArray[0]);
      if (selected) {
        // Get offset element for handle drawing in multi-label mode
        const handleElement = this.multiLabel.enabled
          ? this.getOffsetElement(selected)
          : selected;

        if (selected.groupId) {
          // Element is part of a group - draw group handles
          const groupMembers = elements.filter(e => e.groupId === selected.groupId);
          const offsetMembers = this.multiLabel.enabled
            ? groupMembers.map(e => this.getOffsetElement(e))
            : groupMembers;
          const bounds = this.getMultiElementBounds(offsetMembers);
          if (bounds) {
            drawGroupHandles(ctx, bounds);
          }
        } else {
          // Single ungrouped element
          drawHandles(ctx, handleElement);
        }
      }
    } else if (selectedArray.length > 1) {
      // Multi-selection - draw group bounding box
      const selectedElements = elements.filter(e => selectedArray.includes(e.id));
      const offsetElements = this.multiLabel.enabled
        ? selectedElements.map(e => this.getOffsetElement(e))
        : selectedElements;
      const bounds = this.getMultiElementBounds(offsetElements);
      if (bounds) {
        drawGroupHandles(ctx, bounds);
      }
    }

    ctx.restore();

    // Dim overflow areas (content outside label bounds)
    this.dimOverflowContent();
  }

  /**
   * Get element with zone offset applied (for multi-label mode)
   * @param {Object} element - Original element
   * @returns {Object} Element with zone offset applied
   */
  getOffsetElement(element) {
    if (!this.multiLabel.enabled) return element;

    const zone = this.multiLabel.zones[element.zone ?? 0];
    if (!zone) return element;

    return {
      ...element,
      x: element.x + zone.x,
      y: element.y + zone.y,
    };
  }

  /**
   * Dim content that extends outside the label area
   * Uses semi-transparent overlay with rounded label cutout
   */
  dimOverflowContent() {
    const ctx = this.ctx;
    const zoom = this.zoom;
    ctx.save();

    // Create path covering entire canvas with label holes
    ctx.beginPath();
    // Outer rectangle (clockwise)
    ctx.rect(0, 0, this.canvas.width, this.canvas.height);

    if (this.multiLabel.enabled) {
      // Create cutout for each label zone
      for (const zone of this.multiLabel.zones) {
        ctx.roundRect(
          this.labelOffsetX + zone.x * zoom,
          this.labelOffsetY + zone.y * zoom,
          zone.width * zoom,
          zone.height * zoom,
          4 * zoom
        );
      }
    } else {
      // Single label cutout
      ctx.roundRect(
        this.labelOffsetX,
        this.labelOffsetY,
        this.labelWidth * zoom,
        this.labelHeight * zoom,
        8 * zoom
      );
    }

    // Fill using evenodd rule (fills area between outer and inner paths)
    ctx.fillStyle = 'rgba(100, 100, 100, 0.5)';
    ctx.fill('evenodd');

    ctx.restore();
  }

  /**
   * Draw alignment guides
   * @param {Array} guides - Array of { type: 'h'|'v', pos: number }
   */
  drawAlignmentGuides(guides) {
    if (!guides || guides.length === 0) return;

    const ctx = this.ctx;
    ctx.save();

    // Magenta dashed line style - divide by zoom to maintain consistent visual thickness
    ctx.strokeStyle = '#ff00ff';
    ctx.lineWidth = 1 / this.zoom;
    ctx.setLineDash([4 / this.zoom, 4 / this.zoom]);

    // Extend guides into overflow area (use base offset since context is scaled)
    const extendX = this.baseLabelOffsetX;
    const extendY = this.baseLabelOffsetY;

    for (const guide of guides) {
      ctx.beginPath();
      if (guide.type === 'v') {
        // Vertical line (x position) - extend into overflow
        ctx.moveTo(guide.pos, -extendY);
        ctx.lineTo(guide.pos, this.labelHeight + extendY);
      } else {
        // Horizontal line (y position) - extend into overflow
        ctx.moveTo(-extendX, guide.pos);
        ctx.lineTo(this.labelWidth + extendX, guide.pos);
      }
      ctx.stroke();
    }

    ctx.restore();
  }

  /**
   * Render all elements to an external context (for preview thumbnails)
   * @param {CanvasRenderingContext2D} ctx - External canvas context
   * @param {Array} elements - Elements to render
   * @param {Array} selectedIds - Selected element IDs (usually empty for previews)
   */
  renderAllToContext(ctx, elements, selectedIds = []) {
    // Save original context
    const originalCtx = this.ctx;

    // Temporarily use the provided context
    this.ctx = ctx;

    // Render elements (with zone offsets if multi-label mode)
    if (this.multiLabel.enabled) {
      for (const element of elements) {
        const zone = this.multiLabel.zones[element.zone ?? 0];
        if (zone) {
          const offsetElement = {
            ...element,
            x: element.x + zone.x,
            y: element.y + zone.y,
          };
          this.renderElement(offsetElement);
        }
      }
    } else {
      for (const element of elements) {
        this.renderElement(element);
      }
    }

    // Restore original context
    this.ctx = originalCtx;
  }

  /**
   * Get bounding box for multiple elements
   */
  getMultiElementBounds(elementsToMeasure) {
    if (!elementsToMeasure || elementsToMeasure.length === 0) {
      return null;
    }

    // Get axis-aligned bounding box for each element
    const allBounds = elementsToMeasure.map(el => {
      const { x, y, width, height, rotation } = el;
      const cx = x + width / 2;
      const cy = y + height / 2;

      if (!rotation) {
        return { minX: x, minY: y, maxX: x + width, maxY: y + height };
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

      return {
        minX: Math.min(...rotated.map(c => c.x)),
        minY: Math.min(...rotated.map(c => c.y)),
        maxX: Math.max(...rotated.map(c => c.x)),
        maxY: Math.max(...rotated.map(c => c.y)),
      };
    });

    const minX = Math.min(...allBounds.map(b => b.minX));
    const minY = Math.min(...allBounds.map(b => b.minY));
    const maxX = Math.max(...allBounds.map(b => b.maxX));
    const maxY = Math.max(...allBounds.map(b => b.maxY));

    return {
      x: minX,
      y: minY,
      width: maxX - minX,
      height: maxY - minY,
      cx: (minX + maxX) / 2,
      cy: (minY + maxY) / 2,
    };
  }

  /**
   * Render a single element with transforms
   */
  renderElement(element) {
    const { x, y, width, height, rotation, type } = element;

    this.ctx.save();

    // Move to element center
    const cx = x + width / 2;
    const cy = y + height / 2;
    this.ctx.translate(cx, cy);

    // Apply rotation
    if (rotation) {
      this.ctx.rotate((rotation * Math.PI) / 180);
    }

    // Render based on type
    switch (type) {
      case 'text':
        this.renderTextElement(element, width, height);
        break;
      case 'image':
        this.renderImageElement(element, width, height);
        break;
      case 'barcode':
        this.renderBarcodeElement(element, width, height);
        break;
      case 'qr':
        this.renderQRElement(element, width, height);
        break;
      case 'shape':
        this.renderShapeElement(element, width, height);
        break;
    }

    this.ctx.restore();
  }

  /**
   * Render text element (centered at origin)
   */
  renderTextElement(element, width, height) {
    const { text, fontSize, color, align, verticalAlign, fontFamily, fontWeight, fontStyle, textDecoration, background, noWrap, clipOverflow, autoScale } = element;

    // Draw background if not transparent
    if (background && background !== 'transparent') {
      this.ctx.fillStyle = background;
      this.ctx.fillRect(-width / 2, -height / 2, width, height);
    }

    if (!text || !text.trim()) return;

    // Set up clipping region if clipOverflow is enabled
    if (clipOverflow) {
      this.ctx.save();
      this.ctx.beginPath();
      this.ctx.rect(-width / 2, -height / 2, width, height);
      this.ctx.clip();
    }

    // Set text color - use explicit color property, default to black
    const textColor = color || 'black';
    this.ctx.fillStyle = textColor;

    // Calculate effective font size (auto-scale if enabled)
    let effectiveFontSize = fontSize;
    if (autoScale) {
      effectiveFontSize = this.calculateAutoScaleFontSize(text, width, height, fontFamily, fontWeight, fontStyle, noWrap);
    }

    // Build font string with weight and style
    const weight = fontWeight === 'bold' ? 'bold' : '';
    const style = fontStyle === 'italic' ? 'italic' : '';
    const fontStr = `${style} ${weight} ${effectiveFontSize}px ${fontFamily || 'Inter, sans-serif'}`.trim();
    this.ctx.font = fontStr;
    this.ctx.textBaseline = 'middle';

    // Set text alignment
    let textX = 0;
    if (align === 'left') {
      this.ctx.textAlign = 'left';
      textX = -width / 2 + 4;
    } else if (align === 'right') {
      this.ctx.textAlign = 'right';
      textX = width / 2 - 4;
    } else {
      this.ctx.textAlign = 'center';
    }

    // Get lines - either wrapped or split by newlines only
    let lines;
    if (noWrap) {
      // No wrap mode: only split by explicit newlines, allow overflow
      lines = text.split('\n');
    } else {
      // Word wrap mode
      lines = this.wrapText(text, width - 8, effectiveFontSize, fontFamily, fontWeight, fontStyle);
    }

    const lineHeight = effectiveFontSize * 1.2;
    const totalHeight = lines.length * lineHeight;

    // Calculate vertical start position based on alignment
    let textY;
    const vAlign = verticalAlign || 'middle';
    if (vAlign === 'top') {
      textY = -height / 2 + lineHeight / 2 + 2; // 2px padding from top
    } else if (vAlign === 'bottom') {
      textY = height / 2 - totalHeight + lineHeight / 2 - 2; // 2px padding from bottom
    } else {
      // middle (default) - center text block within element bounds
      textY = -totalHeight / 2 + lineHeight / 2;
    }

    // When autoScale is enabled, adjust vertical position to maintain baseline alignment
    if (autoScale) {
      const unusedSpace = height - totalHeight;
      const unusedRatio = unusedSpace / height;
      if (unusedRatio > 0.4) {
        // Text was scaled down significantly - shift up
        const adjustment = unusedSpace * 0.08;
        textY -= adjustment;
      } else {
        // Text was not scaled down much - shift down to match non-autoScale position
        // Adjustment varies by vertical alignment
        if (vAlign === 'bottom') {
          textY += 1;
        } else if (vAlign === 'top') {
          textY += 0;
        } else {
          // middle
          textY += 0.5;
        }
      }
    }

    for (const line of lines) {
      this.ctx.fillText(line, textX, textY);

      // Draw underline manually if enabled
      if (textDecoration === 'underline') {
        const metrics = this.ctx.measureText(line);
        // Position underline below text - since textBaseline is 'middle',
        // the bottom of the text is at textY + effectiveFontSize/2, add small gap
        const underlineY = textY + effectiveFontSize * 0.45;
        let underlineX;
        let underlineWidth = metrics.width;

        if (align === 'left') {
          underlineX = textX;
        } else if (align === 'right') {
          underlineX = textX - underlineWidth;
        } else {
          underlineX = -underlineWidth / 2;
        }

        this.ctx.beginPath();
        this.ctx.strokeStyle = textColor;
        this.ctx.lineWidth = Math.max(1, effectiveFontSize / 16);
        this.ctx.moveTo(underlineX, underlineY);
        this.ctx.lineTo(underlineX + underlineWidth, underlineY);
        this.ctx.stroke();
      }

      textY += lineHeight;
    }

    // Restore context if we applied clipping
    if (clipOverflow) {
      this.ctx.restore();
    }
  }

  /**
   * Calculate optimal font size to fit text within box
   */
  calculateAutoScaleFontSize(text, width, height, fontFamily, fontWeight, fontStyle, noWrap) {
    const padding = 8; // 4px on each side
    const availableWidth = width - padding;
    const availableHeight = height - padding;

    if (availableWidth <= 0 || availableHeight <= 0) return 8;

    const weight = fontWeight === 'bold' ? 'bold' : '';
    const style = fontStyle === 'italic' ? 'italic' : '';

    // Binary search for optimal font size
    let minSize = 6;
    let maxSize = 200;
    let bestSize = minSize;

    while (minSize <= maxSize) {
      const testSize = Math.floor((minSize + maxSize) / 2);
      const fontStr = `${style} ${weight} ${testSize}px ${fontFamily || 'Inter, sans-serif'}`.trim();
      this.ctx.font = fontStr;

      let fits = false;

      if (noWrap) {
        // For no-wrap, check if all lines fit
        const lines = text.split('\n');
        const lineHeight = testSize * 1.2;
        const totalHeight = lines.length * lineHeight;

        // Check width of longest line
        let maxLineWidth = 0;
        for (const line of lines) {
          const metrics = this.ctx.measureText(line);
          maxLineWidth = Math.max(maxLineWidth, metrics.width);
        }

        fits = maxLineWidth <= availableWidth && totalHeight <= availableHeight;
      } else {
        // For wrapped text, check if text fits with wrapping
        const lines = this.wrapText(text, availableWidth, testSize, fontFamily, fontWeight, fontStyle);
        const lineHeight = testSize * 1.2;
        const totalHeight = lines.length * lineHeight;

        fits = totalHeight <= availableHeight;
      }

      if (fits) {
        bestSize = testSize;
        minSize = testSize + 1;
      } else {
        maxSize = testSize - 1;
      }
    }

    return Math.max(bestSize, 6); // Minimum 6px
  }

  /**
   * Render image element (centered at origin)
   */
  renderImageElement(element, width, height) {
    const { imageData } = element;

    if (!imageData) return;

    // Get or create cached image (using LRU getter)
    let img = this._getFromImageCache(element.id);
    const loadKey = `${element.id}_${imageData}`;

    if (!img || img.src !== imageData) {
      // Skip if this exact image is already loading
      if (this.loadingImages.has(loadKey)) {
        return;
      }

      this.loadingImages.add(loadKey);
      img = new Image();
      img.onload = () => {
        this.loadingImages.delete(loadKey);
        // Trigger re-render when image finishes loading
        if (this.onAsyncLoad) {
          this.onAsyncLoad();
        }
      };
      img.onerror = () => {
        this.loadingImages.delete(loadKey);
        logError(`Image load error for element: ${element.id}`, 'renderImage', ErrorLevel.WARNING);
      };
      img.src = imageData;
      this._addToImageCache(element.id, img);
    }

    if (img.complete && img.naturalWidth > 0) {
      // Apply brightness and contrast filters if set
      const brightness = element.brightness || 0;
      const contrast = element.contrast || 0;
      const hasFilters = brightness !== 0 || contrast !== 0;

      if (hasFilters) {
        // Convert from -100..100 to filter values
        // Brightness: 0 = 100% (no change), -100 = 0%, +100 = 200%
        const brightnessValue = 1 + (brightness / 100);
        // Contrast: 0 = 100% (no change), -100 = 0%, +100 = 200%
        const contrastValue = 1 + (contrast / 100);
        this.ctx.filter = `brightness(${brightnessValue}) contrast(${contrastValue})`;
      }

      this.ctx.drawImage(img, -width / 2, -height / 2, width, height);

      if (hasFilters) {
        this.ctx.filter = 'none';
      }
    }
  }

  /**
   * Render barcode element (centered at origin)
   */
  renderBarcodeElement(element, width, height) {
    const { barcodeData, barcodeFormat } = element;

    if (!barcodeData || !barcodeData.trim()) return;

    const showText = element.showText !== false;
    const textFontSize = element.textFontSize || 12;
    const textBold = element.textBold || false;
    const cacheKey = `barcode_${element.id}_${barcodeData}_${barcodeFormat}_${width}_${height}_${showText}_${textFontSize}_${textBold}`;
    let cachedCanvas = this._getFromRenderCache(cacheKey);

    if (!cachedCanvas) {
      try {
        // Calculate space for text
        const textHeight = showText ? textFontSize + 8 : 0;
        const barcodeHeight = height - textHeight;

        // Create SVG barcode WITHOUT text (we'll draw text separately)
        // This ensures barcode width is consistent regardless of text size
        const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
        JsBarcode(svg, barcodeData, {
          format: barcodeFormat || 'CODE128',
          width: 2,
          height: Math.round(barcodeHeight * 0.85),
          displayValue: false,  // We'll draw text ourselves
          margin: 5,
        });

        // Convert SVG to canvas
        const svgData = new XMLSerializer().serializeToString(svg);
        const svgBlob = new Blob([svgData], { type: 'image/svg+xml;charset=utf-8' });
        const url = URL.createObjectURL(svgBlob);

        const tempImg = new Image();
        tempImg.onload = () => {
          cachedCanvas = document.createElement('canvas');
          cachedCanvas.width = width;
          cachedCanvas.height = height;
          const tempCtx = cachedCanvas.getContext('2d');

          // Clip to element bounds so nothing overflows
          tempCtx.beginPath();
          tempCtx.rect(0, 0, width, height);
          tempCtx.clip();

          // Fill white background
          tempCtx.fillStyle = 'white';
          tempCtx.fillRect(0, 0, width, height);

          // Calculate available space for barcode (leave room for text if shown)
          const textSpace = showText ? textFontSize + 6 : 0;
          const availableHeight = height - textSpace;

          // Scale barcode to fit width, but also cap height to available space
          const widthScale = (width / tempImg.width) * 0.95;
          const heightScale = availableHeight / tempImg.height;
          const scale = Math.min(widthScale, heightScale);
          const scaledW = tempImg.width * scale;
          const scaledH = tempImg.height * scale;
          const dx = (width - scaledW) / 2;
          const dy = 2;  // Small top margin

          tempCtx.drawImage(tempImg, dx, dy, scaledW, scaledH);

          // Draw text below barcode if enabled (and if it fits)
          if (showText) {
            const textY = dy + scaledH + 2;
            if (textY < height) {  // Only draw if there's room
              tempCtx.fillStyle = 'black';
              tempCtx.font = `${textBold ? 'bold ' : ''}${textFontSize}px monospace`;
              tempCtx.textAlign = 'center';
              tempCtx.textBaseline = 'top';
              tempCtx.fillText(barcodeData, width / 2, textY);
            }
          }

          this._addToRenderCache(cacheKey, cachedCanvas);
          URL.revokeObjectURL(url);

          // Trigger re-render to show the loaded barcode
          if (this.onAsyncLoad) {
            this.onAsyncLoad();
          }
        };
        tempImg.onerror = () => {
          URL.revokeObjectURL(url);
          logError('Barcode image load error', 'renderBarcode', ErrorLevel.WARNING);
        };
        tempImg.src = url;
      } catch (e) {
        logError(e, 'renderBarcode');
      }
    }

    if (cachedCanvas) {
      this.ctx.drawImage(cachedCanvas, -width / 2, -height / 2);
    } else {
      // Placeholder while loading
      this.ctx.strokeStyle = '#ccc';
      this.ctx.strokeRect(-width / 2, -height / 2, width, height);
      this.ctx.fillStyle = '#999';
      this.ctx.font = '12px sans-serif';
      this.ctx.textAlign = 'center';
      this.ctx.textBaseline = 'middle';
      this.ctx.fillText('Loading...', 0, 0);
    }
  }

  /**
   * Render QR code element (centered at origin)
   */
  renderQRElement(element, width, height) {
    const { qrData } = element;

    if (!qrData || !qrData.trim()) return;

    const size = Math.min(width, height);
    const cacheKey = `qr_${element.id}_${qrData}_${size}`;
    let cachedCanvas = this._getFromRenderCache(cacheKey);

    if (!cachedCanvas) {
      try {
        cachedCanvas = document.createElement('canvas');
        QRCode.toCanvas(cachedCanvas, qrData, {
          width: size,
          margin: 1,
          color: { dark: '#000000', light: '#ffffff' },
        }, (error) => {
          if (error) {
            logError(error, 'renderQR');
            this.renderCache.delete(cacheKey);
          } else {
            this._addToRenderCache(cacheKey, cachedCanvas);
            // Trigger re-render to show the loaded QR code
            if (this.onAsyncLoad) {
              this.onAsyncLoad();
            }
          }
        });
      } catch (e) {
        logError(e, 'renderQR');
      }
    }

    if (cachedCanvas && cachedCanvas.width > 0) {
      // Center in element bounds
      const dx = -size / 2;
      const dy = -size / 2;
      this.ctx.drawImage(cachedCanvas, dx, dy, size, size);
    } else {
      // Placeholder
      this.ctx.strokeStyle = '#ccc';
      this.ctx.strokeRect(-size / 2, -size / 2, size, size);
    }
  }

  /**
   * Render shape element (centered at origin)
   */
  renderShapeElement(element, width, height) {
    const { shapeType, fill, stroke, strokeWidth, cornerRadius } = element;

    // Draw based on shape type
    switch (shapeType) {
      case 'rectangle':
        this.drawRectangle(width, height, cornerRadius, fill, stroke, strokeWidth);
        break;
      case 'ellipse':
        this.drawEllipse(width, height, fill, stroke, strokeWidth);
        break;
      case 'triangle':
        this.drawTriangle(width, height, fill, stroke, strokeWidth);
        break;
      case 'line':
        this.drawLine(width, height, stroke || fill, strokeWidth);
        break;
      default:
        this.drawRectangle(width, height, 0, fill, stroke, strokeWidth);
    }
  }

  /**
   * Get dither density for a fill type
   */
  getDitherDensity(fill) {
    switch (fill) {
      case 'dither-6':
        return 0.0625;  // 6.25% - very sparse
      case 'dither-12':
        return 0.125;   // 12.5%
      case 'dither-25':
      case 'dither-light':  // Legacy
        return 0.25;    // 25%
      case 'dither-37':
        return 0.375;   // 37.5%
      case 'dither-50':
      case 'dither-medium':  // Legacy
        return 0.50;    // 50%
      case 'dither-62':
        return 0.625;   // 62.5%
      case 'dither-75':
      case 'dither-dark':  // Legacy
        return 0.75;    // 75%
      case 'dither-87':
        return 0.875;   // 87.5%
      case 'dither-94':
        return 0.9375;  // 93.75% - almost solid
      default:
        return 0;
    }
  }

  /**
   * Check if a cell should be black for dithering
   * Uses ordered dithering with a 4x4 Bayer matrix for consistent patterns
   * @param {number} cellX - Cell X index (not pixel)
   * @param {number} cellY - Cell Y index (not pixel)
   * @param {number} density - Black density 0-1
   */
  isDitherCellBlack(cellX, cellY, density) {
    // 4x4 Bayer matrix threshold values (0-15, normalized to 0-1)
    const bayerMatrix = [
      [ 0,  8,  2, 10],
      [12,  4, 14,  6],
      [ 3, 11,  1,  9],
      [15,  7, 13,  5]
    ];

    // Get threshold for this cell position (use absolute value for negative coords)
    const threshold = bayerMatrix[Math.abs(cellY) & 3][Math.abs(cellX) & 3] / 16;
    return density > threshold;
  }

  /**
   * Fill a path with dither pattern
   * The path must already be defined with beginPath/closePath
   * @param {string} fill - The dither pattern type
   * @param {number} width - Shape width (for efficient bounds)
   * @param {number} height - Shape height (for efficient bounds)
   */
  fillWithDither(fill, width, height) {
    // Cell size - use 2x2 pixels per cell for better visibility with transforms
    const cellSize = 2;

    // Calculate bounds in cells (shape centered at origin, add padding)
    const halfW = Math.ceil(width / 2 / cellSize) + 2;
    const halfH = Math.ceil(height / 2 / cellSize) + 2;

    // Get density for this fill type
    const density = this.getDitherDensity(fill);
    if (density === 0) return;

    // Clip to the current path
    this.ctx.save();
    this.ctx.clip();

    // Disable anti-aliasing for crisp pixel rendering
    this.ctx.imageSmoothingEnabled = false;

    // Fill with white base first
    this.ctx.fillStyle = 'white';
    this.ctx.fillRect(-halfW * cellSize - cellSize, -halfH * cellSize - cellSize,
                      (halfW * 2 + 2) * cellSize, (halfH * 2 + 2) * cellSize);

    // Draw black dither pattern cells
    this.ctx.fillStyle = 'black';
    for (let cy = -halfH; cy <= halfH; cy++) {
      for (let cx = -halfW; cx <= halfW; cx++) {
        if (this.isDitherCellBlack(cx, cy, density)) {
          this.ctx.fillRect(cx * cellSize, cy * cellSize, cellSize, cellSize);
        }
      }
    }

    this.ctx.restore();
  }

  /**
   * Check if fill is a dither pattern
   */
  isDitherFill(fill) {
    return fill && fill.startsWith('dither-');
  }

  /**
   * Draw rectangle (optionally rounded)
   */
  drawRectangle(width, height, cornerRadius, fill, stroke, strokeWidth) {
    const x = -width / 2;
    const y = -height / 2;
    const r = Math.min(cornerRadius || 0, width / 2, height / 2);

    this.ctx.beginPath();
    if (r > 0) {
      // Rounded rectangle
      this.ctx.moveTo(x + r, y);
      this.ctx.lineTo(x + width - r, y);
      this.ctx.quadraticCurveTo(x + width, y, x + width, y + r);
      this.ctx.lineTo(x + width, y + height - r);
      this.ctx.quadraticCurveTo(x + width, y + height, x + width - r, y + height);
      this.ctx.lineTo(x + r, y + height);
      this.ctx.quadraticCurveTo(x, y + height, x, y + height - r);
      this.ctx.lineTo(x, y + r);
      this.ctx.quadraticCurveTo(x, y, x + r, y);
    } else {
      this.ctx.rect(x, y, width, height);
    }
    this.ctx.closePath();

    // Fill
    if (fill && fill !== 'none') {
      if (this.isDitherFill(fill)) {
        this.fillWithDither(fill, width, height);
      } else {
        this.ctx.fillStyle = fill;
        this.ctx.fill();
      }
    }

    // Stroke
    if (stroke && stroke !== 'none') {
      this.ctx.strokeStyle = stroke;
      this.ctx.lineWidth = strokeWidth || 2;
      this.ctx.stroke();
    }
  }

  /**
   * Draw ellipse
   */
  drawEllipse(width, height, fill, stroke, strokeWidth) {
    this.ctx.beginPath();
    this.ctx.ellipse(0, 0, width / 2, height / 2, 0, 0, Math.PI * 2);
    this.ctx.closePath();

    // Fill
    if (fill && fill !== 'none') {
      if (this.isDitherFill(fill)) {
        this.fillWithDither(fill, width, height);
      } else {
        this.ctx.fillStyle = fill;
        this.ctx.fill();
      }
    }

    // Stroke
    if (stroke && stroke !== 'none') {
      this.ctx.strokeStyle = stroke;
      this.ctx.lineWidth = strokeWidth || 2;
      this.ctx.stroke();
    }
  }

  /**
   * Draw triangle
   */
  drawTriangle(width, height, fill, stroke, strokeWidth) {
    const x = -width / 2;
    const y = -height / 2;

    this.ctx.beginPath();
    this.ctx.moveTo(0, y);                    // Top center
    this.ctx.lineTo(x + width, y + height);   // Bottom right
    this.ctx.lineTo(x, y + height);           // Bottom left
    this.ctx.closePath();

    // Fill
    if (fill && fill !== 'none') {
      if (this.isDitherFill(fill)) {
        this.fillWithDither(fill, width, height);
      } else {
        this.ctx.fillStyle = fill;
        this.ctx.fill();
      }
    }

    // Stroke
    if (stroke && stroke !== 'none') {
      this.ctx.strokeStyle = stroke;
      this.ctx.lineWidth = strokeWidth || 2;
      this.ctx.stroke();
    }
  }

  /**
   * Draw line (diagonal from corner to corner)
   */
  drawLine(width, height, color, strokeWidth) {
    this.ctx.beginPath();
    this.ctx.moveTo(-width / 2, 0);
    this.ctx.lineTo(width / 2, 0);
    this.ctx.strokeStyle = color || 'black';
    this.ctx.lineWidth = strokeWidth || 2;
    this.ctx.lineCap = 'round';
    this.ctx.stroke();
  }

  /**
   * Word wrap text to fit width
   */
  wrapText(text, maxWidth, fontSize, fontFamily = 'Inter, sans-serif', fontWeight = 'normal', fontStyle = 'normal') {
    const weight = fontWeight === 'bold' ? 'bold' : '';
    const style = fontStyle === 'italic' ? 'italic' : '';
    this.ctx.font = `${style} ${weight} ${fontSize}px ${fontFamily}`.trim();

    const lines = [];

    // First split by explicit newlines to preserve them
    const paragraphs = text.split('\n');

    for (const paragraph of paragraphs) {
      if (!paragraph.trim()) {
        // Empty line - preserve it
        lines.push('');
        continue;
      }

      // Word wrap within each paragraph
      const words = paragraph.split(/[ \t]+/); // Split by spaces/tabs only, not newlines
      let currentLine = '';

      for (const word of words) {
        const testLine = currentLine ? `${currentLine} ${word}` : word;
        const metrics = this.ctx.measureText(testLine);

        if (metrics.width > maxWidth && currentLine) {
          lines.push(currentLine);
          currentLine = word;
        } else {
          currentLine = testLine;
        }
      }

      if (currentLine) {
        lines.push(currentLine);
      }
    }

    return lines.length ? lines : [''];
  }

  /**
   * Load image from file and return as data URL
   */
  loadImageFile(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();

      reader.onload = (e) => {
        const img = new Image();
        img.onload = () => {
          resolve({
            dataUrl: e.target.result,
            width: img.naturalWidth,
            height: img.naturalHeight,
          });
        };
        img.onerror = reject;
        img.src = e.target.result;
      };

      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
  }

  /**
   * Clear render cache (call when elements change significantly)
   */
  clearCache(elementId = null) {
    if (elementId) {
      // Clear cache entries for specific element
      for (const key of this.renderCache.keys()) {
        if (key.includes(elementId)) {
          this.renderCache.delete(key);
        }
      }
      this.imageCache.delete(elementId);
      // Also clear any pending loads for this element to prevent race conditions
      for (const loadKey of this.loadingImages) {
        if (loadKey.startsWith(`${elementId}_`)) {
          this.loadingImages.delete(loadKey);
        }
      }
    } else {
      this.renderCache.clear();
      this.imageCache.clear();
      this.loadingImages.clear();
    }
  }

  /**
   * Evict least recently used cache entries if cache is too large
   * Uses Map insertion order - oldest entries are first
   * @param {Map} cache - Cache map to evict from
   * @param {number} maxSize - Maximum size
   */
  _evictCache(cache, maxSize) {
    if (cache.size <= maxSize) return;
    // Delete oldest entries (first entries in Map iteration order = LRU)
    const toDelete = cache.size - maxSize;
    let deleted = 0;
    for (const key of cache.keys()) {
      if (deleted >= toDelete) break;
      cache.delete(key);
      deleted++;
    }
  }

  /**
   * Get from render cache and update LRU order
   * @param {string} key - Cache key
   * @returns {*} Cached value or undefined
   */
  _getFromRenderCache(key) {
    const value = this.renderCache.get(key);
    if (value !== undefined) {
      // Move to end (most recently used) by re-inserting
      this.renderCache.delete(key);
      this.renderCache.set(key, value);
    }
    return value;
  }

  /**
   * Get from image cache and update LRU order
   * @param {string} key - Cache key
   * @returns {*} Cached value or undefined
   */
  _getFromImageCache(key) {
    const value = this.imageCache.get(key);
    if (value !== undefined) {
      // Move to end (most recently used) by re-inserting
      this.imageCache.delete(key);
      this.imageCache.set(key, value);
    }
    return value;
  }

  /**
   * Add to render cache with size limit
   */
  _addToRenderCache(key, value) {
    this._evictCache(this.renderCache, MAX_RENDER_CACHE_SIZE - 1);
    this.renderCache.set(key, value);
  }

  /**
   * Add to image cache with size limit
   */
  _addToImageCache(key, value) {
    this._evictCache(this.imageCache, MAX_IMAGE_CACHE_SIZE - 1);
    this.imageCache.set(key, value);
  }

  /**
   * Destroy renderer and clean up resources
   * Call when the application is closing or renderer is no longer needed
   */
  destroy() {
    // Clear all caches
    this.renderCache.clear();
    this.imageCache.clear();
    this.loadingImages.clear();

    // Clear callback
    this.onAsyncLoad = null;

    // Clear canvas
    if (this.ctx) {
      this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
    }
  }

  /**
   * Render elements to a temporary canvas and return pixel data
   * Shared helper for getRasterData and getRasterDataRaw
   */
  _renderToPixels(elements) {
    const width = this.labelWidth;
    const height = this.labelHeight;
    const tempCanvas = document.createElement('canvas');
    tempCanvas.width = width;
    tempCanvas.height = height;
    const tempCtx = tempCanvas.getContext('2d');

    // Fill with white background
    tempCtx.fillStyle = 'white';
    tempCtx.fillRect(0, 0, width, height);

    // For round labels, set up circular clipping
    if (this.isRound) {
      tempCtx.save();
      tempCtx.beginPath();
      const centerX = width / 2;
      const centerY = height / 2;
      const radius = Math.min(width, height) / 2;
      tempCtx.arc(centerX, centerY, radius, 0, Math.PI * 2);
      tempCtx.clip();
    }

    // Render elements to temp canvas (with zone offsets if multi-label mode)
    const originalCtx = this.ctx;
    this.ctx = tempCtx;
    if (this.multiLabel.enabled) {
      for (const element of elements) {
        const zone = this.multiLabel.zones[element.zone ?? 0];
        if (zone) {
          const offsetElement = {
            ...element,
            x: element.x + zone.x,
            y: element.y + zone.y,
          };
          this.renderElement(offsetElement);
        }
      }
    } else {
      for (const element of elements) {
        this.renderElement(element);
      }
    }
    this.ctx = originalCtx;

    // Restore context if we applied circular clipping
    if (this.isRound) {
      tempCtx.restore();
    }

    // Get image data
    const imageData = tempCtx.getImageData(0, 0, width, height);
    return { pixels: imageData.data, width, height };
  }

  /**
   * Convert RGBA pixels to perceptual grayscale with gamma correction
   * @param {Uint8ClampedArray} pixels - RGBA pixel data
   * @param {number} width - Image width
   * @param {number} height - Image height
   * @param {number} gamma - Gamma correction value (1.0 = none, 1.3 = lighter midtones for thermal)
   * @returns {Float32Array} Grayscale values 0-255
   */
  _rgbaToGrayscale(pixels, width, height, gamma = 1.3) {
    const grayscale = new Float32Array(width * height);
    const gammaInv = 1.0 / gamma;

    for (let i = 0; i < width * height; i++) {
      const idx = i * 4;
      const r = pixels[idx];
      const g = pixels[idx + 1];
      const b = pixels[idx + 2];
      const a = pixels[idx + 3];

      // Perceptual grayscale (ITU-R BT.601)
      let gray = 0.299 * r + 0.587 * g + 0.114 * b;

      // Handle transparency - blend with white background
      if (a < 255) {
        gray = gray * (a / 255) + 255 * (1 - a / 255);
      }

      // Apply gamma correction to lift midtones for thermal printing
      gray = 255 * Math.pow(gray / 255, gammaInv);

      grayscale[i] = gray;
    }

    return grayscale;
  }

  /**
   * Apply Floyd-Steinberg dithering to grayscale image
   * Produces high-quality 1-bit output that simulates grayscale through dot patterns
   * @param {Float32Array} grayscale - Grayscale values 0-255
   * @param {number} width - Image width
   * @param {number} height - Image height
   * @returns {Uint8Array} 1-bit values (0 = white, 1 = black)
   */
  _floydSteinbergDither(grayscale, width, height) {
    // Work on a copy to avoid modifying original
    const pixels = new Float32Array(grayscale);
    const output = new Uint8Array(width * height);

    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const idx = y * width + x;
        const oldPixel = pixels[idx];

        // Threshold to black (0) or white (255)
        const newPixel = oldPixel < 128 ? 0 : 255;
        output[idx] = newPixel === 0 ? 1 : 0; // 1 = black, 0 = white

        // Calculate quantization error
        const error = oldPixel - newPixel;

        // Distribute error to neighboring pixels (Floyd-Steinberg pattern)
        //       X   7/16
        // 3/16 5/16 1/16
        if (x + 1 < width) {
          pixels[idx + 1] += error * 7 / 16;
        }
        if (y + 1 < height) {
          if (x > 0) {
            pixels[(y + 1) * width + (x - 1)] += error * 3 / 16;
          }
          pixels[(y + 1) * width + x] += error * 5 / 16;
          if (x + 1 < width) {
            pixels[(y + 1) * width + (x + 1)] += error * 1 / 16;
          }
        }
      }
    }

    return output;
  }

  /**
   * Detect if image likely contains photos or gradients that benefit from dithering
   * @param {Uint8ClampedArray} pixels - RGBA pixel data
   * @param {number} width - Image width
   * @param {number} height - Image height
   * @returns {boolean} True if dithering recommended
   */
  _shouldUseDithering(pixels, width, height) {
    // Sample pixels to check for gradients/photos
    const sampleSize = Math.min(1000, width * height);
    const step = Math.floor((width * height) / sampleSize);

    let uniqueColors = new Set();
    let gradientCount = 0;
    let lastGray = -1;

    for (let i = 0; i < width * height; i += step) {
      const idx = i * 4;
      const r = pixels[idx];
      const g = pixels[idx + 1];
      const b = pixels[idx + 2];

      // Count unique colors (packed RGB)
      uniqueColors.add((r << 16) | (g << 8) | b);

      // Check for gradual transitions (indicates gradients/photos)
      const gray = Math.round((r + g + b) / 3);
      if (lastGray >= 0) {
        const diff = Math.abs(gray - lastGray);
        if (diff > 0 && diff < 30) {
          gradientCount++;
        }
      }
      lastGray = gray;
    }

    // Use dithering if many colors or gradual transitions detected
    const hasManyfColors = uniqueColors.size > 50;
    const hasGradients = gradientCount > sampleSize * 0.1;

    return hasManyfColors || hasGradients;
  }

  /**
   * Convert pixel data to raster bytes using simple threshold
   * Best for text, barcodes, and simple graphics
   * @param {Uint8ClampedArray} pixels - RGBA pixel data
   * @param {number} width - Image width
   * @param {number} height - Image height
   * @param {number} outputWidthBytes - Output width in bytes (for centering)
   * @param {boolean} center - Whether to center output in outputWidthBytes
   */
  _pixelsToRasterThreshold(pixels, width, height, outputWidthBytes, center = false) {
    const canvasBytesPerRow = Math.ceil(width / 8);
    const output = new Uint8Array(outputWidthBytes * height);
    const offset = center ? Math.floor((outputWidthBytes - canvasBytesPerRow) / 2) : 0;

    for (let y = 0; y < height; y++) {
      for (let byteX = 0; byteX < canvasBytesPerRow; byteX++) {
        let byte = 0;

        for (let bit = 0; bit < 8; bit++) {
          const x = byteX * 8 + bit;
          if (x >= width) continue;

          const idx = (y * width + x) * 4;
          const r = pixels[idx];
          const g = pixels[idx + 1];
          const b = pixels[idx + 2];
          // Use perceptual grayscale even for threshold
          const brightness = 0.299 * r + 0.587 * g + 0.114 * b;

          if (brightness < 128) {
            byte |= (1 << (7 - bit));
          }
        }

        const outputPos = y * outputWidthBytes + offset + byteX;
        if (outputPos >= 0 && outputPos < output.length) {
          output[outputPos] = byte;
        }
      }
    }

    return output;
  }

  /**
   * Convert pixel data to raster bytes using Floyd-Steinberg dithering
   * Best for images with gradients, photos, or many colors
   * @param {Uint8ClampedArray} pixels - RGBA pixel data
   * @param {number} width - Image width
   * @param {number} height - Image height
   * @param {number} outputWidthBytes - Output width in bytes (for centering)
   * @param {boolean} center - Whether to center output in outputWidthBytes
   */
  _pixelsToRasterDithered(pixels, width, height, outputWidthBytes, center = false) {
    // Convert to grayscale with gamma correction
    const grayscale = this._rgbaToGrayscale(pixels, width, height, 1.3);

    // Apply Floyd-Steinberg dithering
    const dithered = this._floydSteinbergDither(grayscale, width, height);

    // Pack into bytes
    const canvasBytesPerRow = Math.ceil(width / 8);
    const output = new Uint8Array(outputWidthBytes * height);
    const offset = center ? Math.floor((outputWidthBytes - canvasBytesPerRow) / 2) : 0;

    for (let y = 0; y < height; y++) {
      for (let byteX = 0; byteX < canvasBytesPerRow; byteX++) {
        let byte = 0;

        for (let bit = 0; bit < 8; bit++) {
          const x = byteX * 8 + bit;
          if (x >= width) continue;

          if (dithered[y * width + x] === 1) {
            byte |= (1 << (7 - bit));
          }
        }

        const outputPos = y * outputWidthBytes + offset + byteX;
        if (outputPos >= 0 && outputPos < output.length) {
          output[outputPos] = byte;
        }
      }
    }

    return output;
  }

  /**
   * Convert pixel data to raster bytes (auto-selects best method)
   * @param {Uint8ClampedArray} pixels - RGBA pixel data
   * @param {number} width - Image width
   * @param {number} height - Image height
   * @param {number} outputWidthBytes - Output width in bytes (for centering)
   * @param {boolean} center - Whether to center output in outputWidthBytes
   */
  _pixelsToRaster(pixels, width, height, outputWidthBytes, center = false) {
    // Auto-detect whether to use dithering based on image content
    const useDithering = this._shouldUseDithering(pixels, width, height);

    if (useDithering) {
      console.log('Using Floyd-Steinberg dithering for better image quality');
      return this._pixelsToRasterDithered(pixels, width, height, outputWidthBytes, center);
    } else {
      console.log('Using threshold method for crisp text/graphics');
      return this._pixelsToRasterThreshold(pixels, width, height, outputWidthBytes, center);
    }
  }

  /**
   * Get canvas image data as raster format for printing
   * Renders to a temporary off-screen canvas at base resolution (zoom=1)
   * @param {Array} elements - Elements to render
   * @param {number} printerWidthBytes - Printer width in bytes (48 for M110/M200, 72 for M260)
   * @param {number} printerDpi - Printer DPI (203 for most, 300 for M02 Pro)
   */
  getRasterData(elements, printerWidthBytes = DEFAULT_PRINTER_WIDTH_BYTES, printerDpi = 203) {
    let { pixels, width, height } = this._renderToPixels(elements);

    // Scale up for higher DPI printers (e.g., M02 Pro at 300 DPI)
    if (printerDpi > 203) {
      const scale = printerDpi / 203;
      const scaledWidth = Math.round(width * scale);
      const scaledHeight = Math.round(height * scale);

      // Create scaled canvas
      const scaledCanvas = document.createElement('canvas');
      scaledCanvas.width = scaledWidth;
      scaledCanvas.height = scaledHeight;
      const scaledCtx = scaledCanvas.getContext('2d');

      // Create source canvas from pixels
      const srcCanvas = document.createElement('canvas');
      srcCanvas.width = width;
      srcCanvas.height = height;
      const srcCtx = srcCanvas.getContext('2d');
      const srcImageData = srcCtx.createImageData(width, height);
      srcImageData.data.set(pixels);
      srcCtx.putImageData(srcImageData, 0, 0);

      // Scale up with smooth interpolation
      scaledCtx.imageSmoothingEnabled = true;
      scaledCtx.imageSmoothingQuality = 'high';
      scaledCtx.drawImage(srcCanvas, 0, 0, scaledWidth, scaledHeight);

      // Get scaled pixels
      const scaledImageData = scaledCtx.getImageData(0, 0, scaledWidth, scaledHeight);
      pixels = scaledImageData.data;
      width = scaledWidth;
      height = scaledHeight;

      // For high-DPI printers, use the specified printer width but left-align
      // (no centering) to avoid white gaps at the start edge
      const data = this._pixelsToRaster(pixels, width, height, printerWidthBytes, false);

      return {
        data,
        widthBytes: printerWidthBytes,
        heightLines: height,
      };
    }

    const data = this._pixelsToRaster(pixels, width, height, printerWidthBytes, true);

    return {
      data,
      widthBytes: printerWidthBytes,
      heightLines: height,
    };
  }

  /**
   * Get canvas image data as raw raster (no padding/centering)
   * Used for D-series printers that have different print widths
   *
   * Note: D30 has thermal limits - high black content (>60%) may cause
   * print failures. Use dithered grays instead of solid black for large fills.
   */
  getRasterDataRaw(elements) {
    const { pixels, width, height } = this._renderToPixels(elements);
    const widthBytes = Math.ceil(width / 8);
    const data = this._pixelsToRaster(pixels, width, height, widthBytes, false);

    return {
      data,
      widthBytes,
      heightLines: height,
    };
  }

  /**
   * Convert canvas coordinates to element-local coordinates
   */
  canvasToLocal(canvasX, canvasY, element) {
    const { x, y, width, height, rotation } = element;
    const cx = x + width / 2;
    const cy = y + height / 2;

    // Translate relative to element center
    const dx = canvasX - cx;
    const dy = canvasY - cy;

    // Rotate inversely
    const rad = (-rotation * Math.PI) / 180;
    const cos = Math.cos(rad);
    const sin = Math.sin(rad);

    return {
      x: dx * cos - dy * sin,
      y: dx * sin + dy * cos,
    };
  }
}

// Export constants
export { PX_PER_MM, PRINTER_WIDTH_BYTES, PRINTER_WIDTH_PIXELS };
