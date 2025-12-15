import { useEffect, useState } from 'react';
import ExportCard from './components/ExportCard';
import { Download, Settings, X } from 'lucide-react';

declare var chrome: any;

interface CapturedItem {
  id: string;
  html: string;
  image: string | null;
  sourceUrl: string;
  timestamp: number;
  title?: string;
}

function App() {
  const [items, setItems] = useState<CapturedItem[]>([]);
  const [showSettings, setShowSettings] = useState(false);
  const [cancelDownloads, setCancelDownloads] = useState(false);

  useEffect(() => {
    // Load settings
    chrome.storage.local.get(['settings'], (result) => {
      if (result.settings?.cancelDownloads) {
        setCancelDownloads(result.settings.cancelDownloads);
      }
    });
    console.log("[XStitch] Side panel loaded");

    // Load existing items from storage
    chrome.storage.local.get(['capturedItems'], (result) => {
      if (result.capturedItems) {
        setItems(result.capturedItems);
      }
    });

    // Listen for storage changes
    const handleStorageChange = (changes: any) => {
      if (changes.capturedItems) {
        setItems(changes.capturedItems.newValue || []);
      }
      if (changes.settings) {
        const newSettings = changes.settings.newValue || {};
        if (newSettings.cancelDownloads !== undefined) {
          setCancelDownloads(newSettings.cancelDownloads);
        }
      }
    };

    chrome.storage.onChanged.addListener(handleStorageChange);

    // Establish connection to track open state
    chrome.windows.getCurrent((win) => {
      if (win.id) {
        const port = chrome.runtime.connect({ name: 'sidepanel' });
        port.postMessage({ type: 'INIT', windowId: win.id });
      }
    });

    return () => {
      chrome.storage.onChanged.removeListener(handleStorageChange);
    };
  }, []);

  const toggleCancelDownloads = () => {
    const newValue = !cancelDownloads;
    setCancelDownloads(newValue);
    chrome.storage.local.get(['settings'], (result) => {
      const currentSettings = result.settings || {};
      chrome.storage.local.set({
        settings: { ...currentSettings, cancelDownloads: newValue }
      });
    });
  };

  const handleDelete = (id: string) => {
    const newItems = items.filter(item => item.id !== id);
    setItems(newItems);
    chrome.storage.local.set({ capturedItems: newItems });
  };

  const clearAll = () => {
    setItems([]);
    chrome.storage.local.set({ capturedItems: [] });
  };

  const handleRename = (id: string, newTitle: string) => {
    const newItems = items.map(item =>
      item.id === id ? { ...item, title: newTitle } : item
    );
    setItems(newItems);
    chrome.storage.local.set({ capturedItems: newItems });
  };

  const handleDownloadAll = async () => {
    const JSZip = (await import('jszip')).default;
    const zip = new JSZip();

    items.forEach((item, index) => {
      const folderName = item.title || `Design_${index + 1}`;
      const folder = zip.folder(folderName);

      if (folder) {
        if (item.html) {
          folder.file(`${folderName}.html`, item.html);
        }
        if (item.image) {
          const base64Data = item.image.split(',')[1];
          folder.file(`${folderName}.png`, base64Data, { base64: true });
        }
      }
    });

    const content = await zip.generateAsync({ type: 'blob' });
    const url = URL.createObjectURL(content);
    const a = document.createElement('a');
    a.href = url;
    a.download = `XStitch_Designs_${new Date().toISOString().split('T')[0]}.zip`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="bg-slate-950 text-slate-200 font-sans w-full" style={{ display: 'flex', flexDirection: 'column', height: '100vh', overflow: 'hidden' }}>
      {/* Header */}
      <header className="border-b border-slate-800 bg-[#020617]" style={{ flexShrink: 0, position: 'relative', height: '64px', zIndex: 50 }}>
        {/* Left: Logo */}
        <div
          className="absolute flex items-center gap-3"
          style={{ left: '1rem', top: '50%', transform: 'translateY(-50%)' }}
        >
          <img src="icons/icon48.png" alt="Logo" className="w-8 h-8 drop-shadow-lg" />
        </div>

        {/* Center: Title */}
        <div
          className="absolute"
          style={{ left: '50%', top: '50%', transform: 'translate(-50%, -50%)' }}
        >
          <h1 className="text-lg font-bold text-white whitespace-nowrap">
            XStitch Clipboard
          </h1>
        </div>

        {/* Right: Clear All */}
        <div
          className="absolute"
          style={{ right: '1rem', top: '50%', transform: 'translateY(-50%)' }}
        >
          {items.length > 0 && (
            <button
              onClick={clearAll}
              className="text-xs text-slate-200 hover:text-red-400 transition-colors font-semibold"
            >
              Clear All
            </button>
          )}
        </div>
      </header>

      {/* Status Bar - Always Visible */}
      <div className={`shrink-0 border-b border-slate-800 px-4 py-2 flex items-center justify-between z-40 transition-colors duration-300 ${cancelDownloads ? 'bg-[#064e3b]' : 'bg-slate-900'}`}>
        <div className="flex items-center gap-2">
          <div className={`w-2 h-2 rounded-full ${cancelDownloads ? 'bg-green-400 shadow-[0_0_8px_rgba(74,222,128,0.6)]' : 'bg-slate-600'}`} />
          <span className={`text-xs font-medium ${cancelDownloads ? 'text-green-300' : 'text-slate-500'}`}>
            {cancelDownloads ? 'Intercepting' : 'Passive Mode'}
          </span>
        </div>

        <label className="flex items-center gap-2 cursor-pointer group select-none">
          <input
            type="checkbox"
            checked={cancelDownloads}
            onChange={toggleCancelDownloads}
            className="w-3.5 h-3.5 rounded border-slate-600 bg-slate-800 text-green-500 focus:ring-green-500 focus:ring-offset-slate-900 cursor-pointer"
          />
          <span className={`text-[10px] uppercase tracking-wider font-bold transition-colors ${cancelDownloads ? 'text-green-100' : 'text-slate-500 group-hover:text-slate-300'}`}>
            Cancel Downloads
          </span>
        </label>
      </div>
      {/* Download Toolbar - Sticky below header */}
      {items.length > 0 && (
        <div className="border-b border-slate-800 bg-slate-900/90 p-4 backdrop-blur-md" style={{ flexShrink: 0, zIndex: 40 }}>
          <button
            onClick={handleDownloadAll}
            className="flex h-10 w-full items-center justify-center gap-2 rounded-lg bg-blue-600 text-sm font-semibold text-white shadow-lg shadow-blue-600/30 transition-colors hover:bg-blue-700"
          >
            <Download className="w-4 h-4" />
            <span>Download All ({items.length})</span>
          </button>
        </div>
      )}

      {/* Main Content */}
      <main className="px-4 pb-4" style={{ flex: 1, overflowY: 'auto' }}>
        {items.length === 0 ? (
          <div className="flex flex-col items-center justify-center text-center opacity-50 px-6 pt-12">
            <svg className="w-8 h-8 text-slate-600 mb-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 15l-2 5L9 9l11 4-5 2zm0 0l5 5M7.188 2.239l.777 2.897M5.136 7.965l-2.898-.777M13.95 4.05l-2.122 2.122m-5.657 5.656l-2.12 2.122" />
            </svg>
            <h3 className="text-sm font-medium text-slate-300">No Designs Extracted</h3>
            <p className="text-xs text-slate-500 mt-2 leading-relaxed">
              Navigate to a <a href="https://stitch.withgoogle.com" target="_blank" rel="noopener noreferrer" className="text-blue-400 hover:underline">Google Stitch</a> page, right-click on a screen design and click download.
            </p>
          </div>
        ) : (
          <div className="flex flex-col">
            {items.map(item => (
              <ExportCard key={item.id} item={item} onDelete={handleDelete} onRename={handleRename} />
            ))}
          </div>
        )}
      </main>
    </div>
  );
}

export default App;