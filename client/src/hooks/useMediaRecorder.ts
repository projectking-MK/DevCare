import { useState, useRef, useEffect, useCallback } from 'react';
import { guardianDB } from '../services/database';

export interface RecorderState {
  isRecording: boolean;
  duration: number; // in seconds
  error: string | null;
  storageWarning: string | null;
}

export function useMediaRecorder(stream: MediaStream | null, deviceId: string, deviceName: string, sessionId: string) {
  const [isRecording, setIsRecording] = useState(false);
  const [duration, setDuration] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [storageWarning, setStorageWarning] = useState<string | null>(null);

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const recordedChunksRef = useRef<Blob[]>([]);
  const timerIntervalRef = useRef<number | null>(null);
  const recordingStartTimeRef = useRef<number>(0);

  // Clear timer on unmount
  useEffect(() => {
    return () => {
      if (timerIntervalRef.current) {
        clearInterval(timerIntervalRef.current);
      }
      if (mediaRecorderRef.current && mediaRecorderRef.current.state === 'recording') {
        mediaRecorderRef.current.stop();
      }
    };
  }, []);

  const checkStorageLimit = async (): Promise<boolean> => {
    try {
      const estimate = await guardianDB.getStorageEstimate();
      if (estimate.isSupported) {
        // If quota exceeded 95%
        if (estimate.percentage >= 95) {
          setStorageWarning('Storage limit reached. Delete an existing recording before recording again.');
          return false;
        } else if (estimate.percentage >= 80) {
          setStorageWarning('Storage is running low (>80% used). Consider downloading and deleting old recordings.');
        } else {
          setStorageWarning(null);
        }
      }
      return true;
    } catch {
      return true;
    }
  };

  const startRecording = useCallback(async () => {
    setError(null);

    if (!stream || stream.getTracks().length === 0) {
      setError('Cannot record: No active video or audio stream available.');
      return;
    }

    const canProceed = await checkStorageLimit();
    if (!canProceed) {
      setError('Storage limit reached. Delete an existing recording before recording again.');
      return;
    }

    recordedChunksRef.current = [];

    // Find supported MIME type
    let mimeType = 'video/webm;codecs=vp8,opus';
    if (!MediaRecorder.isTypeSupported(mimeType)) {
      if (MediaRecorder.isTypeSupported('video/webm')) {
        mimeType = 'video/webm';
      } else if (MediaRecorder.isTypeSupported('video/mp4')) {
        mimeType = 'video/mp4';
      } else {
        mimeType = '';
      }
    }

    try {
      const recorder = mimeType ? new MediaRecorder(stream, { mimeType }) : new MediaRecorder(stream);

      recorder.ondataavailable = (event) => {
        if (event.data && event.data.size > 0) {
          recordedChunksRef.current.push(event.data);
        }
      };

      recorder.onstop = async () => {
        const finalDuration = Math.round((Date.now() - recordingStartTimeRef.current) / 1000);
        const finalBlob = new Blob(recordedChunksRef.current, {
          type: recorder.mimeType || 'video/webm'
        });

        if (finalBlob.size > 0) {
          const recId = `rec_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
          await guardianDB.saveRecording({
            id: recId,
            sessionId: sessionId || 'unknown',
            deviceId: deviceId || 'unknown',
            deviceName: deviceName || 'Child Device',
            createdAt: new Date().toISOString(),
            duration: Math.max(1, finalDuration),
            size: finalBlob.size,
            mimeType: recorder.mimeType || 'video/webm',
            blob: finalBlob
          });
          console.log(`[MediaRecorder] Local recording saved to IndexedDB: ${recId} (${finalBlob.size} bytes)`);
        }
      };

      recorder.onerror = (e) => {
        console.error('[MediaRecorder] Error during recording:', e);
        setError('Recording failed due to media stream error.');
        setIsRecording(false);
      };

      // Start recording with 1-second timeslices
      recorder.start(1000);
      mediaRecorderRef.current = recorder;
      recordingStartTimeRef.current = Date.now();
      setIsRecording(true);
      setDuration(0);

      // Start duration counter
      timerIntervalRef.current = window.setInterval(() => {
        setDuration(Math.round((Date.now() - recordingStartTimeRef.current) / 1000));
      }, 1000);

    } catch (err) {
      console.error('[MediaRecorder] Failed to start MediaRecorder:', err);
      setError('Failed to start recording: ' + (err instanceof Error ? err.message : 'Unknown error'));
      setIsRecording(false);
    }
  }, [stream, deviceId, deviceName, sessionId]);

  const stopRecording = useCallback(() => {
    if (timerIntervalRef.current) {
      clearInterval(timerIntervalRef.current);
      timerIntervalRef.current = null;
    }

    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      mediaRecorderRef.current.stop();
    }

    setIsRecording(false);
  }, []);

  return {
    isRecording,
    duration,
    error,
    storageWarning,
    startRecording,
    stopRecording,
  };
}
