import React, { useState, useEffect } from 'react';
import { Search, Camera, AlertTriangle, ShieldAlert, Cpu, MapPin, Database, Sparkles, X } from 'lucide-react';
import { tokens } from '../../design-system/tokens';

export interface CommandItem {
  id: string;
  title: string;
  subtitle: string;
  category: 'NAVIGATION' | 'CAMERAS' | 'ACTIONS';
  icon: React.ReactNode;
  action: () => void;
}

export interface CommandPaletteProps {
  isOpen: boolean;
  onClose: () => void;
  onNavigate: (view: string) => void;
}

export const CommandPalette: React.FC<CommandPaletteProps> = ({
  isOpen,
  onClose,
  onNavigate,
}) => {
  const [query, setQuery] = useState('');

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        if (isOpen) onClose();
        else onClose(); // parent handles toggle
      }
      if (e.key === 'Escape' && isOpen) {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const items: CommandItem[] = [
    {
      id: 'nav-dashboard',
      title: 'Dashboard',
      subtitle: 'Operational summary and command overview',
      category: 'NAVIGATION',
      icon: <ShieldAlert className="w-3.5 h-3.5 text-[#007AFF]" />,
      action: () => { onNavigate('dashboard'); onClose(); },
    },
    {
      id: 'nav-cameras',
      title: 'Camera Management',
      subtitle: 'Sensor inventory, stream status, and PTZ controls',
      category: 'NAVIGATION',
      icon: <Camera className="w-3.5 h-3.5 text-[#34C759]" />,
      action: () => { onNavigate('cameras'); onClose(); },
    },
    {
      id: 'nav-live',
      title: 'Live Monitoring Wall',
      subtitle: 'Multi-camera perimeter surveillance wall',
      category: 'NAVIGATION',
      icon: <Camera className="w-3.5 h-3.5 text-[#007AFF]" />,
      action: () => { onNavigate('live'); onClose(); },
    },
    {
      id: 'nav-alerts',
      title: 'Alert Center',
      subtitle: 'Triage perimeter alerts and sensor anomaly detections',
      category: 'NAVIGATION',
      icon: <AlertTriangle className="w-3.5 h-3.5 text-[#FF9500]" />,
      action: () => { onNavigate('alerts'); onClose(); },
    },
    {
      id: 'nav-incidents',
      title: 'Incident Command',
      subtitle: 'Active incident coordination, containment, and chronologies',
      category: 'NAVIGATION',
      icon: <ShieldAlert className="w-3.5 h-3.5 text-[#FF4D4D]" />,
      action: () => { onNavigate('incidents'); onClose(); },
    },
    {
      id: 'nav-evidence',
      title: 'Evidence Vault',
      subtitle: 'Evidence integrity, verification status, and audit trails',
      category: 'NAVIGATION',
      icon: <Database className="w-3.5 h-3.5 text-[#A9ACB1]" />,
      action: () => { onNavigate('evidence'); onClose(); },
    },
    {
      id: 'nav-gis',
      title: 'GIS Operational Map',
      subtitle: 'Spatial coordinates, virtual perimeter fences, and sector coverage',
      category: 'NAVIGATION',
      icon: <MapPin className="w-3.5 h-3.5 text-[#007AFF]" />,
      action: () => { onNavigate('gis'); onClose(); },
    },
    {
      id: 'nav-anpr',
      title: 'ANPR',
      subtitle: 'License plate recognition and automated watchlist correlation',
      category: 'NAVIGATION',
      icon: <ShieldAlert className="w-3.5 h-3.5 text-[#FF9500]" />,
      action: () => { onNavigate('anpr'); onClose(); },
    },
    {
      id: 'nav-watchlists',
      title: 'Watchlists',
      subtitle: 'Target watchlists for flagged vehicles and subjects',
      category: 'NAVIGATION',
      icon: <ShieldAlert className="w-3.5 h-3.5 text-[#FF4D4D]" />,
      action: () => { onNavigate('watchlists'); onClose(); },
    },
    {
      id: 'nav-copilot',
      title: 'Gemini AI Copilot',
      subtitle: 'Operational query assistant and explainable reasoning',
      category: 'NAVIGATION',
      icon: <Sparkles className="w-3.5 h-3.5 text-[#007AFF]" />,
      action: () => { onNavigate('copilot'); onClose(); },
    },
    {
      id: 'nav-health',
      title: 'System Health',
      subtitle: 'Subsystem diagnostics, liveness, and readiness probes',
      category: 'NAVIGATION',
      icon: <Cpu className="w-3.5 h-3.5 text-[#34C759]" />,
      action: () => { onNavigate('health'); onClose(); },
    },
    {
      id: 'nav-admin',
      title: 'Administration',
      subtitle: 'User access control, role permissions, and audit logs',
      category: 'NAVIGATION',
      icon: <ShieldAlert className="w-3.5 h-3.5 text-[#E0E2E6]" />,
      action: () => { onNavigate('admin'); onClose(); },
    },
  ];

  const filtered = items.filter(
    (i) =>
      i.title.toLowerCase().includes(query.toLowerCase()) ||
      i.subtitle.toLowerCase().includes(query.toLowerCase())
  );

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center pt-24 p-4 bg-[#0A0B0D]/80 backdrop-blur-xs animate-in fade-in duration-150">
      <div
        className={`w-full max-w-xl bg-[#0F1115] border border-[#23262B] shadow-2xl ${tokens.radius.md} overflow-hidden`}
        role="dialog"
        aria-modal="true"
      >
        <div className="flex items-center px-3.5 border-b border-[#23262B] bg-[#14161A]">
          <Search className="w-4 h-4 text-[#6C727A] shrink-0" />
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Type a screen name, camera ID, or operational action..."
            className="w-full h-11 px-3 bg-transparent text-xs text-white placeholder:text-[#6C727A] focus:outline-hidden"
            autoFocus
          />
          <button
            type="button"
            onClick={onClose}
            className="p-1 text-[#6C727A] hover:text-white cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="max-h-72 overflow-y-auto p-2 space-y-1">
          {filtered.length === 0 ? (
            <div className="py-8 text-center text-xs text-[#6C727A] font-mono">
              No matching command target found
            </div>
          ) : (
            filtered.map((item) => (
              <button
                key={item.id}
                type="button"
                onClick={item.action}
                className="w-full flex items-center justify-between p-2 rounded hover:bg-[#1A1D23] text-left transition-colors cursor-pointer group"
              >
                <div className="flex items-center gap-2.5 min-w-0">
                  <div className="p-1.5 rounded bg-[#14161A] border border-[#23262B] shrink-0">
                    {item.icon}
                  </div>
                  <div className="truncate">
                    <div className="text-xs font-semibold text-[#E0E2E6] group-hover:text-white">
                      {item.title}
                    </div>
                    <div className="text-[11px] text-[#6C727A] truncate">
                      {item.subtitle}
                    </div>
                  </div>
                </div>
                <span className="text-[10px] uppercase font-mono text-[#6C727A] px-1.5 py-0.5 bg-[#1A1D23] rounded border border-[#23262B] shrink-0">
                  {item.category}
                </span>
              </button>
            ))
          )}
        </div>

        <div className="flex items-center justify-between px-3.5 py-2 border-t border-[#23262B] bg-[#0F1115] text-[11px] text-[#6C727A] font-mono">
          <span>Navigate with arrows or mouse</span>
          <span className="flex items-center gap-1">
            <kbd className="px-1 py-0.5 bg-[#1A1D23] border border-[#23262B] rounded text-[10px] text-[#A9ACB1]">ESC</kbd> to close
          </span>
        </div>
      </div>
    </div>
  );
};
