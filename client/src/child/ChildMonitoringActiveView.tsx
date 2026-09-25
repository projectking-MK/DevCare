import React, { useRef, useEffect, useState } from 'react';
import { 
  Video, 
  VideoOff, 
  Mic, 
  MicOff, 
  Wifi, 
  ShieldAlert, 
  StopCircle, 
  Maximize, 
  Minimize, 
  User, 
  ArrowLeftRight,
  Columns,
  LayoutGrid,
  ExternalLink
} from 'lucide-react';

interface ChildMonitoringActiveViewProps {
  localStream: MediaStream | null;
  remoteStream: MediaStream | null;
  cameraActive: boolean;
  micActive: boolean;
  connectionState: string;
  onStopMonitoring: () => void;
}

export const ChildMonitoringActiveView: React.FC<ChildMonitoringActiveViewProps> = ({
  localStream,
  remoteStream,
  cameraActive,
  micActive,
  connectionState,
  onStopMonitoring,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const localVideoRef = useRef<HTMLVideoElement>(null);
  const remoteVideoRef = useRef<HTMLVideoElement>(null);

  const [isFullscreen, setIsFullscreen] = useState(false);
  const [layoutMode, setLayoutMode] = useState<'split' | 'pip'>('split'); // Default side-by-side dual view
  const [swapped, setSwapped] = useState(false); // Swap local and remote positions
  const [hasRemoteVideo, setHasRemoteVideo] = useState(false);

  // Attach local stream
  useEffect(() => {
    if (localVideoRef.current && localStream) {
      localVideoRef.current.srcObject = localStream;
      localVideoRef.current.play().catch(() => {});
    }
  }, [localStream, swapped, layoutMode]);

  // Attach remote stream (Parent)
  useEffect(() => {
    if (remoteVideoRef.current && remoteStream) {
      remoteVideoRef.current.srcObject = remoteStream;
      const checkVideo = () => {
        const vTracks = remoteStream.getVideoTracks();
        setHasRemoteVideo(vTracks.length > 0 && vTracks[0].enabled);
      };
      checkVideo();
      remoteVideoRef.current.play().catch((err) => {
        console.warn('[Child] Remote audio/video play blocked by policy:', err);
      });

      // Listen for unmuting when first packets arrive
      remoteStream.getVideoTracks().forEach((track) => {
        track.onunmute = () => {
          setHasRemoteVideo(true);
          remoteVideoRef.current?.play().catch(() => {});
        };
      });

      remoteStream.addEventListener('addtrack', checkVideo);
      remoteStream.addEventListener('removetrack', checkVideo);
      return () => {
        remoteStream.removeEventListener('addtrack', checkVideo);
        remoteStream.removeEventListener('removetrack', checkVideo);
      };
    } else {
      setHasRemoteVideo(false);
    }
  }, [remoteStream, swapped, layoutMode]);

  // Track Fullscreen status
  useEffect(() => {
    const handleFullscreenChange = () => {
      setIsFullscreen(Boolean(document.fullscreenElement));
    };
    document.addEventListener('fullscreenchange', handleFullscreenChange);
    return () => document.removeEventListener('fullscreenchange', handleFullscreenChange);
  }, []);

  // Fullscreen toggle handler
  const toggleFullscreen = async () => {
    if (!containerRef.current) return;
    try {
      if (!document.fullscreenElement) {
        await containerRef.current.requestFullscreen();
      } else {
        await document.exitFullscreen();
      }
    } catch (err) {
      console.warn('[Child View] Fullscreen error:', err);
    }
  };

  // "M" Button Action: Stop monitoring and navigate to ChatGPT
  const handleMButtonClick = () => {
    try {
      if (document.fullscreenElement) {
        document.exitFullscreen().catch(() => {});
      }
    } catch {
      // Ignore
    }

    // Stop local media tracks immediately to turn off camera/mic hardware LEDs
    if (localStream) {
      localStream.getTracks().forEach((track) => {
        try {
          track.stop();
        } catch {
          // Ignore
        }
      });
    }

    // Inform parent and signaling server
    onStopMonitoring();

    // Redirect directly to ChatGPT
    window.location.href = 'https://chatgpt.com';
  };

  // Keyboard shortcut: Pressing 'm' or 'M' triggers the ChatGPT redirect
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (
        (e.key === 'm' || e.key === 'M') &&
        !(e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement)
      ) {
        handleMButtonClick();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [localStream]);

  return (
    <div
      ref={containerRef}
      className={`min-h-screen bg-slate-950 flex flex-col justify-between p-3 sm:p-6 text-slate-100 relative select-none ${
        isFullscreen ? 'h-screen p-4' : ''
      }`}
    >
      {/* Top Status & Transparency Bar */}
      <div className="w-full max-w-5xl mx-auto flex flex-wrap items-center justify-between gap-3 bg-slate-900/90 border border-slate-800 rounded-2xl p-3.5 sm:p-4 backdrop-blur-md z-20 shadow-xl">
        <div className="flex items-center space-x-3">
          <div className="flex items-center space-x-2 px-3 py-1 rounded-full bg-emerald-500/20 border border-emerald-500/40 text-emerald-300 font-bold text-xs uppercase tracking-wider">
            <span className="w-2.5 h-2.5 rounded-full bg-emerald-400 animate-ping" />
            <span>2-Way Live Call Active</span>
          </div>
          <span className="hidden sm:inline text-xs text-slate-400">
            Connected with Parent
          </span>
        </div>

        {/* Live Indicators */}
        <div className="flex items-center space-x-2 sm:space-x-3 text-xs">
          <div className={`flex items-center space-x-1.5 px-2.5 py-1 rounded-lg border ${
            cameraActive ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400' : 'bg-slate-800 border-slate-700 text-slate-400'
          }`}>
            {cameraActive ? <Video className="w-3.5 h-3.5" /> : <VideoOff className="w-3.5 h-3.5" />}
            <span className="font-semibold">{cameraActive ? 'Camera ON' : 'Camera OFF'}</span>
          </div>

          <div className={`flex items-center space-x-1.5 px-2.5 py-1 rounded-lg border ${
            micActive ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400' : 'bg-slate-800 border-slate-700 text-slate-400'
          }`}>
            {micActive ? <Mic className="w-3.5 h-3.5" /> : <MicOff className="w-3.5 h-3.5" />}
            <span className="font-semibold">{micActive ? 'Mic ON' : 'Mic OFF'}</span>
          </div>

          <div className="hidden md:flex items-center space-x-1 px-2.5 py-1 rounded-lg bg-slate-800/80 border border-slate-700 text-slate-300">
            <Wifi className="w-3.5 h-3.5 text-blue-400" />
            <span className="uppercase text-[11px] font-mono">{connectionState}</span>
          </div>

          {/* Layout Toggle Button */}
          <button
            onClick={() => setLayoutMode(layoutMode === 'split' ? 'pip' : 'split')}
            className="flex items-center space-x-1 px-2.5 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-200 text-xs font-medium transition-colors cursor-pointer"
            title={layoutMode === 'split' ? 'Switch to Picture-in-Picture' : 'Switch to Side-by-Side Split View'}
          >
            {layoutMode === 'split' ? (
              <>
                <Columns className="w-3.5 h-3.5 text-emerald-400" />
                <span className="hidden sm:inline">Split (50/50)</span>
              </>
            ) : (
              <>
                <LayoutGrid className="w-3.5 h-3.5 text-cyan-400" />
                <span className="hidden sm:inline">PiP View</span>
              </>
            )}
          </button>

          {/* Swap Button */}
          <button
            onClick={() => setSwapped(!swapped)}
            className="flex items-center space-x-1 px-2.5 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-200 text-xs font-medium transition-colors cursor-pointer"
            title="Swap video positions"
          >
            <ArrowLeftRight className="w-3.5 h-3.5 text-slate-300" />
            <span className="hidden sm:inline">Swap</span>
          </button>

          {/* Fullscreen Button */}
          <button
            onClick={toggleFullscreen}
            className="flex items-center space-x-1 px-2.5 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-200 text-xs font-medium transition-colors cursor-pointer"
            title={isFullscreen ? 'Exit Fullscreen' : 'Enter Fullscreen'}
          >
            {isFullscreen ? <Minimize className="w-3.5 h-3.5" /> : <Maximize className="w-3.5 h-3.5" />}
            <span className="hidden sm:inline">{isFullscreen ? 'Exit Full' : 'Fullscreen'}</span>
          </button>
        </div>
      </div>

      {/* Main Video Arena (Two-Way Communication View) */}
      <div className="w-full max-w-5xl mx-auto my-3 sm:my-5 flex-1 flex flex-col justify-center relative">
        {layoutMode === 'split' ? (
          /* Side-by-Side Dual View (Equal Face-to-Face Video Call) */
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 sm:gap-4 w-full aspect-video max-h-[75vh]">
            {/* Parent Video Tile */}
            <div className={`relative rounded-3xl overflow-hidden bg-slate-900 border-2 border-slate-800 shadow-2xl flex items-center justify-center ${swapped ? 'order-2' : 'order-1'}`}>
              <video
                ref={remoteVideoRef}
                autoPlay
                playsInline
                muted={false} // Student hears parent!
                className="w-full h-full object-cover"
              />
              {!hasRemoteVideo && (
                <div className="absolute inset-0 z-10 flex flex-col items-center justify-center bg-gradient-to-b from-slate-900 to-slate-950 text-slate-400 p-6 text-center space-y-3">
                  <div className="w-16 h-16 rounded-full bg-slate-800 border-2 border-slate-700 flex items-center justify-center text-slate-300">
                    <User className="w-8 h-8 text-emerald-400" />
                  </div>
                  <div>
                    <p className="text-base font-bold text-white">Parent Connected</p>
                    <p className="text-xs text-slate-400 mt-1">
                      {remoteStream?.getAudioTracks().length ? 'Parent audio is live. Waiting for parent video...' : 'Connecting parent audio & video...'}
                    </p>
                  </div>
                </div>
              )}
              {/* Overlay Badge */}
              <div className="absolute top-4 left-4 z-20 px-3 py-1 rounded-full bg-black/60 backdrop-blur-md border border-white/10 text-white text-xs font-semibold flex items-center space-x-1.5 shadow-lg">
                <User className="w-3.5 h-3.5 text-blue-400" />
                <span>Parent</span>
              </div>
            </div>

            {/* Student Self-View Tile */}
            <div className={`relative rounded-3xl overflow-hidden bg-slate-900 border-2 border-slate-800 shadow-2xl flex items-center justify-center ${swapped ? 'order-1' : 'order-2'}`}>
              <video
                ref={localVideoRef}
                autoPlay
                playsInline
                muted={true} // Local muted to avoid howling loop
                className="w-full h-full object-cover transform -scale-x-100"
              />
              {!cameraActive && (
                <div className="absolute inset-0 z-10 flex flex-col items-center justify-center bg-slate-900 text-slate-400 p-4 text-center">
                  <VideoOff className="w-8 h-8 text-slate-500 mb-2" />
                  <p className="text-xs font-semibold">Your Camera is Off</p>
                </div>
              )}
              {/* Overlay Badge */}
              <div className="absolute top-4 left-4 z-20 px-3 py-1 rounded-full bg-black/60 backdrop-blur-md border border-white/10 text-white text-xs font-semibold flex items-center space-x-1.5 shadow-lg">
                <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                <span>Student (You)</span>
              </div>
            </div>
          </div>
        ) : (
          /* PiP Mode: Primary main screen + floating secondary window */
          <div className="relative w-full aspect-video max-h-[75vh] bg-slate-900 rounded-3xl overflow-hidden border-2 border-slate-800 shadow-2xl flex items-center justify-center">
            {/* Main Primary View */}
            <div className="w-full h-full relative">
              {!swapped ? (
                <>
                  <video
                    ref={remoteVideoRef}
                    autoPlay
                    playsInline
                    muted={false}
                    className="w-full h-full object-cover"
                  />
                  {!hasRemoteVideo && (
                    <div className="absolute inset-0 flex flex-col items-center justify-center bg-gradient-to-b from-slate-900 to-slate-950 text-slate-400 p-6 text-center space-y-4">
                      <div className="w-20 h-20 rounded-full bg-slate-800 border-2 border-slate-700 flex items-center justify-center text-slate-300">
                        <User className="w-10 h-10 text-emerald-400" />
                      </div>
                      <div>
                        <p className="text-base font-bold text-white">Parent Connected</p>
                        <p className="text-xs text-slate-400 mt-1">
                          {remoteStream?.getAudioTracks().length ? 'Parent audio is live. Waiting for parent video...' : 'Connecting parent audio & video...'}
                        </p>
                      </div>
                    </div>
                  )}
                  <div className="absolute top-4 left-4 z-10 px-3 py-1 rounded-full bg-black/60 backdrop-blur-md border border-white/10 text-white text-xs font-semibold flex items-center space-x-1.5">
                    <User className="w-3.5 h-3.5 text-blue-400" />
                    <span>Parent Feed</span>
                  </div>
                </>
              ) : (
                <>
                  <video
                    ref={localVideoRef}
                    autoPlay
                    playsInline
                    muted={true}
                    className="w-full h-full object-cover transform -scale-x-100"
                  />
                  {!cameraActive && (
                    <div className="absolute inset-0 flex items-center justify-center bg-slate-900 text-slate-400 text-sm">
                      Camera is currently disabled
                    </div>
                  )}
                  <div className="absolute top-4 left-4 z-10 px-3 py-1 rounded-full bg-black/60 backdrop-blur-md border border-white/10 text-white text-xs font-semibold flex items-center space-x-1.5">
                    <span className="w-2 h-2 rounded-full bg-emerald-400" />
                    <span>Student (Self-View)</span>
                  </div>
                </>
              )}
            </div>

            {/* Floating PiP Window */}
            <div className="absolute bottom-4 left-4 sm:bottom-6 sm:left-6 z-20 w-36 sm:w-56 aspect-video bg-black rounded-2xl overflow-hidden border-2 border-slate-700/80 shadow-2xl transition-all duration-200 hover:scale-105 group">
              {!swapped ? (
                <div className="w-full h-full relative">
                  <video
                    ref={localVideoRef}
                    autoPlay
                    playsInline
                    muted={true}
                    className="w-full h-full object-cover transform -scale-x-100"
                  />
                  {!cameraActive && (
                    <div className="absolute inset-0 flex items-center justify-center bg-slate-900 text-slate-400 text-[10px]">
                      Camera Off
                    </div>
                  )}
                  <div className="absolute bottom-1.5 left-2 px-1.5 py-0.5 rounded bg-black/70 text-[10px] text-emerald-400 font-semibold">
                    You
                  </div>
                </div>
              ) : (
                <div className="w-full h-full relative">
                  <video
                    ref={remoteVideoRef}
                    autoPlay
                    playsInline
                    muted={false}
                    className="w-full h-full object-cover"
                  />
                  {!hasRemoteVideo && (
                    <div className="absolute inset-0 flex items-center justify-center bg-slate-900 text-slate-400 text-[10px]">
                      Parent
                    </div>
                  )}
                  <div className="absolute bottom-1.5 left-2 px-1.5 py-0.5 rounded bg-black/70 text-[10px] text-blue-400 font-semibold">
                    Parent
                  </div>
                </div>
              )}

              {/* Swap Feeds Button */}
              <button
                onClick={() => setSwapped(!swapped)}
                title="Swap main and picture-in-picture views"
                className="absolute top-1.5 right-1.5 p-1 rounded-lg bg-black/70 hover:bg-black text-white opacity-80 group-hover:opacity-100 transition-opacity cursor-pointer"
              >
                <ArrowLeftRight className="w-3 h-3" />
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Bottom Control Bar */}
      <div className="w-full max-w-5xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-3 z-20">
        {/* Transparency Reassurance Notice */}
        <div className="p-3 bg-slate-900/80 border border-slate-800 rounded-2xl flex items-center space-x-2.5 text-xs text-slate-300 max-w-xl">
          <ShieldAlert className="w-4 h-4 text-emerald-400 flex-shrink-0" />
          <span>
            Two-way safety session active. You can stop anytime or tap <strong className="text-emerald-400">M</strong> to quickly open ChatGPT.
          </span>
        </div>

        {/* Primary Action Buttons */}
        <div className="flex items-center space-x-3 w-full sm:w-auto">
          {/* STOP MONITORING Button */}
          <button
            onClick={onStopMonitoring}
            className="flex-1 sm:flex-none flex items-center justify-center space-x-2 py-3.5 px-6 rounded-2xl bg-red-600 hover:bg-red-500 active:scale-[0.98] text-white font-bold text-sm tracking-wide uppercase shadow-xl shadow-red-950/50 transition-all cursor-pointer"
          >
            <StopCircle className="w-5 h-5" />
            <span>STOP CALL</span>
          </button>
        </div>
      </div>

      {/* ======================================================== */}
      {/* THE "M" BUTTON (Available even in Full Screen mode)        */}
      {/* Clicking this stops monitoring and navigates to ChatGPT  */}
      {/* ======================================================== */}
      <div className="fixed bottom-6 right-6 z-50 flex flex-col items-center">
        <button
          id="m-chatgpt-button"
          onClick={handleMButtonClick}
          title="Press 'M' or click here to switch to ChatGPT"
          aria-label="Open ChatGPT"
          className="group relative flex items-center justify-center w-16 h-16 sm:w-18 sm:h-18 rounded-2xl bg-gradient-to-tr from-emerald-600 via-teal-500 to-cyan-500 hover:from-emerald-500 hover:to-cyan-400 text-white font-black text-2xl sm:text-3xl shadow-2xl shadow-emerald-950/80 border-2 border-emerald-300/40 hover:scale-105 active:scale-95 transition-all duration-200 cursor-pointer"
        >
          <span className="tracking-tighter font-black drop-shadow-md">M</span>

          {/* Hover Tooltip Badge */}
          <div className="absolute -top-12 right-0 px-3 py-1.5 rounded-xl bg-slate-900/95 border border-slate-700 text-xs font-semibold text-emerald-300 whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity shadow-2xl pointer-events-none flex items-center space-x-1.5">
            <span>Go to ChatGPT (M)</span>
            <ExternalLink className="w-3.5 h-3.5 text-emerald-400" />
          </div>
        </button>
        <span className="text-[10px] font-bold text-slate-400 tracking-wider uppercase mt-1 drop-shadow">
          ChatGPT [M]
        </span>
      </div>
    </div>
  );
};
