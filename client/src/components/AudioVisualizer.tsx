import React, { useEffect, useRef, useState } from 'react';
import { Mic, MicOff } from 'lucide-react';

interface AudioVisualizerProps {
  stream: MediaStream | null;
  isActive: boolean;
}

export const AudioVisualizer: React.FC<AudioVisualizerProps> = ({ stream, isActive }) => {
  const [level, setLevel] = useState<number>(0);
  const animationFrameRef = useRef<number | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);

  useEffect(() => {
    if (!isActive || !stream || stream.getAudioTracks().length === 0) {
      setLevel(0);
      return;
    }

    try {
      const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      const audioCtx = new AudioCtx();
      audioContextRef.current = audioCtx;

      const analyser = audioCtx.createAnalyser();
      analyser.fftSize = 64;
      analyser.smoothingTimeConstant = 0.5;

      const source = audioCtx.createMediaStreamSource(stream);
      source.connect(analyser);

      const bufferLength = analyser.frequencyBinCount;
      const dataArray = new Uint8Array(bufferLength);

      const updateLevel = () => {
        analyser.getByteFrequencyData(dataArray);
        let sum = 0;
        for (let i = 0; i < bufferLength; i++) {
          sum += dataArray[i];
        }
        const avg = sum / bufferLength;
        const normalized = Math.min(100, Math.round((avg / 128) * 100));
        setLevel(normalized);

        animationFrameRef.current = requestAnimationFrame(updateLevel);
      };

      updateLevel();
    } catch (err) {
      console.warn('[AudioVisualizer] AudioContext init error:', err);
    }

    return () => {
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }
      if (audioContextRef.current && audioContextRef.current.state !== 'closed') {
        audioContextRef.current.close().catch(() => {});
      }
    };
  }, [stream, isActive]);

  return (
    <div className="flex items-center space-x-2.5 px-3 py-1.5 rounded-lg bg-slate-800/80 border border-slate-700/60">
      {isActive && level > 5 ? (
        <Mic className="w-4 h-4 text-emerald-400 animate-pulse" />
      ) : (
        <MicOff className="w-4 h-4 text-slate-500" />
      )}

      {/* Audio Level Meter (5 vertical bars) */}
      <div className="flex items-center space-x-0.5 h-3">
        {[20, 40, 60, 80, 100].map((threshold, idx) => {
          const isBarLit = isActive && level >= threshold;
          return (
            <div
              key={idx}
              className={`w-1 rounded-full transition-all duration-75 ${
                isBarLit
                  ? idx > 3
                    ? 'bg-amber-400 h-3'
                    : 'bg-emerald-400 h-2.5'
                  : 'bg-slate-700 h-1.5'
              }`}
            />
          );
        })}
      </div>

      <span className="text-[11px] font-mono text-slate-400">
        {isActive ? (level > 5 ? 'Audio Live' : 'Silence') : 'Mic Off'}
      </span>
    </div>
  );
};
