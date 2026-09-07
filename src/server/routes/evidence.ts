// ============================================================================
// IBVAP Evidence Management & Cryptographic Chain of Custody Router
// ============================================================================

import { Router, Request, Response } from 'express';
import { dataStore } from '../store';
import { logger } from '../logger';
import { evidenceVault } from '../../storage/evidence-vault';
import { InputValidator } from '../middleware/security';

export const evidenceRouter = Router();

// GET /api/v1/evidence
evidenceRouter.get('/', (req: Request, res: Response) => {
  const { incidentId, cameraId, limit, page } = req.query;
  let list = [...dataStore.evidence];

  if (incidentId && typeof incidentId === 'string') {
    list = list.filter((e) => e.incidentId === incidentId || e.incidentNumber === incidentId);
  }
  if (cameraId && typeof cameraId === 'string') {
    list = list.filter((e) => e.cameraId === cameraId || e.cameraIdentifier === cameraId);
  }

  const pagination = InputValidator.sanitizePagination(page, limit, 50, 100);
  const total = list.length;
  const paginatedList = list.slice(pagination.offset, pagination.offset + pagination.limit);

  res.json({
    success: true,
    total,
    page: pagination.page,
    limit: pagination.limit,
    evidence: paginatedList,
  });
});

// GET /api/v1/evidence/:id
evidenceRouter.get('/:id', (req: Request, res: Response) => {
  const item = dataStore.evidence.find((e) => e.id === req.params.id);
  if (!item) {
    res.status(404).json({ success: false, error: 'Evidence item not found', code: 'NOT_FOUND' });
    return;
  }

  res.json({
    success: true,
    evidence: item,
  });
});

// POST /api/v1/evidence (Capture / Ingest new evidence artifact)
evidenceRouter.post('/', async (req: Request, res: Response) => {
  try {
    const {
      incidentId,
      incidentNumber,
      cameraId = 'cam-01',
      cameraIdentifier = 'CAM-01',
      trackId,
      title = 'Automated Optical Surveillance Capture',
      mediaType = 'SNAPSHOT_IMAGE',
      sourceMode = 'SIMULATION',
      operatorCallsign = 'FORENSIC-01',
      rawBase64,
    } = req.body;

    const dataBuffer = rawBase64
      ? Buffer.from(rawBase64, 'base64')
      : evidenceVault.createDemoSnapshotBuffer(`${cameraIdentifier}_${Date.now()}`);

    const newEvidence = await evidenceVault.storeEvidence({
      incidentId,
      incidentNumber,
      cameraId,
      cameraIdentifier,
      trackId,
      title,
      mediaType,
      dataBuffer,
      sourceMode,
      operatorCallsign,
    });

    dataStore.evidence.unshift(newEvidence);

    // If linked to an incident, increment incident evidenceCount
    if (incidentId) {
      const inc = dataStore.incidents.find((i) => i.id === incidentId || i.incidentNumber === incidentId);
      if (inc) {
        inc.evidenceCount = (inc.evidenceCount || 0) + 1;
      }
    }

    dataStore.logAudit(
      operatorCallsign,
      'STORE_EVIDENCE_ARTIFACT',
      'EVIDENCE',
      newEvidence.id,
      req.ip || '127.0.0.1',
      {
        sha256: newEvidence.sha256Checksum,
        sizeBytes: newEvidence.fileSizeBytes,
        sourceMode,
        cameraId,
      }
    );

    logger.info(`New evidence artifact stored: ${newEvidence.id} (SHA-256: ${newEvidence.sha256Checksum})`);

    res.status(201).json({
      success: true,
      evidence: newEvidence,
    });
  } catch (err) {
    logger.error('Failed to store evidence artifact', { error: String(err) });
    res.status(500).json({
      success: false,
      error: 'Failed to persist evidence artifact to storage vault.',
      code: 'STORAGE_ERROR',
    });
  }
});

// POST /api/v1/evidence/:id/verify
evidenceRouter.post('/:id/verify', async (req: Request, res: Response) => {
  const { operatorCallsign = 'FORENSIC-02' } = req.body;
  const item = dataStore.evidence.find((e) => e.id === req.params.id);
  if (!item) {
    res.status(404).json({ success: false, error: 'Evidence item not found', code: 'NOT_FOUND' });
    return;
  }

  const verification = await evidenceVault.verifyIntegrity(
    item.id,
    item.sha256Checksum,
    item.storageReferenceUri
  );

  item.isVerified = verification.verified;

  dataStore.logAudit(
    operatorCallsign,
    'VERIFY_EVIDENCE_CHECKSUM',
    'EVIDENCE',
    item.id,
    req.ip || '127.0.0.1',
    {
      expectedSha256: verification.expectedSha256,
      calculatedSha256: verification.calculatedSha256,
      verified: verification.verified,
    },
    verification.verified ? 'SUCCESS' : 'FAILURE'
  );

  logger.info(
    `Evidence ${item.id} verification result: ${verification.verified ? 'AUTHENTIC' : 'FAILED'} by ${operatorCallsign}`
  );

  res.json({
    success: true,
    verified: verification.verified,
    sha256Checksum: item.sha256Checksum,
    calculatedSha256: verification.calculatedSha256,
    verifiedAt: verification.verifiedAt,
    message: verification.message,
    evidence: item,
  });
});

// POST /api/v1/evidence/:id/export
evidenceRouter.post('/:id/export', async (req: Request, res: Response) => {
  const { operatorCallsign = 'FORENSIC-02', purpose = 'JUDICIAL_DISCLOSURE' } = req.body;
  const item = dataStore.evidence.find((e) => e.id === req.params.id);
  if (!item) {
    res.status(404).json({ success: false, error: 'Evidence item not found', code: 'NOT_FOUND' });
    return;
  }

  const manifest = await evidenceVault.generateExportManifest(item, operatorCallsign, purpose);
  item.chainOfCustodyCount = manifest.chainOfCustodyCount;

  dataStore.logAudit(
    operatorCallsign,
    'EXPORT_EVIDENCE_PACKAGE',
    'EVIDENCE',
    item.id,
    req.ip || '127.0.0.1',
    {
      exportPackageId: manifest.exportPackageId,
      purpose,
      verificationStatus: manifest.verificationStatus,
    }
  );

  res.json({ success: true, manifest, evidence: item });
});
