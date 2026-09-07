// ============================================================================
// IBVAP Retention & Lifecycle Engine
// Safely prunes stale telemetry and observations according to configured TTLs
// ============================================================================

import fs from 'fs';
import { appConfig } from '../config/app-config';
import { dataStore } from '../server/store';
import { logger } from '../server/logger';

export interface RetentionPolicy {
  eventsTtlHours: number;
  alertsTtlHours: number;
  incidentsTtlHours: number;
  auditLogsTtlHours: number;
  evidenceTtlHours: number;
  recordsTtlHours: number;
}

export interface PruneResult {
  dryRun: boolean;
  executedAt: string;
  prunedEventsCount: number;
  prunedAlertsCount: number;
  prunedIncidentsCount: number;
  prunedAuditLogsCount: number;
  prunedEvidenceCount: number;
  prunedAnprCount: number;
  prunedSpatialEventsCount: number;
  retainedOpenIncidentsCount: number;
  retainedEvidenceProtectedCount: number;
  details: string[];
}

export class RetentionService {
  private policy: RetentionPolicy;

  constructor(policy?: Partial<RetentionPolicy>) {
    this.policy = {
      eventsTtlHours: policy?.eventsTtlHours ?? appConfig.retention.eventsTtlHours,
      alertsTtlHours: policy?.alertsTtlHours ?? appConfig.retention.alertsTtlHours,
      incidentsTtlHours: policy?.incidentsTtlHours ?? appConfig.retention.incidentsTtlHours,
      auditLogsTtlHours: policy?.auditLogsTtlHours ?? appConfig.retention.auditLogsTtlHours,
      evidenceTtlHours: policy?.evidenceTtlHours ?? appConfig.retention.evidenceTtlHours,
      recordsTtlHours: policy?.recordsTtlHours ?? appConfig.retention.recordsTtlHours,
    };
  }

  getPolicy(): RetentionPolicy {
    return { ...this.policy };
  }

  updatePolicy(newPolicy: Partial<RetentionPolicy>): RetentionPolicy {
    this.policy = { ...this.policy, ...newPolicy };
    return this.getPolicy();
  }

