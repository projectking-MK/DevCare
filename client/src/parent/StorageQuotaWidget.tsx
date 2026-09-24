import React, { useEffect, useState } from 'react';
import { HardDrive, AlertTriangle, ShieldCheck } from 'lucide-react';
import { guardianDB } from '../services/database';
import { formatBytes } from '../utils/formatters';

export const StorageQuotaWidget: React.FC<{ onRefresh?: () => void }> = () => {
  const [estimate, setEstimate] = useState<{
    usedBytes: number;
    quotaBytes: number;
    percentage: number;
    isSupported: boolean;
  }>({
    usedBytes: 0,
    quotaBytes: 0,
    percentage: 0,
    isSupported: false,
  });

  const checkQuota = async () => {
    const est = await guardianDB.getStorageEstimate();
    setEstimate(est);
  };

  useEffect(() => {
    checkQuota();
    // Refresh periodically every 30 seconds
    const interval = setInterval(checkQuota, 30000);
    return () => clearInterval(interval);
  }, []);

  const availableBytes = Math.max(0, estimate.quotaBytes - estimate.usedBytes);
  const isNearLimit = estimate.percentage >= 80;
  const isFull = estimate.percentage >= 95;

  return (
    <div className="bg-slate-900 border border-slate-800 rounded-xl p-5">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center space-x-2">
          <HardDrive className="w-4 h-4 text-emerald-400" />
          <h4 className="text-xs font-semibold text-slate-300 uppercase tracking-wider">Local Storage</h4>
        </div>
        <span className="text-[11px] text-slate-400 font-mono">
          {estimate.percentage.toFixed(1)}% Used
        </span>
      </div>

      {/* Progress Bar */}
      <div className="w-full bg-slate-800 rounded-full h-2 mb-3 overflow-hidden">
        <div
          className={`h-full rounded-full transition-all duration-500 ${
            isFull
              ? 'bg-red-500'
              : isNearLimit
              ? 'bg-amber-400'
              : 'bg-gradient-to-r from-emerald-500 to-emerald-400'
          }`}
          style={{ width: `${Math.min(100, Math.max(1, estimate.percentage))}%` }}
        />
      </div>

      <div className="flex items-center justify-between text-xs text-slate-400">
        <div>
          <span className="text-slate-500">Used: </span>
          <span className="font-medium text-slate-200">{formatBytes(estimate.usedBytes)}</span>
        </div>
        <div>
          <span className="text-slate-500">Available: </span>
          <span className="font-medium text-slate-200">{formatBytes(availableBytes)}</span>
        </div>
      </div>

      {isFull && (
        <div className="mt-3 p-2.5 rounded-lg bg-red-500/10 border border-red-500/20 text-red-400 text-xs flex items-center space-x-2">
          <AlertTriangle className="w-4 h-4 flex-shrink-0" />
          <span>Storage limit reached. Delete an existing recording before recording again.</span>
        </div>
      )}

      {!isFull && (
        <div className="mt-3 flex items-center space-x-1.5 text-[11px] text-slate-500">
          <ShieldCheck className="w-3.5 h-3.5 text-emerald-500/80 flex-shrink-0" />
          <span>Recordings remain solely on this device. Never uploaded to the cloud.</span>
        </div>
      )}
    </div>
  );
};
