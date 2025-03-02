const { Command } = require('commander');
const usb = require('usb');
const fs = require('fs');
const path = require('path');
const { promisify } = require('util');
const { select, input } = require('@inquirer/prompts');
const sharp = require('sharp');

// Constants for printer
const PRINTER_DPI = 203;

// Define common label sizes (width in mm, length in mm)
const LABEL_SIZES = {
  'M200': { name: 'Phomemo M200 (53mm)', widthMm: 53, lengthMm: 30 },
  'M260': { name: 'Phomemo M260 (53mm)', widthMm: 53, lengthMm: 30 },
  '40x30': { name: 'Label 40mm x 30mm', widthMm: 40, lengthMm: 30 },
  '60x40': { name: 'Label 60mm x 40mm', widthMm: 60, lengthMm: 40 },
  'custom': { name: 'Custom Size', widthMm: null, lengthMm: null }
};

// Calculate pixels based on mm at 203 DPI
function mmToPixels(mm) {
  const inches = mm / 25.4;
  return Math.floor(inches * PRINTER_DPI);
}

// Calculate bytes per line based on pixel width
function pixelsToBytes(pixels) {
  return Math.ceil(pixels / 8);
}

// Command constants for Phomemo M260
const COMMANDS = {
  INIT: Buffer.from([0x1B, 0x40]), // Initialize printer (ESC @)
  FEED: (lines) => Buffer.from([0x1B, 0x64, lines]), // Feed n lines (ESC d n)
  FEED_UNITS: (units) => Buffer.from([0x1B, 0x4A, units]), // Feed by units (ESC J n)
  LINE_SPACING: (dots) => Buffer.from([0x1B, 0x33, dots]), // Set line spacing (ESC 3 n)
  DEFAULT_LINE_SPACING: Buffer.from([0x1B, 0x32]), // Default line spacing (ESC 2)
  CENTER_ALIGN: Buffer.from([0x1B, 0x61, 0x01]), // Center alignment (ESC a 1)
  LEFT_ALIGN: Buffer.from([0x1B, 0x61, 0x00]), // Left alignment (ESC a 0)
  DENSITY_HIGH: Buffer.from([0x1D, 0x7C, 0x06]), // High print density (GS | 6)
  RASTER: Buffer.from([0x1D, 0x76, 0x30, 0x00]), // Start raster graphic mode (GS v 0 0)
  POSITION_PRINT: Buffer.from([0x1B, 0x4C]), // Set left margin (ESC L nL nH) - added for positioning
  TEST_PATTERN: Buffer.from([0x1D, 0x28, 0x4C, 0x02, 0x00, 0x30, 0x32]) // Print a test pattern
};

// Set up command line interface
const program = new Command();
program
  .option('-f, --file <path>', 'path for image to print', './test.png')
  .option('-l, --label <type>', 'label type (M200, M260, 40x30, 60x40, custom)', 'M260')
  .option('-w, --width <mm>', 'custom label width in mm')
  .option('-h, --height <mm>', 'custom label length/height in mm')
  .option('-v, --vendor <id>', 'USB vendor ID in hex (e.g. 0x483)', '0x483')
  .option('-p, --product <id>', 'USB product ID in hex (e.g. 0x5740)', '0x5740')
  .option('-d, --density <level>', 'print density (1-8, default: 6)', '6')
  .option('-m, --margin <mm>', 'margin in mm (default: 2)', '2')
  .option('-o, --offset <bytes>', 'manual offset from left edge in bytes', '0')
  .option('-y, --voffset <dots>', 'vertical offset in dots (203 dots per inch)', '0')
  .option('-t, --test', 'print a test pattern to help align')
  .option('-i, --initial-feed <dots>', 'initial feed in dots before printing', '12')
  .option('-n, --final-feed <dots>', 'final feed in dots after printing', '30');
program.parse(process.argv);
const options = program.opts();

// Global variables
let labelWidthMm = 0;
let labelLengthMm = 0;
let labelWidthPixels = 0;
let labelLengthPixels = 0;
let bytesPerLine = 0;

