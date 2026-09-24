import React from 'react';
import { Menu, ShieldCheck, User as UserIcon } from 'lucide-react';
import { useAuth } from '../hooks/useAuth';

interface TopbarProps {
  onOpenMobileMenu: () => void;
  title: string;
}

export const Topbar: React.FC<TopbarProps> = ({ onOpenMobileMenu, title }) => {
  const { user } = useAuth();

  return (
    <header className="h-16 bg-slate-900/90 backdrop-blur-md border-b border-slate-800 px-6 flex items-center justify-between sticky top-0 z-20">
      <div className="flex items-center space-x-4">
        <button
          onClick={onOpenMobileMenu}
          className="md:hidden p-2 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800"
          aria-label="Open sidebar"
        >
          <Menu className="w-5 h-5" />
        </button>
        <h2 className="text-xl font-bold text-white tracking-tight">{title}</h2>
      </div>

      <div className="flex items-center space-x-4">
        {/* Child Safety Badge */}
        <div className="hidden sm:flex items-center space-x-1.5 px-3 py-1 rounded-full bg-emerald-500/10 border border-emerald-500/20 text-xs font-medium text-emerald-400">
          <ShieldCheck className="w-3.5 h-3.5" />
          <span>Transparent Safety System</span>
        </div>

        {/* User Account */}
        <div className="flex items-center space-x-2.5 pl-3 border-l border-slate-800">
          <div className="w-8 h-8 rounded-full bg-slate-800 border border-slate-700 flex items-center justify-center text-slate-300">
            <UserIcon className="w-4 h-4" />
          </div>
          <div className="hidden lg:block text-left">
            <p className="text-xs font-semibold text-slate-200">{user?.email || 'Parent Account'}</p>
            <p className="text-[10px] text-slate-400">Owner Session</p>
          </div>
        </div>
      </div>
    </header>
  );
};
