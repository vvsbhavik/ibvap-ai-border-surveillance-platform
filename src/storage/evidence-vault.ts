// ============================================================================
// IBVAP Evidence Storage & Cryptographic Integrity Engine
// Manages durable file storage, SHA-256 verification, and Chain of Custody
// ============================================================================

import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { EvidenceItem } from '../server/types';

export interface CreateEvidenceParams {
  incidentId?: string;
  incidentNumber?: string;
  cameraId?: string;
  cameraIdentifier?: string;
  trackId?: string | number;
  eventId?: string;
  title: string;
  mediaType: 'SNAPSHOT_IMAGE' | 'VIDEO_CLIP' | 'ANPR_CROP' | 'FACE_CROP' | 'TELEMETRY_LOG';
  dataBuffer: Buffer;
  sourceMode: 'LIVE' | 'SIMULATION' | 'TEST_DATA';
  operatorCallsign: string;
  notes?: string;
}

export interface VerificationResult {
  evidenceId: string;
  verified: boolean;
  expectedSha256: string;
  calculatedSha256: string;
  verifiedAt: string;
  fileSizeBytes: number;
  message: string;
}

export interface EvidenceExportManifest {
  exportPackageId: string;
  evidenceId: string;
  title: string;
  mediaType: string;
  sha256Checksum: string;
  fileSizeBytes: number;
  chainOfCustodyCount: number;
  sourceMode: string;
  provenance: string;
  exportedBy: string;
  exportedAt: string;
  purpose: string;
  verificationStatus: 'VERIFIED_AUTHENTIC' | 'INTEGRITY_MISMATCH' | 'UNVERIFIED';
}

export class EvidenceVault {
  private baseStoragePath: string;

  constructor(baseStoragePath = './storage/evidence') {
    this.baseStoragePath = path.resolve(process.cwd(), baseStoragePath);
    this.ensureDirectoryExists(this.baseStoragePath);
  }

  private ensureDirectoryExists(dir: string): void {
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
  }

  /**
   * Persists an evidence payload to disk, calculates SHA-256, and returns metadata.
   */
  async storeEvidence(params: CreateEvidenceParams): Promise<EvidenceItem> {
    const timestamp = new Date().toISOString();
    const evidenceId = `evi-${Date.now()}-${crypto.randomBytes(4).toString('hex')}`;
    const ext = params.mediaType === 'VIDEO_CLIP' ? 'mp4' : params.mediaType === 'TELEMETRY_LOG' ? 'json' : 'jpg';
    const fileName = `${evidenceId}.${ext}`;
    const filePath = path.join(this.baseStoragePath, fileName);

    // Calculate cryptographic SHA-256 hash of raw buffer
    const sha256Checksum = crypto.createHash('sha256').update(params.dataBuffer).digest('hex');
    const fileSizeBytes = params.dataBuffer.length;

    // Write file to durable storage
    await fs.promises.writeFile(filePath, params.dataBuffer);

    const provenance = params.sourceMode === 'LIVE'
      ? 'LIVE_BORDER_OPTICAL_FEED'
      : 'SIMULATION / TEST DATA (SYNTHETIC SCENARIO)';

    const item: EvidenceItem = {
      id: evidenceId,
      incidentId: params.incidentId || `inc-${Date.now()}`,
      incidentNumber: params.incidentNumber || 'INC-PENDING',
      cameraId: params.cameraId || 'cam-01',
      cameraIdentifier: params.cameraIdentifier || 'CAM-01',
      trackId: params.trackId ? String(params.trackId) : undefined,
      title: params.title,
      mediaType: params.mediaType,
      storageReferenceUri: `file://${filePath}`,
      fileSizeBytes,
      sha256Checksum,
      capturedStartAt: timestamp,
      capturedEndAt: timestamp,
      isVerified: true,
      chainOfCustodyCount: 1,
      createdByCallsign: params.operatorCallsign,
      createdAt: timestamp,
      isSimulated: params.sourceMode !== 'LIVE',
    };

    return item;
  }

  /**
   * Re-reads the stored evidence file, computes its SHA-256, and compares it to the expected checksum.
   */
  async verifyIntegrity(evidenceId: string, expectedSha256: string, storageUri: string): Promise<VerificationResult> {
    const verifiedAt = new Date().toISOString();

    // Parse file path
    const filePath = storageUri.startsWith('file://') ? storageUri.replace('file://', '') : storageUri;

    if (!fs.existsSync(filePath)) {
      return {
        evidenceId,
        verified: false,
        expectedSha256,
        calculatedSha256: '',
        verifiedAt,
        fileSizeBytes: 0,
        message: `Evidence file not found at path: ${filePath}`,
      };
    }

    const buffer = await fs.promises.readFile(filePath);
    const calculatedSha256 = crypto.createHash('sha256').update(buffer).digest('hex');
    const verified = calculatedSha256.toLowerCase() === expectedSha256.toLowerCase();

    return {
      evidenceId,
      verified,
      expectedSha256,
      calculatedSha256,
      verifiedAt,
      fileSizeBytes: buffer.length,
      message: verified
        ? 'Evidence cryptographic integrity verified. Bit-level SHA-256 hash matches immutable record.'
        : 'CRITICAL INTEGRITY MISMATCH: File contents have been modified or corrupted.',
    };
  }

  /**
   * Generates a tamper-evident export package manifest.
   */
  async generateExportManifest(
    evidence: EvidenceItem,
    exportedBy: string,
    purpose: string
  ): Promise<EvidenceExportManifest> {
    const verification = await this.verifyIntegrity(
      evidence.id,
      evidence.sha256Checksum,
      evidence.storageReferenceUri
    );

    return {
      exportPackageId: `EXP-PKG-${Date.now()}-${crypto.randomBytes(3).toString('hex').toUpperCase()}`,
      evidenceId: evidence.id,
      title: evidence.title,
      mediaType: evidence.mediaType,
      sha256Checksum: evidence.sha256Checksum,
      fileSizeBytes: evidence.fileSizeBytes,
      chainOfCustodyCount: (evidence.chainOfCustodyCount || 1) + 1,
      sourceMode: evidence.isSimulated ? 'SIMULATION' : 'LIVE',
      provenance: evidence.isSimulated
        ? 'SIMULATION / TEST DATA (SYNTHETIC RECORD)'
        : 'LIVE SENSOR EVIDENCE',
      exportedBy,
      exportedAt: new Date().toISOString(),
      purpose,
      verificationStatus: verification.verified ? 'VERIFIED_AUTHENTIC' : 'INTEGRITY_MISMATCH',
    };
  }

  /**
   * Generates a deterministic demo evidence snapshot for simulation/testing.
   */
  createDemoSnapshotBuffer(label: string): Buffer {
    // Generate a valid minimal PNG image (1x1 transparent or test pattern)
    // Minimal valid 1x1 PNG buffer:
    const minimalPng = Buffer.from(
      '89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c4890000000a49444154789c63000100000500010d0a2db40000000049454e44ae426082',
      'hex'
    );
    // Combine with watermark comment
    const comment = Buffer.from(`\n[IBVAP_EVIDENCE: ${label} | TIME: ${new Date().toISOString()}]`);
    return Buffer.concat([minimalPng, comment]);
  }
}

export const evidenceVault = new EvidenceVault();
