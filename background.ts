// background.ts
// Core service worker for the XStitch Chrome Extension.
// Handles side panel state, download interception, and zip processing.

declare var chrome: any;
import JSZip from 'jszip';

// --- Initialization ---

// Open side panel on action click (Chrome 116+)
chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true })
  .catch((error: any) => console.error(error));

chrome.runtime.onInstalled.addListener(() => {
  console.log("XStitch extension installed");
  // Create context menu for page content, allowing manual export triggers
  chrome.contextMenus.create({
    id: "stitch-export",
    title: "Export to XStitch Clipboard",
    contexts: ["page", "selection", "link"]
  });
});

// --- Side Panel Management ---

// Track open side panels per window to optimize messaging
let openSidePanels = new Set<number>();
let lastToggleTimes = new Map<number, number>();

chrome.runtime.onConnect.addListener((port) => {
  if (port.name === 'sidepanel') {
    let winId: number | undefined;
    port.onMessage.addListener((msg) => {
      if (msg.type === 'INIT') {
        winId = msg.windowId;
        if (winId) {
          openSidePanels.add(winId);
          broadcastSidePanelState(winId, true);
        }
      }
    });
    port.onDisconnect.addListener(() => {
      if (winId) {
        openSidePanels.delete(winId);
        broadcastSidePanelState(winId, false);
      }
    });
  }
});

/**
 * Notifies the content script about the side panel's state (open/closed).
 * Used to update the "Open/Close" button in the on-page overlay.
 */
function broadcastSidePanelState(windowId: number, isOpen: boolean) {
  chrome.tabs.query({ active: true, windowId }, (tabs) => {
    if (tabs[0]?.id) {
      chrome.tabs.sendMessage(tabs[0].id, { type: 'SIDE_PANEL_STATE', isOpen }).catch(() => { });
    }
  });
}

// --- Notification Logic ---

// Batch notifications to prevent spamming the user when multiple files are downloaded at once.
let notificationBatch: { count: number; tabId?: number } | null = null;
let notificationTimeout: number | null = null;

function scheduleNotification(count: number, tabId?: number) {
  // Clear existing timeout to debounce
  if (notificationTimeout) {
    clearTimeout(notificationTimeout);
  }

  // Update batch count
  if (notificationBatch) {
    notificationBatch.count += count;
    if (tabId) notificationBatch.tabId = tabId;
  } else {
    notificationBatch = { count, tabId };
  }

  // Schedule notification to fire after 1000ms of inactivity
  notificationTimeout = (setTimeout as any)(() => {
    if (notificationBatch) {
      const { count: totalCount, tabId: batchTabId } = notificationBatch;
      notificationBatch = null;
      notificationTimeout = null;

      const showNotification = (targetTabId: number) => {
        chrome.tabs.sendMessage(targetTabId, {
          type: 'SHOW_XSTITCH_NOTIFICATION',
          count: totalCount
        }).catch(() => {
          console.log('[XStitch] Could not show notification on tab');
        });
      };

      if (batchTabId) {
        showNotification(batchTabId);
      } else {
        // Fallback to active tab
        chrome.tabs.query({ active: true, currentWindow: true }, (tabs: any[]) => {
          if (tabs.length > 0 && tabs[0].id) {
            showNotification(tabs[0].id);
          }
        });
      }
    }
  }, 1000);
}

// --- Event Listeners ---

// Handle Context Menu Clicks
chrome.contextMenus.onClicked.addListener((info: any, tab: any) => {
  if (info.menuItemId === "stitch-export" && tab?.id) {
    chrome.tabs.sendMessage(tab.id, { type: "TRIGGER_STITCH_EXPORT" }, { frameId: info.frameId });
  }
});

