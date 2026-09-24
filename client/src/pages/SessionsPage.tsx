import React, { useState, useEffect } from 'react';
import { History, Calendar, Clock, Video, Mic, CheckCircle2, ShieldAlert, Sparkles } from 'lucide-react';
import { guardianDB, LocalSessionHistory } from '../services/database';
import { formatDuration, formatShortDate, formatTimeRange } from '../utils/formatters';

export const SessionsPage: React.FC = () => {
  const [sessions, setSessions] = useState<LocalSessionHistory[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchSessions = async () => {
      try {
        setLoading(true);
        const data = await guardianDB.getAllSessions();
        setSessions(data);
      } catch (err) {
        console.error('Failed to load session history from IndexedDB:', err);
      } finally {
        setLoading(false);
      }
    };
    fetchSessions();
  }, []);

  return (
    <div className="space-y-8 animate-fadeIn pb-12">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-black text-white tracking-tight">Session History</h2>
          <p className="text-xs sm:text-sm text-slate-400 mt-1">
            Audit logs of past monitoring sessions stored in local IndexedDB
          </p>
        </div>

        <div className="flex items-center space-x-2 text-xs text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 px-3 py-1.5 rounded-xl">
          <Sparkles className="w-4 h-4" />
          <span>Local Parent Device Audit</span>
        </div>
      </div>

      {/* Main List */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden shadow-2xl">
        <div className="p-6 border-b border-slate-800 flex items-center justify-between">
          <div className="flex items-center space-x-2">
            <History className="w-5 h-5 text-emerald-400" />
            <h3 className="font-bold text-white text-base">Completed Sessions</h3>
          </div>
          <span className="text-xs text-slate-400">
            {sessions.length} {sessions.length === 1 ? 'entry' : 'entries'}
          </span>
        </div>

        {loading ? (
          <div className="py-16 text-center text-slate-400 text-sm">
            Loading session audit logs...
          </div>
        ) : sessions.length === 0 ? (
          <div className="py-16 px-6 text-center space-y-3">
            <div className="w-16 h-16 mx-auto rounded-2xl bg-slate-800 border border-slate-700 flex items-center justify-center text-slate-500">
              <History className="w-8 h-8" />
            </div>
            <h4 className="text-base font-semibold text-slate-300">No Prior Sessions</h4>
            <p className="text-xs text-slate-500 max-w-sm mx-auto leading-relaxed">
              When a live monitoring session is completed or stopped, its duration and timestamp are logged locally here.
            </p>
          </div>
        ) : (
          <div className="divide-y divide-slate-800/80">
            {sessions.map((ses) => (
              <div
                key={ses.id}
                className="p-5 sm:p-6 hover:bg-slate-850/50 transition-colors flex flex-col sm:flex-row sm:items-center justify-between gap-4"
              >
                {/* Session Details */}
                <div className="space-y-1.5">
                  <div className="flex items-center space-x-2.5">
                    <span className="text-sm font-bold text-white">{ses.deviceName}</span>
                    <span className="text-xs text-slate-400 flex items-center space-x-1">
                      <Calendar className="w-3.5 h-3.5 text-slate-500" />
                      <span>{formatShortDate(ses.startedAt)}</span>
                    </span>
                  </div>

                  <div className="flex flex-wrap items-center gap-3 text-xs text-slate-400">
                    <span className="flex items-center space-x-1 font-mono text-slate-300">
                      <Clock className="w-3.5 h-3.5 text-slate-500" />
                      <span>{formatTimeRange(ses.startedAt, ses.endedAt)}</span>
                    </span>

                    <span className="font-semibold text-emerald-400">
                      {formatDuration(ses.duration)}
                    </span>

                    <div className="flex items-center space-x-2 text-[11px] text-slate-500 pl-2 border-l border-slate-800">
                      {ses.cameraUsed && (
                        <span className="flex items-center space-x-1 text-slate-400">
                          <Video className="w-3 h-3 text-emerald-500" />
                          <span>Camera</span>
                        </span>
                      )}
                      {ses.microphoneUsed && (
                        <span className="flex items-center space-x-1 text-slate-400">
                          <Mic className="w-3 h-3 text-emerald-500" />
                          <span>Mic</span>
                        </span>
                      )}
                    </div>
                  </div>
                </div>

                {/* Status Badge */}
                <div className="self-start sm:self-auto">
                  <span className={`inline-flex items-center space-x-1.5 px-3 py-1 rounded-full text-xs font-semibold ${
                    ses.status === 'Completed' || ses.status === 'Stopped by Parent'
                      ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
                      : ses.status === 'Stopped by Child'
                      ? 'bg-blue-500/10 text-blue-400 border border-blue-500/20'
                      : 'bg-amber-500/10 text-amber-400 border border-amber-500/20'
                  }`}>
                    {ses.status === 'Completed' || ses.status === 'Stopped by Parent' ? (
                      <CheckCircle2 className="w-3.5 h-3.5" />
                    ) : (
                      <ShieldAlert className="w-3.5 h-3.5" />
                    )}
                    <span>{ses.status}</span>
                  </span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};
