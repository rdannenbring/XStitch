import React, { useEffect, useState } from 'react';
import ReactDOM from 'react-dom/client';
import './index.css';

declare var chrome: any;

const Options = () => {
    const [experimental, setExperimental] = useState(false);

    useEffect(() => {
        chrome.storage.local.get(['settings'], (result) => {
            setExperimental(result.settings?.experimentalMode || false);
        });
    }, []);

    const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const newValue = e.target.checked;
        setExperimental(newValue);
        chrome.storage.local.get(['settings'], (result) => {
            const currentSettings = result.settings || {};
            chrome.storage.local.set({
                settings: { ...currentSettings, experimentalMode: newValue }
            });
        });
    };

    return (
        <div className="min-h-screen bg-slate-950 text-slate-200 p-8 flex justify-center">
            <div className="max-w-md w-full bg-slate-900 rounded-lg border border-slate-800 p-6 shadow-xl">
                <div className="flex items-center gap-4 mb-6">
                    <div className="w-10 h-10 bg-slate-800 rounded-lg flex items-center justify-center">
                        <img src="icons/icon48.png" className="w-6 h-6" />
                    </div>
                    <h1 className="text-xl font-bold text-white">XStitch Settings</h1>
                </div>

                <div className="space-y-6">
                    <div className="flex items-start gap-3 p-4 rounded-lg bg-slate-950/50 border border-slate-800/50">
                        <input
                            type="checkbox"
                            id="experimental"
                            checked={experimental}
                            onChange={handleChange}
                            className="mt-1 w-4 h-4 rounded border-slate-600 bg-slate-800 text-green-500 focus:ring-green-500 focus:ring-offset-slate-900 cursor-pointer"
                        />
                        <label htmlFor="experimental" className="flex-1 cursor-pointer">
                            <div className="font-medium text-slate-200">Enable Experimental Mode</div>
                            <div className="text-sm text-slate-400 mt-1">
                                Allow XStitch to run on all websites.
                                <br />
                                <span className="text-amber-500 text-xs font-semibold uppercase tracking-wide">Experimental</span>
                                <span className="text-xs text-slate-500 ml-1">- We cannot guarantee functionality or safety on non-Stitch sites. Use at your own risk.</span>
                            </div>
                        </label>
                    </div>
                </div>
            </div>
        </div>
    );
};

ReactDOM.createRoot(document.getElementById('root')!).render(
    <React.StrictMode>
        <Options />
    </React.StrictMode>
);
