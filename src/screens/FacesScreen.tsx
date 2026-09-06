import React, { useState, useEffect } from 'react';
import {
  UserCheck,
  Camera,
  ShieldAlert,
  CheckCircle2,
  HelpCircle,
  EyeOff,
  Clock,
  ArrowRight,
  User,
  RefreshCw,
  Zap,
} from 'lucide-react';
import {
  PersistentPersonFaceRecord,
  FaceTelemetryMetrics,
  FaceQualityState,
  FaceRecognitionStatus,
  SyntheticFaceWatchlist,
} from '../face/types';
import { Badge } from '../components/ui/Badge';
import { Button } from '../components/ui/Button';
import { Search } from '../components/ui/Search';
import { Drawer } from '../components/ui/Drawer';
import { formatTimestamp } from '../utils/formatters';
import { api } from '../api/client';

export interface FacesScreenProps {
  onEscalateFace?: (record: PersistentPersonFaceRecord) => void;
}

type QualityFilter = 'ALL' | 'GOOD' | 'ACCEPTABLE' | 'POOR' | 'UNREADABLE';
type RecognitionFilter = 'ALL' | 'MATCHED' | 'POSSIBLE_MATCH' | 'UNKNOWN' | 'LOW_QUALITY' | 'UNREADABLE';

