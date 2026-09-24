import React, { useRef, useEffect } from 'react';
import { Video, Mic, Wifi, ShieldAlert, StopCircle, Eye } from 'lucide-react';

interface ChildMonitoringActiveViewProps {
  localStream: MediaStream | null;
  cameraActive: boolean;
  micActive: boolean;
  connectionState: string;
  onStopMonitoring: () => void;
}

export const ChildMonitoringActiveView: React.FC<ChildMonitoringActiveViewProps> = ({
  localStream,
  cameraActive,
  micActive,
  connectionState,
  onStopMonitoring,
}) => {
  const videoRef = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    if (videoRef.current && localStream) {
      videoRef.current.srcObject = localStream;
    }
  }, [localStream]);

  return (
    <div className="min-h-screen bg-slate-950 flex flex-col items-center justify-between p-4 sm:p-8 text-slate-100">
      {/* Top Prominent High-Contrast Monitoring Active Banner */}
      <div className="w-full max-w-lg bg-emerald-950/80 border-2 border-emerald-500 rounded-3xl p-6 shadow-2xl text-center space-y-3 animate-pulse-subtle">
        <div className="inline-flex items-center space-x-2 px-3.5 py-1 rounded-full bg-emerald-500/20 border border-emerald-500/40 text-emerald-300 font-bold text-xs uppercase tracking-widest">
          <span className="w-2.5 h-2.5 rounded-full bg-emerald-400 animate-ping" />
          <span>Live Session In Progress</span>
        </div>

        <h1 className="text-2xl sm:text-3xl font-black text-white tracking-tight">
          🟢 MONITORING ACTIVE
        </h1>

        <div className="grid grid-cols-3 gap-2 pt-2 text-xs font-semibold">
          <div className="bg-slate-900/90 border border-slate-800 rounded-xl p-2.5 flex flex-col items-center space-y-1">
            <Video className="w-4 h-4 text-emerald-400" />
            <span className="text-slate-400">Camera</span>
            <span className="text-emerald-400">{cameraActive ? 'ON' : 'OFF'}</span>
          </div>

          <div className="bg-slate-900/90 border border-slate-800 rounded-xl p-2.5 flex flex-col items-center space-y-1">
            <Mic className="w-4 h-4 text-emerald-400" />
            <span className="text-slate-400">Microphone</span>
            <span className="text-emerald-400">{micActive ? 'ON' : 'OFF'}</span>
          </div>

          <div className="bg-slate-900/90 border border-slate-800 rounded-xl p-2.5 flex flex-col items-center space-y-1">
            <Wifi className="w-4 h-4 text-emerald-400" />
            <span className="text-slate-400">Connection</span>
            <span className="text-emerald-400 uppercase text-[10px]">{connectionState}</span>
          </div>
        </div>
      </div>

      {/* Center: Self-View Camera Stream (Transparency) */}
      <div className="w-full max-w-lg my-6 space-y-2">
        <div className="flex items-center justify-between text-xs text-slate-400 px-1">
          <span className="flex items-center space-x-1.5">
            <Eye className="w-3.5 h-3.5 text-emerald-400" />
            <span>Self-View (What parent sees)</span>
          </span>
          <span className="text-[11px] text-emerald-400 font-medium">Browser camera active</span>
        </div>

        <div className="w-full aspect-video bg-black rounded-3xl overflow-hidden border border-slate-800 relative shadow-2xl flex items-center justify-center">
          <video
            ref={videoRef}
            autoPlay
            playsInline
            muted
            className="w-full h-full object-cover transform -scale-x-100"
          />
          {!cameraActive && (
            <div className="absolute inset-0 flex items-center justify-center bg-slate-900/90 text-slate-400 text-xs">
              Camera is not requested in this session
            </div>
          )}
        </div>

        <div className="text-center">
          <p className="text-[11px] text-slate-400">
            Notice: Your browser's camera and microphone indicator icons remain visibly active in the browser tab.
          </p>
        </div>
      </div>

      {/* Bottom: Stop Monitoring Button */}
      <div className="w-full max-w-lg space-y-4">
        <button
          onClick={onStopMonitoring}
          className="w-full py-4 px-6 rounded-2xl bg-red-600 hover:bg-red-500 text-white font-black text-lg tracking-wide uppercase shadow-2xl shadow-red-950 flex items-center justify-center space-x-3 transition-transform active:scale-[0.98]"
        >
          <StopCircle className="w-6 h-6" />
          <span>STOP MONITORING</span>
        </button>

        <div className="p-3 bg-slate-900/60 border border-slate-800/80 rounded-xl flex items-center space-x-2 text-[11px] text-slate-400">
          <ShieldAlert className="w-4 h-4 text-emerald-400 flex-shrink-0" />
          <span>You have full control. Pressing Stop immediately revokes all camera and microphone access.</span>
        </div>
      </div>
    </div>
  );
};
