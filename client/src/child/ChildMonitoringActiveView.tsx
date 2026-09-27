import React, { useRef, useEffect, useState } from 'react';
import { 
  Video, 
  VideoOff, 
  Mic, 
  MicOff, 
  Wifi, 
  Maximize, 
  Minimize, 
  User, 
  ArrowLeftRight, 
  Columns, 
  LayoutGrid, 
  Volume2, 
  VolumeX, 
  ExternalLink, 
  ScreenShare, 
  ScreenShareOff, 
  Monitor, 
  MessageSquare, 
  X, 
  Radio, 
  Clock, 
  Sparkles, 
  Square, 
  Tv,
  CircleDot,
  AlertCircle
} from 'lucide-react';
import { getSocket } from '../services/socket';
import { WebRtcConnection } from '../services/webrtc';
import { InCallChat } from '../components/InCallChat';
import { AudioVisualizer } from '../components/AudioVisualizer';
import { useMediaRecorder } from '../hooks/useMediaRecorder';
import { formatDuration } from '../utils/formatters';

interface ChildMonitoringActiveViewProps {
  localStream: MediaStream | null;
  remoteStream: MediaStream | null;
  cameraActive: boolean;
  micActive: boolean;
  connectionState: string;
  onStopMonitoring: () => void;
  sessionId?: string;
  webrtcConnection?: WebRtcConnection | null;
  parentName?: string;
}

