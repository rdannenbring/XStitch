import { useState, useEffect, useRef } from 'react';
import { Code, Image as ImageIcon, Copy, Check, Download, ExternalLink, Pen, Save } from 'lucide-react';
import Editor, { loader } from '@monaco-editor/react';
import * as monaco from 'monaco-editor';
import './monaco-workers';

loader.config({ monaco });

declare var chrome: any;

interface PreviewData {
    id: string;
    html: string;
    image: string | null;
    sourceUrl: string;
    timestamp: number;
    title?: string;
    initialTab?: 'design' | 'code';
}

function PreviewApp() {
    const [data, setData] = useState<PreviewData | null>(null);
    const [activeTab, setActiveTab] = useState<'design' | 'code'>('design');
    const [copied, setCopied] = useState(false);
    const [readOnly, setReadOnly] = useState(true);
    const [isEditingTitle, setIsEditingTitle] = useState(false);
    const [titleInput, setTitleInput] = useState('');
    const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);
    const inputRef = useRef<HTMLInputElement>(null);

    // Auto-focus and select text when entering title edit mode
    useEffect(() => {
        if (isEditingTitle && inputRef.current) {
            inputRef.current.focus();
            inputRef.current.select();
        }
    }, [isEditingTitle]);

    // Load initial data and set up bi-directional sync with Side Panel
    useEffect(() => {
        const loadData = () => {
            chrome.storage.local.get(['previewData'], (result: any) => {
                if (result.previewData) {
                    setData(result.previewData);
                    if (result.previewData.initialTab) {
                        setActiveTab(result.previewData.initialTab);
                    }
                    if (result.previewData.title) {
                        setTitleInput(result.previewData.title);
                    }
                }
            });
        };

        loadData();

        // Listen for changes from the side panel
        const handleStorageChange = (changes: any, areaName: string) => {
            if (areaName === 'local' && changes.capturedItems) {
                // Check if our current item was updated
                chrome.storage.local.get(['previewData'], (result: any) => {
                    const currentId = result.previewData?.id;
                    if (!currentId) return;

                    const updatedItems = changes.capturedItems.newValue;
                    const currentItem = updatedItems.find((item: any) => item.id === currentId);

                    if (currentItem) {
                        setData(prev => prev ? { ...prev, title: currentItem.title } : null);
                        setTitleInput(currentItem.title || 'Untitled Design');

                        // Also update the previewData in storage to match, so a reload keeps the title
                        chrome.storage.local.set({
                            previewData: { ...result.previewData, title: currentItem.title }
                        });
                    }
                });
            }
        };

        chrome.storage.onChanged.addListener(handleStorageChange);
        return () => chrome.storage.onChanged.removeListener(handleStorageChange);
    }, []);

    // Persist title changes to both local state and Chrome storage
    const handleSaveTitle = () => {
        if (!data) return;
        const sanitized = titleInput.replace(/[<>:"/\\|?*]/g, '').trim();
        const finalTitle = sanitized || 'Untitled Design';

        // Update local state
        const newData = { ...data, title: finalTitle };
        setData(newData);
        setTitleInput(finalTitle);
        setIsEditingTitle(false);

        // Update storage
        chrome.storage.local.get(['capturedItems'], (result: any) => {
            const items = result.capturedItems || [];
            const updatedItems = items.map((item: any) =>
                item.id === data.id ? { ...item, title: finalTitle } : item
            );

            chrome.storage.local.set({
                capturedItems: updatedItems,
                previewData: newData // Also update the current preview data
            });
        });
    };

    const handleCopy = async () => {
        if (!data) return;

        if (activeTab === 'code') {
            await navigator.clipboard.writeText(data.html);
        } else if (data.image) {
            try {
                const response = await fetch(data.image);
                const blob = await response.blob();
                await navigator.clipboard.write([
                    new ClipboardItem({ 'image/png': blob })
                ]);
            } catch (e) {
                console.error("Failed to copy image", e);
            }
        }

        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
    };

    const handleDownload = async () => {
        if (!data) return;

        const JSZip = (await import('jszip')).default;
        const zip = new JSZip();
        const folderName = data.title || 'design';

        zip.file(`${folderName}.html`, data.html);
        if (data.image) {
            const base64Data = data.image.split(',')[1];
            zip.file(`${folderName}.png`, base64Data, { base64: true });
        }

        const content = await zip.generateAsync({ type: 'blob' });
        const url = URL.createObjectURL(content);
        const a = document.createElement('a');
        a.href = url;
        a.download = `${folderName}.zip`;
        a.click();
        URL.revokeObjectURL(url);
    };

    // Save code changes back to the XStitch Clipboard (storage)
    const handleSaveCode = () => {
        if (!data) return;

        // Update local state
        setHasUnsavedChanges(false);

        // Update storage
        chrome.storage.local.get(['capturedItems'], (result: any) => {
            const items = result.capturedItems || [];
            const updatedItems = items.map((item: any) =>
                item.id === data.id ? { ...item, html: data.html } : item
            );

            chrome.storage.local.set({
                capturedItems: updatedItems,
                previewData: { ...data } // Also update the current preview data
            });
        });
    };

    const handleEditorChange = (value: string | undefined) => {
        if (value !== undefined && data) {
            setData({ ...data, html: value });
            setHasUnsavedChanges(true);
        }
    };

    if (!data) {
        return (
            <div className="flex h-screen items-center justify-center text-slate-400">
                Loading preview...
            </div>
        );
    }

    return (
        <div className="flex flex-col h-screen bg-slate-950 text-slate-200">
            {/* Header */}
            <header className="flex items-center justify-between px-6 py-4 border-b border-slate-800 bg-slate-900">
                <div className="flex items-center gap-4">
                    {isEditingTitle ? (
                        <div className="flex items-center gap-2">
                            <input
                                ref={inputRef}
                                type="text"
                                value={titleInput}
                                onChange={(e) => setTitleInput(e.target.value)}
                                onBlur={handleSaveTitle}
                                onKeyDown={(e) => {
                                    if (e.key === 'Enter') handleSaveTitle();
                                    if (e.key === 'Escape') {
                                        setTitleInput(data.title || 'Untitled Design');
                                        setIsEditingTitle(false);
                                    }
                                }}
                                autoFocus
                                className="bg-slate-800 border border-slate-600 rounded px-2 py-1 text-lg font-semibold text-white focus:outline-none focus:border-blue-500 min-w-[200px]"
                            />
                            <button
                                onClick={handleSaveTitle}
                                className="p-1 text-green-400 hover:bg-slate-700 rounded"
                            >
                                <Check className="w-5 h-5" />
                            </button>
                        </div>
                    ) : (
                        <div className="flex items-center gap-2 group/title">
                            <h1 className="text-xl font-semibold text-white">{data.title || 'Untitled Design'}</h1>
                            <button
                                onClick={() => {
                                    setTitleInput(data.title || 'Untitled Design');
                                    setIsEditingTitle(true);
                                }}
                                className="opacity-0 group-hover/title:opacity-100 p-1 text-slate-400 hover:text-blue-400 transition-opacity"
                            >
                                <Pen className="w-4 h-4" />
                            </button>
                        </div>
                    )}
                    <span className="text-sm text-slate-500">
                        {new Date(data.timestamp).toLocaleString()}
                    </span>
                </div>

                <div className="flex items-center gap-3">
                    {activeTab === 'code' && (
                        <div className="flex items-center gap-2 mr-4">
                            {hasUnsavedChanges && (
                                <div className="flex flex-col items-end mr-2">
                                    <button
                                        onClick={handleSaveCode}
                                        className="flex items-center gap-2 px-4 py-2 rounded-md text-sm font-medium bg-green-600 text-white shadow-sm hover:bg-green-700 transition-colors animate-pulse"
                                        title="Save changes to XStitch Clipboard"
                                    >
                                        <Save className="w-4 h-4" />
                                        Save Changes
                                    </button>
                                    <span className="text-[10px] text-slate-400 mt-1">Updates source in Clipboard</span>
                                </div>
                            )}
                            <div className="flex bg-slate-800 rounded-lg p-1">
                                <button
                                    onClick={() => setReadOnly(!readOnly)}
                                    className={`flex items-center gap-2 px-4 py-2 rounded-md text-sm font-medium transition-colors ${!readOnly
                                        ? 'bg-amber-600 text-white shadow-sm'
                                        : 'text-slate-400 hover:text-slate-200 hover:bg-slate-700/50'
                                        }`}
                                >
                                    {readOnly ? 'Read Only' : 'Editing'}
                                </button>
                            </div>
                        </div>
                    )}

                    <div className="flex bg-slate-800 rounded-lg p-1 mr-4">
                        <button
                            onClick={() => setActiveTab('design')}
                            className={`flex items-center gap-2 px-4 py-2 rounded-md text-sm font-medium transition-colors ${activeTab === 'design'
                                ? 'bg-blue-600 text-white shadow-sm'
                                : 'text-slate-400 hover:text-slate-200 hover:bg-slate-700/50'
                                }`}
                        >
                            <ImageIcon className="w-4 h-4" />
                            Design
                        </button>
                        <button
                            onClick={() => setActiveTab('code')}
                            className={`flex items-center gap-2 px-4 py-2 rounded-md text-sm font-medium transition-colors ${activeTab === 'code'
                                ? 'bg-blue-600 text-white shadow-sm'
                                : 'text-slate-400 hover:text-slate-200 hover:bg-slate-700/50'
                                }`}
                        >
                            <Code className="w-4 h-4" />
                            Code
                        </button>
                    </div>

                    <button
                        onClick={handleCopy}
                        className="flex items-center gap-2 px-4 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 transition-colors border border-slate-700"
                    >
                        {copied ? <Check className="w-4 h-4 text-green-400" /> : <Copy className="w-4 h-4" />}
                        {copied ? 'Copied!' : `Copy ${activeTab === 'design' ? 'Image' : 'Code'}`}
                    </button>

                    <button
                        onClick={handleDownload}
                        className="flex items-center gap-2 px-4 py-2 rounded-lg bg-emerald-600/20 text-emerald-400 hover:bg-emerald-600/30 transition-colors border border-emerald-600/30"
                    >
                        <Download className="w-4 h-4" />
                        Download ZIP
                    </button>
                </div>
            </header>

            {/* Content */}
            <main className="flex-1 overflow-hidden relative">
                {activeTab === 'design' ? (
                    <div className="h-full w-full flex items-center justify-center p-8 bg-slate-950 overflow-auto">
                        {data.image ? (
                            <img
                                src={data.image}
                                alt="Design Preview"
                                className="max-w-full max-h-full object-contain rounded-lg shadow-2xl border border-slate-800"
                            />
                        ) : (
                            <div className="flex flex-col items-center gap-4 text-slate-500">
                                <ImageIcon className="w-16 h-16 opacity-20" />
                                <p>No image preview available</p>
                            </div>
                        )}
                    </div>
                ) : (
                    <div className="h-full w-full overflow-hidden bg-[#1e1e1e]">
                        <Editor
                            height="100%"
                            defaultLanguage="html"
                            theme="vs-dark"
                            value={data.html}
                            onChange={handleEditorChange}
                            options={{
                                readOnly: readOnly,
                                minimap: { enabled: false },
                                fontSize: 14,
                                scrollBeyondLastLine: false,
                                wordWrap: 'on',
                                padding: { top: 16, bottom: 16 }
                            }}
                        />
                    </div>
                )}
            </main>
        </div>
    );
}

export default PreviewApp;