// Utility functions
function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// Find USB device by vendor and product ID
function findUsbDevice(vendorId, productId) {
  // Convert hex string to integer if needed
  const vid = typeof vendorId === 'string' && vendorId.startsWith('0x') 
    ? parseInt(vendorId, 16) 
    : parseInt(vendorId);
    
  const pid = typeof productId === 'string' && productId.startsWith('0x') 
    ? parseInt(productId, 16) 
    : parseInt(productId);

  console.log(`Looking for USB device with vendor ID: 0x${vid.toString(16)} and product ID: 0x${pid.toString(16)}`);
  
  const devices = usb.getDeviceList();
  console.log(`Found ${devices.length} USB devices`);
  
  const matchingDevices = devices.filter(device => {
    return device.deviceDescriptor.idVendor === vid && 
           device.deviceDescriptor.idProduct === pid;
  });
  
  console.log(`Found ${matchingDevices.length} matching devices`);
  return matchingDevices.length > 0 ? matchingDevices[0] : null;
}

// List all USB devices
function listUsbDevices() {
  const devices = usb.getDeviceList();
  console.log(`\nAvailable USB devices (${devices.length} total):`);
  
  devices.forEach((device, index) => {
    const vid = device.deviceDescriptor.idVendor;
    const pid = device.deviceDescriptor.idProduct;
    console.log(`${index + 1}. Vendor ID: 0x${vid.toString(16)}, Product ID: 0x${pid.toString(16)}`);
  });
  
  return devices;
}

// Setup the USB device for communication
async function setupUsbDevice(device) {
  if (!device) {
    throw new Error('No device provided');
  }

  try {
    // Open the device
    device.open();
    
    // Find the interface
    const interfaces = device.interfaces;
    
    if (interfaces.length === 0) {
      throw new Error('No interfaces found on the device');
    }
    
    console.log(`Device has ${interfaces.length} interfaces`);
    
    // Try to find a printer interface (typically class 7)
    const printerInterfaces = interfaces.filter(iface => 
      iface.descriptor.bInterfaceClass === 7 // Printer class
    );
    
    let selectedInterface = null;
    
    if (printerInterfaces.length > 0) {
      console.log(`Found ${printerInterfaces.length} printer interfaces`);
      selectedInterface = printerInterfaces[0];
    } else {
      // If no printer interfaces, use the first one
      console.log('No printer interfaces found, using the first interface');
      selectedInterface = interfaces[0];
    }
    
    // Log interface details
    console.log(`Using interface ${selectedInterface.interfaceNumber}`);
    console.log(`Interface class: ${selectedInterface.descriptor.bInterfaceClass}`);
    console.log(`Interface subclass: ${selectedInterface.descriptor.bInterfaceSubClass}`);
    console.log(`Interface protocol: ${selectedInterface.descriptor.bInterfaceProtocol}`);
    
    // Try to claim the interface
    try {
      selectedInterface.claim();
    } catch (error) {
      console.warn(`Warning: Could not claim interface: ${error.message}`);
      console.log('Attempting to proceed anyway...');
    }
    
    // Find OUT endpoint (to send data to printer)
    const endpoints = selectedInterface.endpoints;
    console.log(`Interface has ${endpoints.length} endpoints`);
    
    endpoints.forEach((endpoint, i) => {
      console.log(`Endpoint ${i+1}: Address 0x${endpoint.descriptor.bEndpointAddress.toString(16)}, Direction: ${(endpoint.direction === 'out') ? 'OUT' : 'IN'}`);
    });
    
    const outEndpoint = endpoints.find(endpoint => 
      endpoint.direction === 'out'
    );
    
    if (!outEndpoint) {
      throw new Error('No OUT endpoint found for sending data');
    }
    
    console.log(`Using OUT endpoint with address 0x${outEndpoint.descriptor.bEndpointAddress.toString(16)}`);
    
    // Return the endpoint for sending data
    return { device, interface: selectedInterface, endpoint: outEndpoint };
  } catch (error) {
    // Clean up if there's an error
    if (device.opened) {
      device.close();
    }
    throw error;
  }
}

