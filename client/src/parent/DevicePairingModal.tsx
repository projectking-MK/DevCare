import React, { useState, useEffect } from 'react';
import { X, Smartphone, Clock, RefreshCw, CheckCircle2, ShieldAlert } from 'lucide-react';
import { pairingApi } from '../services/api';

interface DevicePairingModalProps {
  isOpen: boolean;
  onClose: () => void;
  onDevicePaired?: () => void;
}

export const DevicePairingModal: React.FC<DevicePairingModalProps> = ({ isOpen, onClose }) => {
  const [code, setCode] = useState<string | null>(null);
  const [expiresAt, setExpiresAt] = useState<Date | null>(null);
  const [secondsRemaining, setSecondsRemaining] = useState<number>(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchCode = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await pairingApi.generateCode();
      setCode(res.code);
      const expDate = new Date(res.expiresAt);
      setExpiresAt(expDate);
      setSecondsRemaining(Math.max(0, Math.floor((expDate.getTime() - Date.now()) / 1000)));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to generate code.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (isOpen) {
      fetchCode();
    } else {
      setCode(null);
      setExpiresAt(null);
    }
  }, [isOpen]);

  // Countdown timer
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

  const minutes = Math.floor(secondsRemaining / 60);
  const seconds = secondsRemaining % 60;
  const isExpired = secondsRemaining <= 0;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm animate-fadeIn">
      <div className="relative w-full max-w-md bg-slate-900 border border-slate-800 rounded-2xl shadow-2xl p-6 sm:p-8">
        {/* Close Button */}
        <button
          onClick={onClose}
          className="absolute top-5 right-5 p-2 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
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
            <p className="text-xs text-slate-400">Generate a temporary connection code</p>
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

        {/* Instructions */}
        <div className="space-y-4 mb-6">
          <p className="text-xs text-slate-300 leading-relaxed">
            Open <span className="font-mono text-emerald-400 bg-slate-800 px-1.5 py-0.5 rounded">/child</span> on your child's smartphone, tablet, or browser, and enter this 6-digit code:
          </p>

          {/* 6-Digit Display */}
          <div className="bg-slate-950 border border-slate-800 rounded-xl p-6 text-center shadow-inner">
            {loading ? (
              <div className="flex justify-center items-center py-4 text-slate-400 space-x-2">
                <RefreshCw className="w-5 h-5 animate-spin" />
                <span className="text-sm">Generating secure code...</span>
              </div>
            ) : isExpired ? (
              <div className="py-2">
                <p className="text-sm font-semibold text-amber-400 mb-2">Code Expired</p>
                <button
                  onClick={fetchCode}
                  className="inline-flex items-center space-x-2 px-4 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold shadow-md transition-colors"
                >
                  <RefreshCw className="w-3.5 h-3.5" />
                  <span>Generate New Code</span>
                </button>
              </div>
            ) : (
              <div>
                <div className="flex justify-center space-x-2 sm:space-x-3 mb-3">
                  {code?.split('').map((char, index) => (
                    <span
                      key={index}
                      className="w-10 h-14 sm:w-12 sm:h-16 flex items-center justify-center font-mono font-bold text-2xl sm:text-3xl text-emerald-400 bg-slate-900 border border-emerald-500/30 rounded-lg shadow-sm"
                    >
                      {char}
                    </span>
                  ))}
                </div>

                <div className="flex items-center justify-center space-x-1.5 text-xs text-slate-400">
                  <Clock className="w-3.5 h-3.5 text-slate-400" />
                  <span>Expires in:</span>
                  <span className="font-mono font-semibold text-emerald-400">
                    {minutes.toString().padStart(2, '0')}:{seconds.toString().padStart(2, '0')}
                  </span>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Security Disclosures */}
        <div className="p-3.5 rounded-xl bg-slate-800/50 border border-slate-700/50 text-[11px] text-slate-400 space-y-1.5 mb-6">
          <div className="flex items-center space-x-1.5 text-slate-300 font-medium">
            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
            <span>Security & Privacy Safeguards</span>
          </div>
          <p>• Single-use only. Becomes invalid immediately upon pairing.</p>
          <p>• Zero server persistence. Automatically cleared when you log out.</p>
          <p>• Camera/Mic will only activate with explicit child permission on every session.</p>
        </div>

        {/* Actions */}
        <div className="flex items-center space-x-3">
          <button
            onClick={fetchCode}
            disabled={loading}
            className="flex-1 flex items-center justify-center space-x-2 px-4 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-sm font-medium transition-colors border border-slate-700"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
            <span>Regenerate</span>
          </button>
          <button
            onClick={onClose}
            className="flex-1 px-4 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-sm font-semibold shadow-lg shadow-emerald-950/40 transition-colors"
          >
            Done
          </button>
        </div>
      </div>
    </div>
  );
};
