import React, { useRef, useState, useEffect } from 'react';
import { 
  Play, 
  Pause, 
  Volume2, 
  VolumeX, 
  Maximize, 
  Minimize, 
  PictureInPicture2,
  VideoOff
} from 'lucide-react';

interface VideoPlayerProps {
  stream?: MediaStream | null;
  src?: string; // For recorded blob URLs
  isLive?: boolean;
  autoPlay?: boolean;
  muted?: boolean;
  className?: string;
  poster?: string;
  fallbackMessage?: string;
}

export const VideoPlayer: React.FC<VideoPlayerProps> = ({
  stream,
  src,
  isLive = false,
  autoPlay = true,
  muted = false,
  className = '',
  fallbackMessage = 'No active video feed'
}) => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const [isPlaying, setIsPlaying] = useState(autoPlay);
  const [isMuted, setIsMuted] = useState(muted);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [hasVideoTrack, setHasVideoTrack] = useState(false);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    if (stream) {
      video.srcObject = stream;
      const checkTracks = () => {
        const tracks = stream.getVideoTracks();
        setHasVideoTrack(tracks.length > 0 && tracks[0].enabled);
      };
      checkTracks();

      // Trigger playback with autoplay policy fallback
      if (autoPlay) {
        video.play().then(() => setIsPlaying(true)).catch((err) => {
          console.warn('[VideoPlayer] Autoplay with audio blocked by browser policy, fallback to muted:', err);
          video.muted = true;
          setIsMuted(true);
          video.play().then(() => setIsPlaying(true)).catch(console.error);
        });
      }

      const handleTrackUpdate = () => {
        checkTracks();
        if (autoPlay && video.paused) {
          video.play().catch(() => {});
        }
      };

      stream.addEventListener('addtrack', handleTrackUpdate);
      stream.addEventListener('removetrack', handleTrackUpdate);

      return () => {
        stream.removeEventListener('addtrack', handleTrackUpdate);
        stream.removeEventListener('removetrack', handleTrackUpdate);
      };
    } else if (src) {
      video.srcObject = null;
      video.src = src;
      setHasVideoTrack(true);
    } else {
      video.srcObject = null;
      video.src = '';
      setHasVideoTrack(false);
    }
  }, [stream, src]);

  // Handle play/pause
  const togglePlay = () => {
    const video = videoRef.current;
    if (!video) return;

    if (video.paused) {
      video.play().then(() => setIsPlaying(true)).catch(() => {});
    } else {
      video.pause();
      setIsPlaying(false);
    }
  };

  // Handle mute/unmute
  const toggleMute = () => {
    const video = videoRef.current;
    if (!video) return;

    video.muted = !video.muted;
    setIsMuted(video.muted);
  };

  // Handle fullscreen
  const toggleFullscreen = async () => {
    if (!containerRef.current) return;

    if (!document.fullscreenElement) {
      try {
        await containerRef.current.requestFullscreen();
        setIsFullscreen(true);
      } catch (err) {
        console.warn('Fullscreen request failed:', err);
      }
    } else {
      try {
        await document.exitFullscreen();
        setIsFullscreen(false);
      } catch (err) {
        console.warn('Exit fullscreen failed:', err);
      }
    }
  };

  // Picture in picture
  const togglePiP = async () => {
    const video = videoRef.current;
    if (!video) return;

    try {
      if (document.pictureInPictureElement) {
        await document.exitPictureInPicture();
      } else if (document.pictureInPictureEnabled) {
        await video.requestPictureInPicture();
      }
    } catch (err) {
      console.warn('PiP error:', err);
    }
  };

  return (
    <div
      ref={containerRef}
      className={`relative group bg-slate-950 rounded-2xl overflow-hidden border border-slate-800 shadow-2xl flex items-center justify-center ${className}`}
    >
      <video
        ref={videoRef}
        autoPlay={autoPlay}
        playsInline
        muted={isMuted}
        className="w-full h-full object-contain"
        onPlay={() => setIsPlaying(true)}
        onPause={() => setIsPlaying(false)}
        onLoadedMetadata={() => {
          if (autoPlay && videoRef.current && videoRef.current.paused) {
            videoRef.current.play().catch(() => {});
          }
        }}
      />

      {/* Fallback overlay when stream is absent or video track is disabled */}
      {(!hasVideoTrack && !src) && (
        <div className="absolute inset-0 flex flex-col items-center justify-center bg-slate-900/90 backdrop-blur-sm p-6 text-center z-10">
          <div className="w-16 h-16 rounded-2xl bg-slate-800 border border-slate-700 flex items-center justify-center mb-3">
            <VideoOff className="w-8 h-8 text-slate-500" />
          </div>
          <p className="text-sm font-medium text-slate-300">{fallbackMessage}</p>
          <p className="text-xs text-slate-500 mt-1">
            Child camera will only become visible after child explicitly grants permission.
          </p>
        </div>
      )}

      {/* Live Badge */}
      {isLive && hasVideoTrack && (
        <div className="absolute top-4 left-4 z-20 flex items-center space-x-2 px-3 py-1 rounded-full bg-red-600/80 backdrop-blur-md text-white text-xs font-semibold shadow-md animate-pulse">
          <span className="w-2 h-2 rounded-full bg-white" />
          <span>LIVE</span>
        </div>
      )}

      {/* Hover Controls Overlay */}
      <div className="absolute bottom-0 inset-x-0 bg-gradient-to-t from-black/80 via-black/40 to-transparent p-4 opacity-0 group-hover:opacity-100 transition-opacity duration-200 flex items-center justify-between z-20">
        <div className="flex items-center space-x-3">
          {!isLive && (
            <button
              onClick={togglePlay}
              className="p-2 rounded-lg bg-white/10 hover:bg-white/20 text-white transition-colors"
              aria-label={isPlaying ? 'Pause' : 'Play'}
            >
              {isPlaying ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4" />}
            </button>
          )}

          <button
            onClick={toggleMute}
            className="p-2 rounded-lg bg-white/10 hover:bg-white/20 text-white transition-colors"
            aria-label={isMuted ? 'Unmute' : 'Mute'}
          >
            {isMuted ? <VolumeX className="w-4 h-4 text-red-400" /> : <Volume2 className="w-4 h-4" />}
          </button>
        </div>

        <div className="flex items-center space-x-2">
          {document.pictureInPictureEnabled && (
            <button
              onClick={togglePiP}
              className="p-2 rounded-lg bg-white/10 hover:bg-white/20 text-white transition-colors"
              title="Picture in Picture"
            >
              <PictureInPicture2 className="w-4 h-4" />
            </button>
          )}

          <button
            onClick={toggleFullscreen}
            className="p-2 rounded-lg bg-white/10 hover:bg-white/20 text-white transition-colors"
            title="Fullscreen"
          >
            {isFullscreen ? <Minimize className="w-4 h-4" /> : <Maximize className="w-4 h-4" />}
          </button>
        </div>
      </div>
    </div>
  );
};
