import React, { useState } from 'react';
import { Shield, Smartphone, RefreshCw, AlertCircle } from 'lucide-react';
import { pairingApi } from '../services/api';
import { saveChildDeviceInfo, SavedChildDeviceInfo } from '../utils/storage';

interface ChildPairingViewProps {
  onPairedSuccess: (deviceInfo: SavedChildDeviceInfo) => void;
}

export const ChildPairingView: React.FC<ChildPairingViewProps> = ({ onPairedSuccess }) => {
  const [code, setCode] = useState('');
  const [deviceName, setDeviceName] = useState(
    `${navigator.userAgent.includes('Mobile') ? 'Mobile' : 'Browser'} Device`
  );
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleConnect = async (e: React.FormEvent) => {
    e.preventDefault();
    const cleanCode = code.trim().replace(/\D/g, '');

    if (cleanCode.length !== 6) {
      setError('Please enter a complete 6-digit pairing code.');
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const response = await pairingApi.verifyCode(cleanCode, deviceName);
      if (response.success && response.device) {
        const info: SavedChildDeviceInfo = {
          deviceId: response.device.deviceId,
          deviceName: response.device.deviceName,
          parentId: response.device.parentId,
          pairedAt: response.device.pairedAt,
        };
        saveChildDeviceInfo(info);
        onPairedSuccess(info);
      } else {
        setError('Failed to pair. Please check the code.');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Invalid or expired pairing code.');
    } finally {
      setLoading(false);
    }
  };

  const handleCodeChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value.replace(/\D/g, '').slice(0, 6);
    setCode(val);
  };

  return (
    <div className="min-h-screen bg-slate-950 flex flex-col items-center justify-center p-4 sm:p-6 text-slate-100">
      <div className="w-full max-w-md bg-slate-900 border border-slate-800 rounded-3xl p-6 sm:p-8 shadow-2xl space-y-6">
        {/* App Logo & Header */}
        <div className="text-center space-y-2">
          <div className="inline-flex w-16 h-16 rounded-2xl bg-emerald-500/10 border border-emerald-500/20 items-center justify-center text-emerald-400 mb-2">
            <Shield className="w-8 h-8" />
          </div>
          <h1 className="text-2xl font-black text-white tracking-tight">GuardianLink</h1>
          <p className="text-xs uppercase tracking-widest text-emerald-400 font-semibold">
            Child Safety Companion
          </p>
          <p className="text-sm text-slate-400 pt-1">
            Connect this device
          </p>
        </div>

        {error && (
          <div className="p-3.5 rounded-xl bg-red-500/10 border border-red-500/20 text-xs text-red-400 flex items-center space-x-2">
            <AlertCircle className="w-4 h-4 flex-shrink-0" />
            <span>{error}</span>
          </div>
        )}

        <form onSubmit={handleConnect} className="space-y-5">
          {/* Pairing Code Input */}
          <div>
            <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-2 text-center">
              Pairing Code:
            </label>
            <input
              type="text"
              inputMode="numeric"
              pattern="[0-9]*"
              maxLength={6}
              value={code}
              onChange={handleCodeChange}
              placeholder="______"
              autoFocus
              className="w-full text-center tracking-[0.5em] text-3xl font-mono font-bold bg-slate-950 border border-slate-700 rounded-2xl py-4 text-emerald-400 placeholder:text-slate-700 focus:outline-none focus:ring-2 focus:ring-emerald-500/50 focus:border-emerald-500 transition-all shadow-inner"
            />
          </div>

          {/* Optional Device Name */}
          <div>
            <label className="block text-[11px] font-medium text-slate-400 mb-1.5">
              Device Name (Optional):
            </label>
            <div className="flex items-center space-x-2 bg-slate-950 border border-slate-800 rounded-xl px-3 py-2">
              <Smartphone className="w-4 h-4 text-slate-500" />
              <input
                type="text"
                value={deviceName}
                onChange={(e) => setDeviceName(e.target.value)}
                maxLength={40}
                className="w-full bg-transparent text-xs text-slate-200 focus:outline-none"
                placeholder="e.g. My Phone, Tablet"
              />
            </div>
          </div>

          {/* Submit Button */}
          <button
            type="submit"
            disabled={loading || code.length !== 6}
            className="w-full py-3.5 px-4 rounded-xl bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 disabled:hover:bg-emerald-600 text-white font-bold text-sm shadow-lg shadow-emerald-950/50 flex items-center justify-center space-x-2 transition-all"
          >
            {loading ? (
              <>
                <RefreshCw className="w-4 h-4 animate-spin" />
                <span>Connecting...</span>
              </>
            ) : (
              <span>Connect</span>
            )}
          </button>
        </form>

        {/* Transparent Safety Notice */}
        <div className="p-4 rounded-2xl bg-slate-950/60 border border-slate-800 text-[11px] text-slate-400 space-y-1.5 leading-relaxed">
          <p className="font-semibold text-slate-300">🛡️ Transparent Monitoring Notice:</p>
          <p>
            GuardianLink is designed for cooperative child safety. Your camera and microphone will <span className="text-white font-medium">NEVER</span> turn on secretly or without your explicit permission. You can stop monitoring at any time.
          </p>
        </div>
      </div>
    </div>
  );
};
