import React, { useState, useEffect, useRef, useCallback } from 'react';
import { 
  Shield, 
  Smartphone, 
  CheckCircle, 
  VideoOff, 
  MicOff, 
  LogOut, 
  Wifi, 
  AlertCircle
} from 'lucide-react';
import { getChildDeviceInfo, clearChildDeviceInfo, SavedChildDeviceInfo } from '../utils/storage';
import { connectSocket, disconnectSocket } from '../services/socket';
import { WebRtcConnection, WebRtcConnectionState } from '../services/webrtc';
import { ChildPairingView } from './ChildPairingView';
import { PermissionPromptModal } from './PermissionPromptModal';
import { ChildMonitoringActiveView } from './ChildMonitoringActiveView';
import { BackgroundLimitBanner } from './BackgroundLimitBanner';

interface IncomingRequest {
  sessionId: string;
  camera: boolean;
  microphone: boolean;
  parentId: string;
}

export const ChildInterface: React.FC = () => {
  const [deviceInfo, setDeviceInfo] = useState<SavedChildDeviceInfo | null>(null);
  const [isConnectedToSocket, setIsConnectedToSocket] = useState(false);
  const [incomingRequest, setIncomingRequest] = useState<IncomingRequest | null>(null);
  const [isMonitoringActive, setIsMonitoringActive] = useState(false);
  const [activeSessionId, setActiveSessionId] = useState<string>('');
  const [localStream, setLocalStream] = useState<MediaStream | null>(null);
  const [cameraActive, setCameraActive] = useState(false);
  const [micActive, setMicActive] = useState(false);
  const [webrtcState, setWebrtcState] = useState<WebRtcConnectionState>('closed');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const webrtcRef = useRef<WebRtcConnection | null>(null);
  const localStreamRef = useRef<MediaStream | null>(null);

  // Load saved device pairing on mount
  useEffect(() => {
    const saved = getChildDeviceInfo();
    if (saved) {
      setDeviceInfo(saved);
    }
  }, []);

  // Connect socket and register child device
  useEffect(() => {
    if (!deviceInfo) return;

    const socket = connectSocket();

    const authenticateChild = () => {
      socket.emit('auth:child', { deviceId: deviceInfo.deviceId }, (res: { success: boolean; error?: string }) => {
        if (res.success) {
          setIsConnectedToSocket(true);
          setErrorMessage(null);
        } else {
          setIsConnectedToSocket(false);
          setErrorMessage(res.error || 'Device not recognized. You may need to pair again.');
        }
      });
    };

    socket.on('connect', authenticateChild);
    if (socket.connected) {
      authenticateChild();
    }

    // Handle incoming transparent monitoring request from parent
    socket.on('monitoring:incoming_request', (data: IncomingRequest) => {
      console.log('[Child] Incoming monitoring request:', data);
      setIncomingRequest(data);
    });

    // Handle WebRTC Answer from parent
    socket.on('webrtc:answer', async (data: { sessionId: string; sdp: RTCSessionDescriptionInit }) => {
      if (!webrtcRef.current) return;
      try {
        await webrtcRef.current.handleAnswer(data.sdp);
      } catch (err) {
        console.error('[Child] Error setting WebRTC answer:', err);
      }
    });

    // Handle ICE Candidates from parent
    socket.on('webrtc:ice_candidate', (data: { sessionId: string; candidate: RTCIceCandidateInit }) => {
      if (!webrtcRef.current) return;
      webrtcRef.current.addIceCandidate(data.candidate);
    });

    // Handle session termination (e.g. parent clicked stop or parent logged out)
    socket.on('monitoring:stopped', (data: { sessionId: string; by: string; message: string }) => {
      console.log('[Child] Monitoring stopped notification:', data);
      stopLocalMonitoring('Parent or system ended the session.');
    });

    // Handle parent unpairing device
    socket.on('device:unpaired', () => {
      stopLocalMonitoring('Device unpaired by parent.');
      clearChildDeviceInfo();
      setDeviceInfo(null);
    });

    return () => {
      socket.off('connect');
      socket.off('monitoring:incoming_request');
      socket.off('webrtc:answer');
      socket.off('webrtc:ice_candidate');
      socket.off('monitoring:stopped');
      socket.off('device:unpaired');
    };
  }, [deviceInfo]);

  // Clean stop of all media streams, WebRTC, and timers
  const stopLocalMonitoring = useCallback((reasonNotice?: string) => {
    // 1. Explicitly stop all media tracks
    if (localStreamRef.current) {
      localStreamRef.current.getTracks().forEach((track) => {
        try {
          track.stop();
        } catch {
          // Ignore
        }
      });
      localStreamRef.current = null;
    }

    // 2. Close WebRTC
    if (webrtcRef.current) {
      webrtcRef.current.close();
      webrtcRef.current = null;
    }

    setLocalStream(null);
    setCameraActive(false);
    setMicActive(false);
    setIsMonitoringActive(false);
    setActiveSessionId('');
    setWebrtcState('closed');

    if (reasonNotice) {
      setErrorMessage(reasonNotice);
    }
  }, []);

  // Child clicks Allow in modal
  const handleAllowMonitoring = async () => {
    if (!incomingRequest) return;

    const { sessionId, camera, microphone } = incomingRequest;
    setIncomingRequest(null);
    setErrorMessage(null);

    try {
      // Prompt browser for explicit media permissions
      const stream = await navigator.mediaDevices.getUserMedia({
        video: camera ? { width: { ideal: 1280 }, height: { ideal: 720 }, facingMode: 'user' } : false,
        audio: microphone
      });

      localStreamRef.current = stream;
      setLocalStream(stream);
      setCameraActive(camera && stream.getVideoTracks().length > 0);
      setMicActive(microphone && stream.getAudioTracks().length > 0);
      setIsMonitoringActive(true);
      setActiveSessionId(sessionId);

      // Notify server and parent of explicit approval
      const socket = connectSocket();
      socket.emit('monitoring:response', {
        sessionId,
        approved: true
      });

      // Initialize WebRTC sender
      const connection = new WebRtcConnection({
        onConnectionStateChange: (state) => {
          setWebrtcState(state);
        },
        onIceCandidate: (candidate) => {
          socket.emit('webrtc:ice_candidate', {
            sessionId,
            candidate: candidate.toJSON()
          });
        },
        onError: (err) => {
          console.error('[Child WebRTC Error]:', err);
          setErrorMessage('Connection error: ' + err.message);
        }
      });

      await connection.initialize();
      connection.setLocalStream(stream);

      // Create WebRTC Offer
      const offer = await connection.createOffer();
      socket.emit('webrtc:offer', {
        sessionId,
        sdp: offer
      });

      webrtcRef.current = connection;
    } catch (err) {
      console.warn('[Child] Camera/Microphone access error:', err);
      const isDenied = err instanceof DOMException && err.name === 'NotAllowedError';
      const msg = isDenied
        ? 'Camera/microphone permission was denied in your browser settings.'
        : 'Could not access requested media devices.';

      // Notify parent of failure/denial
      const socket = connectSocket();
      socket.emit('monitoring:response', {
        sessionId,
        approved: false,
        reason: msg
      });

      setErrorMessage(msg);
      stopLocalMonitoring();
    }
  };

  // Child clicks Deny in modal
  const handleDenyMonitoring = () => {
    if (!incomingRequest) return;

    const socket = connectSocket();
    socket.emit('monitoring:response', {
      sessionId: incomingRequest.sessionId,
      approved: false,
      reason: 'Child declined the monitoring request.'
    });

    setIncomingRequest(null);
  };

  // Child clicks Stop Monitoring button
  const handleChildStop = () => {
    if (activeSessionId) {
      const socket = connectSocket();
      socket.emit('monitoring:stop', {
        sessionId: activeSessionId,
        reason: 'Child pressed STOP MONITORING button.'
      });
    }
    stopLocalMonitoring();
  };

  const handleUnpair = () => {
    stopLocalMonitoring();
    clearChildDeviceInfo();
    setDeviceInfo(null);
    disconnectSocket();
  };

  // If not paired yet, show code entry view
  if (!deviceInfo) {
    return <ChildPairingView onPairedSuccess={(info) => setDeviceInfo(info)} />;
  }

  // If active monitoring, show prominent transparent monitoring view
  if (isMonitoringActive) {
    return (
      <>
        <BackgroundLimitBanner />
        <ChildMonitoringActiveView
          localStream={localStream}
          cameraActive={cameraActive}
          micActive={micActive}
          connectionState={webrtcState}
          onStopMonitoring={handleChildStop}
        />
      </>
    );
  }

  // Otherwise show Paired & Idle Status View
  return (
    <div className="min-h-screen bg-slate-950 flex flex-col items-center justify-between p-4 sm:p-8 text-slate-100 font-sans">
      <BackgroundLimitBanner />

      {/* Incoming Transparent Permission Request Modal */}
      {incomingRequest && (
        <PermissionPromptModal
          cameraRequested={incomingRequest.camera}
          micRequested={incomingRequest.microphone}
          onAllow={handleAllowMonitoring}
          onDeny={handleDenyMonitoring}
        />
      )}

      {/* Main Paired Idle Card */}
      <div className="w-full max-w-md my-auto bg-slate-900 border border-slate-800 rounded-3xl p-6 sm:p-8 shadow-2xl space-y-6 text-center">
        {/* Header */}
        <div className="space-y-2">
          <div className="inline-flex w-16 h-16 rounded-2xl bg-emerald-500/10 border border-emerald-500/20 items-center justify-center text-emerald-400 mb-2">
            <Shield className="w-8 h-8" />
          </div>
          <h2 className="text-xl font-bold text-white tracking-tight">GuardianLink Companion</h2>
          <div className="inline-flex items-center space-x-2 px-3 py-1 rounded-full bg-emerald-500/10 border border-emerald-500/20 text-xs font-semibold text-emerald-400">
            <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
            <span>Paired & Ready</span>
          </div>
        </div>

        {errorMessage && (
          <div className="p-3.5 rounded-xl bg-amber-500/10 border border-amber-500/20 text-xs text-amber-300 flex items-center space-x-2 text-left">
            <AlertCircle className="w-4 h-4 flex-shrink-0 text-amber-400" />
            <span>{errorMessage}</span>
          </div>
        )}

        {/* Device & Parent Relationship Box */}
        <div className="bg-slate-950/80 border border-slate-800 rounded-2xl p-4 text-left space-y-2.5">
          <div className="flex items-center justify-between text-xs">
            <span className="text-slate-400 flex items-center space-x-1.5">
              <Smartphone className="w-3.5 h-3.5 text-slate-500" />
              <span>Device Name:</span>
            </span>
            <span className="font-semibold text-slate-200">{deviceInfo.deviceName}</span>
          </div>

          <div className="flex items-center justify-between text-xs">
            <span className="text-slate-400 flex items-center space-x-1.5">
              <Wifi className="w-3.5 h-3.5 text-slate-500" />
              <span>Signaling Status:</span>
            </span>
            <span className={`font-medium ${isConnectedToSocket ? 'text-emerald-400' : 'text-amber-400'}`}>
              {isConnectedToSocket ? 'Connected' : 'Connecting...'}
            </span>
          </div>

          <div className="flex items-center justify-between text-xs">
            <span className="text-slate-400 flex items-center space-x-1.5">
              <CheckCircle className="w-3.5 h-3.5 text-emerald-500" />
              <span>Parent Link:</span>
            </span>
            <span className="font-mono text-[11px] text-slate-300 truncate max-w-[160px]">
              {deviceInfo.parentId}
            </span>
          </div>
        </div>

        {/* Current State Reassurance */}
        <div className="bg-slate-950/50 border border-slate-800/80 rounded-2xl p-4 text-xs text-slate-400 space-y-3">
          <p className="font-semibold text-slate-200">Current Sensor Status:</p>
          <div className="flex items-center justify-around py-1">
            <div className="flex items-center space-x-2 text-slate-400">
              <VideoOff className="w-4 h-4 text-slate-500" />
              <span>Camera OFF</span>
            </div>
            <div className="flex items-center space-x-2 text-slate-400">
              <MicOff className="w-4 h-4 text-slate-500" />
              <span>Microphone OFF</span>
            </div>
          </div>
          <p className="text-[11px] text-slate-500 leading-relaxed">
            Your camera and microphone are inactive. Whenever your parent requests a live check, you will receive an on-screen prompt to Allow or Deny.
          </p>
        </div>

        {/* Unpair Button */}
        <div className="pt-2">
          <button
            onClick={handleUnpair}
            className="inline-flex items-center space-x-2 px-4 py-2 rounded-xl text-xs font-semibold text-slate-400 hover:text-red-400 hover:bg-red-500/10 transition-colors"
          >
            <LogOut className="w-3.5 h-3.5" />
            <span>Unpair This Device</span>
          </button>
        </div>
      </div>

      <div className="text-[11px] text-slate-600 text-center max-w-sm mt-4">
        GuardianLink Transparent Child Safety • Version 1.0.0
      </div>
    </div>
  );
};
