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
  Wifi
} from 'lucide-react';
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
  const [cameraActive, setCameraActive] = useState(false);
  const [micActive, setMicActive] = useState(false);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);

  // Request options modal/state
  const [requestCamera, setRequestCamera] = useState(true);
  const [requestMic, setRequestMic] = useState(true);
  const [showRequestConfig, setShowRequestConfig] = useState(false);

  const webrtcRef = useRef<WebRtcConnection | null>(null);
  const sessionStartTimeRef = useRef<number>(0);
  const sessionTimerRef = useRef<number | null>(null);

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
      webrtcRef.current?.close();
    };
  }, []);

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

      // Initialize WebRTC receiver
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
      if (!webrtcRef.current) return;
      try {
        const answer = await webrtcRef.current.handleOfferAndCreateAnswer(data.sdp);
        socket.emit('webrtc:answer', {
          sessionId: data.sessionId,
          sdp: answer
        });
      } catch (err) {
        console.error('[Parent] Error handling offer:', err);
      }
    };

    const handleIceCandidate = (data: { sessionId: string; candidate: RTCIceCandidateInit }) => {
      if (!webrtcRef.current) return;
      webrtcRef.current.addIceCandidate(data.candidate);
    };

    socket.on('monitoring:started', handleMonitoringStarted);
    socket.on('monitoring:denied', handleMonitoringDenied);
    socket.on('monitoring:stopped', handleMonitoringStopped);
    socket.on('webrtc:offer', handleOffer);
    socket.on('webrtc:ice_candidate', handleIceCandidate);

    return () => {
      socket.off('monitoring:started', handleMonitoringStarted);
      socket.off('monitoring:denied', handleMonitoringDenied);
      socket.off('monitoring:stopped', handleMonitoringStopped);
      socket.off('webrtc:offer', handleOffer);
      socket.off('webrtc:ice_candidate', handleIceCandidate);
    };
  }, [activeSessionId]);

  const initWebRtcReceiver = async (sessionId: string) => {
    webrtcRef.current?.close();

    const connection = new WebRtcConnection({
      onConnectionStateChange: (state) => {
        setWebrtcState(state);
      },
      onRemoteStream: (stream) => {
        console.log('[Parent] Received remote stream tracks:', stream.getTracks().length);
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

    await connection.initialize();
    webrtcRef.current = connection;
  };

  const cleanupSession = (stoppedBy = 'parent') => {
    // If recording was running, stop it
    if (isRecording) {
      stopRecording();
    }

    if (sessionTimerRef.current) {
      clearInterval(sessionTimerRef.current);
      sessionTimerRef.current = null;
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
                  className="flex items-center space-x-2 px-5 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 disabled:hover:bg-emerald-600 text-white font-semibold text-sm shadow-lg shadow-emerald-950/40 transition-all"
                >
                  <Video className="w-4 h-4" />
                  <span>Start Monitoring</span>
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
                      className="flex-1 py-1.5 px-3 rounded-lg bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white text-xs font-semibold"
                    >
                      Send Request
                    </button>
                    <button
                      onClick={() => setShowRequestConfig(false)}
                      className="py-1.5 px-3 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs"
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
              <span>Waiting for child approval...</span>
            </div>
          )}

          {monitoringState === 'active' && (
            <div className="flex items-center space-x-3">
              {/* Local Recording Button */}
              {!isRecording ? (
                <button
                  onClick={startRecording}
                  className="flex items-center space-x-2 px-4 py-2.5 rounded-xl bg-red-600/90 hover:bg-red-500 text-white text-sm font-semibold shadow-md transition-colors"
                >
                  <CircleDot className="w-4 h-4 text-white" />
                  <span>Start Recording</span>
                </button>
              ) : (
                <button
                  onClick={stopRecording}
                  className="flex items-center space-x-2 px-4 py-2.5 rounded-xl bg-red-950 border border-red-500 text-red-400 hover:bg-red-900/60 text-sm font-semibold transition-colors animate-pulse"
                >
                  <Square className="w-3.5 h-3.5 fill-current" />
                  <span>Stop Recording ({formatDuration(recordDuration)})</span>
                </button>
              )}

              {/* Stop Monitoring Button */}
              <button
                onClick={handleStopMonitoring}
                className="flex items-center space-x-2 px-4 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-sm font-medium border border-slate-700 transition-colors"
              >
                <Square className="w-4 h-4" />
                <span>Stop Monitoring</span>
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
            {/* Camera Indicator */}
            <div className="flex items-center space-x-1.5 text-xs font-medium">
              {cameraActive ? (
                <>
                  <Video className="w-4 h-4 text-emerald-400" />
                  <span className="text-emerald-400">Camera: ON</span>
                </>
              ) : (
                <>
                  <VideoOff className="w-4 h-4 text-slate-500" />
                  <span className="text-slate-500">Camera: OFF</span>
                </>
              )}
            </div>

            {/* Mic Indicator */}
            <div className="flex items-center space-x-1.5 text-xs font-medium">
              {micActive ? (
                <>
                  <Mic className="w-4 h-4 text-emerald-400" />
                  <span className="text-emerald-400">Microphone: ON</span>
                </>
              ) : (
                <>
                  <MicOff className="w-4 h-4 text-slate-500" />
                  <span className="text-slate-500">Microphone: OFF</span>
                </>
              )}
            </div>

            {/* WebRTC State */}
            <div className="flex items-center space-x-1.5 text-xs font-medium text-slate-400">
              <Wifi className="w-4 h-4 text-blue-400" />
              <span>WebRTC: </span>
              <span className={`font-mono uppercase font-semibold ${
                webrtcState === 'connected' ? 'text-emerald-400' : 'text-slate-400'
              }`}>
                {webrtcState}
              </span>
            </div>
          </div>

          <div className="flex items-center space-x-4">
            {/* Audio Visualizer */}
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

        {/* Video Canvas Container */}
        <div className="w-full aspect-video max-h-[640px]">
          <VideoPlayer
            stream={remoteStream}
            isLive={monitoringState === 'active'}
            autoPlay={true}
            muted={false}
            className="w-full h-full"
            fallbackMessage={
              !isDeviceOnline
                ? 'Child device is offline. Connect child device from /child view.'
                : monitoringState === 'requesting'
                ? 'Request sent. Awaiting child approval on their screen...'
                : monitoringState === 'idle'
                ? 'Monitoring is idle. Click "Start Monitoring" to send a safety request.'
                : 'Waiting for media stream to establish...'
            }
          />
        </div>

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
            GuardianLink is designed for cooperative, transparent family safety. Monitoring begins only when the child grants access on their device. When stopped by either party, camera and microphone access is revoked immediately.
          </p>
        </div>
      </div>
    </div>
  );
};
