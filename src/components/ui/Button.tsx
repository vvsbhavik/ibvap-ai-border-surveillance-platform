import React from 'react';
import { Loader2 } from 'lucide-react';
import { tokens } from '../../design-system/tokens';

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'danger' | 'ghost' | 'outline' | 'subtle';
  size?: 'sm' | 'md' | 'lg';
  isLoading?: boolean;
  leftIcon?: React.ReactNode;
  rightIcon?: React.ReactNode;
}

export const Button: React.FC<ButtonProps> = ({
  children,
  variant = 'primary',
  size = 'md',
  isLoading = false,
  leftIcon,
  rightIcon,
  className = '',
  disabled,
  ...props
}) => {
  const sizeClasses = {
    sm: 'h-7 text-xs px-2.5 gap-1.5',
    md: 'h-9 text-xs font-medium px-3.5 gap-2',
    lg: 'h-10 text-sm font-medium px-4 gap-2.5',
  }[size];

  const variantClasses = {
    primary:
      'bg-[#007AFF] hover:bg-[#0066D6] active:bg-[#0055B3] text-white shadow-xs border border-[#007AFF]/40 focus:ring-1 focus:ring-[#007AFF] focus:outline-hidden',
    secondary:
      'bg-[#1A1D23] hover:bg-[#23262B] active:bg-[#14161A] text-[#E0E2E6] hover:text-white border border-[#23262B] focus:ring-1 focus:ring-[#007AFF] focus:outline-hidden',
    danger:
      'bg-[#FF4D4D] hover:bg-[#E63939] active:bg-[#CC2929] text-black font-bold border border-[#FF4D4D]/40 focus:ring-1 focus:ring-[#FF4D4D] focus:outline-hidden',
    ghost:
      'bg-transparent hover:bg-[#14161A] active:bg-[#1A1D23] text-[#A9ACB1] hover:text-white border border-transparent focus:ring-1 focus:ring-[#007AFF] focus:outline-hidden',
    outline:
      'bg-transparent hover:bg-[#14161A] active:bg-[#1A1D23] text-[#E0E2E6] border border-[#23262B] hover:border-[#2D3139] focus:ring-1 focus:ring-[#007AFF] focus:outline-hidden',
    subtle:
      'bg-[#1A1D23] hover:bg-[#23262B] text-[#E0E2E6] hover:text-white border border-[#23262B] focus:ring-1 focus:ring-[#007AFF] focus:outline-hidden',
  }[variant];

  return (
    <button
      className={`inline-flex items-center justify-center ${tokens.radius.sm} transition-colors select-none font-medium disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer ${sizeClasses} ${variantClasses} ${className}`}
      disabled={disabled || isLoading}
      {...props}
    >
      {isLoading ? (
        <Loader2 className="w-3.5 h-3.5 animate-spin" />
      ) : (
        leftIcon && <span className="shrink-0">{leftIcon}</span>
      )}
      <span className="whitespace-nowrap">{children}</span>
      {!isLoading && rightIcon && <span className="shrink-0">{rightIcon}</span>}
    </button>
  );
};
