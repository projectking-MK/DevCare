import React, { useState, useEffect } from 'react';
import { 
  Smartphone, 
  Video, 
  Mic, 
  Wifi, 
  Plus, 
  Clock, 
  Film, 
  History, 
  CheckCircle2,
  AlertCircle
} from 'lucide-react';
import { StatusCard } from '../components/StatusCard';
import { LiveMonitoringPanel } from '../parent/LiveMonitoringPanel';
import { DevicePairingModal } from '../parent/DevicePairingModal';
import { StorageQuotaWidget } from '../parent/StorageQuotaWidget';
import { pairingApi } from '../services/api';
import { guardianDB, LocalRecording, LocalSessionHistory } from '../services/database';
import { connectSocket } from '../services/socket';
import { formatDuration, formatDate, formatBytes } from '../utils/formatters';
import { NavLink } from 'react-router-dom';

interface PairedDeviceItem {
  deviceId: string;
  deviceName: string;
  isOnline: boolean;
  pairedAt: string;
  lastSeenAt: string;
}

export const DashboardPage: React.FC = () => {
  const [devices, setDevices] = useState<PairedDeviceItem[]>([]);
  const [selectedDevice, setSelectedDevice] = useState<PairedDeviceItem | null>(null);
  const [recentRecordings, setRecentRecordings] = useState<LocalRecording[]>([]);
  const [recentSessions, setRecentSessions] = useState<LocalSessionHistory[]>([]);
  const [isPairingModalOpen, setIsPairingModalOpen] = useState(false);
  const [loading, setLoading] = useState(true);

  const fetchDevices = async () => {
    try {
      const res = await pairingApi.getDevices();
      if (res.success) {
        setDevices(res.devices);
        if (res.devices.length > 0) {
          const savedId = localStorage.getItem('gl_parent_selected_device');
          const matched = res.devices.find((d) => d.deviceId === savedId);
          const active = matched || res.devices[0];
          setSelectedDevice(active);
          try {
            localStorage.setItem('gl_parent_selected_device', active.deviceId);
          } catch {
            // Ignore
          }
        }
      }
    } catch (err) {
      console.error('Failed to load devices:', err);
    }
  };

  const fetchLocalData = async () => {
    try {
      const recordings = await guardianDB.getAllRecordings();
      setRecentRecordings(recordings.slice(0, 3));

      const sessions = await guardianDB.getAllSessions();
      setRecentSessions(sessions.slice(0, 3));
    } catch (err) {
      console.error('Failed to load IndexedDB data:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchDevices();
    fetchLocalData();

    // Connect socket for parent room
    const socket = connectSocket();
    socket.emit('auth:parent', (res: { success: boolean }) => {
      console.log('[Dashboard] Socket parent auth response:', res);
    });

    // Listen for new devices paired in real-time
    socket.on('device:paired', (data: { device: PairedDeviceItem }) => {
      setDevices((prev) => {
        const exists = prev.some((d) => d.deviceId === data.device.deviceId);
        if (exists) return prev;
        return [...prev, data.device];
      });
      setSelectedDevice(data.device);
      try {
        localStorage.setItem('gl_parent_selected_device', data.device.deviceId);
      } catch {
        // Ignore
      }
    });

    // Listen for device online/offline status updates
    socket.on('device:status', (data: { deviceId: string; isOnline: boolean }) => {
      setDevices((prev) =>
        prev.map((d) => (d.deviceId === data.deviceId ? { ...d, isOnline: data.isOnline } : d))
      );
      setSelectedDevice((curr) =>
        curr && curr.deviceId === data.deviceId ? { ...curr, isOnline: data.isOnline } : curr
      );
    });

    return () => {
      socket.off('device:paired');
      socket.off('device:status');
    };
  }, []);

  const isOnline = Boolean(selectedDevice?.isOnline);

  return (
    <div className="space-y-8 pb-12 animate-fadeIn">
      {/* Top Banner & Quick Pairing Action */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-black text-white tracking-tight">Parent Dashboard</h2>
          <p className="text-xs sm:text-sm text-slate-400 mt-1">
            Real-time, cooperative child safety monitoring with local device recording
          </p>
        </div>

        <button
          onClick={() => setIsPairingModalOpen(true)}
          className="inline-flex items-center space-x-2 px-4 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-semibold text-xs sm:text-sm shadow-lg shadow-emerald-950/40 transition-all self-start sm:self-auto"
        >
          <Plus className="w-4 h-4" />
          <span>Pair Child Device</span>
        </button>
      </div>

      {/* Overview Status Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatusCard
          title="Child Device"
          value={devices.length === 0 ? 'No Device' : isOnline ? 'Online' : 'Offline'}
          status={devices.length === 0 ? 'inactive' : isOnline ? 'active' : 'inactive'}
          icon={Smartphone}
          subtitle={selectedDevice ? selectedDevice.deviceName : 'Pair a device to begin'}
        />

        <StatusCard
          title="Camera Stream"
          value={isOnline ? 'Standby' : 'Off'}
          status={isOnline ? 'neutral' : 'inactive'}
          icon={Video}
          subtitle="Explicit child approval required"
        />

        <StatusCard
          title="Microphone"
          value={isOnline ? 'Standby' : 'Off'}
          status={isOnline ? 'neutral' : 'inactive'}
          icon={Mic}
          subtitle="Two-way WebRTC audio ready"
        />

        <StatusCard
          title="WebRTC Signaling"
          value="P2P / STUN"
          status="active"
          icon={Wifi}
          subtitle="Encrypted peer connection"
        />
      </div>

      {/* Main Monitoring Section */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        <div className="lg:col-span-2 space-y-6">
          {devices.length === 0 ? (
            <div className="bg-slate-900 border border-slate-800 rounded-2xl p-8 text-center space-y-4">
              <div className="w-16 h-16 mx-auto rounded-2xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center text-emerald-400">
                <Smartphone className="w-8 h-8" />
              </div>
              <h3 className="text-lg font-bold text-white">No Child Device Paired Yet</h3>
              <p className="text-xs text-slate-400 max-w-md mx-auto">
                Generate a temporary pairing code to connect your child's smartphone, tablet, or laptop. No permanent database is used.
              </p>
              <button
                onClick={() => setIsPairingModalOpen(true)}
                className="inline-flex items-center space-x-2 px-5 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-semibold text-sm shadow-md transition-colors"
              >
                <Plus className="w-4 h-4" />
                <span>Generate Pairing Code</span>
              </button>
            </div>
          ) : (
            <LiveMonitoringPanel
              activeDeviceId={selectedDevice?.deviceId}
              activeDeviceName={selectedDevice?.deviceName}
              isDeviceOnline={isOnline}
            />
          )}
        </div>

        {/* Right Sidebar: Storage Quota & Quick History */}
        <div className="space-y-6">
          <StorageQuotaWidget onRefresh={fetchLocalData} />

          {/* Device Selector */}
          {devices.length > 1 && (
            <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 space-y-3">
              <h4 className="text-xs font-semibold text-slate-300 uppercase tracking-wider">
                Select Child Device
              </h4>
              <div className="space-y-2">
                {devices.map((dev) => (
                  <button
                    key={dev.deviceId}
                    onClick={() => setSelectedDevice(dev)}
                    className={`w-full text-left px-3.5 py-2.5 rounded-xl border text-xs flex items-center justify-between transition-colors ${
                      selectedDevice?.deviceId === dev.deviceId
                        ? 'bg-emerald-500/10 border-emerald-500/30 text-white'
                        : 'bg-slate-950 border-slate-800 text-slate-300 hover:bg-slate-800'
                    }`}
                  >
                    <div>
                      <p className="font-semibold">{dev.deviceName}</p>
                      <p className="text-[10px] text-slate-400 font-mono">{dev.deviceId}</p>
                    </div>
                    <span className={`w-2 h-2 rounded-full ${dev.isOnline ? 'bg-emerald-400' : 'bg-slate-600'}`} />
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Recent Recordings Card */}
          <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-2">
                <Film className="w-4 h-4 text-emerald-400" />
                <h4 className="text-xs font-semibold text-slate-300 uppercase tracking-wider">
                  Recent Recordings
                </h4>
              </div>
              <NavLink to="/recordings" className="text-xs text-emerald-400 hover:underline">
                View All
              </NavLink>
            </div>

            {recentRecordings.length === 0 ? (
              <p className="text-xs text-slate-500 py-3 text-center">
                No local recordings yet. Click "Start Recording" during live monitoring.
              </p>
            ) : (
              <div className="space-y-2 pt-1">
                {recentRecordings.map((rec) => (
                  <div
                    key={rec.id}
                    className="p-3 bg-slate-950/70 border border-slate-800 rounded-xl flex items-center justify-between text-xs"
                  >
                    <div>
                      <p className="font-semibold text-slate-200">{rec.deviceName}</p>
                      <p className="text-[10px] text-slate-500">{formatDate(rec.createdAt)}</p>
                    </div>
                    <div className="text-right">
                      <p className="font-mono text-emerald-400">{formatDuration(rec.duration)}</p>
                      <p className="text-[10px] text-slate-500">{formatBytes(rec.size)}</p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Quick Sessions Summary */}
          <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-2">
                <History className="w-4 h-4 text-emerald-400" />
                <h4 className="text-xs font-semibold text-slate-300 uppercase tracking-wider">
                  Recent Sessions
                </h4>
              </div>
              <NavLink to="/sessions" className="text-xs text-emerald-400 hover:underline">
                View All
              </NavLink>
            </div>

            {recentSessions.length === 0 ? (
              <p className="text-xs text-slate-500 py-3 text-center">
                No monitoring session history yet.
              </p>
            ) : (
              <div className="space-y-2 pt-1">
                {recentSessions.map((ses) => (
                  <div
                    key={ses.id}
                    className="p-3 bg-slate-950/70 border border-slate-800 rounded-xl flex items-center justify-between text-xs"
                  >
                    <div>
                      <p className="font-semibold text-slate-200">{ses.deviceName}</p>
                      <p className="text-[10px] text-slate-500">{formatDate(ses.startedAt)}</p>
                    </div>
                    <div className="text-right">
                      <span className="px-2 py-0.5 rounded-full text-[10px] bg-slate-800 text-slate-300">
                        {formatDuration(ses.duration)}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Temporary Pairing Modal */}
      <DevicePairingModal
        isOpen={isPairingModalOpen}
        onClose={() => {
          setIsPairingModalOpen(false);
          fetchDevices();
        }}
      />
    </div>
  );
};
