#!/usr/bin/env node
/**
 * Test using the CLI's transport layer to isolate the issue
 */

const NodeBLETransport = require('../transport/ble-node');
const sharp = require('sharp');

async function main() {
  const transport = new NodeBLETransport({});

  try {
    console.log('Connecting via transport...');
    await transport.connect();

    // Exactly like the working test:
    const widthBytes = 72;
    const heightLines = 240;
    const widthPixels = widthBytes * 8;

    console.log(`\nProcessing image...`);
    const image = await sharp('test.png')
      .resize({
        width: widthPixels,
        height: heightLines,
        fit: 'contain',
        background: { r: 255, g: 255, b: 255 }
      })
      .greyscale()
      .threshold(128)
      .raw()
      .toBuffer({ resolveWithObject: true });

    console.log(`Processed: ${image.info.width}x${image.info.height}`);

    // Convert to raster
    const data = new Uint8Array(widthBytes * heightLines);
    for (let y = 0; y < heightLines; y++) {
      for (let byteX = 0; byteX < widthBytes; byteX++) {
        let byte = 0;
        for (let bit = 0; bit < 8; bit++) {
          const x = byteX * 8 + bit;
          if (x >= image.info.width) continue;
          const pixelPos = y * image.info.width + x;
          if (image.data[pixelPos] < 128) {
            byte |= (1 << (7 - bit));
          }
        }
        data[y * widthBytes + byteX] = byte;
      }
    }

    console.log(`\nPrinting: ${widthBytes} x ${heightLines}`);

    // Init
    console.log('Sending init...');
    await transport.send(Buffer.from([0x1b, 0x40]));
    await transport.delay(200);

    // Header
    console.log('Sending header...');
    await transport.send(Buffer.from([
      0x1d, 0x76, 0x30, 0x00,
      widthBytes, 0x00,
      heightLines & 0xFF, (heightLines >> 8) & 0xFF
    ]));

    // Data
    console.log('Sending data...');
    for (let i = 0; i < data.length; i += 128) {
      const chunk = data.slice(i, Math.min(i + 128, data.length));
      await transport.send(Buffer.from(chunk));
      await transport.delay(20);
    }
    console.log('Data sent.');

    // Feed
    await transport.delay(300);
    console.log('Sending feed...');
    await transport.send(Buffer.from([0x1b, 0x4a, 0x20]));
    await transport.delay(800);

    console.log('✓ Done');

  } finally {
    await transport.disconnect();
  }
}

main().catch(console.error).finally(() => process.exit(0));