  /**
   * Executes or simulates retention pruning.
   * Protects open/investigating incidents and their associated evidence.
   */
  async runPrune(options: { dryRun?: boolean; operatorCallsign?: string } = {}): Promise<PruneResult> {
    const dryRun = options.dryRun ?? false;
    const operatorCallsign = options.operatorCallsign ?? 'SYSTEM_RETENTION';
    const now = Date.now();
    const details: string[] = [];

    const eventCutoff = now - this.policy.eventsTtlHours * 3600 * 1000;
    const alertCutoff = now - this.policy.alertsTtlHours * 3600 * 1000;
    const incidentCutoff = now - this.policy.incidentsTtlHours * 3600 * 1000;
    const auditCutoff = now - this.policy.auditLogsTtlHours * 3600 * 1000;
    const evidenceCutoff = now - this.policy.evidenceTtlHours * 3600 * 1000;
    const recordsCutoff = now - this.policy.recordsTtlHours * 3600 * 1000;

    // Identify active incident IDs to protect linked evidence and alerts
    const activeIncidentIds = new Set(
      dataStore.incidents
        .filter((inc) => inc.status === 'OPEN' || inc.status === 'INVESTIGATING' || inc.status === 'CONTAINED')
        .map((inc) => inc.id)
    );

    // 1. Prune Events
    const initialEvents = dataStore.events.length;
    const remainingEvents = dataStore.events.filter((evt) => {
      const ts = new Date(evt.timestamp).getTime();
      return ts >= eventCutoff;
    });
    const prunedEventsCount = initialEvents - remainingEvents.length;

    // 2. Prune Alerts (protect alerts linked to active incidents)
    const initialAlerts = dataStore.alerts.length;
    const remainingAlerts = dataStore.alerts.filter((alert) => {
      if (alert.escalatedToIncidentId && activeIncidentIds.has(alert.escalatedToIncidentId)) {
        return true;
      }
      if (alert.status === 'PENDING_ACK' || alert.status === 'ESCALATED') {
        return true;
      }
      const ts = new Date(alert.createdAt).getTime();
      return ts >= alertCutoff;
    });
    const prunedAlertsCount = initialAlerts - remainingAlerts.length;

    // 3. Prune Closed/Resolved Incidents older than TTL (never prune OPEN incidents)
    const initialIncidents = dataStore.incidents.length;
    const remainingIncidents = dataStore.incidents.filter((inc) => {
      if (inc.status === 'OPEN' || inc.status === 'INVESTIGATING' || inc.status === 'CONTAINED') {
        return true; // strictly protected
      }
      const ts = new Date(inc.createdAt).getTime();
      return ts >= incidentCutoff;
    });
    const prunedIncidentsCount = initialIncidents - remainingIncidents.length;

    // 4. Prune Evidence (protect evidence linked to active incidents)
    let protectedEvidenceCount = 0;
    const initialEvidence = dataStore.evidence.length;
    const evidenceToDeleteFiles: string[] = [];

    const remainingEvidence = dataStore.evidence.filter((evi) => {
      if (evi.incidentId && activeIncidentIds.has(evi.incidentId)) {
        protectedEvidenceCount++;
        return true;
      }
      const ts = new Date(evi.createdAt).getTime();
      const expired = ts < evidenceCutoff;
      if (expired && evi.storageReferenceUri) {
        evidenceToDeleteFiles.push(evi.storageReferenceUri);
        return false;
      }
      return true;
    });
    const prunedEvidenceCount = initialEvidence - remainingEvidence.length;

    // 5. Prune ANPR records
    const initialAnpr = dataStore.anprRecords.length;
    const remainingAnpr = dataStore.anprRecords.filter((rec) => {
      const ts = new Date(rec.timestamp).getTime();
      return ts >= recordsCutoff;
    });
    const prunedAnprCount = initialAnpr - remainingAnpr.length;

    // 6. Prune Spatial Events
    const initialSpatial = dataStore.spatialEvents.length;
    const remainingSpatial = dataStore.spatialEvents.filter((evt) => {
      const ts = new Date(evt.timestamp).getTime();
      return ts >= recordsCutoff;
    });
    const prunedSpatialEventsCount = initialSpatial - remainingSpatial.length;

    // 7. Prune Audit Logs (bounded, keeping at least 100 recent entries)
    const initialAudit = dataStore.auditLogs.length;
    const remainingAudit = dataStore.auditLogs.filter((log, idx) => {
      if (idx < 100) return true; // keep at least 100 most recent
      const ts = new Date(log.timestamp).getTime();
      return ts >= auditCutoff;
    });
    const prunedAuditLogsCount = initialAudit - remainingAudit.length;

    // Apply changes if not dryRun
    if (!dryRun) {
      dataStore.events = remainingEvents;
      dataStore.alerts = remainingAlerts;
      dataStore.incidents = remainingIncidents;
      dataStore.evidence = remainingEvidence;
      dataStore.anprRecords = remainingAnpr;
      dataStore.spatialEvents = remainingSpatial;
      dataStore.auditLogs = remainingAudit;

      // Safe file unlink for pruned evidence
      for (const uri of evidenceToDeleteFiles) {
        try {
          const filePath = uri.startsWith('file://') ? uri.replace('file://', '') : uri;
          if (fs.existsSync(filePath)) {
            fs.unlinkSync(filePath);
          }
        } catch (err) {
          logger.warn(`Retention: could not remove file ${uri}: ${String(err)}`);
        }
      }

      dataStore.logAudit(
        operatorCallsign,
        'RETENTION_PRUNE_EXECUTE',
        'SYSTEM',
        'RETENTION_ENGINE',
        '127.0.0.1',
        {
          prunedEventsCount,
          prunedAlertsCount,
          prunedIncidentsCount,
          prunedEvidenceCount,
          prunedAnprCount,
          prunedAuditLogsCount,
        },
        'SUCCESS'
      );
    }

    details.push(`Events: ${prunedEventsCount} pruned (kept ${remainingEvents.length})`);
    details.push(`Alerts: ${prunedAlertsCount} pruned (kept ${remainingAlerts.length})`);
    details.push(`Incidents: ${prunedIncidentsCount} closed incidents pruned (kept ${remainingIncidents.length}, active protected: ${activeIncidentIds.size})`);
    details.push(`Evidence: ${prunedEvidenceCount} items pruned (protected active incident evidence: ${protectedEvidenceCount})`);
    details.push(`ANPR: ${prunedAnprCount} pruned (kept ${remainingAnpr.length})`);
    details.push(`Audit Logs: ${prunedAuditLogsCount} pruned (kept ${remainingAudit.length})`);

    return {
      dryRun,
      executedAt: new Date().toISOString(),
      prunedEventsCount,
      prunedAlertsCount,
      prunedIncidentsCount,
      prunedAuditLogsCount,
      prunedEvidenceCount,
      prunedAnprCount,
      prunedSpatialEventsCount,
      retainedOpenIncidentsCount: activeIncidentIds.size,
      retainedEvidenceProtectedCount: protectedEvidenceCount,
      details,
    };
  }
}

export const retentionService = new RetentionService();
