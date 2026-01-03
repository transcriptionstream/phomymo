/**
 * Image processing for Node.js using Sharp
 * Handles image loading, resizing, and conversion to grayscale
 */

const sharp = require('sharp');
const { mmToPixels } = require('./constants');

/**
 * Process an image for printing
 *
 * @param {string} imagePath - Path to the image file
 * @param {Object} labelDimensions - Label dimensions in pixels
 * @param {number} labelDimensions.widthPixels - Label width in pixels
 * @param {number} labelDimensions.heightPixels - Label height (length) in pixels
 * @param {Object} options - Processing options
 * @param {number} options.marginMm - Margin in mm (default: 2)
 * @param {number} options.verticalOffset - Vertical offset in dots (default: 0)
 * @param {number} options.threshold - Black/white threshold (default: 128)
 * @returns {Promise<Object>} Processed image data { data, width, height }
 */
async function processImage(imagePath, labelDimensions, options = {}) {
  const {
    marginMm = 2,
    verticalOffset = 0,
    threshold = 128,
  } = options;

  const { widthPixels, heightPixels } = labelDimensions;
  const marginPixels = mmToPixels(marginMm);
  const targetWidth = widthPixels - (marginPixels * 2);
  const targetHeight = heightPixels - (marginPixels * 2);

  // Get image metadata
  const metadata = await sharp(imagePath).metadata();
  console.log(`Original image dimensions: ${metadata.width}x${metadata.height}`);
  console.log(`Processing to fit ${targetWidth} pixels width with ${marginPixels}px margins`);
  console.log(`Creating label canvas: ${widthPixels}x${heightPixels} pixels`);

  // Resize the image to fit within the label boundaries (respecting aspect ratio)
  const resizedImage = await sharp(imagePath)
    .resize({
      width: targetWidth,
      height: targetHeight,
      fit: 'inside',
      withoutEnlargement: false,
    })
    .greyscale()
    .normalize()
    .threshold(threshold)
    .raw()
    .toBuffer({ resolveWithObject: true });

  console.log(`Resized image: ${resizedImage.info.width}x${resizedImage.info.height} pixels`);

  // Create a white background buffer for the exact label dimensions
  const backgroundData = Buffer.alloc(widthPixels * heightPixels, 255);

  // Calculate position to center the image on the label
  const xPosition = Math.floor((widthPixels - resizedImage.info.width) / 2);
  const yPosition = Math.floor((heightPixels - resizedImage.info.height) / 2) + verticalOffset;

  console.log(`Placing image at position: (${xPosition}, ${yPosition}) with vertical offset: ${verticalOffset}`);

  // Composite the resized image onto the white background
  for (let y = 0; y < resizedImage.info.height; y++) {
    for (let x = 0; x < resizedImage.info.width; x++) {
      const sourcePos = y * resizedImage.info.width + x;
      const targetY = y + yPosition;
      const targetX = x + xPosition;

      // Bounds check
      if (targetY < 0 || targetY >= heightPixels) continue;
      if (targetX < 0 || targetX >= widthPixels) continue;

      const targetPos = targetY * widthPixels + targetX;

      // Copy black pixels (value < 128)
      if (resizedImage.data[sourcePos] < 128) {
        backgroundData[targetPos] = 0;
      }
    }
  }

  console.log(`Final image size: ${widthPixels}x${heightPixels} pixels`);

  return {
    data: backgroundData,
    width: widthPixels,
    height: heightPixels,
  };
}

/**
 * Calculate label dimensions in pixels from mm
 *
 * @param {number} widthMm - Label width in mm
 * @param {number} lengthMm - Label length in mm
 * @returns {Object} Dimensions in pixels
 */
function calculateLabelPixels(widthMm, lengthMm) {
  return {
    widthPixels: mmToPixels(widthMm),
    heightPixels: mmToPixels(lengthMm),
    bytesPerLine: Math.ceil(mmToPixels(widthMm) / 8),
  };
}

module.exports = {
  processImage,
  calculateLabelPixels,
};
