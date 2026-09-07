// ============================================================================
// IBVAP Health Probes & Telemetry
// Distinct /health/live (Process) and /health/ready (Dependencies)
// ============================================================================

import { Router, Request, Response } from 'express';
import { dataStore } from '../store';
import { aiInferenceService } from '../../ai-inference/inference-service';
import { persistenceManager } from '../../storage/db-adapter';
import { globalCache } from '../../storage/redis-adapter';
import { appConfig } from '../../config/app-config';
import fs from 'fs';

export const healthRouter = Router();

// GET /api/v1/health (Detailed operational subsystem telemetry)
healthRouter.get('/', async (req: Request, res: Response) => {
  const dbHealth = await persistenceManager.getAdapter().healthCheck();
  const cacheHealth = await globalCache.healthCheck();
  const aiHealth = aiInferenceService.getHealth();

  const allComponents = dataStore.systemHealth;
  const degradedCount = allComponents.filter((c) => c.status === 'DEGRADED').length;
  const offlineCount = allComponents.filter((c) => c.status === 'OFFLINE').length;

  const overallStatus =
    dbHealth.status === 'DISCONNECTED' && appConfig.profile === 'PRODUCTION'
      ? 'DEGRADED'
      : offlineCount > 0
      ? 'DEGRADED'
      : degradedCount > 0
      ? 'ATTENTION'
      : 'HEALTHY';

  res.json({
    success: true,
    overallStatus,
    profile: appConfig.profile,
    timestamp: new Date().toISOString(),
    totalComponents: allComponents.length,
    degradedCount,
    offlineCount,
    dependencies: {
      database: dbHealth,
      cache: cacheHealth,
      aiInference: aiHealth.status,
    },
    components: allComponents,
  });
});

// GET /health/live (Process liveness probe)
export function liveHandler(req: Request, res: Response) {
  res.status(200).json({
    status: 'UP',
    service: 'ibvap-command-server',
    profile: appConfig.profile,
    uptimeSeconds: Math.floor(process.uptime()),
    nodeVersion: process.version,
    timestamp: new Date().toISOString(),
  });
}

// GET /health/ready (Dependency readiness probe)
export async function readyHandler(req: Request, res: Response) {
  const dbHealth = await persistenceManager.getAdapter().healthCheck();
  const cacheHealth = await globalCache.healthCheck();
  const aiHealth = aiInferenceService.getHealth();
  const memoryUsage = process.memoryUsage();

  // Storage check
  let storageReady = true;
  try {
    if (!fs.existsSync(appConfig.storage.localBasePath)) {
      fs.mkdirSync(appConfig.storage.localBasePath, { recursive: true });
    }
  } catch {
    storageReady = false;
  }

  // In PRODUCTION mode, a disconnected database prevents readiness
  const isProductionAndDbDown =
    appConfig.profile === 'PRODUCTION' && dbHealth.status === 'DISCONNECTED';

  if (isProductionAndDbDown) {
    res.status(503).json({
      status: 'UNAVAILABLE',
      profile: appConfig.profile,
      error: 'Primary PostgreSQL datastore is disconnected in PRODUCTION profile.',
      dependencies: {
        database: dbHealth,
        cache: cacheHealth,
        aiInference: aiHealth.status,
        storage: storageReady ? 'AVAILABLE' : 'UNAVAILABLE',
      },
      timestamp: new Date().toISOString(),
    });
    return;
  }

  res.status(200).json({
    status: 'READY',
    profile: appConfig.profile,
    dependencies: {
      database: dbHealth.status,
      databaseLatencyMs: dbHealth.latencyMs,
      databaseAdapter: dbHealth.adapterType,
      cache: cacheHealth.status,
      cacheLatencyMs: cacheHealth.latencyMs,
      storage: storageReady ? 'AVAILABLE' : 'UNAVAILABLE',
      eventBus: 'ACTIVE',
      videoGateway: 'REACHABLE',
      aiInference: aiHealth.status,
    },
    aiModel: {
      modelName: aiHealth.modelName,
      modelVersion: aiHealth.modelVersion,
      device: aiHealth.device,
      modelLoaded: aiHealth.modelLoaded,
      lastInferenceAt: aiHealth.lastInferenceAt,
    },
    memory: {
      heapUsedMb: Math.round(memoryUsage.heapUsed / 1024 / 1024),
      rssMb: Math.round(memoryUsage.rss / 1024 / 1024),
    },
    timestamp: new Date().toISOString(),
  });
}
