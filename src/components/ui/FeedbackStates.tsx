import React from 'react';
import { AlertCircle, Inbox, Loader2, RefreshCw } from 'lucide-react';
import { tokens } from '../../design-system/tokens';
import { Button } from './Button';

// 1. EmptyState
export interface EmptyStateProps {
  title: string;
  description: string;
  icon?: React.ReactNode;
  action?: {
    label: string;
    onClick: () => void;
  };
}

export const EmptyState: React.FC<EmptyStateProps> = ({
  title,
  description,
  icon,
  action,
}) => {
  return (
    <div className={`flex flex-col items-center justify-center p-8 text-center border border-dashed border-[#23262B] bg-[#0A0B0D]/50 ${tokens.radius.md}`}>
      <div className="p-3 text-[#6C727A] bg-[#14161A] border border-[#23262B] rounded mb-3">
        {icon || <Inbox className="w-6 h-6" />}
      </div>
      <h3 className="text-xs font-bold uppercase tracking-wider text-[#E0E2E6] mb-1">{title}</h3>
      <p className="text-xs text-[#6C727A] max-w-sm mb-4 leading-relaxed">{description}</p>
      {action && (
        <Button variant="secondary" size="sm" onClick={action.onClick}>
          {action.label}
        </Button>
      )}
    </div>
  );
};

// 2. LoadingState
export interface LoadingStateProps {
  message?: string;
  inline?: boolean;
}

export const LoadingState: React.FC<LoadingStateProps> = ({
  message = 'Loading operational telemetry...',
  inline = false,
}) => {
  if (inline) {
    return (
      <div className="flex items-center gap-2 text-xs text-[#6C727A] py-2">
        <Loader2 className="w-3.5 h-3.5 animate-spin text-[#007AFF]" />
        <span>{message}</span>
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center justify-center py-16 text-center space-y-3">
      <Loader2 className="w-6 h-6 animate-spin text-[#007AFF]" />
      <span className="text-xs text-[#6C727A] tracking-wider font-mono">{message}</span>
    </div>
  );
};

// 3. Skeleton
export interface SkeletonProps {
  className?: string;
}

export const Skeleton: React.FC<SkeletonProps> = ({ className = 'h-4 w-full' }) => {
  return (
    <div className={`animate-pulse bg-[#1A1D23] rounded ${className}`} />
  );
};

// 4. ErrorState
export interface ErrorStateProps {
  title?: string;
  message: string;
  onRetry?: () => void;
}

export const ErrorState: React.FC<ErrorStateProps> = ({
  title = 'Telemetry Pipeline Failure',
  message,
  onRetry,
}) => {
  return (
    <div className={`p-4 border border-[#FF4D4D]/30 bg-[#2A1212] text-[#FF4D4D] ${tokens.radius.md} flex items-start gap-3`}>
      <AlertCircle className="w-4 h-4 text-[#FF4D4D] mt-0.5 shrink-0" />
      <div className="flex-1 text-xs">
        <h4 className="font-bold uppercase tracking-wider text-white">{title}</h4>
        <p className="mt-1 text-[#E0E2E6] leading-relaxed">{message}</p>
        {onRetry && (
          <Button
            variant="danger"
            size="sm"
            onClick={onRetry}
            leftIcon={<RefreshCw className="w-3 h-3" />}
            className="mt-3"
          >
            Retry Connection
          </Button>
        )}
      </div>
    </div>
  );
};

// 5. ConfirmationDialog
export interface ConfirmationDialogProps {
  isOpen: boolean;
  onConfirm: () => void;
  onCancel: () => void;
  title: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  isDanger?: boolean;
}

export const ConfirmationDialog: React.FC<ConfirmationDialogProps> = ({
  isOpen,
  onConfirm,
  onCancel,
  title,
  message,
  confirmLabel = 'Confirm Action',
  cancelLabel = 'Cancel',
  isDanger = false,
}) => {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-[#0A0B0D]/80 backdrop-blur-xs">
      <div className={`w-full max-w-sm bg-[#0F1115] border border-[#23262B] ${tokens.radius.md} p-4 shadow-xl`}>
        <h3 className="text-xs font-bold tracking-wider uppercase text-white">{title}</h3>
        <p className="text-xs text-[#6C727A] mt-2 leading-relaxed">{message}</p>
        <div className="flex justify-end gap-2 mt-4">
          <Button variant="ghost" size="sm" onClick={onCancel}>
            {cancelLabel}
          </Button>
          <Button
            variant={isDanger ? 'danger' : 'primary'}
            size="sm"
            onClick={onConfirm}
          >
            {confirmLabel}
          </Button>
        </div>
      </div>
    </div>
  );
};
