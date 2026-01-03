/**
 * D30 Protocol Test
 * Tests printing on Phomemo D30 using the D30-specific protocol
 *
 * Run via the web app's console or create a simple HTML test page
 */

const PACKET_SIZE = 128;

// D30 Header: ESC @ GS v 0 \0 widthLow widthHigh bytesLow bytesHigh
function getD30Header(widthBytes, totalBytes) {
  const rows = totalBytes / widthBytes;
  return new Uint8Array([
    0x1b, 0x40,           // ESC @ - Initialize
    0x1d, 0x76, 0x30, 0x00, // GS v 0 \0 - Raster bit image
    widthBytes % 256,     // Width in bytes (low)
    Math.floor(widthBytes / 256), // Width in bytes (high)
    rows % 256,           // Number of rows (low)
    Math.floor(rows / 256), // Number of rows (high)
  ]);
}

// D30 End command
const D30_END = new Uint8Array([0x1b, 0x64, 0x00]);

/**
 * Create simple test pattern - black rectangle
 * D30 uses: white pixel = 0 bit, black pixel = 1 bit
 */
function createTestPattern(widthBytes, heightRows) {
  const data = new Uint8Array(widthBytes * heightRows);
  // Fill with 0xFF = all black (all bits = 1)
  data.fill(0xFF);
  return data;
}

/**
 * Print test pattern to D30
 * @param {BluetoothRemoteGATTCharacteristic} char - BLE write characteristic
 */
async function printD30Test(char) {
  console.log('D30 Test: Starting...');

  // Small test pattern: 12mm wide (12*8=96 pixels = 12 bytes), 40 rows tall
  const widthBytes = 12;
  const heightRows = 40;

  const data = createTestPattern(widthBytes, heightRows);
  console.log(`D30 Test: Pattern size ${widthBytes}x${heightRows} = ${data.length} bytes`);

  // Send header
  const header = getD30Header(widthBytes, data.length);
  console.log('D30 Test: Sending header...', Array.from(header).map(b => b.toString(16).padStart(2, '0')).join(' '));
  await char.writeValueWithResponse(header);

  // Send data in chunks
  for (let i = 0; i < data.length; i += PACKET_SIZE) {
    const chunk = data.slice(i, Math.min(i + PACKET_SIZE, data.length));
    await char.writeValueWithResponse(chunk);
    console.log(`D30 Test: Sent ${i + chunk.length}/${data.length} bytes`);
  }

  // Send end command
  console.log('D30 Test: Sending end command...');
  await char.writeValueWithResponse(D30_END);

  console.log('D30 Test: Complete!');
}

/**
 * Connect to D30 and run test
 */
async function runD30Test() {
  try {
    console.log('Requesting D30 device...');
    const device = await navigator.bluetooth.requestDevice({
      filters: [{ namePrefix: 'D' }],
      optionalServices: [0xff00],
    });

    console.log('Connecting to', device.name);
    const server = await device.gatt.connect();

    console.log('Getting service...');
    const service = await server.getPrimaryService(0xff00);

    console.log('Getting characteristic...');
    const char = await service.getCharacteristic(0xff02);

    console.log('Running print test...');
    await printD30Test(char);

    console.log('Done! Check if a black rectangle printed.');
  } catch (error) {
    console.error('D30 Test Error:', error);
  }
}

// Export for use
export { runD30Test, printD30Test, getD30Header, D30_END };

// If running directly in console, uncomment:
// runD30Test();
