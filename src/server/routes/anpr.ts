import { Router, Request, Response } from 'express';
import { dataStore } from '../store';

export const anprRouter = Router();

// GET /api/v1/anpr
anprRouter.get('/', (req: Request, res: Response) => {
  const { search, watchlistOnly } = req.query;
  let list = [...dataStore.anprRecords];

  if (search && typeof search === 'string') {
    const q = search.toLowerCase();
    list = list.filter((r) => r.plateNumber.toLowerCase().includes(q) || r.vehicleType.toLowerCase().includes(q));
  }
  if (watchlistOnly === 'true') {
    list = list.filter((r) => r.isWatchlistMatch);
  }

  res.json({
    success: true,
    total: list.length,
    records: list,
  });
});