// Process an image into a 1-bit monochrome format suitable for the printer
async function processImage(imagePath) {
  console.log(`Processing image: ${imagePath}`);
  
  try {
    // Get image metadata
    const metadata = await sharp(imagePath).metadata();
    console.log(`Original image dimensions: ${metadata.width}x${metadata.height}`);
    
    // Calculate target dimensions with stricter constraints
    const marginPixels = mmToPixels(parseInt(options.margin) || 2);
    const targetWidth = labelWidthPixels - (marginPixels * 2);
    
    console.log(`Processing to fit ${targetWidth} pixels width with ${marginPixels}px margins`);
    console.log(`Creating label canvas: ${labelWidthPixels}x${labelLengthPixels} pixels`);
    
    // First resize the image to fit within the label boundaries (respecting aspect ratio)
    let resizedImage = await sharp(imagePath)
      .resize({
        width: targetWidth,
        height: labelLengthPixels - (marginPixels * 2),
        fit: 'inside',
        withoutEnlargement: false // Allow enlargement if image is too small
      })
      .greyscale()
      .normalize()
      .threshold(128)
      .raw()
      .toBuffer({resolveWithObject: true});
      
    console.log(`Resized image: ${resizedImage.info.width}x${resizedImage.info.height} pixels`);
    
    // Create a plain raw buffer of white pixels for the exact label dimensions
    const backgroundWidth = labelWidthPixels;
    const backgroundHeight = labelLengthPixels;
    const backgroundData = Buffer.alloc(backgroundWidth * backgroundHeight, 255); // Fill with white (255)
    
    // Calculate position to center the image on the label
    const xPosition = Math.floor((labelWidthPixels - resizedImage.info.width) / 2);
    
    // Apply vertical offset if specified (defaulting to centering)
    const verticalOffset = parseInt(options.voffset) || 0;
    const yPosition = Math.floor((labelLengthPixels - resizedImage.info.height) / 2) + verticalOffset;
    
    console.log(`Placing image at position: (${xPosition}, ${yPosition}) with vertical offset: ${verticalOffset}`);
    
    // Manually composite the resized image onto the white background
    // This avoids the Sharp library's create() limitations
    for (let y = 0; y < resizedImage.info.height; y++) {
      for (let x = 0; x < resizedImage.info.width; x++) {
        const sourcePos = y * resizedImage.info.width + x;
        const targetPos = (y + yPosition) * backgroundWidth + (x + xPosition);
        
        // Only copy if within bounds and the pixel is black
        if (targetPos >= 0 && 
            targetPos < backgroundData.length && 
            resizedImage.data[sourcePos] < 128) {
          backgroundData[targetPos] = 0; // Set to black (0)
        }
      }
    }
    
    console.log(`Final image size: ${backgroundWidth}x${backgroundHeight} pixels`);
    
    return {
      data: backgroundData,
      width: backgroundWidth,
      height: backgroundHeight
    };
  } catch (error) {
    console.error('Error processing image:', error);
    throw error;
  }
}

// Send data to the printer
async function sendToPrinter(endpoint, data) {
  return new Promise((resolve, reject) => {
    endpoint.transfer(data, (error) => {
      if (error) reject(error);
      else resolve();
    });
  });
}

