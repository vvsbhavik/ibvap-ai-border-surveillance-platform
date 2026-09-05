import React, { useState } from 'react';
import {
  ShieldAlert,
  Clock,
  Camera,
  MapPin,
  CheckCircle,
  FileCheck,
  Send,
  Lock,
  Plus,
  ArrowRight,
  Shield,
  User,
} from 'lucide-react';
import { Incident, IncidentTimelineEntry, EvidenceItem } from '../../server/types';
import { Badge } from '../ui/Badge';
import { Button } from '../ui/Button';
import { tokens } from '../../design-system/tokens';
import { formatTimestamp } from '../../utils/formatters';

// 1. Primary Incident Header
export interface IncidentHeaderProps {
  incident: Incident;
  onStatusChange?: (newStatus: string) => void;
}

export const IncidentHeader: React.FC<IncidentHeaderProps> = ({
  incident,
  onStatusChange,
}) => {
  const isCritical = incident.severity === 'CRITICAL';
  const isResolved = incident.status === 'RESOLVED';

  return (
    <div className={`p-4 bg-[#0F1115] border border-[#23262B] ${tokens.radius.md} space-y-4 select-none`}>
      {/* Top: Title, Priority, Status, Status Controls */}
      <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3">
        <div className="space-y-1.5 min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs font-mono-num font-bold text-[#007AFF] px-2 py-0.5 bg-[#14161A] border border-[#23262B] rounded">
              {incident.incidentNumber}
            </span>
            <span
              className={`text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-xs ${
                isCritical ? 'bg-[#FF4D4D] text-white' : 'bg-[#FF9500] text-black'
              }`}
            >
              {incident.severity} PRIORITY
            </span>
            <Badge variant={isResolved ? 'healthy' : 'neutral'} size="sm">
              {incident.status.replace('_', ' ')}
            </Badge>
          </div>

          <h1 className="text-lg font-semibold text-white tracking-tight">
            {incident.title}
          </h1>
          <p className="text-xs text-[#6C727A] leading-relaxed max-w-3xl">
            {incident.summary}
          </p>
        </div>

        {/* Status Actions */}
        {onStatusChange && (
          <div className="flex items-center gap-2 shrink-0">
            {incident.status === 'OPEN' && (
              <Button
                variant="primary"
                size="sm"
                onClick={() => onStatusChange('INVESTIGATING')}
              >
                Mark Investigating
              </Button>
            )}
            {incident.status === 'INVESTIGATING' && (
              <Button
                variant="primary"
                size="sm"
                onClick={() => onStatusChange('CONTAINED')}
              >
                Mark Contained
              </Button>
            )}
            {(incident.status === 'INVESTIGATING' || incident.status === 'CONTAINED') && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => onStatusChange('RESOLVED')}
                leftIcon={<CheckCircle className="w-3.5 h-3.5 text-[#34C759]" />}
              >
                Resolve Incident
              </Button>
            )}
          </div>
        )}
      </div>

      {/* Structured Operational Dossier Strip: WHAT, WHERE, WHEN, STATUS, NEXT ACTION */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-2 pt-3 border-t border-[#23262B] text-xs">
        {/* WHERE */}
        <div className="p-2 bg-[#14161A] border border-[#23262B] rounded">
          <span className="text-[10px] text-[#6C727A] uppercase tracking-wider block font-semibold">
            Location / Sector
          </span>
          <div className="text-white font-medium mt-0.5 truncate flex items-center gap-1">
            <MapPin className="w-3 h-3 text-[#007AFF] shrink-0" />
            <span>{incident.sectorName}</span>
          </div>
        </div>

        {/* PRIMARY SENSOR */}
        <div className="p-2 bg-[#14161A] border border-[#23262B] rounded">
          <span className="text-[10px] text-[#6C727A] uppercase tracking-wider block font-semibold">
            Primary Camera
          </span>
          <div className="text-white font-mono-num font-medium mt-0.5 truncate flex items-center gap-1">
            <Camera className="w-3 h-3 text-[#007AFF] shrink-0" />
            <span>{incident.primaryCameraIdentifier}</span>
          </div>
        </div>

        {/* WHEN */}
        <div className="p-2 bg-[#14161A] border border-[#23262B] rounded">
          <span className="text-[10px] text-[#6C727A] uppercase tracking-wider block font-semibold">
            Timestamp
          </span>
          <div className="text-white font-mono-num mt-0.5 truncate flex items-center gap-1">
            <Clock className="w-3 h-3 text-[#6C727A] shrink-0" />
            <span>{formatTimestamp(incident.createdAt, { format: 'time-only' })}</span>
          </div>
        </div>

        {/* LEAD COMMANDER */}
        <div className="p-2 bg-[#14161A] border border-[#23262B] rounded">
          <span className="text-[10px] text-[#6C727A] uppercase tracking-wider block font-semibold">
            Lead Officer
          </span>
          <div className="text-white font-medium mt-0.5 truncate flex items-center gap-1">
            <User className="w-3 h-3 text-[#6C727A] shrink-0" />
            <span>{incident.leadCommanderCallsign || 'Watch Commander'}</span>
          </div>
        </div>
      </div>
    </div>
  );
};

