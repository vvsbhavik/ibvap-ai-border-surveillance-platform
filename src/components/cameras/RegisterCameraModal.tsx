import React, { useState } from 'react';
import { Camera as CameraIcon, ShieldCheck, Lock, AlertCircle } from 'lucide-react';
import { Camera, CameraType, CameraProtocol, Sector } from '../../server/types';
import { Modal } from '../ui/Modal';
import { Button } from '../ui/Button';

export interface RegisterCameraModalProps {
  isOpen: boolean;
  onClose: () => void;
  sectors: Sector[];
  existingCameras: Camera[];
  onRegisterCamera: (cameraData: Partial<Camera>) => Promise<void>;
}

export const RegisterCameraModal: React.FC<RegisterCameraModalProps> = ({
  isOpen,
  onClose,
  sectors,
  existingCameras,
  onRegisterCamera,
}) => {
  const [cameraId, setCameraId] = useState('');
  const [name, setName] = useState('');
  const [sectorId, setSectorId] = useState(sectors[0]?.id || 'sec-01');
  const [siteName, setSiteName] = useState('');
  const [latitude, setLatitude] = useState('31.3325');
  const [longitude, setLongitude] = useState('-110.9412');
  const [cameraType, setCameraType] = useState<CameraType>('FIXED_OPTICAL');
  const [resolution, setResolution] = useState('1920x1080 (FHD)');
  const [fps, setFps] = useState('30');
  const [protocol, setProtocol] = useState<CameraProtocol>('RTSP');
  const [streamEndpointReference, setStreamEndpointReference] = useState('rtsp://sensor-gateway.border.internal:554/live/cam-new');
  const [model, setModel] = useState('Axis Q1798-LE 4K');
  const [codec, setCodec] = useState('H.265');
  const [description, setDescription] = useState('');
  const [isPtSupported, setIsPtSupported] = useState(false);

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [validationErrors, setValidationErrors] = useState<Record<string, string>>({});
  const [serverError, setServerError] = useState<string | null>(null);

  const handleCameraTypeChange = (type: CameraType) => {
    setCameraType(type);
    const hasPtz = type.includes('PTZ');
    setIsPtSupported(hasPtz);
  };

  const validate = (): boolean => {
    const errors: Record<string, string> = {};

    // Camera ID
    const trimmedId = cameraId.trim().toUpperCase();
    if (!trimmedId) {
      errors.cameraId = 'Camera ID is required.';
    } else if (!/^[A-Z0-9_-]{3,20}$/.test(trimmedId)) {
      errors.cameraId = 'Camera ID must be 3-20 characters: alphanumeric, hyphen, or underscore (e.g. CAM-13).';
    } else if (existingCameras.some((c) => (c.cameraId || c.identifier || '').toUpperCase() === trimmedId)) {
      errors.cameraId = `Camera ID '${trimmedId}' already exists in registry.`;
    }

    // Name
    if (!name.trim()) {
      errors.name = 'Camera Name is required.';
    }

    // Site Name
    if (!siteName.trim()) {
      errors.siteName = 'Site/Post Name is required.';
    }

    // Coordinates
    const lat = Number(latitude);
    const lng = Number(longitude);
    if (isNaN(lat) || lat < -90 || lat > 90) {
      errors.latitude = 'Latitude must be between -90.0 and 90.0 degrees.';
    }
    if (isNaN(lng) || lng < -180 || lng > 180) {
      errors.longitude = 'Longitude must be between -180.0 and 180.0 degrees.';
    }

    // FPS
    const numFps = parseInt(fps, 10);
    if (isNaN(numFps) || numFps < 1 || numFps > 120) {
      errors.fps = 'FPS must be between 1 and 120.';
    }

    // Stream URI
    if (!streamEndpointReference.trim()) {
      errors.streamEndpointReference = 'Stream URI or reference token is required.';
    }

    setValidationErrors(errors);
    return Object.keys(errors).length === 0;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setServerError(null);

    if (!validate()) {
      return;
    }

    setIsSubmitting(true);
    try {
      await onRegisterCamera({
        cameraId: cameraId.trim().toUpperCase(),
        name: name.trim(),
        sectorId,
        siteName: siteName.trim(),
        latitude: Number(latitude),
        longitude: Number(longitude),
        cameraType,
        resolution: resolution.trim(),
        fps: parseInt(fps, 10),
        protocol,
        streamEndpointReference: streamEndpointReference.trim(),
        model: model.trim(),
        codec: codec.trim(),
        isPtSupported,
        description: description.trim() || undefined,
      });
      onClose();
    } catch (err: any) {
      setServerError(err.message || 'Failed to register camera sensor.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Register Surveillance Sensor"
      subtitle="Commission new optical, thermal, or ANPR camera into IBVAP registry"
      maxWidth="lg"
      footer={
        <div className="flex items-center justify-between w-full">
          <div className="flex items-center gap-1.5 text-[11px] text-[#6C727A]">
            <ShieldCheck className="w-3.5 h-3.5 text-[#34C759]" />
            <span>Vault encryption active · Plaintext credentials stripped</span>
          </div>
          <div className="flex items-center gap-2">
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
              variant="primary"
              size="sm"
              isLoading={isSubmitting}
              onClick={handleSubmit}
              leftIcon={<CameraIcon className="w-3.5 h-3.5" />}
            >
              Register Sensor
            </Button>
          </div>
        </div>
      }
    >
      <form onSubmit={handleSubmit} className="space-y-4">
        {serverError && (
          <div className="p-3 bg-[#FF4D4D]/10 border border-[#FF4D4D]/30 rounded text-xs text-[#FF4D4D] flex items-center gap-2">
            <AlertCircle className="w-4 h-4 shrink-0" />
            <span>{serverError}</span>
          </div>
        )}

        {/* Section 1: Identification */}
        <div className="p-3 bg-[#14161A] border border-[#23262B] rounded space-y-3">
          <div className="text-xs font-semibold text-white uppercase tracking-wider font-mono">
            1. Device Identification & Sector Assignment
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-white mb-1">
                Camera Identifier (ID) <span className="text-[#FF4D4D]">*</span>
              </label>
              <input
                type="text"
                required
                placeholder="e.g. CAM-13"
                value={cameraId}
                onChange={(e) => {
                  setCameraId(e.target.value.toUpperCase());
                  if (validationErrors.cameraId) {
                    setValidationErrors((prev) => ({ ...prev, cameraId: '' }));
                  }
                }}
                className={`w-full h-8 px-2.5 bg-[#0F1115] border rounded text-xs font-mono-num text-white placeholder-[#6C727A] focus:outline-none ${
                  validationErrors.cameraId
                    ? 'border-[#FF4D4D] focus:border-[#FF4D4D]'
                    : 'border-[#23262B] focus:border-[#007AFF]'
                }`}
              />
              {validationErrors.cameraId ? (
                <p className="text-[10px] text-[#FF4D4D] mt-1">{validationErrors.cameraId}</p>
              ) : (
                <p className="text-[10px] text-[#6C727A] mt-1">Unique business key (3-20 chars, alphanumeric)</p>
              )}
            </div>

            <div>
              <label className="block text-xs font-medium text-white mb-1">
                Camera Descriptive Name <span className="text-[#FF4D4D]">*</span>
              </label>
              <input
                type="text"
                required
                placeholder="e.g. Ridge Sentry Alpha 02"
                value={name}
                onChange={(e) => {
                  setName(e.target.value);
                  if (validationErrors.name) {
                    setValidationErrors((prev) => ({ ...prev, name: '' }));
                  }
                }}
                className={`w-full h-8 px-2.5 bg-[#0F1115] border rounded text-xs text-white placeholder-[#6C727A] focus:outline-none ${
                  validationErrors.name
                    ? 'border-[#FF4D4D] focus:border-[#FF4D4D]'
                    : 'border-[#23262B] focus:border-[#007AFF]'
                }`}
              />
              {validationErrors.name && (
                <p className="text-[10px] text-[#FF4D4D] mt-1">{validationErrors.name}</p>
              )}
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-white mb-1">
                Operational Sector <span className="text-[#FF4D4D]">*</span>
              </label>
              <select
                value={sectorId}
                onChange={(e) => setSectorId(e.target.value)}
                className="w-full h-8 px-2.5 bg-[#0F1115] border border-[#23262B] rounded text-xs text-white focus:outline-none focus:border-[#007AFF]"
              >
                {sectors.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name} ({s.code})
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs font-medium text-white mb-1">
                Site / Mast Location <span className="text-[#FF4D4D]">*</span>
              </label>
              <input
                type="text"
                required
                placeholder="e.g. Tower Mast 4 - Ridge Crest"
                value={siteName}
                onChange={(e) => {
                  setSiteName(e.target.value);
                  if (validationErrors.siteName) {
                    setValidationErrors((prev) => ({ ...prev, siteName: '' }));
                  }
                }}
                className={`w-full h-8 px-2.5 bg-[#0F1115] border rounded text-xs text-white placeholder-[#6C727A] focus:outline-none ${
                  validationErrors.siteName
                    ? 'border-[#FF4D4D] focus:border-[#FF4D4D]'
                    : 'border-[#23262B] focus:border-[#007AFF]'
                }`}
              />
              {validationErrors.siteName && (
                <p className="text-[10px] text-[#FF4D4D] mt-1">{validationErrors.siteName}</p>
              )}
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-white mb-1">
                Latitude (WGS84 Decimal) <span className="text-[#FF4D4D]">*</span>
              </label>
              <input
                type="text"
                required
                placeholder="e.g. 31.3325"
                value={latitude}
                onChange={(e) => {
                  setLatitude(e.target.value);
                  if (validationErrors.latitude) {
                    setValidationErrors((prev) => ({ ...prev, latitude: '' }));
                  }
                }}
                className={`w-full h-8 px-2.5 bg-[#0F1115] border rounded text-xs font-mono-num text-white focus:outline-none ${
                  validationErrors.latitude
                    ? 'border-[#FF4D4D] focus:border-[#FF4D4D]'
                    : 'border-[#23262B] focus:border-[#007AFF]'
                }`}
              />
              {validationErrors.latitude && (
                <p className="text-[10px] text-[#FF4D4D] mt-1">{validationErrors.latitude}</p>
              )}
            </div>

            <div>
              <label className="block text-xs font-medium text-white mb-1">
                Longitude (WGS84 Decimal) <span className="text-[#FF4D4D]">*</span>
              </label>
              <input
                type="text"
                required
                placeholder="e.g. -110.9412"
                value={longitude}
                onChange={(e) => {
                  setLongitude(e.target.value);
                  if (validationErrors.longitude) {
                    setValidationErrors((prev) => ({ ...prev, longitude: '' }));
                  }
                }}
                className={`w-full h-8 px-2.5 bg-[#0F1115] border rounded text-xs font-mono-num text-white focus:outline-none ${
                  validationErrors.longitude
                    ? 'border-[#FF4D4D] focus:border-[#FF4D4D]'
                    : 'border-[#23262B] focus:border-[#007AFF]'
                }`}
              />
              {validationErrors.longitude && (
                <p className="text-[10px] text-[#FF4D4D] mt-1">{validationErrors.longitude}</p>
              )}
            </div>
          </div>
        </div>

        {/* Section 2: Sensor Capabilities & Hardware */}
        <div className="p-3 bg-[#14161A] border border-[#23262B] rounded space-y-3">
          <div className="text-xs font-semibold text-white uppercase tracking-wider font-mono">
            2. Sensor Architecture & Model Specs
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div>
              <label className="block text-xs font-medium text-white mb-1">
                Sensor Type <span className="text-[#FF4D4D]">*</span>
              </label>
              <select
                value={cameraType}
                onChange={(e) => handleCameraTypeChange(e.target.value as CameraType)}
                className="w-full h-8 px-2.5 bg-[#0F1115] border border-[#23262B] rounded text-xs text-white focus:outline-none focus:border-[#007AFF]"
              >
                <option value="FIXED_OPTICAL">Fixed Optical</option>
                <option value="PTZ_OPTICAL">PTZ Optical</option>
                <option value="THERMAL_FIXED">Thermal Fixed</option>
                <option value="DUAL_THERMAL_PTZ">Dual Thermal PTZ</option>
                <option value="RADAR_SLAVED_PTZ">Radar-Slaved PTZ</option>
                <option value="ANPR_SPECIALIZED">ANPR Specialized</option>
              </select>
            </div>

            <div>
              <label className="block text-xs font-medium text-white mb-1">
                Resolution <span className="text-[#FF4D4D]">*</span>
              </label>
              <select
                value={resolution}
                onChange={(e) => setResolution(e.target.value)}
                className="w-full h-8 px-2.5 bg-[#0F1115] border border-[#23262B] rounded text-xs text-white focus:outline-none focus:border-[#007AFF]"
              >
                <option value="1920x1080 (FHD)">1920x1080 (FHD)</option>
                <option value="2560x1440 (2K)">2560x1440 (2K)</option>
                <option value="3840x2160 (4K)">3840x2160 (4K)</option>
                <option value="1280x720 (HD)">1280x720 (HD)</option>
              </select>
            </div>

            <div>
              <label className="block text-xs font-medium text-white mb-1">
                Target Frame Rate (FPS) <span className="text-[#FF4D4D]">*</span>
              </label>
              <input
                type="number"
                min="1"
                max="120"
                required
                value={fps}
                onChange={(e) => {
                  setFps(e.target.value);
                  if (validationErrors.fps) {
                    setValidationErrors((prev) => ({ ...prev, fps: '' }));
                  }
                }}
                className={`w-full h-8 px-2.5 bg-[#0F1115] border rounded text-xs font-mono-num text-white focus:outline-none ${
                  validationErrors.fps
                    ? 'border-[#FF4D4D] focus:border-[#FF4D4D]'
                    : 'border-[#23262B] focus:border-[#007AFF]'
                }`}
              />
              {validationErrors.fps && (
                <p className="text-[10px] text-[#FF4D4D] mt-1">{validationErrors.fps}</p>
              )}
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-white mb-1">Device Model / Manufacturer</label>
              <input
                type="text"
                placeholder="e.g. Axis Q1798-LE 4K"
                value={model}
                onChange={(e) => setModel(e.target.value)}
                className="w-full h-8 px-2.5 bg-[#0F1115] border border-[#23262B] rounded text-xs text-white placeholder-[#6C727A] focus:outline-none focus:border-[#007AFF]"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-white mb-1">Video Codec</label>
              <select
                value={codec}
                onChange={(e) => setCodec(e.target.value)}
                className="w-full h-8 px-2.5 bg-[#0F1115] border border-[#23262B] rounded text-xs text-white focus:outline-none focus:border-[#007AFF]"
              >
                <option value="H.265">H.265 (High Efficiency)</option>
                <option value="H.264">H.264 (Standard AVC)</option>
              </select>
            </div>
          </div>
        </div>

        {/* Section 3: Ingestion Stream Reference */}
        <div className="p-3 bg-[#14161A] border border-[#23262B] rounded space-y-3">
          <div className="text-xs font-semibold text-white uppercase tracking-wider font-mono flex items-center justify-between">
            <span>3. Video Ingestion Endpoint</span>
            <span className="text-[10px] text-[#007AFF] font-sans">Zero Plaintext Policy</span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div>
              <label className="block text-xs font-medium text-white mb-1">
                Protocol <span className="text-[#FF4D4D]">*</span>
              </label>
              <select
                value={protocol}
                onChange={(e) => setProtocol(e.target.value as CameraProtocol)}
                className="w-full h-8 px-2.5 bg-[#0F1115] border border-[#23262B] rounded text-xs text-white focus:outline-none focus:border-[#007AFF]"
              >
                <option value="RTSP">RTSP (Real-Time Streaming)</option>
                <option value="ONVIF">ONVIF (Profile S/G/T)</option>
              </select>
            </div>

            <div className="sm:col-span-2">
              <label className="block text-xs font-medium text-white mb-1">
                Stream Endpoint URI or Ingestion Reference <span className="text-[#FF4D4D]">*</span>
              </label>
              <input
                type="text"
                required
                placeholder="rtsp://gateway.internal:554/live/cam-13"
                value={streamEndpointReference}
                onChange={(e) => {
                  setStreamEndpointReference(e.target.value);
                  if (validationErrors.streamEndpointReference) {
                    setValidationErrors((prev) => ({ ...prev, streamEndpointReference: '' }));
                  }
                }}
                className={`w-full h-8 px-2.5 bg-[#0F1115] border rounded text-xs font-mono-num text-white placeholder-[#6C727A] focus:outline-none ${
                  validationErrors.streamEndpointReference
                    ? 'border-[#FF4D4D] focus:border-[#FF4D4D]'
                    : 'border-[#23262B] focus:border-[#007AFF]'
                }`}
              />
              {validationErrors.streamEndpointReference && (
                <p className="text-[10px] text-[#FF4D4D] mt-1">{validationErrors.streamEndpointReference}</p>
              )}
            </div>
          </div>

          <div className="p-2 bg-[#0F1115] border border-[#23262B] rounded flex items-start gap-2 text-[11px] text-[#A9ACB1]">
            <Lock className="w-3.5 h-3.5 text-[#34C759] shrink-0 mt-0.5" />
            <p>
              <strong>Security Invariant:</strong> Never enter plaintext credentials in URLs. Any embedded authentication tokens (e.g. <code className="text-white">rtsp://user:pass@host/path</code>) are automatically stripped by the server, encrypted into a vault reference token, and will not be displayed or stored in plaintext.
            </p>
          </div>
        </div>

        {/* Section 4: Notes / Description */}
        <div>
          <label className="block text-xs font-medium text-white mb-1">
            Operational Description / Notes (Optional)
          </label>
          <textarea
            rows={2}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Operational coverage area, mounting height, primary approach corridor..."
            className="w-full px-3 py-2 bg-[#14161A] border border-[#23262B] rounded text-xs text-white placeholder-[#6C727A] focus:outline-none focus:border-[#007AFF]"
          />
        </div>
      </form>
    </Modal>
  );
};
