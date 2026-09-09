import React, { useState } from 'react';
import {
  FolderArchive,
  ShieldCheck,
  Download,
  CheckCircle2,
  Lock,
  Camera,
  ExternalLink,
} from 'lucide-react';
import { EvidenceItem } from '../server/types';
import { Button } from '../components/ui/Button';
import { Badge } from '../components/ui/Badge';
import { Search } from '../components/ui/Search';
import { Modal } from '../components/ui/Modal';
import { EmptyState } from '../components/ui/FeedbackStates';
import { formatTimestamp, formatBytes } from '../utils/formatters';

export interface EvidenceScreenProps {
  evidenceList: EvidenceItem[];
  onVerifyEvidence: (item: EvidenceItem) => Promise<void>;
  onExportEvidence: (item: EvidenceItem, purpose?: string) => Promise<void>;
}

export const EvidenceScreen: React.FC<EvidenceScreenProps> = ({
  evidenceList,
  onVerifyEvidence,
  onExportEvidence,
}) => {
  const [search, setSearch] = useState('');
  const [selectedItem, setSelectedItem] = useState<EvidenceItem | null>(null);
  const [exportModalItem, setExportModalItem] = useState<EvidenceItem | null>(null);
  const [exportPurpose, setExportPurpose] = useState('STANDARD_DISCLOSURE');
  const [exportSuccessManifest, setExportSuccessManifest] = useState<any | null>(null);
  const [verifyingId, setVerifyingId] = useState<string | null>(null);

  const safeList = Array.isArray(evidenceList) ? evidenceList : [];

  const filtered = safeList.filter((e) => {
    const term = search.toLowerCase();
    return (
      (e.title || '').toLowerCase().includes(term) ||
      (e.incidentNumber || '').toLowerCase().includes(term) ||
      (e.cameraIdentifier || '').toLowerCase().includes(term) ||
      (e.sha256Checksum || '').toLowerCase().includes(term)
    );
  });

  const handleVerify = async (item: EvidenceItem) => {
    setVerifyingId(item.id);
    try {
      await onVerifyEvidence(item);
    } finally {
      setVerifyingId(null);
    }
  };

  const handleExport = async () => {
    if (!exportModalItem) return;
    await onExportEvidence(exportModalItem, exportPurpose);
    setExportSuccessManifest({
      evidenceId: exportModalItem.id,
      title: exportModalItem.title,
      sha256Checksum: exportModalItem.sha256Checksum,
      exportedAt: new Date().toISOString(),
      purpose: exportPurpose,
    });
    setExportModalItem(null);
  };

  return (
    <div className="flex-1 flex flex-col h-full bg-[#0A0B0D] overflow-hidden">
      {/* 1. Header Toolbar */}
      <div className="p-4 sm:px-6 bg-[#0F1115] border-b border-[#23262B] flex flex-col sm:flex-row sm:items-center justify-between gap-3 shrink-0">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-base font-semibold text-white">Evidence Vault</h1>
            <span className="px-2 py-0.5 bg-[#14161A] border border-[#23262B] text-[#A9ACB1] rounded text-[11px] font-mono-num font-medium">
              {safeList.length} Sealed Records
            </span>
          </div>
          <p className="text-xs text-[#6C727A] mt-0.5">
            Surveillance captures, verification status, integrity hashes, and audit trail metadata
          </p>
        </div>

        <Search
          value={search}
          onChange={setSearch}
          placeholder="Search by incident, camera, or title..."
          className="w-72"
        />
      </div>

      {/* 2. Main Evidence Grid */}
      <div className="flex-1 p-4 sm:p-6 overflow-y-auto">
        {filtered.length === 0 ? (
          <EmptyState
            icon={<FolderArchive className="w-6 h-6" />}
            title={search ? 'No Matching Evidence' : 'Evidence Vault Empty'}
            description={
              search
                ? 'Try searching by a different incident ID, camera identifier, or hash prefix.'
                : 'Sealed recordings and audit stills linked to incidents will be archived here.'
            }
          />
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {filtered.map((item) => (
              <div
                key={item.id}
                className="bg-[#0F1115] border border-[#23262B] rounded overflow-hidden flex flex-col justify-between"
              >
                <div>
                  {/* Media Thumbnail */}
                  <div className="relative aspect-video bg-black flex items-center justify-center overflow-hidden border-b border-[#23262B]">
                    <img
                      src={item.previewUrl || 'https://images.unsplash.com/photo-1509198397868-475647b2a1e5?w=800&auto=format&fit=crop&q=80'}
                      alt={item.title}
                      referrerPolicy="no-referrer"
                      className="w-full h-full object-cover"
                    />
                    <div className="absolute top-2 left-2 bg-[#0F1115]/90 px-2 py-0.5 border border-[#23262B] rounded text-[10px] font-mono-num text-white">
                      {item.mediaType} · {formatBytes(item.fileSizeBytes)}
                    </div>

                    <div className="absolute bottom-2 right-2">
                      {item.isVerified ? (
                        <span className="text-[10px] font-mono-num bg-[#34C759]/15 text-[#34C759] border border-[#34C759]/30 px-1.5 py-0.5 rounded flex items-center gap-1 font-medium">
                          <CheckCircle2 className="w-3 h-3" /> SHA-256 Validated
                        </span>
                      ) : (
                        <span className="text-[10px] font-mono-num bg-[#FF9500]/15 text-[#FF9500] border border-[#FF9500]/30 px-1.5 py-0.5 rounded font-medium">
                          Pending Verification
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Body Metadata */}
                  <div className="p-4 space-y-2.5">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-mono-num font-bold text-[#007AFF]">
                        {item.incidentNumber || 'Standalone Capture'}
                      </span>
                      <span className="text-[11px] font-mono-num text-[#6C727A]">
                        Custody logs: {item.chainOfCustodyCount}
                      </span>
                    </div>

                    <h3 className="text-xs font-semibold text-white line-clamp-1">{item.title}</h3>

                    <div className="p-2.5 bg-[#14161A] border border-[#23262B] rounded space-y-1.5 text-xs font-mono-num text-[#6C727A]">
                      <div className="flex justify-between">
                        <span>Camera:</span>
                        <span className="text-white">{item.cameraIdentifier}</span>
                      </div>
                      <div className="flex justify-between">
                        <span>Captured:</span>
                        <span className="text-white">
                          {formatTimestamp(item.capturedStartAt, { format: 'time-only' })}
                        </span>
                      </div>
                      <div className="pt-1 border-t border-[#23262B] truncate text-[11px]">
                        <span>Hash: {item.sha256Checksum ? `${item.sha256Checksum.slice(0, 16)}...` : '—'}</span>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Actions Bar */}
                <div className="p-3 bg-[#14161A] border-t border-[#23262B] flex items-center justify-between gap-2">
                  <Button
                    variant="subtle"
                    size="sm"
                    onClick={() => setSelectedItem(item)}
                  >
                    View Details
                  </Button>

                  <div className="flex items-center gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      isLoading={verifyingId === item.id}
                      onClick={() => handleVerify(item)}
                      leftIcon={<ShieldCheck className="w-3.5 h-3.5 text-[#34C759]" />}
                    >
                      Verify
                    </Button>
                    <Button
                      variant="primary"
                      size="sm"
                      onClick={() => setExportModalItem(item)}
                      leftIcon={<Download className="w-3.5 h-3.5" />}
                    >
                      Export
                    </Button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* 3. Detail Inspection Modal */}
      <Modal
        isOpen={!!selectedItem}
        onClose={() => setSelectedItem(null)}
        title={selectedItem ? selectedItem.title : ''}
        subtitle={selectedItem ? `Item ID: ${selectedItem.id}` : ''}
        footer={
          <Button variant="ghost" size="sm" onClick={() => setSelectedItem(null)}>
            Close
          </Button>
        }
      >
        {selectedItem && (
          <div className="space-y-3 font-mono-num text-xs">
            <div className="relative aspect-video bg-black rounded overflow-hidden border border-[#23262B]">
              <img
                src={selectedItem.previewUrl || 'https://images.unsplash.com/photo-1509198397868-475647b2a1e5?w=800&auto=format&fit=crop&q=80'}
                alt={selectedItem.title}
                referrerPolicy="no-referrer"
                className="w-full h-full object-cover"
              />
            </div>

            <div className="p-3 bg-[#0F1115] border border-[#23262B] rounded space-y-2 text-xs">
              <div className="flex justify-between border-b border-[#23262B]/50 pb-1">
                <span className="text-[#6C727A]">Incident Reference:</span>
                <span className="text-white font-bold">{selectedItem.incidentNumber || 'None'}</span>
              </div>
              <div className="flex justify-between border-b border-[#23262B]/50 pb-1">
                <span className="text-[#6C727A]">Camera Source:</span>
                <span className="text-white">{selectedItem.cameraIdentifier}</span>
              </div>
              <div className="flex justify-between border-b border-[#23262B]/50 pb-1">
                <span className="text-[#6C727A]">Media Type:</span>
                <span className="text-white">{selectedItem.mediaType}</span>
              </div>
              <div className="flex justify-between border-b border-[#23262B]/50 pb-1">
                <span className="text-[#6C727A]">File Size:</span>
                <span className="text-white">{formatBytes(selectedItem.fileSizeBytes)}</span>
              </div>
              <div className="flex justify-between border-b border-[#23262B]/50 pb-1">
                <span className="text-[#6C727A]">Capture Window:</span>
                <span className="text-white">
                  {formatTimestamp(selectedItem.capturedStartAt, { format: 'utc' })} –{' '}
                  {formatTimestamp(selectedItem.capturedEndAt, { format: 'time-only' })}
                </span>
              </div>
              <div className="flex flex-col gap-1 pt-1">
                <span className="text-[#6C727A]">SHA-256 Checksum:</span>
                <span className="text-white font-mono text-[11px] break-all bg-[#14161A] p-1.5 rounded border border-[#23262B]">
                  {selectedItem.sha256Checksum}
                </span>
              </div>
            </div>
          </div>
        )}
      </Modal>

      {/* 4. Export Package Modal */}
      <Modal
        isOpen={!!exportModalItem}
        onClose={() => setExportModalItem(null)}
        title="Export Evidence Package"
        subtitle={exportModalItem?.title}
        footer={
          <>
            <Button variant="ghost" size="sm" onClick={() => setExportModalItem(null)}>
              Cancel
            </Button>
            <Button variant="primary" size="sm" onClick={handleExport}>
              Generate Export Package
            </Button>
          </>
        }
      >
        <div className="space-y-3 text-xs">
          <p className="text-[#6C727A]">
            Select the authorized purpose for this export. An audit trail record and export manifest will be generated.
          </p>

          <div className="space-y-1">
            <label className="text-white font-medium">Export Purpose</label>
            <select
              value={exportPurpose}
              onChange={(e) => setExportPurpose(e.target.value)}
              className="w-full h-8 px-2.5 bg-[#14161A] border border-[#23262B] rounded text-xs text-white focus:outline-none focus:border-[#007AFF]"
            >
              <option value="STANDARD_DISCLOSURE">Official Operational Disclosure</option>
              <option value="INTER_AGENCY_TRANSFER">Inter-Agency Transfer</option>
              <option value="INTERNAL_AUDIT">Internal Compliance Audit</option>
              <option value="ARCHIVE_RETENTION">Long-Term Storage Archive</option>
            </select>
          </div>
        </div>
      </Modal>

      {/* 5. Export Success Manifest Modal */}
      <Modal
        isOpen={!!exportSuccessManifest}
        onClose={() => setExportSuccessManifest(null)}
        title="Evidence Package Exported"
        subtitle="Cryptographic verification seal appended"
        footer={
          <Button variant="primary" size="sm" onClick={() => setExportSuccessManifest(null)}>
            Acknowledge & Close
          </Button>
        }
      >
        {exportSuccessManifest && (
          <div className="space-y-3 text-xs font-mono-num">
            <div className="p-3 bg-[#34C759]/10 border border-[#34C759]/30 rounded text-[#34C759] flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4" />
              <span>Evidence package sealed and exported successfully</span>
            </div>

            <div className="p-3 bg-[#0F1115] border border-[#23262B] rounded space-y-2 text-xs">
              <div className="flex justify-between border-b border-[#23262B]/50 pb-1">
                <span className="text-[#6C727A]">Package ID:</span>
                <span className="text-white">{exportSuccessManifest.evidenceId}</span>
              </div>
              <div className="flex justify-between border-b border-[#23262B]/50 pb-1">
                <span className="text-[#6C727A]">Purpose:</span>
                <span className="text-white">{exportSuccessManifest.purpose}</span>
              </div>
              <div className="flex justify-between border-b border-[#23262B]/50 pb-1">
                <span className="text-[#6C727A]">Export Timestamp:</span>
                <span className="text-white">{formatTimestamp(exportSuccessManifest.exportedAt, { format: 'utc' })}</span>
              </div>
              <div className="flex flex-col gap-1 pt-1">
                <span className="text-[#6C727A]">Verified Checksum:</span>
                <span className="text-white text-[11px] font-mono break-all bg-[#14161A] p-1.5 rounded border border-[#23262B]">
                  {exportSuccessManifest.sha256Checksum}
                </span>
              </div>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
};
