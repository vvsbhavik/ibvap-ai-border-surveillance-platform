import React, { useState, useEffect } from 'react';
import {
  Search,
  Sun,
  Moon,
  LogOut,
  Shield,
  ChevronDown,
  UserCheck,
} from 'lucide-react';
import { User, Sector } from '../../server/types';
import { useTheme } from '../../design-system/theme';
import { formatRole } from '../../utils/formatters';
import { canonicalRole } from '../../utils/permissions';

export interface TopCommandBarProps {
  user: User | null;
  sectors: Sector[];
  selectedSectorId: string;
  onSelectSector: (sectorId: string) => void;
  onOpenCommandPalette: () => void;
  onLogout: () => void;
  onSwitchUser?: (callsign: string) => void;
  isRealtimeConnected: boolean;
  systemStatus: 'HEALTHY' | 'ATTENTION' | 'DEGRADED';
}

export const TopCommandBar: React.FC<TopCommandBarProps> = ({
  user,
  sectors,
  selectedSectorId,
  onSelectSector,
  onOpenCommandPalette,
  onLogout,
  onSwitchUser,
  systemStatus,
}) => {
  const { theme, toggleTheme } = useTheme();
  const [time, setTime] = useState(new Date());
  const [isRoleMenuOpen, setIsRoleMenuOpen] = useState(false);

  useEffect(() => {
    const timer = setInterval(() => setTime(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  const zuluTime = time.toISOString().substring(11, 19) + ' UTC';

  const simulatedRoles = [
    { callsign: 'COMMANDER-1', role: 'Administrator', label: 'COMMANDER-1 (Admin)' },
    { callsign: 'SENTINEL-LEAD', role: 'Watch Commander', label: 'SENTINEL-LEAD (Commander)' },
    { callsign: 'WATCH-OP-01', role: 'Surveillance Operator', label: 'WATCH-OP-01 (Operator)' },
    { callsign: 'ANALYST-02', role: 'Evidence Analyst', label: 'ANALYST-02 (Analyst)' },
    { callsign: 'AUDITOR-01', role: 'Security Auditor', label: 'AUDITOR-01 (Auditor)' },
  ];

  return (
    <header className="h-12 w-full bg-[#0F1115] border-b border-[#23262B] px-4 flex items-center justify-between select-none z-30 shrink-0">
      {/* 1. Left: IBVAP Brand & Sector */}
      <div className="flex items-center gap-3">
        <div className="flex items-center gap-2">
          <div className="w-5 h-5 bg-[#007AFF] flex items-center justify-center rounded-xs text-white">
            <div className="w-2 h-2 bg-white rounded-2xs" />
          </div>
          <span className="font-bold tracking-tight text-white text-base leading-none">
            IBVAP
          </span>
          <span className="hidden md:inline-flex px-1.5 py-0.5 text-[10px] font-mono-num font-semibold bg-[#007AFF]/15 text-[#007AFF] border border-[#007AFF]/30 rounded">
            SIMULATION MODE
          </span>
        </div>

        <div className="h-4 w-px bg-[#23262B]" />

        {/* Current Sector Selection */}
        <div className="flex items-center gap-1.5">
          <span className="text-xs text-[#6C727A]">Sector:</span>
          <select
            id="sector-select"
            value={selectedSectorId}
            onChange={(e) => onSelectSector(e.target.value)}
            className="h-7 text-xs bg-[#14161A] text-white border border-[#23262B] rounded px-2 pr-6 appearance-none cursor-pointer focus:outline-hidden focus:border-[#007AFF]"
          >
            <option value="ALL">All Sectors</option>
            {sectors.map((sec) => (
              <option key={sec.id} value={sec.id}>
                {sec.code} • {sec.name}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* 2. Center: Current Time & System Status */}
      <div className="flex items-center gap-4">
        <div className="text-xs font-mono-num text-[#E0E2E6]">
          {zuluTime}
        </div>

        {/* System Status */}
        <div className="flex items-center gap-1.5 px-2 py-0.5 bg-[#14161A] rounded border border-[#23262B]">
          <span
            className={`w-2 h-2 rounded-full ${
              systemStatus === 'HEALTHY'
                ? 'bg-[#34C759]'
                : systemStatus === 'ATTENTION'
                ? 'bg-[#FF9500]'
                : 'bg-[#FF4D4D]'
            }`}
          />
          <span className="text-xs text-[#E0E2E6]">
            {systemStatus === 'HEALTHY' ? 'Operational' : 'Attention'}
          </span>
        </div>
      </div>

      {/* 3. Right: Search & User / Role */}
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={onOpenCommandPalette}
          className="flex items-center gap-2 h-7 px-2.5 bg-[#14161A] hover:bg-[#1A1D23] border border-[#23262B] text-[#6C727A] hover:text-[#E0E2E6] text-xs rounded transition-colors cursor-pointer"
        >
          <Search className="w-3.5 h-3.5" />
          <span className="text-xs hidden sm:inline">Search</span>
          <kbd className="text-[10px] bg-[#0F1115] px-1 py-0.2 border border-[#23262B] rounded text-[#6C727A]">
            ⌘K
          </kbd>
        </button>

        {/* Theme Toggle */}
        <button
          type="button"
          onClick={toggleTheme}
          className="p-1.5 text-[#6C727A] hover:text-white bg-[#14161A] border border-[#23262B] rounded cursor-pointer hover:bg-[#1A1D23] transition-colors"
          title={`Switch to ${theme === 'command-dark' ? 'Light' : 'Dark'} mode`}
        >
          {theme === 'command-dark' ? <Sun className="w-3.5 h-3.5" /> : <Moon className="w-3.5 h-3.5" />}
        </button>

        {/* Current User & Role Quick Switch */}
        {user && (
          <div className="relative flex items-center gap-2 pl-2 border-l border-[#23262B]">
            <div
              className="text-right cursor-pointer group flex items-center gap-1.5"
              onClick={() => setIsRoleMenuOpen(!isRoleMenuOpen)}
              title="Click to quickly switch simulated test roles"
            >
              <div className="hidden sm:block">
                <div className="text-xs font-semibold text-white leading-tight flex items-center gap-1 justify-end">
                  <span>{user.fullName || user.callsign}</span>
                  <ChevronDown className="w-3 h-3 text-[#6C727A] group-hover:text-white transition-colors" />
                </div>
                <div className="text-[10px] text-cyan-400 font-mono leading-tight">
                  {formatRole(user.role)}
                </div>
              </div>
            </div>

            {/* Quick Switch Dropdown */}
            {isRoleMenuOpen && onSwitchUser && (
              <div className="absolute right-8 top-9 w-60 bg-[#0F1115] border border-[#23262B] rounded shadow-2xl p-2 z-50 animate-in fade-in duration-100">
                <div className="flex items-center justify-between pb-1.5 mb-1.5 border-b border-[#23262B]">
                  <span className="text-[10px] font-mono uppercase text-[#6C727A] font-semibold">
                    Simulated Operator Roles
                  </span>
                  <span className="text-[9px] font-mono text-[#007AFF]">SIM DATA</span>
                </div>
                <div className="space-y-1">
                  {simulatedRoles.map((r) => {
                    const isActive = r.callsign === user.callsign;
                    return (
                      <button
                        key={r.callsign}
                        type="button"
                        onClick={() => {
                          setIsRoleMenuOpen(false);
                          onSwitchUser(r.callsign);
                        }}
                        className={`w-full text-left px-2 py-1.5 rounded text-xs transition-colors flex items-center justify-between cursor-pointer ${
                          isActive
                            ? 'bg-[#007AFF]/20 text-white font-medium'
                            : 'text-[#E0E2E6] hover:bg-[#14161A]'
                        }`}
                      >
                        <div>
                          <div className="font-mono text-xs">{r.callsign}</div>
                          <div className="text-[10px] text-[#6C727A]">{r.role}</div>
                        </div>
                        {isActive && <UserCheck className="w-3.5 h-3.5 text-[#007AFF]" />}
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            <button
              type="button"
              onClick={onLogout}
              className="p-1.5 text-[#6C727A] hover:text-[#FF4D4D] bg-[#14161A] border border-[#23262B] rounded cursor-pointer hover:bg-[#1A1D23] transition-colors"
              title="Sign Out of Station Session"
            >
              <LogOut className="w-3.5 h-3.5" />
            </button>
          </div>
        )}
      </div>
    </header>
  );
};