// 2. Incident Investigation Timeline
export interface IncidentTimelineProps {
  timeline: IncidentTimelineEntry[];
}

export const IncidentTimeline: React.FC<IncidentTimelineProps> = ({ timeline }) => {
  return (
    <div className={`p-4 bg-[#0F1115] border border-[#23262B] ${tokens.radius.md} space-y-3`}>
      <div className="flex items-center justify-between border-b border-[#23262B] pb-2">
        <h2 className="text-xs font-semibold uppercase tracking-wider text-white">
          Investigation Timeline
        </h2>
        <span className="text-[11px] font-mono-num text-[#6C727A]">
          {timeline.length} recorded events
        </span>
      </div>

      <div className="relative pl-4 space-y-3 border-l border-[#23262B] pt-1">
        {timeline.map((entry) => (
          <div key={entry.id} className="relative group">
            <div className="absolute -left-[21px] top-1.5 w-2 h-2 rounded-full bg-[#007AFF]" />
            <div className="flex flex-col gap-0.5">
              <div className="flex items-center gap-2 text-[11px] font-mono-num">
                <span className="text-[#6C727A]">
                  {formatTimestamp(entry.timestamp, { format: 'time-only' })}
                </span>
                <span className="text-[#007AFF] font-medium uppercase">
                  {entry.actionType.replace('_', ' ')}
                </span>
                <span className="text-[#6C727A]">· {entry.actorCallsign}</span>
              </div>
              <p className="text-xs text-[#E0E2E6] mt-0.5 leading-relaxed">
                {entry.description}
              </p>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

// 3. Evidence Panel
export interface EvidencePanelProps {
  evidence: EvidenceItem[];
  onVerify?: (item: EvidenceItem) => void;
  onExport?: (item: EvidenceItem) => void;
}

export const EvidencePanel: React.FC<EvidencePanelProps> = ({
  evidence,
  onVerify,
  onExport,
}) => {
  return (
    <div className={`p-4 bg-[#0F1115] border border-[#23262B] ${tokens.radius.md} space-y-3`}>
      <div className="flex items-center justify-between border-b border-[#23262B] pb-2">
        <h2 className="text-xs font-semibold uppercase tracking-wider text-white">
          Evidence Items
        </h2>
        <span className="text-[11px] font-mono-num text-[#6C727A]">
          {evidence.length} items linked
        </span>
      </div>

      {evidence.length === 0 ? (
        <div className="text-xs text-[#6C727A] py-6 text-center">
          No evidence artifacts attached to this incident.
        </div>
      ) : (
        <div className="space-y-2">
          {evidence.map((item) => (
            <div
              key={item.id}
              className="p-3 bg-[#14161A] border border-[#23262B] rounded flex flex-col sm:flex-row sm:items-center justify-between gap-2"
            >
              <div>
                <div className="text-xs font-semibold text-white">{item.title}</div>
                <div className="text-[11px] font-mono-num text-[#6C727A] mt-0.5">
                  {item.cameraIdentifier} · {item.mediaType} · Captured:{' '}
                  {formatTimestamp(item.capturedStartAt, { format: 'time-only' })}
                </div>
              </div>

              <div className="flex items-center gap-2 shrink-0">
                {onVerify && (
                  <Button variant="subtle" size="sm" onClick={() => onVerify(item)}>
                    Verify
                  </Button>
                )}
                {onExport && (
                  <Button variant="outline" size="sm" onClick={() => onExport(item)}>
                    Export
                  </Button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

// 4. Related Cameras Panel
export interface RelatedEventsPanelProps {
  relatedCameraIdentifiers: string[];
}

export const RelatedEventsPanel: React.FC<RelatedEventsPanelProps> = ({
  relatedCameraIdentifiers,
}) => {
  return (
    <div className={`p-4 bg-[#0F1115] border border-[#23262B] ${tokens.radius.md} space-y-3`}>
      <div className="flex items-center justify-between border-b border-[#23262B] pb-2">
        <h2 className="text-xs font-semibold uppercase tracking-wider text-white">
          Related Cameras
        </h2>
        <span className="text-[11px] font-mono-num text-[#6C727A]">
          {relatedCameraIdentifiers.length} linked
        </span>
      </div>

      <div className="flex flex-wrap gap-2">
        {relatedCameraIdentifiers.map((camId) => (
          <span
            key={camId}
            className="text-xs font-mono-num bg-[#14161A] text-white px-2.5 py-1 border border-[#23262B] rounded flex items-center gap-1.5"
          >
            <Camera className="w-3 h-3 text-[#007AFF]" />
            {camId}
          </span>
        ))}
      </div>
    </div>
  );
};

// 5. Operator Command Actions Panel
export interface OperatorActionsPanelProps {
  incidentId: string;
  onDispatchUnit?: (unitCallsign: string) => void;
  onLockPerimeter?: () => void;
  onAddNote?: (note: string) => void;
}

export const OperatorActionsPanel: React.FC<OperatorActionsPanelProps> = ({
  onDispatchUnit,
  onLockPerimeter,
  onAddNote,
}) => {
  const [noteText, setNoteText] = useState('');

  const handleAddNote = (e: React.FormEvent) => {
    e.preventDefault();
    if (!noteText.trim()) return;
    onAddNote?.(noteText.trim());
    setNoteText('');
  };

  return (
    <div className={`p-4 bg-[#0F1115] border border-[#23262B] ${tokens.radius.md} space-y-3`}>
      <div className="border-b border-[#23262B] pb-2">
        <h2 className="text-xs font-semibold uppercase tracking-wider text-white">
          Incident Actions
        </h2>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
        <Button
          variant="secondary"
          size="sm"
          onClick={() => onDispatchUnit?.('Patrol Unit 4')}
          leftIcon={<ArrowRight className="w-3 h-3 text-[#007AFF]" />}
          className="justify-start"
        >
          Dispatch Patrol Unit
        </Button>
        <Button
          variant="secondary"
          size="sm"
          onClick={() => onLockPerimeter?.()}
          leftIcon={<Lock className="w-3 h-3 text-[#FF9500]" />}
          className="justify-start"
        >
          Lock Perimeter Barrier
        </Button>
      </div>

      <form onSubmit={handleAddNote} className="flex gap-2 pt-2 border-t border-[#23262B]">
        <input
          type="text"
          value={noteText}
          onChange={(e) => setNoteText(e.target.value)}
          placeholder="Add operational observation note..."
          className="flex-1 h-8 bg-[#14161A] text-xs px-2.5 text-white border border-[#23262B] rounded placeholder:text-[#6C727A] focus:outline-hidden focus:border-[#007AFF]"
        />
        <Button variant="primary" size="sm" type="submit" leftIcon={<Plus className="w-3 h-3" />}>
          Add Note
        </Button>
      </form>
    </div>
  );
};
