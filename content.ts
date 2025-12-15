// content.ts
// Content script for XStitch.
// Handles page interaction, blob interception injection, and UI overlays.

declare var chrome: any;

// --- Initialization ---

chrome.storage.local.get(['settings'], (result) => {
  const experimental = result.settings?.experimentalMode;
  const isStitch = ["stitch.withgoogle.com", "appspot.com"].some(d => window.location.href.includes(d));

  // Only run on Stitch domains or if Experimental Mode is enabled
  if (experimental || isStitch) {
    runContentScript();
  }
});

/**
 * Main entry point for the content script logic.
 */
function runContentScript() {
  // Inject the blob interceptor script (inject.js) into the page context
  const script = document.createElement('script');
  script.src = chrome.runtime.getURL('inject.js');
  (document.head || document.documentElement).appendChild(script);
  script.onload = () => {
    script.remove();
  };

  // --- Event Listeners ---

  // Listen for intercepted blobs from the page (dispatched by inject.js)
  window.addEventListener('STITCH_BLOB_INTERCEPTED', (event: any) => {
    console.log('[XStitch] Received intercepted blob data from page');
    const { url, data } = event.detail;

    // Send to background for processing
    try {
      chrome.runtime.sendMessage({
        type: 'BLOB_DATA_CAPTURED',
        url: url,
        data: data
      });
    } catch (error) {
      console.error('[XStitch] Failed to send message:', error);
      // If context is invalidated, we can't use the background script, but we can still show a DOM toast
      showToast("⚠️ Extension updated. Please refresh the page!");
    }
  });

  let lastRightClickedElement: HTMLElement | null = null;
  let mouseX = 0;
  let mouseY = 0;
  let lastMouseMoveTime = 0;

  // Track mouse coordinates for "Hit Testing" (finding elements under cursor)
  document.addEventListener('mousemove', (event) => {
    mouseX = event.clientX;
    mouseY = event.clientY;
    lastMouseMoveTime = Date.now();
  }, { passive: true });

  // Track the element clicked for Context Menus
  document.addEventListener('contextmenu', (event) => {
    lastRightClickedElement = event.target as HTMLElement;
    lastMouseMoveTime = Date.now();
  }, { capture: true });

  // Listen for messages from Background Script
  chrome.runtime.onMessage.addListener((request: any, sender: any, sendResponse: any) => {
    if (request.type === "TRIGGER_STITCH_EXPORT") {
      handleExportTrigger();
    }

    if (request.type === "SHOW_XSTITCH_NOTIFICATION") {
      showXStitchNotification(request.count || 1);
    }

    // Helper to fetch blob URLs that might be restricted by CORS in background
    if (request.type === "FETCH_BLOB_URL") {
      console.log("[XStitch] Content script asked to fetch blob:", request.url);
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
          console.error('[XStitch] Blob fetch failed:', error);
          sendResponse({ success: false, error: error.toString() });
        });
      return true; // Keep channel open for async response
    }
  });

  // --- Notification Logic ---

  let notificationTimeout: number | null = null;
  let lastNotificationTime = 0;

  function showXStitchNotification(count: number) {
    // Only show notification in the top frame to avoid duplicates in iframes
    if (window !== window.top) return;

    // Prevent duplicate notifications within 2 seconds
    const now = Date.now();
    if (now - lastNotificationTime < 2000) {
      console.log("[XStitch] Skipping duplicate notification");
      return;
    }
    lastNotificationTime = now;

    // Clear any pending notification timeout
    if (notificationTimeout) {
      clearTimeout(notificationTimeout);
      notificationTimeout = null;
    }

    // Remove any existing notification immediately
    const existing = document.querySelectorAll('.xstitch-notification');
    existing.forEach(el => el.remove());

    // Create notification element
    const notification = document.createElement('div');
    notification.className = 'xstitch-notification';
    notification.innerHTML = `
    <div class="xstitch-notification-icon">
      <svg viewBox="0 0 100 100" style="width: 100%; height: 100%;" fill="none" xmlns="http://www.w3.org/2000/svg">
        <path d="M 48 28 L 56 34 L 44 42 L 56 50 L 44 58 L 56 66 L 48 72" stroke="#ec4899" stroke-width="8" stroke-linecap="round" stroke-linejoin="round" />
        <rect x="10" y="10" width="38" height="52" rx="6" fill="white" stroke="#cbd5e1" stroke-width="3" />
        <rect x="52" y="38" width="38" height="52" rx="6" fill="white" stroke="#cbd5e1" stroke-width="3" />
      </svg>
    </div>
    <div class="xstitch-notification-content">
      <div class="xstitch-notification-title">XStitch Saved</div>
      <div class="xstitch-notification-message">${count} item${count > 1 ? 's' : ''} captured</div>
    </div>
    <button class="xstitch-notification-close">×</button>
  `;

    console.log("[XStitch] Showing notification for", count, "items");

    // Add click handler to open side panel
    notification.addEventListener('click', (e) => {
      if (!(e.target as HTMLElement).classList.contains('xstitch-notification-close')) {
        chrome.runtime.sendMessage({ type: 'OPEN_SIDE_PANEL' });
      }
    });

    // Add close button handler
    const closeBtn = notification.querySelector('.xstitch-notification-close');
    closeBtn?.addEventListener('click', (e) => {
      e.stopPropagation();
      notification.remove();
    });

    // Add to page
    document.body.appendChild(notification);

    // Auto-remove after 10 seconds
    notificationTimeout = window.setTimeout(() => {
      notification.remove();
      notificationTimeout = null;
    }, 10000);
  }

  // --- Export Logic ---

  async function handleExportTrigger() {
    // 0. Check for User Selection (High Priority, Keyboard Workflow)
    const selection = window.getSelection();
    if (selection && selection.toString().length > 50) {
      chrome.runtime.sendMessage({
        type: 'STITCH_EXPORT_FULL',
        payload: {
          html: selection.toString(),
          image: null,
          sourceUrl: window.location.href,
          title: "Selected Code"
        }
      });
      showToast("✅ Selected Code Captured!");
      return;
    }

    // 1. Frame Check: Only run if the mouse was recently active in this frame (within 2 seconds)
    if (Date.now() - lastMouseMoveTime > 2000) {
      return;
    }

    showToast("⏳ Analyzing...");

    // STRATEGY 1: Try to find an open "View Code" modal/editor (Scraping)
    const codeContent = await tryGetCodeFromEditor();
    if (codeContent) {
      chrome.runtime.sendMessage({
        type: 'STITCH_EXPORT_FULL',
        payload: {
          html: codeContent, // The actual source code!
          image: null,       // We might not see the image if the modal is open
          sourceUrl: window.location.href,
          title: "Source Code"
        }
      });

      if (codeContent.includes('<!-- NOTE: Captured VISIBLE code only')) {
        showToast("✅ Visible Code Captured. (Tip: Allow clipboard or use Ctrl+A)");
      } else {
        showToast("✅ Source Code Captured!");
      }
      return;
    }

    // STRATEGY 2: Capture Design Image (Standard Flow)
    let targetNode: HTMLElement | null = null;

    if (lastRightClickedElement) {
      targetNode = lastRightClickedElement.closest('.react-flow__node') as HTMLElement;
      lastRightClickedElement = null;
    }

    if (!targetNode) {
      const elements = document.elementsFromPoint(mouseX, mouseY);
      for (const el of elements) {
        const node = el.closest('.react-flow__node');
        if (node) {
          targetNode = node as HTMLElement;
          break;
        }
      }
    }

    if (!targetNode) {
      showToast("⚠️ No Design or Code found.");
      return;
    }

    try {
      const cleanWrapper = getCleanWrapper(targetNode);
      const imageUrl = await getHighResImage(targetNode);

      // Try to extract title from HTML
      let title = "Visual Capture";
      try {
        const parser = new DOMParser();
        const doc = parser.parseFromString(cleanWrapper, 'text/html');
        const h1 = doc.querySelector('h1, h2, h3, [class*="title"], [class*="heading"]');
        if (h1 && h1.textContent) {
          title = h1.textContent.trim().substring(0, 50);
        }
      } catch (e) {
        // Fallback to default
      }

      chrome.runtime.sendMessage({
        type: 'STITCH_EXPORT_FULL',
        payload: {
          html: cleanWrapper,
          image: imageUrl,
          sourceUrl: window.location.href,
          title: "Visual Capture"
        }
      });

      showToast("✅ Image Captured. (Open 'View Code' to capture source)");

    } catch (error) {
      console.error("[XStitch] Export failed:", error);
      showToast("❌ Export Failed.");
    }
  }

  // --- Editor Scraping Helpers ---

  /**
   * Attempts to extract source code from the Stitch editor using multiple fallback strategies.
   */
  async function tryGetCodeFromEditor(): Promise<string | null> {
    // STRATEGY 1: "Copy code" Button (The Golden Path)
    const allButtons = Array.from(document.querySelectorAll('button'));
    const copyButton = allButtons.find(btn => btn.innerText.toLowerCase().includes('copy code'));

    if (copyButton) {
      copyButton.click();

      // Wait for clipboard update
      await new Promise(resolve => setTimeout(resolve, 200));

      try {
        const text = await navigator.clipboard.readText();
        if (text && text.length > 50) {
          return text;
        }
      } catch (err) {
        // Clipboard read failed
      }
    }

    // STRATEGY 2: Programmatic "Select All" (Automating the manual step)
    // If we can't click the button, let's try to force a selection.
    const editorNode = document.querySelector('.monaco-editor');
    if (editorNode) {
      const activeElement = document.activeElement as HTMLElement;

      // Try to focus the editor's input
      const input = editorNode.querySelector('textarea, .inputarea') as HTMLElement;
      if (input) input.focus();

      // Execute Select All
      document.execCommand('selectAll');

      // Wait a tiny bit for selection to apply
      await new Promise(resolve => setTimeout(resolve, 50));

      const selection = window.getSelection();
      if (selection && selection.toString().length > 50) {
        return selection.toString();
      }

      // Restore focus if needed (optional)
      if (activeElement) activeElement.focus();
    }

    // STRATEGY 3: User Selection (Manual Backup)
    const selection = window.getSelection();
    if (selection && selection.toString().length > 50) {
      return selection.toString();
    }

    // STRATEGY 4: Monaco Editor Scraper (Visible Lines Only - Last Resort)
    const viewLinesContainer = document.querySelector('.monaco-editor .view-lines');
    if (viewLinesContainer) {
      const lines = Array.from(viewLinesContainer.children) as HTMLElement[];
      const codeLines = lines.filter(line => line.classList.contains('view-line'));

      if (codeLines.length > 0) {
        codeLines.sort((a, b) => {
          const topA = parseInt(a.style.top || '0', 10);
          const topB = parseInt(b.style.top || '0', 10);
          return topA - topB;
        });

        const text = codeLines.map(line => line.innerText.replace(/\u00a0/g, ' ')).join('\n');

        if (text.length > 50) {
          // Check if it looks like a full file
          if (text.trim().startsWith('<!DOCTYPE html')) {
            return text; // It's likely the full file (small enough to fit in view)
          }

          return `<!-- NOTE: Captured VISIBLE code only. To get the full file, please allow clipboard permissions or use the 'Copy code' button manually. -->\n\n${text}`;
        }
      }
    }

    return null;
  }

  function getCleanWrapper(element: HTMLElement): string {
    const clone = element.cloneNode(true) as HTMLElement;

    // Remove UI noise
    const uiSelectors = [
      '.react-flow__handle',
      '.react-flow__resize-control',
      '[role="toolbar"]',
      '[aria-label="Node Toolbar"]',
      '.react-flow__node-toolbar',
      '.f-font-s-body' // Label header
    ];

    uiSelectors.forEach(selector => {
      clone.querySelectorAll(selector).forEach(el => el.remove());
    });

    // Remove focus rings
    const wrapper = clone.querySelector('.group-focus-visible\\:ring-4');
    if (wrapper) {
      wrapper.classList.remove('group-focus-visible:ring-4', 'group-focus-visible:ring-blue-500', 'group-focus-visible:ring-offset-2');
    }

    // Insert a comment to explain to the AI what this is
    return `<!-- STITCH DESIGN PREVIEW -->\n<!-- Note: This is a visual capture. To get the implementation code, open 'View Code' in Stitch and export again. -->\n${clone.outerHTML}`;
  }

  async function getHighResImage(element: HTMLElement): Promise<string | null> {
    const img = element.querySelector('img');
    if (img && img.src) {
      return await fetchImageAsBase64(img.src);
    }
    return null;
  }

  function fetchImageAsBase64(url: string): Promise<string> {
    return new Promise((resolve, reject) => {
      chrome.runtime.sendMessage({
        type: 'FETCH_IMAGE_BASE64',
        url: url
      }, (response: any) => {
        if (response && response.success) {
          resolve(response.data);
        } else {
          resolve(url);
        }
      });
    });
  }

  function showToast(message: string) {
    const existingToast = document.getElementById('stitch-bridge-toast');
    if (existingToast) existingToast.remove();

    const toast = document.createElement('div');
    toast.id = 'stitch-bridge-toast';
    toast.textContent = message;
    toast.style.cssText = `
    position: fixed;
    bottom: 24px;
    right: 24px;
    background-color: #0f172a;
    color: #e2e8f0;
    padding: 12px 20px;
    border-radius: 8px;
    z-index: 2147483647;
    box-shadow: 0 10px 15px -3px rgba(0, 0, 0, 0.5);
    user-select: none;
    font-family: sans-serif;
    font-size: 14px;
    border: 1px solid #1e293b;
    font-weight: 500;
    display: flex;
    align-items: center;
    gap: 8px;
    animation: fadeIn 0.2s ease-out;
    pointer-events: none;
  `;
    document.body.appendChild(toast);
    setTimeout(() => {
      toast.style.opacity = '0';
      toast.style.transition = 'opacity 0.3s ease';
      setTimeout(() => toast.remove(), 4000);
    }, 4000);
  }

  // --- Status Overlay Logic ---

  function createStatusOverlay() {
    // Only show overlay in the top frame
    if (window !== window.top) return;

    const id = 'xstitch-status-overlay';
    if (document.getElementById(id)) return;

    const container = document.createElement('div');
    container.id = id;

    // Style container
    Object.assign(container.style, {
      position: 'fixed',
      top: '72px',
      right: '16px',
      zIndex: '2147483647',
      userSelect: 'none',
      backgroundColor: '#0f172a',
      color: '#e2e8f0',
      padding: '12px 16px',
      borderRadius: '8px',
      boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06)',
      border: '1px solid #1e293b',
      fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif',
      fontSize: '13px',
      display: 'flex',
      flexDirection: 'column',
      gap: '8px',
      maxWidth: '320px',
      transition: 'opacity 0.3s ease',
      opacity: '0', // Start hidden until loaded
      pointerEvents: 'auto'
    });

    container.innerHTML = `
    <div id="xstitch-header-click" style="display: flex; align-items: start; gap: 10px; cursor: pointer; user-select: none;">
      <div style="flex-shrink: 0; width: 32px; height: 32px; background: #1e293b; border-radius: 6px; display: flex; align-items: center; justify-content: center;">
        <img src="${chrome.runtime.getURL('icons/icon48.png')}" style="width: 20px; height: 20px;" />
      </div>
      <div style="flex: 1;">
        <div style="font-weight: 600; color: #fff; margin-bottom: 2px;">XStitch Active</div>
        <div id="xstitch-desc" style="font-size: 11px; color: #94a3b8; line-height: 1.4;">
          Downloads are being intercepted and will not be saved to your local download location.
        </div>
      </div>
      <button id="xstitch-open-panel" title="Open Side Panel" style="background: transparent; border: none; color: #94a3b8; cursor: pointer; padding: 4px; border-radius: 4px; transition: color 0.2s, background 0.2s; margin-top: -4px; margin-right: -4px;">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="15 18 9 12 15 6"></polyline></svg>
      </button>
    </div>
    <div style="display: flex; align-items: center; justify-content: space-between; margin-top: 4px; padding-top: 8px; border-top: 1px solid #1e293b;">
      <span id="xstitch-status-label" style="font-size: 11px; font-weight: 500; color: #64748b;">INTERCEPTION STATUS</span>
      <label style="display: flex; align-items: center; gap: 8px; cursor: pointer;">
        <span id="xstitch-status-text" style="font-size: 11px; font-weight: 600; color: #22c55e;">ACTIVE</span>
        <div style="position: relative; width: 36px; height: 20px; background: #2563eb; border-radius: 999px; transition: background 0.2s;">
          <input type="checkbox" id="xstitch-toggle" style="opacity: 0; width: 0; height: 0; position: absolute;" />
          <div id="xstitch-knob" style="position: absolute; top: 2px; left: 2px; width: 16px; height: 16px; background: white; border-radius: 50%; transition: transform 0.2s, left 0.2s; box-shadow: 0 1px 2px rgba(0,0,0,0.2);"></div>
        </div>
      </label>
    </div>
  `;

    document.body.appendChild(container);

    // Logic
    const toggle = container.querySelector('#xstitch-toggle') as HTMLInputElement;
    const knob = container.querySelector('#xstitch-knob') as HTMLElement;
    const statusText = container.querySelector('#xstitch-status-text') as HTMLElement;
    const track = toggle.parentElement as HTMLElement;
    const desc = container.querySelector('#xstitch-desc') as HTMLElement;
    const statusLabel = container.querySelector('#xstitch-status-label') as HTMLElement;
    const openBtn = container.querySelector('#xstitch-open-panel') as HTMLElement;
    const headerClick = container.querySelector('#xstitch-header-click') as HTMLElement;
    const iconOpen = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="15 18 9 12 15 6"></polyline></svg>`;
    const iconClose = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="9 18 15 12 9 6"></polyline></svg>`;

    headerClick.addEventListener('click', (e) => {
      // Prevent toggling if user clicked the "Open Side Panel" button directly
      // (though it's inside, we handle it generally here)
      // BUT we must allow the toggle switch to work independently
      const target = e.target as HTMLElement;
      if (target.closest('label')) {
        return;
      }
      chrome.runtime.sendMessage({ type: 'TOGGLE_SIDE_PANEL' });
    });

    // Hover effects for the button (visual feedback)
    headerClick.addEventListener('mouseover', () => {
      openBtn.style.color = '#fff';
      openBtn.style.backgroundColor = 'rgba(255,255,255,0.1)';
    });
    headerClick.addEventListener('mouseout', () => {
      openBtn.style.color = '#94a3b8';
      openBtn.style.backgroundColor = 'transparent';
    });

    chrome.runtime.onMessage.addListener((request) => {
      if (request.type === 'SIDE_PANEL_STATE') {
        if (request.isOpen) {
          openBtn.innerHTML = iconClose;
          openBtn.title = "Close Side Panel";
        } else {
          openBtn.innerHTML = iconOpen;
          openBtn.title = "Open Side Panel";
        }
      }
    });

    function updateUI(active: boolean) {
      toggle.checked = active;
      if (active) {
        container.style.backgroundColor = 'rgba(6, 78, 59, 0.95)'; // Dark Green
        container.style.borderColor = '#22c55e';
        track.style.background = '#2563eb'; // Blue
        knob.style.left = '18px'; // Right side
        statusText.textContent = 'ACTIVE';
        statusText.style.color = '#4ade80'; // Light Green
        desc.textContent = "Downloads are being intercepted and will not be saved to your local download location.";
        desc.style.color = '#e2e8f0';
        statusLabel.style.color = 'rgba(255, 255, 255, 0.8)';
        container.style.opacity = '1';
      } else {
        container.style.backgroundColor = '#0f172a';
        container.style.borderColor = '#1e293b';
        track.style.background = '#475569'; // Slate-600
        knob.style.left = '2px'; // Left side
        statusText.textContent = 'PASSIVE';
        statusText.style.color = '#94a3b8'; // Slate-400
        desc.textContent = "Downloads will be saved to your local download location (Passive Mode).";
        desc.style.color = '#94a3b8';
        statusLabel.style.color = '#64748b';
        container.style.opacity = '0.9';
      }
    }

    // Initial Load
    chrome.storage.local.get(['settings'], (result: any) => {
      const active = result.settings?.cancelDownloads ?? false;
      updateUI(active);
      // Fade in
      requestAnimationFrame(() => {
        // Opacity handled by updateUI
      });
    });

    // Toggle Handler
    toggle.addEventListener('change', () => {
      const newValue = toggle.checked;
      updateUI(newValue);

      chrome.storage.local.get(['settings'], (result: any) => {
        const currentSettings = result.settings || {};
        chrome.storage.local.set({
          settings: { ...currentSettings, cancelDownloads: newValue }
        });
      });
    });

    // Listen for changes from Side Panel
    chrome.storage.onChanged.addListener((changes: any) => {
      if (changes.settings) {
        const newValue = changes.settings.newValue?.cancelDownloads ?? false;
        if (toggle.checked !== newValue) {
          updateUI(newValue);
        }
      }
    });
  }

  // Initialize when DOM is ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', createStatusOverlay);
  } else {
    createStatusOverlay();
  }
}