// Handle Messages from Content Script and Side Panel
chrome.runtime.onMessage.addListener((request: any, sender: any, sendResponse: any) => {
  // 1. Blob Data Captured (from inject.js -> content.ts -> background.ts)
  if (request.type === 'BLOB_DATA_CAPTURED') {
    console.log("[XStitch] Received intercepted blob data! Processing immediately...", request.url);
    processZipData(request.data, request.url, sender.tab?.id);
    return;
  }

  // 2. Open Side Panel (from Notification click)
  if (request.type === 'OPEN_SIDE_PANEL') {
    if (sender.tab?.windowId) {
      chrome.sidePanel.open({ windowId: sender.tab.windowId });
    }
    return;
  }

  // 3. Toggle Side Panel (from Overlay button)
  if (request.type === 'TOGGLE_SIDE_PANEL') {
    const windowId = sender.tab?.windowId;
    const tabId = sender.tab?.id;

    if (windowId && tabId) {
      // Check for "Stuck State": If user clicks toggle and we think it's closed,
      // but they click again quickly, they might be stuck with it Open.
      const now = Date.now();
      const lastToggle = lastToggleTimes.get(tabId) || 0;
      lastToggleTimes.set(tabId, now);

      // If we think it's closed, but user double-clicked (within 1s), force close it just in case.
      const isStuck = !openSidePanels.has(windowId) && (now - lastToggle < 1000);

      if (openSidePanels.has(windowId) || isStuck) {
        // Close it (Disable and Re-enable hack to force close)
        if (isStuck) console.log("[XStitch] Detect 'Stuck Open' state. Forcing close.");

        chrome.sidePanel.setOptions({ tabId, enabled: false }, () => {
          setTimeout(() => {
            // Re-enable so it's ready for next time
            chrome.sidePanel.setOptions({ tabId, enabled: true, path: 'index.html' });

            // If we forced close, ensure we broadcast that it's closed now
            if (isStuck) broadcastSidePanelState(windowId, false);
          }, 10);
        });
      } else {
        // Open it
        // Ensure it's enabled (fire and forget to avoid losing user gesture execution context)
        chrome.sidePanel.setOptions({ tabId, enabled: true, path: 'index.html' });
        chrome.sidePanel.open({ windowId });
      }
    }
    return;
  }

  // 4. Fetch Image as Base64 (Helper for content script to avoid CORS issues)
  if (request.type === 'FETCH_IMAGE_BASE64') {
    fetch(request.url)
      .then(response => response.blob())
      .then(blob => {
        const reader = new FileReader();
        reader.onloadend = () => {
          sendResponse({ success: true, data: reader.result });
        };
        reader.onerror = () => {
          sendResponse({ success: false, error: 'Failed to read blob' });
        };
        reader.readAsDataURL(blob);
      })
      .catch(error => {
        console.error('Image fetch error:', error);
        sendResponse({ success: false, error: error.message });
      });

    return true; // Indicates async response
  }
});

// --- Download Interception ---

// Listen for downloads to intercept Stitch exports
chrome.downloads.onCreated.addListener(async (downloadItem: any) => {
  console.log("[XStitch] Download detected:", downloadItem.filename, downloadItem.mime);

  // Get settings to check if we should cancel the download
  const getSettings = () => new Promise<any>((resolve) => chrome.storage.local.get(['settings'], resolve));
  const { settings } = await getSettings();
  const shouldCancel = settings?.cancelDownloads;

  // Safety Check: Only intercept downloads from Stitch domains
  const isStitchOrigin = (downloadItem.referrer && (downloadItem.referrer.includes("stitch.withgoogle.com") || downloadItem.referrer.includes("appspot.com"))) ||
    (downloadItem.url && (downloadItem.url.includes("stitch.withgoogle.com") || downloadItem.url.includes("appspot.com")));

  if (!isStitchOrigin) {
    return; // Allow normal downloads from other sites
  }

  // 1. Handle ZIPs (Stitch Export)
  if (downloadItem.mime === "application/zip" || downloadItem.filename.endsWith(".zip")) {
    console.log("[XStitch] Detected ZIP download:", downloadItem.url);

    if (shouldCancel) {
      console.log("[XStitch] Cancelling download per user setting.");
      chrome.downloads.cancel(downloadItem.id);
    }

    // Fallback: If it's a network URL (not blob), try to fetch it directly
    if (downloadItem.url.startsWith('http')) {
      console.log("[XStitch] Attempting to fetch ZIP from URL...");
      try {
        const response = await fetch(downloadItem.url);
        const blob = await response.blob();
        const reader = new FileReader();
        reader.onloadend = () => {
          const base64data = reader.result as string;
          processZipData(base64data, downloadItem.url, undefined);
        };
        reader.readAsDataURL(blob);
      } catch (e) {
        console.error("[XStitch] Failed to fetch download URL:", e);
      }
    }
  }
  // 2. Handle Images (Direct Download)
  else if (downloadItem.mime.startsWith("image/") || downloadItem.filename.match(/\.(png|jpg|jpeg|webp)$/i)) {
    console.log("[XStitch] Detected Image download:", downloadItem.url);

    if (shouldCancel) {
      console.log("[XStitch] Cancelling download per user setting.");
      chrome.downloads.cancel(downloadItem.id);
    }

    if (downloadItem.url.startsWith('http')) {
      try {
        const response = await fetch(downloadItem.url);
        const blob = await response.blob();
        const reader = new FileReader();
        reader.onloadend = () => {
          const base64data = reader.result as string;
          saveSingleImageDesign(base64data, downloadItem.url, downloadItem.filename);
        };
        reader.readAsDataURL(blob);
      } catch (e) {
        console.error("[XStitch] Failed to fetch image URL:", e);
      }
    }
  }
});

/**
 * Saves a single image as a design item.
 */
function saveSingleImageDesign(base64Data: string, sourceUrl: string, filename: string) {
  const title = filename.split('/').pop()?.split('.')[0] || "Captured Image";
  const newItem = {
    id: Date.now().toString() + Math.random().toString(36).substr(2, 9),
    timestamp: Date.now(),
    html: `<!DOCTYPE html><html><head><title>${title}</title></head><body style="margin:0;display:flex;justify-content:center;align-items:center;background:#f0f0f0;"><img src="${base64Data}" style="max-width:100%;box-shadow:0 4px 6px rgba(0,0,0,0.1);" /></body></html>`,
    image: base64Data,
    sourceUrl: sourceUrl,
    title: title
  };

  chrome.storage.local.get(['capturedItems'], (result) => {
    const currentItems = result.capturedItems || [];
    const updatedItems = [newItem, ...currentItems];
    chrome.storage.local.set({ capturedItems: updatedItems }, () => {
      console.log("[XStitch] Saved image design to storage!");
    });
  });
}

