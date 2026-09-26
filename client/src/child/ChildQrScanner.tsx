import React, { useRef, useState, useEffect } from 'react';
import jsQR from 'jsqr';
import { Camera, RefreshCw, AlertCircle, CheckCircle2, SwitchCamera, Sparkles } from 'lucide-react';

interface ChildQrScannerProps {
  onScanSuccess: (code: string) => void;
  onCancel?: () => void;
}

export const ChildQrScanner: React.FC<ChildQrScannerProps> = ({ onScanSuccess, onCancel }) => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const animationFrameRef = useRef<number | null>(null);

  const [cameraFacing, setCameraFacing] = useState<'environment' | 'user'>('environment');
  const [hasPermission, setHasPermission] = useState<boolean | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [scannedCode, setScannedCode] = useState<string | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);

  // Extract 6-digit code from any QR payload (URL, text, JSON)
  const extractCode = (qrData: string): string | null => {
    // 1. Check for URL query param ?code=123456
    const urlMatch = qrData.match(/[?&]code=([0-9]{6})/i);
    if (urlMatch && urlMatch[1]) return urlMatch[1];

    // 2. Check for 6 consecutive digits
    const digitsMatch = qrData.match(/\b([0-9]{6})\b/);
    if (digitsMatch && digitsMatch[1]) return digitsMatch[1];

    // 3. Fallback: clean all digits
    const clean = qrData.replace(/\D/g, '');
    if (clean.length === 6) return clean;

    return null;
  };

  const startCamera = async (facing: 'environment' | 'user') => {
    // Stop any existing stream
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }

    setErrorMessage(null);

    try {
      const constraints: MediaStreamConstraints = {
        video: {
          facingMode: { ideal: facing },
          width: { ideal: 1280 },
          height: { ideal: 720 }
        },
        audio: false
      };

      const stream = await navigator.mediaDevices.getUserMedia(constraints);
      streamRef.current = stream;

      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
      }

      setHasPermission(true);
      requestScanFrame();
    } catch (err) {
      console.warn('[QR Scanner] Camera start error:', err);
      // Fallback: try without facingMode constraint if environment failed
      if (facing === 'environment') {
        try {
          const fallbackStream = await navigator.mediaDevices.getUserMedia({ video: true, audio: false });
          streamRef.current = fallbackStream;
          if (videoRef.current) {
            videoRef.current.srcObject = fallbackStream;
            await videoRef.current.play();
          }
          setHasPermission(true);
          requestScanFrame();
          return;
        } catch {
          // Ignore
        }
      }

      const isDenied = err instanceof DOMException && err.name === 'NotAllowedError';
      setHasPermission(false);
      setErrorMessage(
        isDenied
          ? 'Camera permission denied. Please allow camera access in browser settings.'
          : 'Could not start camera for QR scanning.'
      );
    }
  };

  const stopCamera = () => {
    if (animationFrameRef.current) {
      cancelAnimationFrame(animationFrameRef.current);
      animationFrameRef.current = null;
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
  };

  const requestScanFrame = () => {
    if (animationFrameRef.current) {
      cancelAnimationFrame(animationFrameRef.current);
    }
    animationFrameRef.current = requestAnimationFrame(scanTick);
  };

  const scanTick = () => {
    if (isProcessing) return;

    const video = videoRef.current;
    const canvas = canvasRef.current;

    if (video && video.readyState === video.HAVE_ENOUGH_DATA && canvas) {
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;

      const ctx = canvas.getContext('2d', { willReadFrequently: true });
      if (ctx) {
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
        const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
        const code = jsQR(imageData.data, imageData.width, imageData.height, {
          inversionAttempts: 'dontInvert'
        });

        if (code && code.data) {
          const detected = extractCode(code.data);
          if (detected) {
            setIsProcessing(true);
            setScannedCode(detected);
            stopCamera();

            // Brief pause to show green success ring
            setTimeout(() => {
              onScanSuccess(detected);
            }, 600);
            return;
          }
        }
      }
    }

    animationFrameRef.current = requestAnimationFrame(scanTick);
  };

  useEffect(() => {
    startCamera(cameraFacing);
    return () => {
      stopCamera();
    };
  }, [cameraFacing]);

  const toggleCameraFacing = () => {
    setCameraFacing((curr) => (curr === 'environment' ? 'user' : 'environment'));
  };

  return (
    <div className="relative w-full flex flex-col items-center space-y-4">
      {/* Hidden processing canvas */}
      <canvas ref={canvasRef} className="hidden" />

      {/* Viewfinder Window */}
      <div className="relative w-full aspect-square max-w-[320px] rounded-3xl overflow-hidden bg-black border-2 border-slate-700 shadow-2xl flex items-center justify-center group">
        <video
          ref={videoRef}
          playsInline
          muted
          autoPlay
          className="w-full h-full object-cover"
        />

        {/* Scanning Target Box & Reticle */}
        <div className="absolute inset-0 flex items-center justify-center p-8 pointer-events-none">
          <div className="relative w-full h-full border-2 border-emerald-500/70 rounded-2xl shadow-[0_0_20px_rgba(16,185,129,0.25)]">
            {/* Corner Markers */}
            <span className="absolute -top-1 -left-1 w-6 h-6 border-t-4 border-l-4 border-emerald-400 rounded-tl-lg" />
            <span className="absolute -top-1 -right-1 w-6 h-6 border-t-4 border-r-4 border-emerald-400 rounded-tr-lg" />
            <span className="absolute -bottom-1 -left-1 w-6 h-6 border-b-4 border-l-4 border-emerald-400 rounded-bl-lg" />
            <span className="absolute -bottom-1 -right-1 w-6 h-6 border-b-4 border-r-4 border-emerald-400 rounded-br-lg" />

            {/* Moving Laser Scanner Line */}
            {!scannedCode && (
              <div className="absolute inset-x-0 h-0.5 bg-gradient-to-r from-emerald-500/20 via-emerald-400 to-emerald-500/20 shadow-[0_0_10px_#10b981] animate-scanner" />
            )}
          </div>
        </div>

        {/* Scanned Success Overlay */}
        {scannedCode && (
          <div className="absolute inset-0 bg-emerald-950/80 backdrop-blur-sm flex flex-col items-center justify-center space-y-2 z-20 animate-fadeIn">
            <div className="w-16 h-16 rounded-full bg-emerald-500 flex items-center justify-center text-black shadow-lg shadow-emerald-500/50 animate-bounce">
              <CheckCircle2 className="w-10 h-10" />
            </div>
            <p className="text-sm font-bold text-white">QR Code Verified!</p>
            <p className="font-mono text-xl font-black text-emerald-300 tracking-widest">{scannedCode}</p>
          </div>
        )}

        {/* Camera Switch Button */}
        {hasPermission && (
          <button
            onClick={toggleCameraFacing}
            type="button"
            className="absolute bottom-3 right-3 z-10 p-2.5 rounded-full bg-black/60 hover:bg-black/80 backdrop-blur-md text-white border border-white/20 shadow-lg transition-transform active:scale-90 cursor-pointer"
            title="Switch front / rear camera"
          >
            <SwitchCamera className="w-4 h-4 text-emerald-400" />
          </button>
        )}

        {/* Camera Error Message */}
        {hasPermission === false && (
          <div className="absolute inset-0 bg-slate-900/95 flex flex-col items-center justify-center p-6 text-center space-y-3 z-20">
            <AlertCircle className="w-10 h-10 text-red-400" />
            <p className="text-xs text-slate-300 leading-relaxed">{errorMessage}</p>
            <button
              onClick={() => startCamera(cameraFacing)}
              type="button"
              className="inline-flex items-center space-x-1.5 px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold border border-slate-700 cursor-pointer"
            >
              <RefreshCw className="w-3.5 h-3.5" />
              <span>Retry Camera</span>
            </button>
          </div>
        )}
      </div>

      {/* Guidance Text */}
      <div className="text-center space-y-1">
        <p className="text-xs font-medium text-slate-200 flex items-center justify-center space-x-1.5">
          <Sparkles className="w-3.5 h-3.5 text-emerald-400" />
          <span>Point camera at the QR code on the parent's screen</span>
        </p>
        <p className="text-[11px] text-slate-400">
          The device pairs automatically as soon as the QR is scanned.
        </p>
      </div>

      {onCancel && (
        <button
          onClick={onCancel}
          type="button"
          className="text-xs text-slate-400 hover:text-white underline pt-1 cursor-pointer"
        >
          Enter 6-digit code manually instead
        </button>
      )}
    </div>
  );
};
