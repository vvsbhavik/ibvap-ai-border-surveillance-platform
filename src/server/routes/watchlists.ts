import { Router, Request, Response } from 'express';
import { dataStore } from '../store';
import { logger } from '../logger';

export const watchlistsRouter = Router();

// GET /api/v1/watchlists
watchlistsRouter.get('/', (req: Request, res: Response) => {
  res.json({
    success: true,
    total: dataStore.watchlists.length,
    watchlists: dataStore.watchlists,
  });
});

// POST /api/v1/watchlists
watchlistsRouter.post('/', (req: Request, res: Response) => {
  const { targetType, targetIdentifier, labelName, category, priority, notes, operatorCallsign = 'SYS-ADMIN' } = req.body;
  if (!targetIdentifier || !labelName) {
    res.status(400).json({ success: false, error: 'Target identifier and label name required' });
    return;
  }

  const entry = {
    id: `wl-${Date.now()}`,
    targetType: targetType || 'VEHICLE',
    targetIdentifier: targetIdentifier.toUpperCase(),
    labelName,
    category: category || 'BORDER_HOTLIST',
    priority: priority || 'HIGH',
    notes: notes || '',
    addedByCallsign: operatorCallsign,
    isActive: true,
    createdAt: new Date().toISOString(),
  };

  dataStore.watchlists.unshift(entry);
  dataStore.logAudit(
    operatorCallsign,
    'CREATE_WATCHLIST_ENTRY',
    'WATCHLIST',
    entry.targetIdentifier,
    req.ip || '127.0.0.1',
    { category: entry.category, label: entry.labelName }
  );

  logger.audit('WATCHLIST', `Added ${entry.targetIdentifier} to ${entry.category}`);
  res.json({ success: true, entry });
});

// PATCH /api/v1/watchlists/:id/toggle
watchlistsRouter.patch('/:id/toggle', (req: Request, res: Response) => {
  const { operatorCallsign = 'SYS-ADMIN' } = req.body;
  const entry = dataStore.watchlists.find((w) => w.id === req.params.id);
  if (!entry) {
    res.status(404).json({ success: false, error: 'Watchlist entry not found' });
    return;
  }

  entry.isActive = !entry.isActive;
  dataStore.logAudit(
    operatorCallsign,
    'TOGGLE_WATCHLIST_ENTRY',
    'WATCHLIST',
    entry.targetIdentifier,
    req.ip || '127.0.0.1',
    { isActive: entry.isActive }
  );

  res.json({ success: true, entry });
});