// Convert raw pixel data to printer raster format
function convertToRasterFormat(imageData, width, height) {
  console.log(`Converting image data: ${width}x${height} pixels`);
  
  // Reverting to a more standard/compatible printer width
  // 72 bytes (576 pixels) is the standard for 80mm thermal printers
  const printerFullWidthBytes = 72; // Using standard 80mm printer width instead of 80 bytes
  
  console.log(`Using printer width of ${printerFullWidthBytes} bytes (${printerFullWidthBytes * 8} pixels)`);
  
  // Calculate bytes needed for our image
  const imageBytesPerLine = pixelsToBytes(labelWidthPixels);
  console.log(`Image width in bytes: ${imageBytesPerLine}`);
  
  // Get the manual offset from command line (can be positive or negative)
  const manualOffset = parseInt(options.offset) || 0;
  console.log(`Manual offset requested: ${manualOffset} bytes`);
  
  // Create buffer for raster data
  let rasterData = [];
  
  // Process the image in chunks of up to 255 lines
  for (let startLine = 0; startLine < height; startLine += 255) {
    // Calculate lines in this chunk
    const chunkLines = Math.min(255, height - startLine);
    console.log(`Processing chunk: lines ${startLine} to ${startLine + chunkLines - 1}`);
    
    // Add raster command
    rasterData.push(...COMMANDS.RASTER);
    
    // Always use the full printer width
    rasterData.push(printerFullWidthBytes & 0xFF);
    rasterData.push((printerFullWidthBytes >> 8) & 0xFF);
    
    // Add height bytes (little endian)
    rasterData.push(chunkLines & 0xFF);
    rasterData.push((chunkLines >> 8) & 0xFF);
    
    // Process each line in this chunk
    for (let y = 0; y < chunkLines; y++) {
      const lineIndex = startLine + y;
      
      // Create a full-width buffer for this line, initialized to all zeros (white)
      const lineBuffer = Buffer.alloc(printerFullWidthBytes, 0);
      
      // Calculate left position including the manual offset
      // For extreme left positioning, this could be negative, which is fine
      const leftPosition = Math.floor((printerFullWidthBytes - imageBytesPerLine) / 2) + manualOffset;
      
      // For each byte in our image
      for (let x = 0; x < imageBytesPerLine; x++) {
        const targetPos = leftPosition + x;
        
        // Skip if this position is outside the printable width
        if (targetPos < 0 || targetPos >= printerFullWidthBytes) continue;
        
        // Create the byte from 8 pixels
        let byte = 0;
        for (let bit = 0; bit < 8; bit++) {
          const pixelX = x * 8 + bit;
          
          // Skip pixels beyond the width
          if (pixelX >= width) continue;
          
          // Get the pixel value from the image data
          const pixelPos = lineIndex * width + pixelX;
          const pixelValue = pixelPos < imageData.data.length ? imageData.data[pixelPos] : 255;
          
          // Set the bit if the pixel is black (< 128)
          if (pixelValue < 128) {
            byte |= (1 << (7 - bit));
          }
        }
        
        // Set the byte in our line buffer at the calculated position
        lineBuffer[targetPos] = byte;
      }
      
      // Add the entire line buffer to the raster data
      for (let i = 0; i < printerFullWidthBytes; i++) {
        rasterData.push(lineBuffer[i]);
      }
    }
  }
  
  return Buffer.from(rasterData);
}

// Set the label size
async function setLabelSize() {
  // First check if custom width and height were provided via command line
  if (options.width && options.height) {
    labelWidthMm = parseFloat(options.width);
    labelLengthMm = parseFloat(options.height);
    console.log(`Using custom dimensions from command line: ${labelWidthMm}mm x ${labelLengthMm}mm`);
    
  } else if (options.label === 'custom') {
    // Prompt for custom dimensions
    labelWidthMm = parseFloat(await input({
      message: 'Enter label width in mm:',
      default: '53',
      validate: value => !isNaN(parseFloat(value)) && parseFloat(value) > 0 ? true : 'Please enter a valid number'
    }));
    
    labelLengthMm = parseFloat(await input({
      message: 'Enter label length in mm:',
      default: '30',
      validate: value => !isNaN(parseFloat(value)) && parseFloat(value) > 0 ? true : 'Please enter a valid number'
    }));
    
    console.log(`Using custom dimensions: ${labelWidthMm}mm x ${labelLengthMm}mm`);
    
  } else if (LABEL_SIZES[options.label]) {
    // Use predefined label size
    const selectedLabel = LABEL_SIZES[options.label];
    labelWidthMm = selectedLabel.widthMm;
    labelLengthMm = selectedLabel.lengthMm;
    console.log(`Selected label: ${selectedLabel.name} (${labelWidthMm}mm x ${labelLengthMm}mm)`);
    
  } else {
    console.error(`Unknown label type: ${options.label}`);
    console.log('Available label types:');
    Object.entries(LABEL_SIZES).forEach(([key, value]) => {
      console.log(`  ${key}: ${value.name}`);
    });
    process.exit(1);
  }
  
  // Convert mm to pixels
  labelWidthPixels = mmToPixels(labelWidthMm);
  labelLengthPixels = mmToPixels(labelLengthMm);
  bytesPerLine = pixelsToBytes(labelWidthPixels);
  
  console.log(`Label dimensions in pixels: ${labelWidthPixels}x${labelLengthPixels} pixels`);
  console.log(`Bytes per line: ${bytesPerLine}`);
}

