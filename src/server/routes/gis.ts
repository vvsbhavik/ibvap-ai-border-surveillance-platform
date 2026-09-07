import { Router, Request, Response } from 'express';
import { gisService } from '../../gis/gis-service';

export const gisRouter = Router();

// GET /api/v1/gis/context
// Comprehensive operational GIS context (cameras, sectors, zones, fences, incidents, alerts, topology, routes)
gisRouter.get('/context', (req: Request, res: Response) => {
  const context = gisService.getOperationalContext();
  res.json({
    success: true,
    data: context,
  });
});

// GET /api/v1/gis/sectors
gisRouter.get('/sectors', (req: Request, res: Response) => {
  const sectors = gisService.getSectorRegions();
  res.json({
    success: true,
    sectors,
  });
});

// GET /api/v1/gis/zones
gisRouter.get('/zones', (req: Request, res: Response) => {
  const zones = gisService.getZonePolygons();
  const fences = gisService.getVirtualFenceLines();
  res.json({
    success: true,
    zones,
    fences,
  });
});
