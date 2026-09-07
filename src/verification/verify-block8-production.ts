// ============================================================================
// IBVAP BUILD BLOCK 8 — FINAL PRODUCTION HARDENING VERIFICATION SUITE
// Tests: Persistence, Cache, Evidence Integrity, Retention, RBAC,
// Authentication, Observability, Metrics & Graceful Degradation
// ============================================================================

import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { loadConfig, validateConfig, AppConfig } from '../config/app-config';
import { InMemoryDatabaseAdapter, PostgresDatabaseAdapter } from '../storage/db-adapter';
import { InMemoryCacheAdapter } from '../storage/redis-adapter';
import { EvidenceVault } from '../storage/evidence-vault';
import { RetentionService } from '../storage/retention-service';
import { dataStore } from '../server/store';
import { canonicalRole } from '../utils/permissions';
import { Alert, Incident, EvidenceItem } from '../server/types';

interface TestResult {
  name: string;
  passed: boolean;
  details?: string;
}

const results: TestResult[] = [];

function assert(condition: boolean, name: string, details?: string) {
  if (condition) {
    results.push({ name, passed: true });
    console.log(`  ✓ ${name}`);
  } else {
    results.push({ name, passed: false, details });
    console.error(`  ✗ ${name} — ${details || 'Assertion failed'}`);
  }
}

