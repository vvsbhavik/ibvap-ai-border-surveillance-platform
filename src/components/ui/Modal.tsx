import React, { useEffect } from 'react';
import { X } from 'lucide-react';
import { tokens } from '../../design-system/tokens';

export interface ModalProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  subtitle?: string;
  children: React.ReactNode;
  footer?: React.ReactNode;
  maxWidth?: 'sm' | 'md' | 'lg' | 'xl' | '2xl';
}

export const Modal: React.FC<ModalProps> = ({
  isOpen,
  onClose,
  title,
  subtitle,
  children,
  footer,
  maxWidth = 'md',
}) => {
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen) {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const maxWidthClass = {
    sm: 'max-w-md',
    md: 'max-w-lg',
    lg: 'max-w-2xl',
    xl: 'max-w-4xl',
    '2xl': 'max-w-6xl',
  }[maxWidth];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-[#0A0B0D]/80 backdrop-blur-xs animate-in fade-in duration-150">
      <div
        className={`w-full ${maxWidthClass} bg-[#0F1115] border border-[#23262B] ${tokens.radius.md} shadow-2xl flex flex-col max-h-[90vh] overflow-hidden`}
        role="dialog"
        aria-modal="true"
      >
        <div className="flex items-center justify-between px-4 py-3 border-b border-[#23262B] bg-[#14161A]">
          <div>
            <h2 className="text-sm font-bold tracking-wider uppercase text-white">{title}</h2>
            {subtitle && <p className="text-xs text-[#6C727A] mt-0.5">{subtitle}</p>}
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1 text-[#6C727A] hover:text-white hover:bg-[#1A1D23] rounded transition-colors cursor-pointer"
            aria-label="Close modal"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-4 overflow-y-auto flex-1 text-[#E0E2E6] text-xs leading-relaxed">
          {children}
        </div>

        {footer && (
          <div className="flex items-center justify-end gap-2 px-4 py-3 border-t border-[#23262B] bg-[#14161A]">
            {footer}
          </div>
        )}
      </div>
    </div>
  );
};
