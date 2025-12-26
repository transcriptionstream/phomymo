# Phomymo

Phomymo is a toolkit for interfacing with Phomemo thermal label printers. It includes:

- **Web Label Designer** - A browser-based visual editor for creating and printing labels
- **CLI Tool** - A command-line tool for batch printing images

Supports Phomemo M110, M200, M220, M260, D30, D110, and similar thermal printers.

## Web Label Designer

A full-featured label designer that runs in your browser using Web Bluetooth (no drivers needed).

**Try it now: https://phomymo.affordablemagic.net**

### Features

- **Multi-element canvas** - Add text, images, barcodes (Code128, EAN-13, UPC-A, Code39), and QR codes
- **Visual editing** - Drag to move, resize handles on corners/edges, rotation handle
- **Multi-select & grouping** - Select multiple elements (Shift+click), group them (Ctrl/Cmd+G)
- **Text formatting** - Multiple fonts, sizes, bold, italic, underline, alignment
- **Image support** - Import images with scale control and aspect ratio lock
- **Label presets** - Common sizes (12x40, 15x30, 20x30, 25x50, 30x20, 40x30, 50x30, 60x40, etc.) plus custom dimensions
- **Save/Load designs** - Persist designs to browser localStorage
- **Print settings** - Density control, multiple copies, feed adjustment

### Quick Start

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

### Browser Requirements

- Chrome, Edge, or another Chromium-based browser
- Web Bluetooth API support (not available in Firefox or Safari)
- HTTPS or localhost

### Connection Tips

When the Bluetooth device picker appears, select the device showing a **signal strength indicator**. Devices listed without signal strength may be cached/ghost entries that won't connect properly.

## CLI Tool

A Node.js command-line tool for printing images via USB.

### Installation

1. Clone the repository:

   ```bash
   git clone https://github.com/transcriptionstream/phomymo.git
   cd phomymo
   ```

2. Install dependencies:

   ```bash
   npm install
   ```

### Usage

```bash
node phomymo-cli.js --file ./image.png --label M260 --vendor 0x483 --product 0x5740
```

### CLI Options

| Option | Description | Default |
|--------|-------------|---------|
| `-f, --file <path>` | Image file to print | `./test.png` |
| `-l, --label <type>` | Label type (M200, M260, 40x30, 60x40, custom) | `M260` |
| `-w, --width <mm>` | Custom label width in mm | - |
| `-h, --height <mm>` | Custom label height in mm | - |
| `-v, --vendor <id>` | USB vendor ID | `0x483` |
| `-p, --product <id>` | USB product ID | `0x5740` |
| `-d, --density <1-8>` | Print density level | `6` |
| `-m, --margin <mm>` | Margin in millimeters | `2` |
| `-o, --offset <bytes>` | Horizontal offset in bytes | - |
| `-y, --voffset <dots>` | Vertical offset in dots | - |
| `-t, --test` | Print test alignment pattern | - |
| `-i, --initial-feed <dots>` | Feed before printing | - |
| `-n, --final-feed <dots>` | Feed after printing | - |

## How It Works

1. **Label Size Configuration** - Sets pixel dimensions based on label size (203 DPI)
2. **Image Processing** - Resizes image with margins and converts to 1-bit monochrome raster
3. **Printing** - Sends ESC/POS commands and raster data to the printer

## Project Structure

```
phomymo/
├── src/
│   └── web/           # Web Label Designer
│       ├── index.html # Main UI
│       ├── app.js     # Application logic
│       ├── canvas.js  # Canvas rendering
│       ├── elements.js # Element management
│       ├── handles.js # Selection handles
│       ├── storage.js # localStorage persistence
│       ├── ble.js     # Web Bluetooth transport
│       └── printer.js # Print protocol
├── phomymo-cli.js     # CLI tool
├── package.json
└── README.md
```

## Platform Support

- **Web Designer**: Any OS with Chrome/Chromium browser
- **CLI Tool**: Tested on macOS (USB support may vary on other platforms)

## Known Limitations

- **Density control**: Some printers (like M260) may not respond to runtime density commands. Print darkness may need to be adjusted via the printer's own settings.
- **Web Bluetooth**: Only available in Chromium-based browsers, requires HTTPS or localhost.

## Acknowledgments

Thanks to these projects for inspiration:

- [vivier/phomemo-tools](https://github.com/vivier/phomemo-tools)
- [vrk/cli-phomemo-printer](https://github.com/vrk/cli-phomemo-printer)

## License

This project is licensed under the MIT License – see the LICENSE file for details.