// Function to create alignment test pattern
function createAlignmentTestPattern() {
  // Create a test pattern that shows the full print width
  // with markers for positioning and vertical alignment
  
  // Using standard 72-byte width for 80mm printers
  const fullWidthBytes = 72;
  const patternHeight = 120; // Taller for better vertical alignment testing
  
  // Get manual offset values
  const horizontalOffset = parseInt(options.offset) || 0;
  const verticalOffset = parseInt(options.voffset) || 0;
  console.log(`Applying offsets to test pattern - horizontal: ${horizontalOffset} bytes, vertical: ${verticalOffset} dots`);
  console.log(`Test pattern width: ${fullWidthBytes} bytes (${fullWidthBytes * 8} pixels)`);
  
  // Create the raster data
  let patternData = [];
  
  // Add raster command
  patternData.push(...COMMANDS.RASTER);
  
  // Width of pattern (little endian)
  patternData.push(fullWidthBytes & 0xFF);
  patternData.push((fullWidthBytes >> 8) & 0xFF);
  
  // Height of pattern (little endian)
  patternData.push(patternHeight & 0xFF);
  patternData.push((patternHeight >> 8) & 0xFF);
  
  // Calculate the position of special markers based on the offset
  const centerPos = Math.floor(fullWidthBytes / 2) + horizontalOffset;
  
  // Create test pattern with markers
  for (let y = 0; y < patternHeight; y++) {
    // Create a line buffer, initialized to all zeros
    const lineBuffer = Buffer.alloc(fullWidthBytes, 0);
    
    // Add horizontal grid lines with position markers
    if (y % 10 === 0) {
      for (let x = 0; x < fullWidthBytes; x++) {
        lineBuffer[x] = 0xFF; // Full line
      }
      
      // Add position marker
      const yPos = y.toString().padStart(3, '0');
      for (let i = 0; i < yPos.length; i++) {
        // Skip if outside buffer range
        if (centerPos + i - 1 < 0 || centerPos + i - 1 >= fullWidthBytes) continue;
        // These are just visual markers, not actual text
        lineBuffer[centerPos + i - 1] = 0x55; // Pattern for the digit
      }
    }
    
    // Add markers and patterns for other lines
    for (let x = 0; x < fullWidthBytes; x++) {
      // Center line
      if (x === Math.max(0, Math.min(fullWidthBytes - 1, centerPos)) && y % 5 !== 0) {
        lineBuffer[x] = 0xFF;
      }
      // Left and right edges
      else if ((x === 0 || x === fullWidthBytes - 1) && y % 10 !== 0) {
        lineBuffer[x] = 0xFF;
      }
      // Vertical grid lines
      else if (x % 8 === 0 && y % 10 !== 0 && y % 5 !== 0) {
        lineBuffer[x] = 0x80; // Just the leftmost bit
      }
    }
    
    // Mid-height reference line
    if (y === Math.floor(patternHeight / 2)) {
      for (let x = 0; x < fullWidthBytes; x++) {
        lineBuffer[x] = 0xAA; // Alternating pattern
      }
    }
    
    // Add the line to the pattern data
    for (let i = 0; i < fullWidthBytes; i++) {
      patternData.push(lineBuffer[i]);
    }
  }
  
  return Buffer.from(patternData);
}

// Helper function for USB cleanup
function cleanupUsb(usbInfo) {
  try {
    usbInfo.interface.release(true, (err) => {
      if (err) console.warn(`Warning: Error releasing interface: ${err.message}`);
      usbInfo.device.close();
      console.log('USB device closed');
    });
  } catch (err) {
    console.warn(`Warning: Error during cleanup: ${err.message}`);
  }
}

