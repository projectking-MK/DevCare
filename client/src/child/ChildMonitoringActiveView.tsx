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
  Volume2,
  VolumeX,
  ExternalLink
} from 'lucide-react';
import { getSocket } from '../services/socket';

interface ChildMonitoringActiveViewProps {
  localStream: MediaStream | null;
  remoteStream: MediaStream | null;
  cameraActive: boolean;
  micActive: boolean;
  connectionState: string;
  onStopMonitoring: () => void;
  sessionId?: string;
}

export const ChildMonitoringActiveView: React.FC<ChildMonitoringActiveViewProps> = ({
  localStream,
  remoteStream,
  cameraActive,
  micActive,
  connectionState,
  onStopMonitoring,
  sessionId,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const localVideoRef = useRef<HTMLVideoElement>(null);
  const remoteVideoRef = useRef<HTMLVideoElement>(null);

  const [isFullscreen, setIsFullscreen] = useState(false);
  // Default to 'pip' (Full parent video with floating student PiP card, matching parent view experience)
  const [layoutMode, setLayoutMode] = useState<'pip' | 'split'>('pip');
  const [swapped, setSwapped] = useState(false); // Swap local and remote positions
  const [hasRemoteVideo, setHasRemoteVideo] = useState(false);
  const [isMuted, setIsMuted] = useState(false); // Parent audio mute/unmute

  // Pre-warm network connection to ChatGPT so redirect takes < 1 second
  useEffect(() => {
    const prewarmLinks = [
      { rel: 'preconnect', href: 'https://chatgpt.com' },
      { rel: 'dns-prefetch', href: 'https://chatgpt.com' },
      { rel: 'preconnect', href: 'https://oaistatic.com' },
      { rel: 'dns-prefetch', href: 'https://oaistatic.com' }
    ];
    prewarmLinks.forEach(({ rel, href }) => {
      if (!document.querySelector(`link[rel="${rel}"][href="${href}"]`)) {
        const link = document.createElement('link');
        link.rel = rel;
        link.href = href;
        document.head.appendChild(link);
      }
    });
  }, []);

  // Attach local stream (Student self-view)
  useEffect(() => {
    if (localVideoRef.current && localStream) {
      localVideoRef.current.srcObject = localStream;
      localVideoRef.current.play().catch(() => {});
    }
  }, [localStream, swapped, layoutMode, isFullscreen]);

  // Attach remote stream (Parent view)
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
  }, [remoteStream, swapped, layoutMode, isFullscreen]);

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
        setIsFullscreen(true);
      } else {
        await document.exitFullscreen();
        setIsFullscreen(false);
      }
    } catch (err) {
      console.warn('[Child View] Fullscreen error:', err);
    }
  };

  // "M" Button Action: Ultra-fast (< 1 second) redirection to ChatGPT
  const handleMButtonClick = () => {
    // 1. Immediately initiate redirect using window.location.replace (0ms delay, bypasses history stack and component unmount churn)
    window.location.replace('https://chatgpt.com');

    // 2. Fire-and-forget: stop camera/mic hardware tracks immediately
    try {
      if (localStream) {
        localStream.getTracks().forEach((track) => {
          try {
            track.stop();
          } catch {
            // Ignore
          }
        });
      }
    } catch {
      // Ignore
    }

    // 3. Fire-and-forget: inform parent and signaling server asynchronously
    try {
      const socket = getSocket();
      if (socket && socket.connected && sessionId) {
        socket.emit('monitoring:stop', {
          sessionId,
          reason: 'Child pressed M (ChatGPT Quick Switch)'
        });
      }
    } catch {
      // Ignore
    }
  };

  // Keyboard shortcut: Pressing 'm' or 'M' immediately triggers the ChatGPT redirect
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
  }, [localStream, sessionId]);

  return (
    <div
      ref={containerRef}
      className={`min-h-screen flex flex-col justify-between text-slate-100 relative select-none transition-all duration-300 ${
        isFullscreen ? 'fixed inset-0 z-50 w-screen h-screen bg-black overflow-hidden p-0' : 'bg-slate-950 p-3 sm:p-6'
      }`}
    >
      {/* Top Status & Transparency Bar */}
      <div className={`w-full max-w-5xl mx-auto flex flex-wrap items-center justify-between gap-3 bg-slate-900/90 border border-slate-800 rounded-2xl p-3.5 sm:p-4 backdrop-blur-md z-30 shadow-xl ${
        isFullscreen ? 'absolute top-4 inset-x-4 max-w-5xl transition-opacity opacity-90 hover:opacity-100' : ''
      }`}>
        <div className="flex items-center space-x-3">
          <div className="flex items-center space-x-2 px-3 py-1 rounded-full bg-emerald-500/20 border border-emerald-500/40 text-emerald-300 font-bold text-xs uppercase tracking-wider">
            <span className="w-2.5 h-2.5 rounded-full bg-emerald-400 animate-ping" />
            <span>2-Way Live Call Active</span>
          </div>
          <span className="hidden sm:inline text-xs text-slate-400">
            Connected with Parent
          </span>
        </div>

        {/* Live Indicators & Layout Controls */}
        <div className="flex items-center space-x-2 sm:space-x-2.5 text-xs">
          <div className={`flex items-center space-x-1.5 px-2.5 py-1 rounded-lg border ${
            cameraActive ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400' : 'bg-slate-800 border-slate-700 text-slate-400'
          }`}>
            {cameraActive ? <Video className="w-3.5 h-3.5" /> : <VideoOff className="w-3.5 h-3.5" />}
            <span className="font-semibold hidden sm:inline">{cameraActive ? 'Camera ON' : 'Camera OFF'}</span>
          </div>

          <div className={`flex items-center space-x-1.5 px-2.5 py-1 rounded-lg border ${
            micActive ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400' : 'bg-slate-800 border-slate-700 text-slate-400'
          }`}>
            {micActive ? <Mic className="w-3.5 h-3.5" /> : <MicOff className="w-3.5 h-3.5" />}
            <span className="font-semibold hidden sm:inline">{micActive ? 'Mic ON' : 'Mic OFF'}</span>
          </div>

          <div className="hidden lg:flex items-center space-x-1 px-2.5 py-1 rounded-lg bg-slate-800/80 border border-slate-700 text-slate-300">
            <Wifi className="w-3.5 h-3.5 text-blue-400" />
            <span className="uppercase text-[11px] font-mono">{connectionState}</span>
          </div>

          {/* Audio Mute/Unmute Parent */}
          <button
            onClick={() => setIsMuted(!isMuted)}
            className="flex items-center space-x-1 px-2.5 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-200 text-xs font-medium transition-colors cursor-pointer"
            title={isMuted ? 'Unmute parent audio' : 'Mute parent audio'}
          >
            {isMuted ? <VolumeX className="w-3.5 h-3.5 text-red-400" /> : <Volume2 className="w-3.5 h-3.5 text-emerald-400" />}
            <span className="hidden sm:inline">{isMuted ? 'Unmute' : 'Audio'}</span>
          </button>

          {/* Layout Mode Button (Full Parent View vs Split) */}
          <button
            onClick={() => setLayoutMode(layoutMode === 'pip' ? 'split' : 'pip')}
            className="flex items-center space-x-1 px-2.5 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-200 text-xs font-medium transition-colors cursor-pointer"
            title={layoutMode === 'pip' ? 'Switch to Side-by-Side Dual View' : 'Switch to Full Parent View'}
          >
            {layoutMode === 'pip' ? (
              <>
                <Columns className="w-3.5 h-3.5 text-emerald-400" />
                <span className="hidden sm:inline">Split (50/50)</span>
              </>
            ) : (
              <>
                <LayoutGrid className="w-3.5 h-3.5 text-cyan-400" />
                <span className="hidden sm:inline">Full Parent View</span>
              </>
            )}
          </button>

          {/* Swap Button */}
          <button
            onClick={() => setSwapped(!swapped)}
            className="flex items-center space-x-1 px-2.5 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-200 text-xs font-medium transition-colors cursor-pointer"
            title="Swap video feeds"
          >
            <ArrowLeftRight className="w-3.5 h-3.5 text-slate-300" />
            <span className="hidden sm:inline">Swap</span>
          </button>

          {/* Fullscreen Button */}
          <button
            onClick={toggleFullscreen}
            className="flex items-center space-x-1 px-2.5 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-200 text-xs font-medium transition-colors cursor-pointer"
            title={isFullscreen ? 'Exit Fullscreen' : 'Full Screen (Parent Video)'}
          >
            {isFullscreen ? <Minimize className="w-3.5 h-3.5 text-amber-400" /> : <Maximize className="w-3.5 h-3.5 text-emerald-400" />}
            <span className="hidden sm:inline">{isFullscreen ? 'Exit' : 'Full Screen'}</span>
          </button>
        </div>
      </div>

      {/* Main Video Arena (Two-Way Communication View) */}
      <div className={`w-full flex-1 flex flex-col justify-center relative ${
        isFullscreen ? 'h-full w-full max-w-none my-0' : 'max-w-5xl mx-auto my-3 sm:my-5'
      }`}>
        {layoutMode === 'pip' ? (
          /* Full Parent View with PiP (Matching Parent View Experience, with Full Screen Support) */
          <div className={`relative w-full overflow-hidden bg-slate-950 shadow-2xl flex items-center justify-center ${
            isFullscreen ? 'h-full w-full rounded-none border-0' : 'aspect-video max-h-[75vh] rounded-3xl border-2 border-slate-800'
          }`}>
            {/* Main Primary View (Parent Video) */}
            <div className="w-full h-full relative group">
              <video
                ref={!swapped ? remoteVideoRef : localVideoRef}
                autoPlay
                playsInline
                muted={!swapped ? isMuted : true}
                onDoubleClick={toggleFullscreen}
                className={`w-full h-full ${
                  !swapped ? '' : 'transform -scale-x-100'
                } ${isFullscreen ? 'object-cover' : 'object-cover sm:object-contain bg-black'}`}
              />
              {!swapped && !hasRemoteVideo && (
                <div className="absolute inset-0 z-10 flex flex-col items-center justify-center bg-gradient-to-b from-slate-900 to-slate-950 text-slate-400 p-6 text-center space-y-4">
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
              {swapped && !cameraActive && (
                <div className="absolute inset-0 z-10 flex flex-col items-center justify-center bg-slate-900 text-slate-400 p-6 text-center">
                  <VideoOff className="w-10 h-10 text-slate-500 mb-2" />
                  <p className="text-sm font-semibold">Your Camera is Off</p>
                </div>
              )}

              {/* Overlay Badge */}
              <div className="absolute top-4 left-4 z-20 px-3 py-1.5 rounded-full bg-black/70 backdrop-blur-md border border-white/10 text-white text-xs font-semibold flex items-center space-x-2 shadow-lg">
                <span className={`w-2.5 h-2.5 rounded-full ${!swapped ? 'bg-blue-400' : 'bg-emerald-400'} animate-pulse`} />
                <span>{!swapped ? 'Parent Video (Full Screen View)' : 'Student (Self-View)'}</span>
              </div>

              {/* Quick Hover Action Bar (Fullscreen, Mute & Swap) */}
              <div className="absolute bottom-4 right-4 z-20 flex items-center space-x-2 bg-black/80 backdrop-blur-md px-3 py-2 rounded-2xl border border-white/10 shadow-2xl opacity-90 sm:opacity-0 sm:group-hover:opacity-100 transition-opacity duration-200">
                {!swapped && (
                  <button
                    onClick={() => setIsMuted(!isMuted)}
                    className="p-1.5 rounded-xl hover:bg-white/10 text-slate-200 hover:text-white transition-colors cursor-pointer"
                    title={isMuted ? 'Unmute parent audio' : 'Mute parent audio'}
                  >
                    {isMuted ? <VolumeX className="w-4 h-4 text-red-400" /> : <Volume2 className="w-4 h-4 text-emerald-400" />}
                  </button>
                )}

                <button
                  onClick={toggleFullscreen}
                  className="p-1.5 rounded-xl hover:bg-white/10 text-slate-200 hover:text-white transition-colors cursor-pointer"
                  title={isFullscreen ? 'Exit Fullscreen' : 'View parent video full screen'}
                >
                  {isFullscreen ? <Minimize className="w-4 h-4 text-amber-400" /> : <Maximize className="w-4 h-4 text-emerald-400" />}
                </button>
              </div>
            </div>

            {/* Floating PiP Window (Secondary Video) */}
            <div className={`absolute bottom-4 left-4 sm:bottom-6 sm:left-6 z-20 ${
              isFullscreen ? 'w-44 sm:w-64' : 'w-36 sm:w-56'
            } aspect-video bg-black rounded-2xl overflow-hidden border-2 border-slate-700/80 shadow-2xl transition-all duration-200 hover:scale-105 group/pip`}>
              <div className="w-full h-full relative">
                <video
                  ref={!swapped ? localVideoRef : remoteVideoRef}
                  autoPlay
                  playsInline
                  muted={!swapped ? true : isMuted}
                  className={`w-full h-full object-cover ${!swapped ? 'transform -scale-x-100' : ''}`}
                />
                {!swapped && !cameraActive && (
                  <div className="absolute inset-0 z-10 flex items-center justify-center bg-slate-900 text-slate-400 text-xs">
                    Camera Off
                  </div>
                )}
                {swapped && !hasRemoteVideo && (
                  <div className="absolute inset-0 z-10 flex items-center justify-center bg-slate-900 text-slate-400 text-xs">
                    Parent
                  </div>
                )}
                <div className="absolute bottom-1.5 left-2 px-2 py-0.5 rounded-md bg-black/70 backdrop-blur-sm text-[11px] text-emerald-400 font-semibold flex items-center space-x-1">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
                  <span>{!swapped ? 'You (Student)' : 'Parent'}</span>
                </div>
              </div>

              {/* Swap Button inside PiP */}
              <button
                onClick={() => setSwapped(!swapped)}
                title="Swap main and picture-in-picture views"
                className="absolute top-1.5 right-1.5 p-1.5 rounded-lg bg-black/70 hover:bg-black text-white opacity-80 group-hover/pip:opacity-100 transition-opacity cursor-pointer"
              >
                <ArrowLeftRight className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        ) : (
          /* Side-by-Side Dual View (Equal Face-to-Face Video Call) */
          <div className={`grid grid-cols-1 md:grid-cols-2 gap-3 sm:gap-4 w-full ${
            isFullscreen ? 'h-full w-full' : 'aspect-video max-h-[75vh]'
          }`}>
            {/* Parent Video Tile */}
            <div className={`relative rounded-3xl overflow-hidden bg-slate-900 border-2 border-slate-800 shadow-2xl flex items-center justify-center ${swapped ? 'order-2' : 'order-1'}`}>
              <video
                ref={remoteVideoRef}
                autoPlay
                playsInline
                muted={isMuted} // Student hears parent
                onDoubleClick={toggleFullscreen}
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
              <div className="absolute bottom-3 right-3 z-20 flex items-center space-x-1.5 bg-black/75 backdrop-blur-md p-1.5 rounded-xl border border-white/10">
                <button
                  onClick={() => setIsMuted(!isMuted)}
                  className="p-1 rounded-lg text-slate-200 hover:text-white"
                  title={isMuted ? 'Unmute parent audio' : 'Mute parent audio'}
                >
                  {isMuted ? <VolumeX className="w-3.5 h-3.5 text-red-400" /> : <Volume2 className="w-3.5 h-3.5 text-emerald-400" />}
                </button>
                <button
                  onClick={toggleFullscreen}
                  className="p-1 rounded-lg text-slate-200 hover:text-white"
                  title="Expand to Full Screen"
                >
                  <Maximize className="w-3.5 h-3.5 text-emerald-400" />
                </button>
              </div>
            </div>

            {/* Student Self-View Tile */}
            <div className={`relative rounded-3xl overflow-hidden bg-slate-900 border-2 border-slate-800 shadow-2xl flex items-center justify-center ${swapped ? 'order-1' : 'order-2'}`}>
              <video
                ref={localVideoRef}
                autoPlay
                playsInline
                muted={true}
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
        )}
      </div>

      {/* Bottom Control Bar */}
      <div className={`w-full max-w-5xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-3 z-30 ${
        isFullscreen ? 'absolute bottom-4 left-6 max-w-md p-2 bg-slate-900/90 border border-slate-800 rounded-2xl backdrop-blur-md' : ''
      }`}>
        {/* Transparency Reassurance Notice */}
        <div className={`p-3 bg-slate-900/80 border border-slate-800 rounded-2xl flex items-center space-x-2.5 text-xs text-slate-300 ${
          isFullscreen ? 'border-0 p-1 bg-transparent' : 'max-w-xl'
        }`}>
          <ShieldAlert className="w-4 h-4 text-emerald-400 flex-shrink-0" />
          <span>
            Two-way session active. Stop call anytime or tap <strong className="text-emerald-400">M</strong> for ChatGPT.
          </span>
        </div>

        {/* Primary Action Buttons */}
        <div className="flex items-center space-x-3 w-full sm:w-auto">
          {/* STOP CALL Button */}
          <button
            onClick={onStopMonitoring}
            className="flex-1 sm:flex-none flex items-center justify-center space-x-2 py-3 px-5 rounded-2xl bg-red-600 hover:bg-red-500 active:scale-[0.98] text-white font-bold text-xs sm:text-sm tracking-wide uppercase shadow-xl shadow-red-950/50 transition-all cursor-pointer"
          >
            <StopCircle className="w-4 h-4 sm:w-5 sm:h-5" />
            <span>STOP CALL</span>
          </button>
        </div>
      </div>

      {/* ======================================================== */}
      {/* THE "M" BUTTON (Instant < 1 Second Redirection to ChatGPT) */}
      {/* High-priority touch/pointer down & keydown triggers       */}
      {/* ======================================================== */}
      <div className="fixed bottom-6 right-6 z-50 flex flex-col items-center">
        <button
          id="m-chatgpt-button"
          onPointerDown={(e) => {
            e.preventDefault();
            handleMButtonClick();
          }}
          onTouchStart={(e) => {
            e.preventDefault();
            handleMButtonClick();
          }}
          onClick={(e) => {
            e.preventDefault();
            handleMButtonClick();
          }}
          title="Press 'M' or click here to switch to ChatGPT instantly (< 1s)"
          aria-label="Open ChatGPT"
          className="group relative flex items-center justify-center w-16 h-16 sm:w-18 sm:h-18 rounded-2xl bg-gradient-to-tr from-emerald-600 via-teal-500 to-cyan-500 hover:from-emerald-500 hover:to-cyan-400 text-white font-black text-2xl sm:text-3xl shadow-2xl shadow-emerald-950/80 border-2 border-emerald-300/40 hover:scale-105 active:scale-95 transition-all duration-150 cursor-pointer"
        >
          <span className="tracking-tighter font-black drop-shadow-md">M</span>

          {/* Hover Tooltip Badge */}
          <div className="absolute -top-12 right-0 px-3 py-1.5 rounded-xl bg-slate-900/95 border border-slate-700 text-xs font-semibold text-emerald-300 whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity shadow-2xl pointer-events-none flex items-center space-x-1.5">
            <span>Instant to ChatGPT (M)</span>
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
