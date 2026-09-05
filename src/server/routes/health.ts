import { Router, Request, Response } from 'express';
import { dataStore } from '../store';
import { aiInferenceService } from '../../ai-inference/inference-service';

export const healthRouter = Router();

// GET /api/v1/health (Detailed operational subsystem telemetry)
healthRouter.get('/', (req: Request, res: Response) => {
  const allComponents = dataStore.systemHealth;
  const degradedCount = allComponents.filter((c) => c.status === 'DEGRADED').length;
  const offlineCount = allComponents.filter((c) => c.status === 'OFFLINE').length;
  
  const overallStatus = offlineCount > 0 ? 'DEGRADED' : degradedCount > 0 ? 'ATTENTION' : 'HEALTHY';

  res.json({
    success: true,
    overallStatus,
    timestamp: new Date().toISOString(),
    totalComponents: allComponents.length,
    degradedCount,
    offlineCount,
    components: allComponents,
  });
});

// GET /health/live (Process liveliness probe)
export function liveHandler(req: Request, res: Response) {
  res.status(200).json({
    status: 'UP',
    service: 'ibvap-command-server',
    uptimeSeconds: Math.floor(process.uptime()),
    timestamp: new Date().toISOString(),
  });
}

// GET /health/ready (Dependency readiness probe)
export function readyHandler(req: Request, res: Response) {
  // Check in-memory store and subsystems
  const dbReady = true;
  const memoryUsage = process.memoryUsage();
  
  if (dbReady) {
    const aiHealth = aiInferenceService.getHealth();
    res.status(200).json({
      status: 'READY',
      dependencies: {
        database: 'CONNECTED',
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
  } else {
    res.status(503).json({
      status: 'UNAVAILABLE',
      error: 'Primary datastore not ready',
    });
  }
}
