import React, { useState, useEffect } from 'react';
import { 
  Film, 
  Play, 
  Download, 
  Trash2, 
  X, 
  Calendar, 
  Clock, 
  HardDrive, 
  ShieldCheck, 
  AlertTriangle 
} from 'lucide-react';
import { guardianDB, LocalRecording } from '../services/database';
import { formatDuration, formatDate, formatBytes } from '../utils/formatters';
import { StorageQuotaWidget } from '../parent/StorageQuotaWidget';

export const RecordingsPage: React.FC = () => {
  const [recordings, setRecordings] = useState<LocalRecording[]>([]);
  const [loading, setLoading] = useState(true);
  const [activePlayback, setActivePlayback] = useState<{ recording: LocalRecording; url: string } | null>(null);
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);

  const loadRecordings = async () => {
    try {
      setLoading(true);
      const items = await guardianDB.getAllRecordings();
      setRecordings(items);
    } catch (err) {
      console.error('Failed to load recordings from IndexedDB:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadRecordings();
  }, []);

  // Cleanup object URL when modal closes
  const handleClosePlayback = () => {
    if (activePlayback) {
      URL.revokeObjectURL(activePlayback.url);
      setActivePlayback(null);
    }
  };

  const handlePlay = (recording: LocalRecording) => {
    if (activePlayback) {
      URL.revokeObjectURL(activePlayback.url);
    }
    const url = URL.createObjectURL(recording.blob);
    setActivePlayback({ recording, url });
  };

  const handleDownload = (recording: LocalRecording) => {
    const url = URL.createObjectURL(recording.blob);
    const a = document.createElement('a');
    a.href = url;
    const cleanDate = new Date(recording.createdAt).toISOString().replace(/[:.]/g, '-');
    a.download = `guardianlink_${recording.deviceName.replace(/\s+/g, '_')}_${cleanDate}.webm`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  const handleDelete = async (id: string) => {
    try {
      await guardianDB.deleteRecording(id);
      setRecordings((prev) => prev.filter((r) => r.id !== id));
      if (activePlayback?.recording.id === id) {
        handleClosePlayback();
      }
      setDeleteConfirmId(null);
    } catch (err) {
      console.error('Failed to delete recording:', err);
    }
  };

  return (
    <div className="space-y-8 animate-fadeIn pb-12">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-black text-white tracking-tight">Recordings Library</h2>
          <p className="text-xs sm:text-sm text-slate-400 mt-1">
            Locally stored video clips captured from active child monitoring sessions
          </p>
        </div>

        <div className="flex items-center space-x-2 text-xs text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 px-3 py-1.5 rounded-xl">
          <ShieldCheck className="w-4 h-4" />
          <span>Local Device Storage Only</span>
        </div>
      </div>

      {/* Storage Quota Component */}
      <StorageQuotaWidget onRefresh={loadRecordings} />

      {/* Recordings List */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden shadow-2xl">
        <div className="p-6 border-b border-slate-800 flex items-center justify-between">
          <div className="flex items-center space-x-2">
            <Film className="w-5 h-5 text-emerald-400" />
            <h3 className="font-bold text-white text-base">Saved Local Recordings</h3>
          </div>
          <span className="text-xs text-slate-400 font-medium">
            {recordings.length} {recordings.length === 1 ? 'recording' : 'recordings'}
          </span>
        </div>

        {loading ? (
          <div className="py-16 text-center text-slate-400 text-sm">
            Loading local recordings...
          </div>
        ) : recordings.length === 0 ? (
          <div className="py-16 px-6 text-center space-y-3">
            <div className="w-16 h-16 mx-auto rounded-2xl bg-slate-800 border border-slate-700 flex items-center justify-center text-slate-500">
              <Film className="w-8 h-8" />
            </div>
            <h4 className="text-base font-semibold text-slate-300">No Recordings Saved</h4>
            <p className="text-xs text-slate-500 max-w-sm mx-auto leading-relaxed">
              When monitoring a child device, click "Start Recording" to store encrypted local video clips on this browser.
            </p>
          </div>
        ) : (
          <div className="divide-y divide-slate-800/80">
            {recordings.map((rec) => (
              <div
                key={rec.id}
                className="p-5 sm:p-6 hover:bg-slate-850/50 transition-colors flex flex-col sm:flex-row sm:items-center justify-between gap-4"
              >
                {/* Recording Info */}
                <div className="flex items-start space-x-4">
                  <div className="w-12 h-12 rounded-xl bg-slate-800 border border-slate-700 flex items-center justify-center text-emerald-400 flex-shrink-0 mt-0.5">
                    <Film className="w-6 h-6" />
                  </div>
                  <div className="space-y-1">
                    <h4 className="text-sm font-bold text-white flex items-center space-x-2">
                      <span>📹 {rec.deviceName}</span>
                      <span className="text-[10px] font-mono text-slate-500 font-normal">
                        ({rec.id})
                      </span>
                    </h4>

                    <div className="flex flex-wrap items-center gap-3 text-xs text-slate-400">
                      <span className="flex items-center space-x-1 text-slate-300">
                        <Calendar className="w-3.5 h-3.5 text-slate-500" />
                        <span>{formatDate(rec.createdAt)}</span>
                      </span>

                      <span className="flex items-center space-x-1">
                        <Clock className="w-3.5 h-3.5 text-slate-500" />
                        <span>Duration: {formatDuration(rec.duration)}</span>
                      </span>

                      <span className="flex items-center space-x-1 font-mono text-emerald-400">
                        <HardDrive className="w-3.5 h-3.5 text-slate-500" />
                        <span>Size: {formatBytes(rec.size)}</span>
                      </span>
                    </div>
                  </div>
                </div>

                {/* Actions */}
                <div className="flex items-center space-x-2 self-end sm:self-auto">
                  <button
                    onClick={() => handlePlay(rec)}
                    className="flex items-center space-x-1.5 px-3.5 py-2 rounded-xl bg-emerald-600/15 hover:bg-emerald-600/25 text-emerald-400 font-semibold text-xs border border-emerald-500/30 transition-colors"
                  >
                    <Play className="w-3.5 h-3.5 fill-current" />
                    <span>Play</span>
                  </button>

                  <button
                    onClick={() => handleDownload(rec)}
                    className="flex items-center space-x-1.5 px-3.5 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 font-semibold text-xs border border-slate-700 transition-colors"
                    title="Download to computer"
                  >
                    <Download className="w-3.5 h-3.5" />
                    <span>Download</span>
                  </button>

                  <button
                    onClick={() => setDeleteConfirmId(rec.id)}
                    className="p-2 rounded-xl text-slate-400 hover:text-red-400 hover:bg-red-500/10 transition-colors"
                    title="Delete recording"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Video Playback Modal */}
      {activePlayback && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/85 backdrop-blur-md animate-fadeIn">
          <div className="relative w-full max-w-3xl bg-slate-900 border border-slate-800 rounded-3xl p-6 shadow-2xl space-y-4">
            <div className="flex items-center justify-between pb-2 border-b border-slate-800">
              <div>
                <h3 className="text-base font-bold text-white">
                  📹 {activePlayback.recording.deviceName}
                </h3>
                <p className="text-xs text-slate-400">
                  Recorded: {formatDate(activePlayback.recording.createdAt)} • {formatDuration(activePlayback.recording.duration)} • {formatBytes(activePlayback.recording.size)}
                </p>
              </div>
              <button
                onClick={handleClosePlayback}
                className="p-2 rounded-xl text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="aspect-video w-full bg-black rounded-2xl overflow-hidden border border-slate-800">
              <video
                src={activePlayback.url}
                controls
                autoPlay
                className="w-full h-full object-contain"
              />
            </div>

            <div className="flex items-center justify-between pt-2">
              <span className="text-[11px] text-slate-500">
                Playing locally via Blob URL. File remains securely in IndexedDB.
              </span>
              <button
                onClick={() => handleDownload(activePlayback.recording)}
                className="flex items-center space-x-1.5 px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold"
              >
                <Download className="w-4 h-4" />
                <span>Save to Disk</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete Confirmation Modal */}
      {deleteConfirmId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm animate-fadeIn">
          <div className="w-full max-w-sm bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-2xl space-y-4">
            <div className="flex items-center space-x-3 text-red-400">
              <AlertTriangle className="w-6 h-6 flex-shrink-0" />
              <h4 className="text-base font-bold text-white">Delete Recording?</h4>
            </div>
            <p className="text-xs text-slate-400 leading-relaxed">
              This will permanently remove this recording from your browser's IndexedDB storage. This action cannot be undone.
            </p>
            <div className="flex items-center space-x-3 pt-2">
              <button
                onClick={() => setDeleteConfirmId(null)}
                className="flex-1 py-2.5 px-4 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-semibold transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={() => handleDelete(deleteConfirmId)}
                className="flex-1 py-2.5 px-4 rounded-xl bg-red-600 hover:bg-red-500 text-white text-xs font-bold transition-colors"
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