// Main function
async function main() {
  try {
    console.log('=== PHOMEMO USB PRINTER - CUSTOM SIZE WITH VERTICAL ALIGNMENT ===');
    
    // Set label size
    await setLabelSize();
    
    // List available USB devices
    const devices = listUsbDevices();
    
    // Find the printer
    let device = findUsbDevice(options.vendor, options.product);
    
    // If no device found, let user select one
    if (!device) {
      console.log('\nSpecified device not found. Please select from available devices:');
      
      // Create device selection choices
      const choices = devices.map((device, index) => ({
        name: `${index + 1}. Vendor ID: 0x${device.deviceDescriptor.idVendor.toString(16)}, Product ID: 0x${device.deviceDescriptor.idProduct.toString(16)}`,
        value: index
      }));
      
      // Use the select function from @inquirer/prompts
      const deviceIndex = await select({
        message: 'Select a USB device:',
        choices: choices
      });
      
      device = devices[deviceIndex];
    }
    
    if (!device) {
      console.error('No USB device selected. Exiting.');
      process.exit(1);
    }
    
    // Set up USB device
    console.log('\nSetting up USB device...');
    const usbInfo = await setupUsbDevice(device);
    
    // Initialize printer
    console.log('Initializing printer...');
    await sendToPrinter(usbInfo.endpoint, COMMANDS.INIT);
    await delay(100);
    
    // Set line spacing to 0 for more precise control
    await sendToPrinter(usbInfo.endpoint, COMMANDS.LINE_SPACING(0));
    await delay(50);
    
    // Set center alignment
    await sendToPrinter(usbInfo.endpoint, COMMANDS.CENTER_ALIGN);
    await delay(50);
    
    // Set print density
    const densityLevel = parseInt(options.density) || 6;
    const densityCommand = Buffer.from([0x1D, 0x7C, densityLevel]);
    console.log(`Setting print density to level ${densityLevel}`);
    await sendToPrinter(usbInfo.endpoint, densityCommand);
    await delay(50);
    
    // Initial feed before printing (customizable)
    const initialFeed = parseInt(options.initialFeed) || 12;
    console.log(`Initial feed: ${initialFeed} dots`);
    await sendToPrinter(usbInfo.endpoint, COMMANDS.FEED_UNITS(initialFeed));
    await delay(100);
    
    // Check if this is a test print
    if (options.test) {
      console.log('Printing test pattern to help with alignment...');
      
      // Add a fixed width test pattern to help with alignment
      const testPatternData = createAlignmentTestPattern();
      await sendToPrinter(usbInfo.endpoint, testPatternData);
      
      // Feed paper and finish
      const finalFeed = parseInt(options.feed2) || 30;
      console.log(`Final feed: ${finalFeed} dots`);
      await sendToPrinter(usbInfo.endpoint, COMMANDS.FEED_UNITS(finalFeed));
      console.log('Test pattern printed successfully!');
      
      // Clean up
      cleanupUsb(usbInfo);
      process.exit(0);
    }
    
    // Process image
    console.log('\nProcessing image...');
    const imagePath = options.file;
    if (!fs.existsSync(imagePath)) {
      console.error(`Image file not found: ${imagePath}`);
      process.exit(1);
    }
    
    // Process the image
    const imageData = await processImage(imagePath);
    
    // Convert the image data to printer raster format
    const rasterData = convertToRasterFormat(imageData, imageData.width, imageData.height);
    console.log(`Generated ${rasterData.length} bytes of raster data`);
    
    // Send data to printer
    console.log('\nSending data to printer...');
    
    // Send raster data in chunks
    const CHUNK_SIZE = 512;
    const chunks = Math.ceil(rasterData.length / CHUNK_SIZE);
    console.log(`Sending data in ${chunks} chunks...`);
    
    for (let i = 0; i < rasterData.length; i += CHUNK_SIZE) {
      const chunk = rasterData.slice(i, Math.min(i + CHUNK_SIZE, rasterData.length));
      await sendToPrinter(usbInfo.endpoint, chunk);
      
      const progress = Math.round((i / rasterData.length) * 100);
      console.log(`Sent chunk ${Math.floor(i / CHUNK_SIZE) + 1}/${chunks} (${progress}%)`);
      
      await delay(20); // Small delay between chunks
    }
    
    // Final feed to ensure the print is visible and create room for cutting
    const finalFeed = parseInt(options.finalFeed) || 30;
    console.log(`Final feed: ${finalFeed} dots`);
    await sendToPrinter(usbInfo.endpoint, COMMANDS.FEED_UNITS(finalFeed));
    
    console.log('\nPrint job completed!');
    
    // Clean up
    cleanupUsb(usbInfo);
    
  } catch (error) {
    console.error(`Error: ${error.message}`);
    console.error(error.stack);
    process.exit(1);
  }
}

// Run the main function
main();