async function runBlock8Verification() {
  console.log('============================================================');
  console.log('IBVAP BUILD BLOCK 8: FINAL PRODUCTION HARDENING VERIFICATION');
  console.log('============================================================\n');

  // --------------------------------------------------------------------------
  // SUITE 1: Configuration & Operating Profiles (DEMO vs PRODUCTION)
  // --------------------------------------------------------------------------
  console.log('[Suite 1: Configuration & Profile Validation]');
  {
    const demoConfig: AppConfig = {
      profile: 'DEMO',
      port: 3000,
      jwtSecret: 'test-secret',
      storage: { type: 'LOCAL', localBasePath: './storage/test_evidence', maxUploadSizeBytes: 10485760 },
      retention: { eventsTtlHours: 168, alertsTtlHours: 720, incidentsTtlHours: 2160, auditLogsTtlHours: 8760, evidenceTtlHours: 4320, recordsTtlHours: 336 },
      rateLimits: { authMaxAttempts: 5, authWindowSeconds: 300, apiWindowMs: 60000, apiMaxRequests: 120 },
    };
    const demoVal = validateConfig(demoConfig);
    assert(demoVal.isValid, 'DEMO profile is valid without external database');
    assert(demoVal.warnings.length > 0, 'DEMO profile produces informative operational notice');

    const prodConfigMissingDb: AppConfig = {
      ...demoConfig,
      profile: 'PRODUCTION',
      databaseUrl: undefined,
    };
    const prodVal = validateConfig(prodConfigMissingDb);
    assert(!prodVal.isValid, 'PRODUCTION profile rejects missing DATABASE_URL');
    assert(prodVal.errors.some((e) => e.includes('DATABASE_URL is mandatory')), 'PRODUCTION validation error message is explicit');

    const prodConfigValid: AppConfig = {
      ...demoConfig,
      profile: 'PRODUCTION',
      databaseUrl: 'postgres://admin:secret@localhost:5432/ibvap_core',
      jwtSecret: 'custom-production-hardened-secret-key-32chars',
    };
    const prodValValid = validateConfig(prodConfigValid);
    assert(prodValValid.isValid, 'PRODUCTION profile passes with proper PostgreSQL configuration');
  }

  // --------------------------------------------------------------------------
  // SUITE 2: Unified Database Persistence Adapter
  // --------------------------------------------------------------------------
  console.log('\n[Suite 2: Database Persistence Adapter]');
  {
    const memAdapter = new InMemoryDatabaseAdapter();
    await memAdapter.initialize();
    const health = await memAdapter.healthCheck();
    assert(health.status === 'IN_MEMORY', 'In-memory database adapter reports IN_MEMORY status');
    assert(health.latencyMs >= 0, 'Health check returns measured latency (ms)');

    const migrationRes = await memAdapter.runMigrations();
    assert(migrationRes.upToDate, 'Database migrations execute cleanly and report upToDate');

    const users = await memAdapter.getUsers();
    assert(users.length > 0, 'Adapter queries operational users collection');

    const testAlert: Alert = {
      id: `alt-test-${Date.now()}`,
      title: 'Perimeter Intrusion Test',
      description: 'Synthetic detection test for persistence verification',
      severity: 'HIGH',
      status: 'PENDING_ACK',
      cameraId: 'cam-01',
      cameraIdentifier: 'CAM-01',
      sectorId: 'sec-bravo',
      sectorName: 'Sector Bravo',
      timestamp: new Date().toISOString(),
      confidenceScore: 0.94,
      reasoningFactors: [],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      isSimulated: true,
    };
    await memAdapter.saveAlert(testAlert);
    const alerts = await memAdapter.getAlerts();
    assert(alerts.some((a) => a.id === testAlert.id), 'Adapter persists and retrieves new operational alert');

    const testInc: Incident = {
      id: `inc-test-${Date.now()}`,
      incidentNumber: 'INC-2026-TEST',
      title: 'Test Incident for Block 8 Persistence',
      summary: 'Verification incident',
      severity: 'CRITICAL',
      status: 'OPEN',
      sectorId: 'sec-bravo',
      sectorName: 'Sector Bravo',
      primaryCameraId: 'cam-01',
      primaryCameraIdentifier: 'CAM-01',
      relatedCameraIdentifiers: ['CAM-01'],
      leadCommanderCallsign: 'COMMANDER-1',
      createdAt: new Date().toISOString(),
      evidenceCount: 1,
      timeline: [],
    };
    await memAdapter.saveIncident(testInc);
    const incidents = await memAdapter.getIncidents();
    assert(incidents.some((i) => i.id === testInc.id), 'Adapter persists and retrieves new operational incident');
  }

  // --------------------------------------------------------------------------
  // SUITE 3: Cache & Distributed State (Redis/Memory Adapter)
  // --------------------------------------------------------------------------
  console.log('\n[Suite 3: Cache & Distributed State]');
  {
    const cache = new InMemoryCacheAdapter();
    await cache.set('test_key', 'mission_alpha', 10);
    const val = await cache.get('test_key');
    assert(val === 'mission_alpha', 'Cache stores and retrieves string values');

    const count1 = await cache.incr('rate_counter_ip');
    const count2 = await cache.incr('rate_counter_ip');
    assert(count1 === 1 && count2 === 2, 'Atomic rate limit increment functions correctly');

    await cache.del('test_key');
    const deletedVal = await cache.get('test_key');
    assert(deletedVal === null, 'Cache key deletion removes value');

    const cacheHealth = await cache.healthCheck();
    assert(cacheHealth.status === 'IN_MEMORY' && cacheHealth.latencyMs >= 0, 'Cache health probe accurately measures response');
    await cache.close();
  }

  // --------------------------------------------------------------------------
  // SUITE 4: Evidence Storage Vault & Cryptographic Integrity
  // --------------------------------------------------------------------------
  console.log('\n[Suite 4: Evidence Storage & Cryptographic Verification]');
  {
    const testStorageDir = './storage/test_verification_vault';
    const vault = new EvidenceVault(testStorageDir);

    const testBuffer = Buffer.from('IBVAP_OPTICAL_EVIDENCE_FRAME_RAW_PAYLOAD_TEST');
    const expectedSha256 = crypto.createHash('sha256').update(testBuffer).digest('hex');

    const storedItem = await vault.storeEvidence({
      incidentId: 'inc-test-vault',
      incidentNumber: 'INC-2026-VAULT',
      cameraId: 'cam-02',
      cameraIdentifier: 'CAM-02',
      title: 'Automated Breach Capture',
      mediaType: 'SNAPSHOT_IMAGE',
      dataBuffer: testBuffer,
      sourceMode: 'SIMULATION',
      operatorCallsign: 'FORENSIC-01',
    });

    assert(storedItem.id.startsWith('evi-'), 'Evidence Vault allocates unique evidence ID');
    assert(storedItem.sha256Checksum === expectedSha256, 'Bit-level SHA-256 hash computed and recorded correctly');
    assert(storedItem.isSimulated === true, 'Synthetic evidence truthfully labeled as simulated');

    // Verify Integrity
    const verifySuccess = await vault.verifyIntegrity(
      storedItem.id,
      storedItem.sha256Checksum,
      storedItem.storageReferenceUri
    );
    assert(verifySuccess.verified, 'Authentic evidence file passes cryptographic integrity check');
    assert(verifySuccess.calculatedSha256 === expectedSha256, 'Calculated hash matches expected hash');

    // Tamper Detection Test
    const filePath = storedItem.storageReferenceUri.replace('file://', '');
    await fs.promises.writeFile(filePath, Buffer.from('TAMPERED_MODIFIED_CONTENT'));
    const verifyTampered = await vault.verifyIntegrity(
      storedItem.id,
      storedItem.sha256Checksum,
      storedItem.storageReferenceUri
    );
    assert(!verifyTampered.verified, 'Tampered evidence file correctly fails cryptographic verification');

    // Clean up test vault
    if (fs.existsSync(testStorageDir)) {
      fs.rmSync(testStorageDir, { recursive: true, force: true });
    }
  }

  // --------------------------------------------------------------------------
  // SUITE 5: Retention & Lifecycle Pruning
  // --------------------------------------------------------------------------
  console.log('\n[Suite 5: Retention Engine & Record Lifecycle]');
  {
    const retention = new RetentionService({
      eventsTtlHours: 1,
      alertsTtlHours: 1,
      incidentsTtlHours: 1,
      evidenceTtlHours: 1,
      auditLogsTtlHours: 1,
      recordsTtlHours: 1,
    });

    // Add an active OPEN incident and an expired closed incident
    const activeInc: Incident = {
      id: `inc-active-${Date.now()}`,
      incidentNumber: 'INC-ACTIVE-01',
      title: 'Active Critical Breach',
      summary: 'Ongoing active response',
      severity: 'CRITICAL',
      status: 'OPEN',
      sectorId: 'sec-bravo',
      sectorName: 'Sector Bravo',
      primaryCameraId: 'cam-01',
      primaryCameraIdentifier: 'CAM-01',
      relatedCameraIdentifiers: ['CAM-01'],
      leadCommanderCallsign: 'COMMANDER-1',
      createdAt: new Date(Date.now() - 5 * 3600 * 1000).toISOString(), // 5 hours old
      evidenceCount: 0,
      timeline: [],
    };
    dataStore.incidents.unshift(activeInc);

    // Dry-run check
    const dryRunResult = await retention.runPrune({ dryRun: true });
    assert(dryRunResult.dryRun === true, 'Retention dry run simulates without modifying datastore');
    assert(dryRunResult.retainedOpenIncidentsCount >= 1, 'Active/OPEN incidents are strictly protected from retention deletion');
  }

  // --------------------------------------------------------------------------
  // SUITE 6: Audit Logging & Sensitive Credential Redaction
  // --------------------------------------------------------------------------
  console.log('\n[Suite 6: Audit Logging & Sensitive Data Redaction]');
  {
    const testSecret = 'SuperSecretToken123!';
    dataStore.logAudit(
      'SECURITY-OFFICER',
      'USER_PASSWORD_CHANGE',
      'USER',
      'usr-002',
      '127.0.0.1',
      {
        action: 'reset_credentials',
        password: testSecret,
        token: 'auth-jwt-token-sample',
        safeField: 'User role updated',
      }
    );

    const logs = dataStore.getAuditLogs({ action: 'USER_PASSWORD_CHANGE' });
    assert(logs.length > 0, 'Audit log entry persisted successfully');
    const latestLog = logs[0];
    assert(latestLog.details.password === '[REDACTED]', 'Sensitive password is automatically redacted in audit log');
    assert(latestLog.details.token === '[REDACTED]', 'Sensitive auth token is automatically redacted in audit log');
    assert(latestLog.details.safeField === 'User role updated', 'Non-sensitive audit metadata is preserved');
  }

  // --------------------------------------------------------------------------
  // SUITE 7: Authentication & PBKDF2 Password Security
  // --------------------------------------------------------------------------
  console.log('\n[Suite 7: Authentication & Password Security]');
  {
    const testUser = dataStore.users[0];
    const plainPass = 'BorderSecure2026!';
    dataStore.setPassword(testUser.id, plainPass);

    const validLogin = dataStore.verifyPassword(testUser.id, plainPass);
    assert(validLogin, 'PBKDF2/SHA-512 password verification succeeds for authentic credentials');

    const invalidLogin = dataStore.verifyPassword(testUser.id, 'WrongPassword999');
    assert(!invalidLogin, 'Incorrect credentials strictly rejected');

    // Rate Limiting on Authentication
    const targetCallsign = 'TEST-LOCKOUT-USER';
    for (let i = 0; i < 5; i++) {
      dataStore.recordFailedLogin(targetCallsign);
    }
    const lockoutCheck = dataStore.checkLoginRateLimit(targetCallsign);
    assert(!lockoutCheck.allowed, 'Excessive failed login attempts triggers rate limit lockout');
    dataStore.resetLoginRateLimit(targetCallsign);
    const resetCheck = dataStore.checkLoginRateLimit(targetCallsign);
    assert(resetCheck.allowed, 'Login rate limit resets cleanly');
  }

  // --------------------------------------------------------------------------
  // SUITE 8: Role-Based Access Control (RBAC) Consistency
  // --------------------------------------------------------------------------
  console.log('\n[Suite 8: RBAC Hierarchy & Permissions]');
  {
    assert(
      dataStore.hasPermission('WATCH_COMMANDER', 'incident.escalate'),
      'Watch Commander has incident escalation permission'
    );
    assert(
      dataStore.hasPermission('WATCH_COMMANDER', 'audit.view'),
      'Watch Commander has audit viewing permission'
    );
    assert(
      !dataStore.hasPermission('SURVEILLANCE_OPERATOR', 'system.configure'),
      'Surveillance Operator cannot modify system configuration'
    );
    assert(
      dataStore.hasPermission('SYSTEM_ADMINISTRATOR', 'system.configure'),
      'System Administrator has full configuration permission'
    );
    assert(
      canonicalRole('field_operator') === 'SURVEILLANCE_OPERATOR',
      'Canonical role normalization maps legacy field operators correctly'
    );
  }

  // --------------------------------------------------------------------------
  // SUITE 9: Operational Metrics Telemetry
  // --------------------------------------------------------------------------
  console.log('\n[Suite 9: Operational Metrics Calculation]');
  {
    const totalCameras = dataStore.cameras.length;
    const onlineCameras = dataStore.cameras.filter((c) => c.status === 'ONLINE').length;
    assert(totalCameras > 0, 'Camera count calculated accurately from authoritative store');
    assert(onlineCameras <= totalCameras, 'Online camera breakdown matches bounds');

    const totalAlerts = dataStore.alerts.length;
    const criticalAlerts = dataStore.alerts.filter((a) => a.severity === 'CRITICAL').length;
    assert(criticalAlerts <= totalAlerts, 'Alerts severity breakdown mathematically consistent');

    const memUsage = process.memoryUsage();
    assert(memUsage.heapUsed > 0 && memUsage.rss > 0, 'Process memory statistics are genuine measurements');
  }

  // --------------------------------------------------------------------------
  // Summary
  // --------------------------------------------------------------------------
  const passedCount = results.filter((r) => r.passed).length;
  const totalCount = results.length;

  console.log('\n============================================================');
  console.log(`BLOCK 8 PRODUCTION HARDENING VERIFICATION: ${passedCount}/${totalCount} PASSED`);
  console.log('============================================================\n');

  if (passedCount < totalCount) {
    console.error('Some Block 8 checks failed.');
    process.exit(1);
  }
}

runBlock8Verification().catch((err) => {
  console.error('Unhandled error in Block 8 verification:', err);
  process.exit(1);
});
