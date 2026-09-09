import React, { useState } from 'react';
import {
  ShieldAlert,
  Search,
  Filter,
} from 'lucide-react';
import { Incident, EvidenceItem } from '../server/types';
import {
  IncidentHeader,
  IncidentTimeline,
  EvidencePanel,
  RelatedEventsPanel,
  OperatorActionsPanel,
} from '../components/incident/IncidentComponents';
import { Badge } from '../components/ui/Badge';
import { tokens } from '../design-system/tokens';
import { formatTimestamp } from '../utils/formatters';

export interface IncidentsScreenProps {
  incidents: Incident[];
  evidenceList: EvidenceItem[];
  onUpdateStatus: (incidentId: string, status: string, notes?: string) => Promise<void>;
  onAddTimeline: (incidentId: string, actionType: string, description: string) => Promise<void>;
  onVerifyEvidence: (evidence: EvidenceItem) => Promise<void>;
  onExportEvidence: (evidence: EvidenceItem) => Promise<void>;
}

export const IncidentsScreen: React.FC<IncidentsScreenProps> = ({
  incidents,
  evidenceList,
  onUpdateStatus,
  onAddTimeline,
  onVerifyEvidence,
  onExportEvidence,
}) => {
  const [selectedIncidentId, setSelectedIncidentId] = useState<string>(
    incidents[0]?.id || ''
  );
  const [filterTab, setFilterTab] = useState<'ALL' | 'ACTIVE' | 'RESOLVED'>('ACTIVE');
  const [search, setSearch] = useState('');

  const selectedIncident =
    incidents.find((i) => i.id === selectedIncidentId) || incidents[0];

  const filteredIncidents = incidents.filter((i) => {
    if (filterTab === 'ACTIVE' && (i.status === 'RESOLVED' || i.status === 'CLOSED')) return false;
    if (filterTab === 'RESOLVED' && i.status !== 'RESOLVED' && i.status !== 'CLOSED') return false;
    if (search.trim()) {
      const q = search.toLowerCase();
      return (
        i.title.toLowerCase().includes(q) ||
        i.incidentNumber.toLowerCase().includes(q) ||
        i.sectorName.toLowerCase().includes(q)
      );
    }
    return true;
  });

  const currentEvidence = evidenceList.filter(
    (e) =>
      selectedIncident &&
      (e.incidentId === selectedIncident.id || e.incidentNumber === selectedIncident.incidentNumber)
  );

  const handleStatusChange = async (status: string) => {
    if (!selectedIncident) return;
    await onUpdateStatus(selectedIncident.id, status);
  };

  const handleAddNote = async (note: string) => {
    if (!selectedIncident) return;
    await onAddTimeline(selectedIncident.id, 'COMMAND_NOTE', note);
  };

  const handleDispatchUnit = async (callsign: string) => {
    if (!selectedIncident) return;
    await onAddTimeline(
      selectedIncident.id,
      'UNIT_DISPATCH',
      `Command dispatched patrol unit ${callsign} to sector perimeter coordinates.`
    );
  };

  const handleLockPerimeter = async () => {
    if (!selectedIncident) return;
    await onAddTimeline(
      selectedIncident.id,
      'PERIMETER_LOCKDOWN',
      `Sector perimeter barrier interlocks secured.`
    );
  };

  const activeCount = incidents.filter((i) => i.status !== 'RESOLVED' && i.status !== 'CLOSED').length;

  return (
    <div className="flex-1 flex flex-col gap-4 p-4 sm:p-5 overflow-y-auto select-none">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-[#23262B] pb-3">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-base font-semibold text-white tracking-tight">
              Incident Command
            </h1>
            {activeCount > 0 ? (
              <span className="text-xs font-mono-num font-semibold px-2 py-0.5 bg-[#007AFF]/20 text-[#007AFF] border border-[#007AFF]/30 rounded">
                {activeCount} Active
              </span>
            ) : (
              <span className="flex items-center gap-1 px-2 py-0.5 text-[10px] font-mono font-medium bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 rounded">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
                NOMINAL
              </span>
            )}
          </div>
          <p className="text-xs text-[#6C727A] mt-0.5">
            Operational incident coordination, investigation timelines, and response chronologies
          </p>
        </div>

        {/* Tab Filters & Search */}
        <div className="flex items-center gap-2">
          <div className="inline-flex bg-[#0F1115] p-0.5 border border-[#23262B] rounded text-xs">
            <button
              type="button"
              onClick={() => setFilterTab('ACTIVE')}
              className={`px-3 py-1 rounded font-medium cursor-pointer transition-colors ${
                filterTab === 'ACTIVE'
                  ? 'bg-[#1A1D23] text-white shadow-xs'
                  : 'text-[#6C727A] hover:text-[#E0E2E6]'
              }`}
            >
              Active ({activeCount})
            </button>
            <button
              type="button"
              onClick={() => setFilterTab('RESOLVED')}
              className={`px-3 py-1 rounded font-medium cursor-pointer transition-colors ${
                filterTab === 'RESOLVED'
                  ? 'bg-[#1A1D23] text-white shadow-xs'
                  : 'text-[#6C727A] hover:text-[#E0E2E6]'
              }`}
            >
              Resolved ({incidents.length - activeCount})
            </button>
            <button
              type="button"
              onClick={() => setFilterTab('ALL')}
              className={`px-3 py-1 rounded font-medium cursor-pointer transition-colors ${
                filterTab === 'ALL'
                  ? 'bg-[#1A1D23] text-white shadow-xs'
                  : 'text-[#6C727A] hover:text-[#E0E2E6]'
              }`}
            >
              All ({incidents.length})
            </button>
          </div>
        </div>
      </div>

      {/* Main Split View: Left List / Right Active Incident Dossier */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 flex-1">
        {/* Left Dossier Directory (4 Cols) */}
        <div className="lg:col-span-4 space-y-2 max-h-[750px] overflow-y-auto pr-1">
          {filteredIncidents.length === 0 ? (
            <div className="p-8 text-center text-xs text-[#6C727A] border border-[#23262B] bg-[#0F1115] rounded">
              No incidents match the active filter.
            </div>
          ) : (
            filteredIncidents.map((inc) => {
              const isSelected = selectedIncident?.id === inc.id;
              const isCritical = inc.severity === 'CRITICAL';

              return (
                <div
                  key={inc.id}
                  onClick={() => setSelectedIncidentId(inc.id)}
                  className={`p-3 border cursor-pointer transition-all rounded ${
                    isSelected
                      ? 'border-[#007AFF] bg-[#14161A]'
                      : 'border-[#23262B] bg-[#0F1115] hover:bg-[#14161A]'
                  }`}
                >
                  <div className="flex items-center justify-between gap-1">
                    <span className="text-xs font-mono-num font-bold text-[#007AFF]">
                      {inc.incidentNumber}
                    </span>
                    <span
                      className={`text-[10px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded-xs ${
                        isCritical ? 'bg-[#FF4D4D] text-white' : 'bg-[#FF9500] text-black'
                      }`}
                    >
                      {inc.severity}
                    </span>
                  </div>

                  <div className="text-xs font-semibold text-white mt-1 truncate">
                    {inc.title}
                  </div>
                  <div className="text-[11px] text-[#6C727A] mt-0.5 line-clamp-2 leading-relaxed">
                    {inc.summary}
                  </div>

                  <div className="mt-2 pt-2 border-t border-[#23262B] flex items-center justify-between text-[10px] font-mono-num text-[#6C727A]">
                    <span>{inc.sectorName}</span>
                    <span className="text-[#E0E2E6] font-medium">{inc.status.replace('_', ' ')}</span>
                  </div>
                </div>
              );
            })
          )}
        </div>

        {/* Right Active Incident Dossier (8 Cols) */}
        <div className="lg:col-span-8 flex flex-col gap-4">
          {selectedIncident ? (
            <>
              <IncidentHeader
                incident={selectedIncident}
                onStatusChange={handleStatusChange}
              />

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <IncidentTimeline timeline={selectedIncident.timeline} />
                <div className="space-y-4">
                  <OperatorActionsPanel
                    incidentId={selectedIncident.id}
                    onDispatchUnit={handleDispatchUnit}
                    onLockPerimeter={handleLockPerimeter}
                    onAddNote={handleAddNote}
                  />
                  <RelatedEventsPanel
                    relatedCameraIdentifiers={selectedIncident.relatedCameraIdentifiers}
                  />
                </div>
              </div>

              <EvidencePanel
                evidence={currentEvidence}
                onVerify={onVerifyEvidence}
                onExport={onExportEvidence}
              />
            </>
          ) : (
            <div className="flex-1 flex items-center justify-center p-12 text-[#6C727A] text-xs border border-[#23262B] bg-[#0F1115] rounded">
              Select an incident from the list to view investigation details.
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
