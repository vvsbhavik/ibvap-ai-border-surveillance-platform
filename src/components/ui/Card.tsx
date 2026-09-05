import React from 'react';
import { tokens } from '../../design-system/tokens';

export interface CardProps extends React.HTMLAttributes<HTMLDivElement> {
  children: React.ReactNode;
  headerAction?: React.ReactNode;
  title?: string;
  subtitle?: string;
  compact?: boolean;
  borderVariant?: 'default' | 'subtle' | 'critical' | 'attention';
}

export const Card: React.FC<CardProps> = ({
  children,
  headerAction,
  title,
  subtitle,
  compact = false,
  borderVariant = 'default',
  className = '',
  ...props
}) => {
  const borderClasses = {
    default: 'border-[#23262B] bg-[#0F1115]',
    subtle: 'border-[#23262B] bg-[#14161A]',
    critical: 'border-[#FF4D4D] bg-[#2A1212]',
    attention: 'border-[#FF9500] bg-[#221A10]',
  }[borderVariant];

  return (
    <div
      className={`border ${borderClasses} ${tokens.radius.md} flex flex-col ${className}`}
      {...props}
    >
      {(title || headerAction) && (
        <div
          className={`flex items-center justify-between border-b border-[#23262B] bg-[#14161A] ${
            compact ? 'px-3 py-2' : 'px-4 py-2.5'
          }`}
        >
          <div>
            {title && (
              <h3 className="text-xs font-bold uppercase tracking-wider text-white">
                {title}
              </h3>
            )}
            {subtitle && <p className="text-[11px] text-[#A9ACB1] mt-0.5">{subtitle}</p>}
          </div>
          {headerAction && <div className="shrink-0">{headerAction}</div>}
        </div>
      )}
      <div className={compact ? 'p-3' : 'p-4'}>{children}</div>
    </div>
  );
};