export const ChildMonitoringActiveView: React.FC<ChildMonitoringActiveViewProps> = ({
  localStream,
  remoteStream,
  cameraActive,
  micActive,
  connectionState,
  onStopMonitoring,
  sessionId,
  webrtcConnection,
  parentName = 'Parent'
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const localVideoRef = useRef<HTMLVideoElement>(null);
  const remoteVideoRef = useRef<HTMLVideoElement>(null);
  const childDisplayStreamRef = useRef<MediaStream | null>(null);
  const sessionStartTimeRef = useRef<number>(Date.now());

  const [isFullscreen, setIsFullscreen] = useState(false);
  // Layout mode: 'split' for equal 50/50 dual view, 'pip' for picture-in-picture, 'parent-full' for Parent Full View
  const [layoutMode, setLayoutMode] = useState<'split' | 'pip' | 'parent-full'>('split');
  const [swapped, setSwapped] = useState(false); // Swap local and remote positions
  const [hasRemoteVideo, setHasRemoteVideo] = useState(false);
  const [isMuted, setIsMuted] = useState(false); // Parent audio mute/unmute
  const [elapsedSeconds, setElapsedSeconds] = useState(0);

  // Student local Cam & Mic states
  const [localCamEnabled, setLocalCamEnabled] = useState(cameraActive);
  const [localMicEnabled, setLocalMicEnabled] = useState(micActive);

  // In-Call Chat & Screen Mirror States
  const [isChatOpen, setIsChatOpen] = useState(false);
  const [unreadChatCount, setUnreadChatCount] = useState(0);
  const [isChildScreenSharing, setIsChildScreenSharing] = useState(false);
  const [isParentScreenSharing, setIsParentScreenSharing] = useState(false);
  const [screenRequestNotice, setScreenRequestNotice] = useState<string | null>(null);

  // Local Media Recording in IndexedDB (Matching Parent Panel)
  const {
    isRecording,
    duration: recordDuration,
    error: recordError,
    storageWarning,
    startRecording,
    stopRecording
  } = useMediaRecorder(remoteStream, 'child_companion', parentName, sessionId || 'child_active_call');

  // Elapsed duration timer matching parent view
  useEffect(() => {
    sessionStartTimeRef.current = Date.now();
    const timer = setInterval(() => {
      setElapsedSeconds(Math.round((Date.now() - sessionStartTimeRef.current) / 1000));
    }, 1000);
    return () => clearInterval(timer);
  }, []);

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

  // Screen Mirroring Handlers
  const toggleChildScreenMirror = async () => {
    if (isChildScreenSharing) {
      stopChildScreenMirror();
    } else {
      await startChildScreenMirror();
    }
  };

  const startChildScreenMirror = async () => {
    try {
      const displayStream = await navigator.mediaDevices.getDisplayMedia({
        video: { cursor: 'always' } as any,
        audio: false
      });
      const displayTrack = displayStream.getVideoTracks()[0];
      if (!displayTrack) return;

      childDisplayStreamRef.current = displayStream;

      displayTrack.onended = () => {
        stopChildScreenMirror();
      };

      if (webrtcConnection) {
        await webrtcConnection.replaceVideoTrack(displayTrack);
      }

      if (localVideoRef.current) {
        localVideoRef.current.srcObject = displayStream;
        localVideoRef.current.play().catch(() => {});
      }

      setIsChildScreenSharing(true);
      setScreenRequestNotice(null);

      const socket = getSocket();
      if (sessionId) {
        socket.emit('screen:status', {
          sessionId,
          isSharing: true
        });
      }
    } catch (err) {
      console.warn('[Child] Screen mirror cancelled or error:', err);
    }
  };

  const stopChildScreenMirror = async () => {
    if (childDisplayStreamRef.current) {
      childDisplayStreamRef.current.getTracks().forEach((t) => {
        try { t.stop(); } catch {}
      });
      childDisplayStreamRef.current = null;
    }

    let camTrack: MediaStreamTrack | null = null;
    if (localStream) {
      const tracks = localStream.getVideoTracks();
      if (tracks.length > 0) {
        camTrack = tracks[0];
      }
    }

    if (webrtcConnection) {
      await webrtcConnection.replaceVideoTrack(camTrack);
    }

    if (localVideoRef.current && localStream) {
      localVideoRef.current.srcObject = localStream;
      localVideoRef.current.play().catch(() => {});
    }

    setIsChildScreenSharing(false);

    const socket = getSocket();
    if (sessionId) {
      socket.emit('screen:status', {
        sessionId,
        isSharing: false
      });
    }
  };

  // Toggle Student Local Mic
  const toggleLocalMic = () => {
    if (localStream) {
      const aTracks = localStream.getAudioTracks();
      const next = !localMicEnabled;
      aTracks.forEach((t) => { t.enabled = next; });
      setLocalMicEnabled(next);
    }
  };

  // Toggle Student Local Camera
  const toggleLocalCam = () => {
    if (localStream) {
      const vTracks = localStream.getVideoTracks();
      const next = !localCamEnabled;
      vTracks.forEach((t) => { t.enabled = next; });
      setLocalCamEnabled(next);
    }
  };

  // Listen for screen status and parent mirror requests
  useEffect(() => {
    const socket = getSocket();

    const handleScreenStatus = (data: { sessionId: string; sender: string; isSharing: boolean }) => {
      if (data.sender === 'parent') {
        setIsParentScreenSharing(Boolean(data.isSharing));
      }
    };

    const handleScreenRequest = (data: { sessionId: string }) => {
      if (!isChildScreenSharing) {
        setScreenRequestNotice('Parent is requesting you to mirror your screen.');
      }
    };

    socket.on('screen:status', handleScreenStatus);
    socket.on('screen:request_mirror', handleScreenRequest);

    return () => {
      socket.off('screen:status', handleScreenStatus);
      socket.off('screen:request_mirror', handleScreenRequest);
    };
  }, [sessionId, isChildScreenSharing]);

  // Clean up screen sharing on unmount
  useEffect(() => {
    return () => {
      if (childDisplayStreamRef.current) {
        childDisplayStreamRef.current.getTracks().forEach((t) => {
          try { t.stop(); } catch {}
        });
        childDisplayStreamRef.current = null;
      }
    };
  }, []);

  // Attach local stream (Student self-view)
  useEffect(() => {
    if (localVideoRef.current && (isChildScreenSharing ? childDisplayStreamRef.current : localStream)) {
      localVideoRef.current.srcObject = isChildScreenSharing ? childDisplayStreamRef.current : localStream;
      localVideoRef.current.play().catch(() => {});
    }
  }, [localStream, swapped, layoutMode, isFullscreen, isChildScreenSharing]);

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
    // 1. Immediately initiate redirect using window.location.replace
    window.location.replace('https://chatgpt.com');

    // 2. Fire-and-forget: stop camera/mic hardware tracks immediately
    try {
      if (localStream) {
        localStream.getTracks().forEach((track) => {
          try { track.stop(); } catch {}
        });
      }
      if (childDisplayStreamRef.current) {
        childDisplayStreamRef.current.getTracks().forEach((track) => {
          try { track.stop(); } catch {}
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

  const hasRemoteAudio = Boolean(remoteStream && remoteStream.getAudioTracks().length > 0 && !isMuted);

  // =========================================================================
  // DEDICATED FULL SCREEN LAYOUT (Matching Parent Fullscreen Mode)
  // When isFullscreen is active, provide a clean, 100vw/100vh immersive UI
  // with floating top HUD, floating bottom dock, and edge-to-edge video canvas
  // =========================================================================
  if (isFullscreen) {
    return (
      <div
        ref={containerRef}
        className="fixed inset-0 z-50 w-screen h-screen bg-black text-slate-100 overflow-hidden flex flex-col select-none"
      >
        {/* Top-Left Floating HUD */}
        <div className="absolute top-4 left-4 z-[70] flex items-center space-x-2.5 px-3.5 py-1.5 rounded-full bg-black/70 backdrop-blur-md border border-white/10 text-white text-xs font-semibold shadow-2xl pointer-events-auto">
          <span className="w-2.5 h-2.5 rounded-full bg-emerald-400 animate-pulse" />
          <span>{parentName}</span>
          <span className="text-slate-500">•</span>
          <span className="font-mono text-emerald-400">{formatDuration(elapsedSeconds)}</span>
          <span className="text-slate-500">•</span>
          <span className="text-slate-300">2-Way Call</span>
        </div>

        {/* The "M" Button (Top-Right) */}
        <div className="absolute top-4 right-4 sm:top-5 sm:right-6 z-[75] flex items-center pointer-events-auto">
          <button
            id="m-chatgpt-button-fullscreen"
            onPointerDown={(e) => { e.preventDefault(); handleMButtonClick(); }}
            onTouchStart={(e) => { e.preventDefault(); handleMButtonClick(); }}
            onClick={(e) => { e.preventDefault(); handleMButtonClick(); }}
            title="Press 'M' key or click here to switch to ChatGPT instantly (< 1s)"
            className="group relative flex items-center space-x-2 px-3.5 py-2 rounded-2xl bg-gradient-to-r from-emerald-600 via-teal-500 to-cyan-500 hover:from-emerald-500 hover:to-cyan-400 text-white font-bold shadow-2xl shadow-emerald-950/80 border-2 border-emerald-300/40 hover:scale-105 active:scale-95 transition-all duration-150 cursor-pointer"
          >
            <div className="w-6 h-6 rounded-xl bg-black/30 flex items-center justify-center font-black text-sm text-emerald-200">
              M
            </div>
            <div className="flex flex-col text-left leading-tight pr-0.5">
              <span className="text-xs font-black tracking-tight text-white flex items-center space-x-1">
                <span>ChatGPT</span>
                <ExternalLink className="w-3 h-3 text-cyan-200" />
              </span>
              <span className="text-[9px] font-semibold text-emerald-100 opacity-90">Press 'M' key</span>
            </div>
          </button>
        </div>

        {/* Fullscreen Video Canvas (100% viewport) */}
        <div className="w-full h-full flex-1 relative flex items-center justify-center bg-black overflow-hidden">
          {layoutMode === 'parent-full' ? (
            /* Sole Full Screen Parent Video */
            <div className="w-full h-full relative flex items-center justify-center bg-black">
              <video
                ref={remoteVideoRef}
                autoPlay
                playsInline
                muted={isMuted}
                className="w-full h-full object-contain sm:object-cover"
              />
              {!hasRemoteVideo && (
                <div className="absolute inset-0 z-10 flex flex-col items-center justify-center bg-slate-950 text-slate-400 p-6 text-center space-y-3">
                  <div className="w-20 h-20 rounded-full bg-slate-800 border-2 border-slate-700 flex items-center justify-center text-slate-300">
                    <User className="w-10 h-10 text-emerald-400" />
                  </div>
                  <div>
                    <p className="text-lg font-bold text-white">{parentName} (Full Screen View)</p>
                    <p className="text-xs text-slate-400 mt-1">
                      {remoteStream?.getAudioTracks().length ? 'Parent audio is live. Waiting for parent video...' : 'Connecting parent audio & video...'}
                    </p>
                  </div>
                </div>
              )}
            </div>
          ) : layoutMode === 'split' ? (
            /* Side-by-Side Dual View filling full screen */
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3 w-full h-full p-3 sm:p-4 pb-24">
              {/* Parent Tile */}
              <div className={`relative h-full rounded-2xl overflow-hidden bg-slate-950 border border-slate-800 shadow-2xl flex items-center justify-center ${swapped ? 'order-2' : 'order-1'}`}>
                <video
                  ref={remoteVideoRef}
                  autoPlay
                  playsInline
                  muted={isMuted}
                  className="w-full h-full object-contain sm:object-cover"
                />
                {!hasRemoteVideo && (
                  <div className="absolute inset-0 z-10 flex flex-col items-center justify-center bg-slate-900 text-slate-400 p-4 text-center space-y-2">
                    <User className="w-10 h-10 text-emerald-400" />
                    <p className="text-sm font-bold text-white">{parentName}</p>
                  </div>
                )}
                {/* Tile Badge */}
                <div className="absolute top-3 left-3 z-10 px-3 py-1 rounded-full bg-black/70 backdrop-blur-md border border-white/10 text-white text-xs font-semibold flex items-center space-x-1.5 shadow-lg">
                  {isParentScreenSharing ? (
                    <span className="text-cyan-300 font-bold flex items-center space-x-1.5">
                      <Monitor className="w-3.5 h-3.5 text-cyan-400" />
                      <span>Parent Screen</span>
                    </span>
                  ) : (
                    <span>{parentName} (Parent)</span>
                  )}
                </div>
                <div className="absolute bottom-3 left-3 z-10 flex items-center space-x-1.5 px-2.5 py-1 rounded-lg bg-black/70 backdrop-blur-md border border-white/10 text-xs">
                  {hasRemoteAudio ? <Mic className="w-3.5 h-3.5 text-emerald-400" /> : <MicOff className="w-3.5 h-3.5 text-slate-500" />}
                  <span className="text-[11px] text-slate-300">Parent Mic</span>
                </div>
              </div>

              {/* Student Self-View Tile */}
              <div className={`relative h-full rounded-2xl overflow-hidden bg-slate-950 border border-slate-800 shadow-2xl flex items-center justify-center ${swapped ? 'order-1' : 'order-2'}`}>
                <video
                  ref={localVideoRef}
                  autoPlay
                  playsInline
                  muted={true}
                  className={`w-full h-full object-contain sm:object-cover ${isChildScreenSharing ? '' : 'transform -scale-x-100'}`}
                />
                {!localCamEnabled && !isChildScreenSharing && (
                  <div className="absolute inset-0 flex flex-col items-center justify-center bg-slate-900 text-slate-400 p-4 text-center">
                    <User className="w-10 h-10 text-slate-400 mb-1" />
                    <p className="text-sm font-bold text-white">Your Camera is Off</p>
                  </div>
                )}
                <div className="absolute top-3 left-3 z-10 px-3 py-1 rounded-full bg-black/70 backdrop-blur-md border border-white/10 text-white text-xs font-semibold flex items-center space-x-1.5 shadow-lg">
                  <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                  <span>Student (You)</span>
                </div>
                <div className="absolute bottom-3 left-3 z-10 flex items-center space-x-1.5 px-2.5 py-1 rounded-lg bg-black/70 backdrop-blur-md border border-white/10 text-xs">
                  {localMicEnabled ? <Mic className="w-3.5 h-3.5 text-emerald-400" /> : <MicOff className="w-3.5 h-3.5 text-slate-500" />}
                  <span className="text-[11px] text-slate-300">Your Mic</span>
                </div>
              </div>
            </div>
          ) : (
            /* PiP View in Full Screen: Full Remote Video with Floating Local PiP */
            <div className="w-full h-full relative flex items-center justify-center bg-black">
              <video
                ref={!swapped ? remoteVideoRef : localVideoRef}
                autoPlay
                playsInline
                muted={!swapped ? isMuted : true}
                className={`w-full h-full ${!swapped ? 'object-contain sm:object-cover' : (isChildScreenSharing ? 'object-contain sm:object-cover' : 'object-contain sm:object-cover transform -scale-x-100')}`}
              />
              {!swapped && !hasRemoteVideo && (
                <div className="absolute inset-0 z-10 flex flex-col items-center justify-center bg-slate-950 text-slate-400 p-6 text-center space-y-3">
                  <User className="w-16 h-16 text-emerald-400" />
                  <p className="text-lg font-bold text-white">{parentName}</p>
                </div>
              )}
              {/* Floating PiP Card (Offset safely below top-right M button) */}
              <div className="absolute top-20 right-4 sm:top-24 sm:right-6 z-20 w-48 sm:w-64 aspect-video bg-black rounded-2xl overflow-hidden border-2 border-white/20 shadow-2xl group">
                <video
                  ref={!swapped ? localVideoRef : remoteVideoRef}
                  autoPlay
                  playsInline
                  muted={!swapped ? true : isMuted}
                  className={`w-full h-full object-cover ${!swapped && !isChildScreenSharing ? 'transform -scale-x-100' : ''}`}
                />
                {!swapped && !localCamEnabled && !isChildScreenSharing && (
                  <div className="w-full h-full flex flex-col items-center justify-center bg-slate-900 text-slate-400 text-xs p-2 text-center">
                    <User className="w-6 h-6 text-slate-500 mb-1" />
                    <span>Cam Off</span>
                  </div>
                )}
                {/* Floating controls in PiP */}
                <div className="absolute bottom-1.5 right-1.5 flex items-center space-x-1">
                  {!swapped && (
                    <>
                      <button
                        onClick={toggleLocalMic}
                        title={localMicEnabled ? 'Mute mic' : 'Unmute mic'}
                        className={`p-1 rounded-md text-[10px] transition-colors cursor-pointer ${
                          localMicEnabled ? 'bg-black/70 hover:bg-black text-emerald-400' : 'bg-red-600 hover:bg-red-500 text-white'
                        }`}
                      >
                        {localMicEnabled ? <Mic className="w-3 h-3" /> : <MicOff className="w-3 h-3" />}
                      </button>
                      <button
                        onClick={toggleLocalCam}
                        title={localCamEnabled ? 'Turn off camera' : 'Turn on camera'}
                        className={`p-1 rounded-md text-[10px] transition-colors cursor-pointer ${
                          localCamEnabled ? 'bg-black/70 hover:bg-black text-emerald-400' : 'bg-red-600 hover:bg-red-500 text-white'
                        }`}
                      >
                        {localCamEnabled ? <Video className="w-3 h-3" /> : <VideoOff className="w-3 h-3" />}
                      </button>
                    </>
                  )}
                  <button
                    onClick={() => setSwapped(!swapped)}
                    title="Swap video positions"
                    className="p-1 rounded-md bg-black/70 hover:bg-black text-white text-[10px] cursor-pointer"
                  >
                    <ArrowLeftRight className="w-3 h-3" />
                  </button>
                </div>
                <div className="absolute bottom-1.5 left-2 text-[10px] font-semibold text-slate-300 drop-shadow flex items-center space-x-1">
                  <span>{!swapped ? 'You' : parentName}</span>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Floating Bottom Toolbar in Fullscreen */}
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-[80] flex items-center space-x-2 sm:space-x-2.5 bg-slate-950/90 backdrop-blur-2xl border border-slate-700/80 px-4 sm:px-5 py-2.5 sm:py-3 rounded-2xl shadow-2xl animate-fadeIn">
          {/* In-Call Chat */}
          <button
            onClick={() => setIsChatOpen(!isChatOpen)}
            className={`relative flex items-center space-x-1.5 px-3 py-2 rounded-xl text-xs font-bold border transition-all cursor-pointer ${
              isChatOpen ? 'bg-emerald-600 text-white border-emerald-500 shadow-lg shadow-emerald-950/50' : 'bg-slate-800 hover:bg-slate-700 text-slate-200 border-slate-700'
            }`}
          >
            <MessageSquare className="w-4 h-4 text-emerald-400" />
            <span>Chat</span>
            {unreadChatCount > 0 && (
              <span className="px-1.5 py-0.2 rounded-full bg-emerald-400 text-black text-[10px] font-black animate-pulse">
                {unreadChatCount}
              </span>
            )}
          </button>

          {/* Student Mic Toggle */}
          <button
            onClick={toggleLocalMic}
            className={`p-2 rounded-xl text-xs font-semibold transition-colors cursor-pointer border ${
              localMicEnabled ? 'bg-slate-800 hover:bg-slate-700 text-emerald-400 border-slate-700' : 'bg-red-600 hover:bg-red-500 text-white border-red-500'
            }`}
            title={localMicEnabled ? 'Mute your microphone' : 'Unmute your microphone'}
          >
            {localMicEnabled ? <Mic className="w-4 h-4" /> : <MicOff className="w-4 h-4" />}
          </button>

          {/* Student Cam Toggle */}
          <button
            onClick={toggleLocalCam}
            className={`p-2 rounded-xl text-xs font-semibold transition-colors cursor-pointer border ${
              localCamEnabled ? 'bg-slate-800 hover:bg-slate-700 text-emerald-400 border-slate-700' : 'bg-red-600 hover:bg-red-500 text-white border-red-500'
            }`}
            title={localCamEnabled ? 'Turn off camera' : 'Turn on camera'}
          >
            {localCamEnabled ? <Video className="w-4 h-4" /> : <VideoOff className="w-4 h-4" />}
          </button>

          {/* Parent Audio Toggle */}
          <button
            onClick={() => setIsMuted(!isMuted)}
            className="p-2 rounded-xl bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-200 text-xs font-semibold transition-colors cursor-pointer"
            title={isMuted ? 'Unmute parent audio' : 'Mute parent audio'}
          >
            {isMuted ? <VolumeX className="w-4 h-4 text-red-400" /> : <Volume2 className="w-4 h-4 text-emerald-400" />}
          </button>

          {/* Screen Mirror Toggle */}
          <button
            onClick={toggleChildScreenMirror}
            className={`p-2 rounded-xl text-xs font-semibold border transition-all cursor-pointer ${
              isChildScreenSharing ? 'bg-cyan-600 text-white border-cyan-400 animate-pulse' : 'bg-slate-800 hover:bg-slate-700 text-slate-200 border-slate-700'
            }`}
            title={isChildScreenSharing ? 'Stop Screen Mirror' : 'Mirror Screen to Parent'}
          >
            {isChildScreenSharing ? <ScreenShareOff className="w-4 h-4" /> : <ScreenShare className="w-4 h-4 text-cyan-400" />}
          </button>

          {/* Layout Mode Selector (Split / PiP / Full) */}
          <div className="flex items-center rounded-xl bg-slate-800/80 p-0.5 border border-slate-700">
            <button
              onClick={() => setLayoutMode('split')}
              className={`p-1.5 rounded-lg text-xs font-semibold transition-colors cursor-pointer ${
                layoutMode === 'split' ? 'bg-emerald-600 text-white' : 'text-slate-400 hover:text-white'
              }`}
              title="Split View"
            >
              <Columns className="w-4 h-4" />
            </button>
            <button
              onClick={() => setLayoutMode('pip')}
              className={`p-1.5 rounded-lg text-xs font-semibold transition-colors cursor-pointer ${
                layoutMode === 'pip' ? 'bg-emerald-600 text-white' : 'text-slate-400 hover:text-white'
              }`}
              title="PiP View"
            >
              <LayoutGrid className="w-4 h-4" />
            </button>
            <button
              onClick={() => setLayoutMode('parent-full')}
              className={`flex items-center space-x-1 px-2 py-1 rounded-lg text-xs font-semibold transition-colors cursor-pointer ${
                layoutMode === 'parent-full' ? 'bg-emerald-600 text-white' : 'text-slate-400 hover:text-white'
              }`}
              title="Parent Full View"
            >
              <Tv className="w-4 h-4 text-emerald-300" />
              <span className="text-[10px] hidden sm:inline">Full</span>
            </button>
          </div>

          {/* Swap Video */}
          <button
            onClick={() => setSwapped(!swapped)}
            className="p-2 rounded-xl bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-200 text-xs font-semibold transition-colors cursor-pointer"
            title="Swap video positions"
          >
            <ArrowLeftRight className="w-4 h-4 text-slate-300" />
          </button>

          {/* Local Record Button in Fullscreen */}
          {!isRecording ? (
            <button
              onClick={startRecording}
              className="p-2 rounded-xl bg-red-600/90 hover:bg-red-500 text-white text-xs font-semibold transition-colors cursor-pointer"
              title="Record locally"
            >
              <CircleDot className="w-4 h-4" />
            </button>
          ) : (
            <button
              onClick={stopRecording}
              className="p-2 rounded-xl bg-red-950 border border-red-500 text-red-400 hover:bg-red-900/60 text-xs font-semibold transition-colors animate-pulse cursor-pointer"
              title="Stop Recording"
            >
              <Square className="w-3 h-3 fill-current" />
            </button>
          )}

          {/* Exit Fullscreen Button */}
          <button
            onClick={toggleFullscreen}
            className="p-2 rounded-xl bg-slate-800 hover:bg-slate-700 border border-slate-700 text-amber-400 text-xs font-semibold transition-colors cursor-pointer"
            title="Exit Fullscreen"
          >
            <Minimize className="w-4 h-4" />
          </button>

          {/* End Call Button */}
          <button
            onClick={onStopMonitoring}
            className="p-2 rounded-xl bg-red-600 hover:bg-red-500 text-white text-xs font-bold transition-all shadow-md cursor-pointer"
            title="End Call"
          >
            <Square className="w-4 h-4" />
          </button>
        </div>

        {/* In-Call Chat Drawer (Positioned above floating toolbar at bottom-left) */}
        {sessionId && (
          <InCallChat
            sessionId={sessionId}
            role="child"
            peerName={parentName}
            isOpen={isChatOpen}
            onClose={() => setIsChatOpen(false)}
            onUnreadCountChange={(count) => setUnreadChatCount(count)}
            className="bottom-24 left-4 sm:left-6 w-80 sm:w-96 max-w-[calc(100vw-2rem)] z-[85]"
          />
        )}
      </div>
    );
  }

  // =========================================================================
  // STANDARD DASHBOARD VIEW (When isFullscreen is false)
  // =========================================================================
  return (
    <div
      ref={containerRef}
      className="min-h-screen text-slate-100 relative select-none bg-slate-950 p-4 sm:p-6 lg:p-8 space-y-6"
    >
      {/* 1. TOP DEVICE / SESSION BAR */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 sm:p-6 flex flex-col md:flex-row md:items-center justify-between gap-4 shadow-xl">
        <div className="flex items-center space-x-4">
          <div className="w-12 h-12 rounded-xl bg-slate-800 border border-slate-700 flex items-center justify-center text-slate-300 flex-shrink-0">
            <Radio className="w-6 h-6 text-emerald-400" />
          </div>
          <div>
            <div className="flex items-center space-x-2">
              <h3 className="text-lg font-bold text-white tracking-tight">{parentName}</h3>
              <span className="inline-flex items-center space-x-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                <span>2-Way Call Active</span>
              </span>
            </div>
            <p className="text-xs text-slate-400 mt-1">
              Session: <span className="font-mono">{sessionId ? sessionId.slice(0, 18) + '...' : 'Live Connected'}</span>
            </p>
          </div>
        </div>

        {/* Action Controls */}
        <div className="flex flex-wrap items-center gap-2">
          {/* Screen Mirroring Button */}
          <button
            onClick={toggleChildScreenMirror}
            className={`flex items-center space-x-1.5 px-3 py-2 rounded-xl text-xs font-semibold border transition-all cursor-pointer ${
              isChildScreenSharing
                ? 'bg-cyan-600 hover:bg-cyan-500 border-cyan-400 text-white shadow-lg shadow-cyan-950/50 animate-pulse'
                : 'bg-slate-800 hover:bg-slate-700 text-slate-200 border-slate-700'
            }`}
            title={isChildScreenSharing ? 'Stop mirroring your screen' : 'Mirror your screen to parent'}
          >
            {isChildScreenSharing ? (
              <>
                <ScreenShareOff className="w-3.5 h-3.5 text-white" />
                <span>Stop Mirror</span>
              </>
            ) : (
              <>
                <ScreenShare className="w-3.5 h-3.5 text-cyan-400" />
                <span>Mirror Screen</span>
              </>
            )}
          </button>

          {/* In-Call Chat Button */}
          <button
            onClick={() => setIsChatOpen(!isChatOpen)}
            className={`relative flex items-center space-x-1.5 px-3 py-2 rounded-xl text-xs font-semibold border transition-all cursor-pointer ${
              isChatOpen
                ? 'bg-emerald-600 text-white border-emerald-500 shadow-lg shadow-emerald-950/50'
                : 'bg-slate-800 hover:bg-slate-700 text-slate-200 border-slate-700'
            }`}
            title="Open in-call chat"
          >
            <MessageSquare className="w-3.5 h-3.5 text-emerald-400" />
            <span>Chat</span>
            {unreadChatCount > 0 && (
              <span className="absolute -top-1.5 -right-1.5 px-1.5 py-0.5 rounded-full bg-emerald-400 text-black text-[10px] font-black animate-bounce shadow">
                {unreadChatCount}
              </span>
            )}
          </button>

          {/* Audio Mute/Unmute Parent */}
          <button
            onClick={() => setIsMuted(!isMuted)}
            className="flex items-center space-x-1.5 px-3 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-200 text-xs font-semibold transition-colors cursor-pointer"
            title={isMuted ? 'Unmute parent audio' : 'Mute parent audio'}
          >
            {isMuted ? <VolumeX className="w-3.5 h-3.5 text-red-400" /> : <Volume2 className="w-3.5 h-3.5 text-emerald-400" />}
            <span className="hidden sm:inline">{isMuted ? 'Unmute' : 'Audio'}</span>
          </button>

          {/* Layout Mode Selector (Split 50/50 vs PiP View vs Parent Full View) */}
          <div className="flex items-center rounded-xl bg-slate-800 p-1 border border-slate-700">
            <button
              onClick={() => setLayoutMode('split')}
              className={`flex items-center space-x-1.5 px-2.5 py-1.5 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
                layoutMode === 'split' ? 'bg-emerald-600 text-white shadow-sm' : 'text-slate-400 hover:text-white'
              }`}
              title="Split 50/50 Dual View"
            >
              <Columns className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Split</span>
            </button>
            <button
              onClick={() => setLayoutMode('pip')}
              className={`flex items-center space-x-1.5 px-2.5 py-1.5 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
                layoutMode === 'pip' ? 'bg-emerald-600 text-white shadow-sm' : 'text-slate-400 hover:text-white'
              }`}
              title="Picture-in-Picture View"
            >
              <LayoutGrid className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">PiP</span>
            </button>
            <button
              onClick={() => setLayoutMode('parent-full')}
              className={`flex items-center space-x-1.5 px-2.5 py-1.5 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
                layoutMode === 'parent-full' ? 'bg-emerald-600 text-white shadow-sm' : 'text-slate-400 hover:text-white'
              }`}
              title="Parent Full View"
            >
              <Tv className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Full</span>
            </button>
          </div>

          {/* Swap Button */}
          <button
            onClick={() => setSwapped(!swapped)}
            className="flex items-center space-x-1.5 px-3 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold border border-slate-700 transition-colors cursor-pointer"
            title="Swap video positions"
          >
            <ArrowLeftRight className="w-3.5 h-3.5 text-slate-300" />
            <span className="hidden sm:inline">Swap</span>
          </button>

          {/* Local Recording Button */}
          {!isRecording ? (
            <button
              onClick={startRecording}
              className="flex items-center space-x-2 px-3.5 py-2 rounded-xl bg-red-600/90 hover:bg-red-500 text-white text-xs font-semibold shadow-md transition-colors cursor-pointer"
              title="Record call locally to device"
            >
              <CircleDot className="w-3.5 h-3.5 text-white" />
              <span>Record</span>
            </button>
          ) : (
            <button
              onClick={stopRecording}
              className="flex items-center space-x-2 px-3.5 py-2 rounded-xl bg-red-950 border border-red-500 text-red-400 hover:bg-red-900/60 text-xs font-semibold transition-colors animate-pulse cursor-pointer"
              title="Stop Recording"
            >
              <Square className="w-3 h-3 fill-current" />
              <span>Stop ({formatDuration(recordDuration)})</span>
            </button>
          )}

          {/* Fullscreen Button */}
          <button
            onClick={toggleFullscreen}
            className="flex items-center space-x-1.5 px-3 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold border border-slate-700 transition-colors cursor-pointer"
            title="Full Screen Layout"
          >
            <Maximize className="w-3.5 h-3.5 text-emerald-400" />
            <span className="hidden sm:inline">Full Screen</span>
          </button>

          {/* End Call Button */}
          <button
            onClick={onStopMonitoring}
            className="flex items-center space-x-1.5 px-3.5 py-2 rounded-xl bg-red-600 hover:bg-red-500 text-white text-xs font-bold transition-all shadow-md cursor-pointer"
          >
            <Square className="w-3.5 h-3.5" />
            <span>End Call</span>
          </button>
        </div>
      </div>

      {/* Screen Mirror Request Banner */}
      {screenRequestNotice && !isChildScreenSharing && (
        <div className="p-3.5 bg-cyan-950/90 border border-cyan-500/50 rounded-2xl flex items-center justify-between gap-3 shadow-2xl backdrop-blur-md animate-fadeIn">
          <div className="flex items-center space-x-2.5 text-xs text-cyan-200">
            <Monitor className="w-4 h-4 text-cyan-400 animate-pulse flex-shrink-0" />
            <span>{screenRequestNotice}</span>
          </div>
          <div className="flex items-center space-x-2">
            <button
              onClick={startChildScreenMirror}
              className="px-3 py-1.5 rounded-xl bg-cyan-600 hover:bg-cyan-500 text-white font-bold text-xs shadow-lg cursor-pointer"
            >
              Share Screen
            </button>
            <button
              onClick={() => setScreenRequestNotice(null)}
              className="p-1 rounded-lg text-slate-400 hover:text-white"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}

      {/* Storage Warning or Record Error */}
      {storageWarning && (
        <div className="p-4 rounded-xl bg-amber-500/10 border border-amber-500/20 flex items-center space-x-3 text-sm text-amber-300">
          <AlertCircle className="w-5 h-5 text-amber-400 flex-shrink-0" />
          <span>{storageWarning}</span>
        </div>
      )}

      {recordError && (
        <div className="p-4 rounded-xl bg-red-500/10 border border-red-500/20 text-sm text-red-400">
          {recordError}
        </div>
      )}

      {/* 2. MAIN VIDEO & MONITORING SCREEN */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 sm:p-6 shadow-2xl space-y-6">
        {/* Stream State Bar */}
        <div className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-800/80 pb-4">
          <div className="flex items-center space-x-4">
            {/* Parent Cam Status */}
            <div className="flex items-center space-x-1.5 text-xs font-medium">
              {hasRemoteVideo ? (
                <>
                  <Video className="w-4 h-4 text-emerald-400" />
                  <span className="text-emerald-400">Parent Cam: ON</span>
                </>
              ) : (
                <>
                  <VideoOff className="w-4 h-4 text-slate-500" />
                  <span className="text-slate-500">Parent Cam: OFF</span>
                </>
              )}
            </div>

            {/* Parent Mic Status */}
            <div className="flex items-center space-x-1.5 text-xs font-medium">
              {hasRemoteAudio ? (
                <>
                  <Mic className="w-4 h-4 text-emerald-400" />
                  <span className="text-emerald-400">Parent Mic: ON</span>
                </>
              ) : (
                <>
                  <MicOff className="w-4 h-4 text-slate-500" />
                  <span className="text-slate-500">Parent Mic: OFF</span>
                </>
              )}
            </div>

            {/* WebRTC State */}
            <div className="flex items-center space-x-1.5 text-xs font-medium text-slate-400">
              <Wifi className="w-4 h-4 text-blue-400" />
              <span>2-Way Call: </span>
              <span className={`font-mono uppercase font-semibold ${
                connectionState === 'connected' ? 'text-emerald-400' : 'text-slate-400'
              }`}>
                {connectionState}
              </span>
            </div>
          </div>

          <div className="flex items-center space-x-4">
            {/* Live Audio Visualizer */}
            <AudioVisualizer stream={remoteStream} isActive={hasRemoteAudio} />

            {/* Session Duration Counter Clock */}
            <div className="flex items-center space-x-1.5 px-3 py-1.5 rounded-lg bg-slate-800 text-xs font-mono font-bold text-white border border-slate-700">
              <Clock className="w-3.5 h-3.5 text-emerald-400" />
              <span>{formatDuration(elapsedSeconds)}</span>
            </div>
          </div>
        </div>

        {/* Video Canvas Container */}
        {layoutMode === 'parent-full' ? (
          /* PARENT FULL VIEW */
          <div className="relative w-full aspect-video md:aspect-[16/9] min-h-[400px] max-h-[720px] rounded-2xl overflow-hidden bg-slate-950 border-2 border-emerald-500/40 shadow-2xl flex items-center justify-center group">
            <video
              ref={remoteVideoRef}
              autoPlay
              playsInline
              muted={isMuted}
              onDoubleClick={toggleFullscreen}
              className="w-full h-full object-cover"
            />

            {!hasRemoteVideo && (
              <div className="absolute inset-0 z-10 flex flex-col items-center justify-center bg-gradient-to-b from-slate-900 to-slate-950 text-slate-400 p-6 text-center space-y-3">
                <div className="w-20 h-20 rounded-full bg-slate-800 border-2 border-slate-700 flex items-center justify-center text-slate-300">
                  <User className="w-10 h-10 text-emerald-400" />
                </div>
                <div>
                  <p className="text-lg font-bold text-white">{parentName} (Full View)</p>
                  <p className="text-xs text-slate-400 mt-1">
                    {remoteStream?.getAudioTracks().length ? 'Parent audio is live. Waiting for parent video feed...' : 'Connecting parent audio & video...'}
                  </p>
                </div>
              </div>
            )}

            {/* Top-Left Badge */}
            <div className="absolute top-4 left-4 z-20 px-3.5 py-1.5 rounded-full bg-black/70 backdrop-blur-md border border-white/10 text-white text-xs font-semibold flex items-center space-x-2 shadow-lg">
              <span className="w-2.5 h-2.5 rounded-full bg-emerald-400 animate-pulse" />
              {isParentScreenSharing ? (
                <div className="flex items-center space-x-1.5 text-cyan-300 font-bold">
                  <Monitor className="w-3.5 h-3.5 text-cyan-400 animate-pulse" />
                  <span>Parent Screen (Shared Full View)</span>
                </div>
              ) : (
                <div className="flex items-center space-x-1.5">
                  <Tv className="w-3.5 h-3.5 text-emerald-400" />
                  <span>{parentName} (Full View)</span>
                </div>
              )}
            </div>

            {/* Quick Controls overlay on Parent Full View */}
            <div className="absolute bottom-4 right-4 z-20 flex items-center space-x-2 bg-black/75 backdrop-blur-md p-2 rounded-2xl border border-white/10 shadow-lg">
              {/* Parent Audio Mute/Unmute */}
              <button
                onClick={() => setIsMuted(!isMuted)}
                className="p-2 rounded-xl text-slate-200 hover:text-white hover:bg-white/10 transition-colors cursor-pointer"
                title={isMuted ? 'Unmute parent audio' : 'Mute parent audio'}
              >
                {isMuted ? <VolumeX className="w-4 h-4 text-red-400" /> : <Volume2 className="w-4 h-4 text-emerald-400" />}
              </button>

              {/* Student Local Mic Toggle */}
              <button
                onClick={toggleLocalMic}
                className={`p-2 rounded-xl text-xs font-semibold transition-colors cursor-pointer border ${
                  localMicEnabled ? 'bg-slate-800 hover:bg-slate-700 text-emerald-400 border-slate-700' : 'bg-red-600 hover:bg-red-500 text-white border-red-500'
                }`}
                title={localMicEnabled ? 'Mute your microphone' : 'Unmute your microphone'}
              >
                {localMicEnabled ? <Mic className="w-4 h-4" /> : <MicOff className="w-4 h-4" />}
              </button>

              {/* Student Local Cam Toggle */}
              <button
                onClick={toggleLocalCam}
                className={`p-2 rounded-xl text-xs font-semibold transition-colors cursor-pointer border ${
                  localCamEnabled ? 'bg-slate-800 hover:bg-slate-700 text-emerald-400 border-slate-700' : 'bg-red-600 hover:bg-red-500 text-white border-red-500'
                }`}
                title={localCamEnabled ? 'Turn off camera' : 'Turn on camera'}
              >
                {localCamEnabled ? <Video className="w-4 h-4" /> : <VideoOff className="w-4 h-4" />}
              </button>

              {/* Switch back to Split View */}
              <button
                onClick={() => setLayoutMode('split')}
                className="p-2 rounded-xl bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-200 text-xs font-semibold transition-colors cursor-pointer"
                title="Switch to Split View"
              >
                <Columns className="w-4 h-4 text-emerald-400" />
              </button>

              {/* Expand to Browser Fullscreen */}
              <button
                onClick={toggleFullscreen}
                className="p-2 rounded-xl bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-200 text-xs font-semibold transition-colors cursor-pointer"
                title="Expand to Full Screen"
              >
                <Maximize className="w-4 h-4 text-emerald-400" />
              </button>
            </div>
          </div>
        ) : layoutMode === 'split' ? (
          /* Side-by-Side Dual View (Split 50/50) */
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 w-full aspect-video md:aspect-[16/9] min-h-[380px] max-h-[640px]">
            {/* Parent Video Tile */}
            <div className={`relative rounded-2xl overflow-hidden bg-slate-950 border-2 border-slate-800 shadow-2xl flex items-center justify-center ${swapped ? 'order-2' : 'order-1'}`}>
              <video
                ref={remoteVideoRef}
                autoPlay
                playsInline
                muted={isMuted}
                onDoubleClick={toggleFullscreen}
                className="w-full h-full object-cover"
              />
              {!hasRemoteVideo && (
                <div className="absolute inset-0 z-10 flex flex-col items-center justify-center bg-gradient-to-b from-slate-900 to-slate-950 text-slate-400 p-6 text-center space-y-3">
                  <div className="w-16 h-16 rounded-full bg-slate-800 border border-slate-700 flex items-center justify-center text-slate-300">
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
              <div className="absolute top-3 left-3 z-10 px-3 py-1 rounded-full bg-black/70 backdrop-blur-md border border-white/10 text-white text-xs font-semibold flex items-center space-x-1.5 shadow-lg">
                {isParentScreenSharing ? (
                  <div className="flex items-center space-x-1.5 text-cyan-300 font-bold">
                    <Monitor className="w-3.5 h-3.5 text-cyan-400" />
                    <span>Parent Screen (Shared)</span>
                  </div>
                ) : (
                  <>
                    <User className="w-3.5 h-3.5 text-blue-400" />
                    <span>{parentName}</span>
                  </>
                )}
              </div>

              {/* Parent Mic Status Indicator */}
              <div className="absolute bottom-3 left-3 z-10 flex items-center space-x-1.5 px-2.5 py-1 rounded-lg bg-black/70 backdrop-blur-md border border-white/10 text-xs">
                {hasRemoteAudio ? (
                  <Mic className="w-3.5 h-3.5 text-emerald-400" />
                ) : (
                  <MicOff className="w-3.5 h-3.5 text-slate-500" />
                )}
                <span className="text-[11px] text-slate-300 font-medium">Parent Mic</span>
              </div>

              {/* Parent Audio & Full View Quick Controls */}
              <div className="absolute bottom-3 right-3 z-10 flex items-center space-x-1.5 bg-black/75 backdrop-blur-md p-1.5 rounded-xl border border-white/10 shadow-lg">
                <button
                  onClick={() => setLayoutMode('parent-full')}
                  className="flex items-center space-x-1 px-2.5 py-1 rounded-lg bg-emerald-600/30 hover:bg-emerald-600/50 text-emerald-300 border border-emerald-500/30 text-xs font-semibold transition-colors cursor-pointer"
                  title="Switch to Full View of Parent"
                >
                  <Tv className="w-3.5 h-3.5 text-emerald-400" />
                  <span>Full View</span>
                </button>
                <button
                  onClick={() => setIsMuted(!isMuted)}
                  className="p-1.5 rounded-lg text-slate-200 hover:text-white"
                  title={isMuted ? 'Unmute parent audio' : 'Mute parent audio'}
                >
                  {isMuted ? <VolumeX className="w-3.5 h-3.5 text-red-400" /> : <Volume2 className="w-3.5 h-3.5 text-emerald-400" />}
                </button>
                <button
                  onClick={toggleFullscreen}
                  className="p-1.5 rounded-lg text-slate-200 hover:text-white"
                  title="Expand to Full Screen"
                >
                  <Maximize className="w-3.5 h-3.5 text-emerald-400" />
                </button>
              </div>
            </div>

            {/* Student Self-View Tile */}
            <div className={`relative rounded-2xl overflow-hidden bg-slate-950 border-2 border-slate-800 shadow-2xl flex items-center justify-center ${swapped ? 'order-1' : 'order-2'}`}>
              <video
                ref={localVideoRef}
                autoPlay
                playsInline
                muted={true}
                className={`w-full h-full object-cover ${isChildScreenSharing ? '' : 'transform -scale-x-100'}`}
              />
              {!localCamEnabled && !isChildScreenSharing && (
                <div className="absolute inset-0 flex flex-col items-center justify-center bg-slate-900 text-slate-400 p-6 text-center">
                  <div className="w-16 h-16 rounded-full bg-slate-800 border border-slate-700 flex items-center justify-center mb-2">
                    <User className="w-8 h-8 text-slate-400" />
                  </div>
                  <p className="text-sm font-bold text-white">Your Camera is Off</p>
                  <p className="text-xs text-slate-400 mt-1">Click the camera icon below to turn on video</p>
                </div>
              )}
              {/* Overlay Badge */}
              <div className="absolute top-3 left-3 z-10 px-3 py-1 rounded-full bg-black/70 backdrop-blur-md border border-white/10 text-white text-xs font-semibold flex items-center space-x-1.5 shadow-lg">
                {isChildScreenSharing ? (
                  <div className="flex items-center space-x-1.5 text-cyan-300 font-bold">
                    <Monitor className="w-3.5 h-3.5 text-cyan-400 animate-pulse" />
                    <span>Sharing Your Screen</span>
                  </div>
                ) : (
                  <>
                    <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                    <span>Student (You)</span>
                  </>
                )}
              </div>

              {/* Student Mic Status Indicator */}
              <div className="absolute bottom-3 left-3 z-10 flex items-center space-x-1.5 px-2.5 py-1 rounded-lg bg-black/70 backdrop-blur-md border border-white/10 text-xs">
                {localMicEnabled ? (
                  <Mic className="w-3.5 h-3.5 text-emerald-400" />
                ) : (
                  <MicOff className="w-3.5 h-3.5 text-slate-500" />
                )}
                <span className="text-[11px] text-slate-300 font-medium">Your Mic</span>
              </div>

              {/* Student Quick Cam & Mic Controls */}
              <div className="absolute bottom-3 right-3 z-10 flex items-center space-x-1.5 bg-black/75 backdrop-blur-md p-1.5 rounded-xl border border-white/10 shadow-lg">
                <button
                  onClick={toggleLocalMic}
                  title={localMicEnabled ? 'Mute your microphone' : 'Unmute your microphone'}
                  className={`p-2 rounded-lg text-xs font-semibold transition-colors cursor-pointer ${
                    localMicEnabled ? 'bg-slate-800 hover:bg-slate-700 text-emerald-400' : 'bg-red-600 hover:bg-red-500 text-white'
                  }`}
                >
                  {localMicEnabled ? <Mic className="w-4 h-4" /> : <MicOff className="w-4 h-4" />}
                </button>
                <button
                  onClick={toggleLocalCam}
                  title={localCamEnabled ? 'Turn off your camera' : 'Turn on your camera'}
                  className={`p-2 rounded-lg text-xs font-semibold transition-colors cursor-pointer ${
                    localCamEnabled ? 'bg-slate-800 hover:bg-slate-700 text-emerald-400' : 'bg-red-600 hover:bg-red-500 text-white'
                  }`}
                >
                  {localCamEnabled ? <Video className="w-4 h-4" /> : <VideoOff className="w-4 h-4" />}
                </button>
              </div>
            </div>
          </div>
        ) : (
          /* PiP Mode: Full primary video with floating secondary card */
          <div className="relative w-full aspect-video max-h-[640px] rounded-2xl overflow-hidden bg-slate-950 border border-slate-800 shadow-2xl">
            {/* Main Primary Video */}
            <div className="w-full h-full relative group">
              <video
                ref={!swapped ? remoteVideoRef : localVideoRef}
                autoPlay
                playsInline
                muted={!swapped ? isMuted : true}
                onDoubleClick={toggleFullscreen}
                className={`w-full h-full ${
                  !swapped ? 'object-cover' : (isChildScreenSharing ? 'object-cover' : 'object-cover transform -scale-x-100')
                }`}
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
              {/* Primary View Overlay Badge */}
              <div className="absolute top-4 left-4 z-20 px-3 py-1.5 rounded-full bg-black/70 backdrop-blur-md border border-white/10 text-white text-xs font-semibold flex items-center space-x-2 shadow-lg">
                <span className={`w-2.5 h-2.5 rounded-full ${!swapped ? 'bg-blue-400' : 'bg-emerald-400'} animate-pulse`} />
                {!swapped ? (
                  isParentScreenSharing ? (
                    <span className="text-cyan-300 font-bold flex items-center space-x-1.5">
                      <Monitor className="w-3.5 h-3.5 text-cyan-400" />
                      <span>Parent Screen (Shared)</span>
                    </span>
                  ) : (
                    <span>{parentName} (Full Screen View)</span>
                  )
                ) : (
                  isChildScreenSharing ? (
                    <span className="text-cyan-300 font-bold flex items-center space-x-1.5">
                      <Monitor className="w-3.5 h-3.5 text-cyan-400 animate-pulse" />
                      <span>Sharing Your Screen</span>
                    </span>
                  ) : (
                    <span>Student (Self-View)</span>
                  )
                )}
              </div>

              {/* Primary Video Quick Controls in PiP */}
              <div className="absolute bottom-4 right-4 z-20 flex items-center space-x-1.5 bg-black/75 backdrop-blur-md p-1.5 rounded-xl border border-white/10 shadow-lg">
                <button
                  onClick={() => setLayoutMode('parent-full')}
                  className="flex items-center space-x-1 px-2 py-1 rounded-lg bg-emerald-600/30 hover:bg-emerald-600/50 text-emerald-300 border border-emerald-500/30 text-xs font-semibold transition-colors cursor-pointer"
                  title="Switch to Parent Full View"
                >
                  <Tv className="w-3.5 h-3.5 text-emerald-400" />
                  <span>Full View</span>
                </button>
                <button
                  onClick={() => setIsMuted(!isMuted)}
                  className="p-1.5 rounded-lg text-slate-200 hover:text-white"
                  title={isMuted ? 'Unmute parent audio' : 'Mute parent audio'}
                >
                  {isMuted ? <VolumeX className="w-3.5 h-3.5 text-red-400" /> : <Volume2 className="w-3.5 h-3.5 text-emerald-400" />}
                </button>
                <button
                  onClick={toggleFullscreen}
                  className="p-1.5 rounded-lg text-slate-200 hover:text-white"
                  title="Expand to Full Screen"
                >
                  <Maximize className="w-3.5 h-3.5 text-emerald-400" />
                </button>
              </div>
            </div>

            {/* Top-Right Floating Secondary PiP Card */}
            <div className="absolute top-20 right-4 sm:top-22 sm:right-6 z-20 w-40 sm:w-56 aspect-video bg-black rounded-xl overflow-hidden border-2 border-slate-700/80 shadow-2xl group/pip">
              <video
                ref={!swapped ? localVideoRef : remoteVideoRef}
                autoPlay
                playsInline
                muted={!swapped ? true : isMuted}
                className={`w-full h-full object-cover ${!swapped && !isChildScreenSharing ? 'transform -scale-x-100' : ''}`}
              />
              {!swapped && !localCamEnabled && !isChildScreenSharing && (
                <div className="w-full h-full flex flex-col items-center justify-center bg-slate-900 text-slate-400 text-xs p-2 text-center">
                  <User className="w-6 h-6 text-slate-500 mb-1" />
                  <span>Cam Off</span>
                </div>
              )}
              {/* Floating controls in PiP */}
              <div className="absolute bottom-1 right-1 flex items-center space-x-1">
                {!swapped && (
                  <>
                    <button
                      onClick={toggleLocalMic}
                      title={localMicEnabled ? 'Mute microphone' : 'Unmute microphone'}
                      className={`p-1 rounded-md text-[10px] transition-colors cursor-pointer ${
                        localMicEnabled ? 'bg-black/70 hover:bg-black text-emerald-400' : 'bg-red-600 hover:bg-red-500 text-white'
                      }`}
                    >
                      {localMicEnabled ? <Mic className="w-3 h-3" /> : <MicOff className="w-3 h-3" />}
                    </button>
                    <button
                      onClick={toggleLocalCam}
                      title={localCamEnabled ? 'Turn off camera' : 'Turn on camera'}
                      className={`p-1 rounded-md text-[10px] transition-colors cursor-pointer ${
                        localCamEnabled ? 'bg-black/70 hover:bg-black text-emerald-400' : 'bg-red-600 hover:bg-red-500 text-white'
                      }`}
                    >
                      {localCamEnabled ? <Video className="w-3 h-3" /> : <VideoOff className="w-3 h-3" />}
                    </button>
                  </>
                )}
                <button
                  onClick={() => setSwapped(!swapped)}
                  title="Swap video positions"
                  className="p-1 rounded-md bg-black/70 hover:bg-black text-white text-[10px] cursor-pointer"
                >
                  <ArrowLeftRight className="w-3 h-3" />
                </button>
              </div>
              <div className="absolute bottom-1 left-2 text-[10px] font-semibold text-slate-300 drop-shadow flex items-center space-x-1">
                {!swapped ? (
                  isChildScreenSharing ? (
                    <span className="text-cyan-300 flex items-center space-x-1">
                      <Monitor className="w-3.5 h-3.5 text-cyan-400" />
                      <span>Your Screen</span>
                    </span>
                  ) : (
                    <span>You (Student)</span>
                  )
                ) : (
                  <span>{parentName}</span>
                )}
              </div>
            </div>
          </div>
        )}

        {/* Active Recording Pill Indicator */}
        {isRecording && (
          <div className="flex items-center justify-between p-4 rounded-xl bg-red-950/60 border border-red-500/40 text-red-200">
            <div className="flex items-center space-x-3">
              <span className="relative flex h-3 w-3">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-3 w-3 bg-red-500"></span>
              </span>
              <div>
                <p className="text-xs font-bold uppercase tracking-wider text-red-400">RECORDING IN PROGRESS</p>
                <p className="text-[11px] text-slate-300">
                  Recording locally to device IndexedDB. Never uploaded to external servers.
                </p>
              </div>
            </div>
            <span className="font-mono text-lg font-bold text-white">
              {formatDuration(recordDuration)}
            </span>
          </div>
        )}

        {/* Educational Disclosure for Student */}
        <div className="text-xs text-slate-400 flex items-start space-x-2 pt-2 border-t border-slate-800/60">
          <Sparkles className="w-4 h-4 text-emerald-400 flex-shrink-0 mt-0.5" />
          <p>
            GuardianLink 2-way call enables parent and student to see and speak with each other in real-time. You have full control and can stop the session anytime, or press <strong className="text-emerald-400">M</strong> to switch directly to ChatGPT.
          </p>
        </div>
      </div>

      {/* Floating Quick Chat Trigger Button */}
      {!isChatOpen && (
        <button
          onClick={() => setIsChatOpen(true)}
          className="fixed bottom-6 left-6 z-[60] flex items-center space-x-2 px-3.5 py-2.5 rounded-2xl bg-slate-900/90 hover:bg-slate-800 text-slate-100 backdrop-blur-md border border-slate-700/80 shadow-2xl hover:border-emerald-500/50 hover:scale-105 active:scale-95 transition-all cursor-pointer animate-fadeIn"
          title="Open In-Call Chat"
        >
          <div className="relative">
            <MessageSquare className="w-4 h-4 text-emerald-400" />
            {unreadChatCount > 0 && (
              <span className="absolute -top-1.5 -right-1.5 w-4 h-4 rounded-full bg-emerald-500 text-black text-[10px] font-black flex items-center justify-center animate-bounce shadow">
                {unreadChatCount}
              </span>
            )}
          </div>
          <span className="text-xs font-bold">Chat</span>
          {unreadChatCount > 0 && (
            <span className="text-[10px] font-semibold text-emerald-400 bg-emerald-500/10 px-1.5 py-0.5 rounded-full border border-emerald-500/20">
              {unreadChatCount} new
            </span>
          )}
        </button>
      )}

      {/* In-Call Chat Drawer */}
      {sessionId && (
        <InCallChat
          sessionId={sessionId}
          role="child"
          peerName={parentName}
          isOpen={isChatOpen}
          onClose={() => setIsChatOpen(false)}
          onUnreadCountChange={(count) => setUnreadChatCount(count)}
          className="bottom-20 left-4 sm:left-6 w-80 sm:w-96 max-w-[calc(100vw-2rem)]"
        />
      )}

      {/* The "M" Button */}
      <div className="fixed top-4 right-4 sm:top-5 sm:right-6 z-[75] flex items-center">
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
          title="Press 'M' key or click here to switch to ChatGPT instantly (< 1s)"
          aria-label="Open ChatGPT"
          className="group relative flex items-center space-x-2 px-3.5 py-2 rounded-2xl bg-gradient-to-r from-emerald-600 via-teal-500 to-cyan-500 hover:from-emerald-500 hover:to-cyan-400 text-white font-bold shadow-2xl shadow-emerald-950/80 border-2 border-emerald-300/40 hover:scale-105 active:scale-95 transition-all duration-150 cursor-pointer"
        >
          <div className="w-6 h-6 rounded-xl bg-black/30 flex items-center justify-center font-black text-sm text-emerald-200">
            M
          </div>
          <div className="flex flex-col text-left leading-tight pr-0.5">
            <span className="text-xs font-black tracking-tight text-white flex items-center space-x-1">
              <span>ChatGPT</span>
              <ExternalLink className="w-3 h-3 text-cyan-200" />
            </span>
            <span className="text-[9px] font-semibold text-emerald-100 opacity-90">Press 'M' key</span>
          </div>

          {/* Hover Tooltip Badge */}
          <div className="absolute top-12 right-0 px-3 py-1.5 rounded-xl bg-slate-900/95 border border-slate-700 text-xs font-semibold text-emerald-300 whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity shadow-2xl pointer-events-none flex items-center space-x-1.5">
            <span>Instant to ChatGPT (&lt; 1s)</span>
            <ExternalLink className="w-3.5 h-3.5 text-emerald-400" />
          </div>
        </button>
      </div>
    </div>
  );
};
