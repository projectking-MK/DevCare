import React from 'react';
import { LucideIcon } from 'lucide-react';

interface StatusCardProps {
  title: string;
  value: string;
  status?: 'active' | 'inactive' | 'warning' | 'neutral';
  icon: LucideIcon;
  subtitle?: string;
  badge?: string;
}

export const StatusCard: React.FC<StatusCardProps> = ({
  title,
  value,
  status = 'neutral',
  icon: Icon,
  subtitle,
  badge
}) => {
  const getStatusColor = () => {
    switch (status) {
      case 'active':
        return 'text-emerald-400 bg-emerald-500/10 border-emerald-500/20';
      case 'warning':
        return 'text-amber-400 bg-amber-500/10 border-amber-500/20';
      case 'inactive':
        return 'text-slate-400 bg-slate-800/40 border-slate-700/50';
      default:
        return 'text-blue-400 bg-blue-500/10 border-blue-500/20';
    }
  };

  const getIndicatorDot = () => {
    switch (status) {
      case 'active':
        return <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-pulse" />;
      case 'warning':
        return <span className="w-2.5 h-2.5 rounded-full bg-amber-500" />;
      case 'inactive':
        return <span className="w-2.5 h-2.5 rounded-full bg-slate-500" />;
      default:
        return <span className="w-2.5 h-2.5 rounded-full bg-blue-500" />;
    }
  };

  return (
    <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 hover:border-slate-700/80 transition-all duration-200">
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium text-slate-400 uppercase tracking-wider">{title}</span>
        <div className={`p-2 rounded-lg border ${getStatusColor()}`}>
          <Icon className="w-4 h-4" />
        </div>
      </div>

      <div className="mt-3 flex items-center space-x-2">
        {getIndicatorDot()}
        <span className="text-lg font-bold text-white tracking-tight">{value}</span>
        {badge && (
          <span className="text-[10px] px-2 py-0.5 rounded-full bg-slate-800 text-slate-300 border border-slate-700">
            {badge}
          </span>
        )}
      </div>

      {subtitle && (
        <p className="mt-1.5 text-xs text-slate-500 truncate">{subtitle}</p>
      )}
    </div>
  );
};
