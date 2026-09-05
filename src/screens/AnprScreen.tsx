import React, { useState, useEffect } from 'react';
import {
  Car,
  AlertTriangle,
  Camera,
  MapPin,
  ShieldAlert,
  Search as SearchIcon,
  CheckCircle2,
  HelpCircle,
  EyeOff,
  Layers,
  Sparkles,
  Download,
  Clock,
  Compass,
  ArrowRight,
  Shield,
  Activity,
} from 'lucide-react';
import { AnprRecord } from '../server/types';
import { Badge } from '../components/ui/Badge';
import { Button } from '../components/ui/Button';
import { Search } from '../components/ui/Search';
import { Drawer } from '../components/ui/Drawer';
import { EmptyState } from '../components/ui/FeedbackStates';
import { formatTimestamp, formatPercentage } from '../utils/formatters';
import { api } from '../api/client';

export interface AnprScreenProps {
  records: AnprRecord[];
  onEscalateAnpr?: (record: AnprRecord) => void;
}

type StatusFilter = 'ALL' | 'CONFIRMED' | 'UNCERTAIN' | 'UNREADABLE' | 'WATCHLIST';

export const AnprScreen: React.FC<AnprScreenProps> = ({ records, onEscalateAnpr }) => {
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('ALL');
  const [selectedRecord, setSelectedRecord] = useState<AnprRecord | null>(null);
  const [activeScenarioLoading, setActiveScenarioLoading] = useState<string | null>(null);
  const [scenarioNotification, setScenarioNotification] = useState<string | null>(null);
  const [localRecords, setLocalRecords] = useState<AnprRecord[]>(records);

  // Sync incoming props
  useEffect(() => {
    if (records && records.length > 0) {
      setLocalRecords(records);
    }
  }, [records]);

  // Load telemetry metrics or latest records
  const loadLatestRecords = async () => {
    try {
      const res = await api.anpr.list({ limit: 100 });
      if (res.success && res.records) {
        setLocalRecords(res.records);
      }
    } catch (err) {
      console.error('Failed to reload ANPR records:', err);
    }
  };

  const handleRunScenario = async (scenarioName: string) => {
    setActiveScenarioLoading(scenarioName);
    try {
      const res = await api.anpr.runScenario(scenarioName);
      if (res.success) {
        setScenarioNotification(`${res.scenario}: ${res.description}`);
        await loadLatestRecords();
        if (res.records && res.records.length > 0) {
          setSelectedRecord(res.records[0]);
        }
      }
    } catch (err: any) {
      console.error('Scenario run error:', err);
    } finally {
      setActiveScenarioLoading(null);
    }
  };

  const handleExportData = async () => {
    try {
      const res = await api.anpr.export('JSON');
      const blob = new Blob([JSON.stringify(res.records, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `IBVAP-ANPR-Export-${Date.now()}.json`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      console.error('Export error:', err);
    }
  };

  const safeRecords = Array.isArray(localRecords) ? localRecords : [];

  const filtered = safeRecords.filter((r) => {
    const term = search.toLowerCase();
    const matchSearch =
      (r.plateNumber || '').toLowerCase().includes(term) ||
      (r.normalizedPlate || '').toLowerCase().includes(term) ||
      (r.vehicleTrackId || '').toLowerCase().includes(term) ||
      (r.vehicleType || '').toLowerCase().includes(term) ||
      (r.cameraIdentifier || '').toLowerCase().includes(term);

    let matchStatus = true;
    if (statusFilter === 'WATCHLIST') {
      matchStatus = !!r.isWatchlistMatch;
    } else if (statusFilter !== 'ALL') {
      matchStatus = r.recognitionStatus === statusFilter;
    }

    return matchSearch && matchStatus;
  });

  const watchlistCount = safeRecords.filter((r) => r.isWatchlistMatch).length;
  const confirmedCount = safeRecords.filter((r) => r.recognitionStatus === 'CONFIRMED').length;
  const uncertainCount = safeRecords.filter((r) => r.recognitionStatus === 'UNCERTAIN').length;
  const unreadableCount = safeRecords.filter((r) => r.recognitionStatus === 'UNREADABLE').length;

  return (
    <div className="flex-1 flex flex-col h-full bg-[#0A0B0D] overflow-hidden">
      {/* 1. Sub-Header Toolbar */}
      <div className="p-4 sm:px-6 bg-[#0F1115] border-b border-[#23262B] flex flex-col gap-3 shrink-0">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-sm font-semibold text-white tracking-wide">ANPR SUBSYSTEM</h1>
              <span className="px-1.5 py-0.5 text-[10px] font-mono font-semibold bg-[#007AFF]/15 text-[#007AFF] border border-[#007AFF]/30 rounded">
                MULTI-FRAME CONSENSUS
              </span>
              {watchlistCount > 0 && (
                <span className="px-2 py-0.5 bg-[#FF4D4D]/15 border border-[#FF4D4D]/30 text-[#FF4D4D] rounded text-[11px] font-semibold font-mono">
                  {watchlistCount} Watchlist {watchlistCount === 1 ? 'Match' : 'Matches'}
                </span>
              )}
            </div>
            <p className="text-xs text-[#6C727A] mt-0.5">
              Automated Number Plate Recognition with spatial-temporal gating, persistent vehicle tracking, and evidence linking.
            </p>
          </div>

          <div className="flex items-center gap-2">
            <Search
              value={search}
              onChange={setSearch}
              placeholder="Search plate, track ID, sensor..."
              className="w-56"
            />
            <Button
              variant="outline"
              size="sm"
              onClick={handleExportData}
              leftIcon={<Download className="w-3.5 h-3.5" />}
            >
              Export
            </Button>
          </div>
        </div>

        {/* 2. Metrics & Deterministic Scenarios Bar */}
        <div className="pt-2 border-t border-[#23262B]/60 flex flex-wrap items-center justify-between gap-3 text-xs">
          {/* Status Tabs */}
          <div className="flex items-center gap-1 bg-[#14161A] p-0.5 rounded border border-[#23262B]">
            <button
              onClick={() => setStatusFilter('ALL')}
              className={`px-2.5 py-1 rounded text-[11px] font-medium transition-colors ${
                statusFilter === 'ALL'
                  ? 'bg-[#007AFF] text-white shadow-sm'
                  : 'text-[#8E95A0] hover:text-white'
              }`}
            >
              All ({safeRecords.length})
            </button>
            <button
              onClick={() => setStatusFilter('CONFIRMED')}
              className={`px-2.5 py-1 rounded text-[11px] font-medium transition-colors ${
                statusFilter === 'CONFIRMED'
                  ? 'bg-[#30D158]/20 text-[#30D158] border border-[#30D158]/40'
                  : 'text-[#8E95A0] hover:text-white'
              }`}
            >
              Confirmed ({confirmedCount})
            </button>
            <button
              onClick={() => setStatusFilter('UNCERTAIN')}
              className={`px-2.5 py-1 rounded text-[11px] font-medium transition-colors ${
                statusFilter === 'UNCERTAIN'
                  ? 'bg-[#FF9F0A]/20 text-[#FF9F0A] border border-[#FF9F0A]/40'
                  : 'text-[#8E95A0] hover:text-white'
              }`}
            >
              Uncertain ({uncertainCount})
            </button>
            <button
              onClick={() => setStatusFilter('UNREADABLE')}
              className={`px-2.5 py-1 rounded text-[11px] font-medium transition-colors ${
                statusFilter === 'UNREADABLE'
                  ? 'bg-[#8E95A0]/20 text-[#8E95A0] border border-[#8E95A0]/40'
                  : 'text-[#8E95A0] hover:text-white'
              }`}
            >
              Unreadable ({unreadableCount})
            </button>
            <button
              onClick={() => setStatusFilter('WATCHLIST')}
              className={`px-2.5 py-1 rounded text-[11px] font-medium transition-colors ${
                statusFilter === 'WATCHLIST'
                  ? 'bg-[#FF4D4D]/20 text-[#FF4D4D] border border-[#FF4D4D]/40'
                  : 'text-[#8E95A0] hover:text-white'
              }`}
            >
              Watchlist ({watchlistCount})
            </button>
          </div>

          {/* Test Scenario Buttons */}
          <div className="flex items-center gap-1.5">
            <span className="text-[11px] text-[#6C727A] flex items-center gap-1 font-mono">
              <Sparkles className="w-3 h-3 text-[#FF9F0A]" /> Test Scenarios:
            </span>
            <Button
              variant="subtle"
              size="sm"
              disabled={activeScenarioLoading !== null}
              onClick={() => handleRunScenario('SCENARIO_A')}
              className="text-[10px] h-7 px-2"
            >
              A: Clear
            </Button>
            <Button
              variant="subtle"
              size="sm"
              disabled={activeScenarioLoading !== null}
              onClick={() => handleRunScenario('SCENARIO_B')}
              className="text-[10px] h-7 px-2"
            >
              B: Unreadable
            </Button>
            <Button
              variant="subtle"
              size="sm"
              disabled={activeScenarioLoading !== null}
              onClick={() => handleRunScenario('SCENARIO_C')}
              className="text-[10px] h-7 px-2"
            >
              C: Multi-Vehicle
            </Button>
            <Button
              variant="subtle"
              size="sm"
              disabled={activeScenarioLoading !== null}
              onClick={() => handleRunScenario('SCENARIO_D')}
              className="text-[10px] h-7 px-2"
            >
              D: Occluded
            </Button>
            <Button
              variant="subtle"
              size="sm"
              disabled={activeScenarioLoading !== null}
              onClick={() => handleRunScenario('SCENARIO_E')}
              className="text-[10px] h-7 px-2"
            >
              E: Consensus
            </Button>
          </div>
        </div>

        {scenarioNotification && (
          <div className="p-2 bg-[#007AFF]/10 border border-[#007AFF]/30 rounded text-xs text-[#007AFF] flex items-center justify-between">
            <div className="flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 shrink-0 text-[#007AFF]" />
              <span>{scenarioNotification}</span>
            </div>
            <button
              onClick={() => setScenarioNotification(null)}
              className="text-[#6C727A] hover:text-white text-xs px-2"
            >
              Dismiss
            </button>
          </div>
        )}
      </div>

      {/* 3. Main Records Table */}
      <div className="flex-1 p-4 sm:p-6 overflow-y-auto">
        {filtered.length === 0 ? (
          <EmptyState
            icon={<Car className="w-6 h-6" />}
            title={search || statusFilter !== 'ALL' ? 'No Matching Captures' : 'No License Plate Records'}
            description={
              search || statusFilter !== 'ALL'
                ? 'Try adjusting your search query, status tabs, or run a test scenario above.'
                : 'Vehicles detected at border lanes and checkpoints will aggregate here with persistent track consensus.'
            }
          />
        ) : (
          <div className="bg-[#0F1115] border border-[#23262B] rounded overflow-hidden shadow-xl">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs border-collapse">
                <thead>
                  <tr className="border-b border-[#23262B] bg-[#14161A] text-[11px] font-mono uppercase tracking-wider text-[#6C727A]">
                    <th className="p-3 font-medium">Plate Number</th>
                    <th className="p-3 font-medium">Status</th>
                    <th className="p-3 font-medium">Vehicle Track</th>
                    <th className="p-3 font-medium">Spatial Context</th>
                    <th className="p-3 font-medium">Confidences</th>
                    <th className="p-3 font-medium">Observations</th>
                    <th className="p-3 font-medium">Watchlist</th>
                    <th className="p-3 font-medium text-right">Inspect</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#23262B]">
                  {filtered.map((record) => (
                    <tr
                      key={record.id || record.vehicleTrackId}
                      onClick={() => setSelectedRecord(record)}
                      className={`hover:bg-[#1A1D23] cursor-pointer transition-colors ${
                        record.isWatchlistMatch ? 'bg-[#FF4D4D]/5' : ''
                      }`}
                    >
                      <td className="p-3">
                        <div className="flex items-center gap-2">
                          <span className="text-xs font-bold font-mono px-2.5 py-1 bg-[#14161A] border border-[#23262B] text-white rounded tracking-wider shadow-inner">
                            {record.plateNumber}
                          </span>
                          {record.normalizedPlate && record.normalizedPlate !== record.plateNumber && (
                            <span className="text-[10px] font-mono text-[#6C727A]">
                              ({record.normalizedPlate})
                            </span>
                          )}
                        </div>
                        <div className="text-[10px] font-mono text-[#6C727A] mt-1 flex items-center gap-1">
                          <Clock className="w-3 h-3 text-[#6C727A]" />
                          {formatTimestamp(record.timestamp || record.lastSeenAt || '', { format: 'time-only' })}
                        </div>
                      </td>

                      <td className="p-3">
                        {record.recognitionStatus === 'CONFIRMED' && (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-semibold bg-[#30D158]/15 border border-[#30D158]/30 text-[#30D158]">
                            <CheckCircle2 className="w-3 h-3" /> CONFIRMED
                          </span>
                        )}
                        {record.recognitionStatus === 'UNCERTAIN' && (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-semibold bg-[#FF9F0A]/15 border border-[#FF9F0A]/30 text-[#FF9F0A]">
                            <HelpCircle className="w-3 h-3" /> UNCERTAIN
                          </span>
                        )}
                        {record.recognitionStatus === 'UNREADABLE' && (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-semibold bg-[#8E95A0]/15 border border-[#8E95A0]/30 text-[#8E95A0]">
                            <EyeOff className="w-3 h-3" /> UNREADABLE
                          </span>
                        )}
                        {(!record.recognitionStatus || record.recognitionStatus === 'PROBABLE' || record.recognitionStatus === 'DETECTED') && (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-semibold bg-[#007AFF]/15 border border-[#007AFF]/30 text-[#007AFF]">
                            <Layers className="w-3 h-3" /> DETECTED
                          </span>
                        )}
                      </td>

                      <td className="p-3">
                        <div className="font-mono text-white text-[11px] flex items-center gap-1.5">
                          <Car className="w-3.5 h-3.5 text-[#007AFF]" />
                          <span className="font-semibold">{record.vehicleTrackId || 'TRACK-PERSIST'}</span>
                        </div>
                        <div className="text-[11px] text-[#6C727A] mt-0.5">
                          {record.vehicleType || record.vehicleClass || 'CAR'}
                        </div>
                      </td>

                      <td className="p-3">
                        <div className="flex items-center gap-1 text-[#E0E2E6]">
                          <Camera className="w-3.5 h-3.5 text-[#007AFF] shrink-0" />
                          <span className="font-mono font-medium">{record.cameraIdentifier || record.cameraId}</span>
                        </div>
                        {record.spatialContext?.zoneName ? (
                          <div className="text-[11px] text-[#007AFF] mt-0.5 flex items-center gap-1">
                            <MapPin className="w-3 h-3" /> {record.spatialContext.zoneName}
                          </div>
                        ) : (
                          <div className="text-[11px] text-[#6C727A] mt-0.5">
                            {record.sectorName || 'Border Checkpoint'}
                          </div>
                        )}
                      </td>

                      <td className="p-3 font-mono">
                        <div className="text-[11px] font-semibold text-[#007AFF]">
                          Overall: {formatPercentage((record.confidence || record.confidences?.overall || 0.9) * 100)}
                        </div>
                        {record.confidences && (
                          <div className="text-[9px] text-[#6C727A] mt-0.5">
                            OCR: {formatPercentage(record.confidences.ocr * 100)} · Plate: {formatPercentage(record.confidences.plate * 100)}
                          </div>
                        )}
                      </td>

                      <td className="p-3 font-mono text-xs">
                        <span className="px-1.5 py-0.5 rounded bg-[#14161A] border border-[#23262B] text-white">
                          {record.observationCount || 1} {record.observationCount === 1 ? 'frame' : 'frames'}
                        </span>
                      </td>

                      <td className="p-3">
                        {record.isWatchlistMatch ? (
                          <Badge variant="critical">
                            MATCH: {record.watchlistCategory || 'FLAGGED'}
                          </Badge>
                        ) : (
                          <Badge variant="healthy" showDot={false}>
                            CLEAR
                          </Badge>
                        )}
                      </td>

                      <td className="p-3 text-right">
                        <Button
                          variant="subtle"
                          size="sm"
                          onClick={(e) => {
                            e.stopPropagation();
                            setSelectedRecord(record);
                          }}
                        >
                          Inspect
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>

      {/* 4. Detailed Inspection Drawer */}
      <Drawer
        isOpen={!!selectedRecord}
        onClose={() => setSelectedRecord(null)}
        title={selectedRecord ? `Plate ${selectedRecord.plateNumber}` : ''}
        subtitle="Automatic Number Plate Recognition Dossier"
      >
        {selectedRecord && (
          <div className="space-y-4 text-xs">
            {/* Capture Image */}
            <div className="relative aspect-video bg-black rounded overflow-hidden border border-[#23262B]">
              <img
                src={selectedRecord.thumbnailUrl || 'https://images.unsplash.com/photo-1549399542-7e3f8b79c341?w=800&auto=format&fit=crop&q=80'}
                alt={selectedRecord.plateNumber}
                referrerPolicy="no-referrer"
                className="w-full h-full object-cover"
              />
              <div className="absolute top-2 left-2 bg-[#0F1115]/90 px-2 py-0.5 rounded border border-[#23262B] text-[10px] font-mono text-[#007AFF]">
                LPR CROP · {selectedRecord.cameraIdentifier}
              </div>
              <div className="absolute bottom-2 right-2 bg-black/80 px-2 py-0.5 rounded border border-white/20 text-[10px] font-mono text-white">
                Track: {selectedRecord.vehicleTrackId || 'ACTIVE'}
              </div>
            </div>

            {/* Watchlist Banner */}
            {selectedRecord.isWatchlistMatch && (
              <div className="p-3 bg-[#FF4D4D]/10 border border-[#FF4D4D]/30 rounded text-[#FF4D4D] space-y-1">
                <div className="text-xs font-semibold flex items-center gap-1.5">
                  <ShieldAlert className="w-4 h-4 text-[#FF4D4D]" />
                  Watchlist Match Correlated
                </div>
                <p className="text-xs text-[#E0E2E6] leading-relaxed">
                  Vehicle plate matches registry entry: <strong>{selectedRecord.watchlistCategory || 'PRIORITY TARGET'}</strong>.
                </p>
              </div>
            )}

            {/* Normalized Plate Highlight */}
            <div className="p-3 bg-[#14161A] border border-[#23262B] rounded flex items-center justify-between">
              <div>
                <div className="text-[10px] font-mono uppercase text-[#6C727A]">Consensus Plate (Normalized)</div>
                <div className="text-base font-bold font-mono text-white mt-0.5 tracking-wider">
                  {selectedRecord.normalizedPlate || selectedRecord.plateNumber}
                </div>
              </div>
              <div className="text-right">
                <div className="text-[10px] font-mono uppercase text-[#6C727A]">Status</div>
                <div className="mt-0.5">
                  <Badge
                    variant={
                      selectedRecord.recognitionStatus === 'CONFIRMED'
                        ? 'healthy'
                        : selectedRecord.recognitionStatus === 'UNCERTAIN'
                        ? 'attention'
                        : 'neutral'
                    }
                  >
                    {selectedRecord.recognitionStatus || 'CONFIRMED'}
                  </Badge>
                </div>
              </div>
            </div>

            {/* Separated Confidences Breakdown */}
            <div className="p-3 bg-[#0F1115] border border-[#23262B] rounded space-y-2">
              <div className="text-[11px] font-semibold text-white flex items-center gap-1.5 pb-1 border-b border-[#23262B]">
                <Activity className="w-3.5 h-3.5 text-[#007AFF]" />
                Inference Confidence Attribution
              </div>
              <div className="space-y-1.5 text-xs">
                <div className="flex justify-between">
                  <span className="text-[#6C727A]">Vehicle Detection:</span>
                  <span className="font-mono text-white">
                    {formatPercentage((selectedRecord.confidences?.vehicle || 0.95) * 100)}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-[#6C727A]">Plate Region Localization:</span>
                  <span className="font-mono text-white">
                    {formatPercentage((selectedRecord.confidences?.plate || 0.92) * 100)}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-[#6C727A]">Optical Character Recognition:</span>
                  <span className="font-mono text-white">
                    {formatPercentage((selectedRecord.confidences?.ocr || selectedRecord.confidence) * 100)}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-[#6C727A]">Spatial Association:</span>
                  <span className="font-mono text-white">
                    {formatPercentage((selectedRecord.confidences?.association || 0.98) * 100)}
                  </span>
                </div>
                <div className="flex justify-between pt-1 border-t border-[#23262B]/50 font-semibold">
                  <span className="text-white">Overall Fused Confidence:</span>
                  <span className="font-mono text-[#007AFF]">
                    {formatPercentage((selectedRecord.confidence || 0.94) * 100)}
                  </span>
                </div>
              </div>
            </div>

            {/* Spatial Context & Tracking */}
            <div className="p-3 bg-[#0F1115] border border-[#23262B] rounded space-y-2">
              <div className="text-[11px] font-semibold text-white flex items-center gap-1.5 pb-1 border-b border-[#23262B]">
                <Compass className="w-3.5 h-3.5 text-[#007AFF]" />
                Spatial & Tracking Correlation
              </div>
              <div className="space-y-1 text-xs">
                <div className="flex justify-between py-0.5">
                  <span className="text-[#6C727A]">Persistent Vehicle Track:</span>
                  <span className="font-mono font-bold text-white">{selectedRecord.vehicleTrackId || 'TRACK-01'}</span>
                </div>
                <div className="flex justify-between py-0.5">
                  <span className="text-[#6C727A]">Vehicle Class:</span>
                  <span className="text-white font-medium">{selectedRecord.vehicleClass || selectedRecord.vehicleType || 'CAR'}</span>
                </div>
                <div className="flex justify-between py-0.5">
                  <span className="text-[#6C727A]">Sensor Identifier:</span>
                  <span className="font-mono text-white">{selectedRecord.cameraIdentifier || selectedRecord.cameraId}</span>
                </div>
                {selectedRecord.spatialContext?.zoneName && (
                  <div className="flex justify-between py-0.5">
                    <span className="text-[#6C727A]">Zone Occupancy:</span>
                    <span className="text-[#007AFF] font-medium">{selectedRecord.spatialContext.zoneName}</span>
                  </div>
                )}
                {selectedRecord.spatialContext?.lastFenceCrossed && (
                  <div className="flex justify-between py-0.5">
                    <span className="text-[#6C727A]">Virtual Boundary:</span>
                    <span className="text-[#FF9F0A] font-mono">{selectedRecord.spatialContext.lastFenceCrossed}</span>
                  </div>
                )}
                {selectedRecord.spatialContext?.dwellTimeSeconds !== undefined && (
                  <div className="flex justify-between py-0.5">
                    <span className="text-[#6C727A]">Zone Dwell Duration:</span>
                    <span className="font-mono text-white">{selectedRecord.spatialContext.dwellTimeSeconds} seconds</span>
                  </div>
                )}
                <div className="flex justify-between py-0.5">
                  <span className="text-[#6C727A]">Observations Aggregated:</span>
                  <span className="font-mono text-white">{selectedRecord.observationCount || 1} frames</span>
                </div>
                <div className="flex justify-between py-0.5">
                  <span className="text-[#6C727A]">First Seen:</span>
                  <span className="font-mono text-white">
                    {formatTimestamp(selectedRecord.firstSeenAt || selectedRecord.timestamp, { format: 'utc' })}
                  </span>
                </div>
                <div className="flex justify-between py-0.5">
                  <span className="text-[#6C727A]">Last Seen:</span>
                  <span className="font-mono text-white">
                    {formatTimestamp(selectedRecord.lastSeenAt || selectedRecord.timestamp, { format: 'utc' })}
                  </span>
                </div>
              </div>
            </div>

            {/* Action Buttons */}
            {selectedRecord.isWatchlistMatch && onEscalateAnpr && (
              <Button
                variant="danger"
                size="md"
                className="w-full"
                onClick={() => {
                  onEscalateAnpr(selectedRecord);
                  setSelectedRecord(null);
                }}
                leftIcon={<AlertTriangle className="w-4 h-4" />}
              >
                Escalate to Operational Incident
              </Button>
            )}
          </div>
        )}
      </Drawer>
    </div>
  );
};
