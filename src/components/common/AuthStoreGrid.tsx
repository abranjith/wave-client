import React from 'react';
import { ArrowLeftIcon } from 'lucide-react';
import { Button } from '../ui/button';

interface AuthStoreGridProps {
  onBack: () => void;
}

const AuthStoreGrid: React.FC<AuthStoreGridProps> = ({ onBack }) => {
  return (
    <div className="h-full overflow-hidden bg-white dark:bg-slate-900">
      <div className="p-4 border-b border-slate-200 dark:border-slate-700">
        <div className="flex items-center gap-2 mb-2">
          <Button
            variant="ghost"
            size="sm"
            onClick={onBack}
            className="h-8 px-2 text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-100"
          >
            <ArrowLeftIcon className="h-4 w-4 mr-1" />
            Back
          </Button>
        </div>
        <h2 className="text-lg font-semibold text-slate-800 dark:text-slate-200">Auth Store</h2>
      </div>
      <div className="h-full overflow-auto p-4">
        <div className="text-center text-slate-600 dark:text-slate-400">
          <p className="text-sm">Auth Store Grid - Coming Soon</p>
        </div>
      </div>
    </div>
  );
};

export default AuthStoreGrid;
