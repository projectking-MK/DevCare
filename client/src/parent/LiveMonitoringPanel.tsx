import React, { useState, useEffect, useRef } from 'react';
import { 
  Video, 
  VideoOff, 
  Mic, 
  MicOff, 
  Square, 
  Radio, 
  CircleDot, 
  AlertCircle,
  RefreshCw,
  Clock,
  Sparkles,
  Wifi,
  User,
  Columns,
  LayoutGrid,
  ArrowLeftRight,
  ScreenShare,
  ScreenShareOff,
  Monitor,
  MessageSquare
} from 'lucide-react';
import { InCallChat } from '../components/InCallChat';
import { getSocket } from '../services/socket';
import { WebRtcConnection, WebRtcConnectionState } from '../services/webrtc';
import { VideoPlayer } from '../components/VideoPlayer';
import { AudioVisualizer } from '../components/AudioVisualizer';
import { useMediaRecorder } from '../hooks/useMediaRecorder';
import { guardianDB } from '../services/database';
import { formatDuration } from '../utils/formatters';

interface LiveMonitoringPanelProps {
  activeDeviceId?: string;
  activeDeviceName?: string;
  isDeviceOnline?: boolean;
}

export const LiveMonitoringPanel: React.FC<LiveMonitoringPanelProps> = ({
  activeDeviceId,
  activeDeviceName = 'Child Device',
  isDeviceOnline = false,
}) => {
  const [monitoringState, setMonitoringState] = useState<'idle' | 'requesting' | 'active' | 'denied'>('idle');
  const [activeSessionId, setActiveSessionId] = useState<string>('');
  const [webrtcState, setWebrtcState] = useState<WebRtcConnectionState>('closed');
  const [remoteStream, setRemoteStream] = useState<MediaStream | null>(null);
  const [parentLocalStream, setParentLocalStream] = useState<MediaStream | null>(null);
  const [cameraActive, setCameraActive] = useState(false);
  const [micActive, setMicActive] = useState(false);
  const [parentCamEnabled, setParentCamEnabled] = useState(true);
  const [parentMicEnabled, setParentMicEnabled] = useState(true);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);

  // Layout mode for 2-way call ('split' for side-by-side equal tiles, 'pip' for picture-in-picture)
  const [layoutMode, setLayoutMode] = useState<'split' | 'pip'>('split');
  const [swapped, setSwapped] = useState(false);

  // In-call chat & screen mirror states
  const [isChatOpen, setIsChatOpen] = useState(false);
  const [unreadChatCount, setUnreadChatCount] = useState(0);
  const [isParentScreenSharing, setIsParentScreenSharing] = useState(false);
  const [isChildScreenSharing, setIsChildScreenSharing] = useState(false);

  // Request options modal/state
  const [requestCamera, setRequestCamera] = useState(true);
  const [requestMic, setRequestMic] = useState(true);
  const [showRequestConfig, setShowRequestConfig] = useState(false);

  const webrtcRef = useRef<WebRtcConnection | null>(null);
  const initConnectionPromiseRef = useRef<Promise<WebRtcConnection> | null>(null);
  const sessionStartTimeRef = useRef<number>(0);
  const sessionTimerRef = useRef<number | null>(null);
  const parentLocalStreamRef = useRef<MediaStream | null>(null);
  const parentDisplayStreamRef = useRef<MediaStream | null>(null);
  const parentMediaPromiseRef = useRef<Promise<MediaStream | null> | null>(null);
  const parentVideoRef = useRef<HTMLVideoElement>(null);

  // Ensure parent socket is authenticated on mount and on reconnect
  useEffect(() => {
    const socket = getSocket();
    const authenticate = () => {
      socket.emit('auth:parent', (res: { success: boolean }) => {
        console.log('[LiveMonitoringPanel Parent Auth]:', res);
      });
    };
    socket.on('connect', authenticate);
    if (socket.connected) {
      authenticate();
    }
    return () => {
      socket.off('connect', authenticate);
    };
  }, []);

  // MediaRecorder Hook for local storage in IndexedDB
  const {
    isRecording,
    duration: recordDuration,
    error: recordError,
    storageWarning,
    startRecording,
    stopRecording
  } = useMediaRecorder(remoteStream, activeDeviceId || '', activeDeviceName, activeSessionId);

  // Clean up timer and WebRTC on unmount
  useEffect(() => {
    return () => {
      if (sessionTimerRef.current) clearInterval(sessionTimerRef.current);
      if (parentLocalStreamRef.current) {
        parentLocalStreamRef.current.getTracks().forEach((t) => {
          try { t.stop(); } catch {}
        });
      }
      webrtcRef.current?.close();
    };
  }, []);

  // Attach parent local stream to parent video element
  useEffect(() => {
    if (parentVideoRef.current && parentLocalStream) {
      parentVideoRef.current.srcObject = parentLocalStream;
      parentVideoRef.current.play().catch(() => {});
    }
  }, [parentLocalStream, layoutMode, swapped]);

  // Acquire Parent's Camera & Mic for Two-Way Video/Audio
  const acquireParentMedia = async (): Promise<MediaStream | null> => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { width: { ideal: 1280 }, height: { ideal: 720 }, facingMode: 'user' },
        audio: { echoCancellation: true, noiseSuppression: true }
      });
      parentLocalStreamRef.current = stream;
      setParentLocalStream(stream);
      setParentCamEnabled(stream.getVideoTracks().length > 0);
      setParentMicEnabled(stream.getAudioTracks().length > 0);
      return stream;
    } catch (err1) {
      console.warn('[Parent] Video+Audio capture failed, falling back to audio only:', err1);
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: false,
          audio: { echoCancellation: true, noiseSuppression: true }
        });
        parentLocalStreamRef.current = stream;
        setParentLocalStream(stream);
        setParentCamEnabled(false);
        setParentMicEnabled(stream.getAudioTracks().length > 0);
        return stream;
      } catch (err2) {
        console.warn('[Parent] Could not acquire audio or video for parent:', err2);
        return null;
      }
    }
  };

  // Socket event listeners for signaling
  useEffect(() => {
    const socket = getSocket();

    const handleMonitoringStarted = async (data: {
      sessionId: string;
      deviceId: string;
      cameraActive: boolean;
      micActive: boolean;
    }) => {
      if (data.sessionId !== activeSessionId && activeSessionId !== '') return;

      setActiveSessionId(data.sessionId);
      setCameraActive(data.cameraActive);
      setMicActive(data.micActive);
      setMonitoringState('active');
      setStatusMessage(null);

      // Start elapsed timer
      sessionStartTimeRef.current = Date.now();
      sessionTimerRef.current = window.setInterval(() => {
        setElapsedSeconds(Math.round((Date.now() - sessionStartTimeRef.current) / 1000));
      }, 1000);

      // Initialize WebRTC receiver with 2-way streaming
      initWebRtcReceiver(data.sessionId);
    };

    const handleMonitoringDenied = (data: { sessionId: string; reason: string }) => {
      setMonitoringState('denied');
      setStatusMessage(data.reason || 'Child declined the monitoring request.');
      cleanupSession();
    };

    const handleMonitoringStopped = (data: { sessionId: string; by: string; message: string }) => {
      setStatusMessage(data.message || 'Monitoring stopped.');
      setMonitoringState('idle');
      cleanupSession(data.by);
    };

    const handleOffer = async (data: { sessionId: string; sdp: RTCSessionDescriptionInit }) => {
      console.log('[Parent] Processing incoming WebRTC offer for session:', data.sessionId);
      if (initConnectionPromiseRef.current) {
        await initConnectionPromiseRef.current;
      }
      const connection = webrtcRef.current;
      if (!connection) {
        console.warn('[Parent] WebRTC connection not ready for offer');
        return;
      }
      try {
        const answer = await connection.handleOfferAndCreateAnswer(data.sdp);
        socket.emit('webrtc:answer', {
          sessionId: data.sessionId,
          sdp: answer
        });
        console.log('[Parent] Successfully answered WebRTC offer for session:', data.sessionId);
      } catch (err) {
        console.error('[Parent] Error handling offer:', err);
      }
    };

    const handleIceCandidate = async (data: { sessionId: string; candidate: RTCIceCandidateInit }) => {
      if (initConnectionPromiseRef.current) {
        await initConnectionPromiseRef.current;
      }
      webrtcRef.current?.addIceCandidate(data.candidate);
    };

    const handleScreenStatus = (data: { sessionId: string; sender: string; isSharing: boolean }) => {
      if (data.sender === 'child') {
        setIsChildScreenSharing(Boolean(data.isSharing));
      }
    };

    socket.on('monitoring:started', handleMonitoringStarted);
    socket.on('monitoring:denied', handleMonitoringDenied);
    socket.on('monitoring:stopped', handleMonitoringStopped);
    socket.on('webrtc:offer', handleOffer);
    socket.on('webrtc:ice_candidate', handleIceCandidate);
    socket.on('screen:status', handleScreenStatus);

    return () => {
      socket.off('monitoring:started', handleMonitoringStarted);
      socket.off('monitoring:denied', handleMonitoringDenied);
      socket.off('monitoring:stopped', handleMonitoringStopped);
      socket.off('webrtc:offer', handleOffer);
      socket.off('webrtc:ice_candidate', handleIceCandidate);
      socket.off('screen:status', handleScreenStatus);
    };
  }, [activeSessionId]);

  const initWebRtcReceiver = (sessionId: string): Promise<WebRtcConnection> => {
    webrtcRef.current?.close();

    const connection = new WebRtcConnection({
      onConnectionStateChange: (state) => {
        setWebrtcState(state);
      },
      onRemoteStream: (stream) => {
        console.log('[Parent] Received remote child stream tracks:', stream.getTracks().length);
        setRemoteStream(stream);
      },
      onIceCandidate: (candidate) => {
        const socket = getSocket();
        socket.emit('webrtc:ice_candidate', {
          sessionId,
          candidate: candidate.toJSON()
        });
      },
      onError: (err) => {
        console.error('[Parent WebRTC Error]:', err);
        setStatusMessage('WebRTC error: ' + err.message);
      }
    });

    webrtcRef.current = connection;

    const setupPromise = (async () => {
      // 1. Initialize connection with STUN config FIRST
      await connection.initialize();

      // 2. Acquire parent's media for two-way video/audio and attach
      try {
        let pStream = parentLocalStreamRef.current;
        if (!pStream && parentMediaPromiseRef.current) {
          pStream = await parentMediaPromiseRef.current;
        }
        if (!pStream) {
          pStream = await acquireParentMedia();
        }
        if (pStream) {
          connection.setLocalStream(pStream);
        }
      } catch (err) {
        console.warn('[Parent] Error attaching parent media:', err);
      }

      return connection;
    })();

    initConnectionPromiseRef.current = setupPromise;
    return setupPromise;
  };

  const cleanupSession = (stoppedBy = 'parent') => {
    initConnectionPromiseRef.current = null;
    // If recording was running, stop it
    if (isRecording) {
      stopRecording();
    }

    if (sessionTimerRef.current) {
      clearInterval(sessionTimerRef.current);
      sessionTimerRef.current = null;
    }

    // Stop screen mirror stream if active
    if (parentDisplayStreamRef.current) {
      parentDisplayStreamRef.current.getTracks().forEach((track) => {
        try { track.stop(); } catch {}
      });
      parentDisplayStreamRef.current = null;
    }
    setIsParentScreenSharing(false);
    setIsChildScreenSharing(false);
    setIsChatOpen(false);
    setUnreadChatCount(0);

    // Stop parent local stream tracks to kill camera/mic lights
    if (parentLocalStreamRef.current) {
      parentLocalStreamRef.current.getTracks().forEach((track) => {
        try { track.stop(); } catch {}
      });
      parentLocalStreamRef.current = null;
      setParentLocalStream(null);
    }

    // Save session metadata into IndexedDB
    if (sessionStartTimeRef.current > 0 && activeDeviceId) {
      const now = Date.now();
      const dur = Math.max(1, Math.round((now - sessionStartTimeRef.current) / 1000));
      guardianDB.saveSession({
        id: `ses_${now}`,
        deviceId: activeDeviceId,
        deviceName: activeDeviceName,
        startedAt: new Date(sessionStartTimeRef.current).toISOString(),
        endedAt: new Date(now).toISOString(),
        duration: dur,
        cameraUsed: cameraActive,
        microphoneUsed: micActive,
        status: stoppedBy === 'child' ? 'Stopped by Child' : (stoppedBy === 'parent' ? 'Stopped by Parent' : 'Completed')
      }).catch(console.error);
    }

    webrtcRef.current?.close();
    webrtcRef.current = null;
    setRemoteStream(null);
    setCameraActive(false);
    setMicActive(false);
    setElapsedSeconds(0);
    sessionStartTimeRef.current = 0;
  };

  const handleSendMonitoringRequest = (camera: boolean, microphone: boolean) => {
    if (!activeDeviceId) {
      setStatusMessage('No child device selected.');
      return;
    }

    setStatusMessage(null);
    setMonitoringState('requesting');
    setShowRequestConfig(false);

    // Warm up parent webcam early while signaling
    parentMediaPromiseRef.current = acquireParentMedia();

    const socket = getSocket();
    socket.emit(
      'monitoring:request',
      {
        deviceId: activeDeviceId,
        camera,
        microphone
      },
      (res: { success: boolean; sessionId?: string; error?: string }) => {
        if (!res.success) {
          setMonitoringState('idle');
          setStatusMessage(res.error || 'Failed to send monitoring request.');
        } else if (res.sessionId) {
          setActiveSessionId(res.sessionId);
        }
      }
    );
  };

  const handleStopMonitoring = () => {
    const socket = getSocket();
    if (activeSessionId) {
      socket.emit('monitoring:stop', { sessionId: activeSessionId, reason: 'Parent clicked Stop Monitoring' });
    }
    setMonitoringState('idle');
    cleanupSession('parent');
  };

  // Toggle Parent Mic
  const toggleParentMic = () => {
    if (parentLocalStreamRef.current) {
      const aTracks = parentLocalStreamRef.current.getAudioTracks();
      const next = !parentMicEnabled;
      aTracks.forEach((t) => { t.enabled = next; });
      setParentMicEnabled(next);
    }
  };

  // Toggle Parent Camera
  const toggleParentCam = () => {
    if (parentLocalStreamRef.current) {
      const vTracks = parentLocalStreamRef.current.getVideoTracks();
      const next = !parentCamEnabled;
      vTracks.forEach((t) => { t.enabled = next; });
      setParentCamEnabled(next);
    }
  };

  // Toggle Parent Screen Mirroring
  const toggleParentScreenMirror = async () => {
    if (isParentScreenSharing) {
      stopParentScreenMirror();
    } else {
      await startParentScreenMirror();
    }
  };

  const startParentScreenMirror = async () => {
    try {
      const displayStream = await navigator.mediaDevices.getDisplayMedia({
        video: { cursor: 'always' } as any,
        audio: false
      });
      const displayTrack = displayStream.getVideoTracks()[0];
      if (!displayTrack) return;

      parentDisplayStreamRef.current = displayStream;

      displayTrack.onended = () => {
        stopParentScreenMirror();
      };

      if (webrtcRef.current) {
        await webrtcRef.current.replaceVideoTrack(displayTrack);
      }

      if (parentVideoRef.current) {
        parentVideoRef.current.srcObject = displayStream;
        parentVideoRef.current.play().catch(() => {});
      }

      setIsParentScreenSharing(true);

      const socket = getSocket();
      socket.emit('screen:status', {
        sessionId: activeSessionId,
        isSharing: true
      });
    } catch (err) {
      console.warn('[Parent] Screen share cancelled or error:', err);
    }
  };

  const stopParentScreenMirror = async () => {
    if (parentDisplayStreamRef.current) {
      parentDisplayStreamRef.current.getTracks().forEach((t) => {
        try { t.stop(); } catch {}
      });
      parentDisplayStreamRef.current = null;
    }

    let camTrack: MediaStreamTrack | null = null;
    if (parentLocalStreamRef.current) {
      const tracks = parentLocalStreamRef.current.getVideoTracks();
      if (tracks.length > 0) {
        camTrack = tracks[0];
      }
    }

    if (webrtcRef.current) {
      await webrtcRef.current.replaceVideoTrack(camTrack);
    }

    if (parentVideoRef.current && parentLocalStreamRef.current) {
      parentVideoRef.current.srcObject = parentLocalStreamRef.current;
      parentVideoRef.current.play().catch(() => {});
    }

    setIsParentScreenSharing(false);

    const socket = getSocket();
    socket.emit('screen:status', {
      sessionId: activeSessionId,
      isSharing: false
    });
  };

  return (
    <div className="space-y-6">
      {/* Top Banner / Device Bar */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex items-center space-x-4">
          <div className="w-12 h-12 rounded-xl bg-slate-800 border border-slate-700 flex items-center justify-center text-slate-300">
            <Radio className={`w-6 h-6 ${isDeviceOnline ? 'text-emerald-400' : 'text-slate-500'}`} />
          </div>
          <div>
            <div className="flex items-center space-x-2">
              <h3 className="text-lg font-bold text-white tracking-tight">{activeDeviceName}</h3>
              <span className={`inline-flex items-center space-x-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold ${
                isDeviceOnline
                  ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
                  : 'bg-slate-800 text-slate-400 border border-slate-700'
              }`}>
                <span className={`w-2 h-2 rounded-full ${isDeviceOnline ? 'bg-emerald-500 animate-pulse' : 'bg-slate-500'}`} />
                <span>{isDeviceOnline ? 'Online' : 'Offline'}</span>
              </span>
            </div>
            <p className="text-xs text-slate-400 mt-1">
              ID: <span className="font-mono">{activeDeviceId || 'Not paired'}</span>
            </p>
          </div>
        </div>

        {/* Action Controls */}
        <div className="flex items-center space-x-3">
          {monitoringState === 'idle' && (
            <div className="relative">
              {!showRequestConfig ? (
                <button
                  onClick={() => setShowRequestConfig(true)}
                  disabled={!isDeviceOnline}
                  className="flex items-center space-x-2 px-5 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 disabled:hover:bg-emerald-600 text-white font-semibold text-sm shadow-lg shadow-emerald-950/40 transition-all cursor-pointer"
                >
                  <Video className="w-4 h-4" />
                  <span>Start 2-Way Monitoring</span>
                </button>
              ) : (
                <div className="bg-slate-850 border border-slate-700 rounded-xl p-4 shadow-2xl flex flex-col space-y-3 z-30 min-w-[260px]">
                  <p className="text-xs font-semibold text-slate-200">Select Media to Request:</p>
                  <label className="flex items-center space-x-2 text-xs text-slate-300 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={requestCamera}
                      onChange={(e) => setRequestCamera(e.target.checked)}
                      className="rounded bg-slate-800 border-slate-700 text-emerald-500 focus:ring-emerald-500"
                    />
                    <span>Request Camera Feed</span>
                  </label>
                  <label className="flex items-center space-x-2 text-xs text-slate-300 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={requestMic}
                      onChange={(e) => setRequestMic(e.target.checked)}
                      className="rounded bg-slate-800 border-slate-700 text-emerald-500 focus:ring-emerald-500"
                    />
                    <span>Request Microphone</span>
                  </label>
                  <div className="flex items-center space-x-2 pt-1">
                    <button
                      onClick={() => handleSendMonitoringRequest(requestCamera, requestMic)}
                      disabled={!requestCamera && !requestMic}
                      className="flex-1 py-1.5 px-3 rounded-lg bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white text-xs font-semibold cursor-pointer"
                    >
                      Connect Call
                    </button>
                    <button
                      onClick={() => setShowRequestConfig(false)}
                      className="py-1.5 px-3 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs cursor-pointer"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}

          {monitoringState === 'requesting' && (
            <div className="flex items-center space-x-2 px-4 py-2 rounded-xl bg-amber-500/10 border border-amber-500/20 text-amber-400 text-sm font-medium animate-pulse">
              <RefreshCw className="w-4 h-4 animate-spin" />
              <span>Connecting to child device...</span>
            </div>
          )}

          {monitoringState === 'active' && (
            <div className="flex flex-wrap items-center gap-2">
              {/* Screen Mirroring Button */}
              <button
                onClick={toggleParentScreenMirror}
                className={`flex items-center space-x-1.5 px-3 py-2 rounded-xl text-xs font-semibold border transition-all cursor-pointer ${
                  isParentScreenSharing
                    ? 'bg-cyan-600 hover:bg-cyan-500 border-cyan-400 text-white shadow-lg shadow-cyan-950/50 animate-pulse'
                    : 'bg-slate-800 hover:bg-slate-700 text-slate-200 border-slate-700'
                }`}
                title={isParentScreenSharing ? 'Stop mirroring your screen' : 'Mirror your screen to child device'}
              >
                {isParentScreenSharing ? (
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

              {/* Layout Switcher Button */}
              <button
                onClick={() => setLayoutMode(layoutMode === 'split' ? 'pip' : 'split')}
                className="flex items-center space-x-1.5 px-3 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold border border-slate-700 transition-colors cursor-pointer"
                title={layoutMode === 'split' ? 'Switch to Picture-in-Picture mode' : 'Switch to Side-by-Side Dual View'}
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

              {/* Local Recording Button */}
              {!isRecording ? (
                <button
                  onClick={startRecording}
                  className="flex items-center space-x-2 px-3.5 py-2 rounded-xl bg-red-600/90 hover:bg-red-500 text-white text-xs font-semibold shadow-md transition-colors cursor-pointer"
                >
                  <CircleDot className="w-3.5 h-3.5 text-white" />
                  <span>Record</span>
                </button>
              ) : (
                <button
                  onClick={stopRecording}
                  className="flex items-center space-x-2 px-3.5 py-2 rounded-xl bg-red-950 border border-red-500 text-red-400 hover:bg-red-900/60 text-xs font-semibold transition-colors animate-pulse cursor-pointer"
                >
                  <Square className="w-3 h-3 fill-current" />
                  <span>Stop ({formatDuration(recordDuration)})</span>
                </button>
              )}

              {/* Stop Monitoring Button */}
              <button
                onClick={handleStopMonitoring}
                className="flex items-center space-x-1.5 px-3.5 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-medium border border-slate-700 transition-colors cursor-pointer"
              >
                <Square className="w-3.5 h-3.5" />
                <span>End Call</span>
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Status or Error Notifications */}
      {statusMessage && (
        <div className="p-4 rounded-xl bg-slate-900 border border-slate-800 flex items-center space-x-3 text-sm text-slate-300">
          <AlertCircle className="w-5 h-5 text-amber-400 flex-shrink-0" />
          <span>{statusMessage}</span>
        </div>
      )}

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

      {/* Main Video & Monitoring Screen */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-2xl space-y-6">
        {/* Stream State Bar */}
        <div className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-800/80 pb-4">
          <div className="flex items-center space-x-4">
            {/* Child Camera Indicator */}
            <div className="flex items-center space-x-1.5 text-xs font-medium">
              {cameraActive ? (
                <>
                  <Video className="w-4 h-4 text-emerald-400" />
                  <span className="text-emerald-400">Child Cam: ON</span>
                </>
              ) : (
                <>
                  <VideoOff className="w-4 h-4 text-slate-500" />
                  <span className="text-slate-500">Child Cam: OFF</span>
                </>
              )}
            </div>

            {/* Child Mic Indicator */}
            <div className="flex items-center space-x-1.5 text-xs font-medium">
              {micActive ? (
                <>
                  <Mic className="w-4 h-4 text-emerald-400" />
                  <span className="text-emerald-400">Child Mic: ON</span>
                </>
              ) : (
                <>
                  <MicOff className="w-4 h-4 text-slate-500" />
                  <span className="text-slate-500">Child Mic: OFF</span>
                </>
              )}
            </div>

            {/* WebRTC State */}
            <div className="flex items-center space-x-1.5 text-xs font-medium text-slate-400">
              <Wifi className="w-4 h-4 text-blue-400" />
              <span>2-Way Call: </span>
              <span className={`font-mono uppercase font-semibold ${
                webrtcState === 'connected' ? 'text-emerald-400' : 'text-slate-400'
              }`}>
                {webrtcState}
              </span>
            </div>
          </div>

          <div className="flex items-center space-x-4">
            {/* Audio Visualizer of Child Feed */}
            <AudioVisualizer stream={remoteStream} isActive={micActive} />

            {/* Session Duration Counter */}
            {monitoringState === 'active' && (
              <div className="flex items-center space-x-1.5 px-3 py-1.5 rounded-lg bg-slate-800 text-xs font-mono font-bold text-white border border-slate-700">
                <Clock className="w-3.5 h-3.5 text-emerald-400" />
                <span>{formatDuration(elapsedSeconds)}</span>
              </div>
            )}
          </div>
        </div>

        {/* Video Canvas Container (Side-by-Side Dual View or PiP Mode) */}
        {monitoringState !== 'active' ? (
          <div className="relative w-full aspect-video max-h-[640px] rounded-2xl overflow-hidden bg-slate-950 border border-slate-800">
            <VideoPlayer
              stream={remoteStream}
              isLive={false}
              autoPlay={true}
              muted={false}
              className="w-full h-full"
              fallbackMessage={
                !isDeviceOnline
                  ? 'Child device is offline. Connect child device from /child view.'
                  : monitoringState === 'requesting'
                  ? 'Connecting to child device...'
                  : monitoringState === 'idle'
                  ? 'Monitoring is idle. Click "Start 2-Way Monitoring" to begin.'
                  : 'Waiting for media stream to establish...'
              }
            />
          </div>
        ) : layoutMode === 'split' ? (
          /* Side-by-Side Dual View (Equal Face-to-Face Video Call) */
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 w-full aspect-video md:aspect-[16/9] min-h-[380px] max-h-[640px]">
            {/* Child Video Tile */}
            <div className={`relative rounded-2xl overflow-hidden bg-slate-950 border-2 border-slate-800 shadow-2xl flex items-center justify-center ${swapped ? 'order-2' : 'order-1'}`}>
              <VideoPlayer
                stream={remoteStream}
                isLive={true}
                autoPlay={true}
                muted={false} // Parent hears child!
                className="w-full h-full"
                fallbackMessage="Waiting for child video feed..."
              />
              {isChildScreenSharing ? (
                <div className="absolute top-3 left-3 z-10 px-3 py-1 rounded-full bg-cyan-600/90 backdrop-blur-md border border-cyan-400 text-white text-xs font-bold flex items-center space-x-1.5 shadow-xl animate-pulse">
                  <Monitor className="w-3.5 h-3.5 text-cyan-200" />
                  <span>Child Screen Mirror Active</span>
                </div>
              ) : (
                <div className="absolute top-3 left-3 z-10 px-3 py-1 rounded-full bg-black/70 backdrop-blur-md border border-white/10 text-white text-xs font-semibold flex items-center space-x-1.5 shadow-lg">
                  <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                  <span>{activeDeviceName} (Child)</span>
                </div>
              )}
              <div className="absolute bottom-3 left-3 z-10 flex items-center space-x-1.5 px-2.5 py-1 rounded-lg bg-black/70 backdrop-blur-md border border-white/10 text-xs">
                {micActive ? (
                  <Mic className="w-3.5 h-3.5 text-emerald-400" />
                ) : (
                  <MicOff className="w-3.5 h-3.5 text-slate-500" />
                )}
                <span className="text-[11px] text-slate-300 font-medium">Child Mic</span>
              </div>
            </div>

            {/* Parent Video Tile */}
            <div className={`relative rounded-2xl overflow-hidden bg-slate-950 border-2 border-slate-800 shadow-2xl flex items-center justify-center ${swapped ? 'order-1' : 'order-2'}`}>
              <video
                ref={parentVideoRef}
                autoPlay
                playsInline
                muted={true} // Local muted to prevent feedback loop
                className={`w-full h-full object-cover transform -scale-x-100 ${parentCamEnabled || isParentScreenSharing ? '' : 'hidden'}`}
              />
              {!parentCamEnabled && !isParentScreenSharing && (
                <div className="absolute inset-0 flex flex-col items-center justify-center bg-slate-900 text-slate-400 p-6 text-center">
                  <div className="w-16 h-16 rounded-full bg-slate-800 border border-slate-700 flex items-center justify-center mb-2">
                    <User className="w-8 h-8 text-slate-400" />
                  </div>
                  <p className="text-sm font-bold text-white">Your Camera is Off</p>
                  <p className="text-xs text-slate-400 mt-1">Click the camera icon below to turn on video</p>
                </div>
              )}
              {isParentScreenSharing ? (
                <div className="absolute top-3 left-3 z-10 px-3 py-1 rounded-full bg-cyan-600/90 backdrop-blur-md border border-cyan-400 text-white text-xs font-bold flex items-center space-x-1.5 shadow-xl">
                  <Monitor className="w-3.5 h-3.5 text-cyan-200" />
                  <span>Your Mirrored Screen</span>
                </div>
              ) : (
                <div className="absolute top-3 left-3 z-10 px-3 py-1 rounded-full bg-black/70 backdrop-blur-md border border-white/10 text-white text-xs font-semibold flex items-center space-x-1.5 shadow-lg">
                  <User className="w-3.5 h-3.5 text-blue-400" />
                  <span>You (Parent)</span>
                </div>
              )}
              {/* Parent Quick Cam & Mic Controls */}
              <div className="absolute bottom-3 right-3 z-10 flex items-center space-x-1.5 bg-black/75 backdrop-blur-md p-1.5 rounded-xl border border-white/10 shadow-lg">
                <button
                  onClick={toggleParentMic}
                  title={parentMicEnabled ? 'Mute your microphone' : 'Unmute your microphone'}
                  className={`p-2 rounded-lg text-xs font-semibold transition-colors cursor-pointer ${
                    parentMicEnabled ? 'bg-slate-800 hover:bg-slate-700 text-emerald-400' : 'bg-red-600 hover:bg-red-500 text-white'
                  }`}
                >
                  {parentMicEnabled ? <Mic className="w-4 h-4" /> : <MicOff className="w-4 h-4" />}
                </button>
                <button
                  onClick={toggleParentCam}
                  title={parentCamEnabled ? 'Turn off your camera' : 'Turn on your camera'}
                  className={`p-2 rounded-lg text-xs font-semibold transition-colors cursor-pointer ${
                    parentCamEnabled ? 'bg-slate-800 hover:bg-slate-700 text-emerald-400' : 'bg-red-600 hover:bg-red-500 text-white'
                  }`}
                >
                  {parentCamEnabled ? <Video className="w-4 h-4" /> : <VideoOff className="w-4 h-4" />}
                </button>
              </div>
            </div>
          </div>
        ) : (
          /* PiP Mode: Full primary video with floating secondary card */
          <div className="relative w-full aspect-video max-h-[640px] rounded-2xl overflow-hidden bg-slate-950 border border-slate-800">
            <VideoPlayer
              stream={remoteStream}
              isLive={true}
              autoPlay={true}
              muted={false} // Parent hears child
              className="w-full h-full"
              fallbackMessage="Waiting for child video feed..."
            />
            {isChildScreenSharing && (
              <div className="absolute top-4 left-4 z-20 px-3 py-1 rounded-full bg-cyan-600/90 backdrop-blur-md border border-cyan-400 text-white text-xs font-bold flex items-center space-x-1.5 shadow-xl animate-pulse">
                <Monitor className="w-3.5 h-3.5 text-cyan-200" />
                <span>Child Screen Mirror Active</span>
              </div>
            )}
            {/* Top-Right Floating Parent PiP */}
            <div className="absolute top-4 right-4 z-20 w-40 sm:w-56 aspect-video bg-black rounded-xl overflow-hidden border-2 border-slate-700/80 shadow-2xl group">
              <video
                ref={parentVideoRef}
                autoPlay
                playsInline
                muted={true}
                className={`w-full h-full object-cover transform -scale-x-100 ${parentCamEnabled || isParentScreenSharing ? '' : 'hidden'}`}
              />
              {!parentCamEnabled && !isParentScreenSharing && (
                <div className="w-full h-full flex flex-col items-center justify-center bg-slate-900 text-slate-400 text-xs p-2 text-center">
                  <User className="w-6 h-6 text-slate-500 mb-1" />
                  <span>Cam Off</span>
                </div>
              )}
              {/* Floating controls in PiP */}
              <div className="absolute bottom-1 right-1 flex items-center space-x-1">
                <button
                  onClick={toggleParentMic}
                  title={parentMicEnabled ? 'Mute microphone' : 'Unmute microphone'}
                  className={`p-1 rounded-md text-[10px] transition-colors cursor-pointer ${
                    parentMicEnabled ? 'bg-black/70 hover:bg-black text-emerald-400' : 'bg-red-600 hover:bg-red-500 text-white'
                  }`}
                >
                  {parentMicEnabled ? <Mic className="w-3 h-3" /> : <MicOff className="w-3 h-3" />}
                </button>
                <button
                  onClick={toggleParentCam}
                  title={parentCamEnabled ? 'Turn off camera' : 'Turn on camera'}
                  className={`p-1 rounded-md text-[10px] transition-colors cursor-pointer ${
                    parentCamEnabled ? 'bg-black/70 hover:bg-black text-emerald-400' : 'bg-red-600 hover:bg-red-500 text-white'
                  }`}
                >
                  {parentCamEnabled ? <Video className="w-3 h-3" /> : <VideoOff className="w-3 h-3" />}
                </button>
              </div>
              <div className="absolute bottom-1 left-2 text-[10px] font-semibold text-slate-300 drop-shadow flex items-center space-x-1">
                {isParentScreenSharing && <Monitor className="w-3 h-3 text-cyan-400" />}
                <span>{isParentScreenSharing ? 'Your Screen' : 'Parent (You)'}</span>
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

        {/* Educational Disclosure for Parent */}
        <div className="text-xs text-slate-500 flex items-start space-x-2 pt-2">
          <Sparkles className="w-4 h-4 text-emerald-500 flex-shrink-0 mt-0.5" />
          <p>
            GuardianLink 2-way call enables parent and student to see and speak with each other in real-time. The child has full control and can stop the session anytime, or press <strong>M</strong> to switch directly to ChatGPT.
          </p>
        </div>
      </div>

      {/* In-Call Chat Drawer / Overlay */}
      <InCallChat
        sessionId={activeSessionId}
        role="parent"
        peerName={activeDeviceName || 'Child'}
        isOpen={isChatOpen}
        onClose={() => setIsChatOpen(false)}
        onUnreadCountChange={(count) => setUnreadChatCount(count)}
        className="bottom-6 right-6 w-80 sm:w-96 max-w-[calc(100vw-3rem)]"
      />
    </div>
  );
};

