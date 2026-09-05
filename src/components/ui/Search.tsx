import React from 'react';
import { Search as SearchIcon, X } from 'lucide-react';
import { tokens } from '../../design-system/tokens';

export interface SearchProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  className?: string;
  shortcut?: string;
}

export const Search: React.FC<SearchProps> = ({
  value,
  onChange,
  placeholder = 'Search identifiers, plates, cameras...',
  className = '',
  shortcut = '/',
}) => {
  return (
    <div className={`relative flex items-center ${className}`}>
      <SearchIcon className="absolute left-2.5 w-3.5 h-3.5 text-slate-400 pointer-events-none" />
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className={`w-full h-8 bg-slate-900 text-slate-100 text-xs border border-slate-700/80 ${tokens.radius.sm} pl-8 pr-14 placeholder:text-slate-500 focus:outline-hidden focus:border-cyan-500 focus:ring-1 focus:ring-cyan-500/20 transition-colors`}
      />
      {value ? (
        <button
          type="button"
          onClick={() => onChange('')}
          className="absolute right-2 p-0.5 text-slate-400 hover:text-slate-200 cursor-pointer"
        >
          <X className="w-3 h-3" />
        </button>
      ) : shortcut ? (
        <kbd className="absolute right-2 text-[10px] font-mono-num px-1 py-0.5 bg-slate-800 text-slate-400 border border-slate-700 rounded-xs select-none">
          {shortcut}
        </kbd>
      ) : null}
    </div>
  );
};
