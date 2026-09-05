import React from 'react';
import { Play } from 'lucide-react';
import { Button } from '../ui/Button';

export interface RealtimeStatusBarProps {
  isConnected: boolean;
  lastEventMessage: string;
  onRunSimulationDrill: () => void;
  isSimulating: boolean;
  totalCameras: number;
  onlineCameras: number;
}

export const RealtimeStatusBar: React.FC<RealtimeStatusBarProps> = ({
  isConnected,
  lastEventMessage,
  onRunSimulationDrill,
  isSimulating,
  totalCameras,
  onlineCameras,
}) => {
  return (
    <footer className="h-8 w-full bg-[#0F1115] border-t border-[#23262B] px-4 flex items-center justify-between text-xs text-[#6C727A] select-none z-20 shrink-0">
      {/* 1. Left: Subsystem Telemetry */}
      <div className="flex items-center gap-4">
        {/* Network SSE Link */}
        <div className="flex items-center gap-1.5">
          <span
            className={`w-1.5 h-1.5 rounded-full ${
              isConnected ? 'bg-[#34C759]' : 'bg-[#FF4D4D]'
            }`}
          />
          <span className="text-[#E0E2E6]">
            {isConnected ? 'Connected' : 'Reconnecting'}
          </span>
        </div>

        {/* Camera Status */}
        <div className="flex items-center gap-1.5 hidden sm:flex">
          <span className="text-[#6C727A]">Cameras:</span>
          <span className="text-white font-medium font-mono-num">
            {onlineCameras}/{totalCameras} Online
          </span>
        </div>

        {/* Event Message */}
        {lastEventMessage && (
          <div className="items-center gap-1.5 truncate max-w-md text-[#6C727A] hidden md:flex">
            <span className="text-[#6C727A]">Event:</span>
            <span className="text-[#E0E2E6] truncate">{lastEventMessage}</span>
          </div>
        )}
      </div>

      {/* 2. Right: Drill Simulation Action */}
      <div className="flex items-center gap-2">
        <Button
          variant="subtle"
          size="sm"
          isLoading={isSimulating}
          onClick={onRunSimulationDrill}
          leftIcon={<Play className="w-2.5 h-2.5 text-[#007AFF]" />}
          className="h-6 text-xs px-2 bg-[#14161A] hover:bg-[#1A1D23] border-[#23262B] text-[#E0E2E6]"
          title="Inject an operational test drill event into the system"
        >
          {isSimulating ? 'Injecting...' : 'Test Drill'}
        </Button>
      </div>
    </footer>
  );
};
