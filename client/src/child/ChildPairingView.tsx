import React, { useState, useEffect } from 'react';
import { Shield, Smartphone, RefreshCw, AlertCircle, QrCode, Hash } from 'lucide-react';
import { pairingApi } from '../services/api';
import { saveChildDeviceInfo, SavedChildDeviceInfo } from '../utils/storage';
import { ChildQrScanner } from './ChildQrScanner';

interface ChildPairingViewProps {
  onPairedSuccess: (deviceInfo: SavedChildDeviceInfo) => void;
}

export const ChildPairingView: React.FC<ChildPairingViewProps> = ({ onPairedSuccess }) => {
  const [pairingMethod, setPairingMethod] = useState<'qr' | 'code'>('qr');
  const [code, setCode] = useState('');
  const [deviceName, setDeviceName] = useState(
    `${navigator.userAgent.includes('Mobile') ? 'Mobile' : 'Browser'} Device`
  );
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Core pairing verifier shared by manual code submission, QR scan, and URL param
  const verifyAndPair = async (targetCode: string, nameToUse?: string) => {
    const cleanCode = targetCode.trim().replace(/\D/g, '');

    if (cleanCode.length !== 6) {
      setError('Please provide a complete 6-digit pairing code.');
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const devName = nameToUse || deviceName;
      const response = await pairingApi.verifyCode(cleanCode, devName);
      if (response.success && response.device) {
        const info: SavedChildDeviceInfo = {
          deviceId: response.device.deviceId,
          deviceName: response.device.deviceName,
          parentId: response.device.parentId,
          pairedAt: response.device.pairedAt,
        };
        saveChildDeviceInfo(info);
        // Enable one-time auto approval so child is automatically ready without repeated prompts
        try {
          localStorage.setItem(`guardian_auto_approve_${response.device.deviceId}`, 'true');
        } catch {
          // Ignore
        }
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

  // Check URL query parameters for auto-pairing (e.g. child opened link from camera QR scan)
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const codeParam = params.get('code') || params.get('pair');
    if (codeParam) {
      const clean = codeParam.replace(/\D/g, '').slice(0, 6);
      if (clean.length === 6) {
        setCode(clean);
        verifyAndPair(clean);
      }
    }
  }, []);

  const handleManualSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    verifyAndPair(code);
  };

  const handleQrSuccess = (scannedCode: string) => {
    setCode(scannedCode);
    verifyAndPair(scannedCode);
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
            Pair with Parent Device
          </p>
        </div>

        {/* Pairing Method Switcher */}
        <div className="flex rounded-2xl bg-slate-950 p-1.5 border border-slate-800 shadow-inner">
          <button
            type="button"
            onClick={() => {
              setPairingMethod('qr');
              setError(null);
            }}
            className={`flex-1 flex items-center justify-center space-x-2 py-2.5 rounded-xl text-xs font-bold transition-all cursor-pointer ${
              pairingMethod === 'qr'
                ? 'bg-emerald-600 text-white shadow-lg shadow-emerald-950/50'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            <QrCode className="w-4 h-4" />
            <span>Scan QR Code</span>
          </button>
          <button
            type="button"
            onClick={() => {
              setPairingMethod('code');
              setError(null);
            }}
            className={`flex-1 flex items-center justify-center space-x-2 py-2.5 rounded-xl text-xs font-bold transition-all cursor-pointer ${
              pairingMethod === 'code'
                ? 'bg-emerald-600 text-white shadow-lg shadow-emerald-950/50'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            <Hash className="w-4 h-4" />
            <span>Enter 6-Digit Code</span>
          </button>
        </div>

        {error && (
          <div className="p-3.5 rounded-xl bg-red-500/10 border border-red-500/20 text-xs text-red-400 flex items-center space-x-2 animate-fadeIn">
            <AlertCircle className="w-4 h-4 flex-shrink-0" />
            <span>{error}</span>
          </div>
        )}

        {/* Optional Device Name (Always editable) */}
        <div>
          <label className="block text-[11px] font-medium text-slate-400 mb-1.5">
            Device Name:
          </label>
          <div className="flex items-center space-x-2 bg-slate-950 border border-slate-800 rounded-xl px-3 py-2">
            <Smartphone className="w-4 h-4 text-slate-500" />
            <input
              type="text"
              value={deviceName}
              onChange={(e) => setDeviceName(e.target.value)}
              maxLength={40}
              className="w-full bg-transparent text-xs text-slate-200 focus:outline-none"
              placeholder="e.g. Student Phone, Laptop"
            />
          </div>
        </div>

        {/* Pairing Method View */}
        {pairingMethod === 'qr' ? (
          <div className="pt-1">
            {loading ? (
              <div className="flex flex-col items-center justify-center py-12 space-y-3">
                <RefreshCw className="w-8 h-8 text-emerald-400 animate-spin" />
                <p className="text-sm font-semibold text-white">Verifying QR Code & Pairing...</p>
                <p className="text-xs text-slate-400 font-mono">{code}</p>
              </div>
            ) : (
              <ChildQrScanner
                onScanSuccess={handleQrSuccess}
                onCancel={() => setPairingMethod('code')}
              />
            )}
          </div>
        ) : (
          <form onSubmit={handleManualSubmit} className="space-y-5">
            {/* Pairing Code Input */}
            <div>
              <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-2 text-center">
                Enter 6-Digit Code from Parent:
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

            {/* Submit Button */}
            <button
              type="submit"
              disabled={loading || code.length !== 6}
              className="w-full py-3.5 px-4 rounded-xl bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 disabled:hover:bg-emerald-600 text-white font-bold text-sm shadow-lg shadow-emerald-950/50 flex items-center justify-center space-x-2 transition-all cursor-pointer"
            >
              {loading ? (
                <>
                  <RefreshCw className="w-4 h-4 animate-spin" />
                  <span>Connecting...</span>
                </>
              ) : (
                <span>Connect & Pair</span>
              )}
            </button>
          </form>
        )}

        {/* Transparent Safety Notice */}
        <div className="p-4 rounded-2xl bg-slate-950/60 border border-slate-800 text-[11px] text-slate-400 space-y-1.5 leading-relaxed">
          <p className="font-semibold text-slate-300">🛡️ Transparent Monitoring Notice:</p>
          <p>
            GuardianLink is designed for cooperative child safety. Your camera and microphone will <span className="text-white font-medium">NEVER</span> turn on secretly. You can stop monitoring at any time.
          </p>
        </div>
      </div>
    </div>
  );
};
