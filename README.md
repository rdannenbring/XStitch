# XStitch Chrome Extension

XStitch is the ultimate companion for your **vibe coding** workflow. Designed to bridge the gap between Google Stitch and your local development environment, it allows you to seamlessly capture, preview, and export individual, multiple, or all screen designs and code snippets from Stitch directly to your "XStitch Clipboard"—keeping you in the flow and focused on the creative process.

## Features

-   **Smart Capture**: Automatically detects and captures design previews and source code from Stitch.
-   **XStitch Clipboard**: A dedicated side panel to manage your captured designs.
-   **Live Preview**: View your captured designs and edit the source code in a full-featured Monaco Editor (VS Code-like experience).
-   **Bi-directional Sync**: Changes made in the preview editor are instantly saved to your clipboard.
-   **One-Click Export**: Download your designs as ZIP files containing both the HTML and the preview image.
-   **Download Interception**: (Optional) Intercepts Stitch downloads to prevent cluttering your Downloads folder, saving them directly to the extension instead.
-   **Experimental Mode**: Enable functionality on non-Stitch domains (use with caution).

## Installation

### From Source

1.  Clone this repository:
    ```bash
    git clone https://github.com/google-deepmind/xstitch-chrome-extension.git
    cd xstitch-chrome-extension
    ```

2.  Install dependencies:
    ```bash
    npm install
    ```

3.  Build the extension:
    ```bash
    npm run build
    ```

4.  Load into Chrome:
    -   Open Chrome and navigate to `chrome://extensions/`.
    -   Enable **Developer mode** in the top right corner.
    -   Click **Load unpacked**.
    -   Select the `dist` directory created in step 3.

## Usage

1.  **Open the Side Panel**: Click the extension icon or use the keyboard shortcut (if configured) to open the XStitch side panel.
2.  **Capture Designs**: Navigate to a Stitch project. The extension will automatically detect designs. You can also right-click on a design and select "Export to XStitch Clipboard".
3.  **Manage & Preview**:
    -   Click on a captured item in the side panel to open the **Preview Page**.
    -   Switch between "Design" and "Code" tabs.
    -   Edit the code directly in the browser. Changes are auto-saved.
    -   Rename designs by clicking the pencil icon.
4.  **Export**: Click the "Download ZIP" button on any card or in the preview page to get your assets.

## Development

### Prerequisites

-   Node.js (v16 or higher)
-   npm (v7 or higher)

### Local Development

1.  Start the build watcher:
    ```bash
    npm run dev
    ```
    *Note: Vite in watch mode will rebuild files on change, but you may need to reload the extension in `chrome://extensions/` to see changes in the background script or manifest.*

### Project Structure

-   `src/`: React components and UI logic for the Side Panel and Preview Page.
-   `content.ts`: Content script injected into web pages to handle scraping and interaction.
-   `background.ts`: Service worker handling storage, downloads, and cross-component messaging.
-   `components/`: Reusable React components (e.g., `ExportCard`).
-   `dist/`: Production build output (load this folder into Chrome).

## Contributing

We welcome contributions! Please see [CONTRIBUTING.md](CONTRIBUTING.md) for details on how to submit pull requests, report issues, and suggest improvements.

## License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.
