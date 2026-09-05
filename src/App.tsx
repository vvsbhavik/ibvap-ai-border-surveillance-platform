import React, { useState, useEffect, useCallback } from 'react';
import { api } from './api/client';
import {
  User,
  Sector,
  Zone,
  Camera,
  Alert,
  Incident,
  EvidenceItem,
  AnprRecord,
  WatchlistEntry,
  SystemHealthItem,
  AuditLog,
  RealtimeEventEnvelope,
} from './server/types';
import { ThemeProvider } from './design-system/theme';
import { TopCommandBar } from './components/layout/TopCommandBar';
import { SidebarNav, NavScreen } from './components/layout/SidebarNav';
import { RealtimeStatusBar } from './components/layout/RealtimeStatusBar';
import { CommandPalette } from './components/ui/CommandPalette';
import { LoadingState } from './components/ui/FeedbackStates';
import { ErrorBoundary } from './components/ui/ErrorBoundary';

// Screens
import { LoginScreen } from './screens/LoginScreen';
import { DashboardScreen } from './screens/DashboardScreen';
import { CamerasScreen } from './screens/CamerasScreen';
import { LiveScreen } from './screens/LiveScreen';
import { AlertsScreen } from './screens/AlertsScreen';
import { IncidentsScreen } from './screens/IncidentsScreen';
import { EvidenceScreen } from './screens/EvidenceScreen';
import { GisScreen } from './screens/GisScreen';
import { AnprScreen } from './screens/AnprScreen';
import { WatchlistsScreen } from './screens/WatchlistsScreen';
import { CopilotScreen } from './screens/CopilotScreen';
import { HealthScreen } from './screens/HealthScreen';
import { AdminScreen } from './screens/AdminScreen';

