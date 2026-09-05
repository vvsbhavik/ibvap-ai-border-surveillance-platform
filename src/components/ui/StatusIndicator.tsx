import React from 'react';

export interface StatusIndicatorProps {
  status: 'ONLINE' | 'DEGRADED' | 'OFFLINE' | 'INTEGRITY_ANOMALY' | 'MAINTENANCE' | 'HEALTHY' | 'CRITICAL' | 'ATTENTION' | 'UNKNOWN';
  showText?: boolean;
  size?: 'sm' | 'md' | 'lg';
  pulse?: boolean;
  className?: string;
}

export const StatusIndicator: React.FC<StatusIndicatorProps> = ({
  status,
  showText = true,
  size = 'md',
  pulse,
  className = '',
}) => {
  const config = {
    ONLINE: { color: 'bg-[#34C759]', text: 'Online', textColor: 'text-[#34C759]' },
    HEALTHY: { color: 'bg-[#34C759]', text: 'Healthy', textColor: 'text-[#34C759]' },
    DEGRADED: { color: 'bg-[#FF9500]', text: 'Degraded', textColor: 'text-[#FF9500]' },
    ATTENTION: { color: 'bg-[#FF9500]', text: 'Attention', textColor: 'text-[#FF9500]' },
    CRITICAL: { color: 'bg-[#FF4D4D]', text: 'Critical', textColor: 'text-[#FF4D4D]' },
    INTEGRITY_ANOMALY: { color: 'bg-[#FF4D4D]', text: 'Integrity Anomaly', textColor: 'text-[#FF4D4D]' },
    OFFLINE: { color: 'bg-[#6C727A]', text: 'Offline', textColor: 'text-[#6C727A]' },
    MAINTENANCE: { color: 'bg-[#007AFF]', text: 'Maintenance', textColor: 'text-[#007AFF]' },
    UNKNOWN: { color: 'bg-[#6C727A]', text: 'Unknown', textColor: 'text-[#6C727A]' },
  }[status] || { color: 'bg-[#6C727A]', text: status, textColor: 'text-[#6C727A]' };

  const dotSize = {
    sm: 'w-1.5 h-1.5',
    md: 'w-2 h-2',
    lg: 'w-2.5 h-2.5',
  }[size];

  const shouldPulse = pulse ?? (status === 'CRITICAL' || status === 'INTEGRITY_ANOMALY');

  return (
    <span className={`inline-flex items-center gap-1.5 ${className}`}>
      <span className="relative flex items-center justify-center shrink-0">
        {shouldPulse && (
          <span className={`absolute inline-flex h-full w-full rounded-full opacity-75 animate-ping ${config.color}`} />
        )}
        <span className={`inline-flex rounded-full ${dotSize} ${config.color}`} />
      </span>
      {showText && (
        <span className={`text-[11px] font-medium font-mono-num tracking-wider uppercase ${config.textColor}`}>
          {config.text}
        </span>
      )}
    </span>
  );
};
