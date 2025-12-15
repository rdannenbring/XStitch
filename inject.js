
// This script is injected into the page to intercept Blob creation
(function () {
    const originalCreateObjectURL = window.URL.createObjectURL;

    window.URL.createObjectURL = function (obj) {
        // Call the original function
        const url = originalCreateObjectURL.call(window.URL, obj);

        // Check if it's a Zip file (Stitch export)
        if (obj instanceof Blob && (obj.type === 'application/zip' || obj.size > 1000)) {
            // Only log when we actually intercept something interesting
            console.log('[StitchBridge] Intercepted potential Stitch ZIP:', url);

            // Read the blob immediately
            const reader = new FileReader();
            reader.onloadend = function () {
                // Send the data to the content script via custom event
                window.dispatchEvent(new CustomEvent('STITCH_BLOB_INTERCEPTED', {
                    detail: {
                        url: url,
                        data: reader.result // Base64 string
                    }
                }));
            };
            reader.readAsDataURL(obj);
        }

        return url;
    };

    console.log('[StitchBridge] Blob interceptor injected.');

    // Intercept Anchor Clicks (for Data URIs)
    window.addEventListener('click', function (event) {
        // Use type assertion or check if it's an element
        const target = event.target;
        if (!target || !target.closest) return;

        const anchor = target.closest('a');
        if (anchor && anchor.hasAttribute('download')) {
            const href = anchor.href;
            // Check for Zip or Image Data URIs
            if (href.startsWith('data:application/zip') || href.startsWith('data:image/')) {
                console.log('[StitchBridge] Intercepted Anchor Download:', href.substring(0, 50) + '...');

                // Send data to content script
                window.dispatchEvent(new CustomEvent('STITCH_BLOB_INTERCEPTED', {
                    detail: {
                        url: 'anchor_click',
                        data: href // Pass the full Data URL
                    }
                }));
            }
        }
    }, true); // Capture phase to catch it early
})();
