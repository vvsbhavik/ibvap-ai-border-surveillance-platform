import { Router, Response } from 'express';
import { dataStore } from '../store';
import { authenticate, AuthenticatedRequest, requirePermission } from '../middleware/auth';

export const systemRouter = Router();

systemRouter.use(authenticate);

// GET /api/v1/system/audit-logs
systemRouter.get('/audit-logs', requirePermission('audit.view'), (req: AuthenticatedRequest, res: Response) => {
  const {
    limit = 100,
    offset = 0,
    userCallsign,
    action,
    resourceType,
    result,
    startDate,
    endDate,
    search,
  } = req.query;

  let logs = [...dataStore.auditLogs];

  // Operator callsign filter
  if (userCallsign && typeof userCallsign === 'string' && userCallsign.trim()) {
    const q = userCallsign.trim().toUpperCase();
    logs = logs.filter((l) => l.userCallsign.toUpperCase() === q);
  }

  // Action filter
  if (action && typeof action === 'string' && action.trim()) {
    const q = action.trim().toUpperCase();
    logs = logs.filter((l) => l.action.toUpperCase().includes(q));
  }

  // Resource type filter
  if (resourceType && typeof resourceType === 'string' && resourceType.trim()) {
    const q = resourceType.trim().toUpperCase();
    logs = logs.filter((l) => l.resourceType.toUpperCase() === q);
  }

  // Result filter (SUCCESS, FAILURE, DENIED)
  if (result && typeof result === 'string' && result.trim()) {
    const q = result.trim().toUpperCase();
    logs = logs.filter((l) => (l.result || 'SUCCESS').toUpperCase() === q);
  }

  // Date range filters
  if (startDate && typeof startDate === 'string') {
    const startMs = new Date(startDate).getTime();
    if (!isNaN(startMs)) {
      logs = logs.filter((l) => new Date(l.timestamp).getTime() >= startMs);
    }
  }

  if (endDate && typeof endDate === 'string') {
    const endMs = new Date(endDate).getTime();
    if (!isNaN(endMs)) {
      logs = logs.filter((l) => new Date(l.timestamp).getTime() <= endMs);
    }
  }

  // Generic text search across action, callsign, resourceId, details
  if (search && typeof search === 'string' && search.trim()) {
    const q = search.trim().toLowerCase();
    logs = logs.filter(
      (l) =>
        l.userCallsign.toLowerCase().includes(q) ||
        l.action.toLowerCase().includes(q) ||
        l.resourceId.toLowerCase().includes(q) ||
        JSON.stringify(l.details).toLowerCase().includes(q)
    );
  }

  const total = logs.length;
  const numLimit = Math.min(Number(limit) || 100, 500);
  const numOffset = Math.max(Number(offset) || 0, 0);
  const paginated = logs.slice(numOffset, numOffset + numLimit);

  return res.json({
    success: true,
    total,
    offset: numOffset,
    limit: numLimit,
    logs: paginated,
  });
});

// POST /api/v1/system/audit-logs/export (Export audit logs with integrity proof)
systemRouter.post('/audit-logs/export', requirePermission('audit.view'), (req: AuthenticatedRequest, res: Response) => {
  const clientIp = (req.headers['x-forwarded-for'] as string) || req.socket.remoteAddress || '127.0.0.1';
  const logsToExport = [...dataStore.auditLogs];

  dataStore.logAudit(
    req.user?.callsign || 'SYSTEM',
    'AUDIT_LOGS_EXPORT',
    'SYSTEM',
    'AUDIT_VAULT',
    clientIp,
    { totalRecords: logsToExport.length },
    'SUCCESS',
    req.user?.role
  );

  return res.json({
    success: true,
    exportedAt: new Date().toISOString(),
    operator: req.user?.callsign,
    totalRecords: logsToExport.length,
    logs: logsToExport,
  });
});

// System Platform Configuration State
let systemPlatformConfig = {
  systemName: 'IBVAP Intelligent Border Video Analytics Platform',
  version: '2.4.0',
  environment: 'production',
  features: {
    aiCopilot: true,
    gisMapping: true,
    anprLogging: true,
    chainOfCustodyAudit: true,
    simulationEngine: true,
    strictRbac: true,
  },
  retentionDays: 90,
  activeJurisdiction: 'Sector 04 North Command — Eagle Pass Buffer',
  authSettings: {
    sessionTimeoutMinutes: 480,
    maxLoginAttempts: 5,
    lockoutDurationMinutes: 5,
    requireStrongPassword: true,
  },
};

// GET /api/v1/system/config
systemRouter.get('/config', (_req: AuthenticatedRequest, res: Response) => {
  return res.json({
    success: true,
    ...systemPlatformConfig,
  });
});

// PUT /api/v1/system/config
systemRouter.put('/config', requirePermission('system.configure'), (req: AuthenticatedRequest, res: Response) => {
  const clientIp = (req.headers['x-forwarded-for'] as string) || req.socket.remoteAddress || '127.0.0.1';
  const updates = req.body;

  systemPlatformConfig = {
    ...systemPlatformConfig,
    ...updates,
    features: {
      ...systemPlatformConfig.features,
      ...(updates.features || {}),
    },
    authSettings: {
      ...systemPlatformConfig.authSettings,
      ...(updates.authSettings || {}),
    },
  };

  dataStore.logAudit(
    req.user?.callsign || 'SYSTEM',
    'SYSTEM_CONFIG_UPDATE',
    'SYSTEM',
    'GLOBAL_CONFIG',
    clientIp,
    { updatedFields: Object.keys(updates) },
    'SUCCESS',
    req.user?.role
  );

  return res.json({
    success: true,
    message: 'Platform configuration updated successfully.',
    config: systemPlatformConfig,
  });
});

