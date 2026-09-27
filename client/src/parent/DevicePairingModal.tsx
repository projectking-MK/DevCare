import React, { useState, useEffect, useCallback } from 'react';
import { X, Smartphone, Clock, RefreshCw, CheckCircle2, ShieldAlert, QrCode, Hash, Download } from 'lucide-react';
import QRCode from 'qrcode';
import { pairingApi } from '../services/api';

interface DevicePairingModalProps {
  isOpen: boolean;
  onClose: () => void;
  onDevicePaired?: () => void;
}

export const DevicePairingModal: React.FC<DevicePairingModalProps> = ({ isOpen, onClose }) => {
  const [code, setCode] = useState<string | null>(null);
  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'qr' | 'code'>('qr');
  const [expiresAt, setExpiresAt] = useState<Date | null>(null);
  const [secondsRemaining, setSecondsRemaining] = useState<number>(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const generateQrFromCode = async (codeToUse: string) => {
    const pairingUrl = `${window.location.origin}/child?code=${codeToUse}`;
    try {
      const url = await QRCode.toDataURL(pairingUrl, {
        width: 256,
        margin: 1,
        color: { dark: '#022c22', light: '#ffffff' }
      });
      setQrDataUrl(url);
    } catch {
      // Fallback with just the raw code
      const fallbackUrl = await QRCode.toDataURL(codeToUse, { width: 256, margin: 1 });
      setQrDataUrl(fallbackUrl);
    }
  };

  /**
   * Loads the existing active code (permanent for 5 hours),
   * or creates a new one if none exists or if forceRegenerate is true.
   */
  const loadOrCreateCode = useCallback(async (forceRegenerate = false) => {
    setLoading(true);
    setError(null);
    try {
      let codeToUse: string | null = null;
      let expDate: Date | null = null;

      // 1. If not forcing regenerate, check if parent already has an active 5-hour code
      if (!forceRegenerate) {
        try {
          const activeRes = await pairingApi.getActiveCode();
          if (activeRes.hasActiveCode && activeRes.code && activeRes.expiresAt) {
            const activeExp = new Date(activeRes.expiresAt);
            if (activeExp.getTime() > Date.now()) {
              codeToUse = activeRes.code;
              expDate = activeExp;
            }
          }
        } catch {
          // If check active fails, proceed to generate
        }
      }

      // 2. Generate a new 5-hour code if no active code exists or force requested
      if (!codeToUse || !expDate) {
        const res = await pairingApi.generateCode();
        codeToUse = res.code;
        expDate = new Date(res.expiresAt);
      }

      setCode(codeToUse);
      setExpiresAt(expDate);
      setSecondsRemaining(Math.max(0, Math.floor((expDate.getTime() - Date.now()) / 1000)));

      // Render the QR code image
      await generateQrFromCode(codeToUse);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to retrieve or generate pairing code.');
    } finally {
      setLoading(false);
    }
  }, []);

  const handleDownloadQr = () => {
    if (!qrDataUrl) return;
    const a = document.createElement('a');
    a.href = qrDataUrl;
    a.download = `DevCare-Pairing-QR-${code || 'device'}.png`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  };

  useEffect(() => {
    if (isOpen) {
      loadOrCreateCode(false);
    } else {
      setCode(null);
      setExpiresAt(null);
      setQrDataUrl(null);
    }
  }, [isOpen, loadOrCreateCode]);

  // Countdown timer for 5 hours
  useEffect(() => {
    if (!expiresAt) return;

    const timer = setInterval(() => {
      const remaining = Math.max(0, Math.floor((expiresAt.getTime() - Date.now()) / 1000));
      setSecondsRemaining(remaining);
      if (remaining <= 0) {
        clearInterval(timer);
      }
    }, 1000);

    return () => clearInterval(timer);
  }, [expiresAt]);

  if (!isOpen) return null;

  const hours = Math.floor(secondsRemaining / 3600);
  const minutes = Math.floor((secondsRemaining % 3600) / 60);
  const seconds = secondsRemaining % 60;
  const isExpired = secondsRemaining <= 0;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm animate-fadeIn">
      <div className="relative w-full max-w-md bg-slate-900 border border-slate-800 rounded-2xl shadow-2xl p-6 sm:p-8">
        {/* Close Button */}
        <button
          onClick={onClose}
          className="absolute top-5 right-5 p-2 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors cursor-pointer"
        >
          <X className="w-5 h-5" />
        </button>

        {/* Modal Header */}
        <div className="flex items-center space-x-3 mb-6">
          <div className="w-12 h-12 rounded-xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center text-emerald-400">
            <Smartphone className="w-6 h-6" />
          </div>
          <div>
            <h3 className="text-lg font-bold text-white tracking-tight">Pair Child Device</h3>
            <p className="text-xs text-slate-400">Valid continuously for 5 hours</p>
          </div>
        </div>

        {error && (
          <div className="mb-5 p-3 rounded-lg bg-red-500/10 border border-red-500/20 text-red-400 text-xs flex flex-col space-y-2">
            <div className="flex items-center space-x-2">
              <ShieldAlert className="w-4 h-4 flex-shrink-0" />
              <span>{error}</span>
            </div>
            {(error.toLowerCase().includes('authentication') || error.toLowerCase().includes('session')) && (
              <a
                href="/login"
                className="inline-flex items-center justify-center py-1.5 px-3 rounded-lg bg-red-500/20 hover:bg-red-500/30 text-white font-semibold text-[11px] transition-colors self-start"
              >
                Log In Again →
              </a>
            )}
          </div>
        )}

        {/* Method Switcher Tabs */}
        <div className="flex rounded-xl bg-slate-950 p-1 border border-slate-800 mb-5">
          <button
            type="button"
            onClick={() => setActiveTab('qr')}
            className={`flex-1 flex items-center justify-center space-x-2 py-2 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
              activeTab === 'qr'
                ? 'bg-emerald-600 text-white shadow-md'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            <QrCode className="w-4 h-4" />
            <span>Scan QR Code</span>
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('code')}
            className={`flex-1 flex items-center justify-center space-x-2 py-2 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
              activeTab === 'code'
                ? 'bg-emerald-600 text-white shadow-md'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            <Hash className="w-4 h-4" />
            <span>6-Digit Code</span>
          </button>
        </div>

        {/* Instructions */}
        <div className="space-y-4 mb-6">
          <p className="text-xs text-slate-300 leading-relaxed text-center">
            {activeTab === 'qr'
              ? 'On your child device, open /child and scan this QR code or upload saved QR image:'
              : 'On your child device, open /child and enter this 6-digit code:'}
          </p>

          {/* Display Card */}
          <div className="bg-slate-950 border border-slate-800 rounded-2xl p-5 text-center shadow-inner flex flex-col items-center justify-center">
            {loading ? (
              <div className="flex flex-col items-center justify-center py-8 text-slate-400 space-y-2">
                <RefreshCw className="w-6 h-6 animate-spin text-emerald-400" />
                <span className="text-sm">Loading 5-hour pairing QR & code...</span>
              </div>
            ) : isExpired ? (
              <div className="py-4 space-y-3">
                <p className="text-sm font-semibold text-amber-400">Pairing Code Expired (5 hours elapsed)</p>
                <button
                  type="button"
                  onClick={() => loadOrCreateCode(true)}
                  className="inline-flex items-center space-x-2 px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold shadow-md transition-colors cursor-pointer"
                >
                  <RefreshCw className="w-3.5 h-3.5" />
                  <span>Generate New 5-Hour Code</span>
                </button>
              </div>
            ) : (
              <div className="w-full flex flex-col items-center space-y-3">
                {activeTab === 'qr' && qrDataUrl ? (
                  <div className="flex flex-col items-center space-y-3">
                    <div className="p-3 bg-white rounded-2xl shadow-xl border-4 border-emerald-500/30">
                      <img
                        src={qrDataUrl}
                        alt="Pairing QR Code"
                        className="w-48 h-48 sm:w-56 sm:h-56 object-contain rounded-lg"
                      />
                    </div>
                    {/* QR Code Download Option */}
                    <button
                      type="button"
                      onClick={handleDownloadQr}
                      className="inline-flex items-center space-x-2 px-4 py-2 rounded-xl bg-emerald-600/20 hover:bg-emerald-600/30 text-emerald-300 border border-emerald-500/30 text-xs font-semibold shadow-md transition-all active:scale-95 cursor-pointer"
                      title="Download QR code image to share with child or print"
                    >
                      <Download className="w-3.5 h-3.5 text-emerald-400" />
                      <span>Download QR Code (PNG)</span>
                    </button>
                  </div>
                ) : (
                  <div className="flex justify-center space-x-2 sm:space-x-3 my-2">
                    {code?.split('').map((char, index) => (
                      <span
                        key={index}
                        className="w-10 h-14 sm:w-12 sm:h-16 flex items-center justify-center font-mono font-bold text-2xl sm:text-3xl text-emerald-400 bg-slate-900 border border-emerald-500/30 rounded-xl shadow-sm"
                      >
                        {char}
                      </span>
                    ))}
                  </div>
                )}

                {/* Direct 6-digit code pill shown under QR as well */}
                {activeTab === 'qr' && code && (
                  <div className="inline-flex items-center space-x-2 px-3 py-1 rounded-full bg-slate-900 border border-slate-800 text-xs">
                    <span className="text-slate-400">Or enter code:</span>
                    <span className="font-mono font-bold text-emerald-400 tracking-wider">{code}</span>
                  </div>
                )}

                <div className="flex items-center justify-center space-x-1.5 text-xs text-slate-400">
                  <Clock className="w-3.5 h-3.5 text-emerald-400" />
                  <span>Valid for:</span>
                  <span className="font-mono font-semibold text-emerald-400">
                    {hours > 0 ? `${hours}h ` : ''}
                    {minutes.toString().padStart(2, '0')}:{seconds.toString().padStart(2, '0')}
                  </span>
                  <span className="text-[10px] text-slate-500 font-medium">(Permanent 5h)</span>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Security Disclosures */}
        <div className="p-3.5 rounded-xl bg-slate-800/50 border border-slate-700/50 text-[11px] text-slate-400 space-y-1.5 mb-6">
          <div className="flex items-center space-x-1.5 text-slate-300 font-medium">
            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
            <span>5-Hour Permanent Pairing Validity</span>
          </div>
          <p className="text-emerald-300 font-semibold">• Permanent for 5 Hours: This QR and code stay active for a continuous 5 hours once created.</p>
          <p>• Valid Even if Parent Comes Out: Child can scan and pair anytime within the 5 hours, even if the parent logs out, closes the tab, or is away.</p>
          <p>• Multi-Device Support: You can download the QR image and pair child devices seamlessly without regenerating.</p>
        </div>

        {/* Actions */}
        <div className="flex items-center space-x-3">
          <button
            onClick={() => loadOrCreateCode(true)}
            disabled={loading}
            className="flex-1 flex items-center justify-center space-x-2 px-4 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-sm font-medium transition-colors border border-slate-700 cursor-pointer"
            title="Generate a brand new 5-hour code"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
            <span>Regenerate (5h)</span>
          </button>
          <button
            onClick={onClose}
            className="flex-1 px-4 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-sm font-semibold shadow-lg shadow-emerald-950/40 transition-colors cursor-pointer"
          >
            Done
          </button>
        </div>
      </div>
    </div>
  );
};
