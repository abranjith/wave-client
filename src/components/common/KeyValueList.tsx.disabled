import React from 'react';
import { EyeIcon, EyeOffIcon } from 'lucide-react';

interface KeyValueItem {
  key: string;
  value: string;
  type?: 'default' | 'secret';
  enabled?: boolean;
}

interface KeyValueListProps {
  items: KeyValueItem[];
  title?: string;
}

const KeyValueList: React.FC<KeyValueListProps> = ({ items, title }) => {
  const [visibleSecrets, setVisibleSecrets] = React.useState<Set<string>>(new Set());

  const toggleSecretVisibility = (key: string) => {
    const newVisible = new Set(visibleSecrets);
    if (newVisible.has(key)) {
      newVisible.delete(key);
    } else {
      newVisible.add(key);
    }
    setVisibleSecrets(newVisible);
  };

  if (items.length === 0) {
    return (
      <div className="p-4 text-center">
        <p className="text-sm text-slate-500 dark:text-slate-400">No variables found</p>
      </div>
    );
  }

  return (
    <div className="p-4">
      {title && (
        <h3 className="text-sm font-semibold text-slate-700 dark:text-slate-300 mb-3">{title}</h3>
      )}
      <div className="space-y-2">
        {items
          .filter(item => item.enabled !== false)
          .map((item, index) => {
            const isSecret = item.type === 'secret';
            const isVisible = visibleSecrets.has(item.key);
            
            return (
              <div key={`${item.key}-${index}`} className="border border-slate-200 dark:border-slate-700 rounded-md p-3 bg-white dark:bg-slate-800">
                <div className="flex items-center justify-between mb-1">
                  <span className="text-xs font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wide">
                    {item.key}
                  </span>
                  {isSecret && (
                    <button
                      onClick={() => toggleSecretVisibility(item.key)}
                      className="p-1 hover:bg-slate-100 dark:hover:bg-slate-700 rounded transition-colors"
                      title={isVisible ? 'Hide value' : 'Show value'}
                    >
                      {isVisible ? (
                        <EyeOffIcon className="h-3 w-3 text-slate-500" />
                      ) : (
                        <EyeIcon className="h-3 w-3 text-slate-500" />
                      )}
                    </button>
                  )}
                </div>
                <div className="text-sm text-slate-700 dark:text-slate-300 font-mono bg-slate-50 dark:bg-slate-900 p-2 rounded border">
                  {isSecret && !isVisible ? '••••••••' : item.value}
                </div>
                {isSecret && (
                  <div className="flex items-center mt-1">
                    <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-amber-100 text-amber-800 dark:bg-amber-900 dark:text-amber-200">
                      Secret
                    </span>
                  </div>
                )}
              </div>
            );
          })}
      </div>
    </div>
  );
};

export default KeyValueList;
