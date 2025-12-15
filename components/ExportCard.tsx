import { useState, useRef, useEffect } from 'react';
import { Trash2, Code, Image as ImageIcon, Images, Pen, Check, Download } from 'lucide-react';

declare var chrome: any;

interface CapturedItem {
  id: string;
  html: string;
  image: string | null;
  sourceUrl: string;
  timestamp: number;
  title?: string;
  initialTab?: 'design' | 'code';
}

interface ExportCardProps {
  item: CapturedItem;
  onDelete: (id: string) => void;
  onRename: (id: string, newTitle: string) => void;
}

function ExportCard({ item, onDelete, onRename }: ExportCardProps) {
  const [showCodeOverlay, setShowCodeOverlay] = useState(false);
  const [showImageOverlay, setShowImageOverlay] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [newTitle, setNewTitle] = useState(item.title || 'Untitled Design');
  const [copiedHtml, setCopiedHtml] = useState(false);
  const [copiedImage, setCopiedImage] = useState(false);
  const [copiedBoth, setCopiedBoth] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  // Auto-focus input when editing starts
  useEffect(() => {
    if (isEditing && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [isEditing]);

  // Sync internal state when prop changes (e.g. renamed from Preview page)
  useEffect(() => {
    setNewTitle(item.title || 'Untitled Design');
  }, [item.title]);

  const handleSaveTitle = () => {
    // Remove invalid filename characters: < > : " / \ | ? *
    const sanitized = newTitle.replace(/[<>:"/\\|?*]/g, '').trim();

    if (sanitized) {
      onRename(item.id, sanitized);
      setNewTitle(sanitized);
    } else {
      setNewTitle(item.title || 'Untitled Design');
    }
    setIsEditing(false);
  };

  const handleDownload = async () => {
    const JSZip = (await import('jszip')).default;
    const zip = new JSZip();
    const folderName = item.title || 'design';
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

    const content = await zip.generateAsync({ type: 'blob' });
    const url = URL.createObjectURL(content);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${folderName}.zip`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      handleSaveTitle();
    } else if (e.key === 'Escape') {
      setNewTitle(item.title || 'Untitled Design');
      setIsEditing(false);
    }
  };

  const copyHTML = () => {
    navigator.clipboard.writeText(item.html);
    setCopiedHtml(true);
    setTimeout(() => setCopiedHtml(false), 2000);
  };

  const copyImage = async () => {
    if (!item.image) return;

    try {
      const response = await fetch(item.image);
      const blob = await response.blob();
      await navigator.clipboard.write([
        new ClipboardItem({ 'image/png': blob })
      ]);
      setCopiedImage(true);
      setTimeout(() => setCopiedImage(false), 2000);
    } catch (err) {
      console.error('Failed to copy image:', err);
    }
  };



  // Generates a composite image of the design and its code
  const copyAsImages = async () => {
    if (!item.image) return;

    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const img = new Image();
    img.src = item.image;
    await new Promise(resolve => { img.onload = resolve; });

    // Dynamic sizing based on image width
    const padding = Math.max(40, img.width * 0.05); // 5% padding

    // Calculate font size proportional to image width (e.g., 2% of width, min 14px)
    const fontSize = Math.max(14, Math.floor(img.width * 0.02));
    const lineHeight = Math.floor(fontSize * 1.5);

    // Split code into lines first to get total count
    const allLines = item.html.split('\n');

    // Calculate code block height to fit ALL lines of code
    const numberOfLines = allLines.length;
    const codeBlockHeight = (numberOfLines * lineHeight) + (padding * 2);

    canvas.width = img.width + padding * 2;
    canvas.height = img.height + codeBlockHeight + padding * 3;

    // Background
    ctx.fillStyle = '#0f172a';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // Draw Image
    ctx.drawImage(img, padding, padding);

    // Draw Code Block Background
    ctx.fillStyle = '#1e293b';
    ctx.fillRect(padding, img.height + padding * 2, img.width, codeBlockHeight);

    // Draw Code Text
    ctx.fillStyle = '#94a3b8';
    ctx.font = `${fontSize}px monospace`;

    const lines = allLines;
    lines.forEach((line, i) => {
      // Simple truncation to avoid overflow
      const maxChars = Math.floor(img.width / (fontSize * 0.6)); // Approx char width
      const truncatedLine = line.length > maxChars ? line.substring(0, maxChars) + '...' : line;

      ctx.fillText(truncatedLine, padding + (padding / 2), img.height + padding * 2 + padding + (i * lineHeight) + fontSize);
    });

    canvas.toBlob(async (blob) => {
      if (blob) {
        await navigator.clipboard.write([
          new ClipboardItem({ 'image/png': blob })
        ]);
        setCopiedBoth(true);
        setTimeout(() => setCopiedBoth(false), 2000);
      }
    });
  };

  const getRelativeTime = (timestamp: number) => {
    const seconds = Math.floor((Date.now() - timestamp) / 1000);
    if (seconds < 60) return 'just now';
    const minutes = Math.floor(seconds / 60);
    if (minutes < 60) return `${minutes} minute${minutes > 1 ? 's' : ''} ago`;
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return `${hours} hour${hours > 1 ? 's' : ''} ago`;
    const days = Math.floor(hours / 24);
    return `${days} day${days > 1 ? 's' : ''} ago`;
  };

  return (
    <div className="group/card relative flex flex-col rounded-xl bg-slate-800 border border-slate-700 shadow-lg mb-6 last:mb-0">
      {/* Card Header */}
      <div className="flex items-start justify-between px-4 pt-4 pb-3">
        <div className="flex-1 min-w-0 mr-2">
          {isEditing ? (
            <div className="flex items-center gap-2">
              <input
                ref={inputRef}
                type="text"
                value={newTitle}
                onChange={(e) => setNewTitle(e.target.value)}
                onBlur={handleSaveTitle}
                onKeyDown={handleKeyDown}
                className="w-full bg-slate-900 border border-slate-600 rounded px-2 py-1 text-sm text-white focus:outline-none focus:border-blue-500"
              />
              <button
                onClick={handleSaveTitle}
                className="p-1 text-green-400 hover:bg-slate-700 rounded"
              >
                <Check className="w-4 h-4" />
              </button>
            </div>
          ) : (
            <div className="flex items-center gap-2 group/title">
              <h2 className="text-base font-semibold text-white truncate">
                {item.title || 'Untitled Design'}
              </h2>
              <button
                onClick={() => {
                  setNewTitle(item.title || 'Untitled Design');
                  setIsEditing(true);
                }}
                className="opacity-0 group-hover/title:opacity-100 p-1 text-slate-400 hover:text-blue-400 transition-opacity"
              >
                <Pen className="w-3 h-3" />
              </button>
            </div>
          )}
          <p className="text-xs text-slate-400 mt-0.5">
            Captured: {getRelativeTime(item.timestamp)}
          </p>
        </div>
        <button
          onClick={() => onDelete(item.id)}
          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-slate-400 transition-colors hover:bg-slate-700/50 hover:text-red-400"
        >
          <Trash2 className="w-4 h-4" />
        </button>
      </div>

      {/* Preview Section */}
      <div className="px-4">
        <div className="w-full overflow-hidden rounded-lg border border-slate-700">
          {/* Image Preview */}
          {item.image && (
            <div
              className="relative w-full aspect-[16/10] group/image"
              onMouseEnter={() => setShowImageOverlay(true)}
              onMouseLeave={() => setShowImageOverlay(false)}
            >
              <div
                className="w-full h-full bg-cover bg-center bg-no-repeat"
                style={{ backgroundImage: `url(${item.image})` }}
              />

              {/* View Image Overlay */}
              {showImageOverlay && (
                <div className="absolute inset-0 flex items-center justify-center bg-slate-900/50 transition-opacity">
                  <button
                    onClick={() => {
                      chrome.storage.local.set({
                        previewData: { ...item, initialTab: 'design' }
                      }, () => {
                        chrome.tabs.create({ url: chrome.runtime.getURL('preview.html') });
                      });
                    }}
                    className="flex items-center gap-2 rounded-full bg-white/20 px-4 py-2 text-sm font-medium text-white backdrop-blur-sm hover:bg-white/30"
                  >
                    <ImageIcon className="w-4 h-4" />
                    <span>View Image</span>
                  </button>
                </div>
              )}
            </div>
          )}

          {/* Code Preview with Hover Overlay */}
          <div
            className="relative max-h-24 overflow-hidden bg-slate-900/70 p-3"
            onMouseEnter={() => setShowCodeOverlay(true)}
            onMouseLeave={() => setShowCodeOverlay(false)}
          >
            <div className="code-preview-mask">
              <pre className="whitespace-pre-wrap font-mono text-xs text-slate-400">
                <code>{item.html.substring(0, 300)}...</code>
              </pre>
            </div>

            {/* View Code Overlay */}
            {showCodeOverlay && (
              <div className="absolute inset-0 flex items-center justify-center bg-slate-900/50 transition-opacity">
                <button
                  onClick={() => {
                    chrome.storage.local.set({
                      previewData: { ...item, initialTab: 'code' }
                    }, () => {
                      chrome.tabs.create({ url: chrome.runtime.getURL('preview.html') });
                    });
                  }}
                  className="flex items-center gap-2 rounded-full bg-white/20 px-4 py-2 text-sm font-medium text-white backdrop-blur-sm hover:bg-white/30"
                >
                  <Code className="w-4 h-4" />
                  <span>View Code</span>
                </button>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Action Buttons */}
      <div className="flex flex-col gap-2 p-4">
        {/* Top Row: HTML and Image */}
        <div className="grid grid-cols-2 gap-2">
          <button
            onClick={copyHTML}
            className="flex h-9 items-center justify-center gap-2 rounded-lg bg-slate-700/50 text-sm font-medium text-slate-300 hover:bg-slate-700 transition-colors"
          >
            {copiedHtml ? <Check className="w-4 h-4 text-green-400" /> : <Code className="w-4 h-4" />}
            <span className="truncate">{copiedHtml ? 'Copied!' : 'Copy HTML'}</span>
          </button>
          <button
            onClick={copyImage}
            className="flex h-9 items-center justify-center gap-2 rounded-lg bg-slate-700/50 text-sm font-medium text-slate-300 hover:bg-slate-700 transition-colors"
          >
            {copiedImage ? <Check className="w-4 h-4 text-green-400" /> : <ImageIcon className="w-4 h-4" />}
            <span className="truncate">{copiedImage ? 'Copied!' : 'Copy Image'}</span>
          </button>
        </div>



        {/* Copy Both as Image - Highlighted */}
        <button
          onClick={copyAsImages}
          className="flex h-10 items-center justify-center gap-2 rounded-lg bg-blue-600/30 text-sm font-semibold text-blue-400 hover:bg-blue-600/40 transition-colors"
        >
          {copiedBoth ? <Check className="w-4 h-4 text-green-400" /> : <Images className="w-4 h-4" />}
          <span className="truncate">{copiedBoth ? 'Copied!' : 'Copy Both as Image'}</span>
        </button>

        {/* Download */}
        <button
          onClick={handleDownload}
          className="flex h-10 items-center justify-center gap-2 rounded-lg bg-emerald-600/30 text-sm font-semibold text-emerald-400 hover:bg-emerald-600/40 transition-colors"
        >
          <Download className="w-4 h-4" />
          <span className="truncate">Download ZIP</span>
        </button>
      </div>
    </div>
  );
}

export default ExportCard;