export function App() {
  // Session & Authentication
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [isAuthLoading, setIsAuthLoading] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);

  // Operational Navigation
  const [currentScreen, setCurrentScreen] = useState<NavScreen>('dashboard');
  const [isCommandPaletteOpen, setIsCommandPaletteOpen] = useState(false);

  // Operational Data State
  const [sectors, setSectors] = useState<Sector[]>([]);
  const [zones, setZones] = useState<Zone[]>([]);
  const [cameras, setCameras] = useState<Camera[]>([]);
  const [alerts, setAlerts] = useState<Alert[]>([]);
  const [incidents, setIncidents] = useState<Incident[]>([]);
  const [evidenceList, setEvidenceList] = useState<EvidenceItem[]>([]);
  const [anprRecords, setAnprRecords] = useState<AnprRecord[]>([]);
  const [watchlists, setWatchlists] = useState<WatchlistEntry[]>([]);
  const [healthItems, setHealthItems] = useState<SystemHealthItem[]>([]);
  const [auditLogs, setAuditLogs] = useState<AuditLog[]>([]);
  const [usersList, setUsersList] = useState<User[]>([]);

  // Telemetry & Filters
  const [selectedSectorId, setSelectedSectorId] = useState<string>('ALL');
  const [systemStatus, setSystemStatus] = useState<'HEALTHY' | 'ATTENTION' | 'DEGRADED'>('HEALTHY');
  const [isRealtimeConnected, setIsRealtimeConnected] = useState(false);
  const [lastEventMessage, setLastEventMessage] = useState('');
  const [isSimulatingDrill, setIsSimulatingDrill] = useState(false);
  const [isInitialLoading, setIsInitialLoading] = useState(true);

  // 1. Initial Data Fetching
  const loadPlatformData = useCallback(async () => {
    try {
      const [
        sectorsRes,
        zonesRes,
        camerasRes,
        alertsRes,
        incidentsRes,
        evidenceRes,
        anprRes,
        watchlistsRes,
        healthRes,
        auditRes,
        usersRes,
      ] = await Promise.all([
        api.zones.sectors().catch(() => ({ success: true, sectors: [] })),
        api.zones.list().catch(() => ({ success: true, zones: [] })),
        api.cameras.list().catch(() => ({ success: true, cameras: [] })),
        api.alerts.list().catch(() => ({ success: true, alerts: [] })),
        api.incidents.list().catch(() => ({ success: true, incidents: [] })),
        api.evidence.list().catch(() => ({ success: true, evidence: [] })),
        api.anpr.list().catch(() => ({ success: true, records: [] })),
        api.watchlists.list().catch(() => ({ success: true, watchlists: [] })),
        api.health.get().catch(() => ({ success: true, overallStatus: 'HEALTHY', components: [] })),
        api.system.auditLogs({ limit: 100 }).catch(() => ({ success: true, logs: [] })),
        api.users.list().catch(() => ({ success: true, users: [] })),
      ]);

      if (sectorsRes.sectors) setSectors(sectorsRes.sectors);
      if (zonesRes.zones) setZones(zonesRes.zones);
      if (camerasRes.cameras) setCameras(camerasRes.cameras);
      if (alertsRes.alerts) setAlerts(alertsRes.alerts);
      if (incidentsRes.incidents) setIncidents(incidentsRes.incidents);
      if (evidenceRes.evidence) setEvidenceList(evidenceRes.evidence);
      if (anprRes.records) setAnprRecords(anprRes.records);
      if (watchlistsRes.watchlists) setWatchlists(watchlistsRes.watchlists);
      if (healthRes.components) setHealthItems(healthRes.components);
      if (healthRes.overallStatus) setSystemStatus(healthRes.overallStatus as any);
      if (auditRes.logs) setAuditLogs(auditRes.logs);
      if (usersRes.users) setUsersList(usersRes.users);
    } catch (err) {
      console.error('Failed to load platform data:', err);
    } finally {
      setIsInitialLoading(false);
    }
  }, []);

  // 2. Auth Status & User Session
  useEffect(() => {
    async function checkAuth() {
      try {
        const res = await api.auth.me();
        if (res.user) {
          setCurrentUser(res.user);
        }
      } catch {
        // Fallback default commander for seamless exploration if no session
        setCurrentUser({
          id: 'usr-default-lead',
          callsign: 'COMMANDER-1',
          fullName: 'Marcus Vance',
          role: 'WATCH_COMMANDER',
          badgeNumber: 'B-4091',
          sectorAssignmentId: 'sec-04',
          email: 'commander@ibvap.gov',
          status: 'ACTIVE',
        });
      }
      loadPlatformData();
    }
    checkAuth();
  }, [loadPlatformData]);

  // 3. Realtime Server-Sent Events (SSE) Listener
  useEffect(() => {
    let eventSource: EventSource | null = null;

    try {
      eventSource = new EventSource('/api/v1/realtime/events');

      eventSource.onopen = () => {
        setIsRealtimeConnected(true);
      };

      eventSource.onmessage = (e) => {
        try {
          const envelope = JSON.parse(e.data) as { eventType: string; payload: any };
          if (envelope.eventType === 'alert.created') {
            const newAlert = envelope.payload?.alert as Alert;
            if (newAlert) {
              setAlerts((prev) => [newAlert, ...prev.filter((a) => a.id !== newAlert.id)]);
              setLastEventMessage(`Perimeter Alert ${newAlert.alertNumber || newAlert.id}: ${newAlert.title}`);
            }
          } else if (envelope.eventType === 'incident.created') {
            const newIncident = envelope.payload?.incident as Incident;
            if (newIncident) {
              setIncidents((prev) => [newIncident, ...prev.filter((i) => i.id !== newIncident.id)]);
              setLastEventMessage(`Incident ${newIncident.incidentNumber}: ${newIncident.title}`);
            }
          } else if (envelope.eventType === 'camera.status_updated') {
            const updatedCam = envelope.payload?.camera as Camera;
            if (updatedCam) {
              setCameras((prev) => prev.map((c) => (c.id === updatedCam.id ? updatedCam : c)));
            }
          } else if (envelope.eventType === 'system.heartbeat') {
            // Heartbeat received
          }
        } catch (err) {
          console.error('Error parsing SSE payload:', err);
        }
      };

      eventSource.onerror = () => {
        setIsRealtimeConnected(false);
      };
    } catch {
      setIsRealtimeConnected(false);
    }

    return () => {
      if (eventSource) {
        eventSource.close();
      }
    };
  }, []);

  // 4. Global Keyboard Shortcuts (Section 17: Cmd+K, 1-9 to navigate)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        setIsCommandPaletteOpen((prev) => !prev);
      }
      // Alt+1 to Alt+9 for rapid screen navigation
      if (e.altKey) {
        const keyMap: Record<string, NavScreen> = {
          '1': 'dashboard',
          '2': 'cameras',
          '3': 'live',
          '4': 'alerts',
          '5': 'incidents',
          '6': 'evidence',
          '7': 'gis',
          '8': 'anpr',
          '9': 'copilot',
        };
        if (keyMap[e.key]) {
          e.preventDefault();
          setCurrentScreen(keyMap[e.key]);
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  // 5. Operator Actions Handlers
  const handleLogin = async (
    credentials: { callsign: string; password?: string; quickSwitch?: boolean } | string
  ) => {
    setIsAuthLoading(true);
    setAuthError(null);
    try {
      const payload = typeof credentials === 'string' ? { callsign: credentials } : credentials;
      const res = await api.auth.login(payload);
      setCurrentUser(res.user);
      await loadPlatformData();
      setLastEventMessage(`Station session established for ${res.user.callsign} (${res.user.role})`);
    } catch (err: any) {
      setAuthError(err.message || 'Authentication failed');
    } finally {
      setIsAuthLoading(false);
    }
  };

  const handleSwitchUser = async (callsign: string) => {
    setIsAuthLoading(true);
    try {
      const res = await api.auth.login({
        callsign,
        password: 'IBVAP-Terminal-2026!',
        quickSwitch: true,
      });
      setCurrentUser(res.user);
      await loadPlatformData();
      setLastEventMessage(`Active operator switched to ${res.user.callsign} (${res.user.role})`);
    } catch (err: any) {
      console.error('Failed to switch operator:', err);
    } finally {
      setIsAuthLoading(false);
    }
  };

  const handleLogout = async () => {
    try {
      await api.auth.logout();
    } catch {
      // ignore
    }
    setCurrentUser(null);
  };

  const handleAcknowledgeAlert = async (alertId: string, notes?: string) => {
    try {
      const res = await api.alerts.acknowledge(alertId, currentUser?.callsign, notes);
      setAlerts((prev) => prev.map((a) => (a.id === alertId ? res.alert : a)));
      setLastEventMessage(`Alert ${res.alert.alertNumber || res.alert.id} acknowledged by ${currentUser?.callsign}`);
    } catch (err: any) {
      console.error('Failed to acknowledge alert:', err);
    }
  };

  const handleEscalateAlert = async (alertId: string, incidentTitle: string, incidentSummary: string) => {
    try {
      const res = await api.alerts.escalate(alertId, {
        incidentTitle,
        incidentSummary,
        operatorCallsign: currentUser?.callsign,
      });
      setAlerts((prev) => prev.map((a) => (a.id === alertId ? res.alert : a)));
      setIncidents((prev) => [res.incident, ...prev]);
      setCurrentScreen('incidents');
      setLastEventMessage(`Escalated to Incident ${res.incident.incidentNumber}`);
    } catch (err: any) {
      console.error('Failed to escalate alert:', err);
    }
  };

  const handleDismissAlert = async (alertId: string, reason: string) => {
    try {
      const res = await api.alerts.dismiss(alertId, reason, currentUser?.callsign);
      setAlerts((prev) => prev.map((a) => (a.id === alertId ? res.alert : a)));
      setLastEventMessage(`Alert ${res.alert.alertNumber || res.alert.id} dismissed: ${reason}`);
    } catch (err: any) {
      console.error('Failed to dismiss alert:', err);
    }
  };

  const handleUpdateIncidentStatus = async (incidentId: string, status: string, notes?: string) => {
    try {
      const res = await api.incidents.updateStatus(incidentId, status, notes, currentUser?.callsign);
      setIncidents((prev) => prev.map((i) => (i.id === incidentId ? res.incident : i)));
      setLastEventMessage(`Incident ${res.incident.incidentNumber} status updated to ${status}`);
    } catch (err: any) {
      console.error('Failed to update incident status:', err);
    }
  };

  const handleAddIncidentTimeline = async (incidentId: string, actionType: string, description: string) => {
    try {
      const res = await api.incidents.addTimeline(incidentId, actionType, description, currentUser?.callsign);
      setIncidents((prev) => prev.map((i) => (i.id === incidentId ? res.incident : i)));
    } catch (err: any) {
      console.error('Failed to append incident timeline:', err);
    }
  };

  const handleVerifyEvidence = async (item: EvidenceItem) => {
    try {
      const res = await api.evidence.verify(item.id, currentUser?.callsign);
      setEvidenceList((prev) => prev.map((e) => (e.id === item.id ? res.evidence : e)));
      setLastEventMessage(`Evidence ${item.id} verified: SHA-256 match validated`);
    } catch (err: any) {
      console.error('Failed to verify evidence:', err);
    }
  };

  const handleExportEvidence = async (item: EvidenceItem, purpose?: string) => {
    try {
      const res = await api.evidence.export(item.id, purpose, currentUser?.callsign);
      setEvidenceList((prev) => prev.map((e) => (e.id === item.id ? res.evidence : e)));
      setLastEventMessage(`Evidence package ${item.id} exported for ${purpose || 'JUDICIAL'}`);
    } catch (err: any) {
      console.error('Failed to export evidence:', err);
    }
  };

  const handlePtzPreset = async (cameraId: string, presetName: string) => {
    try {
      await api.cameras.ptz(cameraId, presetName, currentUser?.callsign);
      setLastEventMessage(`PTZ Camera ${cameraId} slewed to preset ${presetName}`);
    } catch (err: any) {
      console.error('Failed to slew PTZ preset:', err);
    }
  };

  const handleUpdateCameraStatus = async (cameraId: string, status: string, reason?: string) => {
    try {
      const res = await api.cameras.updateStatus(cameraId, { status, reason, operatorCallsign: currentUser?.callsign });
      setCameras((prev) => prev.map((c) => (c.id === cameraId ? res.camera : c)));
      setLastEventMessage(`Camera ${res.camera.identifier} status updated to ${status}`);
    } catch (err: any) {
      console.error('Failed to update camera status:', err);
    }
  };

  const handleCameraUpdated = (updatedCamera: Camera) => {
    if (updatedCamera.isDecommissioned) {
      setCameras((prev) => prev.filter((c) => c.id !== updatedCamera.id));
      setLastEventMessage(`Sensor ${updatedCamera.identifier || updatedCamera.name} decommissioned from active pool`);
    } else {
      setCameras((prev) => prev.map((c) => (c.id === updatedCamera.id ? updatedCamera : c)));
      setLastEventMessage(`Sensor ${updatedCamera.identifier || updatedCamera.name} dossier updated`);
    }
  };

  const handleCameraRegistered = (newCam: Camera) => {
    setCameras((prev) => [newCam, ...prev]);
    setLastEventMessage(`Sensor ${newCam.identifier || newCam.name} commissioned into active inventory`);
  };

  const handleCreateWatchlist = async (entry: Partial<WatchlistEntry>) => {
    try {
      const res = await api.watchlists.create({ ...entry, addedByCallsign: currentUser?.callsign });
      setWatchlists((prev) => [res.entry, ...prev]);
      setLastEventMessage(`Added ${res.entry.targetIdentifier} to ${res.entry.category}`);
    } catch (err: any) {
      console.error('Failed to create watchlist entry:', err);
    }
  };

  const handleToggleWatchlist = async (id: string) => {
    try {
      const res = await api.watchlists.toggle(id, currentUser?.callsign);
      setWatchlists((prev) => prev.map((w) => (w.id === id ? res.entry : w)));
      setLastEventMessage(`Watchlist ${res.entry.targetIdentifier} state toggled`);
    } catch (err: any) {
      console.error('Failed to toggle watchlist:', err);
    }
  };

  const handleRunSimulationDrill = async () => {
    setIsSimulatingDrill(true);
    try {
      const res = await api.events.simulate();
      setAlerts((prev) => [res.alert, ...prev]);
      setLastEventMessage(`Simulation Mode: ${res.alert.title} [${res.alert.alertNumber || res.alert.id}]`);
    } catch (err: any) {
      console.error('Failed to simulate perimeter drill:', err);
    } finally {
      setIsSimulatingDrill(false);
    }
  };

  // If not logged in, display login screen
  if (!currentUser) {
    return (
      <ThemeProvider>
        <LoginScreen
          onLogin={handleLogin}
          isLoading={isAuthLoading}
          error={authError}
        />
      </ThemeProvider>
    );
  }

  // Filter cameras by sector if selected
  const visibleCameras = cameras.filter(
    (c) => selectedSectorId === 'ALL' || c.sectorId === selectedSectorId
  );
  const visibleAlerts = alerts.filter(
    (a) => selectedSectorId === 'ALL' || a.sectorId === selectedSectorId
  );
  const visibleIncidents = incidents.filter(
    (i) => selectedSectorId === 'ALL' || i.sectorId === selectedSectorId
  );

  const pendingAlertsCount = visibleAlerts.filter((a) => a.status === 'PENDING_ACK').length;
  const openIncidentsCount = visibleIncidents.filter((i) => i.status === 'OPEN' || i.status === 'INVESTIGATING').length;
  const onlineCamerasCount = visibleCameras.filter((c) => c.status === 'ONLINE').length;

  return (
    <ThemeProvider>
      <div className="flex flex-col h-screen w-screen overflow-hidden bg-[#0A0B0D] text-white select-none">
        {/* 1. Top Command Bar */}
        <TopCommandBar
          user={currentUser}
          sectors={sectors}
          selectedSectorId={selectedSectorId}
          onSelectSector={setSelectedSectorId}
          onOpenCommandPalette={() => setIsCommandPaletteOpen(true)}
          onLogout={handleLogout}
          onSwitchUser={handleSwitchUser}
          isRealtimeConnected={isRealtimeConnected}
          systemStatus={systemStatus}
        />

        {/* 2. Middle Body (Sidebar + Primary Workspace) */}
        <div className="flex flex-1 overflow-hidden">
          <SidebarNav
            currentScreen={currentScreen}
            onNavigate={(s) => setCurrentScreen(s)}
            pendingAlertsCount={pendingAlertsCount}
            openIncidentsCount={openIncidentsCount}
            userPermissions={currentUser?.permissions}
          />

          <main className="flex-1 flex flex-col bg-[#0A0B0D] overflow-hidden relative">
            <ErrorBoundary onReset={() => setCurrentScreen('dashboard')}>
              {isInitialLoading ? (
                <LoadingState message="Connecting to IBVAP Command Event Bus..." />
              ) : (
                <>
                  {currentScreen === 'dashboard' && (
                    <DashboardScreen
                      cameras={visibleCameras}
                      alerts={visibleAlerts}
                      incidents={visibleIncidents}
                      selectedSector={selectedSectorId}
                      onAcknowledgeAlert={handleAcknowledgeAlert}
                      onEscalateAlert={(a) =>
                        handleEscalateAlert(
                          a.id,
                          `Operational Incident - ${a.alertNumber}`,
                          a.description
                        )
                      }
                      onDismissAlert={(id) => handleDismissAlert(id, 'False Positive - Verified Wildlife')}
                      onNavigateToScreen={(s) => setCurrentScreen(s as NavScreen)}
                      onSelectCamera={() => setCurrentScreen('live')}
                      onRunSimulation={handleRunSimulationDrill}
                    />
                  )}

                {currentScreen === 'cameras' && (
                  <CamerasScreen
                    cameras={visibleCameras}
                    sectors={sectors}
                    currentUser={currentUser}
                    onSelectCamera={() => setCurrentScreen('live')}
                    onPtzPreset={handlePtzPreset}
                    onUpdateStatus={handleUpdateCameraStatus}
                    onCameraUpdated={handleCameraUpdated}
                    onCameraRegistered={handleCameraRegistered}
                  />
                )}

                {currentScreen === 'live' && (
                  <LiveScreen
                    cameras={visibleCameras}
                    sectors={sectors}
                    onSelectCamera={() => {}}
                  />
                )}

                {currentScreen === 'alerts' && (
                  <AlertsScreen
                    alerts={visibleAlerts}
                    sectors={sectors}
                    onAcknowledgeAlert={handleAcknowledgeAlert}
                    onEscalateAlert={handleEscalateAlert}
                    onDismissAlert={handleDismissAlert}
                    onRunSimulation={handleRunSimulationDrill}
                  />
                )}

                {currentScreen === 'incidents' && (
                  <IncidentsScreen
                    incidents={visibleIncidents}
                    evidenceList={evidenceList}
                    onUpdateStatus={handleUpdateIncidentStatus}
                    onAddTimeline={handleAddIncidentTimeline}
                    onVerifyEvidence={handleVerifyEvidence}
                    onExportEvidence={handleExportEvidence}
                  />
                )}

                {currentScreen === 'evidence' && (
                  <EvidenceScreen
                    evidenceList={evidenceList}
                    onVerifyEvidence={handleVerifyEvidence}
                    onExportEvidence={handleExportEvidence}
                  />
                )}

                {currentScreen === 'gis' && (
                  <GisScreen
                    cameras={visibleCameras}
                    sectors={sectors}
                    zones={zones}
                    onSelectCamera={() => setCurrentScreen('live')}
                  />
                )}

                {currentScreen === 'anpr' && (
                  <AnprScreen
                    records={anprRecords}
                    onEscalateAnpr={(r) => {
                      handleRunSimulationDrill();
                    }}
                  />
                )}

                {currentScreen === 'watchlists' && (
                  <WatchlistsScreen
                    watchlists={watchlists}
                    onCreateEntry={handleCreateWatchlist}
                    onToggleEntry={handleToggleWatchlist}
                  />
                )}

                {currentScreen === 'copilot' && (
                  <CopilotScreen
                    cameras={visibleCameras}
                    alerts={visibleAlerts}
                    incidents={visibleIncidents}
                  />
                )}

                {currentScreen === 'health' && (
                  <HealthScreen
                    healthItems={healthItems}
                    overallStatus={systemStatus}
                    onRefresh={loadPlatformData}
                  />
                )}

                {currentScreen === 'admin' && (
                  <AdminScreen
                    currentUser={currentUser}
                    users={usersList.length > 0 ? usersList : [
                      currentUser!,
                      {
                        id: 'usr-01',
                        callsign: 'OPERATOR-01',
                        fullName: 'Elena Rostova',
                        role: 'FIELD_OPERATOR',
                        badgeNumber: 'B-1082',
                        sectorAssignmentId: 'sec-01',
                        email: 'e.rostova@ibvap.gov',
                        status: 'ACTIVE',
                      },
                      {
                        id: 'usr-02',
                        callsign: 'ANALYST-02',
                        fullName: 'David Chen',
                        role: 'FORENSIC_ANALYST',
                        badgeNumber: 'B-2940',
                        sectorAssignmentId: 'sec-02',
                        email: 'd.chen@ibvap.gov',
                        status: 'ACTIVE',
                      },
                    ]}
                    auditLogs={auditLogs}
                    onRefreshData={loadPlatformData}
                  />
                )}
              </>
            )}
            </ErrorBoundary>
          </main>
        </div>

        {/* 3. Bottom Realtime Status Bar */}
        <RealtimeStatusBar
          isConnected={isRealtimeConnected}
          lastEventMessage={lastEventMessage}
          onRunSimulationDrill={handleRunSimulationDrill}
          isSimulating={isSimulatingDrill}
          totalCameras={cameras.length}
          onlineCameras={onlineCamerasCount}
        />

        {/* 4. Global Command Palette Modal */}
        <CommandPalette
          isOpen={isCommandPaletteOpen}
          onClose={() => setIsCommandPaletteOpen(false)}
          onNavigate={(screen) => setCurrentScreen(screen as NavScreen)}
        />
      </div>
    </ThemeProvider>
  );
}

export default App;
