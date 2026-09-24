import React from 'react';
import { NavLink, useNavigate } from 'react-router-dom';
import { 
  Shield, 
  LayoutDashboard, 
  Smartphone, 
  Video, 
  Film, 
  History, 
  Settings, 
  LogOut,
  ExternalLink
} from 'lucide-react';
import { useAuth } from '../hooks/useAuth';

interface SidebarProps {
  onCloseMobile?: () => void;
}

export const Sidebar: React.FC<SidebarProps> = ({ onCloseMobile }) => {
  const { logout } = useAuth();
  const navigate = useNavigate();

  const handleLogout = async () => {
    try {
      await logout();
      navigate('/login');
    } catch (err) {
      console.error('Logout error:', err);
      navigate('/login');
    }
  };

  const navItems = [
    { to: '/', label: 'Dashboard', icon: LayoutDashboard },
    { to: '/devices', label: 'Child Device', icon: Smartphone },
    { to: '/monitoring', label: 'Live Monitoring', icon: Video },
    { to: '/recordings', label: 'Recordings', icon: Film },
    { to: '/sessions', label: 'Sessions', icon: History },
    { to: '/settings', label: 'Settings', icon: Settings },
  ];

  return (
    <aside className="w-64 bg-slate-900 border-r border-slate-800 flex flex-col h-full select-none">
      {/* Brand Header */}
      <div className="p-6 border-b border-slate-800 flex items-center justify-between">
        <div className="flex items-center space-x-3">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-brand-600 to-emerald-400 flex items-center justify-center shadow-lg shadow-emerald-950/40">
            <Shield className="w-6 h-6 text-white" />
          </div>
          <div>
            <h1 className="font-bold text-lg text-white tracking-tight">GuardianLink</h1>
            <p className="text-xs text-emerald-400 font-medium tracking-wide uppercase">Child Safety</p>
          </div>
        </div>
      </div>

      {/* Navigation */}
      <nav className="flex-1 px-4 py-6 space-y-1.5 overflow-y-auto">
        {navItems.map((item) => {
          const Icon = item.icon;
          return (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.to === '/'}
              onClick={onCloseMobile}
              className={({ isActive }) =>
                `flex items-center space-x-3 px-3.5 py-2.5 rounded-lg text-sm font-medium transition-all duration-150 ${
                  isActive
                    ? 'bg-brand-600/15 text-emerald-400 border border-emerald-500/20 shadow-sm'
                    : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/60'
                }`
              }
            >
              <Icon className="w-5 h-5 flex-shrink-0" />
              <span>{item.label}</span>
            </NavLink>
          );
        })}

        {/* Direct link to open Child view in new tab for testing */}
        <div className="pt-4 border-t border-slate-800/80 my-3">
          <a
            href="/child"
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center justify-between px-3.5 py-2 rounded-lg text-xs font-medium text-slate-400 hover:text-emerald-300 hover:bg-slate-800/40 transition-colors"
          >
            <span className="flex items-center space-x-2">
              <Smartphone className="w-4 h-4 text-emerald-500" />
              <span>Open Child View</span>
            </span>
            <ExternalLink className="w-3.5 h-3.5" />
          </a>
        </div>
      </nav>

      {/* User / Logout Footer */}
      <div className="p-4 border-t border-slate-800 bg-slate-900/60">
        <button
          onClick={handleLogout}
          className="w-full flex items-center space-x-3 px-3.5 py-2.5 rounded-lg text-sm font-medium text-red-400 hover:text-red-300 hover:bg-red-500/10 transition-colors"
        >
          <LogOut className="w-5 h-5 flex-shrink-0" />
          <span>Logout</span>
        </button>
      </div>
    </aside>
  );
};
