# How to Publish XStitch to the Chrome Web Store

This guide will walk you through the process of publishing your **XStitch** extension to the Google Chrome Web Store.

## Prerequisites

1.  **Google Account**: You need a Google account to sign in.
2.  **Developer Account**: You must register as a Chrome Web Store Developer. There is a one-time registration fee of **$5.00 USD**.
3.  **Extension Package**: A ZIP file of the `dist` folder generated after running the build.

---

## Step 1: Register as a Developer

1.  Go to the [Chrome Web Store Developer Dashboard](https://chrome.google.com/webstore/developer/dashboard).
2.  Sign in with your Google Account.
3.  If this is your first time, you will be prompted to accept the **Developer Agreement** and pay the **$5.00 registration fee**.

## Step 2: Upload Your Item

1.  On the Developer Dashboard, click the **+ New Item** button (usually in the top right).
2.  Drag and drop the `XStitch.zip` file (located in your project folder) into the upload window.
    *   *Note: If you made recent changes, ensure you ran `npm run build` and re-zipped the `dist` folder before uploading.*

## Step 3: Complete the Store Listing

Once uploaded, you will be taken to the Store Listing page. You must fill out the following fields:

### Store Listing Tab
*   **Description**: A detailed description of what the extension does.
    *   *Example*: "Elevate your **vibe coding** experience with XStitch. Seamlessly capture, preview, and export designs from Google Stitch directly to your local clipboard. Whether you need a single component or an entire flow, XStitch keeps you in the zone by handling the assets, so you can focus on the code."
*   **Category**: Choose **Developer Tools**.
*   **Language**: Select **English**.
*   **Graphic Assets**:
    *   **Store Icon**: 128x128px PNG.
    *   **Screenshot**: 1280x800px or 640x400px (at least one is required). *Take a screenshot of the extension in action!*
    *   **Marquee Tile**: 440x280px (optional but recommended for better visibility).

### Privacy Tab
*   **Single Purpose**: Explain that the extension's single purpose is to "Capture and export design assets from the Google Stitch prototyping tool."
*   **Permission Justification**:
    *   `storage`: "To save captured designs locally within the extension for the user to review later."
    *   `downloads`: "To intercept and process design exports from the Stitch website."
    *   `sidePanel`: "To display the captured designs in a convenient side panel UI."
    *   `host_permissions` (stitch.withgoogle.com, appspot.com): "To interact with the Stitch application and capture generated assets."
*   **Remote Code**: Select **No**, I am not using remote code (unless you added analytics).
*   **Data Usage**: Check the boxes that apply. Since everything is local, you generally certify that you are **not collecting user data** or selling it.

## Step 4: Submit for Review

1.  Once all required fields are filled (they will have green checkmarks in the sidebar), click the **Submit for Review** button in the top right.
2.  Confirm the submission dialog.

## Review Process
*   The review process typically takes **24-48 hours**, but can sometimes take longer.
*   You will receive an email when the extension is published or if changes are requested.

## Updating Your Extension
To update the extension in the future:
1.  Make your code changes.
2.  Increment the `version` number in `manifest.json` (e.g., `"1.0.0"` -> `"1.0.1"`).
3.  Run `npm run build`.
4.  Zip the `dist` folder again.
5.  Go to the Dashboard, click on your item, select **Package**, and click **Upload new package**.
