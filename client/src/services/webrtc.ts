import { webrtcApi } from './api';

export type WebRtcConnectionState =
  | 'new'
  | 'connecting'
  | 'connected'
  | 'disconnected'
  | 'failed'
  | 'closed';

export interface WebRtcCallbacks {
  onConnectionStateChange?: (state: WebRtcConnectionState) => void;
  onRemoteStream?: (stream: MediaStream) => void;
  onIceCandidate?: (candidate: RTCIceCandidate) => void;
  onError?: (error: Error) => void;
}

const DEFAULT_ICE_SERVERS: RTCIceServer[] = [
  { urls: 'stun:stun.l.google.com:19302' }
];

export class WebRtcConnection {
  private peerConnection: RTCPeerConnection | null = null;
  private remoteStream: MediaStream = new MediaStream();
  private localStream: MediaStream | null = null;
  private pendingCandidates: RTCIceCandidateInit[] = [];
  private isSettingRemoteDescription = false;
  private callbacks: WebRtcCallbacks = {};

  constructor(callbacks: WebRtcCallbacks = {}) {
    this.callbacks = callbacks;
  }

  /**
   * Initializes the RTCPeerConnection with STUN/TURN servers fetched from server
   */
  async initialize(): Promise<void> {
    this.close();

    let iceConfig: { iceServers: RTCIceServer[]; iceTransportPolicy?: RTCIceTransportPolicy } = {
      iceServers: DEFAULT_ICE_SERVERS
    };

    try {
      const fetchedConfig = await webrtcApi.getIceConfig();
      if (fetchedConfig && fetchedConfig.iceServers && fetchedConfig.iceServers.length > 0) {
        iceConfig = fetchedConfig;
      }
    } catch (e) {
      console.warn('[WebRTC] Using fallback ICE servers due to fetch failure:', e);
    }

    const rtcConfig: RTCConfiguration = {
      iceServers: iceConfig.iceServers,
      iceTransportPolicy: iceConfig.iceTransportPolicy || 'all',
      bundlePolicy: 'max-bundle',
      rtcpMuxPolicy: 'require'
    };

    this.peerConnection = new RTCPeerConnection(rtcConfig);
    this.remoteStream = new MediaStream();

    // Track state changes
    this.peerConnection.onconnectionstatechange = () => {
      const state = (this.peerConnection?.connectionState || 'closed') as WebRtcConnectionState;
      console.log(`[WebRTC] Connection state: ${state}`);
      this.callbacks.onConnectionStateChange?.(state);
    };

    this.peerConnection.oniceconnectionstatechange = () => {
      const iceState = this.peerConnection?.iceConnectionState;
      console.log(`[WebRTC] ICE Connection state: ${iceState}`);
      if (iceState === 'failed') {
        this.restartIce().catch(err => {
          console.warn('[WebRTC] ICE restart error:', err);
        });
      }
    };

    // Forward ICE candidates to signaling channel
    this.peerConnection.onicecandidate = (event) => {
      if (event.candidate) {
        this.callbacks.onIceCandidate?.(event.candidate);
      }
    };

    // Receive remote tracks (for Parent receiver)
    this.peerConnection.ontrack = (event) => {
      console.log(`[WebRTC] Received remote track: ${event.track.kind}`);
      event.streams[0]?.getTracks().forEach((track) => {
        this.remoteStream.addTrack(track);
      });
      // In case no stream wrapper is provided
      if (!this.remoteStream.getTracks().includes(event.track)) {
        this.remoteStream.addTrack(event.track);
      }
      this.callbacks.onRemoteStream?.(this.remoteStream);
    };
  }

  /**
   * Attach local media stream (Child sender)
   */
  setLocalStream(stream: MediaStream): void {
    this.localStream = stream;
    if (!this.peerConnection) return;

    stream.getTracks().forEach((track) => {
      this.peerConnection?.addTrack(track, stream);
    });
  }

