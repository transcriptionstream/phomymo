# Phomymo

A free, browser-based label designer for Phomemo thermal printers. No drivers needed - connects via Bluetooth.

**Try it now: https://phomymo.affordablemagic.net**

![Phomymo Label Designer](screenshot.png)

Supports Phomemo tape printers (P12, P12 Pro, A30), M02-series (M02, M02S, M02X, M02 Pro), M-series (M03, M04S, M110, M120, M200, M220, M221, M250, M260, T02), D-series (D30, D35, D50, D110, Q30, Q30S), and PM-241 (4-inch shipping labels) thermal printers.

## Features

### Elements
- **Text** - Multiple fonts, sizes, bold, italic, underline, horizontal and vertical alignment, background colors
- **Images** - Import with scale control and aspect ratio lock
- **Barcodes** - Code128, EAN-13, UPC-A, Code39 formats
- **QR Codes** - Automatic sizing and encoding
- **Shapes** - Rectangle, ellipse, triangle, and line with fill options

### Shape Fills
- Solid black/white fills
- 9 dithered grayscale levels (6%, 12%, 25%, 37%, 50%, 62%, 75%, 87%, 94%)
- Stroke options with adjustable width
- Rounded corners for rectangles

### Editing
- **Visual editing** - Drag to move, resize handles on corners/edges, rotation handle
- **Multi-select** - Shift+click to select multiple elements
- **Grouping** - Group elements together (Ctrl/Cmd+G), ungroup (Ctrl/Cmd+Shift+G)
- **Undo/Redo** - Full history support (Ctrl/Cmd+Z to undo, Ctrl/Cmd+Shift+Z to redo)
- **Keyboard shortcuts** - Arrow keys to nudge, Delete to remove, Ctrl/Cmd+D to duplicate
- **Layer ordering** - Raise/lower elements in z-order

### Mobile Interface
Full-featured mobile UI with touch support (activates automatically on screens < 768px):
- **Touch gestures** - Pinch to zoom, two-finger drag to pan, double-tap to edit
- **Fixed toolbar** - Quick access to add elements (Text, Image, Rect, Circle, Line, Barcode, QR)
- **Selection actions** - Edit, Copy, Forward, Back, Delete buttons when element selected
- **Slide-up properties panel** - Full property editing for all element types
- **Hamburger menu** - Access to label size, custom dimensions, connection, save/load, undo/redo, print settings
- **Feature parity** - All desktop features available on mobile

### Templates & Batch Printing
- **Variable fields** - Use `{{FieldName}}` syntax in text, barcodes, and QR codes
- **CSV import** - Load data from spreadsheet exports
- **Manual data entry** - Add/edit records in a table interface
- **Preview grid** - See all labels before printing with click-to-enlarge
- **Batch printing** - Print multiple labels with progress indicator and cancel support

### Label Sizes
- **M-series presets**: 12x40, 15x30, 20x30, 25x50, 30x20, 30x40, 40x30, 40x60, 50x25, 50x30, 50x80, 60x40
- **D-series presets**: 40x12, 30x12, 22x12, 12x12, 30x14, 22x14, 40x15, 30x15
- **PM-241 presets**: 102x152 (4x6"), 102x102 (4x4"), 102x76 (4x3"), 102x51 (4x2"), 100x150, 100x100
- **Round labels**: 20mm, 30mm, 40mm, 50mm (M-series), 14mm (D-series) - circular design boundary with clipped print output
- Custom dimensions with live preview (includes round option)
- **Auto-detection**: Label size options automatically switch based on connected printer type
- **Auto-zoom**: Large labels (like PM-241) automatically zoom to fit on screen

### Multi-Label Rolls
- **Configure multi-up layouts** - Define individual label width, height, number across, and gap between labels
- **Two design modes**:
  - **Clone mode** - Design one label, automatically replicate to all positions
  - **Individual mode** - Design each label zone separately with unique content