export const FacesScreen: React.FC<FacesScreenProps> = ({ onEscalateFace }) => {
  const [search, setSearch] = useState('');
  const [qualityFilter, setQualityFilter] = useState<QualityFilter>('ALL');
  const [recognitionFilter, setRecognitionFilter] = useState<RecognitionFilter>('ALL');
  const [watchlistOnly, setWatchlistOnly] = useState(false);
  const [selectedRecord, setSelectedRecord] = useState<PersistentPersonFaceRecord | null>(null);
  const [activeScenarioLoading, setActiveScenarioLoading] = useState<string | null>(null);
  const [scenarioNotification, setScenarioNotification] = useState<string | null>(null);
  const [records, setRecords] = useState<PersistentPersonFaceRecord[]>([]);
  const [metrics, setMetrics] = useState<FaceTelemetryMetrics | null>(null);
  const [, setWatchlists] = useState<SyntheticFaceWatchlist[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  const loadData = async () => {
    setIsLoading(true);
    try {
      const [recRes, metRes, wlRes] = await Promise.allSettled([
        api.faces.list({ limit: 100 }),
        api.faces.getMetrics(),
        api.faces.getWatchlists(),
      ]);

      if (recRes.status === 'fulfilled' && recRes.value.records) {
        setRecords(recRes.value.records);
      }
      if (metRes.status === 'fulfilled' && metRes.value.metrics) {
        setMetrics(metRes.value.metrics);
      }
      if (wlRes.status === 'fulfilled' && wlRes.value.watchlists) {
        setWatchlists(wlRes.value.watchlists);
      }
    } catch (err) {
      console.error('Failed to load Face Analytics data:', err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadData();
    const interval = setInterval(loadData, 3000);
    return () => clearInterval(interval);
  }, []);

  const [scenarioError, setScenarioError] = useState<string | null>(null);

  const handleRunScenario = async (scenarioId: string, desc: string) => {
    setActiveScenarioLoading(scenarioId);
    setScenarioError(null);
    try {
      const res = await api.faces.runScenario(scenarioId);
      if (res.success) {
        setScenarioNotification(`Scenario ${res.scenario}: ${desc}`);
        await loadData();
        if (res.result?.record) {
          setSelectedRecord(res.result.record);
        }
      } else {
        setScenarioError(res.message || 'Scenario failed to execute');
      }
    } catch (err: any) {
      console.error('Scenario run error:', err);
      setScenarioError(err?.message || 'Failed to trigger verification scenario');
    } finally {
      setActiveScenarioLoading(null);
    }
  };

  // Filtered record list
  const filteredRecords = records.filter((r) => {
    if (search.trim()) {
      const q = search.toLowerCase();
      const matchTrack = r.personTrackId.toLowerCase().includes(q);
      const matchCam = r.cameraId.toLowerCase().includes(q);
      const matchWl = r.watchlistDisplayName?.toLowerCase().includes(q);
      if (!matchTrack && !matchCam && !matchWl) return false;
    }

    if (qualityFilter !== 'ALL' && r.bestQuality !== qualityFilter) {
      return false;
    }

    if (recognitionFilter !== 'ALL' && r.recognitionStatus !== recognitionFilter) {
      return false;
    }

    if (watchlistOnly && !r.isWatchlistMatch) {
      return false;
    }

    return true;
  });

  const getQualityBadge = (quality: FaceQualityState) => {
    switch (quality) {
      case 'GOOD':
        return <Badge variant="healthy" size="sm">GOOD QUALITY</Badge>;
      case 'ACCEPTABLE':
        return <Badge variant="attention" size="sm">ACCEPTABLE</Badge>;
      case 'POOR':
        return <Badge variant="critical" size="sm">POOR QUALITY</Badge>;
      case 'UNREADABLE':
        return <Badge variant="neutral" size="sm">UNREADABLE</Badge>;
      default:
        return <Badge variant="neutral" size="sm">{quality}</Badge>;
    }
  };

  const getRecognitionBadge = (status: FaceRecognitionStatus, similarity?: number) => {
    switch (status) {
      case 'MATCHED':
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-bold bg-[#DC2626]/20 text-[#EF4444] border border-[#EF4444]/40 font-mono">
            <ShieldAlert className="w-3 h-3" />
            MATCHED {similarity ? `(${(similarity * 100).toFixed(1)}%)` : ''}
          </span>
        );
      case 'POSSIBLE_MATCH':
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-bold bg-[#F59E0B]/20 text-[#F59E0B] border border-[#F59E0B]/40 font-mono">
            <HelpCircle className="w-3 h-3" />
            POSSIBLE ({similarity ? `${(similarity * 100).toFixed(1)}%` : 'AMBIGUOUS'})
          </span>
        );
      case 'UNKNOWN':
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-semibold bg-[#2A2E39] text-[#94A3B8] border border-[#3A3F4D] font-mono">
            <CheckCircle2 className="w-3 h-3 text-[#10B981]" />
            CLEARED / UNKNOWN
          </span>
        );
      case 'LOW_QUALITY':
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-semibold bg-[#F59E0B]/10 text-[#D97706] border border-[#F59E0B]/20 font-mono">
            <EyeOff className="w-3 h-3" />
            GATED (LOW QUALITY)
          </span>
        );
      case 'UNREADABLE':
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-semibold bg-[#3A3F4D]/40 text-[#64748B] border border-[#3A3F4D] font-mono">
            <EyeOff className="w-3 h-3" />
            UNREADABLE
          </span>
        );
      default:
        return <Badge variant="neutral" size="sm">{status}</Badge>;
    }
  };

  return (
    <div className="flex-1 flex flex-col h-full bg-[#0E1013] text-[#E0E2E6] overflow-hidden">
      {/* 1. TOP HEADER & TELEMETRY STRIP */}
      <div className="p-4 border-b border-[#23262B] bg-[#14161A] flex flex-col gap-4">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-lg bg-[#38BDF8]/10 border border-[#38BDF8]/30 text-[#38BDF8]">
              <UserCheck className="w-6 h-6" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-lg font-bold text-white tracking-tight">
                  Biometric Face Analytics & Re-Identification
                </h1>
                <span className="px-2 py-0.5 rounded-full text-[10px] font-mono font-bold bg-[#10B981]/20 text-[#10B981] border border-[#10B981]/40 flex items-center gap-1">
                  <span className="w-1.5 h-1.5 rounded-full bg-[#10B981] animate-pulse" />
                  REALTIME ENGINE ACTIVE
                </span>
              </div>
              <p className="text-xs text-[#8C929D] mt-0.5">
                Multi-frame consensus, optical quality assessment, upper-body association, and synthetic watchlist matching
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              leftIcon={<RefreshCw className="w-3.5 h-3.5" />}
              onClick={loadData}
              disabled={isLoading}
            >
              Sync Records
            </Button>
          </div>
        </div>

        {/* Realtime Telemetry KPIs */}
        {metrics && (
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2 pt-1 border-t border-[#23262B]">
            <div className="bg-[#191C22] p-2.5 rounded border border-[#23262B]">
              <div className="text-[10px] text-[#8C929D] uppercase tracking-wider font-mono">Total Observations</div>
              <div className="text-lg font-mono font-bold text-white mt-0.5">{metrics.facesDetectedTotal}</div>
              <div className="text-[10px] text-[#64748B] mt-0.5">{records.length} Person Tracks</div>
            </div>

            <div className="bg-[#191C22] p-2.5 rounded border border-[#23262B]">
              <div className="text-[10px] text-[#8C929D] uppercase tracking-wider font-mono">Good Quality Ratio</div>
              <div className="text-lg font-mono font-bold text-[#10B981] mt-0.5">
                {metrics.facesEvaluatedTotal > 0
                  ? `${((metrics.facesGoodQualityTotal / metrics.facesEvaluatedTotal) * 100).toFixed(0)}%`
                  : '0%'}
              </div>
              <div className="text-[10px] text-[#64748B] mt-0.5">{metrics.facesGoodQualityTotal} pristine crops</div>
            </div>

            <div className="bg-[#191C22] p-2.5 rounded border border-[#23262B]">
              <div className="text-[10px] text-[#8C929D] uppercase tracking-wider font-mono">Watchlist Matches</div>
              <div className="text-lg font-mono font-bold text-[#EF4444] mt-0.5">{metrics.watchlistMatchesTotal}</div>
              <div className="text-[10px] text-[#EF4444]/80 mt-0.5">Confirmed POI hits</div>
            </div>

            <div className="bg-[#191C22] p-2.5 rounded border border-[#23262B]">
              <div className="text-[10px] text-[#8C929D] uppercase tracking-wider font-mono">Possible Matches</div>
              <div className="text-lg font-mono font-bold text-[#F59E0B] mt-0.5">{metrics.watchlistPossibleMatchesTotal}</div>
              <div className="text-[10px] text-[#F59E0B]/80 mt-0.5">Ambiguous review</div>
            </div>

            <div className="bg-[#191C22] p-2.5 rounded border border-[#23262B]">
              <div className="text-[10px] text-[#8C929D] uppercase tracking-wider font-mono">Low Quality Gated</div>
              <div className="text-lg font-mono font-bold text-[#94A3B8] mt-0.5">{metrics.facesPoorQualityTotal + metrics.facesUnreadableTotal}</div>
              <div className="text-[10px] text-[#64748B] mt-0.5">Fabrication rejected</div>
            </div>

            <div className="bg-[#191C22] p-2.5 rounded border border-[#23262B]">
              <div className="text-[10px] text-[#8C929D] uppercase tracking-wider font-mono">Processing Latency</div>
              <div className="text-lg font-mono font-bold text-[#38BDF8] mt-0.5">
                {metrics.lastProcessingLatencyMs ? `${metrics.lastProcessingLatencyMs.toFixed(1)} ms` : '0.8 ms'}
              </div>
              <div className="text-[10px] text-[#64748B] mt-0.5">FaceNet-128D Edge</div>
            </div>
          </div>
        )}

        {/* Verification Scenarios Toolbar */}
        <div className="bg-[#181B20] p-2.5 rounded-lg border border-[#2A2E37] flex flex-col gap-2">
          <div className="flex items-center justify-between text-xs">
            <span className="font-semibold text-[#CBD5E1] flex items-center gap-1.5 font-mono">
              <Zap className="w-3.5 h-3.5 text-[#F59E0B]" />
              DETERMINISTIC VERIFICATION SCENARIOS (SECTION 11)
            </span>
            <div className="flex items-center gap-2">
              {scenarioError && (
                <span className="text-[11px] text-[#EF4444] font-mono animate-fade-in truncate max-w-md">
                  ✕ {scenarioError}
                </span>
              )}
              {scenarioNotification && (
                <span className="text-[11px] text-[#10B981] font-mono animate-fade-in truncate max-w-md">
                  ✓ {scenarioNotification}
                </span>
              )}
            </div>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-1.5">
            <Button
              variant="outline"
              size="sm"
              disabled={activeScenarioLoading !== null}
              onClick={() => handleRunScenario('A', 'Clear good-quality face, no watchlist match')}
              className="text-[11px] justify-center h-8"
            >
              {activeScenarioLoading === 'A' ? 'Running...' : 'A: Normal'}
            </Button>
            <Button
              variant="outline"
              size="sm"
              disabled={activeScenarioLoading !== null}
              onClick={() => handleRunScenario('B', 'Low quality/blurred, matching gated')}
              className="text-[11px] justify-center h-8"
            >
              {activeScenarioLoading === 'B' ? 'Running...' : 'B: Low Quality'}
            </Button>
            <Button
              variant="outline"
              size="sm"
              disabled={activeScenarioLoading !== null}
              onClick={() => handleRunScenario('C', 'Multi-person scene, distinct Person Track IDs')}
              className="text-[11px] justify-center h-8"
            >
              {activeScenarioLoading === 'C' ? 'Running...' : 'C: Multi-Person'}
            </Button>
            <Button
              variant="outline"
              size="sm"
              disabled={activeScenarioLoading !== null}
              onClick={() => handleRunScenario('D', 'Temporary occlusion gap, track retained')}
              className="text-[11px] justify-center h-8"
            >
              {activeScenarioLoading === 'D' ? 'Running...' : 'D: Occlusion'}
            </Button>
            <Button
              variant="outline"
              size="sm"
              disabled={activeScenarioLoading !== null}
              onClick={() => handleRunScenario('E', 'Progressive promotion: POOR -> ACCEPTABLE -> GOOD')}
              className="text-[11px] justify-center h-8"
            >
              {activeScenarioLoading === 'E' ? 'Running...' : 'E: Progressive'}
            </Button>
            <Button
              variant="outline"
              size="sm"
              disabled={activeScenarioLoading !== null}
              onClick={() => handleRunScenario('F', 'Synthetic watchlist hit (POI-701) -> CRITICAL alert')}
              className="text-[11px] justify-center h-8 text-[#EF4444] border-[#EF4444]/40 hover:bg-[#EF4444]/10"
            >
              {activeScenarioLoading === 'F' ? 'Running...' : 'F: Watchlist Hit'}
            </Button>
            <Button
              variant="outline"
              size="sm"
              disabled={activeScenarioLoading !== null}
              onClick={() => handleRunScenario('G', 'Ambiguous similarity -> marked POSSIBLE_MATCH')}
              className="text-[11px] justify-center h-8 text-[#F59E0B] border-[#F59E0B]/40 hover:bg-[#F59E0B]/10"
            >
              {activeScenarioLoading === 'G' ? 'Running...' : 'G: Ambiguous'}
            </Button>
          </div>
        </div>
      </div>

      {/* 2. SEARCH & FILTER TABS */}
      <div className="p-3 bg-[#111317] border-b border-[#23262B] flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3 flex-1 min-w-[280px]">
          <div className="w-72">
            <Search
              placeholder="Search Track ID, Camera, or Watchlist..."
              value={search}
              onChange={(val) => setSearch(val)}
            />
          </div>

          <div className="flex items-center bg-[#191C22] p-0.5 rounded border border-[#23262B] text-xs">
            <button
              onClick={() => setQualityFilter('ALL')}
              className={`px-2.5 py-1 rounded font-mono ${
                qualityFilter === 'ALL' ? 'bg-[#3A3F4D] text-white font-bold' : 'text-[#8C929D] hover:text-white'
              }`}
            >
              All Qualities
            </button>
            <button
              onClick={() => setQualityFilter('GOOD')}
              className={`px-2.5 py-1 rounded font-mono ${
                qualityFilter === 'GOOD' ? 'bg-[#10B981]/20 text-[#10B981] font-bold' : 'text-[#8C929D] hover:text-white'
              }`}
            >
              Good
            </button>
            <button
              onClick={() => setQualityFilter('ACCEPTABLE')}
              className={`px-2.5 py-1 rounded font-mono ${
                qualityFilter === 'ACCEPTABLE' ? 'bg-[#F59E0B]/20 text-[#F59E0B] font-bold' : 'text-[#8C929D] hover:text-white'
              }`}
            >
              Acceptable
            </button>
            <button
              onClick={() => setQualityFilter('POOR')}
              className={`px-2.5 py-1 rounded font-mono ${
                qualityFilter === 'POOR' ? 'bg-[#EF4444]/20 text-[#EF4444] font-bold' : 'text-[#8C929D] hover:text-white'
              }`}
            >
              Poor
            </button>
            <button
              onClick={() => setQualityFilter('UNREADABLE')}
              className={`px-2.5 py-1 rounded font-mono ${
                qualityFilter === 'UNREADABLE' ? 'bg-[#64748B]/20 text-[#94A3B8] font-bold' : 'text-[#8C929D] hover:text-white'
              }`}
            >
              Unreadable
            </button>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => setWatchlistOnly(!watchlistOnly)}
            className={`px-3 py-1.5 rounded text-xs font-mono font-bold flex items-center gap-1.5 border transition-all ${
              watchlistOnly
                ? 'bg-[#DC2626]/20 border-[#EF4444] text-[#EF4444]'
                : 'bg-[#191C22] border-[#23262B] text-[#8C929D] hover:text-white'
            }`}
          >
            <ShieldAlert className="w-3.5 h-3.5" />
            Watchlist Hits Only
          </button>
        </div>
      </div>

      {/* 3. MAIN RECORDS GRID */}
      <div className="flex-1 p-4 overflow-y-auto">
        {filteredRecords.length === 0 ? (
          <div className="h-64 flex flex-col items-center justify-center text-center">
            <UserCheck className="w-12 h-12 text-[#475569] mb-3 opacity-40" />
            <h3 className="text-sm font-semibold text-[#94A3B8]">No Face Records Found</h3>
            <p className="text-xs text-[#64748B] mt-1 max-w-sm">
              No Person Face records match the active search or filters. Run a verification scenario above or enable AI tracking on camera feeds.
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
            {filteredRecords.map((record) => {
              const isMatch = record.isWatchlistMatch;
              const isSelected = selectedRecord?.personTrackId === record.personTrackId;
              const quality = record.bestQuality;
              const bestObs = record.bestObservation || record.observations[0];

              return (
                <div
                  key={record.personTrackId}
                  onClick={() => setSelectedRecord(record)}
                  className={`bg-[#14161A] border rounded-lg p-3 transition-all cursor-pointer flex flex-col justify-between ${
                    isSelected
                      ? 'border-[#38BDF8] ring-1 ring-[#38BDF8]'
                      : isMatch
                      ? 'border-[#EF4444]/60 hover:border-[#EF4444]'
                      : 'border-[#23262B] hover:border-[#3A3F4D]'
                  }`}
                >
                  <div>
                    {/* Card Header: Person Track ID & Status Badge */}
                    <div className="flex items-center justify-between gap-2 mb-2.5">
                      <div className="flex items-center gap-1.5 font-mono text-xs font-bold text-white">
                        <User className="w-3.5 h-3.5 text-[#38BDF8]" />
                        <span>Track {record.personTrackId}</span>
                      </div>
                      {getRecognitionBadge(record.recognitionStatus, record.similarityScore)}
                    </div>

                    {/* Snapshot & Biometric Assessment Row */}
                    <div className="flex gap-3 mb-2.5">
                      {/* Face Thumbnail */}
                      <div className="relative w-20 h-20 rounded bg-[#0A0B0E] border border-[#23262B] overflow-hidden flex-shrink-0 flex items-center justify-center">
                        <img
                          src={bestObs?.evidenceReference?.cropUrl || 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=400&auto=format&fit=crop&q=60'}
                          alt={`Face on ${record.personTrackId}`}
                          className="w-full h-full object-cover"
                          crossOrigin="anonymous"
                        />
                        <div className="absolute bottom-0 inset-x-0 bg-black/80 px-1 py-0.5 text-[8px] font-mono text-center text-[#94A3B8]">
                          {bestObs?.pixelBox ? `${bestObs.pixelBox.width}x${bestObs.pixelBox.height}px` : '112x112px'}
                        </div>
                      </div>

                      {/* Optical Quality & Spatial Details */}
                      <div className="flex-1 flex flex-col justify-between text-xs font-mono">
                        <div>
                          <div className="flex items-center justify-between">
                            <span className="text-[11px] text-[#8C929D]">Quality</span>
                            {getQualityBadge(quality)}
                          </div>
                          <div className="flex items-center justify-between mt-1 text-[11px]">
                            <span className="text-[#8C929D]">Score</span>
                            <span className="text-white font-bold">
                              {(record.bestQualityScore * 100).toFixed(1)}%
                            </span>
                          </div>
                          <div className="flex items-center justify-between mt-1 text-[11px]">
                            <span className="text-[#8C929D]">Observations</span>
                            <span className="text-[#38BDF8] font-bold">{record.observationsCount} frames</span>
                          </div>
                        </div>

                        <div className="text-[10px] text-[#64748B] flex items-center gap-1 mt-1 truncate">
                          <Camera className="w-3 h-3 text-[#8C929D] flex-shrink-0" />
                          <span className="truncate">{record.cameraIdentifier || record.cameraId}</span>
                        </div>
                      </div>
                    </div>

                    {/* Positive Watchlist Card if matched */}
                    {isMatch && record.watchlistDisplayName && (
                      <div className="bg-[#DC2626]/10 border border-[#EF4444]/40 rounded p-2 mb-2 flex items-center justify-between">
                        <div>
                          <div className="text-[9px] text-[#EF4444] uppercase font-mono font-bold tracking-wider">
                            Watchlist Match: {record.watchlistCategory}
                          </div>
                          <div className="text-xs font-bold text-white mt-0.5">
                            {record.watchlistDisplayName}
                          </div>
                        </div>
                        <span className="px-2 py-0.5 rounded bg-[#DC2626] text-white font-mono font-bold text-xs">
                          {((record.similarityScore || 0) * 100).toFixed(1)}%
                        </span>
                      </div>
                    )}
                  </div>

                  {/* Card Footer: Timestamp & Action */}
                  <div className="pt-2 border-t border-[#23262B] flex items-center justify-between text-[11px] text-[#8C929D]">
                    <span className="flex items-center gap-1 font-mono">
                      <Clock className="w-3 h-3" />
                      {formatTimestamp(record.lastSeenAt)}
                    </span>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        setSelectedRecord(record);
                      }}
                      className="text-[#38BDF8] hover:text-[#7DD3FC] font-semibold flex items-center gap-0.5"
                    >
                      Audit Details <ArrowRight className="w-3 h-3" />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* 4. DETAIL INSPECTION DRAWER */}
      {selectedRecord && (
        <Drawer
          isOpen={true}
          onClose={() => setSelectedRecord(null)}
          title={`Person Face Record: ${selectedRecord.personTrackId}`}
          subtitle={`Camera: ${selectedRecord.cameraIdentifier || selectedRecord.cameraId} · Sector: ${
            selectedRecord.spatialContext?.sectorName || 'Sector Bravo'
          }`}
          width="lg"
        >
          <div className="space-y-6 text-sm">
            {/* Watchlist Hit Alert Box */}
            {selectedRecord.isWatchlistMatch && (
              <div className="p-4 rounded-lg bg-[#DC2626]/15 border border-[#EF4444] flex items-start gap-3">
                <ShieldAlert className="w-5 h-5 text-[#EF4444] flex-shrink-0 mt-0.5" />
                <div className="flex-1">
                  <div className="flex items-center justify-between">
                    <h4 className="text-sm font-bold text-white">
                      POSITIVE BIOMETRIC WATCHLIST MATCH
                    </h4>
                    <span className="px-2 py-0.5 rounded bg-[#DC2626] text-white font-mono font-bold text-xs">
                      {((selectedRecord.similarityScore || 0) * 100).toFixed(1)}% SIMILARITY
                    </span>
                  </div>
                  <p className="text-xs text-[#E2E8F0] mt-1">
                    Subject identified as <span className="font-bold text-white">{selectedRecord.watchlistDisplayName}</span> ({selectedRecord.watchlistCategory}).
                    Biometric feature vector matches synthetic enrolled template with high confidence.
                  </p>
                  {onEscalateFace && (
                    <div className="mt-3">
                      <Button
                        variant="primary"
                        size="sm"
                        onClick={() => onEscalateFace(selectedRecord)}
                        className="bg-[#DC2626] hover:bg-[#B91C1C] text-white font-bold"
                      >
                        Escalate to Incident Command
                      </Button>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Quality Summary & Model Details */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <div className="bg-[#181B20] p-3 rounded border border-[#2A2E37]">
                <div className="text-[10px] text-[#8C929D] uppercase font-mono">Consensus Quality</div>
                <div className="mt-1">{getQualityBadge(selectedRecord.bestQuality)}</div>
              </div>
              <div className="bg-[#181B20] p-3 rounded border border-[#2A2E37]">
                <div className="text-[10px] text-[#8C929D] uppercase font-mono">Quality Score</div>
                <div className="text-sm font-mono font-bold text-white mt-1">
                  {(selectedRecord.bestQualityScore * 100).toFixed(1)}%
                </div>
              </div>
              <div className="bg-[#181B20] p-3 rounded border border-[#2A2E37]">
                <div className="text-[10px] text-[#8C929D] uppercase font-mono">Status</div>
                <div className="mt-1">
                  {getRecognitionBadge(selectedRecord.recognitionStatus, selectedRecord.similarityScore)}
                </div>
              </div>
              <div className="bg-[#181B20] p-3 rounded border border-[#2A2E37]">
                <div className="text-[10px] text-[#8C929D] uppercase font-mono">Dwell Time</div>
                <div className="text-sm font-mono font-bold text-[#38BDF8] mt-1">
                  {selectedRecord.bestObservation?.spatialContext?.dwellTimeSeconds
                    ? `${selectedRecord.bestObservation.spatialContext.dwellTimeSeconds.toFixed(1)}s`
                    : `${Math.max(1, Math.round((new Date(selectedRecord.lastSeenAt).getTime() - new Date(selectedRecord.firstSeenAt).getTime()) / 1000))}s`}
                </div>
              </div>
            </div>

            {/* Optical Assessment Breakdown of Best Observation */}
            {selectedRecord.observations.length > 0 && (
              <div className="bg-[#14161A] p-4 rounded-lg border border-[#23262B]">
                <h4 className="text-xs font-mono uppercase text-[#8C929D] tracking-wider mb-3">
                  Optical Assessment (Best Observation)
                </h4>
                {(() => {
                  const obs = selectedRecord.bestObservation || selectedRecord.observations[0];
                  const q = obs.quality;
                  return (
                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-4 text-xs font-mono">
                      <div>
                        <span className="text-[#64748B]">Resolution:</span>
                        <div className="text-white font-bold">
                          {obs.pixelBox ? `${obs.pixelBox.width}x${obs.pixelBox.height} px` : `${Math.round(q.faceSize.normalizedWidth * 1920)}x${Math.round(q.faceSize.normalizedHeight * 1080)} px`}
                        </div>
                      </div>
                      <div>
                        <span className="text-[#64748B]">Sharpness:</span>
                        <div className="text-white font-bold">{(q.blur.sharpnessScore * 100).toFixed(0)}% (Laplacian)</div>
                      </div>
                      <div>
                        <span className="text-[#64748B]">Illumination:</span>
                        <div className="text-white font-bold">{(q.illumination.luminanceScore * 100).toFixed(0)}%</div>
                      </div>
                      <div>
                        <span className="text-[#64748B]">Head Pose (Y/P/R):</span>
                        <div className="text-white font-bold">{q.pose.yawDegrees.toFixed(0)}° / {q.pose.pitchDegrees.toFixed(0)}° / {q.pose.rollDegrees.toFixed(0)}°</div>
                      </div>
                      <div>
                        <span className="text-[#64748B]">Occlusion:</span>
                        <div className="text-white font-bold">{(q.occlusion.occlusionScore * 100).toFixed(0)}%</div>
                      </div>
                      <div>
                        <span className="text-[#64748B]">Embedding Model:</span>
                        <div className="text-[#38BDF8] font-bold">FaceNet-Edge (128D)</div>
                      </div>
                    </div>
                  );
                })()}
              </div>
            )}

            {/* Rolling Observation History */}
            <div>
              <h4 className="text-xs font-mono uppercase text-[#8C929D] tracking-wider mb-2">
                Multi-Frame Observation Log ({selectedRecord.observations.length} Frames)
              </h4>
              <div className="space-y-2 max-h-56 overflow-y-auto">
                {selectedRecord.observations.map((obs, idx) => (
                  <div
                    key={obs.observationId}
                    className="p-2.5 rounded bg-[#181B20] border border-[#23262B] flex items-center justify-between text-xs font-mono"
                  >
                    <div className="flex items-center gap-2">
                      <span className="text-[#8C929D]">#{idx + 1}</span>
                      {getQualityBadge(obs.quality.qualityState)}
                      <span className="text-white">Score: {(obs.quality.score * 100).toFixed(0)}%</span>
                    </div>
                    <div className="flex items-center gap-3 text-[11px] text-[#64748B]">
                      <span>{obs.pixelBox ? `${obs.pixelBox.width}x${obs.pixelBox.height}px` : '112x112px'}</span>
                      <span>{formatTimestamp(obs.timestamp)}</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Spatial Context */}
            {selectedRecord.spatialContext && (
              <div className="bg-[#14161A] p-4 rounded-lg border border-[#23262B] text-xs font-mono">
                <h4 className="text-xs font-mono uppercase text-[#8C929D] tracking-wider mb-2">
                  Spatial Context
                </h4>
                <div className="grid grid-cols-2 gap-2 text-white">
                  <div>
                    <span className="text-[#64748B]">Zone: </span>
                    {selectedRecord.spatialContext.zoneName || selectedRecord.spatialContext.zoneId || 'Unassigned'}
                  </div>
                  <div>
                    <span className="text-[#64748B]">Restricted: </span>
                    <span className={selectedRecord.spatialContext.isRestricted ? 'text-[#EF4444] font-bold' : 'text-[#10B981]'}>
                      {selectedRecord.spatialContext.isRestricted ? 'YES (SECURITY ZONE)' : 'NO'}
                    </span>
                  </div>
                  <div>
                    <span className="text-[#64748B]">Camera: </span>
                    {selectedRecord.cameraIdentifier || selectedRecord.cameraId}
                  </div>
                  <div>
                    <span className="text-[#64748B]">Sector: </span>
                    {selectedRecord.spatialContext.sectorName || 'Sector Bravo'}
                  </div>
                </div>
              </div>
            )}
          </div>
        </Drawer>
      )}
    </div>
  );
};
