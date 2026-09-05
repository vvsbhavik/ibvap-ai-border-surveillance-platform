import React from 'react';
import { tokens } from '../../design-system/tokens';

export interface TabItem {
  id: string;
  label: string;
  badge?: number | string;
  icon?: React.ReactNode;
}

export interface TabsProps {
  tabs: TabItem[];
  activeTab: string;
  onChange: (tabId: string) => void;
  size?: 'sm' | 'md';
  className?: string;
}

export const Tabs: React.FC<TabsProps> = ({
  tabs,
  activeTab,
  onChange,
  size = 'md',
  className = '',
}) => {
  const sizeClasses = size === 'sm' ? 'h-7 text-xs px-2.5' : 'h-8 text-xs px-3';

  return (
    <div className={`inline-flex items-center bg-slate-900/90 p-0.5 border border-slate-800 ${tokens.radius.sm} ${className}`}>
      {tabs.map((tab) => {
        const isActive = tab.id === activeTab;
        return (
          <button
            key={tab.id}
            type="button"
            onClick={() => onChange(tab.id)}
            className={`inline-flex items-center gap-1.5 font-medium transition-colors cursor-pointer select-none whitespace-nowrap ${tokens.radius.sm} ${sizeClasses} ${
              isActive
                ? 'bg-slate-800 text-cyan-300 border border-slate-700/80 shadow-xs'
                : 'text-slate-400 hover:text-slate-200 border border-transparent'
            }`}
          >
            {tab.icon && <span className="shrink-0">{tab.icon}</span>}
            <span>{tab.label}</span>
            {tab.badge !== undefined && (
              <span
                className={`text-[10px] font-mono-num px-1.5 py-0.2 rounded-xs font-semibold ${
                  isActive ? 'bg-cyan-500/20 text-cyan-200' : 'bg-slate-800 text-slate-400'
                }`}
              >
                {tab.badge}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
};
