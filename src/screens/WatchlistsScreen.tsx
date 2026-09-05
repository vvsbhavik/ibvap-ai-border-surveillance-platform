import React, { useState } from 'react';
import {
  ListFilter,
  Plus,
  Car,
  UserCheck,
  Search as SearchIcon,
  ShieldAlert,
} from 'lucide-react';
import { WatchlistEntry, AlertSeverity } from '../server/types';
import { Button } from '../components/ui/Button';
import { Badge } from '../components/ui/Badge';
import { Search } from '../components/ui/Search';
import { Modal } from '../components/ui/Modal';
import { Input } from '../components/ui/Input';
import { EmptyState } from '../components/ui/FeedbackStates';

export interface WatchlistsScreenProps {
  watchlists: WatchlistEntry[];
  onCreateEntry: (entry: Partial<WatchlistEntry>) => Promise<void>;
  onToggleEntry: (id: string) => Promise<void>;
}

export const WatchlistsScreen: React.FC<WatchlistsScreenProps> = ({
  watchlists,
  onCreateEntry,
  onToggleEntry,
}) => {
  const [search, setSearch] = useState('');
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);

  // Form state
  const [targetType, setTargetType] = useState<'VEHICLE' | 'PERSON'>('VEHICLE');
  const [targetIdentifier, setTargetIdentifier] = useState('');
  const [labelName, setLabelName] = useState('');
  const [category, setCategory] = useState('BORDER_HOTLIST');
  const [priority, setPriority] = useState<AlertSeverity>('HIGH');
  const [notes, setNotes] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const safeList = Array.isArray(watchlists) ? watchlists : [];

  const filtered = safeList.filter((w) => {
    const term = search.toLowerCase();
    return (
      (w.targetIdentifier || '').toLowerCase().includes(term) ||
      (w.labelName || '').toLowerCase().includes(term) ||
      (w.category || '').toLowerCase().includes(term)
    );
  });

  const activeCount = safeList.filter((w) => w.isActive).length;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!targetIdentifier.trim() || !labelName.trim()) return;

    setIsSubmitting(true);
    try {
      await onCreateEntry({
        targetType,
        targetIdentifier: targetIdentifier.trim().toUpperCase(),
        labelName: labelName.trim(),
        category,
        priority,
        notes: notes.trim(),
      });
      setIsAddModalOpen(false);
      setTargetIdentifier('');
      setLabelName('');
      setNotes('');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="flex-1 flex flex-col h-full bg-[#0A0B0D] overflow-hidden">
      {/* 1. Header Toolbar */}
      <div className="p-4 sm:px-6 bg-[#0F1115] border-b border-[#23262B] flex flex-col sm:flex-row sm:items-center justify-between gap-3 shrink-0 select-none">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-sm font-semibold text-white">Watchlists</h1>
            <span className="px-2 py-0.5 bg-[#14161A] border border-[#23262B] text-[#A9ACB1] rounded text-[11px] font-mono-num font-medium">
              {activeCount} Active Targets
            </span>
            <span className="px-1.5 py-0.5 text-[10px] font-mono-num font-semibold bg-[#007AFF]/15 text-[#007AFF] border border-[#007AFF]/30 rounded">
              SIMULATED DATA
            </span>
          </div>
          <p className="text-xs text-[#6C727A] mt-0.5">
            Surveillance match registry for flagged vehicle plates and persons of interest
          </p>
        </div>

        <div className="flex items-center gap-2">
          <Search
            value={search}
            onChange={setSearch}
            placeholder="Search targets, plates, or labels..."
            className="w-64"
          />
          <Button
            variant="primary"
            size="sm"
            onClick={() => setIsAddModalOpen(true)}
            leftIcon={<Plus className="w-3.5 h-3.5" />}
          >
            Add Target
          </Button>
        </div>
      </div>

      {/* 2. Main Content */}
      <div className="flex-1 p-4 sm:p-6 overflow-y-auto">
        {filtered.length === 0 ? (
          <EmptyState
            icon={<ListFilter className="w-6 h-6" />}
            title={search ? 'No Matching Watchlist Entries' : 'No Watchlist Targets'}
            description={
              search
                ? 'Try a different search keyword or clear the search field.'
                : 'Registered vehicle plates and persons will trigger automated alerts when spotted by cameras.'
            }
          />
        ) : (
          <div className="bg-[#0F1115] border border-[#23262B] rounded overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs border-collapse">
                <thead>
                  <tr className="border-b border-[#23262B] bg-[#14161A] text-[11px] font-mono-num uppercase tracking-wider text-[#6C727A]">
                    <th className="p-3 font-medium">Target Identifier</th>
                    <th className="p-3 font-medium">Description & Author</th>
                    <th className="p-3 font-medium">Category</th>
                    <th className="p-3 font-medium">Priority</th>
                    <th className="p-3 font-medium">Operational Notes</th>
                    <th className="p-3 font-medium">Monitoring Status</th>
                    <th className="p-3 font-medium text-right">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#23262B]">
                  {filtered.map((item) => (
                    <tr key={item.id} className="hover:bg-[#1A1D23] transition-colors">
                      <td className="p-3">
                        <div className="flex items-center gap-2">
                          {item.targetType === 'VEHICLE' ? (
                            <Car className="w-3.5 h-3.5 text-[#007AFF]" />
                          ) : (
                            <UserCheck className="w-3.5 h-3.5 text-[#34C759]" />
                          )}
                          <span className="font-mono-num font-bold text-white px-2 py-0.5 bg-[#14161A] border border-[#23262B] rounded">
                            {item.targetIdentifier}
                          </span>
                        </div>
                        <div className="text-[10px] text-[#6C727A] mt-1 font-mono-num">
                          Type: {item.targetType}
                        </div>
                      </td>

                      <td className="p-3">
                        <div className="font-semibold text-white">{item.labelName}</div>
                        <div className="text-[11px] text-[#6C727A] mt-0.5">
                          Added by {item.addedByCallsign}
                        </div>
                      </td>

                      <td className="p-3">
                        <span className="text-white text-xs">{item.category}</span>
                      </td>

                      <td className="p-3">
                        <Badge
                          variant={
                            item.priority === 'CRITICAL'
                              ? 'critical'
                              : item.priority === 'HIGH'
                              ? 'attention'
                              : 'healthy'
                          }
                          size="sm"
                        >
                          {item.priority}
                        </Badge>
                      </td>

                      <td className="p-3">
                        <span className="text-[#6C727A] text-xs line-clamp-1 max-w-xs" title={item.notes}>
                          {item.notes || '—'}
                        </span>
                      </td>

                      <td className="p-3">
                        {item.isActive ? (
                          <Badge variant="healthy" size="sm">
                            Active Monitoring
                          </Badge>
                        ) : (
                          <Badge variant="offline" size="sm">
                            Disabled
                          </Badge>
                        )}
                      </td>

                      <td className="p-3 text-right">
                        <Button
                          variant={item.isActive ? 'secondary' : 'primary'}
                          size="sm"
                          onClick={() => onToggleEntry(item.id)}
                        >
                          {item.isActive ? 'Deactivate' : 'Activate'}
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

      {/* 3. Add Watchlist Entry Modal */}
      <Modal
        isOpen={isAddModalOpen}
        onClose={() => setIsAddModalOpen(false)}
        title="Register Watchlist Target"
        subtitle="Automated cross-matching will trigger alerts upon detection"
        footer={
          <>
            <Button variant="ghost" size="sm" onClick={() => setIsAddModalOpen(false)}>
              Cancel
            </Button>
            <Button
              variant="primary"
              size="sm"
              isLoading={isSubmitting}
              onClick={handleSubmit}
            >
              Add Target
            </Button>
          </>
        }
      >
        <form onSubmit={handleSubmit} className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div className="flex flex-col gap-1">
              <label className="text-xs font-medium text-white">Target Type</label>
              <select
                value={targetType}
                onChange={(e) => setTargetType(e.target.value as 'VEHICLE' | 'PERSON')}
                className="w-full h-8 bg-[#14161A] text-xs px-2.5 text-white border border-[#23262B] rounded focus:outline-none focus:border-[#007AFF]"
              >
                <option value="VEHICLE">Vehicle License Plate</option>
                <option value="PERSON">Person of Interest</option>
              </select>
            </div>

            <Input
              label="Identifier (Plate / Name Code)"
              value={targetIdentifier}
              onChange={(e) => setTargetIdentifier(e.target.value)}
              placeholder="e.g. 7XYZ999"
              required
            />
          </div>

          <Input
            label="Descriptive Label / Alias"
            value={labelName}
            onChange={(e) => setLabelName(e.target.value)}
            placeholder="e.g. Red Pickup / Flagged Courier"
            required
          />

          <div className="grid grid-cols-2 gap-3">
            <div className="flex flex-col gap-1">
              <label className="text-xs font-medium text-white">Registry Category</label>
              <select
                value={category}
                onChange={(e) => setCategory(e.target.value)}
                className="w-full h-8 bg-[#14161A] text-xs px-2.5 text-white border border-[#23262B] rounded focus:outline-none focus:border-[#007AFF]"
              >
                <option value="BORDER_HOTLIST">Border Hotlist Interdiction</option>
                <option value="STOLEN_VEHICLE">Stolen Vehicle Registry</option>
                <option value="RESTRICTED_ACCESS">Restricted Area Denial</option>
                <option value="CUSTOMS_WARRANT">Customs & Border Warrant</option>
              </select>
            </div>

            <div className="flex flex-col gap-1">
              <label className="text-xs font-medium text-white">Alert Priority</label>
              <select
                value={priority}
                onChange={(e) => setPriority(e.target.value as AlertSeverity)}
                className="w-full h-8 bg-[#14161A] text-xs px-2.5 text-white border border-[#23262B] rounded focus:outline-none focus:border-[#007AFF]"
              >
                <option value="CRITICAL">Critical Priority</option>
                <option value="HIGH">High Priority</option>
                <option value="MEDIUM">Medium Priority</option>
                <option value="LOW">Low Priority</option>
              </select>
            </div>
          </div>

          <div className="flex flex-col gap-1">
            <label className="text-xs font-medium text-white">Operational Notes</label>
            <textarea
              rows={3}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Case references, issuing agency, or special instructions..."
              className="w-full bg-[#14161A] text-xs p-2.5 text-white border border-[#23262B] rounded focus:outline-none focus:border-[#007AFF] resize-none"
            />
          </div>
        </form>
      </Modal>
    </div>
  );
};
