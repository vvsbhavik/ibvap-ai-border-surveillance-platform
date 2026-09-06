import { Router, Request, Response } from 'express';
import { dataStore } from '../store';
import { logger } from '../logger';
import { anprService } from '../../anpr/anpr-service';
import { faceService } from '../../face/face-service';

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
    targetType: (targetType || 'VEHICLE') as 'VEHICLE' | 'PERSON',
    targetIdentifier: targetIdentifier.toUpperCase().trim(),
    labelName,
    category: category || 'BORDER_HOTLIST',
    priority: priority || 'HIGH',
    notes: notes || '',
    addedByCallsign: operatorCallsign,
    isActive: true,
    createdAt: new Date().toISOString(),
  };

  dataStore.watchlists.unshift(entry);

  // Sync with domain services
  if (entry.targetType === 'VEHICLE') {
    anprService.addWatchlistEntry({
      plateNumber: entry.targetIdentifier,
      category: entry.category,
      labelName: entry.labelName,
      priority: entry.priority,
      notes: entry.notes,
      active: true,
    });
  } else if (entry.targetType === 'PERSON') {
    faceService.addWatchlistEntry({
      id: entry.id,
      displayName: entry.labelName,
      category: entry.category,
      priority: entry.priority as any,
      notes: entry.notes,
      status: 'ACTIVE',
      templateEmbedding: Array.from({ length: 128 }, (_, i) => Math.sin(i * 0.2 + 0.1) * 0.1),
    });
  }

  dataStore.logAudit(
    operatorCallsign,
    'CREATE_WATCHLIST_ENTRY',
    'WATCHLIST',
    entry.targetIdentifier,
    req.ip || '127.0.0.1',
    { category: entry.category, label: entry.labelName, targetType: entry.targetType }
  );

  logger.audit('WATCHLIST', `Added ${entry.targetIdentifier} to ${entry.category}`);
  res.json({ success: true, entry });
});

// PUT /api/v1/watchlists/:id
watchlistsRouter.put('/:id', (req: Request, res: Response) => {
  const { id } = req.params;
  const { labelName, category, priority, notes, operatorCallsign = 'SYS-ADMIN' } = req.body;

  const entry = dataStore.watchlists.find((w) => w.id === id);
  if (!entry) {
    res.status(404).json({ success: false, error: 'Watchlist entry not found' });
    return;
  }

  if (labelName) entry.labelName = labelName;
  if (category) entry.category = category;
  if (priority) entry.priority = priority;
  if (notes !== undefined) entry.notes = notes;

  dataStore.logAudit(
    operatorCallsign,
    'UPDATE_WATCHLIST_ENTRY',
    'WATCHLIST',
    entry.targetIdentifier,
    req.ip || '127.0.0.1',
    { category: entry.category, label: entry.labelName }
  );

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

// DELETE /api/v1/watchlists/:id
watchlistsRouter.delete('/:id', (req: Request, res: Response) => {
  const { operatorCallsign = 'SYS-ADMIN' } = req.body;
  const idx = dataStore.watchlists.findIndex((w) => w.id === req.params.id);
  if (idx === -1) {
    res.status(404).json({ success: false, error: 'Watchlist entry not found' });
    return;
  }

  const [removed] = dataStore.watchlists.splice(idx, 1);

  dataStore.logAudit(
    operatorCallsign,
    'DELETE_WATCHLIST_ENTRY',
    'WATCHLIST',
    removed.targetIdentifier,
    req.ip || '127.0.0.1',
    { targetType: removed.targetType, label: removed.labelName }
  );

  res.json({ success: true, removedId: removed.id });
});
