import React, { useState } from 'react';
import { AlertTriangle, ShieldAlert } from 'lucide-react';
import { Camera } from '../../server/types';
import { Modal } from '../ui/Modal';
import { Button } from '../ui/Button';

export interface DecommissionConfirmModalProps {
  isOpen: boolean;
  camera: Camera | null;
  onClose: () => void;
  onConfirmDecommission: (cameraId: string, reason: string) => Promise<void>;
}

export const DecommissionConfirmModal: React.FC<DecommissionConfirmModalProps> = ({
  isOpen,
  camera,
  onClose,
  onConfirmDecommission,
}) => {
  const [reason, setReason] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!camera) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!reason.trim()) {
      setError('A decommission justification/reason is required for operational audit integrity.');
      return;
    }

    setIsSubmitting(true);
    setError(null);
    try {
      await onConfirmDecommission(camera.id, reason.trim());
      setReason('');
      onClose();
    } catch (err: any) {
      setError(err.message || 'Failed to decommission camera.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Decommission Surveillance Sensor"
      subtitle={`Lifecycle Decommission: ${camera.cameraId || camera.identifier} — ${camera.name}`}
      maxWidth="md"
      footer={
        <div className="flex items-center justify-end gap-2 w-full">
          <Button
            type="button"
            variant="subtle"
            size="sm"
            onClick={onClose}
            disabled={isSubmitting}
          >
            Cancel
          </Button>
          <Button
            type="button"
            variant="danger"
            size="sm"
            isLoading={isSubmitting}
            onClick={handleSubmit}
            leftIcon={<ShieldAlert className="w-3.5 h-3.5" />}
          >
            Confirm Decommission
          </Button>
        </div>
      }
    >
      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="p-3 bg-[#FF4D4D]/10 border border-[#FF4D4D]/30 rounded flex items-start gap-3">
          <AlertTriangle className="w-5 h-5 text-[#FF4D4D] shrink-0 mt-0.5" />
          <div className="text-xs text-[#E0E2E6] space-y-1">
            <p className="font-semibold text-white">Safe Decommissioning Safeguards</p>
            <p className="text-[#A9ACB1] leading-relaxed">
              Decommissioning will mark <span className="font-mono font-bold text-white">{camera.cameraId || camera.identifier}</span> as permanently offline and archive its active stream feeds.
            </p>
            <p className="text-[11px] text-[#A9ACB1] leading-relaxed">
              <strong className="text-white">Data Integrity Guarantee:</strong> Historical records, past incident linkages, and evidence vault artifacts associated with this sensor remain preserved and queryable.
            </p>
          </div>
        </div>

        <div>
          <label className="block text-xs font-medium text-white mb-1.5">
            Operational Justification / Reason <span className="text-[#FF4D4D]">*</span>
          </label>
          <textarea
            required
            rows={3}
            value={reason}
            onChange={(e) => {
              setReason(e.target.value);
              if (error) setError(null);
            }}
            placeholder="e.g., Sensor hardware replacement, pole relocation to Sector 5, or permanent mast decommission..."
            className="w-full px-3 py-2 bg-[#14161A] border border-[#23262B] rounded text-xs text-white placeholder-[#6C727A] focus:outline-none focus:border-[#FF4D4D]"
          />
        </div>

        {error && (
          <div className="p-2.5 bg-[#FF4D4D]/10 border border-[#FF4D4D]/30 rounded text-xs text-[#FF4D4D]">
            {error}
          </div>
        )}
      </form>
    </Modal>
  );
};
