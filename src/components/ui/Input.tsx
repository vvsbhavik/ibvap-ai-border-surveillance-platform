import React from 'react';
import { tokens } from '../../design-system/tokens';

export interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string;
  helperText?: string;
  leftIcon?: React.ReactNode;
  rightIcon?: React.ReactNode;
}

export const Input: React.FC<InputProps> = ({
  label,
  error,
  helperText,
  leftIcon,
  rightIcon,
  className = '',
  id,
  ...props
}) => {
  const inputId = id || `input-${Math.random().toString(36).substring(2, 9)}`;

  return (
    <div className="w-full flex flex-col gap-1">
      {label && (
        <label htmlFor={inputId} className="text-[11px] font-semibold tracking-wider uppercase text-slate-400">
          {label}
        </label>
      )}
      <div className="relative flex items-center w-full">
        {leftIcon && (
          <div className="absolute left-2.5 text-slate-400 pointer-events-none flex items-center">
            {leftIcon}
          </div>
        )}
        <input
          id={inputId}
          className={`w-full h-9 bg-slate-900 text-slate-100 text-xs border ${
            error ? 'border-rose-500 focus:ring-rose-400' : 'border-slate-700/80 focus:border-cyan-500 focus:ring-cyan-500/20'
          } ${tokens.radius.sm} px-3 ${leftIcon ? 'pl-8' : ''} ${
            rightIcon ? 'pr-8' : ''
          } placeholder:text-slate-500 focus:outline-hidden focus:ring-1 disabled:opacity-40 disabled:cursor-not-allowed transition-colors ${className}`}
          {...props}
        />
        {rightIcon && (
          <div className="absolute right-2.5 text-slate-400 pointer-events-none flex items-center">
            {rightIcon}
          </div>
        )}
      </div>
      {error && <span className="text-[11px] text-rose-400">{error}</span>}
      {!error && helperText && <span className="text-[11px] text-slate-500">{helperText}</span>}
    </div>
  );
};
