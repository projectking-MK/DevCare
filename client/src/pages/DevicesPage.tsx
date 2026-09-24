import React, { useState, useEffect } from 'react';
import { Smartphone, Plus, Trash2, Wifi, Calendar, Clock, AlertTriangle, ShieldCheck } from 'lucide-react';
import { pairingApi } from '../services/api';
import { formatDate } from '../utils/formatters';
import { DevicePairingModal } from '../parent/DevicePairingModal';
import { connectSocket } from '../services/socket';

interface PairedDevice {
  deviceId: string;
  deviceName: string;
  isOnline: boolean;
  pairedAt: string;
  lastSeenAt: string;
}

export const DevicesPage: React.FC = () => {
  const [devices, setDevices] = useState<PairedDevice[]>([]);
  const [loading, setLoading] = useState(true);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [unpairingId, setUnpairingId] = useState<string | null>(null);

  const fetchDevices = async () => {
    try {
      setLoading(true);
      const res = await pairingApi.getDevices();
      if (res.success) {
        setDevices(res.devices);
      }
    } catch (err) {
      console.error('Failed to load paired devices:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchDevices();

    const socket = connectSocket();
    socket.on('device:paired', (data: { device: PairedDevice }) => {
      setDevices((prev) => {
        if (prev.some((d) => d.deviceId === data.device.deviceId)) return prev;
        return [...prev, data.device];
      });
    });

    socket.on('device:status', (data: { deviceId: string; isOnline: boolean }) => {
      setDevices((prev) =>
        prev.map((d) => (d.deviceId === data.deviceId ? { ...d, isOnline: data.isOnline } : d))
      );
    });

    return () => {
      socket.off('device:paired');
      socket.off('device:status');
    };
  }, []);

  const handleUnpair = async (deviceId: string) => {
    try {
      await pairingApi.unpairDevice(deviceId);
      setDevices((prev) => prev.filter((d) => d.deviceId !== deviceId));
      setUnpairingId(null);
    } catch (err) {
      console.error('Failed to unpair device:', err);
    }
  };

  return (
    <div className="space-y-8 animate-fadeIn pb-12">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-black text-white tracking-tight">Child Devices</h2>
          <p className="text-xs sm:text-sm text-slate-400 mt-1">
            Manage paired smartphones, tablets, and browser endpoints
          </p>
        </div>

        <button
          onClick={() => setIsModalOpen(true)}
          className="inline-flex items-center space-x-2 px-4 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-semibold text-xs sm:text-sm shadow-lg shadow-emerald-950/40 transition-all self-start sm:self-auto"
        >
          <Plus className="w-4 h-4" />
          <span>Pair New Device</span>
        </button>
      </div>

      {/* Devices List Card */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden shadow-2xl">
        <div className="p-6 border-b border-slate-800 flex items-center justify-between">
          <div className="flex items-center space-x-2">
            <Smartphone className="w-5 h-5 text-emerald-400" />
            <h3 className="font-bold text-white text-base">Paired Devices</h3>
          </div>
          <span className="text-xs text-slate-400">
            {devices.length} {devices.length === 1 ? 'device' : 'devices'}
          </span>
        </div>

        {loading ? (
          <div className="py-16 text-center text-slate-400 text-sm">
            Loading paired devices...
          </div>
        ) : devices.length === 0 ? (
          <div className="py-16 px-6 text-center space-y-3">
            <div className="w-16 h-16 mx-auto rounded-2xl bg-slate-800 border border-slate-700 flex items-center justify-center text-slate-500">
              <Smartphone className="w-8 h-8" />
            </div>
            <h4 className="text-base font-semibold text-slate-300">No Paired Devices</h4>
            <p className="text-xs text-slate-500 max-w-sm mx-auto leading-relaxed">
              Pair your child's browser or device by clicking "Pair New Device" and entering the generated code.
            </p>
          </div>
        ) : (
          <div className="divide-y divide-slate-800/80">
            {devices.map((dev) => (
              <div
                key={dev.deviceId}
                className="p-5 sm:p-6 hover:bg-slate-850/50 transition-colors flex flex-col sm:flex-row sm:items-center justify-between gap-4"
              >
                <div className="flex items-start space-x-4">
                  <div className="w-12 h-12 rounded-xl bg-slate-800 border border-slate-700 flex items-center justify-center text-emerald-400 flex-shrink-0 mt-0.5">
                    <Smartphone className="w-6 h-6" />
                  </div>
                  <div className="space-y-1">
                    <div className="flex items-center space-x-2">
                      <h4 className="text-sm font-bold text-white">{dev.deviceName}</h4>
                      <span className={`inline-flex items-center space-x-1 px-2.5 py-0.5 rounded-full text-[10px] font-semibold ${
                        dev.isOnline
                          ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
                          : 'bg-slate-800 text-slate-400 border border-slate-700'
                      }`}>
                        <span className={`w-1.5 h-1.5 rounded-full ${dev.isOnline ? 'bg-emerald-500 animate-pulse' : 'bg-slate-500'}`} />
                        <span>{dev.isOnline ? 'Online' : 'Offline'}</span>
                      </span>
                    </div>

                    <div className="flex flex-wrap items-center gap-3 text-xs text-slate-400">
                      <span className="font-mono text-slate-500">ID: {dev.deviceId}</span>
                      <span className="flex items-center space-x-1">
                        <Calendar className="w-3.5 h-3.5 text-slate-500" />
                        <span>Paired: {formatDate(dev.pairedAt)}</span>
                      </span>
                    </div>
                  </div>
                </div>

                <div className="flex items-center space-x-3 self-end sm:self-auto">
                  <button
                    onClick={() => setUnpairingId(dev.deviceId)}
                    className="flex items-center space-x-1.5 px-3.5 py-2 rounded-xl text-xs font-semibold text-slate-400 hover:text-red-400 hover:bg-red-500/10 transition-colors"
                  >
                    <Trash2 className="w-4 h-4" />
                    <span>Unpair</span>
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Unpair Confirm Modal */}
      {unpairingId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm animate-fadeIn">
          <div className="w-full max-w-sm bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-2xl space-y-4">
            <div className="flex items-center space-x-3 text-red-400">
              <AlertTriangle className="w-6 h-6 flex-shrink-0" />
              <h4 className="text-base font-bold text-white">Unpair Child Device?</h4>
            </div>
            <p className="text-xs text-slate-400 leading-relaxed">
              This will immediately disconnect the child device and revoke its active connection relationship.
            </p>
            <div className="flex items-center space-x-3 pt-2">
              <button
                onClick={() => setUnpairingId(null)}
                className="flex-1 py-2.5 px-4 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-semibold"
              >
                Cancel
              </button>
              <button
                onClick={() => handleUnpair(unpairingId)}
                className="flex-1 py-2.5 px-4 rounded-xl bg-red-600 hover:bg-red-500 text-white text-xs font-bold"
              >
                Confirm Unpair
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Pairing Modal */}
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
