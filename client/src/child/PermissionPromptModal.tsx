import React, { useState } from 'react';
import { ShieldAlert, Video, Mic, Check, X, CheckSquare, Square } from 'lucide-react';

interface PermissionPromptModalProps {
  cameraRequested: boolean;
  micRequested: boolean;
  onAllow: (rememberOneTime: boolean) => void;
  onDeny: () => void;
}

export const PermissionPromptModal: React.FC<PermissionPromptModalProps> = ({
  cameraRequested,
  micRequested,
  onAllow,
  onDeny
}) => {
  const [rememberOneTime, setRememberOneTime] = useState(true);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md animate-fadeIn">
      <div className="relative w-full max-w-sm bg-slate-900 border-2 border-emerald-500/40 rounded-3xl p-6 sm:p-8 text-center shadow-2xl space-y-6">
        {/* Shield Icon */}
        <div className="mx-auto w-16 h-16 rounded-2xl bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-center text-emerald-400">
          <ShieldAlert className="w-8 h-8" />
        </div>

        {/* Title & Description */}
        <div>
          <h3 className="text-xl font-bold text-white tracking-tight">GuardianLink Safety Request</h3>
          <p className="text-sm text-slate-300 mt-2">
            Your parent has requested a live 2-way safety call session.
          </p>
        </div>

        {/* Requested Permissions Breakdown */}
        <div className="bg-slate-950/80 border border-slate-800 rounded-2xl p-4 space-y-3 text-left">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-2.5">
              <Video className="w-4 h-4 text-emerald-400" />
              <span className="text-xs font-semibold text-slate-200">Camera</span>
            </div>
            <span className={`text-xs font-mono font-medium px-2 py-0.5 rounded-full ${
              cameraRequested
                ? 'bg-emerald-500/15 text-emerald-300 border border-emerald-500/30'
                : 'bg-slate-800 text-slate-400'
            }`}>
              {cameraRequested ? 'Requested' : 'Not Requested'}
            </span>
          </div>

          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-2.5">
              <Mic className="w-4 h-4 text-emerald-400" />
              <span className="text-xs font-semibold text-slate-200">Microphone</span>
            </div>
            <span className={`text-xs font-mono font-medium px-2 py-0.5 rounded-full ${
              micRequested
                ? 'bg-emerald-500/15 text-emerald-300 border border-emerald-500/30'
                : 'bg-slate-800 text-slate-400'
            }`}>
              {micRequested ? 'Requested' : 'Not Requested'}
            </span>
          </div>
        </div>

        {/* One-Time Permission Checkbox */}
        <div
          onClick={() => setRememberOneTime(!rememberOneTime)}
          className="flex items-start space-x-2.5 text-left p-2.5 rounded-xl bg-slate-950/50 border border-slate-800/80 cursor-pointer hover:bg-slate-950 transition-colors"
        >
          {rememberOneTime ? (
            <CheckSquare className="w-4 h-4 text-emerald-400 flex-shrink-0 mt-0.5" />
          ) : (
            <Square className="w-4 h-4 text-slate-500 flex-shrink-0 mt-0.5" />
          )}
          <div className="text-[11px] leading-tight">
            <span className="font-semibold text-slate-200">Grant One-Time Permission</span>
            <p className="text-slate-400 mt-0.5">
              Whenever parent monitors, connect automatically without prompting again.
            </p>
          </div>
        </div>

        <p className="text-xs text-slate-400">
          Camera and audio will only be transmitted if you click <span className="text-emerald-400 font-semibold">Allow</span>. You can stop this session at any time.
        </p>

        {/* Actions: Allow & Deny */}
        <div className="flex items-center space-x-3 pt-2">
          <button
            onClick={onDeny}
            className="flex-1 flex items-center justify-center space-x-1.5 py-3 px-4 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 font-semibold text-sm border border-slate-700 transition-colors cursor-pointer"
          >
            <X className="w-4 h-4 text-slate-400" />
            <span>Deny</span>
          </button>

          <button
            onClick={() => onAllow(rememberOneTime)}
            className="flex-1 flex items-center justify-center space-x-1.5 py-3 px-4 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-sm shadow-lg shadow-emerald-950/50 transition-colors cursor-pointer"
          >
            <Check className="w-4 h-4" />
            <span>Allow</span>
          </button>
        </div>
      </div>
    </div>
  );
};
