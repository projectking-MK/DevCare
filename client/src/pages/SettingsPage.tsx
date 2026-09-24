import React, { useState, useEffect } from 'react';
import { 
  Settings as SettingsIcon, 
  ShieldCheck, 
  Wifi, 
  HardDrive, 
  AlertTriangle, 
  User, 
  Info,
  ExternalLink,
  CheckCircle2
} from 'lucide-react';
import { useAuth } from '../hooks/useAuth';
import { webrtcApi } from '../services/api';
import { StorageQuotaWidget } from '../parent/StorageQuotaWidget';

export const SettingsPage: React.FC = () => {
  const { user } = useAuth();
  const [iceConfig, setIceConfig] = useState<{ iceServers: RTCIceServer[] } | null>(null);

  useEffect(() => {
    webrtcApi.getIceConfig().then(setIceConfig).catch(console.error);
  }, []);

  return (
    <div className="space-y-8 animate-fadeIn pb-12">
      {/* Header */}
      <div>
        <h2 className="text-2xl font-black text-white tracking-tight">System Settings</h2>
        <p className="text-xs sm:text-sm text-slate-400 mt-1">
          GuardianLink deployment parameters, WebRTC networking, and security disclosures
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Account Profile Box */}
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-xl space-y-4">
          <div className="flex items-center space-x-3">
            <div className="w-10 h-10 rounded-xl bg-slate-800 border border-slate-700 flex items-center justify-center text-emerald-400">
              <User className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-bold text-white text-base">Parent Administrator Account</h3>
              <p className="text-xs text-slate-400">Owner Session</p>
            </div>
          </div>

          <div className="bg-slate-950/80 border border-slate-800 rounded-xl p-4 text-xs space-y-2">
            <div className="flex justify-between">
              <span className="text-slate-400">Email:</span>
              <span className="font-semibold text-slate-200">{user?.email}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-400">Parent ID:</span>
              <span className="font-mono text-slate-300">{user?.parentId}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-400">Session Cookie:</span>
              <span className="text-emerald-400 font-medium">HttpOnly + SameSite=Lax (Secure)</span>
            </div>
          </div>

          <p className="text-[11px] text-slate-500 leading-relaxed">
            In compliance with our zero-database privacy architecture, parent accounts are administered via server environment configurations (<span className="font-mono text-slate-400">PARENT_EMAIL</span> and bcrypt hash).
          </p>
        </div>

        {/* Local Device Storage Box */}
        <div className="space-y-4">
          <StorageQuotaWidget />
        </div>

        {/* WebRTC & STUN/TURN Configuration */}
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-xl space-y-4">
          <div className="flex items-center space-x-3">
            <div className="w-10 h-10 rounded-xl bg-slate-800 border border-slate-700 flex items-center justify-center text-blue-400">
              <Wifi className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-bold text-white text-base">WebRTC & NAT Traversal</h3>
              <p className="text-xs text-slate-400">STUN / TURN Server Status</p>
            </div>
          </div>

          <div className="bg-slate-950/80 border border-slate-800 rounded-xl p-4 text-xs space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-slate-400">Signaling Channel:</span>
              <span className="text-emerald-400 font-medium">Socket.IO (WSS / HTTPS)</span>
            </div>

            <div>
              <span className="text-slate-400 block mb-1">Configured ICE Servers:</span>
              <div className="space-y-1">
                {iceConfig?.iceServers.map((s, idx) => (
                  <div key={idx} className="bg-slate-900 p-2 rounded-lg font-mono text-[11px] text-slate-300 flex items-center justify-between">
                    <span>{Array.isArray(s.urls) ? s.urls.join(', ') : s.urls}</span>
                    <span className="text-emerald-400 text-[10px]">Active</span>
                  </div>
                ))}
              </div>
            </div>
          </div>

          <div className="p-3 rounded-xl bg-blue-500/10 border border-blue-500/20 text-blue-300 text-xs flex items-start space-x-2">
            <Info className="w-4 h-4 flex-shrink-0 mt-0.5" />
            <span>
              For restrictive corporate or symmetric NAT firewalls, configure <span className="font-mono">TURN_SERVER</span>, <span className="font-mono">TURN_USERNAME</span>, and <span className="font-mono">TURN_PASSWORD</span> in your server environment.
            </span>
          </div>
        </div>

        {/* Child Safety & Background Limitations Disclosure */}
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-xl space-y-4">
          <div className="flex items-center space-x-3">
            <div className="w-10 h-10 rounded-xl bg-slate-800 border border-slate-700 flex items-center justify-center text-emerald-400">
              <ShieldCheck className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-bold text-white text-base">Platform Disclosures</h3>
              <p className="text-xs text-slate-400">Browser OS Sandbox Rules</p>
            </div>
          </div>

          <div className="space-y-3 text-xs text-slate-400 leading-relaxed">
            <div className="p-3 bg-slate-950/80 border border-slate-800 rounded-xl space-y-1">
              <p className="font-semibold text-slate-200">OS Background Operation:</p>
              <p>
                Modern mobile and desktop operating systems automatically throttle or suspend background browser tabs. GuardianLink respects all OS constraints and native camera indicators without stealth evasion.
              </p>
            </div>

            <div className="p-3 bg-slate-950/80 border border-slate-800 rounded-xl space-y-1">
              <p className="font-semibold text-slate-200">Zero Persistent Cloud Storage:</p>
              <p>
                No audio, video recordings, or pairing identities are ever stored on a remote server database. Recorded blobs persist solely in the parent browser's local IndexedDB.
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
