import React, { ErrorInfo, ReactNode } from 'react';
import { AlertTriangle, RotateCcw } from 'lucide-react';
import { Button } from './Button';

export interface ErrorBoundaryProps {
  children: ReactNode;
  fallbackTitle?: string;
  onReset?: () => void;
}

export interface ErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends React.Component<ErrorBoundaryProps, ErrorBoundaryState> {
  public override state: ErrorBoundaryState = {
    hasError: false,
    error: null,
  };

  public static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, error };
  }

  public override componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('[IBVAP ErrorBoundary Caught Error]:', error, errorInfo);
  }

  public handleRetry = () => {
    this.setState({ hasError: false, error: null });
    this.props.onReset?.();
  };

  public override render() {
    if (this.state.hasError) {
      return (
        <div className="flex-1 flex flex-col items-center justify-center p-8 text-center select-none">
          <div className="max-w-md w-full p-6 bg-[#0F1115] border border-[#23262B] rounded shadow-xl flex flex-col items-center">
            <div className="w-12 h-12 rounded-full bg-[#FF4D4D]/10 border border-[#FF4D4D]/30 flex items-center justify-center text-[#FF4D4D] mb-4">
              <AlertTriangle className="w-6 h-6" />
            </div>

            <h2 className="text-base font-semibold text-white mb-1.5">
              {this.props.fallbackTitle || 'Something went wrong while loading this workspace.'}
            </h2>

            <p className="text-xs text-[#6C727A] leading-relaxed mb-5 max-w-xs">
              An unexpected interface rendering exception occurred. The platform has contained the error to maintain operational continuity.
            </p>

            <div className="flex items-center gap-3">
              <Button
                variant="primary"
                size="sm"
                onClick={this.handleRetry}
                leftIcon={<RotateCcw className="w-3.5 h-3.5" />}
              >
                Retry Workspace
              </Button>
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
