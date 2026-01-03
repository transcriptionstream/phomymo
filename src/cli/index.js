/**
 * Phomymo CLI - Command line interface for Phomemo printers
 */

const { Command } = require('commander');
const fs = require('fs');
const { input } = require('@inquirer/prompts');

const USBTransport = require('../transport/usb');
const M260Printer = require('../printers/m260');
const { LABEL_SIZES, DEFAULT_USB_VENDOR_ID, DEFAULT_USB_PRODUCT_ID, BLE_PROFILES } = require('../core/constants');

// Try to load BLE transport (optional)
let NodeBLETransport;
try {
  NodeBLETransport = require('../transport/ble-node');
} catch (err) {
  NodeBLETransport = null;
}

// Create CLI program
const program = new Command();

program
  .name('phomymo')
  .description('Print to Phomemo printers via USB or Bluetooth')
  .version('2.0.0');

// USB print command (default)
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
  .option('-n, --final-feed <dots>', 'final feed in dots after printing', '30')
  .option('--usb', 'use USB transport (default)')
  .option('--bluetooth', 'use Bluetooth transport')
  .option('--ble', 'use Bluetooth transport (alias for --bluetooth)')
  .option('--ble-service <uuid>', 'override BLE service UUID')
  .option('--ble-char <uuid>', 'override BLE characteristic UUID')
  .option('--discover', 'scan and list BLE services')
  .action(run);

/**
 * Get label configuration from options
 */
async function getLabelConfig(options) {
  // Check if custom width and height were provided
  if (options.width && options.height) {
    return {
      widthMm: parseFloat(options.width),
      lengthMm: parseFloat(options.height),
    };
  }

  // If label type is custom, prompt for dimensions
  if (options.label === 'custom') {
    const widthMm = parseFloat(await input({
      message: 'Enter label width in mm:',
      default: '53',
      validate: value => !isNaN(parseFloat(value)) && parseFloat(value) > 0 ? true : 'Please enter a valid number',
    }));

    const lengthMm = parseFloat(await input({
      message: 'Enter label length in mm:',
      default: '30',
      validate: value => !isNaN(parseFloat(value)) && parseFloat(value) > 0 ? true : 'Please enter a valid number',
    }));

    return { widthMm, lengthMm };
  }

  // Use preset label
  return M260Printer.getLabelConfig(options.label);
}

/**
 * Create transport based on options
 */
function createTransport(options) {
  const useBluetooth = options.bluetooth || options.ble;

  if (useBluetooth) {
    if (!NodeBLETransport) {
      throw new Error(
        'Bluetooth support requires @abandonware/noble.\n' +
        'Install it with: npm install @abandonware/noble\n' +
        'Then try again.'
      );
    }

    return new NodeBLETransport({
      serviceUUID: options.bleService || BLE_PROFILES.M260.SERVICE_UUID,
      characteristicUUID: options.bleChar || BLE_PROFILES.M260.CHARACTERISTIC_UUID,
    });
  }

  // Default to USB
  return new USBTransport({
    vendorId: options.vendor,
    productId: options.product,
  });
}

/**
 * Main run function
 */
async function run(options) {
  try {
    console.log('=== PHOMYMO PRINTER ===\n');

    // Handle BLE discovery
    if (options.discover) {
      console.log('Starting BLE discovery...\n');
      console.log('Run: node src/tools/ble-discover.js');
      console.log('Or:  npm run discover\n');

      // Try to run the discovery tool directly
      try {
        require('../tools/ble-discover');
        return; // Discovery tool will handle exit
      } catch (err) {
        console.error('Error running discovery:', err.message);
        process.exit(1);
      }
    }

    // Get label configuration
    const labelConfig = await getLabelConfig(options);
    console.log(`Label: ${labelConfig.widthMm}mm x ${labelConfig.lengthMm}mm`);

    // Create transport
    const transport = createTransport(options);

    // Create printer
    const printer = new M260Printer(transport);

    // Connect to printer
    console.log('\nConnecting to printer...');
    await transport.connect();

    // Initialize printer
    await printer.initialize({
      density: parseInt(options.density) || 6,
      initialFeed: parseInt(options.initialFeed) || 12,
    });

    // Print test pattern or image
    if (options.test) {
      await printer.printTestPattern({
        horizontalOffset: parseInt(options.offset) || 0,
        finalFeed: parseInt(options.finalFeed) || 30,
      });
    } else {
      // Check if image exists
      if (!fs.existsSync(options.file)) {
        throw new Error(`Image file not found: ${options.file}`);
      }

      await printer.printImage(options.file, labelConfig, {
        margin: parseInt(options.margin) || 2,
        offset: parseInt(options.offset) || 0,
        voffset: parseInt(options.voffset) || 0,
        finalFeed: parseInt(options.finalFeed) || 30,
      });
    }

    // Disconnect
    await transport.disconnect();

  } catch (error) {
    console.error(`\nError: ${error.message}`);
    console.error(error.stack);
    process.exit(1);
  }
}

// Parse and run
function main() {
  program.parse(process.argv);
}

module.exports = { main, program };
