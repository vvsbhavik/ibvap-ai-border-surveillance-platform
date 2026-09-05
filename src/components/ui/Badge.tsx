import React from 'react';
import { tokens } from '../../design-system/tokens';

export interface BadgeProps {
  children: React.ReactNode;
  variant?: 'healthy' | 'attention' | 'critical' | 'info' | 'offline' | 'neutral' | 'simulation';
  size?: 'sm' | 'md';
  showDot?: boolean;
  className?: string;
}

export const Badge: React.FC<BadgeProps> = ({
  children,
  variant = 'neutral',
  size = 'md',
  showDot = true,
  className = '',
}) => {
  const variantStyles = {
    healthy: 'bg-[#34C759]/15 text-[#34C759] border-[#34C759]/30',
    attention: 'bg-[#FF9500]/15 text-[#FF9500] border-[#FF9500]/30',
    critical: 'bg-[#FF4D4D]/15 text-[#FF4D4D] border-[#FF4D4D]/30',
    info: 'bg-[#007AFF]/15 text-[#007AFF] border-[#007AFF]/30',
    offline: 'bg-[#1A1D23] text-[#6C727A] border-[#23262B]',
    neutral: 'bg-[#1A1D23] text-[#E0E2E6] border-[#2D3139]',
    simulation: 'bg-[#007AFF]/20 text-[#007AFF] border-[#007AFF]/40 tracking-wider',
  }[variant];

  const dotColor = {
    healthy: 'bg-[#34C759]',
    attention: 'bg-[#FF9500]',
    critical: 'bg-[#FF4D4D]',
    info: 'bg-[#007AFF]',
    offline: 'bg-[#6C727A]',
    neutral: 'bg-[#6C727A]',
    simulation: 'bg-[#007AFF]',
  }[variant];

  const sizeStyles = {
    sm: 'text-[10px] px-1.5 py-0.5 gap-1',
    md: 'text-[11px] px-2 py-0.5 gap-1.5',
  }[size];

  return (
    <span
      className={`inline-flex items-center font-mono-num font-medium border ${tokens.radius.sm} select-none ${sizeStyles} ${variantStyles} ${className}`}
    >
      {showDot && (
        <span
          className={`w-1.5 h-1.5 rounded-full shrink-0 ${dotColor} ${
            variant === 'critical' ? 'status-indicator-pulse' : ''
          }`}
        />
      )}
      <span className="whitespace-nowrap">{children}</span>
    </span>
  );
};
