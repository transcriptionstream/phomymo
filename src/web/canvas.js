/**
 * Canvas rendering and raster conversion for Phomymo label designer
 * Supports multi-element rendering with transforms
 */

import { drawHandles, drawGroupHandles } from './handles.js?v=4';

// Pixels per mm (203 DPI ≈ 8 px/mm)
const PX_PER_MM = 8;

// Full printer width in bytes (72 bytes = 576 pixels)
const PRINTER_WIDTH_BYTES = 72;
const PRINTER_WIDTH_PIXELS = PRINTER_WIDTH_BYTES * 8;

/**
 * Canvas renderer class
 */
export class CanvasRenderer {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.widthMm = 40;
    this.heightMm = 30;

    // Image cache for elements
    this.imageCache = new Map();

    // Barcode/QR render cache
    this.renderCache = new Map();

    // Callback for when async content (barcodes, QR) finishes loading
    this.onAsyncLoad = null;
  }

  /**
   * Set label dimensions and resize canvas
   */
  setDimensions(widthMm, heightMm) {
    this.widthMm = widthMm;
    this.heightMm = heightMm;

    // Canvas dimensions in pixels
    const canvasWidth = Math.round(widthMm * PX_PER_MM);
    const canvasHeight = Math.round(heightMm * PX_PER_MM);

    this.canvas.width = canvasWidth;
    this.canvas.height = canvasHeight;

    return { width: canvasWidth, height: canvasHeight };
  }

  /**
   * Get dimensions in pixels
   */
  getDimensions() {
    return {
      width: this.canvas.width,
      height: this.canvas.height,
      widthMm: this.widthMm,
      heightMm: this.heightMm,
    };
  }

  /**
   * Clear canvas to white
   */
  clear() {
    this.ctx.fillStyle = 'white';
    this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
  }

  /**
   * Render all elements
   * @param {Array} elements - Array of elements to render
   * @param {Array|string|null} selectedIds - Array of selected element IDs (or single ID for backwards compatibility)
   */
  renderAll(elements, selectedIds = null) {
    this.clear();

    // Normalize to array
    const selectedArray = selectedIds
      ? (Array.isArray(selectedIds) ? selectedIds : [selectedIds])
      : [];

    // Render elements in z-order (first = bottom)
    for (const element of elements) {
      this.renderElement(element);
    }

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
            drawGroupHandles(this.ctx, bounds);
          }
        } else {
          // Single ungrouped element
          drawHandles(this.ctx, selected);
        }
      }
    } else if (selectedArray.length > 1) {
      // Multi-selection - draw group bounding box
      const selectedElements = elements.filter(e => selectedArray.includes(e.id));
      const bounds = this.getMultiElementBounds(selectedElements);
      if (bounds) {
        drawGroupHandles(this.ctx, bounds);
      }
    }
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
    }

    this.ctx.restore();
  }

  /**
   * Render text element (centered at origin)
   */
  renderTextElement(element, width, height) {
    const { text, fontSize, align, fontFamily, fontWeight, fontStyle, textDecoration } = element;

    if (!text || !text.trim()) return;

    this.ctx.fillStyle = 'black';

    // Build font string with weight and style
    const weight = fontWeight === 'bold' ? 'bold' : '';
    const style = fontStyle === 'italic' ? 'italic' : '';
    const fontStr = `${style} ${weight} ${fontSize}px ${fontFamily || 'Inter, sans-serif'}`.trim();
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

    // Word wrap
    const lines = this.wrapText(text, width - 8, fontSize, fontFamily, fontWeight, fontStyle);
    const lineHeight = fontSize * 1.2;
    const totalHeight = lines.length * lineHeight;
    let textY = -totalHeight / 2 + lineHeight / 2;

    for (const line of lines) {
      this.ctx.fillText(line, textX, textY);

      // Draw underline manually if enabled
      if (textDecoration === 'underline') {
        const metrics = this.ctx.measureText(line);
        // Position underline below text - since textBaseline is 'middle',
        // the bottom of the text is at textY + fontSize/2, add small gap
        const underlineY = textY + fontSize * 0.45;
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
        this.ctx.strokeStyle = 'black';
        this.ctx.lineWidth = Math.max(1, fontSize / 16);
        this.ctx.moveTo(underlineX, underlineY);
        this.ctx.lineTo(underlineX + underlineWidth, underlineY);
        this.ctx.stroke();
      }

      textY += lineHeight;
    }
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
   * Renders without selection handles
   */
  getRasterData(elements) {
    // Render elements without handles
    this.clear();
    for (const element of elements) {
      this.renderElement(element);
    }

    // Get dimensions
    const width = this.canvas.width;
    const height = this.canvas.height;

    // Get image data
    const imageData = this.ctx.getImageData(0, 0, width, height);
    const pixels = imageData.data;

    // Calculate bytes per row of canvas
    const canvasBytesPerRow = Math.ceil(width / 8);

    // Prepare output: full printer width (72 bytes) x canvas height
    const output = new Uint8Array(PRINTER_WIDTH_BYTES * height);

    // Calculate centering offset
    const offset = Math.floor((PRINTER_WIDTH_BYTES - canvasBytesPerRow) / 2);

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
        const outputPos = y * PRINTER_WIDTH_BYTES + offset + byteX;
        if (outputPos >= 0 && outputPos < output.length) {
          output[outputPos] = byte;
        }
      }
    }

    return {
      data: output,
      widthBytes: PRINTER_WIDTH_BYTES,
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
