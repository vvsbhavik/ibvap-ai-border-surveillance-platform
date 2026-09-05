import React, { useEffect } from 'react';
import { X } from 'lucide-react';
import { tokens } from '../../design-system/tokens';

export interface DrawerProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  subtitle?: string;
  children: React.ReactNode;
  width?: 'md' | 'lg' | 'xl';
  actions?: React.ReactNode;
}

export const Drawer: React.FC<DrawerProps> = ({
  isOpen,
  onClose,
  title,
  subtitle,
  children,
  width = 'lg',
  actions,
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

  const widthClass = {
    md: 'max-w-md',
    lg: 'max-w-xl',
    xl: 'max-w-2xl',
  }[width];

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-[#0A0B0D]/80 backdrop-blur-xs animate-in fade-in duration-150">
      <div
        className={`w-full ${widthClass} h-full bg-[#0F1115] border-l border-[#23262B] shadow-2xl flex flex-col transform transition-transform duration-200 ease-out`}
        role="dialog"
        aria-modal="true"
      >
        <div className="flex items-center justify-between px-5 py-3.5 border-b border-[#23262B] bg-[#14161A] shrink-0">
          <div>
            <h2 className="text-sm font-bold tracking-wider uppercase text-white">{title}</h2>
            {subtitle && <p className="text-xs text-[#6C727A] mt-0.5">{subtitle}</p>}
          </div>
          <div className="flex items-center gap-2">
            {actions}
            <button
              type="button"
              onClick={onClose}
              className="p-1 text-[#6C727A] hover:text-white hover:bg-[#1A1D23] rounded transition-colors cursor-pointer"
              aria-label="Close drawer"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        <div className="p-5 overflow-y-auto flex-1 text-[#E0E2E6] text-xs leading-relaxed space-y-4">
          {children}
        </div>
      </div>
    </div>
  );
};
