'use client';

import { useState, useEffect } from 'react';
import { api } from '@/lib/api-client';
import { DownloadCloud, Sparkles, CheckCircle2, RefreshCw, X } from 'lucide-react';

export default function UpdateNotifier() {
  const [updateInfo, setUpdateInfo] = useState<any>(null);
  const [isUpdating, setIsUpdating] = useState(false);
  const [updateSuccess, setUpdateSuccess] = useState(false);
  const [dismissed, setDismissed] = useState(false);

  const checkSystemUpdate = async () => {
    try {
      const res = await api.get('/system/check-update');
      if (res.data && res.data.hasUpdate) {
        setUpdateInfo(res.data);
      }
    } catch (e) {
      // Ignore background check errors
    }
  };

  useEffect(() => {
    checkSystemUpdate();
    const interval = setInterval(checkSystemUpdate, 5 * 60 * 1000); // Check every 5 minutes
    return () => clearInterval(interval);
  }, []);

  const handleApplyUpdate = async () => {
    try {
      setIsUpdating(true);
      await api.post('/system/apply-update');
      setUpdateSuccess(true);
      setTimeout(() => {
        window.location.reload();
      }, 2000);
    } catch (err: any) {
      alert(err.response?.data?.error || 'Failed to download updates from GitHub');
    } finally {
      setIsUpdating(false);
    }
  };

  if (!updateInfo || !updateInfo.hasUpdate || dismissed) {
    return null;
  }

  return (
    <div className="fixed bottom-5 right-5 z-50 max-w-md w-full animate-in slide-in-from-bottom-5 duration-300">
      <div className="bg-slate-900/95 backdrop-blur-md border border-emerald-500/40 text-white rounded-2xl p-4 shadow-2xl space-y-3 relative overflow-hidden">
        {/* Glowing emerald highlight */}
        <div className="absolute top-0 right-0 w-32 h-32 bg-emerald-500/10 rounded-full blur-2xl pointer-events-none" />

        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="p-2.5 bg-emerald-600/20 text-emerald-400 rounded-xl border border-emerald-500/30 flex-shrink-0">
              <DownloadCloud className="w-5 h-5 animate-bounce" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h4 className="font-extrabold text-sm text-white">New Update Available!</h4>
                <span className="bg-emerald-500/20 text-emerald-300 text-[10px] font-bold px-2 py-0.5 rounded-full border border-emerald-500/30">
                  v{updateInfo.latestHash || 'PROD'}
                </span>
              </div>
              <p className="text-xs text-slate-300 mt-0.5 line-clamp-1">
                {updateInfo.latestCommitMsg || 'New ERP updates and bug fixes ready for download'}
              </p>
            </div>
          </div>

          <button
            onClick={() => setDismissed(true)}
            className="text-slate-400 hover:text-white p-1 rounded-lg transition"
            title="Dismiss notification"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="flex items-center justify-end gap-2 pt-1 border-t border-slate-800">
          <button
            type="button"
            onClick={() => setDismissed(true)}
            className="px-3 py-1.5 text-xs font-bold text-slate-400 hover:text-white transition"
          >
            Later
          </button>

          <button
            type="button"
            onClick={handleApplyUpdate}
            disabled={isUpdating || updateSuccess}
            className="flex items-center gap-2 px-4 py-2 bg-emerald-600 hover:bg-emerald-500 active:scale-95 text-white font-bold rounded-xl text-xs transition shadow-lg shadow-emerald-600/30 disabled:opacity-50"
          >
            {isUpdating ? (
              <>
                <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                <span>Downloading...</span>
              </>
            ) : updateSuccess ? (
              <>
                <CheckCircle2 className="w-3.5 h-3.5 text-white" />
                <span>Updated! Reloading...</span>
              </>
            ) : (
              <>
                <Sparkles className="w-3.5 h-3.5" />
                <span>Update App Now</span>
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
