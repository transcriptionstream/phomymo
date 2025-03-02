# Phomymo

Phomymo is a command-line tool for interfacing with Phomemo USB printers. It processes images, converts them to a 1-bit monochrome raster format, and sends print commands via USB to your Phomemo printer. This tool supports custom label sizes, alignment testing, and adjustable print settings.

## Features

- Process images with [sharp](https://github.com/lovell/sharp) for printing on Phomemo devices
- Customizable label sizes (predefined or user-specified dimensions)
- USB device discovery and setup using [usb](https://github.com/node-usb/node-usb)
- Command-line interface built with [commander](https://github.com/tj/commander.js)
- Adjustable print density, margins, offsets, and feed commands
- Test pattern generation to help with printer alignment

## Installation

1. **Clone the repository:**

   ```bash
   git clone https://github.com/transcriptionstream/phomymo.git
   cd phomymo
   ```
2. Install dependencies:
Ensure you have Node.js installed, then run:
   ```bash
   npm install
   ```


## Usage

Phomymo is configured via command-line options. Here’s a basic example:

node phomymo.js --file ./path/to/image.png --label M260 --vendor 0x483 --product 0x5740

### Available Options
	•	-f, --file <path>: Path to the image file to print (default: ./test.png)
	•	-l, --label <type>: Label type (M200, M260, 40x30, 60x40, or custom; default: M260)
	•	-w, --width <mm> and -h, --height <mm>: Specify custom label dimensions (if label type is custom)
	•	-v, --vendor <id> and -p, --product <id>: USB vendor and product IDs (e.g. 0x483 and 0x5740)
	•	-d, --density <level>: Print density level (1–8, default: 6)
	•	-m, --margin <mm>: Margin in millimeters (default: 2)
	•	-o, --offset <bytes>: Manual horizontal offset in bytes
	•	-y, --voffset <dots>: Vertical offset in dots
	•	-t, --test: Print a test alignment pattern instead of an image
	•	-i, --initial-feed <dots> and -n, --final-feed <dots>: Feed adjustments before and after printing

## How It Works
	1.	Label Size Configuration: Depending on the provided options, the tool sets a predefined or custom label size. It calculates pixel dimensions and bytes per line using the printer’s DPI (203).
	2.	USB Device Setup: The tool searches for the USB device using the specified vendor and product IDs. If not found, it lists available devices for manual selection.
	3.	Image Processing & Raster Conversion: The image is resized (with margins and alignment adjustments) and converted to a 1-bit raster format suitable for the printer.
	4.	Printing: Commands are sent to the printer (e.g., initialize, set line spacing, print density, feed commands) followed by the raster data, with progress logged in chunks.

## Acknowledgments

A special thank you goes to the creators of the following projects for their inspiring work and contributions:
	•	[vivier/phomemo-tools](https://github.com/vivier/phomemo-tools)
	•	[vrk/cli-phonemo-printer](https://github.com/vrk/cli-phomemo-printer)

Their open-source projects helped shape the design and functionality of Phomymo.

Contributing

Contributions are welcome! Please see our CONTRIBUTING.md for more details on how to help improve the project.

License

This project is licensed under the MIT License – see the LICENSE file for details.
