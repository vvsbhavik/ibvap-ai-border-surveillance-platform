import React, { useState, useEffect } from 'react';
import {
  Shield,
  ShieldAlert,
  ShieldCheck,
  Plus,
  Trash2,
  Power,
  PowerOff,
  AlertTriangle,
  Users,
  Compass,
  Zap,
  ArrowLeftRight,
  ArrowRight,
  ArrowLeft,
  CheckCircle2,
  RefreshCw,
} from 'lucide-react';
import { Camera, User, SpatialZone, SpatialEvent, SpatialZoneType, SpatialGeometryType, SpatialCrossingDirection, ZoneOccupancy } from '../../server/types';
import { api } from '../../api/client';
import { Button } from '../ui/Button';
import { Badge } from '../ui/Badge';
import { hasPermission } from '../../utils/permissions';
import { formatTimestamp } from '../../utils/formatters';

export interface CameraSpatialTabProps {
  camera: Camera;
  currentUser: User | null;
}

export const CameraSpatialTab: React.FC<CameraSpatialTabProps> = ({ camera, currentUser }) => {
  const [zones, setZones] = useState<SpatialZone[]>([]);
  const [recentEvents, setRecentEvents] = useState<SpatialEvent[]>([]);
  const [occupancies, setOccupancies] = useState<Record<string, ZoneOccupancy>>({});
  const [isLoading, setIsLoading] = useState(true);
  const [isCreating, setIsCreating] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [actionSuccess, setActionSuccess] = useState<string | null>(null);

  // New Zone Form State
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [type, setType] = useState<SpatialZoneType>('RESTRICTED_AREA');
  const [geometry, setGeometry] = useState<SpatialGeometryType>('POLYGON');
  const [direction, setDirection] = useState<SpatialCrossingDirection>('BIDIRECTIONAL');
  const [severity, setSeverity] = useState<'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL'>('HIGH');
  const [color, setColor] = useState('#EF4444');
  const [dwellWarningSeconds, setDwellWarningSeconds] = useState<string>('');
  const [maxDwellSeconds, setMaxDwellSeconds] = useState<string>('');
  const [presetCoords, setPresetCoords] = useState<'CENTRAL_RESTRICTED' | 'PERIMETER_FENCE' | 'BUFFER_CORRIDOR' | 'WEST_BORDER_LINE'>('CENTRAL_RESTRICTED');

  const canCreate = currentUser ? hasPermission(currentUser.role, 'zone.create') : false;
  const canActivate = currentUser ? hasPermission(currentUser.role, 'zone.activate') : false;
  const canDeactivate = currentUser ? hasPermission(currentUser.role, 'zone.deactivate') : false;
  const canDelete = currentUser ? hasPermission(currentUser.role, 'zone.delete') : false;

  const camIdentifier = camera.cameraId || camera.id;

  const fetchZonesAndEvents = async () => {
    try {
      const [zonesRes, eventsRes, occRes] = await Promise.allSettled([
        api.zones.getCameraZones(camIdentifier),
        api.zones.getEvents({ cameraId: camIdentifier, limit: 15 }),
        api.zones.getOccupancy({ cameraId: camIdentifier }),
      ]);

      if (zonesRes.status === 'fulfilled' && zonesRes.value?.zones) {
        setZones(zonesRes.value.zones);
      }
      if (eventsRes.status === 'fulfilled' && eventsRes.value?.events) {
        setRecentEvents(eventsRes.value.events);
      }
      if (occRes.status === 'fulfilled' && occRes.value?.occupancies) {
        const occMap: Record<string, ZoneOccupancy> = {};
        for (const occ of occRes.value.occupancies) {
          occMap[occ.zoneId] = occ;
        }
        setOccupancies(occMap);
      }
    } catch {
      // ignore
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchZonesAndEvents();
    const interval = setInterval(fetchZonesAndEvents, 2500);
    return () => clearInterval(interval);
  }, [camIdentifier]);

  const handleToggleActive = async (zone: SpatialZone) => {
    setActionError(null);
    setActionSuccess(null);
    try {
      if (zone.active) {
        if (!canDeactivate) {
          setActionError('Permission denied: cannot deactivate spatial zone.');
          return;
        }
        await api.zones.deactivate(zone.zoneId);
        setActionSuccess(`Deactivated zone ${zone.name}`);
      } else {
        if (!canActivate) {
          setActionError('Permission denied: cannot activate spatial zone.');
          return;
        }
        await api.zones.activate(zone.zoneId);
        setActionSuccess(`Activated zone ${zone.name}`);
      }
      fetchZonesAndEvents();
    } catch (err: any) {
      setActionError(err.message || 'Operation failed');
    }
  };

  const handleDelete = async (zone: SpatialZone) => {
    if (!canDelete) {
      setActionError('Permission denied: cannot delete spatial zone.');
      return;
    }
    if (!confirm(`Are you sure you want to delete "${zone.name}"?`)) return;

    setActionError(null);
    setActionSuccess(null);
    try {
      await api.zones.delete(zone.zoneId);
      setActionSuccess(`Deleted zone ${zone.name}`);
      fetchZonesAndEvents();
    } catch (err: any) {
      setActionError(err.message || 'Failed to delete zone');
    }
  };

  const handleCreateZone = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canCreate) {
      setActionError('Permission denied: cannot create spatial zone.');
      return;
    }
    if (!name.trim()) {
      setActionError('Zone name is required.');
      return;
    }

    let coordinates: { x: number; y: number }[] = [];
    if (geometry === 'LINE') {
      if (presetCoords === 'WEST_BORDER_LINE') {
        coordinates = [{ x: 0.25, y: 0.15 }, { x: 0.25, y: 0.85 }];
      } else {
        coordinates = [{ x: 0.45, y: 0.10 }, { x: 0.45, y: 0.90 }];
      }
    } else {
      if (presetCoords === 'CENTRAL_RESTRICTED') {
        coordinates = [
          { x: 0.40, y: 0.20 },
          { x: 0.75, y: 0.20 },
          { x: 0.75, y: 0.75 },
          { x: 0.40, y: 0.75 },
        ];
      } else if (presetCoords === 'BUFFER_CORRIDOR') {
        coordinates = [
          { x: 0.20, y: 0.15 },
          { x: 0.40, y: 0.15 },
          { x: 0.40, y: 0.85 },
          { x: 0.20, y: 0.85 },
        ];
      } else {
        coordinates = [
          { x: 0.10, y: 0.10 },
          { x: 0.90, y: 0.10 },
          { x: 0.90, y: 0.90 },
          { x: 0.10, y: 0.90 },
        ];
      }
    }

    try {
      const res = await api.zones.create({
        cameraId: camIdentifier,
        name: name.trim(),
        description: description.trim() || undefined,
        type,
        geometry,
        coordinates,
        direction: geometry === 'LINE' ? direction : undefined,
        severity,
        color,
        dwellWarningSeconds: dwellWarningSeconds ? Number(dwellWarningSeconds) : undefined,
        maxDwellSeconds: maxDwellSeconds ? Number(maxDwellSeconds) : undefined,
        active: true,
      });

      if (res.success) {
        setActionSuccess(`Zone "${res.zone.name}" created successfully.`);
        setName('');
        setDescription('');
        setDwellWarningSeconds('');
        setMaxDwellSeconds('');
        setIsCreating(false);
        fetchZonesAndEvents();
      }
    } catch (err: any) {
      setActionError(err.message || 'Failed to create spatial zone');
    }
  };

  const handleTriggerScene = async (sceneName: string) => {
    try {
      await api.video.setTestScene(camIdentifier, sceneName);
      setActionSuccess(`Test scenario triggered: ${sceneName}`);
      setTimeout(() => setActionSuccess(null), 3000);
    } catch (err: any) {
      setActionError(err.message || 'Failed to trigger test scenario');
    }
  };

  return (
    <div className="space-y-6 text-[#E0E2E6]">
      {/* Header & Overview */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-3 bg-[#14161A] border border-[#23262B] rounded">
        <div>
          <div className="flex items-center gap-2">
            <Shield className="w-4 h-4 text-[#38BDF8]" />
            <h3 className="text-xs font-semibold uppercase tracking-wider text-white">
              Spatial Intelligence & Virtual Fences
            </h3>
          </div>
          <p className="text-[11px] text-[#6C727A] mt-0.5">
            Camera-scoped virtual boundaries, directional tripwires, and real-time Point-In-Polygon intrusion detection.
          </p>
        </div>

        <div className="flex items-center gap-2">
          {canCreate && !isCreating && (
            <Button size="sm" onClick={() => setIsCreating(true)} leftIcon={<Plus className="w-3.5 h-3.5" />}>
              Add Boundary
            </Button>
          )}
          <button
            type="button"
            onClick={fetchZonesAndEvents}
            className="p-1.5 text-[#6C727A] hover:text-white rounded hover:bg-[#23262B] transition-colors"
            title="Refresh spatial boundaries"
          >
            <RefreshCw className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* Notifications */}
      {actionSuccess && (
        <div className="p-2.5 bg-[#10B981]/15 border border-[#10B981]/30 rounded text-xs text-[#10B981] flex items-center gap-2">
          <CheckCircle2 className="w-4 h-4 shrink-0" />
          <span>{actionSuccess}</span>
        </div>
      )}
      {actionError && (
        <div className="p-2.5 bg-[#EF4444]/15 border border-[#EF4444]/30 rounded text-xs text-[#EF4444] flex items-center gap-2">
          <AlertTriangle className="w-4 h-4 shrink-0" />
          <span>{actionError}</span>
        </div>
      )}

      {/* Create Zone Drawer Form */}
      {isCreating && (
        <form onSubmit={handleCreateZone} className="p-4 bg-[#0F1115] border border-[#007AFF]/40 rounded space-y-4">
          <div className="flex items-center justify-between border-b border-[#23262B] pb-2">
            <span className="text-xs font-bold text-white uppercase font-mono">Create New Spatial Boundary</span>
            <button
              type="button"
              onClick={() => setIsCreating(false)}
              className="text-xs text-[#6C727A] hover:text-white"
            >
              Cancel
            </button>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="text-[10px] font-mono text-[#6C727A] uppercase block mb-1">Zone Name</label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. North Perimeter Fence Line"
                className="w-full bg-[#14161A] border border-[#23262B] rounded px-2.5 py-1.5 text-xs text-white placeholder-[#6C727A] focus:border-[#007AFF] outline-hidden font-mono"
                required
              />
            </div>

            <div>
              <label className="text-[10px] font-mono text-[#6C727A] uppercase block mb-1">Geometry Type</label>
              <select
                value={geometry}
                onChange={(e) => setGeometry(e.target.value as any)}
                className="w-full bg-[#14161A] border border-[#23262B] rounded px-2 py-1.5 text-xs text-white focus:border-[#007AFF] outline-hidden font-mono"
              >
                <option value="POLYGON">Polygon (Area / Zone)</option>
                <option value="LINE">Line (Virtual Fence / Tripwire)</option>
              </select>
            </div>

            <div>
              <label className="text-[10px] font-mono text-[#6C727A] uppercase block mb-1">Zone Classification</label>
              <select
                value={type}
                onChange={(e) => {
                  const t = e.target.value as SpatialZoneType;
                  setType(t);
                  if (t === 'RESTRICTED_AREA') setColor('#EF4444');
                  else if (t === 'BUFFER_ZONE') setColor('#F59E0B');
                  else if (t === 'MONITORING_AREA') setColor('#38BDF8');
                  else setColor('#10B981');
                }}
                className="w-full bg-[#14161A] border border-[#23262B] rounded px-2 py-1.5 text-xs text-white focus:border-[#007AFF] outline-hidden font-mono"
              >
                <option value="RESTRICTED_AREA">RESTRICTED AREA (Immediate Alert)</option>
                <option value="BUFFER_ZONE">BUFFER ZONE (Caution)</option>
                <option value="MONITORING_AREA">MONITORING AREA (Tracking)</option>
                <option value="OBSERVATION_AREA">OBSERVATION AREA (Passive)</option>
              </select>
            </div>

            {geometry === 'LINE' && (
              <div>
                <label className="text-[10px] font-mono text-[#6C727A] uppercase block mb-1">Crossing Direction</label>
                <select
                  value={direction}
                  onChange={(e) => setDirection(e.target.value as any)}
                  className="w-full bg-[#14161A] border border-[#23262B] rounded px-2 py-1.5 text-xs text-white focus:border-[#007AFF] outline-hidden font-mono"
                >
                  <option value="BIDIRECTIONAL">Bidirectional (Either Direction Triggers)</option>
                  <option value="LEFT_TO_RIGHT">Left-to-Right (Inbound Ingress Only)</option>
                  <option value="RIGHT_TO_LEFT">Right-to-Left (Outbound Egress Only)</option>
                </select>
              </div>
            )}

            <div>
              <label className="text-[10px] font-mono text-[#6C727A] uppercase block mb-1">Alert Severity</label>
              <select
                value={severity}
                onChange={(e) => setSeverity(e.target.value as any)}
                className="w-full bg-[#14161A] border border-[#23262B] rounded px-2 py-1.5 text-xs text-white focus:border-[#007AFF] outline-hidden font-mono"
              >
                <option value="CRITICAL">CRITICAL (Red Ops)</option>
                <option value="HIGH">HIGH (Immediate)</option>
                <option value="MEDIUM">MEDIUM (Standard)</option>
                <option value="LOW">LOW (Informational)</option>
              </select>
            </div>

            {geometry === 'POLYGON' && (
              <>
                <div>
                  <label className="text-[10px] font-mono text-[#6C727A] uppercase block mb-1">
                    Dwell Warning Threshold (sec)
                  </label>
                  <input
                    type="number"
                    min="1"
                    max="3600"
                    value={dwellWarningSeconds}
                    onChange={(e) => setDwellWarningSeconds(e.target.value)}
                    placeholder="e.g. 5 (optional)"
                    className="w-full bg-[#14161A] border border-[#23262B] rounded px-2 py-1.5 text-xs text-white focus:border-[#007AFF] outline-hidden font-mono placeholder:text-[#6C727A]"
                  />
                </div>
                <div>
                  <label className="text-[10px] font-mono text-[#6C727A] uppercase block mb-1">
                    Max Dwell Hard Cap (sec)
                  </label>
                  <input
                    type="number"
                    min="1"
                    max="7200"
                    value={maxDwellSeconds}
                    onChange={(e) => setMaxDwellSeconds(e.target.value)}
                    placeholder="e.g. 30 (optional)"
                    className="w-full bg-[#14161A] border border-[#23262B] rounded px-2 py-1.5 text-xs text-white focus:border-[#007AFF] outline-hidden font-mono placeholder:text-[#6C727A]"
                  />
                </div>
              </>
            )}

            <div>
              <label className="text-[10px] font-mono text-[#6C727A] uppercase block mb-1">Coordinate Geometry Preset</label>
              <select
                value={presetCoords}
                onChange={(e) => setPresetCoords(e.target.value as any)}
                className="w-full bg-[#14161A] border border-[#23262B] rounded px-2 py-1.5 text-xs text-white focus:border-[#007AFF] outline-hidden font-mono"
              >
                {geometry === 'LINE' ? (
                  <>
                    <option value="PERIMETER_FENCE">Central Virtual Fence Tripwire (x: 0.45)</option>
                    <option value="WEST_BORDER_LINE">West Boundary Fence Line (x: 0.25)</option>
                  </>
                ) : (
                  <>
                    <option value="CENTRAL_RESTRICTED">Central High-Security Compound (x: 0.4-0.75, y: 0.2-0.75)</option>
                    <option value="BUFFER_CORRIDOR">Intermediate Buffer Corridor (x: 0.2-0.4, y: 0.15-0.85)</option>
                  </>
                )}
              </select>
            </div>
          </div>

          <div className="flex justify-end gap-2 pt-2 border-t border-[#23262B]">
            <Button variant="ghost" size="sm" onClick={() => setIsCreating(false)}>
              Cancel
            </Button>
            <Button variant="primary" size="sm" type="submit">
              Deploy Spatial Boundary
            </Button>
          </div>
        </form>
      )}

      {/* Real-time Occupancy & Spatial Intelligence HUD */}
      {zones.length > 0 && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
          <div className="p-2.5 bg-[#14161A] border border-[#23262B] rounded">
            <span className="text-[10px] font-mono text-[#6C727A] uppercase block">Active Boundaries</span>
            <span className="text-base font-bold font-mono text-white">
              {zones.filter((z) => z.active).length} / {zones.length}
            </span>
          </div>
          <div className="p-2.5 bg-[#14161A] border border-[#23262B] rounded">
            <span className="text-[10px] font-mono text-[#6C727A] uppercase block">Total Zone Occupants</span>
            <span className="text-base font-bold font-mono text-[#38BDF8] flex items-center gap-1.5">
              <Users className="w-4 h-4" />
              {Object.values(occupancies).reduce((acc, o) => acc + (o.currentOccupants || 0), 0)}
            </span>
          </div>
          <div className="p-2.5 bg-[#14161A] border border-[#23262B] rounded">
            <span className="text-[10px] font-mono text-[#6C727A] uppercase block">Polygons Monitored</span>
            <span className="text-base font-bold font-mono text-[#F59E0B]">
              {zones.filter((z) => z.geometry === 'POLYGON').length}
            </span>
          </div>
          <div className="p-2.5 bg-[#14161A] border border-[#23262B] rounded">
            <span className="text-[10px] font-mono text-[#6C727A] uppercase block">Virtual Fence Lines</span>
            <span className="text-base font-bold font-mono text-[#10B981]">
              {zones.filter((z) => z.geometry === 'LINE').length}
            </span>
          </div>
        </div>
      )}

      {/* Active Boundaries List */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h4 className="text-xs font-semibold text-white uppercase tracking-wider font-mono">
            Configured Boundaries ({zones.length})
          </h4>
          <span className="text-[10px] text-[#6C727A] font-mono">
            {zones.filter((z) => z.active).length} ACTIVE
          </span>
        </div>

        {zones.length === 0 ? (
          <div className="p-4 bg-[#14161A] border border-[#23262B] rounded text-center text-xs text-[#6C727A]">
            No spatial zones or virtual fences configured on {camIdentifier}.
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-2.5">
            {zones.map((z) => {
              const isPolygon = z.geometry === 'POLYGON';
              const liveOcc = occupancies[z.zoneId];
              const occupantCount = liveOcc !== undefined ? liveOcc.currentOccupants : (z.currentOccupants?.length || 0);
              const occupantTrackIds = liveOcc !== undefined ? liveOcc.occupantTrackIds : (z.currentOccupants || []);
              const zoneColor = z.color || '#EF4444';

              return (
                <div
                  key={z.zoneId}
                  className={`p-3 bg-[#14161A] border rounded flex flex-col sm:flex-row sm:items-center justify-between gap-3 transition-colors ${
                    z.active ? 'border-[#23262B]' : 'border-[#23262B] opacity-60'
                  }`}
                >
                  <div className="flex items-start gap-3">
                    <div
                      className="w-3 h-3 rounded-full mt-1 shrink-0"
                      style={{ backgroundColor: z.active ? zoneColor : '#6C727A' }}
                    />
                    <div className="space-y-1">
                      <div className="flex flex-wrap items-center gap-1.5">
                        <span className="font-mono font-bold text-xs text-white">{z.name}</span>
                        <span
                          className="px-1.5 py-0.2 rounded text-[9px] font-mono font-bold uppercase"
                          style={{
                            backgroundColor: `${zoneColor}20`,
                            color: zoneColor,
                            border: `1px solid ${zoneColor}40`,
                          }}
                        >
                          {z.type.replace('_', ' ')}
                        </span>
                        <span className="px-1.5 py-0.2 rounded bg-[#0F1115] border border-[#23262B] text-[9px] font-mono text-[#8C929D]">
                          {isPolygon ? 'POLYGON ZONE' : `VIRTUAL FENCE [${z.direction || 'BIDIRECTIONAL'}]`}
                        </span>
                        {occupantCount > 0 && (
                          <span className="inline-flex items-center gap-1 px-1.5 py-0.2 rounded bg-[#EF4444]/20 border border-[#EF4444]/50 text-[9px] font-mono text-[#EF4444] font-bold animate-pulse">
                            <span className="w-1.5 h-1.5 rounded-full bg-[#EF4444]" />
                            {occupantCount} ACTIVE OCCUPANT{occupantCount > 1 ? 'S' : ''}
                          </span>
                        )}
                      </div>

                      <div className="flex flex-wrap items-center gap-3 text-[11px] text-[#6C727A] font-mono">
                        <span>ID: {z.zoneId}</span>
                        <span>Severity: {z.severity}</span>
                        <span className="flex items-center gap-1 text-[#38BDF8]">
                          <Users className="w-3 h-3" />
                          Occupants: {occupantCount}
                        </span>
                        <span>Vertices: {z.coordinates?.length || 0}</span>
                        {z.dwellWarningSeconds && z.dwellWarningSeconds > 0 && (
                          <span className="text-[#F59E0B]">
                            Dwell Warning: &gt;{z.dwellWarningSeconds}s
                          </span>
                        )}
                        {z.maxDwellSeconds && z.maxDwellSeconds > 0 && (
                          <span className="text-[#EF4444]">
                            Max Dwell: {z.maxDwellSeconds}s
                          </span>
                        )}
                      </div>

                      {occupantCount > 0 && occupantTrackIds.length > 0 && (
                        <div className="flex flex-wrap items-center gap-1 mt-1 pt-1 border-t border-[#23262B]">
                          <span className="text-[10px] text-[#F59E0B] font-mono font-bold">Track Occupants:</span>
                          {occupantTrackIds.map((occTrackId) => (
                            <span
                              key={occTrackId}
                              className="px-1.5 py-0.2 bg-[#F59E0B]/20 border border-[#F59E0B]/50 rounded text-[9px] font-mono text-[#F59E0B]"
                            >
                              {occTrackId}
                            </span>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>

                  <div className="flex items-center gap-1.5 shrink-0 self-end sm:self-center">
                    {/* Active State Toggle */}
                    <button
                      type="button"
                      onClick={() => handleToggleActive(z)}
                      className={`px-2 py-1 rounded text-xs font-mono font-medium border flex items-center gap-1 transition-colors cursor-pointer ${
                        z.active
                          ? 'bg-[#10B981]/15 text-[#10B981] border-[#10B981]/40 hover:bg-[#10B981]/25'
                          : 'bg-[#6C727A]/15 text-[#6C727A] border-[#6C727A]/40 hover:text-white'
                      }`}
                      title={z.active ? 'Deactivate boundary' : 'Activate boundary'}
                    >
                      {z.active ? <Power className="w-3 h-3" /> : <PowerOff className="w-3 h-3" />}
                      <span>{z.active ? 'ACTIVE' : 'STANDBY'}</span>
                    </button>

                    {/* Delete */}
                    {canDelete && (
                      <button
                        type="button"
                        onClick={() => handleDelete(z)}
                        className="p-1 text-[#6C727A] hover:text-[#EF4444] rounded hover:bg-[#23262B] transition-colors cursor-pointer"
                        title="Delete zone"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Synthetic Scenario Verification Runner */}
      <div className="p-3 bg-[#14161A] border border-[#23262B] rounded space-y-2">
        <div className="flex items-center gap-2">
          <Zap className="w-3.5 h-3.5 text-[#F59E0B]" />
          <h4 className="text-xs font-semibold text-white uppercase tracking-wider font-mono">
            Spatial Scenario Verification Tests
          </h4>
        </div>
        <p className="text-[11px] text-[#6C727A]">
          Execute real-time motion scenarios to test virtual fence tripwire breaches, zone intrusions, and boundary dwell calculations.
        </p>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 pt-1">
          {[
            { id: 'PERSON_CROSSING_FENCE', label: 'Cross Virtual Fence', desc: 'Tripwire Breach' },
            { id: 'PERSON_ENTERING_ZONE', label: 'Enter Restricted Zone', desc: 'Infiltration' },
            { id: 'PERSON_EXITING_ZONE', label: 'Exit Restricted Zone', desc: 'Egress' },
            { id: 'PERSON_PARALLEL_TO_FENCE', label: 'Parallel Movement', desc: 'No Crossing (Negative)' },
            { id: 'PERSON_TOUCHING_FENCE_BUT_NOT_CROSSING', label: 'Fence Proximity', desc: 'Touch Boundary' },
            { id: 'TWO_PERSONS_CROSSING', label: 'Dual Intrusion', desc: 'Simultaneous Breach' },
            { id: 'TEMPORARY_OCCLUSION_NEAR_ZONE', label: 'Near-Zone Occlusion', desc: 'Obstruction' },
            { id: 'DEFAULT', label: 'Reset Default Patrol', desc: 'Normal Operation' },
          ].map((sc) => (
            <button
              key={sc.id}
              type="button"
              onClick={() => handleTriggerScene(sc.id)}
              className="p-2 bg-[#0F1115] hover:bg-[#1A1E24] border border-[#23262B] hover:border-[#38BDF8] rounded text-left transition-colors cursor-pointer"
            >
              <span className="block text-[11px] font-mono font-bold text-white truncate">{sc.label}</span>
              <span className="block text-[9px] text-[#6C727A] truncate mt-0.5">{sc.desc}</span>
            </button>
          ))}
        </div>
      </div>

      {/* Real-time Spatial Events Audit Trail */}
      <div className="space-y-2.5">
        <div className="flex items-center justify-between">
          <h4 className="text-xs font-semibold text-white uppercase tracking-wider font-mono">
            Recent Spatial Events Log
          </h4>
          <span className="text-[10px] text-[#6C727A] font-mono">
            Showing latest {recentEvents.length} events
          </span>
        </div>

        {recentEvents.length === 0 ? (
          <div className="p-3 bg-[#14161A] border border-[#23262B] rounded text-center text-xs text-[#6C727A]">
            No spatial breach or zone events logged yet for this camera.
          </div>
        ) : (
          <div className="space-y-1.5 max-h-60 overflow-y-auto">
            {recentEvents.map((evt) => {
              const isFence = evt.eventType === 'fence.crossed';
              const isEntry = evt.eventType === 'zone.entered';
              const isExit = evt.eventType === 'zone.exited';
              const isDwell = evt.eventType === 'zone.dwell_warning';

              const badgeColor =
                evt.severity === 'CRITICAL'
                  ? 'text-[#EF4444] bg-[#EF4444]/15 border-[#EF4444]/40'
                  : evt.severity === 'HIGH'
                  ? 'text-[#F59E0B] bg-[#F59E0B]/15 border-[#F59E0B]/40'
                  : 'text-[#38BDF8] bg-[#38BDF8]/15 border-[#38BDF8]/40';

              return (
                <div
                  key={evt.eventId}
                  className="p-2 bg-[#0F1115] border border-[#23262B] rounded flex items-center justify-between gap-2 text-xs font-mono"
                >
                  <div className="flex items-center gap-2 min-w-0">
                    <span className={`px-1.5 py-0.2 rounded text-[9px] font-bold border uppercase ${badgeColor}`}>
                      {evt.eventType}
                    </span>
                    <span className="font-bold text-white truncate">Track #{evt.numericId}</span>
                    <span className="text-[#8C929D] truncate">on {evt.zoneName}</span>
                    {evt.direction && (
                      <span className="text-[10px] text-[#6C727A]">[{evt.direction}]</span>
                    )}
                    {evt.dwellTimeSeconds !== undefined && (
                      <span className="text-[10px] text-[#F59E0B]">({evt.dwellTimeSeconds.toFixed(1)}s)</span>
                    )}
                  </div>

                  <span className="text-[10px] text-[#6C727A] shrink-0">
                    {formatTimestamp(evt.timestamp)}
                  </span>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
};