- **Zone editing** - Click zones to switch, visual highlighting shows active zone
- **Save presets** - Save and reuse common multi-label configurations
- **Smart batch printing**:
  - Clone mode: Each CSV record prints to one full row (all zones identical)
  - Individual mode: Records fill zones sequentially (4 zones + 8 records = 2 rows)

### File Operations
- **Save/Load** - Persist designs to browser localStorage
- **Export/Import** - Share designs as JSON files
- **Export to PDF** - Download label as PDF with exact dimensions (full color/grayscale)
- **Export to PNG** - Download label as high-resolution PNG image
- **Print settings** - Density control, multiple copies, feed adjustment

### Print Preview
- **Dither preview** - Toggle to see exact print output with dithering applied
- **Real-time preview** - See how your label will actually print on the thermal printer
- **Toggle button** - Quick access in toolbar to switch between design and print preview modes

### Instant Expressions
Dynamic values that evaluate at print/export time using `[[expression]]` syntax:
- **Date/Time**: `[[date]]`, `[[time]]`, `[[datetime]]`, `[[timestamp]]`
- **Components**: `[[year]]`, `[[month]]`, `[[day]]`, `[[hour]]`, `[[minute]]`, `[[second]]`
- **Custom formats**: `[[date|MM/DD/YYYY]]`, `[[time|hh:mm A]]`, `[[datetime|YYYY-MM-DD HH:mm]]`
- Works in text, barcodes, and QR codes

### Printer Info Panel
- **Live status** - View battery level, paper status, firmware version, and serial number
- **Auto-query** - Status is automatically queried when connecting
- **Visual indicators** - Battery level with color coding (green/yellow/red), paper-out warning
- **Device memory** - App remembers your printer model for each device

## Supported Printers

### Tape Printers (P12/A30 Series)

| Model | Tape Width | Notes |
|-------|------------|-------|
| P12 / P12 Pro | 12mm | Continuous tape label maker |
| A30 | 12-15mm | Wider tape support, faster print speed (20mm/s) |

Tape width is selectable in the toolbar when a tape printer is connected. The app remembers your tape width preference per device.

### M02-series (ESC/POS with Prefix)

| Model | Print Width | Notes |
|-------|-------------|-------|
| M02 / M02S / M02X | 48mm (384px) | Mini pocket printers (continuous paper) |
| M02 Pro | 53mm (626px) | 300 DPI high-resolution model |

### M-series (ESC/POS Raster Protocol)

| Model | Print Width | Notes |
|-------|-------------|-------|
| M03 / T02 | 53mm (432px) | Mini sticker printers |
| M04S | 53/80/110mm | Multi-width support (select paper size in settings) |
| M110 / M120 | 48mm (384px) | Narrow label makers |
| M200 / M250 | 75mm (608px) | Mid-size labels |
| M220 / M221 | 80mm (648px) | Wide labels |
| M260 | 72mm (576px) | Wide label maker |

### D-series (Rotated Protocol)

| Model | Label Width | Notes |
|-------|-------------|-------|
| D30 / D35 | 12-15mm | Smart mini label makers |
| D50 | 16-24mm | Larger D-series |
| D110 | 12-15mm | Similar to D30 |
| Q30 / Q30S | 12-15mm | Similar to D30 |

D-series printers use a different protocol and print labels rotated 90°. The app automatically detects D-series printers and:
- Switches to D-series label size presets
- Rotates image data for correct orientation
- Uses the appropriate print protocol

### PM-241 Series (Shipping Labels)

| Model | Print Width | Notes |
|-------|-------------|-------|
| PM-241 / PM-241-BT | 102mm (4 inches) | Shipping label printer |

