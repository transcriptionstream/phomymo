/**
 * Canvas rendering and raster conversion for Phomymo label designer
 * Supports multi-element rendering with transforms
 */

import { drawHandles, drawGroupHandles } from './handles.js?v=5';

// Pixels per mm (203 DPI ≈ 8 px/mm)
const PX_PER_MM = 8;

// Default printer width in bytes (72 bytes = 576 pixels for M260)
// M110/M200 use 48 bytes (384 pixels)
const DEFAULT_PRINTER_WIDTH_BYTES = 72;
const PRINTER_WIDTH_BYTES = DEFAULT_PRINTER_WIDTH_BYTES;
const PRINTER_WIDTH_PIXELS = PRINTER_WIDTH_BYTES * 8;

// Overflow area padding in pixels (visible area around label)
const OVERFLOW_PADDING = 120;

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

    // Barcode/QR render cache
    this.renderCache = new Map();

    // Callback for when async content (barcodes, QR) finishes loading
    this.onAsyncLoad = null;
  }

  /**
   * Set label dimensions and resize canvas
   * @param {number} widthMm - Label width in mm
   * @param {number} heightMm - Label height in mm
   * @param {number} zoom - Zoom level (1 = 100%, 2 = 200%, etc.)
   */
  setDimensions(widthMm, heightMm, zoom = this.zoom) {
    this.widthMm = widthMm;
    this.heightMm = heightMm;
    this.zoom = zoom;

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
    this.setDimensions(this.widthMm, this.heightMm, zoom);
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
   * Clear canvas - checkerboard overflow area with white label
   */
  clear() {
    const ctx = this.ctx;
    const zoom = this.zoom;

    // Draw checkerboard pattern for entire canvas (overflow area)
    this.drawCheckerboard(ctx, 0, 0, this.canvas.width, this.canvas.height);

    // Draw white label area with rounded corners (like physical labels)
    // Scale dimensions by zoom
    ctx.fillStyle = 'white';
    ctx.beginPath();
    ctx.roundRect(
      this.labelOffsetX,
      this.labelOffsetY,
      this.labelWidth * zoom,
      this.labelHeight * zoom,
      8 * zoom
    );
    ctx.fill();
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
    for (const element of elements) {
      this.renderElement(element);
    }

    // Draw alignment guides (after elements, before handles)
    this.drawAlignmentGuides(alignmentGuides);

    // Draw handles based on selection
    if (selectedArray.length === 1) {
      // Single selection - check if it's part of a group
      const selected = elements.find(e => e.id === selectedArray[0]);
      if (selected) {
        if (selected.groupId) {
          // Element is part of a group - draw group handles
          const groupMembers = elements.filter(e => e.groupId === selected.groupId);
          const bounds = this.getMultiElementBounds(groupMembers);
          if (bounds) {
            drawGroupHandles(ctx, bounds);
          }
        } else {
          // Single ungrouped element
          drawHandles(ctx, selected);
        }
      }
    } else if (selectedArray.length > 1) {
      // Multi-selection - draw group bounding box
      const selectedElements = elements.filter(e => selectedArray.includes(e.id));
      const bounds = this.getMultiElementBounds(selectedElements);
      if (bounds) {
        drawGroupHandles(ctx, bounds);
      }
    }

    ctx.restore();

    // Dim overflow areas (content outside label bounds)
    this.dimOverflowContent();
  }

  /**
   * Dim content that extends outside the label area
   * Uses semi-transparent overlay with rounded label cutout
   */
  dimOverflowContent() {
    const ctx = this.ctx;
    const zoom = this.zoom;
    ctx.save();

    // Create path covering entire canvas with rounded label hole
    ctx.beginPath();
    // Outer rectangle (clockwise)
    ctx.rect(0, 0, this.canvas.width, this.canvas.height);
    // Inner rounded rectangle (counter-clockwise to create hole) - scale by zoom
    ctx.roundRect(
      this.labelOffsetX,
      this.labelOffsetY,
      this.labelWidth * zoom,
      this.labelHeight * zoom,
      8 * zoom
    );

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

    // Render elements without handles
    for (const element of elements) {
      this.renderElement(element);
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

    // Get or create cached image
    let img = this.imageCache.get(element.id);
    if (!img || img.src !== imageData) {
      img = new Image();
      img.onload = () => {
        // Trigger re-render when image finishes loading
        if (this.onAsyncLoad) {
          this.onAsyncLoad();
        }
      };
      img.src = imageData;
      this.imageCache.set(element.id, img);
    }

    if (img.complete && img.naturalWidth > 0) {
      this.ctx.drawImage(img, -width / 2, -height / 2, width, height);
    }
  }

  /**
   * Render barcode element (centered at origin)
   */
  renderBarcodeElement(element, width, height) {
    const { barcodeData, barcodeFormat } = element;

    if (!barcodeData || !barcodeData.trim()) return;

    const cacheKey = `barcode_${element.id}_${barcodeData}_${barcodeFormat}_${width}_${height}`;
    let cachedCanvas = this.renderCache.get(cacheKey);

    if (!cachedCanvas) {
      try {
        // Create SVG barcode
        const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
        JsBarcode(svg, barcodeData, {
          format: barcodeFormat || 'CODE128',
          width: 2,
          height: Math.round(height * 0.7),
          displayValue: true,
          fontSize: 12,
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

          // Scale to fit
          const scale = Math.min(width / tempImg.width, height / tempImg.height) * 0.95;
          const scaledW = tempImg.width * scale;
          const scaledH = tempImg.height * scale;
          const dx = (width - scaledW) / 2;
          const dy = (height - scaledH) / 2;

          tempCtx.fillStyle = 'white';
          tempCtx.fillRect(0, 0, width, height);
          tempCtx.drawImage(tempImg, dx, dy, scaledW, scaledH);

          this.renderCache.set(cacheKey, cachedCanvas);
          URL.revokeObjectURL(url);

          // Trigger re-render to show the loaded barcode
          if (this.onAsyncLoad) {
            this.onAsyncLoad();
          }
        };
        tempImg.src = url;
      } catch (e) {
        console.error('Barcode render error:', e);
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
    let cachedCanvas = this.renderCache.get(cacheKey);

    if (!cachedCanvas) {
      try {
        cachedCanvas = document.createElement('canvas');
        QRCode.toCanvas(cachedCanvas, qrData, {
          width: size,
          margin: 1,
          color: { dark: '#000000', light: '#ffffff' },
        }, (error) => {
          if (error) {
            console.error('QR render error:', error);
            this.renderCache.delete(cacheKey);
          } else {
            this.renderCache.set(cacheKey, cachedCanvas);
            // Trigger re-render to show the loaded QR code
            if (this.onAsyncLoad) {
              this.onAsyncLoad();
            }
          }
        });
      } catch (e) {
        console.error('QR error:', e);
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
    const words = text.split(/\s+/);
    const lines = [];
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
    } else {
      this.renderCache.clear();
      this.imageCache.clear();
    }
  }

  /**
   * Get canvas image data as raster format for printing
   * Renders to a temporary off-screen canvas at base resolution (zoom=1)
   * @param {Array} elements - Elements to render
   * @param {number} printerWidthBytes - Printer width in bytes (48 for M110/M200, 72 for M260)
   */
  getRasterData(elements, printerWidthBytes = DEFAULT_PRINTER_WIDTH_BYTES) {
    // Create temporary canvas at base resolution for printing
    const width = this.labelWidth;
    const height = this.labelHeight;
    const tempCanvas = document.createElement('canvas');
    tempCanvas.width = width;
    tempCanvas.height = height;
    const tempCtx = tempCanvas.getContext('2d');

    // Fill with white background
    tempCtx.fillStyle = 'white';
    tempCtx.fillRect(0, 0, width, height);

    // Render elements to temp canvas (no offset needed - temp canvas is label-sized)
    const originalCtx = this.ctx;
    this.ctx = tempCtx;
    for (const element of elements) {
      this.renderElement(element);
    }
    this.ctx = originalCtx;

    // Get image data
    const imageData = tempCtx.getImageData(0, 0, width, height);
    const pixels = imageData.data;

    // Calculate bytes per row of canvas
    const canvasBytesPerRow = Math.ceil(width / 8);

    // Prepare output: full printer width x canvas height
    const output = new Uint8Array(printerWidthBytes * height);

    // Calculate centering offset
    const offset = Math.floor((printerWidthBytes - canvasBytesPerRow) / 2);

    // Convert pixels to bits
    for (let y = 0; y < height; y++) {
      for (let byteX = 0; byteX < canvasBytesPerRow; byteX++) {
        let byte = 0;

        for (let bit = 0; bit < 8; bit++) {
          const x = byteX * 8 + bit;
          if (x >= width) continue;

          // Get pixel value (RGBA)
          const idx = (y * width + x) * 4;
          const r = pixels[idx];
          const g = pixels[idx + 1];
          const b = pixels[idx + 2];

          // Calculate brightness
          const brightness = (r + g + b) / 3;

          // Black pixel (brightness < 128) = set bit to 1
          if (brightness < 128) {
            byte |= (1 << (7 - bit));
          }
        }

        // Write byte at centered position
        const outputPos = y * printerWidthBytes + offset + byteX;
        if (outputPos >= 0 && outputPos < output.length) {
          output[outputPos] = byte;
        }
      }
    }

    return {
      data: output,
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
    // Create temporary canvas at base resolution for printing
    const width = this.labelWidth;
    const height = this.labelHeight;
    const tempCanvas = document.createElement('canvas');
    tempCanvas.width = width;
    tempCanvas.height = height;
    const tempCtx = tempCanvas.getContext('2d');

    // Fill with white background
    tempCtx.fillStyle = 'white';
    tempCtx.fillRect(0, 0, width, height);

    // Render elements to temp canvas
    const originalCtx = this.ctx;
    this.ctx = tempCtx;
    for (const element of elements) {
      this.renderElement(element);
    }
    this.ctx = originalCtx;

    // Get image data
    const imageData = tempCtx.getImageData(0, 0, width, height);
    const pixels = imageData.data;

    // Calculate bytes per row (actual label width, no padding)
    const widthBytes = Math.ceil(width / 8);

    // Output: actual label width x height
    const output = new Uint8Array(widthBytes * height);

    // Convert pixels to bits
    for (let y = 0; y < height; y++) {
      for (let byteX = 0; byteX < widthBytes; byteX++) {
        let byte = 0;

        for (let bit = 0; bit < 8; bit++) {
          const x = byteX * 8 + bit;
          if (x >= width) continue;

          // Get pixel value (RGBA)
          const idx = (y * width + x) * 4;
          const r = pixels[idx];
          const g = pixels[idx + 1];
          const b = pixels[idx + 2];

          // Calculate brightness
          const brightness = (r + g + b) / 3;

          // Black pixel (brightness < 128) = set bit to 1
          if (brightness < 128) {
            byte |= (1 << (7 - bit));
          }
        }

        output[y * widthBytes + byteX] = byte;
      }
    }

    return {
      data: output,
      widthBytes: widthBytes,
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
