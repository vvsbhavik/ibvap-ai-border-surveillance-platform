import { Router, Request, Response } from 'express';
import { edgeNodeService } from '../../edge/edge-service';

export const edgeRouter = Router();

// GET /api/v1/edge/nodes
edgeRouter.get('/nodes', (req: Request, res: Response) => {
  const nodes = edgeNodeService.getAllNodes();
  res.json({
    success: true,
    count: nodes.length,
    nodes,
  });
});

// GET /api/v1/edge/nodes/:id
edgeRouter.get('/nodes/:id', (req: Request, res: Response) => {
  const { id } = req.params;
  const node = edgeNodeService.getNode(id);
  if (!node) {
    res.status(404).json({ success: false, error: `Edge node [${id}] not found` });
    return;
  }
  res.json({
    success: true,
    node,
  });
});

// POST /api/v1/edge/nodes/:id/simulate-disconnect
edgeRouter.post('/nodes/:id/simulate-disconnect', (req: Request, res: Response) => {
  const { id } = req.params;
  const userCallsign = (req.headers['x-user-callsign'] as string) || 'TECH-OP-01';

  try {
    const node = edgeNodeService.simulateDisconnect(id, userCallsign);
    res.json({
      success: true,
      message: `Edge node [${id}] simulated offline; local buffer engaged.`,
      node,
    });
  } catch (err: any) {
    res.status(400).json({ success: false, error: err.message });
  }
});

// POST /api/v1/edge/nodes/:id/simulate-reconnect
edgeRouter.post('/nodes/:id/simulate-reconnect', async (req: Request, res: Response) => {
  const { id } = req.params;
  const userCallsign = (req.headers['x-user-callsign'] as string) || 'TECH-OP-01';

  try {
    const result = await edgeNodeService.simulateReconnectAndSync(id, userCallsign);
    res.json({
      success: true,
      message: `Edge node [${id}] reconnected and successfully synchronized.`,
      result,
    });
  } catch (err: any) {
    res.status(400).json({ success: false, error: err.message });
  }
});
