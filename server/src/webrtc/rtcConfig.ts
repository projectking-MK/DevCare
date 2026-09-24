export interface IceServerConfig {
  urls: string | string[];
  username?: string;
  credential?: string;
}

export interface WebRtcIceConfiguration {
  iceServers: IceServerConfig[];
  iceTransportPolicy?: 'all' | 'relay';
}

/**
 * Generates ICE Server configuration from environment variables.
 * Uses public STUN server as default fallback, plus TURN when configured.
 */
export function getIceConfiguration(): WebRtcIceConfiguration {
  const iceServers: IceServerConfig[] = [];

  // 1. Primary STUN server
  const stunServer = process.env.STUN_SERVER || 'stun:stun.l.google.com:19302';
  if (stunServer) {
    iceServers.push({
      urls: stunServer.startsWith('stun:') ? stunServer : `stun:${stunServer}`
    });
  }

  // Backup public Google STUN for maximum NAT traversal reliability
  if (stunServer !== 'stun:stun.l.google.com:19302') {
    iceServers.push({
      urls: 'stun:stun.l.google.com:19302'
    });
  }

  // 2. TURN Relay Server (if configured in environment)
  const turnServer = process.env.TURN_SERVER;
  const turnUsername = process.env.TURN_USERNAME;
  const turnPassword = process.env.TURN_PASSWORD;

  if (turnServer) {
    const turnConfig: IceServerConfig = {
      urls: turnServer.startsWith('turn:') || turnServer.startsWith('turns:')
        ? turnServer
        : `turn:${turnServer}`
    };

    if (turnUsername) {
      turnConfig.username = turnUsername;
    }
    if (turnPassword) {
      turnConfig.credential = turnPassword;
    }

    iceServers.push(turnConfig);
  }

  return {
    iceServers,
    iceTransportPolicy: 'all'
  };
}