**Supported label sizes:**
- 102x152mm (4x6") - Standard shipping label
- 102x102mm (4x4") - Square label
- 102x76mm (4x3") - Smaller shipping label
- 102x51mm (4x2") - Return address label
- 100x150mm, 100x100mm - Common metric sizes

### Auto-Detection

The app automatically detects your printer model from the Bluetooth device name and configures the correct:
- Print width (12-102mm depending on model)
- Protocol (P12-series, M02-series with prefix, M-series ESC/POS, D-series rotated, or PM-241)
- Label size presets
- DPI (203 standard, 300 for M02 Pro)

If auto-detection fails (e.g., printer shows serial number instead of model), you can manually select your printer model in Print Settings, or the app will prompt you to choose on first connection.

## Quick Start

**Option 1: Use the live version**
1. Open https://phomymo.affordablemagic.net in Chrome
2. Click **Connect** to pair with your Phomemo printer via Bluetooth
3. Design your label and click **Print**

**Option 2: Run locally**
1. Serve the web app (Web Bluetooth requires HTTPS or localhost):
   ```bash
   cd src/web
   python3 -m http.server 8080
   ```
2. Open http://localhost:8080 in Chrome (or another Chromium-based browser)
3. Connect, design, and print

## Keyboard Shortcuts

| Shortcut | Action |
|----------|--------|
| `Ctrl/Cmd + Z` | Undo |
| `Ctrl/Cmd + Shift + Z` | Redo |
| `Ctrl/Cmd + D` | Duplicate selected |
| `Ctrl/Cmd + G` | Group selected |
| `Ctrl/Cmd + Shift + G` | Ungroup |
| `Delete / Backspace` | Delete selected |
| `Arrow keys` | Nudge by 1px |
| `Shift + Arrow keys` | Nudge by 10px |
| `Shift + Click` | Add to selection |

## Browser Requirements

- Chrome, Edge, or another Chromium-based browser (desktop or Android)
- Web Bluetooth API support (not available in Firefox or Safari)
- HTTPS or localhost
- **Mobile**: Android Chrome supported with full touch interface; iOS not supported (no Web Bluetooth)

## Connection Tips

When the Bluetooth device picker appears, select the device showing a **signal strength indicator**. Devices listed without signal strength may be cached/ghost entries that won't connect properly.

## How It Works

1. **Label Size Configuration** - Sets pixel dimensions based on label size (203 DPI)
2. **Image Processing** - Renders canvas to 1-bit monochrome raster
3. **Printing** - Sends ESC/POS commands and raster data to the printer via Web Bluetooth

## Project Structure

```
phomymo/
├── src/
│   └── web/            # Web Label Designer
│       ├── index.html  # Main UI
│       ├── app.js      # Application logic
│       ├── canvas.js   # Canvas rendering
│       ├── elements.js # Element management
│       ├── handles.js  # Selection handles
│       ├── storage.js  # localStorage persistence
│       ├── templates.js # Variable substitution
│       ├── ble.js      # Web Bluetooth transport
│       ├── usb.js      # WebUSB transport
│       ├── printer.js  # Print protocol
│       ├── constants.js # Shared constants
│       └── utils/
│           ├── bindings.js   # Event binding helpers
│           ├── errors.js     # Error handling utilities
│           └── validation.js # Input validation
└── README.md
```

## Known Limitations

- **Density control**: Some printers (like M260) may not respond to runtime density commands. Print darkness may need to be adjusted via the printer's own settings.
- **Web Bluetooth**: Only available in Chromium-based browsers, requires HTTPS or localhost.

## Acknowledgments

Thanks to these projects for protocol research and inspiration:

- [vivier/phomemo-tools](https://github.com/vivier/phomemo-tools) - CUPS driver with reverse-engineered protocol
- [yaddran/thermal-print](https://github.com/yaddran/thermal-print) - Printer status query commands

Libraries used:

- [JsBarcode](https://github.com/lindell/JsBarcode) - Barcode generation
- [QRCode.js](https://github.com/davidshimjs/qrcodejs) - QR code generation
- [jsPDF](https://github.com/parallax/jsPDF) - PDF export

## License

This project is licensed under the MIT License – see the LICENSE file for details.
