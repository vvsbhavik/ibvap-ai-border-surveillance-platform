import React from 'react';
import {
  Camera,
  Grid,
  AlertTriangle,
  ShieldAlert,
  FolderArchive,
  Car,
  Sparkles,
  Activity,
  Settings,
  Shield,
  Lock,
  Network,
  PanelLeftClose,
  PanelLeftOpen,
} from 'lucide-react';
import { PermissionKey } from '../../server/types';

export type NavScreen =
  | 'live'
  | 'alerts'
  | 'incidents'
  | 'anpr'
  | 'analytics'
  | 'copilot'
  | 'evidence'
  | 'cameras'
  | 'health'
  | 'admin';

export interface NavItem {
  id: NavScreen;
  label: string;
  badge?: number | string;
  badgeVariant?: 'critical' | 'attention' | 'neutral';
  icon: React.ComponentType<{ className?: string }>;
  hotkey?: string;
  requiredPermission?: PermissionKey;
}

export interface NavGroup {
  title: string;
  items: NavItem[];
}

export interface SidebarNavProps {
  currentScreen: NavScreen;
  onNavigate: (screen: NavScreen) => void;
  pendingAlertsCount: number;
  openIncidentsCount: number;
  userPermissions?: PermissionKey[];
  isCollapsed?: boolean;
  onToggleCollapse?: () => void;
}

