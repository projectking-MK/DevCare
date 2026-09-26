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
  ExternalLink,
  ScreenShare,
  ScreenShareOff,
  Monitor,
  MessageSquare,
  X,
  Radio,
  Clock,
  Sparkles,
  Square
} from 'lucide-react';
import { getSocket } from '../services/socket';
import { WebRtcConnection } from '../services/webrtc';
import { InCallChat } from '../components/InCallChat';
import { AudioVisualizer } from '../components/AudioVisualizer';
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
  // Default layout matching parent: 'split' for equal 50/50 dual view, toggleable to 'pip'
  const [layoutMode, setLayoutMode] = useState<'split' | 'pip'>('split');
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

  return (
    <div
      ref={containerRef}
      className={`min-h-screen text-slate-100 relative select-none transition-all duration-300 ${
        isFullscreen ? 'fixed inset-0 z-50 w-screen h-screen bg-black overflow-hidden p-3' : 'bg-slate-950 p-4 sm:p-6 lg:p-8 space-y-6'
      }`}
    >
      {/* ======================================================== */}
      {/* 1. TOP DEVICE / SESSION BAR (Matching Parent Panel)       */}
      {/* ======================================================== */}
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

        {/* Action Controls (Matching Parent Panel) */}
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

          {/* Layout Mode Button (Split 50/50 vs PiP View) */}
          <button
            onClick={() => setLayoutMode(layoutMode === 'split' ? 'pip' : 'split')}
            className="flex items-center space-x-1.5 px-3 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold border border-slate-700 transition-colors cursor-pointer"
            title={layoutMode === 'split' ? 'Switch to PiP View' : 'Switch to Side-by-Side Dual View'}
          >
            {layoutMode === 'split' ? (
              <>
                <Columns className="w-3.5 h-3.5 text-emerald-400" />
                <span>Split (50/50)</span>
              </>
            ) : (
              <>
                <LayoutGrid className="w-3.5 h-3.5 text-cyan-400" />
                <span>PiP View</span>
              </>
            )}
          </button>

          {/* Swap Button */}
          <button
            onClick={() => setSwapped(!swapped)}
            className="flex items-center space-x-1.5 px-3 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold border border-slate-700 transition-colors cursor-pointer"
            title="Swap video positions"
          >
            <ArrowLeftRight className="w-3.5 h-3.5 text-slate-300" />
            <span className="hidden sm:inline">Swap</span>
          </button>

          {/* Fullscreen Button */}
          <button
            onClick={toggleFullscreen}
            className="flex items-center space-x-1.5 px-3 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold border border-slate-700 transition-colors cursor-pointer"
            title={isFullscreen ? 'Exit Fullscreen' : 'Full Screen'}
          >
            {isFullscreen ? <Minimize className="w-3.5 h-3.5 text-amber-400" /> : <Maximize className="w-3.5 h-3.5 text-emerald-400" />}
            <span className="hidden sm:inline">{isFullscreen ? 'Exit' : 'Full'}</span>
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

      {/* ======================================================== */}
      {/* 2. MAIN VIDEO & MONITORING SCREEN (Matching Parent Panel) */}
      {/* ======================================================== */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 sm:p-6 shadow-2xl space-y-6">
        {/* Stream State Bar with Audio Visualizer & Call Duration Clock */}
        <div className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-800/80 pb-4">
          <div className="flex items-center space-x-4">
            {/* Student Cam Status */}
            <div className="flex items-center space-x-1.5 text-xs font-medium">
              {localCamEnabled && cameraActive ? (
                <>
                  <Video className="w-4 h-4 text-emerald-400" />
                  <span className="text-emerald-400">Cam: ON</span>
                </>
              ) : (
                <>
                  <VideoOff className="w-4 h-4 text-slate-500" />
                  <span className="text-slate-500">Cam: OFF</span>
                </>
              )}
            </div>

            {/* Student Mic Status */}
            <div className="flex items-center space-x-1.5 text-xs font-medium">
              {localMicEnabled && micActive ? (
                <>
                  <Mic className="w-4 h-4 text-emerald-400" />
                  <span className="text-emerald-400">Mic: ON</span>
                </>
              ) : (
                <>
                  <MicOff className="w-4 h-4 text-slate-500" />
                  <span className="text-slate-500">Mic: OFF</span>
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
            {/* Live Audio Visualizer of Remote Feed */}
            <AudioVisualizer stream={remoteStream} isActive={hasRemoteAudio} />

            {/* Session Duration Counter Clock */}
            <div className="flex items-center space-x-1.5 px-3 py-1.5 rounded-lg bg-slate-800 text-xs font-mono font-bold text-white border border-slate-700">
              <Clock className="w-3.5 h-3.5 text-emerald-400" />
              <span>{formatDuration(elapsedSeconds)}</span>
            </div>
          </div>
        </div>

        {/* Video Canvas Container (Side-by-Side Dual View or PiP Mode) */}
        {layoutMode === 'split' ? (
          /* Side-by-Side Dual View (Equal Face-to-Face Video Call) */
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 w-full aspect-video md:aspect-[16/9] min-h-[380px] max-h-[640px]">
            {/* Parent Video Tile */}
            <div className={`relative rounded-2xl overflow-hidden bg-slate-950 border-2 border-slate-800 shadow-2xl flex items-center justify-center ${swapped ? 'order-2' : 'order-1'}`}>
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
              {/* Parent Audio Controls */}
              <div className="absolute bottom-3 right-3 z-10 flex items-center space-x-1.5 bg-black/75 backdrop-blur-md p-1.5 rounded-xl border border-white/10 shadow-lg">
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
            </div>

            {/* Top-Right Floating Secondary PiP Card */}
            <div className="absolute top-4 right-4 z-20 w-40 sm:w-56 aspect-video bg-black rounded-xl overflow-hidden border-2 border-slate-700/80 shadow-2xl group/pip">
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
                      <Monitor className="w-3 h-3 text-cyan-400" />
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

        {/* Educational Disclosure for Student (Matching Parent Design) */}
        <div className="text-xs text-slate-400 flex items-start space-x-2 pt-2 border-t border-slate-800/60">
          <Sparkles className="w-4 h-4 text-emerald-400 flex-shrink-0 mt-0.5" />
          <p>
            GuardianLink 2-way call enables parent and student to see and speak with each other in real-time. You have full control and can stop the session anytime, or press <strong className="text-emerald-400">M</strong> to switch directly to ChatGPT.
          </p>
        </div>
      </div>

      {/* ======================================================== */}
      {/* 3. IN-CALL CHAT DRAWER / OVERLAY                           */}
      {/* ======================================================== */}
      {sessionId && (
        <InCallChat
          sessionId={sessionId}
          role="child"
          peerName={parentName}
          isOpen={isChatOpen}
          onClose={() => setIsChatOpen(false)}
          onUnreadCountChange={(count) => setUnreadChatCount(count)}
          className={`bottom-20 left-4 sm:left-6 w-80 sm:w-96 max-w-[calc(100vw-2rem)] ${
            isFullscreen ? 'fixed bottom-6 left-6' : ''
          }`}
        />
      )}

      {/* ======================================================== */}
      {/* 4. THE "M" BUTTON (Instant < 1 Second Redirection)        */}
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