// --- Zip Processing ---

/**
 * Processes a ZIP file (Stitch Export), extracts HTML and Images, and saves them as items.
 * This is the core logic that converts a raw Stitch export into a usable Design Item.
 */
async function processZipData(base64DataUrl: string, sourceUrl: string, tabId?: number) {
  try {
    // The data is a base64 Data URL (data:application/octet-stream;base64,...)
    const base64Data = base64DataUrl.split(',')[1];

    const zip = await JSZip.loadAsync(base64Data, { base64: true });
    console.log("[XStitch] Zip loaded. Files found:", Object.keys(zip.files));

    const newItems: any[] = [];

    // Group files by folder to reconstruct designs
    const folders: Record<string, { html?: any, image?: any }> = {};

    zip.forEach((relativePath, file) => {
      if (file.dir) return;

      const parts = relativePath.split('/');
      const fileName = parts.pop();
      const folderPath = parts.join('/'); // "" for root, "ScreenName" for folder

      if (!folders[folderPath]) folders[folderPath] = {};

      if (fileName === 'index.html' || fileName === 'code.html' || fileName?.endsWith('.html')) {
        folders[folderPath].html = file;
      } else if (fileName?.match(/\.(png|jpg|jpeg|webp)$/i)) {
        // Only grab the first image found in the folder (usually the design preview)
        if (!folders[folderPath].image) {
          folders[folderPath].image = file;
        }
      }
    });

    // Process each folder that has an html file OR an image
    for (const [folderPath, files] of Object.entries(folders)) {
      if (files.html || files.image) {
        let htmlContent = "";
        let imageBase64 = null;

        if (files.html) {
          htmlContent = await files.html.async("string");
        }

        if (files.image) {
          const imgData = await files.image.async("base64");
          const ext = files.image.name.split('.').pop();
          imageBase64 = `data:image/${ext};base64,${imgData}`;
        }

        // If no HTML, generate a simple wrapper
        if (!htmlContent && imageBase64) {
          htmlContent = `<!DOCTYPE html><html><head><title>Design</title></head><body style="margin:0;display:flex;justify-content:center;align-items:center;"><img src="${files.image.name}" style="max-width:100%;" /></body></html>`;
        }

        // Extract a clean title from the folder path
        const pathParts = folderPath.split('/');
        let title = pathParts[pathParts.length - 1];

        // Handle generic folder names
        if (title === '_canvas_screen' && pathParts.length > 1) {
          title = pathParts[pathParts.length - 2];
        }

        // Clean up title
        title = title.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
        title = title.replace(/^Stitch\s+/i, '');

        newItems.push({
          id: Date.now().toString() + Math.random().toString(36).substr(2, 9),
          timestamp: Date.now(),
          html: htmlContent,
          image: imageBase64,
          sourceUrl: sourceUrl,
          title: title
        });
      }
    }

    if (newItems.length > 0) {
      console.log(`[XStitch] Saving ${newItems.length} items to Storage...`);

      // Save to Storage
      chrome.storage.local.get(['capturedItems'], (result) => {
        const currentItems = result.capturedItems || [];
        const updatedItems = [...newItems, ...currentItems];
        chrome.storage.local.set({ capturedItems: updatedItems }, () => {
          console.log("[XStitch] Saved to storage!");
        });
      });

      // Schedule batched notification
      scheduleNotification(newItems.length, tabId);
    }

  } catch (err) {
    console.error("[XStitch] Failed to process zip:", err);
  }
}

// --- Auto-Hide Side Panel Logic ---

const STITCH_DOMAINS = ["stitch.withgoogle.com", "appspot.com"];

function isStitchUrl(url?: string): boolean {
  if (!url) return false;
  return STITCH_DOMAINS.some(d => url.includes(d));
}

async function updateSidePanelVisibility(tabId: number, url?: string) {
  const { settings } = await new Promise<any>((resolve) => chrome.storage.local.get(['settings'], resolve));
  const experimental = settings?.experimentalMode;

  // We use tab-specific options to control visibility per tab
  if (isStitchUrl(url) || experimental) {
    await chrome.sidePanel.setOptions({
      tabId,
      path: 'index.html',
      enabled: true
    });
  } else {
    // Disable side panel for non-Stitch tabs (automatically closes it)
    await chrome.sidePanel.setOptions({
      tabId,
      enabled: false
    });
  }
}

// Listen for tab updates
chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (changeInfo.status === 'complete' || changeInfo.url) {
    updateSidePanelVisibility(tabId, tab.url);
  }
});

// Listen for tab activation
chrome.tabs.onActivated.addListener(async (activeInfo) => {
  try {
    const tab = await chrome.tabs.get(activeInfo.tabId);
    updateSidePanelVisibility(activeInfo.tabId, tab.url);
  } catch (e) {
    // Tab might be closed or inaccessible
  }
});