export const SidebarNav: React.FC<SidebarNavProps> = ({
  currentScreen,
  onNavigate,
  pendingAlertsCount,
  openIncidentsCount,
  userPermissions,
  isCollapsed = false,
  onToggleCollapse,
}) => {
  const groups: NavGroup[] = [
    {
      title: 'OPERATIONS',
      items: [
        {
          id: 'live',
          label: 'Live Surveillance Wall',
          icon: Grid,
          hotkey: '1',
          requiredPermission: 'monitoring.view',
        },
        {
          id: 'alerts',
          label: 'Alert Center',
          badge: pendingAlertsCount > 0 ? pendingAlertsCount : undefined,
          badgeVariant: 'critical',
          icon: AlertTriangle,
          hotkey: '2',
          requiredPermission: 'alert.view',
        },
        {
          id: 'incidents',
          label: 'Incident Command',
          badge: openIncidentsCount > 0 ? openIncidentsCount : undefined,
          badgeVariant: 'attention',
          icon: ShieldAlert,
          hotkey: '3',
          requiredPermission: 'incident.view',
        },
      ],
    },
    {
      title: 'INTELLIGENCE',
      items: [
        {
          id: 'copilot',
          label: 'Gemini AI Copilot',
          icon: Sparkles,
          hotkey: '4',
          requiredPermission: 'copilot.use',
        },
        {
          id: 'anpr',
          label: 'ANPR (Indian Registry)',
          icon: Car,
          hotkey: '5',
          requiredPermission: 'anpr.view',
        },
        {
          id: 'analytics',
          label: 'Border Analytics & Graph',
          icon: Network,
          hotkey: '6',
          requiredPermission: 'monitoring.view',
        },
        {
          id: 'evidence',
          label: 'Evidence Vault',
          icon: FolderArchive,
          hotkey: '7',
          requiredPermission: 'evidence.view',
        },
      ],
    },
    {
      title: 'SYSTEM & CLOUD',
      items: [
        {
          id: 'cameras',
          label: 'Camera Management',
          icon: Camera,
          requiredPermission: 'camera.view',
        },
        {
          id: 'health',
          label: 'System Health',
          icon: Activity,
          requiredPermission: 'system_health.view',
        },
        {
          id: 'admin',
          label: 'Admin & Supabase',
          icon: Settings,
          requiredPermission: 'user.view',
        },
      ],
    },
  ];

  return (
    <aside
      className={`bg-[#0F1115] border-r border-[#23262B] flex flex-col justify-between select-none shrink-0 transition-all duration-200 ${
        isCollapsed ? 'w-14' : 'w-56'
      }`}
    >
      <div className="p-2 space-y-4 overflow-y-auto flex-1">
        {groups.map((group) => (
          <div key={group.title} className="space-y-0.5">
            {!isCollapsed && (
              <div className="px-3 py-1 text-[10px] font-semibold tracking-wider text-[#6C727A]">
                {group.title}
              </div>
            )}

            {group.items.map((item) => {
              const Icon = item.icon;
              const isActive = currentScreen === item.id;
              const hasAccess =
                !item.requiredPermission ||
                !userPermissions ||
                userPermissions.includes(item.requiredPermission) ||
                userPermissions.includes('system.configure');

              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => onNavigate(item.id)}
                  className={`w-full flex items-center justify-between px-3 py-2 rounded text-xs font-medium transition-colors cursor-pointer group ${
                    isActive
                      ? 'bg-[#1A1D23] text-white font-semibold shadow-xs'
                      : 'text-[#8A8F98] hover:text-[#E0E2E6] hover:bg-[#14161A]'
                  }`}
                  title={item.label}
                >
                  <div className="flex items-center gap-2.5 min-w-0">
                    <Icon
                      className={`w-4 h-4 shrink-0 transition-colors ${
                        isActive ? 'text-[#007AFF]' : 'text-[#6C727A] group-hover:text-[#E0E2E6]'
                      }`}
                    />
                    {!isCollapsed && (
                      <span className={`truncate ${!hasAccess ? 'text-[#6C727A]' : ''}`}>
                        {item.label}
                      </span>
                    )}
                  </div>

                  {!isCollapsed && (
                    <div className="flex items-center gap-1.5 shrink-0">
                      {!hasAccess && (
                        <span title={`Requires ${item.requiredPermission}`}>
                          <Lock className="w-3 h-3 text-[#6C727A]" />
                        </span>
                      )}
                      {item.badge !== undefined && (
                        <span
                          className={`text-[10px] font-mono-num font-bold px-1.5 py-0.2 rounded-xs ${
                            item.badgeVariant === 'critical'
                              ? 'bg-[#FF4D4D] text-white'
                              : 'bg-[#FF9500] text-black'
                          }`}
                        >
                          {item.badge}
                        </span>
                      )}
                      {item.hotkey && (
                        <kbd className="hidden group-hover:inline-block text-[9px] font-mono-num px-1 py-0.2 bg-[#0F1115] text-[#6C727A] border border-[#23262B] rounded">
                          {item.hotkey}
                        </kbd>
                      )}
                    </div>
                  )}
                </button>
              );
            })}
          </div>
        ))}
      </div>

      {/* Footer / Toggle & Status */}
      <div className="p-2 border-t border-[#23262B] bg-[#0F1115]">
        {onToggleCollapse && (
          <button
            type="button"
            onClick={onToggleCollapse}
            className={`w-full flex items-center ${
              isCollapsed ? 'justify-center' : 'justify-between'
            } px-2 py-1.5 rounded text-xs text-[#8A8F98] hover:text-white hover:bg-[#14161A] transition-colors cursor-pointer mb-1`}
            title={isCollapsed ? 'Expand Sidebar' : 'Collapse Sidebar'}
          >
            <div className="flex items-center gap-2">
              {isCollapsed ? (
                <PanelLeftOpen className="w-4 h-4 text-[#007AFF]" />
              ) : (
                <PanelLeftClose className="w-4 h-4" />
              )}
              {!isCollapsed && <span className="text-[11px]">Collapse Sidebar</span>}
            </div>
          </button>
        )}

        {!isCollapsed && (
          <div className="px-2 py-1 text-[10px] text-[#6C727A]">
            <div className="flex items-center gap-1.5 text-[#A9ACB1] font-medium">
              <Shield className="w-3 h-3 text-[#007AFF]" />
              <span>BSF / IBVAP Border Guard</span>
            </div>
            <div className="text-[9px] text-[#555A62] mt-0.5 font-mono">
              Supabase Connected • AES-256
            </div>
          </div>
        )}
      </div>
    </aside>
  );
};
