import React, { useState } from 'react';
import {
  Car,
  AlertTriangle,
  Camera,
  MapPin,
  ExternalLink,
  ShieldAlert,
} from 'lucide-react';
import { AnprRecord } from '../server/types';
import { Badge } from '../components/ui/Badge';
import { Button } from '../components/ui/Button';
import { Search } from '../components/ui/Search';
import { Drawer } from '../components/ui/Drawer';
import { EmptyState } from '../components/ui/FeedbackStates';
import { formatTimestamp, formatPercentage } from '../utils/formatters';

export interface AnprScreenProps {
  records: AnprRecord[];
  onEscalateAnpr?: (record: AnprRecord) => void;
}

export const AnprScreen: React.FC<AnprScreenProps> = ({ records, onEscalateAnpr }) => {
  const [search, setSearch] = useState('');
  const [watchlistOnly, setWatchlistOnly] = useState(false);
  const [selectedRecord, setSelectedRecord] = useState<AnprRecord | null>(null);

  const safeRecords = Array.isArray(records) ? records : [];

  const filtered = safeRecords.filter((r) => {
    const term = search.toLowerCase();
    const matchSearch =
      (r.plateNumber || '').toLowerCase().includes(term) ||
      (r.vehicleType || '').toLowerCase().includes(term) ||
      (r.vehicleColor || '').toLowerCase().includes(term) ||
      (r.cameraIdentifier || '').toLowerCase().includes(term);
    const matchWatchlist = !watchlistOnly || r.isWatchlistMatch;
    return matchSearch && matchWatchlist;
  });

  const watchlistCount = safeRecords.filter((r) => r.isWatchlistMatch).length;

  return (
    <div className="flex-1 flex flex-col h-full bg-[#0A0B0D] overflow-hidden">
      {/* 1. Sub-Header Toolbar */}
      <div className="p-4 sm:px-6 bg-[#0F1115] border-b border-[#23262B] flex flex-col sm:flex-row sm:items-center justify-between gap-3 shrink-0">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-sm font-semibold text-white">ANPR</h1>
            <span className="px-1.5 py-0.5 text-[10px] font-mono-num font-semibold bg-[#007AFF]/15 text-[#007AFF] border border-[#007AFF]/30 rounded">
              SIMULATED ANPR DATA
            </span>
            {watchlistCount > 0 && (
              <span className="px-2 py-0.5 bg-[#FF4D4D]/15 border border-[#FF4D4D]/30 text-[#FF4D4D] rounded text-[11px] font-semibold font-mono-num">
                {watchlistCount} Watchlist {watchlistCount === 1 ? 'Match' : 'Matches'}
              </span>
            )}
          </div>
          <p className="text-xs text-[#6C727A] mt-0.5">
            Simulated checkpoint vehicle detection, speed tracking, and automated watchlist correlation
          </p>
        </div>

        <div className="flex items-center gap-2">
          <Search
            value={search}
            onChange={setSearch}
            placeholder="Search plates, vehicle models..."
            className="w-56"
          />
          <Button
            variant={watchlistOnly ? 'danger' : 'outline'}
            size="sm"
            onClick={() => setWatchlistOnly(!watchlistOnly)}
            leftIcon={<AlertTriangle className="w-3.5 h-3.5" />}
          >
            {watchlistOnly ? 'Watchlist Only' : 'Filter Watchlist'}
          </Button>
        </div>
      </div>

      {/* 2. Main Records Content */}
      <div className="flex-1 p-4 sm:p-6 overflow-y-auto">
        {filtered.length === 0 ? (
          <EmptyState
            icon={<Car className="w-6 h-6" />}
            title={search || watchlistOnly ? 'No Matching Captures' : 'No License Plate Records'}
            description={
              search || watchlistOnly
                ? 'Try adjusting your search criteria or toggling the watchlist filter.'
                : 'Vehicles detected at border lanes and checkpoints will display here in real time.'
            }
          />
        ) : (
          <div className="bg-[#0F1115] border border-[#23262B] rounded overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs border-collapse">
                <thead>
                  <tr className="border-b border-[#23262B] bg-[#14161A] text-[11px] font-mono-num uppercase tracking-wider text-[#6C727A]">
                    <th className="p-3 font-medium">Captured Plate</th>
                    <th className="p-3 font-medium">Vehicle Details</th>
                    <th className="p-3 font-medium">Sensor Location</th>
                    <th className="p-3 font-medium">Speed</th>
                    <th className="p-3 font-medium">Confidence</th>
                    <th className="p-3 font-medium">Status</th>
                    <th className="p-3 font-medium text-right">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#23262B]">
                  {filtered.map((record) => (
                    <tr
                      key={record.id}
                      onClick={() => setSelectedRecord(record)}
                      className={`hover:bg-[#1A1D23] cursor-pointer transition-colors ${
                        record.isWatchlistMatch ? 'bg-[#FF4D4D]/5' : ''
                      }`}
                    >
                      <td className="p-3">
                        <span className="text-xs font-bold font-mono-num px-2.5 py-1 bg-[#14161A] border border-[#23262B] text-white rounded">
                          {record.plateNumber}
                        </span>
                        <div className="text-[10px] font-mono-num text-[#6C727A] mt-1">
                          {formatTimestamp(record.timestamp, { format: 'time-only' })}
                        </div>
                      </td>

                      <td className="p-3">
                        <div className="font-semibold text-white">
                          {record.vehicleColor} {record.vehicleType}
                        </div>
                      </td>

                      <td className="p-3">
                        <div className="flex items-center gap-1.5 text-[#E0E2E6]">
                          <Camera className="w-3.5 h-3.5 text-[#007AFF] shrink-0" />
                          <span className="font-mono-num font-medium">{record.cameraIdentifier}</span>
                        </div>
                        <div className="text-[11px] text-[#6C727A] mt-0.5">
                          {record.sectorName}
                        </div>
                      </td>

                      <td className="p-3 font-mono-num text-[#E0E2E6]">
                        {record.speedKmh ? `${record.speedKmh} km/h` : 'Stationary'}
                      </td>

                      <td className="p-3 font-mono-num">
                        <span className="font-semibold text-[#007AFF]">
                          {formatPercentage(record.confidence * 100)}
                        </span>
                      </td>

                      <td className="p-3">
                        {record.isWatchlistMatch ? (
                          <Badge variant="critical">
                            MATCH: {record.watchlistCategory || 'ALERT'}
                          </Badge>
                        ) : (
                          <Badge variant="healthy" showDot={false}>
                            CLEAR
                          </Badge>
                        )}
                      </td>

                      <td className="p-3 text-right">
                        <Button
                          variant="subtle"
                          size="sm"
                          onClick={(e) => {
                            e.stopPropagation();
                            setSelectedRecord(record);
                          }}
                        >
                          Inspect
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>

      {/* 3. Detail Inspection Drawer */}
      <Drawer
        isOpen={!!selectedRecord}
        onClose={() => setSelectedRecord(null)}
        title={selectedRecord ? `Plate ${selectedRecord.plateNumber}` : ''}
        subtitle="Optical License Plate Record"
      >
        {selectedRecord && (
          <div className="space-y-4">
            {/* Capture Image */}
            <div className="relative aspect-video bg-black rounded overflow-hidden border border-[#23262B]">
              <img
                src={selectedRecord.thumbnailUrl || 'https://images.unsplash.com/photo-1549399542-7e3f8b79c341?w=800&auto=format&fit=crop&q=80'}
                alt={selectedRecord.plateNumber}
                referrerPolicy="no-referrer"
                className="w-full h-full object-cover"
              />
              <div className="absolute top-2 left-2 bg-[#0F1115]/90 px-2 py-0.5 rounded border border-[#23262B] text-[10px] font-mono-num text-[#007AFF]">
                LPR · {selectedRecord.cameraIdentifier}
              </div>
            </div>

            {/* Watchlist Banner */}
            {selectedRecord.isWatchlistMatch && (
              <div className="p-3 bg-[#FF4D4D]/10 border border-[#FF4D4D]/30 rounded text-[#FF4D4D] space-y-1">
                <div className="text-xs font-semibold flex items-center gap-1.5">
                  <ShieldAlert className="w-4 h-4 text-[#FF4D4D]" />
                  Watchlist Match Triggered
                </div>
                <p className="text-xs text-[#E0E2E6] leading-relaxed">
                  Vehicle plate matches active registry entry: <strong>{selectedRecord.watchlistCategory}</strong>.
                </p>
              </div>
            )}

            {/* Attributes Grid */}
            <div className="p-3 bg-[#0F1115] border border-[#23262B] rounded space-y-2 text-xs">
              <div className="flex justify-between py-1 border-b border-[#23262B]/50">
                <span className="text-[#6C727A]">Plate Number:</span>
                <span className="font-mono-num font-bold text-white">{selectedRecord.plateNumber}</span>
              </div>
              <div className="flex justify-between py-1 border-b border-[#23262B]/50">
                <span className="text-[#6C727A]">Vehicle Description:</span>
                <span className="text-white font-medium">
                  {selectedRecord.vehicleColor} {selectedRecord.vehicleType}
                </span>
              </div>
              <div className="flex justify-between py-1 border-b border-[#23262B]/50">
                <span className="text-[#6C727A]">Sensor Identifier:</span>
                <span className="font-mono-num text-white">{selectedRecord.cameraIdentifier}</span>
              </div>
              <div className="flex justify-between py-1 border-b border-[#23262B]/50">
                <span className="text-[#6C727A]">Sector:</span>
                <span className="text-white">{selectedRecord.sectorName}</span>
              </div>
              <div className="flex justify-between py-1 border-b border-[#23262B]/50">
                <span className="text-[#6C727A]">Measured Speed:</span>
                <span className="font-mono-num text-white">
                  {selectedRecord.speedKmh ? `${selectedRecord.speedKmh} km/h` : 'Stationary'}
                </span>
              </div>
              <div className="flex justify-between py-1 border-b border-[#23262B]/50">
                <span className="text-[#6C727A]">Inference Confidence:</span>
                <span className="font-mono-num text-[#007AFF] font-semibold">
                  {formatPercentage(selectedRecord.confidence * 100)}
                </span>
              </div>
              <div className="flex justify-between py-1">
                <span className="text-[#6C727A]">Capture Timestamp:</span>
                <span className="font-mono-num text-white">
                  {formatTimestamp(selectedRecord.timestamp, { format: 'utc' })}
                </span>
              </div>
            </div>

            {/* Action */}
            {selectedRecord.isWatchlistMatch && onEscalateAnpr && (
              <Button
                variant="danger"
                size="md"
                className="w-full"
                onClick={() => {
                  onEscalateAnpr(selectedRecord);
                  setSelectedRecord(null);
                }}
                leftIcon={<AlertTriangle className="w-4 h-4" />}
              >
                Escalate to Operational Incident
              </Button>
            )}
          </div>
        )}
      </Drawer>
    </div>
  );
};
