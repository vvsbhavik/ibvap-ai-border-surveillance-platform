// ============================================================================
// IBVAP Simulation & Digital Twin Scenario Router
// Protected reset safeguards production operational records
// ============================================================================

import { Router, Request, Response } from 'express';
import { digitalTwinService } from '../../simulation/digital-twin-service';
import { SimulationScenarioId } from '../../simulation/types';
import { appConfig } from '../../config/app-config';
import { dataStore } from '../store';

export const simulationRouter = Router();

// GET /api/v1/simulation/scenarios
simulationRouter.get('/scenarios', (_req: Request, res: Response) => {
  const scenarios = digitalTwinService.getScenarios();
  res.json({
    success: true,
    count: scenarios.length,
    scenarios,
  });
});

// GET /api/v1/simulation/state
simulationRouter.get('/state', (_req: Request, res: Response) => {
  const state = digitalTwinService.getState();
  res.json({
    success: true,
    state,
  });
});

// POST /api/v1/simulation/start
simulationRouter.post('/start', (req: Request, res: Response) => {
  const { scenarioId } = req.body;
  const userCallsign = (req.headers['x-user-callsign'] as string) || 'COMMANDER-1';

  if (!scenarioId) {
    res.status(400).json({ success: false, error: 'scenarioId is required' });
    return;
  }

  try {
    const state = digitalTwinService.startScenario(scenarioId as SimulationScenarioId, userCallsign);
    res.json({
      success: true,
      message: `Scenario [${scenarioId}] started`,
      state,
    });
  } catch (err: any) {
    res.status(400).json({ success: false, error: err.message });
  }
});

// POST /api/v1/simulation/pause
simulationRouter.post('/pause', (_req: Request, res: Response) => {
  const state = digitalTwinService.pauseScenario();
  res.json({
    success: true,
    state,
  });
});

// POST /api/v1/simulation/resume
simulationRouter.post('/resume', (_req: Request, res: Response) => {
  const state = digitalTwinService.resumeScenario();
  res.json({
    success: true,
    state,
  });
});

// POST /api/v1/simulation/speed
simulationRouter.post('/speed', (req: Request, res: Response) => {
  const { multiplier } = req.body;
  const state = digitalTwinService.setSpeed(Number(multiplier) || 1);
  res.json({
    success: true,
    state,
  });
});

// POST /api/v1/simulation/reset
// Safe DEMO reset: resets simulation providers and synthetic states without deleting production records
simulationRouter.post('/reset', (req: Request, res: Response) => {
  const userCallsign = (req.headers['x-user-callsign'] as string) || 'COMMANDER-1';

  if (appConfig.profile === 'PRODUCTION') {
    // In PRODUCTION, strictly protect live database records
    const state = digitalTwinService.resetSimulation(userCallsign);
    dataStore.logAudit(
      userCallsign,
      'SIMULATION_RESET_PRODUCTION',
      'SIMULATION',
      'DIGITAL_TWIN',
      req.ip || '127.0.0.1',
      { notice: 'Digital twin scenario reset. Authoritative production records preserved.' },
      'SUCCESS'
    );
    res.json({
      success: true,
      profile: 'PRODUCTION',
      message: 'Simulation actors and scenarios reset. Authoritative operational records strictly preserved.',
      state,
    });
    return;
  }

  // DEMO profile reset
  const state = digitalTwinService.resetSimulation(userCallsign);
  dataStore.logAudit(
    userCallsign,
    'SIMULATION_RESET_DEMO',
    'SIMULATION',
    'DIGITAL_TWIN',
    req.ip || '127.0.0.1',
    { notice: 'Demo simulation loop reset' },
    'SUCCESS'
  );

  res.json({
    success: true,
    profile: 'DEMO',
    message: 'Simulation environment safely reset; synthetic scenario restarted.',
    state,
  });
});
