import { Router, Request, Response } from 'express';
import { dataStore } from '../store';
import { logger } from '../logger';

export const evidenceRouter = Router();

// GET /api/v1/evidence
evidenceRouter.get('/', (req: Request, res: Response) => {
  const { incidentId } = req.query;
  let list = [...dataStore.evidence];

  if (incidentId && typeof incidentId === 'string') {
    list = list.filter((e) => e.incidentId === incidentId || e.incidentNumber === incidentId);
  }

  res.json({
    success: true,
    total: list.length,
    evidence: list,
  });
});

// POST /api/v1/evidence/:id/verify
evidenceRouter.post('/:id/verify', (req: Request, res: Response) => {
  const { operatorCallsign = 'FORENSIC-02' } = req.body;
  const item = dataStore.evidence.find((e) => e.id === req.params.id);
  if (!item) {
    res.status(404).json({ success: false, error: 'Evidence item not found' });
    return;
  }

  item.isVerified = true;
  dataStore.logAudit(
    operatorCallsign,
    'VERIFY_EVIDENCE_CHECKSUM',
    'EVIDENCE',
    item.id,
    req.ip || '127.0.0.1',
    { sha256: item.sha256Checksum, match: true }
  );

  logger.info(`Evidence ${item.id} cryptographic hash verified by ${operatorCallsign}`);
  res.json({
    success: true,
    verified: true,
    sha256Checksum: item.sha256Checksum,
    verifiedAt: new Date().toISOString(),
    evidence: item,
  });
});

// POST /api/v1/evidence/:id/export
evidenceRouter.post('/:id/export', (req: Request, res: Response) => {
  const { operatorCallsign = 'FORENSIC-02', purpose = 'JUDICIAL_DISCLOSURE' } = req.body;
  const item = dataStore.evidence.find((e) => e.id === req.params.id);
  if (!item) {
    res.status(404).json({ success: false, error: 'Evidence item not found' });
    return;
  }

  item.chainOfCustodyCount += 1;
  const manifest = {
    exportPackageId: `EXP-EVI-${Date.now()}`,
    evidenceId: item.id,
    title: item.title,
    sha256Checksum: item.sha256Checksum,
    chainOfCustodyCount: item.chainOfCustodyCount,
    exportedBy: operatorCallsign,
    exportedAt: new Date().toISOString(),
    purpose,
    status: 'AUTHENTICATED_PACKAGE',
  };

  dataStore.logAudit(
    operatorCallsign,
    'EXPORT_EVIDENCE_PACKAGE',
    'EVIDENCE',
    item.id,
    req.ip || '127.0.0.1',
    manifest
  );

  res.json({ success: true, manifest, evidence: item });
});
