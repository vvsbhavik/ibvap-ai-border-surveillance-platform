import React from 'react';
import { ChevronDown } from 'lucide-react';
import { tokens } from '../../design-system/tokens';

export interface SelectOption {
  value: string;
  label: string;
}

export interface SelectProps extends React.SelectHTMLAttributes<HTMLSelectElement> {
  label?: string;
  options: SelectOption[];
  error?: string;
}

export const Select: React.FC<SelectProps> = ({
  label,
  options,
  error,
  className = '',
  id,
  ...props
}) => {
  const selectId = id || `select-${Math.random().toString(36).substring(2, 9)}`;

  return (
    <div className="w-full flex flex-col gap-1">
      {label && (
        <label htmlFor={selectId} className="text-[11px] font-semibold tracking-wider uppercase text-slate-400">
          {label}
        </label>
      )}
      <div className="relative flex items-center w-full">
        <select
          id={selectId}
          className={`w-full h-9 bg-slate-900 text-slate-100 text-xs border ${
            error ? 'border-rose-500 focus:ring-rose-400' : 'border-slate-700/80 focus:border-cyan-500 focus:ring-cyan-500/20'
          } ${tokens.radius.sm} pl-3 pr-8 appearance-none focus:outline-hidden focus:ring-1 transition-colors cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed ${className}`}
          {...props}
        >
          {options.map((opt) => (
            <option key={opt.value} value={opt.value} className="bg-slate-900 text-slate-100">
              {opt.label}
            </option>
          ))}
        </select>
        <div className="absolute right-2.5 pointer-events-none text-slate-400 flex items-center">
          <ChevronDown className="w-3.5 h-3.5" />
        </div>
      </div>
      {error && <span className="text-[11px] text-rose-400">{error}</span>}
    </div>
  );
};
