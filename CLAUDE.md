# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Phomymo is a browser-based label designer for Phomemo thermal printers. It is a pure frontend SPA (vanilla JS, no build step) that communicates directly with printers via Web Bluetooth and WebUSB APIs.

## Development

**Local dev server** (required for Web Bluetooth/USB to work in browser):
```bash
cd src/web
python -m http.server 8080
```
Open `http://localhost:8080` in Chrome or another Chromium-based browser.

**Run E2E tests** (Playwright auto-starts a server on port 8081):
```bash
npm test              # headless
npm run test:headed   # visible browser
```

**Run a single test file:**
```bash
npx playwright test tests/02-adding-elements.spec.ts
```

**No build step, no linting tools.** Files are served directly as static assets.

## Cache-Busting Convention

There is no bundler. When modifying a JS module, increment its `?v=NNN` query parameter in the `<script>` tag inside [src/web/index.html](src/web/index.html). This is the only cache invalidation mechanism.

## Architecture

The app is orchestrated by [src/web/app.js](src/web/app.js), which owns a single global `state` object and wires up all event listeners. Other modules are imported as ES modules with versioned URLs.

**Module responsibilities:**

| Module | Role |
|---|---|
| [app.js](src/web/app.js) | Event handling, state management, element lifecycle, undo/redo |
| [canvas.js](src/web/canvas.js) | Canvas rendering, thermal dither preview, zoom, multi-label layout |
| [elements.js](src/web/elements.js) | Element creation/modification (text, image, barcode, QR, shapes) |
| [handles.js](src/web/handles.js) | Selection, resize, and rotation handle drawing |
| [printer.js](src/web/printer.js) | Print protocol implementations (M-series, D-series, TSPL, P12), printer database |
| [ble.js](src/web/ble.js) | Web Bluetooth transport — device pairing, GATT, BLE commands |
| [usb.js](src/web/usb.js) | WebUSB transport (PM-241 only) |
| [storage.js](src/web/storage.js) | `localStorage` persistence for designs, presets, and custom printers |
| [templates.js](src/web/templates.js) | Variable substitution (`{{Field}}`), instant expressions (`[[date]]`), CSV batch |
| [constants.js](src/web/constants.js) | Shared magic numbers, label sizes, UI limits |
| [printers.json](src/web/printers.json) | Data-driven printer database (protocol, DPI, width, BLE name patterns) |

**State** lives in a single object in `app.js`: `elements[]`, `selectedIds[]`, `labelSize`, `zoom`, `printSettings`, `templateFields[]`, `templateData[]`, `history[]`, and pointer/drag state.

**Print flow:** `canvas.renderLabel()` produces a bitmap → `printer.js` converts it to protocol-specific commands (ESC/POS, TSPL, etc.) → `ble.js` or `usb.js` sends bytes to the printer.

**Persistence:** All data (designs, custom printers, presets, preferences) is stored in browser `localStorage`. There is no backend.

## Adding Printer Support

Printer definitions live in [src/web/printers.json](src/web/printers.json). Each entry specifies `protocol`, `widthBytes`, `dpi`, `alignment`, `rotated`, `tape`, and `namePatterns` for BLE auto-detection. Protocol implementations are in `printer.js`.

## Tests

Tests are Playwright E2E suites in [tests/](tests/). They rely on a Python HTTP server on port 8081 (auto-started by `playwright.config.ts`). Fixtures and helpers are in [tests/helpers/](tests/helpers/) and [tests/fixtures/](tests/fixtures/).

## Tools

### BLE / HCI snoop log analyzer

[tools/analyze_btsnoop.py](tools/analyze_btsnoop.py) parses an Android BT HCI snoop log and reports the negotiated ATT MTU, write chunk sizes, inter-write timing, and throughput per characteristic handle. Useful for diagnosing Android BLE printing issues.

```bash
python tools/analyze_btsnoop.py <path-to-btsnooz_hci.log>
```

**Getting the log from a connected Android phone:**
```bash
# Generate a bug report (the log is inside the zip)
adb bugreport bt-logs/bugreport.zip

# If adb disconnects mid-transfer, pull the pre-generated report directly:
adb pull /data/user_de/0/com.android.shell/files/bugreports/<filename>.zip bt-logs/bugreport.zip

# Extract and locate the log
# Path inside zip: FS/data/misc/bluetooth/logs/btsnooz_hci.log
```

To get a clean capture covering only one print session, toggle Bluetooth off/on (or `adb shell svc bluetooth disable && adb shell svc bluetooth enable`) immediately before printing, then pull the bug report.
