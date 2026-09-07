/**
 * IBVAP — Border Analytics & Cross-Camera Intelligence Dashboard
 *
 * Provides comprehensive multi-camera correlation, camera topology graph,
 * chronological movement reconstruction, route transit timing analysis,
 * observable behavioral rules (night, loitering, repeated fence crossing, direction anomaly,
 * curfew/restricted hours, interactions, group density), and interactive simulation drills.
 *
 * Adheres strictly to the distinction between discrete OBSERVATION, probabilistic CORRELATION,
 * and confirmed legal IDENTITY.
 */

import React, { useState, useEffect, useMemo, useCallback } from 'react';
import {
  Network,
  Activity,
  Route,
  ShieldAlert,
  Clock,
  Car,
  User,
  ArrowRight,
  AlertTriangle,
  Settings,
  RefreshCw,
  Sliders,
  CheckCircle2,
  Info,
  MapPin,
  ChevronRight,
  Crosshair,
  GitMerge,
  Moon,
  Compass,
  Users,
  Zap,
} from 'lucide-react';
import {
  CameraGraph,
  CameraGraphNode,
  CameraGraphEdge,
  CrossCameraCorrelation,
  VehicleMovementReconstruction,
  PersonMovementReconstruction,
  RouteAnalysisResult,
  AdvancedAnalyticsEvent,
  ObservableRuleConfig,
  CorrelatedEntityType,
  CorrelationConfidenceLevel,
} from '../analytics/types';
import { Badge } from '../components/ui/Badge';
import { Button } from '../components/ui/Button';
import { Search } from '../components/ui/Search';
import { Drawer } from '../components/ui/Drawer';
import { Modal } from '../components/ui/Modal';
import { formatTimestamp } from '../utils/formatters';
import { api } from '../api/client';

export interface AnalyticsScreenProps {
  onEscalateCorrelation?: (correlation: CrossCameraCorrelation) => void;
  onEscalateEvent?: (event: AdvancedAnalyticsEvent) => void;
}

type AnalyticsTab = 'correlations' | 'reconstruction' | 'graph' | 'rules';