  /**
   * Create WebRTC Offer (Child sender creates offer)
   */
  async createOffer(): Promise<RTCSessionDescriptionInit> {
    if (!this.peerConnection) throw new Error('Peer connection not initialized');

    const offer = await this.peerConnection.createOffer({
      offerToReceiveAudio: false,
      offerToReceiveVideo: false,
    });
    await this.peerConnection.setLocalDescription(offer);
    return offer;
  }

  /**
   * Handle WebRTC Offer and create Answer (Parent receiver)
   */
  async handleOfferAndCreateAnswer(offer: RTCSessionDescriptionInit): Promise<RTCSessionDescriptionInit> {
    if (!this.peerConnection) throw new Error('Peer connection not initialized');

    this.isSettingRemoteDescription = true;
    await this.peerConnection.setRemoteDescription(new RTCSessionDescription(offer));
    this.isSettingRemoteDescription = false;
    await this.flushPendingCandidates();

    const answer = await this.peerConnection.createAnswer();
    await this.peerConnection.setLocalDescription(answer);
    return answer;
  }

  /**
   * Set WebRTC Answer (Child sender receives answer)
   */
  async handleAnswer(answer: RTCSessionDescriptionInit): Promise<void> {
    if (!this.peerConnection) throw new Error('Peer connection not initialized');

    this.isSettingRemoteDescription = true;
    await this.peerConnection.setRemoteDescription(new RTCSessionDescription(answer));
    this.isSettingRemoteDescription = false;
    await this.flushPendingCandidates();
  }

  /**
   * Add incoming ICE candidate with queueing support
   */
  async addIceCandidate(candidate: RTCIceCandidateInit): Promise<void> {
    if (!this.peerConnection || !this.peerConnection.remoteDescription || this.isSettingRemoteDescription) {
      this.pendingCandidates.push(candidate);
      return;
    }

    try {
      await this.peerConnection.addIceCandidate(new RTCIceCandidate(candidate));
    } catch (e) {
      console.warn('[WebRTC] Error adding ICE candidate:', e);
    }
  }

  private async flushPendingCandidates(): Promise<void> {
    if (!this.peerConnection) return;
    while (this.pendingCandidates.length > 0) {
      const cand = this.pendingCandidates.shift();
      if (cand) {
        try {
          await this.peerConnection.addIceCandidate(new RTCIceCandidate(cand));
        } catch (e) {
          console.warn('[WebRTC] Error adding pending ICE candidate:', e);
        }
      }
    }
  }

  /**
   * Trigger ICE restart for reconnection
   */
  async restartIce(): Promise<RTCSessionDescriptionInit | null> {
    if (!this.peerConnection) return null;
    try {
      const offer = await this.peerConnection.createOffer({ iceRestart: true });
      await this.peerConnection.setLocalDescription(offer);
      return offer;
    } catch (e) {
      console.error('[WebRTC] Error creating ICE restart offer:', e);
      return null;
    }
  }

  /**
   * Completely close connection and stop all local media tracks
   */
  close(): void {
    if (this.localStream) {
      this.localStream.getTracks().forEach((track) => {
        try {
          track.stop();
        } catch {
          // Ignore
        }
      });
      this.localStream = null;
    }

    if (this.remoteStream) {
      this.remoteStream.getTracks().forEach((track) => {
        try {
          track.stop();
        } catch {
          // Ignore
        }
      });
      this.remoteStream = new MediaStream();
    }

    if (this.peerConnection) {
      this.peerConnection.onconnectionstatechange = null;
      this.peerConnection.oniceconnectionstatechange = null;
      this.peerConnection.onicecandidate = null;
      this.peerConnection.ontrack = null;
      this.peerConnection.close();
      this.peerConnection = null;
    }

    this.pendingCandidates = [];
    this.callbacks.onConnectionStateChange?.('closed');
  }

  getRemoteStream(): MediaStream {
    return this.remoteStream;
  }
}
