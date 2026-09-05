import React, { useState } from 'react';
import { LayoutGrid, Grid3X3, Square, Eye, EyeOff, Layers } from 'lucide-react';
import { Camera } from '../../server/types';
import { CameraTile } from './CameraTile';
import { Button } from '../ui/Button';

export interface CameraGridProps {
  cameras: Camera[];
  onSelectCamera: (camera: Camera) => void;
  onMaximizeCamera?: (camera: Camera) => void;
  selectedCameraId?: string;
}

export const CameraGrid: React.FC<CameraGridProps> = ({
  cameras,
  onSelectCamera,
  onMaximizeCamera,
  selectedCameraId,
}) => {
  const [layout, setLayout] = useState<'2x2' | '3x3' | '1x1'>('2x2');
  const [showOverlays, setShowOverlays] = useState(true);

  const gridClass = {
    '1x1': 'grid grid-cols-1 gap-4 max-w-3xl mx-auto',
    '2x2': 'grid grid-cols-1 md:grid-cols-2 gap-3.5',
    '3x3': 'grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3',
  }[layout];

  // Limit shown cameras based on layout mode
  const displayLimit = layout === '1x1' ? 1 : layout === '2x2' ? 4 : 9;
  const displayCameras = cameras.slice(0, displayLimit);

  return (
    <div className="flex flex-col gap-3">
      {/* Grid Controls Toolbar */}
      <div className="flex items-center justify-between px-1 py-0.5">
        <div className="flex items-center gap-2">
          <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">
            Monitoring Wall
          </span>
          <span className="text-[11px] font-mono-num text-slate-500">
            ({displayCameras.length} of {cameras.length} feeds active)
          </span>
        </div>

        <div className="flex items-center gap-1.5">
          {/* Overlay Toggle */}
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setShowOverlays(!showOverlays)}
            leftIcon={showOverlays ? <Eye className="w-3 h-3 text-cyan-400" /> : <EyeOff className="w-3 h-3" />}
            title="Toggle AI bounding box overlays"
          >
            {showOverlays ? 'Overlays On' : 'Overlays Off'}
          </Button>

          <div className="h-4 w-px bg-slate-800 mx-1" />

          {/* Grid Layout Switcher */}
          <div className="flex items-center bg-slate-900 border border-slate-800 rounded-sm p-0.5">
            <button
              type="button"
              onClick={() => setLayout('1x1')}
              className={`p-1 rounded-xs cursor-pointer ${
                layout === '1x1' ? 'bg-slate-800 text-cyan-300' : 'text-slate-400 hover:text-slate-200'
              }`}
              title="Single focus feed (1x1)"
            >
              <Square className="w-3 h-3" />
            </button>
            <button
              type="button"
              onClick={() => setLayout('2x2')}
              className={`p-1 rounded-xs cursor-pointer ${
                layout === '2x2' ? 'bg-slate-800 text-cyan-300' : 'text-slate-400 hover:text-slate-200'
              }`}
              title="Quad wall layout (2x2)"
            >
              <LayoutGrid className="w-3 h-3" />
            </button>
            <button
              type="button"
              onClick={() => setLayout('3x3')}
              className={`p-1 rounded-xs cursor-pointer ${
                layout === '3x3' ? 'bg-slate-800 text-cyan-300' : 'text-slate-400 hover:text-slate-200'
              }`}
              title="Dense matrix layout (3x3)"
            >
              <Grid3X3 className="w-3 h-3" />
            </button>
          </div>
        </div>
      </div>

      {/* Grid Presentation */}
      <div className={gridClass}>
        {displayCameras.map((cam) => (
          <CameraTile
            key={cam.id}
            camera={cam}
            isSelected={selectedCameraId === cam.id}
            onSelect={onSelectCamera}
            onMaximize={onMaximizeCamera}
            showAiOverlays={showOverlays}
          />
        ))}
      </div>
    </div>
  );
};