export const AnalyticsScreen: React.FC<AnalyticsScreenProps> = ({
  onEscalateCorrelation,
  onEscalateEvent,
}) => {
  // Navigation tabs
  const [activeTab, setActiveTab] = useState<AnalyticsTab>('correlations');

  // Core Data States
  const [correlations, setCorrelations] = useState<CrossCameraCorrelation[]>([]);
  const [graphData, setGraphData] = useState<CameraGraph | null>(null);
  const [graphStats, setGraphStats] = useState<any>(null);
  const [ruleEvents, setRuleEvents] = useState<AdvancedAnalyticsEvent[]>([]);
  const [ruleConfig, setRuleConfig] = useState<ObservableRuleConfig | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);

  // Filter States - Correlations
  const [correlationSearch, setCorrelationSearch] = useState<string>('');
  const [entityFilter, setEntityFilter] = useState<'ALL' | CorrelatedEntityType>('ALL');
  const [confidenceTierFilter, setConfidenceTierFilter] = useState<'ALL' | CorrelationConfidenceLevel>('ALL');

  // Selected Item Drawers
  const [selectedCorrelation, setSelectedCorrelation] = useState<CrossCameraCorrelation | null>(null);
  const [selectedNode, setSelectedNode] = useState<CameraGraphNode | null>(null);
  const [selectedEdge, setSelectedEdge] = useState<CameraGraphEdge | null>(null);
  const [selectedEvent, setSelectedEvent] = useState<AdvancedAnalyticsEvent | null>(null);

  // Movement Reconstruction States
  const [reconstructType, setReconstructType] = useState<'VEHICLE' | 'PERSON'>('VEHICLE');
  const [reconstructQuery, setReconstructQuery] = useState<string>('TX-8921-A');
  const [vehicleReconstruction, setVehicleReconstruction] = useState<VehicleMovementReconstruction | null>(null);
  const [personReconstruction, setPersonReconstruction] = useState<PersonMovementReconstruction | null>(null);
  const [isReconstructing, setIsReconstructing] = useState<boolean>(false);
  const [reconstructionError, setReconstructionError] = useState<string | null>(null);

  // Route Analysis States
  const [routeAnalysisSequence, setRouteAnalysisSequence] = useState<string>('CAM-01, CAM-02, CAM-04');
  const [routeAnalysisResult, setRouteAnalysisResult] = useState<RouteAnalysisResult | null>(null);
  const [isAnalyzingRoute, setIsAnalyzingRoute] = useState<boolean>(false);

  // Rule Config Modal
  const [isConfigModalOpen, setIsConfigModalOpen] = useState<boolean>(false);
  const [configDraft, setConfigDraft] = useState<ObservableRuleConfig | null>(null);

  // Scenario Simulation Drill State
  const [isSimulating, setIsSimulating] = useState<boolean>(false);

  // 1. Initial Data Fetching
  const fetchAllAnalyticsData = useCallback(async () => {
    setIsLoading(true);
    try {
      const [corrRes, graphRes, eventsRes, configRes] = await Promise.all([
        api.analytics.getCorrelations(),
        api.analytics.getGraph(),
        api.analytics.getEvents(),
        api.analytics.getConfig(),
      ]);

      if (corrRes.data) setCorrelations(corrRes.data);
      if (graphRes.data) {
        setGraphData(graphRes.data.graph);
        setGraphStats(graphRes.data.stats);
      }
      if (eventsRes.data) setRuleEvents(eventsRes.data);
      if (configRes.data) {
        setRuleConfig(configRes.data);
        setConfigDraft(configRes.data);
      }
    } catch (err: any) {
      console.error('Failed to load border analytics data:', err);
      setStatusMessage(`Error loading analytics: ${err.message || 'Unknown network error'}`);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchAllAnalyticsData();
    const interval = setInterval(fetchAllAnalyticsData, 15000);
    return () => clearInterval(interval);
  }, [fetchAllAnalyticsData]);

  // Execute initial sample reconstruction on mount
  useEffect(() => {
    handleRunReconstruction('TX-8921-A', 'VEHICLE');
  }, []);

  // 2. Movement Reconstruction Handler
  const handleRunReconstruction = async (queryParam?: string, typeParam?: 'VEHICLE' | 'PERSON') => {
    const q = (queryParam ?? reconstructQuery).trim();
    const type = typeParam ?? reconstructType;
    if (!q) return;

    setIsReconstructing(true);
    setReconstructionError(null);

    try {
      if (type === 'VEHICLE') {
        const res = await api.analytics.reconstructVehicle({ plateNumber: q, trackId: q });
        if (res.data) {
          setVehicleReconstruction(res.data);
          setPersonReconstruction(null);
        }
      } else {
        const res = await api.analytics.reconstructPerson({ trackId: q, faceObservationId: q });
        if (res.data) {
          setPersonReconstruction(res.data);
          setVehicleReconstruction(null);
        }
      }
    } catch (err: any) {
      console.warn('Reconstruction query not found:', err);
      setReconstructionError(err.message || `No observations located for entity "${q}"`);
      if (type === 'VEHICLE') setVehicleReconstruction(null);
      else setPersonReconstruction(null);
    } finally {
      setIsReconstructing(false);
    }
  };

  // 3. Route Transit Timing Analysis Handler
  const handleRunRouteAnalysis = async () => {
    if (!routeAnalysisSequence.trim()) return;
    setIsAnalyzingRoute(true);
    try {
      const cams = routeAnalysisSequence.split(',').map((s) => s.trim().toUpperCase());
      const res = await api.analytics.analyzeRoute({
        cameras: cams,
        entityType: reconstructType,
        entityId: reconstructQuery || 'ENTITY-01',
      });
      if (res.data) {
        setRouteAnalysisResult(res.data);
      }
    } catch (err: any) {
      console.error('Failed to analyze route:', err);
      setStatusMessage(`Route analysis failed: ${err.message}`);
    } finally {
      setIsAnalyzingRoute(false);
    }
  };

  // 4. Trigger Drill Simulation
  const handleTriggerDrill = async (scenarioType: string) => {
    setIsSimulating(true);
    try {
      const res = await api.analytics.simulateScenario(scenarioType);
      if (res.data) {
        setRuleEvents((prev) => [res.data, ...prev]);
        setStatusMessage(`Simulated Drill Event Triggered: ${res.data.triggerReason}`);
        setActiveTab('rules');
        setSelectedEvent(res.data);
      }
    } catch (err: any) {
      console.error('Failed to trigger drill scenario:', err);
      setStatusMessage(`Drill failed: ${err.message}`);
    } finally {
      setIsSimulating(false);
    }
  };

  // 5. Save Rule Engine Config
  const handleSaveConfig = async () => {
    if (!configDraft) return;
    try {
      const res = await api.analytics.updateConfig(configDraft);
      if (res.data) {
        setRuleConfig(res.data);
        setIsConfigModalOpen(false);
        setStatusMessage('Observable rule thresholds updated and deployed across border sensor cluster');
      }
    } catch (err: any) {
      console.error('Failed to update config:', err);
      setStatusMessage(`Config update failed: ${err.message}`);
    }
  };

  // Filtered Correlations
  const filteredCorrelations = useMemo(() => {
    return correlations.filter((corr) => {
      if (entityFilter !== 'ALL' && corr.entityType !== entityFilter) return false;
      if (confidenceTierFilter !== 'ALL' && corr.confidenceLevel !== confidenceTierFilter) return false;

      if (correlationSearch.trim()) {
        const term = correlationSearch.toLowerCase();
        const matchesPlate = corr.relatedANPRObservation?.plateNumber.toLowerCase().includes(term);
        const matchesCamera = corr.involvedCameras.some((c) => c.toLowerCase().includes(term));
        const matchesTracks = corr.sourceTrackId.toLowerCase().includes(term) || corr.targetTrackId.toLowerCase().includes(term);
        const matchesSector = corr.involvedSectors.some((s) => s.toLowerCase().includes(term));
        if (!matchesPlate && !matchesCamera && !matchesTracks && !matchesSector) return false;
      }

      return true;
    });
  }, [correlations, entityFilter, confidenceTierFilter, correlationSearch]);

  return (
    <div className="flex-1 flex flex-col h-full bg-[#0B0F17] text-slate-100 overflow-hidden font-sans">
      {/* 1. Header Toolbar */}
      <div className="flex flex-wrap items-center justify-between px-6 py-4 border-b border-slate-800/80 bg-[#0E1420]/90 backdrop-blur-sm gap-4">
        <div className="flex items-center gap-3">
          <div className="p-2.5 rounded-lg bg-cyan-500/10 border border-cyan-500/30 text-cyan-400">
            <Network className="w-5 h-5" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-lg font-bold text-white tracking-wide uppercase">
                Cross-Camera Intelligence & Observable Analytics
              </h1>
              <span className="px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider rounded bg-cyan-950/80 text-cyan-400 border border-cyan-800/60">
                PROBABILISTIC CORRELATION
              </span>
            </div>
            <p className="text-xs text-slate-400">
              Correlated Multi-Sensor Trajectories, Corridor Graph Topology, Transit Timing & Behavioral Rules
            </p>
          </div>
        </div>

        {/* Global Action & Simulation Toolbar */}
        <div className="flex items-center gap-3">
          <div className="relative group">
            <Button
              variant="secondary"
              size="sm"
              disabled={isSimulating}
              className="bg-amber-950/40 text-amber-300 border-amber-800/60 hover:bg-amber-900/50 flex items-center gap-1.5"
            >
              <Zap className="w-3.5 h-3.5" />
              <span>Simulate Drill Scenario</span>
            </Button>
            <div className="absolute right-0 top-full mt-1.5 hidden group-hover:block w-56 p-1.5 bg-[#141B2D] border border-slate-700 rounded-lg shadow-2xl z-50">
              <div className="px-2 py-1 text-[10px] font-semibold text-slate-400 uppercase">Select Drill Scenario</div>
              <button
                onClick={() => handleTriggerDrill('night_movement')}
                className="w-full text-left px-2.5 py-1.5 text-xs text-slate-200 hover:bg-slate-800 rounded flex items-center gap-2"
              >
                <Moon className="w-3.5 h-3.5 text-indigo-400" />
                <span>Night Movement Breached</span>
              </button>
              <button
                onClick={() => handleTriggerDrill('loitering')}
                className="w-full text-left px-2.5 py-1.5 text-xs text-slate-200 hover:bg-slate-800 rounded flex items-center gap-2"
              >
                <Clock className="w-3.5 h-3.5 text-amber-400" />
                <span>Loitering / Dwell &gt; 180s</span>
              </button>
              <button
                onClick={() => handleTriggerDrill('repeated_fence')}
                className="w-full text-left px-2.5 py-1.5 text-xs text-slate-200 hover:bg-slate-800 rounded flex items-center gap-2"
              >
                <ShieldAlert className="w-3.5 h-3.5 text-rose-400" />
                <span>Repeated Fence Crossings</span>
              </button>
              <button
                onClick={() => handleTriggerDrill('direction_anomaly')}
                className="w-full text-left px-2.5 py-1.5 text-xs text-slate-200 hover:bg-slate-800 rounded flex items-center gap-2"
              >
                <Compass className="w-3.5 h-3.5 text-cyan-400" />
                <span>Wrong-Way Corridor Anomaly</span>
              </button>
              <button
                onClick={() => handleTriggerDrill('group_activity')}
                className="w-full text-left px-2.5 py-1.5 text-xs text-slate-200 hover:bg-slate-800 rounded flex items-center gap-2"
              >
                <Users className="w-3.5 h-3.5 text-emerald-400" />
                <span>Group Cluster Assembly</span>
              </button>
              <button
                onClick={() => handleTriggerDrill('person_vehicle_interaction')}
                className="w-full text-left px-2.5 py-1.5 text-xs text-slate-200 hover:bg-slate-800 rounded flex items-center gap-2"
              >
                <GitMerge className="w-3.5 h-3.5 text-purple-400" />
                <span>Person-Vehicle Proximity</span>
              </button>
            </div>
          </div>

          <Button
            variant="secondary"
            size="sm"
            onClick={() => setIsConfigModalOpen(true)}
            className="border-slate-700 bg-slate-800/80 text-slate-200 hover:bg-slate-700 flex items-center gap-1.5"
          >
            <Sliders className="w-3.5 h-3.5" />
            <span>Rule Thresholds</span>
          </Button>

          <Button
            variant="ghost"
            size="sm"
            onClick={fetchAllAnalyticsData}
            disabled={isLoading}
            className="text-slate-400 hover:text-white p-2"
          >
            <RefreshCw className={`w-4 h-4 ${isLoading ? 'animate-spin text-cyan-400' : ''}`} />
          </Button>
        </div>
      </div>

      {/* 2. Disclaimers & Operational Metrics Strip */}
      <div className="px-6 py-2.5 bg-[#0A0D14] border-b border-slate-800/60 flex flex-wrap items-center justify-between text-xs gap-4">
        <div className="flex items-center gap-2 text-slate-300">
          <Info className="w-4 h-4 text-cyan-400 shrink-0" />
          <span className="text-[11px] leading-tight text-slate-300">
            <strong className="text-cyan-300">ONTOLOGICAL BOUNDARY:</strong> Discrete <span className="underline decoration-cyan-500">OBSERVATIONS</span> are correlated via probabilistic factors. <span className="text-amber-300 font-medium">No verified legal IDENTITY is established</span> without authoritative external register verification.
          </span>
        </div>

        {graphStats && (
          <div className="flex items-center gap-4 text-[11px] text-slate-400">
            <div className="flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse"></span>
              <span>Masts Active: <strong className="text-white">{graphStats.activeMasts}/{graphStats.totalNodes}</strong></span>
            </div>
            <div className="border-r border-slate-800 h-3"></div>
            <div>
              <span>Corridor Edges: <strong className="text-white">{graphStats.totalEdges}</strong></span>
            </div>
            <div className="border-r border-slate-800 h-3"></div>
            <div>
              <span>Active Correlations: <strong className="text-cyan-400">{correlations.length}</strong></span>
            </div>
            <div className="border-r border-slate-800 h-3"></div>
            <div>
              <span>Behavior Events: <strong className="text-amber-400">{ruleEvents.length}</strong></span>
            </div>
          </div>
        )}
      </div>

      {/* Status banner if active */}
      {statusMessage && (
        <div className="px-6 py-2 bg-cyan-950/60 border-b border-cyan-800/60 text-cyan-300 text-xs flex items-center justify-between">
          <span className="flex items-center gap-2">
            <CheckCircle2 className="w-3.5 h-3.5 text-cyan-400" />
            {statusMessage}
          </span>
          <button onClick={() => setStatusMessage(null)} className="text-cyan-500 hover:text-cyan-200 text-xs">
            Dismiss
          </button>
        </div>
      )}

      {/* 3. Primary Navigation Tabs */}
      <div className="flex items-center px-6 border-b border-slate-800 bg-[#0D131F]">
        <button
          onClick={() => setActiveTab('correlations')}
          className={`flex items-center gap-2 px-4 py-3 text-xs font-semibold border-b-2 transition-all ${
            activeTab === 'correlations'
              ? 'border-cyan-500 text-cyan-400 bg-cyan-500/5'
              : 'border-transparent text-slate-400 hover:text-slate-200'
          }`}
        >
          <GitMerge className="w-4 h-4" />
          <span>Cross-Camera Correlations ({filteredCorrelations.length})</span>
        </button>

        <button
          onClick={() => setActiveTab('reconstruction')}
          className={`flex items-center gap-2 px-4 py-3 text-xs font-semibold border-b-2 transition-all ${
            activeTab === 'reconstruction'
              ? 'border-cyan-500 text-cyan-400 bg-cyan-500/5'
              : 'border-transparent text-slate-400 hover:text-slate-200'
          }`}
        >
          <Route className="w-4 h-4" />
          <span>Movement Reconstruction & Route Analysis</span>
        </button>

        <button
          onClick={() => setActiveTab('graph')}
          className={`flex items-center gap-2 px-4 py-3 text-xs font-semibold border-b-2 transition-all ${
            activeTab === 'graph'
              ? 'border-cyan-500 text-cyan-400 bg-cyan-500/5'
              : 'border-transparent text-slate-400 hover:text-slate-200'
          }`}
        >
          <Network className="w-4 h-4" />
          <span>Camera Topology & Corridors ({graphData?.nodes.length || 0})</span>
        </button>

        <button
          onClick={() => setActiveTab('rules')}
          className={`flex items-center gap-2 px-4 py-3 text-xs font-semibold border-b-2 transition-all ${
            activeTab === 'rules'
              ? 'border-cyan-500 text-cyan-400 bg-cyan-500/5'
              : 'border-transparent text-slate-400 hover:text-slate-200'
          }`}
        >
          <Activity className="w-4 h-4" />
          <span>Observable Behavioral Rules ({ruleEvents.length})</span>
        </button>
      </div>

      {/* 4. Tab Body Content */}
      <div className="flex-1 overflow-y-auto p-6">
        {/* TAB 1: CROSS-CAMERA CORRELATIONS */}
        {activeTab === 'correlations' && (
          <div className="space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3 p-3.5 bg-[#111726] border border-slate-800 rounded-xl">
              <div className="flex-1 min-w-[260px] max-w-md">
                <Search
                  value={correlationSearch}
                  onChange={setCorrelationSearch}
                  placeholder="Filter by plate, track ID, camera mast, or sector..."
                />
              </div>

              <div className="flex items-center gap-2.5 flex-wrap">
                <div className="flex items-center gap-1.5 text-xs text-slate-400">
                  <span>Entity:</span>
                  <select
                    value={entityFilter}
                    onChange={(e) => setEntityFilter(e.target.value as any)}
                    className="bg-[#0A0E18] border border-slate-700 rounded-lg px-2.5 py-1.5 text-xs text-slate-200 focus:outline-none focus:border-cyan-500"
                  >
                    <option value="ALL">All Entities</option>
                    <option value="VEHICLE">Vehicles</option>
                    <option value="PERSON">Persons</option>
                    <option value="PLATE">ANPR Plates</option>
                    <option value="FACE_OBSERVATION">Face Hits</option>
                  </select>
                </div>

                <div className="flex items-center gap-1.5 text-xs text-slate-400">
                  <span>Confidence:</span>
                  <select
                    value={confidenceTierFilter}
                    onChange={(e) => setConfidenceTierFilter(e.target.value as any)}
                    className="bg-[#0A0E18] border border-slate-700 rounded-lg px-2.5 py-1.5 text-xs text-slate-200 focus:outline-none focus:border-cyan-500"
                  >
                    <option value="ALL">All Tiers</option>
                    <option value="HIGH_CONFIDENCE_CORRELATION">High (&ge; 85%)</option>
                    <option value="MODERATE_CONFIDENCE_CORRELATION">Moderate (60-84%)</option>
                    <option value="LOW_CONFIDENCE_CORRELATION">Low (&lt; 60%)</option>
                  </select>
                </div>
              </div>
            </div>

            {filteredCorrelations.length === 0 ? (
              <div className="text-center py-16 border border-dashed border-slate-800 rounded-xl bg-[#0D1321]/50">
                <GitMerge className="w-10 h-10 text-slate-600 mx-auto mb-3" />
                <h3 className="text-sm font-semibold text-slate-300">No Cross-Camera Correlations Found</h3>
                <p className="text-xs text-slate-500 mt-1 max-w-md mx-auto">
                  Adjust your search filters or run a simulated drill scenario to observe multi-camera entity association.
                </p>
              </div>
            ) : (
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                {filteredCorrelations.map((corr) => {
                  const isHigh = corr.confidenceLevel === 'HIGH_CONFIDENCE_CORRELATION';
                  const isMod = corr.confidenceLevel === 'MODERATE_CONFIDENCE_CORRELATION';

                  return (
                    <div
                      key={corr.correlationId}
                      className="bg-[#101726] border border-slate-800 hover:border-cyan-500/40 rounded-xl p-4.5 transition-all flex flex-col justify-between group shadow-sm hover:shadow-cyan-950/20"
                    >
                      <div>
                        <div className="flex items-start justify-between gap-3 mb-3">
                          <div className="flex items-center gap-2.5">
                            <div className="p-2 rounded-lg bg-slate-800/80 border border-slate-700 text-slate-200">
                              {corr.entityType === 'VEHICLE' || corr.entityType === 'PLATE' ? (
                                <Car className="w-4 h-4 text-cyan-400" />
                              ) : (
                                <User className="w-4 h-4 text-indigo-400" />
                              )}
                            </div>
                            <div>
                              <div className="flex items-center gap-2">
                                <span className="font-bold text-white text-sm">
                                  {corr.relatedANPRObservation
                                    ? `Plate: ${corr.relatedANPRObservation.plateNumber}`
                                    : corr.entityType === 'PERSON'
                                    ? `Person Track: ${corr.sourceTrackId}`
                                    : `Vehicle Track: ${corr.sourceTrackId}`}
                                </span>
                                {corr.relatedANPRObservation?.isWatchlistMatch && (
                                  <Badge variant="critical">WATCHLIST HIT</Badge>
                                )}
                              </div>
                              <p className="text-xs text-slate-400 mt-0.5">
                                Primary Method: <span className="text-slate-200 font-mono">{corr.correlationMethod}</span>
                              </p>
                            </div>
                          </div>

                          <div className="text-right">
                            <span
                              className={`px-2.5 py-1 text-[11px] font-bold rounded-md border inline-block ${
                                isHigh
                                  ? 'bg-emerald-950/60 border-emerald-700/60 text-emerald-400'
                                  : isMod
                                  ? 'bg-amber-950/60 border-amber-700/60 text-amber-300'
                                  : 'bg-slate-800 border-slate-700 text-slate-300'
                              }`}
                            >
                              {Math.round(corr.confidenceScore * 100)}% Match
                            </span>
                            <div className="text-[10px] text-slate-500 mt-0.5">
                              Correlation Score
                            </div>
                          </div>
                        </div>

                        {/* Route Hop Sequence */}
                        <div className="my-3.5 p-2.5 rounded-lg bg-[#0B0F19] border border-slate-800/80">
                          <div className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider mb-1.5 flex items-center justify-between">
                            <span>SURVEILLANCE MAST HOP SEQUENCE</span>
                            <span className="text-slate-400">{corr.elapsedSeconds}s transit elapsed</span>
                          </div>
                          <div className="flex items-center gap-2 overflow-x-auto py-1">
                            {corr.observations.map((obs, idx) => (
                              <React.Fragment key={obs.observationId || idx}>
                                {idx > 0 && (
                                  <ArrowRight className="w-3.5 h-3.5 text-cyan-500 shrink-0" />
                                )}
                                <div className="flex items-center gap-1.5 px-2 py-1 rounded bg-slate-800/80 border border-slate-700 text-xs shrink-0">
                                  <MapPin className="w-3 h-3 text-cyan-400" />
                                  <span className="font-semibold text-white">{obs.cameraIdentifier}</span>
                                  <span className="text-[10px] text-slate-400 font-mono">
                                    {formatTimestamp(obs.timestamp, { format: 'time-only' })}
                                  </span>
                                </div>
                              </React.Fragment>
                            ))}
                          </div>
                        </div>

                        {/* Reasoning Factors */}
                        <div className="space-y-1.5 mb-3">
                          <div className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider">
                            GROUNDED REASONING FACTORS:
                          </div>
                          <div className="flex flex-wrap gap-1.5">
                            {corr.reasoningFactors.map((rf, idx) => (
                              <div
                                key={idx}
                                className="px-2 py-1 rounded bg-[#131B2C] border border-slate-700/60 text-[11px] text-slate-300 flex items-center gap-1.5"
                                title={rf.evidence}
                              >
                                <CheckCircle2 className="w-3 h-3 text-cyan-400 shrink-0" />
                                <span>{rf.factor}</span>
                                <span className="text-cyan-400 font-mono text-[10px]">
                                  (+{Math.round(rf.confidenceDelta * 100)}%)
                                </span>
                              </div>
                            ))}
                          </div>
                        </div>
                      </div>

                      <div className="pt-3 border-t border-slate-800/80 flex items-center justify-between text-xs">
                        <span className="text-[11px] text-slate-500 font-mono">
                          Sectors: {corr.involvedSectors.join(', ')}
                        </span>
                        <div className="flex items-center gap-2">
                          {onEscalateCorrelation && (
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => onEscalateCorrelation(corr)}
                              className="text-amber-400 hover:text-amber-300 hover:bg-amber-950/40 text-xs h-7 px-2"
                            >
                              <ShieldAlert className="w-3.5 h-3.5 mr-1" />
                              <span>Escalate</span>
                            </Button>
                          )}
                          <Button
                            variant="secondary"
                            size="sm"
                            onClick={() => setSelectedCorrelation(corr)}
                            className="bg-slate-800 hover:bg-slate-700 text-slate-200 border-slate-700 text-xs h-7 px-2.5 flex items-center gap-1"
                          >
                            <span>Dossier & Timeline</span>
                            <ChevronRight className="w-3.5 h-3.5" />
                          </Button>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* TAB 2: MOVEMENT RECONSTRUCTION & ROUTE ANALYSIS */}
        {activeTab === 'reconstruction' && (
          <div className="space-y-6">
            <div className="p-4 bg-[#101726] border border-slate-800 rounded-xl space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex items-center gap-2">
                  <Route className="w-5 h-5 text-cyan-400" />
                  <h3 className="text-sm font-bold text-white uppercase tracking-wider">
                    Reconstruct Trajectory Across Camera Network
                  </h3>
                </div>

                <div className="flex items-center gap-2">
                  <span className="text-xs text-slate-400">Quick Presets:</span>
                  <button
                    onClick={() => {
                      setReconstructType('VEHICLE');
                      setReconstructQuery('TX-8921-A');
                      handleRunReconstruction('TX-8921-A', 'VEHICLE');
                    }}
                    className="px-2 py-0.5 rounded bg-slate-800 hover:bg-slate-700 text-cyan-300 border border-slate-700 text-xs font-mono"
                  >
                    TX-8921-A
                  </button>
                  <button
                    onClick={() => {
                      setReconstructType('VEHICLE');
                      setReconstructQuery('B-4921');
                      handleRunReconstruction('B-4921', 'VEHICLE');
                    }}
                    className="px-2 py-0.5 rounded bg-slate-800 hover:bg-slate-700 text-cyan-300 border border-slate-700 text-xs font-mono"
                  >
                    B-4921
                  </button>
                  <button
                    onClick={() => {
                      setReconstructType('PERSON');
                      setReconstructQuery('PRS-TRK-201');
                      handleRunReconstruction('PRS-TRK-201', 'PERSON');
                    }}
                    className="px-2 py-0.5 rounded bg-slate-800 hover:bg-slate-700 text-indigo-300 border border-slate-700 text-xs font-mono"
                  >
                    PRS-TRK-201
                  </button>
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-3">
                <div className="flex rounded-lg overflow-hidden border border-slate-700 shrink-0">
                  <button
                    onClick={() => setReconstructType('VEHICLE')}
                    className={`px-3 py-1.5 text-xs font-semibold flex items-center gap-1.5 ${
                      reconstructType === 'VEHICLE'
                        ? 'bg-cyan-500 text-black'
                        : 'bg-slate-800 text-slate-300 hover:bg-slate-700'
                    }`}
                  >
                    <Car className="w-3.5 h-3.5" />
                    <span>Vehicle</span>
                  </button>
                  <button
                    onClick={() => setReconstructType('PERSON')}
                    className={`px-3 py-1.5 text-xs font-semibold flex items-center gap-1.5 ${
                      reconstructType === 'PERSON'
                        ? 'bg-cyan-500 text-black'
                        : 'bg-slate-800 text-slate-300 hover:bg-slate-700'
                    }`}
                  >
                    <User className="w-3.5 h-3.5" />
                    <span>Person</span>
                  </button>
                </div>

                <div className="flex-1 min-w-[220px]">
                  <input
                    type="text"
                    value={reconstructQuery}
                    onChange={(e) => setReconstructQuery(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && handleRunReconstruction()}
                    placeholder={
                      reconstructType === 'VEHICLE'
                        ? 'Enter License Plate (e.g. TX-8921-A) or Vehicle Track ID...'
                        : 'Enter Person Track ID (e.g. PRS-TRK-201) or Face Observation ID...'
                    }
                    className="w-full bg-[#090D17] border border-slate-700 rounded-lg px-3.5 py-1.5 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-cyan-500 font-mono"
                  />
                </div>

                <Button
                  variant="primary"
                  size="sm"
                  onClick={() => handleRunReconstruction()}
                  disabled={isReconstructing}
                  className="bg-cyan-600 hover:bg-cyan-500 text-black font-semibold flex items-center gap-1.5"
                >
                  <Crosshair className="w-3.5 h-3.5" />
                  <span>{isReconstructing ? 'Reconstructing...' : 'Reconstruct Trajectory'}</span>
                </Button>
              </div>

              {reconstructionError && (
                <div className="p-2 rounded bg-rose-950/40 border border-rose-800/60 text-rose-300 text-xs flex items-center gap-2">
                  <AlertTriangle className="w-4 h-4 shrink-0" />
                  <span>{reconstructionError}</span>
                </div>
              )}
            </div>

            {/* Reconstruction Result Timeline */}
            {(vehicleReconstruction || personReconstruction) && (
              <div className="bg-[#101726] border border-slate-800 rounded-xl p-5 space-y-5">
                <div className="flex flex-wrap items-center justify-between gap-3 pb-3 border-b border-slate-800">
                  <div>
                    <div className="flex items-center gap-2">
                      <h4 className="text-base font-bold text-white">
                        {vehicleReconstruction
                          ? `Vehicle Trajectory Reconstruction: ${vehicleReconstruction.plateNumber || vehicleReconstruction.queryTrackId}`
                          : `Person Movement Reconstruction: ${personReconstruction?.queryTrackId}`}
                      </h4>
                      <Badge variant="neutral">
                        {vehicleReconstruction ? 'VEHICLE' : 'PERSON'}
                      </Badge>
                    </div>
                    <p className="text-xs text-slate-400 mt-0.5">
                      Total Transit Duration: <strong className="text-white">{vehicleReconstruction?.totalTransitSeconds ?? personReconstruction?.totalTransitSeconds} seconds</strong> across {vehicleReconstruction?.routeSequence.length ?? personReconstruction?.routeSequence.length} camera surveillance nodes
                    </p>
                  </div>

                  <div className="text-right">
                    <span className="text-xs text-slate-400">Correlation Confidence: </span>
                    <strong className="text-emerald-400 font-mono text-sm">
                      {Math.round((vehicleReconstruction?.correlationConfidence ?? personReconstruction?.correlationConfidence ?? 0.88) * 100)}%
                    </strong>
                  </div>
                </div>

                {/* Timeline Step-by-Step Chain */}
                <div className="space-y-3">
                  <div className="text-xs font-semibold text-slate-400 uppercase tracking-wider flex items-center gap-2">
                    <Clock className="w-3.5 h-3.5 text-cyan-400" />
                    <span>CHRONOLOGICAL SENSOR TIMELINE</span>
                  </div>

                  <div className="relative pl-6 space-y-6 before:absolute before:left-2 before:top-2 before:bottom-2 before:w-0.5 before:bg-slate-800">
                    {(vehicleReconstruction?.timeline ?? personReconstruction?.timeline ?? []).map((step, idx) => (
                      <div key={step.observationId || idx} className="relative group">
                        <div className="absolute -left-6 top-1 w-4 h-4 rounded-full bg-[#101726] border-2 border-cyan-500 flex items-center justify-center">
                          <div className="w-1.5 h-1.5 rounded-full bg-cyan-400"></div>
                        </div>

                        <div className="p-3.5 rounded-lg bg-[#0C111C] border border-slate-800 hover:border-slate-700 transition-colors">
                          <div className="flex flex-wrap items-center justify-between gap-2 mb-1.5">
                            <div className="flex items-center gap-2">
                              <span className="font-bold text-white text-sm font-mono">{step.cameraIdentifier}</span>
                              <span className="text-xs text-slate-400">({step.sectorName})</span>
                              {step.zoneName && (
                                <span className="px-2 py-0.5 text-[10px] rounded bg-slate-800 text-slate-300 border border-slate-700">
                                  {step.zoneName}
                                </span>
                              )}
                            </div>
                            <span className="text-xs text-cyan-400 font-mono">
                              {formatTimestamp(step.timestamp, { format: 'time-only' })}
                            </span>
                          </div>

                          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs text-slate-400 pt-2 border-t border-slate-800/60">
                            <div>
                              <span className="text-slate-500 block text-[10px]">Track ID</span>
                              <span className="text-slate-200 font-mono">{step.trackId}</span>
                            </div>
                            <div>
                              <span className="text-slate-500 block text-[10px]">Dwell / Heading</span>
                              <span className="text-slate-200">{step.dwellSeconds ?? 0}s &bull; {step.direction || 'SOUTHEAST'}</span>
                            </div>
                            <div>
                              <span className="text-slate-500 block text-[10px]">Detector Score</span>
                              <span className="text-slate-200 font-mono">{Math.round(step.detectorConfidence * 100)}%</span>
                            </div>
                            <div>
                              <span className="text-slate-500 block text-[10px]">Fence Interaction</span>
                              <span className="text-slate-200">{step.fenceCrossed || 'None Observed'}</span>
                            </div>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Traversed Summary */}
                <div className="p-3 rounded-lg bg-[#0A0E18] border border-slate-800 text-xs text-slate-400 flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <span className="text-slate-500">Route Sequence: </span>
                    <strong className="text-slate-200 font-mono">
                      {(vehicleReconstruction?.routeSequence ?? personReconstruction?.routeSequence ?? []).join(' → ')}
                    </strong>
                  </div>
                  <div>
                    <span className="text-slate-500">Zones Traversed: </span>
                    <strong className="text-slate-200">
                      {(vehicleReconstruction?.zonesTraversed ?? personReconstruction?.zonesTraversed ?? []).join(', ') || 'General Perimeter'}
                    </strong>
                  </div>
                </div>

                <div className="p-2.5 rounded bg-amber-950/20 border border-amber-800/40 text-amber-300 text-[11px]">
                  <strong>MANDATORY DISCLAIMER: </strong>
                  {vehicleReconstruction?.disclaimer ?? personReconstruction?.disclaimer}
                </div>
              </div>
            )}

            {/* Route Sequence & Transit Timing Analysis Card */}
            <div className="p-4 bg-[#101726] border border-slate-800 rounded-xl space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Compass className="w-5 h-5 text-cyan-400" />
                  <h4 className="text-sm font-bold text-white uppercase tracking-wider">
                    Route Transition & Transit Timing Compliance Analyzer
                  </h4>
                </div>
              </div>
              <p className="text-xs text-slate-400">
                Validates observed camera transition sequence against authoritative corridor topology. Detects skipped camera masts, anomalous transit delays, or corridor wrong-way reversals.
              </p>

              <div className="flex items-center gap-3">
                <input
                  type="text"
                  value={routeAnalysisSequence}
                  onChange={(e) => setRouteAnalysisSequence(e.target.value)}
                  placeholder="Enter comma-separated camera masts (e.g. CAM-01, CAM-02, CAM-04)..."
                  className="flex-1 bg-[#090D17] border border-slate-700 rounded-lg px-3.5 py-1.5 text-xs text-white focus:outline-none focus:border-cyan-500 font-mono"
                />
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={handleRunRouteAnalysis}
                  disabled={isAnalyzingRoute}
                  className="bg-slate-800 hover:bg-slate-700 text-slate-200 border-slate-700"
                >
                  <span>{isAnalyzingRoute ? 'Analyzing...' : 'Analyze Transit'}</span>
                </Button>
              </div>

              {routeAnalysisResult && (
                <div className="p-4 rounded-lg bg-[#0B0F19] border border-slate-800 space-y-3 mt-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-slate-400">Overall Route Compliance:</span>
                      <Badge
                        variant={
                          routeAnalysisResult.overallStatus === 'EXPECTED_ROUTE'
                            ? 'neutral'
                            : 'critical'
                        }
                      >
                        {routeAnalysisResult.overallStatus}
                      </Badge>
                    </div>
                    <span className="text-xs text-slate-400">
                      Direction Consistency: <strong className="text-white">{routeAnalysisResult.directionConsistency}</strong>
                    </span>
                  </div>

                  <div className="space-y-2">
                    {routeAnalysisResult.expectedTransitions.map((t, idx) => (
                      <div
                        key={idx}
                        className="flex items-center justify-between p-2.5 rounded bg-[#0E1422] border border-slate-800 text-xs"
                      >
                        <div className="flex items-center gap-2">
                          <span className="font-mono font-bold text-white">{t.fromCamera} &rarr; {t.toCamera}</span>
                          <span className="text-slate-500">
                            (Transit: {t.actualElapsedSeconds}s | Normal: {t.expectedTransitRangeSeconds[0]}-{t.expectedTransitRangeSeconds[1]}s)
                          </span>
                        </div>
                        <span
                          className={`px-2 py-0.5 text-[10px] font-semibold rounded ${
                            t.status === 'NORMAL_TRANSIT'
                              ? 'bg-emerald-950/60 text-emerald-400 border border-emerald-800/60'
                              : 'bg-amber-950/60 text-amber-300 border border-amber-800/60'
                          }`}
                        >
                          {t.status}
                        </span>
                      </div>
                    ))}
                  </div>

                  {routeAnalysisResult.anomaliesDetected.length > 0 && (
                    <div className="p-2.5 rounded bg-rose-950/30 border border-rose-800/60 text-rose-300 text-xs space-y-1">
                      <div className="font-semibold text-rose-200">Anomalies Flagged:</div>
                      {routeAnalysisResult.anomaliesDetected.map((anom, i) => (
                        <div key={i} className="flex items-center gap-1.5">
                          <AlertTriangle className="w-3.5 h-3.5 text-rose-400 shrink-0" />
                          <span>{anom}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        )}

        {/* TAB 3: CAMERA TOPOLOGY & CORRIDOR ADJACENCY GRAPH */}
        {activeTab === 'graph' && (
          <div className="space-y-5">
            <div className="p-4 bg-[#101726] border border-slate-800 rounded-xl">
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2">
                  <Network className="w-5 h-5 text-cyan-400" />
                  <h3 className="text-sm font-bold text-white uppercase tracking-wider">
                    Authoritative Border Surveillance Mast Graph
                  </h3>
                </div>
                <span className="text-xs text-slate-400">
                  {graphData?.nodes.length || 0} Registered Sensor Masts &bull; {graphData?.edges.length || 0} Directed Corridor Links
                </span>
              </div>
              <p className="text-xs text-slate-400">
                Click any camera mast node or directed corridor edge to inspect operational parameters, physical distance, and transit timing bounds.
              </p>
            </div>

            {/* Grid of Nodes */}
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3.5">
              {(graphData?.nodes || []).map((node) => {
                const isSelected = selectedNode?.cameraId === node.cameraId;
                return (
                  <div
                    key={node.cameraId}
                    onClick={() => {
                      setSelectedNode(node);
                      setSelectedEdge(null);
                    }}
                    className={`p-4 rounded-xl border transition-all cursor-pointer ${
                      isSelected
                        ? 'bg-cyan-950/30 border-cyan-500 shadow-lg shadow-cyan-950/30'
                        : 'bg-[#101726] border-slate-800 hover:border-slate-700'
                    }`}
                  >
                    <div className="flex items-start justify-between gap-2 mb-2">
                      <div className="flex items-center gap-2">
                        <span className="w-2 h-2 rounded-full bg-emerald-400"></span>
                        <span className="font-bold text-white text-sm font-mono">{node.cameraIdentifier}</span>
                      </div>
                      <span className="text-[10px] text-slate-400 uppercase tracking-wider font-semibold">
                        {node.sectorName}
                      </span>
                    </div>

                    <p className="text-xs text-slate-300 font-medium truncate mb-2.5">
                      {node.name}
                    </p>

                    <div className="flex flex-wrap gap-1">
                      {node.hasANPR && (
                        <span className="px-1.5 py-0.5 rounded bg-blue-950 text-blue-300 border border-blue-800 text-[9px] font-bold">
                          ANPR
                        </span>
                      )}
                      {node.hasThermal && (
                        <span className="px-1.5 py-0.5 rounded bg-amber-950 text-amber-300 border border-amber-800 text-[9px] font-bold">
                          THERMAL
                        </span>
                      )}
                      {node.hasFaceAnalytics && (
                        <span className="px-1.5 py-0.5 rounded bg-purple-950 text-purple-300 border border-purple-800 text-[9px] font-bold">
                          FACE
                        </span>
                      )}
                      {node.isPtSupported && (
                        <span className="px-1.5 py-0.5 rounded bg-slate-800 text-slate-300 border border-slate-700 text-[9px] font-bold">
                          PTZ
                        </span>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Corridor Edges Table */}
            <div className="bg-[#101726] border border-slate-800 rounded-xl overflow-hidden">
              <div className="px-4 py-3 border-b border-slate-800 flex items-center justify-between">
                <h4 className="text-xs font-bold text-white uppercase tracking-wider">
                  Authoritative Corridor Adjacency & Transit Limits
                </h4>
                <span className="text-xs text-slate-500">
                  {graphData?.edges.length || 0} Corridor Segments
                </span>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead className="bg-[#0A0E18] text-slate-400 uppercase tracking-wider text-[10px] border-b border-slate-800">
                    <tr>
                      <th className="px-4 py-2.5">Corridor Segment</th>
                      <th className="px-4 py-2.5">Type</th>
                      <th className="px-4 py-2.5">Distance</th>
                      <th className="px-4 py-2.5">Expected Transit Range</th>
                      <th className="px-4 py-2.5">Heading Vector</th>
                      <th className="px-4 py-2.5">Description</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/60">
                    {(graphData?.edges || []).map((edge) => (
                      <tr
                        key={edge.edgeId}
                        onClick={() => {
                          setSelectedEdge(edge);
                          setSelectedNode(null);
                        }}
                        className="hover:bg-slate-800/40 transition-colors cursor-pointer"
                      >
                        <td className="px-4 py-3 font-mono font-bold text-white flex items-center gap-1.5">
                          <span>{edge.fromCameraId}</span>
                          <ArrowRight className="w-3.5 h-3.5 text-cyan-400" />
                          <span>{edge.toCameraId}</span>
                        </td>
                        <td className="px-4 py-3 text-slate-300">
                          <span className="px-2 py-0.5 rounded bg-slate-800 border border-slate-700 text-[10px]">
                            {edge.relationshipType}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-slate-300 font-mono">
                          {edge.distanceMeters}m
                        </td>
                        <td className="px-4 py-3 text-cyan-400 font-mono">
                          {edge.minTransitSeconds}s - {edge.maxTransitSeconds}s
                        </td>
                        <td className="px-4 py-3 text-slate-300 font-mono">
                          {edge.expectedDirection}
                        </td>
                        <td className="px-4 py-3 text-slate-400 truncate max-w-xs">
                          {edge.routeDescription}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {/* TAB 4: OBSERVABLE BEHAVIORAL RULES */}
        {activeTab === 'rules' && (
          <div className="space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3 p-4 bg-[#101726] border border-slate-800 rounded-xl">
              <div>
                <div className="flex items-center gap-2">
                  <Activity className="w-5 h-5 text-amber-400" />
                  <h3 className="text-sm font-bold text-white uppercase tracking-wider">
                    Observable Border Analytics Event Log
                  </h3>
                </div>
                <p className="text-xs text-slate-400 mt-0.5">
                  Automated rule evaluations based on physical sensor metrics (Night movement, Dwell/loiter thresholds, Repeated fence crossings, Direction compliance)
                </p>
              </div>

              <div className="flex items-center gap-2">
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => setIsConfigModalOpen(true)}
                  className="bg-slate-800 hover:bg-slate-700 text-slate-200 border-slate-700 flex items-center gap-1.5"
                >
                  <Sliders className="w-3.5 h-3.5 text-cyan-400" />
                  <span>Configure Thresholds</span>
                </Button>
              </div>
            </div>

            {ruleEvents.length === 0 ? (
              <div className="text-center py-16 border border-dashed border-slate-800 rounded-xl bg-[#0D1321]/50">
                <Activity className="w-10 h-10 text-slate-600 mx-auto mb-3" />
                <h3 className="text-sm font-semibold text-slate-300">No Observable Behavioral Events Logged</h3>
                <p className="text-xs text-slate-500 mt-1 max-w-md mx-auto">
                  Perimeter sensors are nominal. Trigger a simulation drill to evaluate rule thresholds.
                </p>
              </div>
            ) : (
              <div className="space-y-2.5">
                {ruleEvents.map((evt) => {
                  const isCritical = evt.severity === 'CRITICAL';
                  const isHigh = evt.severity === 'HIGH';

                  return (
                    <div
                      key={evt.eventId}
                      onClick={() => setSelectedEvent(evt)}
                      className="p-4 rounded-xl bg-[#101726] border border-slate-800 hover:border-slate-700 transition-all cursor-pointer flex flex-col md:flex-row md:items-center justify-between gap-3 group"
                    >
                      <div className="flex items-start gap-3">
                        <div
                          className={`p-2.5 rounded-lg shrink-0 border ${
                            isCritical
                              ? 'bg-rose-950/60 border-rose-700/60 text-rose-400'
                              : isHigh
                              ? 'bg-amber-950/60 border-amber-700/60 text-amber-300'
                              : 'bg-cyan-950/60 border-cyan-700/60 text-cyan-400'
                          }`}
                        >
                          {evt.eventType.includes('night') ? (
                            <Moon className="w-4 h-4" />
                          ) : evt.eventType.includes('loiter') ? (
                            <Clock className="w-4 h-4" />
                          ) : evt.eventType.includes('fence') ? (
                            <ShieldAlert className="w-4 h-4" />
                          ) : evt.eventType.includes('direction') ? (
                            <Compass className="w-4 h-4" />
                          ) : evt.eventType.includes('group') ? (
                            <Users className="w-4 h-4" />
                          ) : (
                            <Activity className="w-4 h-4" />
                          )}
                        </div>

                        <div>
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="font-bold text-white text-sm">{evt.ruleName}</span>
                            <span className="px-2 py-0.5 text-[10px] font-mono rounded bg-slate-800 text-slate-300 border border-slate-700">
                              {evt.eventType}
                            </span>
                            <Badge variant={isCritical ? 'critical' : isHigh ? 'attention' : 'neutral'}>
                              {evt.severity}
                            </Badge>
                          </div>

                          <p className="text-xs text-slate-300 mt-1 leading-relaxed">
                            {evt.triggerReason}
                          </p>

                          <div className="flex flex-wrap items-center gap-3 text-[11px] text-slate-500 mt-2">
                            <span>Camera: <strong className="text-slate-300 font-mono">{evt.cameraIdentifier}</strong></span>
                            <span>&bull;</span>
                            <span>Sector: <strong className="text-slate-300">{evt.sectorName}</strong></span>
                            {evt.trackId && (
                              <>
                                <span>&bull;</span>
                                <span>Track: <strong className="text-cyan-400 font-mono">{evt.trackId}</strong></span>
                              </>
                            )}
                          </div>
                        </div>
                      </div>

                      <div className="flex md:flex-col items-center md:items-end justify-between shrink-0 gap-1 text-right">
                        <span className="text-xs text-slate-400 font-mono">
                          {formatTimestamp(evt.timestamp, { format: 'time-only' })}
                        </span>
                        <div className="flex items-center gap-1.5 mt-1">
                          {onEscalateEvent && (
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={(e) => {
                                e.stopPropagation();
                                onEscalateEvent(evt);
                              }}
                              className="text-amber-400 hover:text-amber-300 text-xs h-7 px-2"
                            >
                              <ShieldAlert className="w-3.5 h-3.5 mr-1" />
                              <span>Escalate</span>
                            </Button>
                          )}
                          <Button
                            variant="secondary"
                            size="sm"
                            onClick={() => setSelectedEvent(evt)}
                            className="bg-slate-800 text-slate-200 border-slate-700 text-xs h-7 px-2"
                          >
                            <span>Inspect</span>
                          </Button>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}
      </div>

      {/* DRAWER 1: CORRELATION DETAIL DOSSIER */}
      {selectedCorrelation && (
        <Drawer
          isOpen={!!selectedCorrelation}
          onClose={() => setSelectedCorrelation(null)}
          title={`Correlation Dossier: ${selectedCorrelation.correlationId}`}
        >
          <div className="p-6 space-y-6 text-slate-200">
            <div className="p-4 rounded-xl bg-[#111726] border border-slate-800 space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-xs text-slate-400 uppercase tracking-wider font-semibold">Entity Classification</span>
                <span className="px-2.5 py-1 text-xs font-bold rounded bg-cyan-950 text-cyan-400 border border-cyan-800 font-mono">
                  {selectedCorrelation.entityType}
                </span>
              </div>
              <div className="text-lg font-bold text-white">
                {selectedCorrelation.relatedANPRObservation
                  ? `Plate ${selectedCorrelation.relatedANPRObservation.plateNumber}`
                  : `Entity Track ${selectedCorrelation.sourceTrackId}`}
              </div>
              <p className="text-xs text-slate-400">
                Method: <span className="font-mono text-cyan-300">{selectedCorrelation.correlationMethod}</span> &bull; Transit Duration: <span className="text-white font-mono">{selectedCorrelation.elapsedSeconds}s</span>
              </p>
            </div>

            {/* Confidence Metrics Breakdown */}
            <div className="space-y-2">
              <h4 className="text-xs font-bold text-slate-400 uppercase tracking-wider">
                Confidence & Evidence Accounting
              </h4>
              <div className="grid grid-cols-2 gap-3">
                <div className="p-3 rounded-lg bg-[#0C111E] border border-slate-800 text-center">
                  <div className="text-2xl font-bold text-emerald-400 font-mono">
                    {Math.round(selectedCorrelation.confidenceScore * 100)}%
                  </div>
                  <div className="text-[10px] text-slate-400 uppercase font-semibold mt-0.5">
                    Correlation Confidence
                  </div>
                </div>
                <div className="p-3 rounded-lg bg-[#0C111E] border border-slate-800 text-center">
                  <div className="text-2xl font-bold text-cyan-400 font-mono">
                    {Math.round((selectedCorrelation.observations[0]?.detectorConfidence ?? 0.9) * 100)}%
                  </div>
                  <div className="text-[10px] text-slate-400 uppercase font-semibold mt-0.5">
                    Sensor Detector Confidence
                  </div>
                </div>
              </div>
            </div>

            {/* Observations Timeline in Correlation */}
            <div className="space-y-2">
              <h4 className="text-xs font-bold text-slate-400 uppercase tracking-wider">
                Correlated Camera Sightings ({selectedCorrelation.observations.length})
              </h4>
              <div className="space-y-2">
                {selectedCorrelation.observations.map((obs, i) => (
                  <div key={obs.observationId || i} className="p-3 rounded-lg bg-[#0C111E] border border-slate-800 space-y-1.5 text-xs">
                    <div className="flex items-center justify-between">
                      <span className="font-bold text-white font-mono">{obs.cameraIdentifier}</span>
                      <span className="text-cyan-400 font-mono">{formatTimestamp(obs.timestamp)}</span>
                    </div>
                    <div className="text-slate-400 flex items-center justify-between">
                      <span>Sector: {obs.sectorName}</span>
                      <span>Dwell: {obs.dwellSeconds ?? 0}s</span>
                    </div>
                    {obs.plateText && (
                      <div className="text-xs text-amber-300 font-mono">
                        Plate Detected: {obs.plateText} (Confidence: {Math.round((obs.plateConfidence ?? 0.9) * 100)}%)
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>

            {/* Multi-Factor Reasoning List */}
            <div className="space-y-2">
              <h4 className="text-xs font-bold text-slate-400 uppercase tracking-wider">
                Corroborating Evidence Factors
              </h4>
              <div className="space-y-1.5">
                {selectedCorrelation.reasoningFactors.map((rf, idx) => (
                  <div key={idx} className="p-2.5 rounded bg-[#0C111E] border border-slate-800 text-xs space-y-1">
                    <div className="flex items-center justify-between text-slate-200 font-medium">
                      <span>{rf.factor}</span>
                      <span className="text-cyan-400 font-mono">+{Math.round(rf.confidenceDelta * 100)}%</span>
                    </div>
                    <p className="text-[11px] text-slate-400">{rf.evidence}</p>
                  </div>
                ))}
              </div>
            </div>

            <div className="p-3 rounded bg-amber-950/30 border border-amber-800/60 text-amber-300 text-xs">
              <strong>Ontological Guardrail:</strong> Correlation level record. Real-world legal identity is strictly unassigned without authorized external authority match.
            </div>

            {onEscalateCorrelation && (
              <Button
                variant="primary"
                onClick={() => {
                  onEscalateCorrelation(selectedCorrelation);
                  setSelectedCorrelation(null);
                }}
                className="w-full bg-amber-600 hover:bg-amber-500 text-black font-bold flex items-center justify-center gap-2"
              >
                <ShieldAlert className="w-4 h-4" />
                <span>Escalate to Active Incident Command</span>
              </Button>
            )}
          </div>
        </Drawer>
      )}

      {/* DRAWER 2: OBSERVABLE EVENT INSPECTOR */}
      {selectedEvent && (
        <Drawer
          isOpen={!!selectedEvent}
          onClose={() => setSelectedEvent(null)}
          title={`Behavioral Event: ${selectedEvent.eventId}`}
        >
          <div className="p-6 space-y-5 text-slate-200">
            <div className="p-4 rounded-xl bg-[#111726] border border-slate-800 space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-xs text-slate-400 uppercase tracking-wider font-semibold">Rule Triggered</span>
                <Badge variant={selectedEvent.severity === 'CRITICAL' ? 'critical' : 'attention'}>
                  {selectedEvent.severity}
                </Badge>
              </div>
              <div className="text-base font-bold text-white">{selectedEvent.ruleName}</div>
              <p className="text-xs text-slate-300">{selectedEvent.triggerReason}</p>
            </div>

            {/* Physical Sensor Measurements */}
            <div className="space-y-2">
              <h4 className="text-xs font-bold text-slate-400 uppercase tracking-wider">
                Measurable Sensor Metrics
              </h4>
              <div className="p-3.5 rounded-lg bg-[#0C111E] border border-slate-800 text-xs space-y-2 font-mono">
                {Object.entries(selectedEvent.observableMetrics).map(([k, v]) => (
                  <div key={k} className="flex items-center justify-between border-b border-slate-800/60 pb-1">
                    <span className="text-slate-400 capitalize">{k.replace(/([A-Z])/g, ' $1')}:</span>
                    <span className="text-white font-bold">{Array.isArray(v) ? v.join(', ') : String(v)}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* Reasoning Factors */}
            <div className="space-y-2">
              <h4 className="text-xs font-bold text-slate-400 uppercase tracking-wider">
                Evaluation Factors
              </h4>
              <div className="space-y-2">
                {selectedEvent.reasoningFactors.map((rf, i) => (
                  <div key={i} className="p-2.5 rounded bg-[#0C111E] border border-slate-800 text-xs space-y-1">
                    <div className="text-white font-semibold flex items-center justify-between">
                      <span>{rf.factor}</span>
                      <span className="text-cyan-400 font-mono">Weight: {rf.weight}</span>
                    </div>
                    <p className="text-slate-400 text-[11px]">{rf.detail}</p>
                  </div>
                ))}
              </div>
            </div>

            {onEscalateEvent && (
              <Button
                variant="primary"
                onClick={() => {
                  onEscalateEvent(selectedEvent);
                  setSelectedEvent(null);
                }}
                className="w-full bg-amber-600 hover:bg-amber-500 text-black font-bold flex items-center justify-center gap-2"
              >
                <ShieldAlert className="w-4 h-4" />
                <span>Create Platform Alert / Escalate</span>
              </Button>
            )}
          </div>
        </Drawer>
      )}

      {/* MODAL: RULE ENGINE CONFIGURATION */}
      {isConfigModalOpen && configDraft && (
        <Modal
          isOpen={isConfigModalOpen}
          onClose={() => setIsConfigModalOpen(false)}
          title="Configure Observable Border Analytics Rules"
        >
          <div className="space-y-4 text-xs text-slate-200">
            <p className="text-slate-400">
              Adjust empirical thresholds for observable behavioral events across border surveillance sectors.
            </p>

            {/* Night movement */}
            <div className="p-3 rounded-lg bg-[#0E1422] border border-slate-800 space-y-2">
              <div className="flex items-center justify-between font-semibold text-white">
                <span className="flex items-center gap-1.5">
                  <Moon className="w-4 h-4 text-indigo-400" />
                  <span>Night Observation Hours Schedule</span>
                </span>
                <input
                  type="checkbox"
                  checked={configDraft.nightHours.enabled}
                  onChange={(e) =>
                    setConfigDraft({
                      ...configDraft,
                      nightHours: { ...configDraft.nightHours, enabled: e.target.checked },
                    })
                  }
                  className="rounded border-slate-700"
                />
              </div>
              <div className="grid grid-cols-2 gap-3 text-xs">
                <div>
                  <label className="text-slate-400 block mb-1">Start Hour (24h format)</label>
                  <input
                    type="number"
                    min="0"
                    max="23"
                    value={configDraft.nightHours.startHour}
                    onChange={(e) =>
                      setConfigDraft({
                        ...configDraft,
                        nightHours: { ...configDraft.nightHours, startHour: parseInt(e.target.value, 10) || 0 },
                      })
                    }
                    className="w-full bg-[#080B12] border border-slate-700 rounded px-2.5 py-1 text-white"
                  />
                </div>
                <div>
                  <label className="text-slate-400 block mb-1">End Hour (24h format)</label>
                  <input
                    type="number"
                    min="0"
                    max="23"
                    value={configDraft.nightHours.endHour}
                    onChange={(e) =>
                      setConfigDraft({
                        ...configDraft,
                        nightHours: { ...configDraft.nightHours, endHour: parseInt(e.target.value, 10) || 0 },
                      })
                    }
                    className="w-full bg-[#080B12] border border-slate-700 rounded px-2.5 py-1 text-white"
                  />
                </div>
              </div>
            </div>

            {/* Loitering Dwell */}
            <div className="p-3 rounded-lg bg-[#0E1422] border border-slate-800 space-y-2">
              <div className="flex items-center justify-between font-semibold text-white">
                <span className="flex items-center gap-1.5">
                  <Clock className="w-4 h-4 text-amber-400" />
                  <span>Loitering / Dwell Thresholds (Seconds)</span>
                </span>
                <input
                  type="checkbox"
                  checked={configDraft.loitering.enabled}
                  onChange={(e) =>
                    setConfigDraft({
                      ...configDraft,
                      loitering: { ...configDraft.loitering, enabled: e.target.checked },
                    })
                  }
                  className="rounded border-slate-700"
                />
              </div>
              <div className="grid grid-cols-2 gap-3 text-xs">
                <div>
                  <label className="text-slate-400 block mb-1">Person Dwell Threshold (s)</label>
                  <input
                    type="number"
                    min="10"
                    value={configDraft.loitering.personDwellThresholdSeconds}
                    onChange={(e) =>
                      setConfigDraft({
                        ...configDraft,
                        loitering: {
                          ...configDraft.loitering,
                          personDwellThresholdSeconds: parseInt(e.target.value, 10) || 120,
                        },
                      })
                    }
                    className="w-full bg-[#080B12] border border-slate-700 rounded px-2.5 py-1 text-white"
                  />
                </div>
                <div>
                  <label className="text-slate-400 block mb-1">Vehicle Dwell Threshold (s)</label>
                  <input
                    type="number"
                    min="10"
                    value={configDraft.loitering.vehicleDwellThresholdSeconds}
                    onChange={(e) =>
                      setConfigDraft({
                        ...configDraft,
                        loitering: {
                          ...configDraft.loitering,
                          vehicleDwellThresholdSeconds: parseInt(e.target.value, 10) || 180,
                        },
                      })
                    }
                    className="w-full bg-[#080B12] border border-slate-700 rounded px-2.5 py-1 text-white"
                  />
                </div>
              </div>
            </div>

            {/* Repeated Fence */}
            <div className="p-3 rounded-lg bg-[#0E1422] border border-slate-800 space-y-2">
              <div className="flex items-center justify-between font-semibold text-white">
                <span className="flex items-center gap-1.5">
                  <ShieldAlert className="w-4 h-4 text-rose-400" />
                  <span>Repeated Fence Crossings</span>
                </span>
                <input
                  type="checkbox"
                  checked={configDraft.repeatedFence.enabled}
                  onChange={(e) =>
                    setConfigDraft({
                      ...configDraft,
                      repeatedFence: { ...configDraft.repeatedFence, enabled: e.target.checked },
                    })
                  }
                  className="rounded border-slate-700"
                />
              </div>
              <div className="grid grid-cols-2 gap-3 text-xs">
                <div>
                  <label className="text-slate-400 block mb-1">Threshold Crossings</label>
                  <input
                    type="number"
                    min="1"
                    value={configDraft.repeatedFence.thresholdCrossings}
                    onChange={(e) =>
                      setConfigDraft({
                        ...configDraft,
                        repeatedFence: {
                          ...configDraft.repeatedFence,
                          thresholdCrossings: parseInt(e.target.value, 10) || 2,
                        },
                      })
                    }
                    className="w-full bg-[#080B12] border border-slate-700 rounded px-2.5 py-1 text-white"
                  />
                </div>
                <div>
                  <label className="text-slate-400 block mb-1">Window (Seconds)</label>
                  <input
                    type="number"
                    min="30"
                    value={configDraft.repeatedFence.timeWindowSeconds}
                    onChange={(e) =>
                      setConfigDraft({
                        ...configDraft,
                        repeatedFence: {
                          ...configDraft.repeatedFence,
                          timeWindowSeconds: parseInt(e.target.value, 10) || 600,
                        },
                      })
                    }
                    className="w-full bg-[#080B12] border border-slate-700 rounded px-2.5 py-1 text-white"
                  />
                </div>
              </div>
            </div>

            {/* Modal Actions */}
            <div className="pt-3 border-t border-slate-800 flex items-center justify-end gap-2.5">
              <Button variant="ghost" size="sm" onClick={() => setIsConfigModalOpen(false)}>
                Cancel
              </Button>
              <Button
                variant="primary"
                size="sm"
                onClick={handleSaveConfig}
                className="bg-cyan-500 hover:bg-cyan-400 text-black font-semibold"
              >
                Save & Deploy Thresholds
              </Button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
};
