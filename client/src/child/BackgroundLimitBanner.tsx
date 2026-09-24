import React, { useState, useEffect } from 'react';
import { AlertTriangle } from 'lucide-react';

export const BackgroundLimitBanner: React.FC = () => {
  const [isBackgrounded, setIsBackgrounded] = useState(false);

  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.hidden) {
        setIsBackgrounded(true);
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => document.removeEventListener('visibilitychange', handleVisibilityChange);
  }, []);

  if (!isBackgrounded) return null;

  return (
    <div className="bg-amber-500/15 border-b border-amber-500/30 px-4 py-3 text-amber-300 text-xs sm:text-sm flex items-center justify-between">
      <div className="flex items-center space-x-2">
        <AlertTriangle className="w-4 h-4 flex-shrink-0 text-amber-400" />
        <span>Background operation is limited by your browser or operating system. Keep this tab open and in view for continuous connection.</span>
      </div>
      <button
        onClick={() => setIsBackgrounded(false)}
        className="ml-3 text-xs underline text-amber-400 hover:text-amber-200"
      >
        Dismiss
      </button>
    </div>
  );
};
