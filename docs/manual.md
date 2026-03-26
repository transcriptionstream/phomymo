# Phomymo User Manual

A guide to designing and printing labels with the Phomymo label designer.

## Table of Contents

1. [Getting Started](#getting-started)
2. [Adding Elements](#adding-elements)
3. [Element Properties](#element-properties)
4. [Templates and Batch Printing](#templates-and-batch-printing)
5. [Print Settings](#print-settings)
6. [Custom Printer Definitions](#custom-printer-definitions)

---

## Getting Started

Open [phomymo.affordablemagic.net](https://phomymo.affordablemagic.net) in Chrome, Edge, or another Chromium-based browser. The app works on desktop and Android - iOS is not supported due to Web Bluetooth limitations.

![App loaded](screenshots/01-getting-started/01-app-loaded.png)

### The Interface

The interface has three main areas:

- **Toolbar** (top) - Buttons to add elements, undo/redo, arrange layers, save/load, and export
- **Canvas** (center) - Your label design area with zoom controls
- **Properties Panel** (right) - Edit the selected element's properties

![Interface overview](screenshots/01-getting-started/02-interface-overview.png)

### Connecting a Printer

1. Click **Connect** in the top toolbar
2. Select your Phomemo printer from the Bluetooth device picker
3. The app auto-detects your printer model and configures the correct settings

You can also use **USB** for PM-241 shipping label printers by switching the connection type dropdown.

---

## Adding Elements

Use the toolbar buttons to add elements to your label. Each element appears on the canvas and can be dragged, resized, and rotated.

### Text

Click **Text** to add a text element. It starts in inline edit mode - type your text and click outside to finish.

![Text element added](screenshots/02-adding-elements/01-text-element-added.png)

### Barcodes

Click **Barcode** to add a barcode. The default format is Code 128 - change it in the properties panel.

![Barcode added](screenshots/02-adding-elements/02-barcode-element-added.png)

### QR Codes

Click **QR** to add a QR code. Enter any text or URL in the properties panel.

![QR code added](screenshots/02-adding-elements/03-qr-element-added.png)

### Shapes

Click **Shape** to open the shape menu, then pick from rectangle, ellipse, triangle, or line.

![Shape dropdown](screenshots/02-adding-elements/04-shape-dropdown.png)

![Rectangle added](screenshots/02-adding-elements/05-rectangle-element-added.png)

### Images

Click **Image** to import a picture from your device. Images can be scaled, cropped, and dithered for thermal printing.

![Image added](screenshots/02-adding-elements/06-image-element-added.png)

### Multiple Elements

You can add as many elements as you need. Use the layer buttons (Raise/Lower) to control which elements appear on top.

![All elements](screenshots/02-adding-elements/07-all-elements-on-canvas.png)

---

## Element Properties

Click any element on the canvas to select it. The properties panel on the right updates to show that element's settings.

### Text Properties

Text elements have the most options: font family, size, bold/italic/underline, text color, background color, horizontal and vertical alignment, word wrap, and auto-scale.

![Text properties panel](screenshots/03-element-properties/01-text-properties-panel.png)

Change the text content in the textarea and adjust styling with the buttons and inputs below.

![Text modified](screenshots/03-element-properties/02-text-properties-modified.png)

### Barcode Properties

Set the barcode data and format (Code 128, EAN-13, UPC-A, or Code 39). You can toggle the text display below the barcode.

![Barcode properties](screenshots/03-element-properties/03-barcode-properties-panel.png)

![Barcode modified](screenshots/03-element-properties/04-barcode-properties-modified.png)

### QR Code Properties

Enter the data to encode. The QR code auto-sizes based on content length.

![QR properties](screenshots/03-element-properties/05-qr-properties-panel.png)

![QR modified](screenshots/03-element-properties/06-qr-properties-modified.png)

### Shape Properties

Choose the shape type, fill style (solid, dithered grayscale, or none), stroke color, stroke width, and corner radius (rectangles only).

![Shape properties](screenshots/03-element-properties/07-shape-properties-panel.png)

![Shape modified](screenshots/03-element-properties/08-shape-properties-modified.png)

### Position and Size

All elements share position (X, Y), size (Width, Height), and rotation controls at the top of the properties panel. You can type exact values or drag elements on the canvas.

![Position properties](screenshots/03-element-properties/09-position-properties.png)

---

## Templates and Batch Printing

Templates let you print multiple labels with different data - like name badges, product labels, or address labels.

### Creating Template Fields

Use `{{FieldName}}` syntax in any text, barcode, or QR code element. For example, type `{{Name}} - ${{Price}}` in a text element.

When template fields are detected, a purple **Template** button appears in the toolbar.

![Template field in text](screenshots/04-templates-batch/01-template-field-in-text.png)

### Template Panel

Click the template button to open the template panel, which shows your detected fields and data management options.

![Template panel](screenshots/04-templates-batch/02-template-panel-open.png)

### Importing Data

Click **Manage Data** to open the data dialog. You can import a CSV file or manually add rows.

![Empty data dialog](screenshots/04-templates-batch/03-template-data-dialog-empty.png)

Click **Import CSV** and select your file. The CSV headers should match your field names (e.g., `Name,Price`).

![CSV imported](screenshots/04-templates-batch/04-csv-data-imported.png)

### Previewing Labels

Click **Preview** to see all your labels rendered with the data. Click any thumbnail to see it full-size.

![Preview grid](screenshots/04-templates-batch/05-preview-grid.png)

### Batch Printing

Click **Print All** to print every label in sequence. A progress indicator shows the current label being printed. You can cancel at any time.

---

## Print Settings

Click the **gear icon** in the toolbar to open print settings.

![Print settings dialog](screenshots/05-print-settings/01-print-settings-dialog.png)

### Choosing a Printer Model

The **Printer Model** dropdown lists all supported printers. The default is **Auto-detect**, which identifies your printer from its Bluetooth name.

![Printer dropdown](screenshots/05-print-settings/02-printer-model-dropdown.png)

If auto-detection doesn't work (e.g., your printer broadcasts a serial number instead of a model name), select your model manually.

![Printer selected](screenshots/05-print-settings/03-printer-selected.png)

### Print Density

The density slider controls how dark the print is (1 = light, 8 = dark). Some printers may not respond to this setting.

![Density adjusted](screenshots/05-print-settings/04-density-adjusted.png)

### Other Settings

- **Copies** - Number of copies to print
- **Feed After Print** - How much blank space to feed after the label

Click **Save** to apply your settings. They persist across sessions.

![Settings saved](screenshots/05-print-settings/05-settings-saved.png)

---

## Custom Printer Definitions

If your printer isn't in the built-in list, or if you need to tweak settings for your specific hardware, you can create custom printer definitions.

### Opening the Manager

In Print Settings, click **Manage Printers** to open the printer definitions manager.

![Printer definitions list](screenshots/06-custom-printers/01-printer-defs-list.png)

### Adding a New Printer

Click **Add New Printer** to open the editor form.

![New printer form](screenshots/06-custom-printers/02-new-printer-form.png)

Fill in the fields:

- **ID** - Unique identifier (lowercase, no spaces)
- **Display Name** - What appears in the dropdown
- **Group** - Dropdown group label
- **Protocol** - The print protocol your printer uses (M-series, M02, M110, D-series, P12/Tape, or TSPL)
- **Width (bytes)** - Print head width (each byte = 8 pixels = ~1mm at 203 DPI)
- **DPI** - 203 (standard) or 300 (high-res)
- **Alignment** - How the label is positioned on the print head
- **Auto-detect Patterns** - BLE device name prefixes for automatic recognition

![Filled form](screenshots/06-custom-printers/03-new-printer-filled.png)

After saving, your custom printer appears in the list with a **custom** badge and in all printer dropdowns.

![Custom in list](screenshots/06-custom-printers/04-custom-printer-in-list.png)

### Editing Built-in Printers

Click **Edit** on any built-in printer to override its settings. Modified built-ins show a **modified** badge.

![Editing built-in](screenshots/06-custom-printers/05-editing-builtin.png)

![Modified badge](screenshots/06-custom-printers/06-modified-builtin-in-list.png)

### Deleting and Resetting

- **Delete** - Removes custom printers you created
- **Reset** - Reverts a modified built-in printer back to its original settings

![After delete](screenshots/06-custom-printers/07-after-delete.png)

![After reset](screenshots/06-custom-printers/08-after-reset.png)

All custom and modified printer definitions are saved in your browser's localStorage and persist across sessions.
