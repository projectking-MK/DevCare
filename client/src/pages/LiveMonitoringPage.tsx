import React, { useState, useEffect } from 'react';
import { LiveMonitoringPanel } from '../parent/LiveMonitoringPanel';
import { pairingApi } from '../services/api';
import { connectSocket } from '../services/socket';
import { DevicePairingModal } from '../parent/DevicePairingModal';
import { Video, Plus, Smartphone } from 'lucide-react';

interface PairedDevice {
  deviceId: string;
  deviceName: string;
  isOnline: boolean;
  pairedAt: string;
  lastSeenAt: string;
}

export const LiveMonitoringPage: React.FC = () => {
  const [devices, setDevices] = useState<PairedDevice[]>([]);
  const [selectedDevice, setSelectedDevice] = useState<PairedDevice | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [loading, setLoading] = useState(true);

  const fetchDevices = async () => {
    try {
      setLoading(true);
      const res = await pairingApi.getDevices();
      if (res.success) {
        setDevices(res.devices);
        if (res.devices.length > 0 && !selectedDevice) {
          setSelectedDevice(res.devices[0]);
        }
      }
    } catch (err) {
      console.error('Error fetching devices:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchDevices();

    const socket = connectSocket();
    socket.on('device:status', (data: { deviceId: string; isOnline: boolean }) => {
      setDevices((prev) =>
        prev.map((d) => (d.deviceId === data.deviceId ? { ...d, isOnline: data.isOnline } : d))
      );
      setSelectedDevice((curr) =>
        curr && curr.deviceId === data.deviceId ? { ...curr, isOnline: data.isOnline } : curr
      );
    });

    return () => {
      socket.off('device:status');
    };
  }, []);

  return (
    <div className="space-y-8 animate-fadeIn pb-12">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-black text-white tracking-tight">Live WebRTC Monitoring</h2>
          <p className="text-xs sm:text-sm text-slate-400 mt-1">
            Real-time peer-to-peer camera and microphone streaming with child consent
          </p>
        </div>

        {devices.length > 1 && (
          <div className="flex items-center space-x-2">
            <label className="text-xs text-slate-400">Active Device:</label>
            <select
              value={selectedDevice?.deviceId || ''}
              onChange={(e) => {
                const dev = devices.find((d) => d.deviceId === e.target.value);
                if (dev) setSelectedDevice(dev);
              }}
              className="bg-slate-900 border border-slate-700 text-xs text-white rounded-xl px-3 py-2 focus:outline-none"
            >
              {devices.map((d) => (
                <option key={d.deviceId} value={d.deviceId}>
                  {d.deviceName} ({d.isOnline ? '🟢 Online' : '⚪ Offline'})
                </option>
              ))}
            </select>
          </div>
        )}
      </div>

      {devices.length === 0 && !loading ? (
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-8 text-center space-y-4">
          <div className="w-16 h-16 mx-auto rounded-2xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center text-emerald-400">
            <Smartphone className="w-8 h-8" />
          </div>
          <h3 className="text-lg font-bold text-white">No Child Device Connected</h3>
          <p className="text-xs text-slate-400 max-w-md mx-auto">
            Before initiating a live monitoring session, connect your child's browser using a temporary pairing code.
          </p>
          <button
            onClick={() => setIsModalOpen(true)}
            className="inline-flex items-center space-x-2 px-5 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-semibold text-sm shadow-md transition-colors"
          >
            <Plus className="w-4 h-4" />
            <span>Pair Child Device</span>
          </button>
        </div>
      ) : (
        <LiveMonitoringPanel
          activeDeviceId={selectedDevice?.deviceId}
          activeDeviceName={selectedDevice?.deviceName}
          isDeviceOnline={Boolean(selectedDevice?.isOnline)}
        />
      )}

      <DevicePairingModal
        isOpen={isModalOpen}
        onClose={() => {
          setIsModalOpen(false);
          fetchDevices();
        }}
      />
    </div>
  );
};
