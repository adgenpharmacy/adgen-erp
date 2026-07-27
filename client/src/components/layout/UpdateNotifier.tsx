'use client';

import { useState, useEffect } from 'react';
import { api } from '@/lib/api-client';
import { DownloadCloud, Sparkles, CheckCircle2, RefreshCw, X } from 'lucide-react';
import Button from '@/components/ui/Button';
import { useToast } from '@/components/ui';
import { getApiErrorMessage } from '@/types';

interface UpdateInfo {
  hasUpdate: boolean;
  latestHash?: string;
  latestCommitMsg?: string;
}

export default function UpdateNotifier() {
  const toast = useToast();
  const [updateInfo, setUpdateInfo] = useState<UpdateInfo | null>(null);
  const [isUpdating, setIsUpdating] = useState(false);
  const [updateSuccess, setUpdateSuccess] = useState(false);
  const [dismissed, setDismissed] = useState(false);

  const checkSystemUpdate = async () => {
    try {
      const res = await api.get('/system/check-update');
      if (res.data && res.data.hasUpdate) {
        setUpdateInfo(res.data);
      }
    } catch {
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
    } catch (err) {
      toast.error('Update failed', getApiErrorMessage(err, 'Could not download updates from GitHub.'));
    } finally {
      setIsUpdating(false);
    }
  };

  if (!updateInfo || !updateInfo.hasUpdate || dismissed) {
    return null;
  }

  return (
    <div
      role="status"
      className="fixed bottom-5 right-5 z-50 w-full max-w-sm no-print"
    >
      <div className="rounded-lg border border-line bg-surface p-4 shadow-pop">
        <div className="flex items-start justify-between gap-3">
          <div className="flex min-w-0 items-start gap-3">
            <span className="shrink-0 rounded-md border border-brand-line bg-brand-subtle p-2 text-brand">
              <DownloadCloud className="h-5 w-5" aria-hidden />
            </span>
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <h4 className="text-sm font-bold text-fg">New update available</h4>
                <span className="rounded-full bg-brand-subtle px-2 py-0.5 text-[10px] font-bold text-brand-hover">
                  v{updateInfo.latestHash || 'PROD'}
                </span>
              </div>
              <p className="mt-0.5 truncate text-xs text-fg-muted">
                {updateInfo.latestCommitMsg || 'New ERP updates and bug fixes ready for download'}
              </p>
            </div>
          </div>

          <button
            onClick={() => setDismissed(true)}
            title="Dismiss notification"
            aria-label="Dismiss notification"
            className="shrink-0 rounded-md p-1 text-fg-subtle transition-colors hover:bg-hover hover:text-fg"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="mt-3 flex items-center justify-end gap-2 border-t border-line pt-3">
          <Button size="sm" variant="ghost" onClick={() => setDismissed(true)}>
            Later
          </Button>
          <Button size="sm" onClick={handleApplyUpdate} disabled={isUpdating || updateSuccess}>
            {isUpdating ? (
              <>
                <RefreshCw className="h-3.5 w-3.5 animate-spin" aria-hidden />
                Downloading…
              </>
            ) : updateSuccess ? (
              <>
                <CheckCircle2 className="h-3.5 w-3.5" aria-hidden />
                Updated! Reloading…
              </>
            ) : (
              <>
                <Sparkles className="h-3.5 w-3.5" aria-hidden />
                Update App Now
              </>
            )}
          </Button>
        </div>
      </div>
    </div>
  );
}
