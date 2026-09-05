import React, { useState, useEffect, useCallback } from 'react';
import {
  Users,
  Shield,
  Key,
  FileText,
  Lock,
  Search as SearchIcon,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  RefreshCw,
  Plus,
  Edit2,
  UserX,
  UserCheck,
  Download,
  RotateCcw,
  Check,
  X,
  Eye,
  Sliders,
  Terminal,
  Activity,
  Calendar,
  Filter,
} from 'lucide-react';
import {
  User,
  UserStatus,
  AuditLog,
  UserRole,
  PermissionKey,
  RoleDefinition,
  PermissionDefinition,
} from '../server/types';
import { api } from '../api/client';
import { Button } from '../components/ui/Button';
import { Badge } from '../components/ui/Badge';
import { Modal } from '../components/ui/Modal';
import { Input } from '../components/ui/Input';
import { Select } from '../components/ui/Select';
import { tokens } from '../design-system/tokens';
import { formatTimestamp, formatRole } from '../utils/formatters';
import {
  ALL_PERMISSIONS,
  DEFAULT_ROLE_DEFINITIONS,
  canonicalRole,
  hasPermission,
} from '../utils/permissions';

export interface AdminScreenProps {
  currentUser?: User | null;
  users?: User[];
  auditLogs?: AuditLog[];
  onRefreshData?: () => void;
}

export const AdminScreen: React.FC<AdminScreenProps> = ({
  currentUser,
  users: propUsers = [],
  auditLogs: propAuditLogs = [],
  onRefreshData,
}) => {
  const [activeTab, setActiveTab] = useState<
    'USERS' | 'ROLES' | 'AUDIT' | 'SECURITY'
  >('USERS');

  // Operational State
  const [usersList, setUsersList] = useState<User[]>(propUsers);
  const [auditLogsList, setAuditLogsList] = useState<AuditLog[]>(propAuditLogs);
  const [rolesList, setRolesList] = useState<RoleDefinition[]>(DEFAULT_ROLE_DEFINITIONS);
  const [isLoading, setIsLoading] = useState(false);
  const [feedbackMsg, setFeedbackMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // User tab state
  const [userSearch, setUserSearch] = useState('');
  const [roleFilter, setRoleFilter] = useState('ALL');
  const [statusFilter, setStatusFilter] = useState('ALL');
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [selectedUserForEdit, setSelectedUserForEdit] = useState<User | null>(null);
  const [inspectUserPermissions, setInspectUserPermissions] = useState<User | null>(null);

  // User form state
  const [formCallsign, setFormCallsign] = useState('');
  const [formFullName, setFormFullName] = useState('');
  const [formEmail, setFormEmail] = useState('');
  const [formRole, setFormRole] = useState<UserRole>('FIELD_OPERATOR');
  const [formBadgeNumber, setFormBadgeNumber] = useState('');
  const [formSector, setFormSector] = useState('sec-04');
  const [formPassword, setFormPassword] = useState('');
  const [formStatus, setFormStatus] = useState<UserStatus>('ACTIVE');

  // Roles & Matrix tab state
  const [selectedRoleKey, setSelectedRoleKey] = useState<UserRole>('FIELD_OPERATOR');
  const [roleEditPermissions, setRoleEditPermissions] = useState<PermissionKey[]>([]);
  const [isSavingRole, setIsSavingRole] = useState(false);
  const [matrixViewMode, setMatrixViewMode] = useState<'CARD' | 'MATRIX'>('CARD');

  // Audit tab state
  const [auditSearch, setAuditSearch] = useState('');
  const [auditOperatorFilter, setAuditOperatorFilter] = useState('');
  const [auditActionFilter, setAuditActionFilter] = useState('');
  const [auditResourceFilter, setAuditResourceFilter] = useState('');
  const [auditResultFilter, setAuditResultFilter] = useState('ALL');
  const [inspectAuditLog, setInspectAuditLog] = useState<AuditLog | null>(null);
  const [isExportingAudit, setIsExportingAudit] = useState(false);

  // Security tab state
  const [securityConfig, setSecurityConfig] = useState({
    sessionTimeoutMinutes: 480,
    maxLoginAttempts: 5,
    lockoutDurationMinutes: 5,
    requireStrongPassword: true,
  });

  // Sync prop changes
  useEffect(() => {
    if (propUsers && propUsers.length > 0) {
      setUsersList(propUsers);
    }
  }, [propUsers]);

  useEffect(() => {
    if (propAuditLogs && propAuditLogs.length > 0) {
      setAuditLogsList(propAuditLogs);
    }
  }, [propAuditLogs]);

  // Load live roles from backend
  const loadRoles = useCallback(async () => {
    try {
      const res = await api.users.listRoles();
      if (res.roles) {
        setRolesList(res.roles);
      }
    } catch {
      // Use client default definitions fallback
      setRolesList(DEFAULT_ROLE_DEFINITIONS);
    }
  }, []);

  // Load audit logs with filters
  const loadAuditLogs = useCallback(async () => {
    try {
      const res = await api.system.auditLogs({
        limit: 150,
        search: auditSearch || undefined,
        userCallsign: auditOperatorFilter || undefined,
        action: auditActionFilter || undefined,
        resourceType: auditResourceFilter || undefined,
        result: auditResultFilter !== 'ALL' ? auditResultFilter : undefined,
      });
      if (res.logs) {
        setAuditLogsList(res.logs);
      }
    } catch {
      // ignore
    }
  }, [auditSearch, auditOperatorFilter, auditActionFilter, auditResourceFilter, auditResultFilter]);

  // Load live users list
  const loadUsers = useCallback(async () => {
    try {
      const res = await api.users.list();
      if (res.users) {
        setUsersList(res.users);
      }
    } catch {
      // ignore
    }
  }, []);

  useEffect(() => {
    loadRoles();
    loadUsers();
  }, [loadRoles, loadUsers]);

  useEffect(() => {
    if (activeTab === 'AUDIT') {
      loadAuditLogs();
    }
  }, [activeTab, loadAuditLogs]);

  // Synchronize selected role permissions when selected role changes
  useEffect(() => {
    const roleDef = rolesList.find((r) => canonicalRole(r.role) === canonicalRole(selectedRoleKey));
    if (roleDef) {
      setRoleEditPermissions([...roleDef.permissions]);
    }
  }, [selectedRoleKey, rolesList]);

  // Feedback timer helper
  const showFeedback = (type: 'success' | 'error', text: string) => {
    setFeedbackMsg({ type, text });
    setTimeout(() => setFeedbackMsg(null), 5000);
  };

  // ==========================================================================
  // User Management Actions
  // ==========================================================================
  const handleOpenCreateModal = () => {
    setFormCallsign('');
    setFormFullName('');
    setFormEmail('');
    setFormRole('FIELD_OPERATOR');
    setFormBadgeNumber(`B-${Math.floor(1000 + Math.random() * 9000)}`);
    setFormSector('sec-04');
    setFormPassword('IBVAP-Terminal-2026!');
    setFormStatus('ACTIVE');
    setIsCreateModalOpen(true);
  };

  const handleCreateUserSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formCallsign || !formFullName || !formEmail) {
      showFeedback('error', 'Callsign, full name, and official email are required.');
      return;
    }

    setIsLoading(true);
    try {
      const res = await api.users.create({
        callsign: formCallsign.trim().toUpperCase(),
        fullName: formFullName.trim(),
        email: formEmail.trim().toLowerCase(),
        role: formRole,
        badgeNumber: formBadgeNumber.trim(),
        sectorAssignmentId: formSector,
        password: formPassword || 'IBVAP-Terminal-2026!',
        status: formStatus,
      });

      showFeedback('success', `Operator ${res.user.callsign} successfully registered.`);
      setIsCreateModalOpen(false);
      await loadUsers();
      if (onRefreshData) onRefreshData();
    } catch (err: unknown) {
      showFeedback('error', (err as Error).message || 'Failed to create operator account.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleOpenEditModal = (user: User) => {
    setSelectedUserForEdit(user);
    setFormCallsign(user.callsign);
    setFormFullName(user.fullName);
    setFormEmail(user.email);
    setFormRole(canonicalRole(user.role));
    setFormBadgeNumber(user.badgeNumber || '');
    setFormSector(user.sectorAssignmentId || 'sec-04');
    setFormPassword('');
    setFormStatus(user.status);
    setIsEditModalOpen(true);
  };

  const handleEditUserSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedUserForEdit) return;

    setIsLoading(true);
    try {
      await api.users.update(selectedUserForEdit.id, {
        fullName: formFullName.trim(),
        email: formEmail.trim().toLowerCase(),
        role: formRole,
        badgeNumber: formBadgeNumber.trim(),
        sectorAssignmentId: formSector,
        status: formStatus,
        ...(formPassword ? { password: formPassword } : {}),
      });

      showFeedback('success', `Operator ${selectedUserForEdit.callsign} updated successfully.`);
      setIsEditModalOpen(false);
      await loadUsers();
      if (onRefreshData) onRefreshData();
    } catch (err: unknown) {
      showFeedback('error', (err as Error).message || 'Failed to update operator account.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleToggleUserStatus = async (user: User) => {
    setIsLoading(true);
    try {
      if (user.status === 'ACTIVE') {
        await api.users.disable(user.id, 'Administrative suspension via RBAC Console');
        showFeedback('success', `Operator ${user.callsign} deactivated and active sessions revoked.`);
      } else {
        await api.users.enable(user.id);
        showFeedback('success', `Operator ${user.callsign} reactivated.`);
      }
      await loadUsers();
      if (onRefreshData) onRefreshData();
    } catch (err: unknown) {
      showFeedback('error', (err as Error).message || 'Failed to change operator status.');
    } finally {
      setIsLoading(false);
    }
  };

  // ==========================================================================
  // Role & Permissions Actions
  // ==========================================================================
  const handleTogglePermission = (key: PermissionKey) => {
    setRoleEditPermissions((prev) =>
      prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key]
    );
  };

  const handleSaveRolePermissions = async () => {
    setIsSavingRole(true);
    try {
      const res = await api.users.updateRolePermissions(selectedRoleKey, roleEditPermissions);
      showFeedback('success', `Updated permissions matrix for ${formatRole(selectedRoleKey)}.`);
      await loadRoles();
      await loadUsers();
      if (onRefreshData) onRefreshData();
    } catch (err: unknown) {
      showFeedback('error', (err as Error).message || 'Failed to save role permissions.');
    } finally {
      setIsSavingRole(false);
    }
  };

  const handleResetRoleDefaults = async () => {
    if (!window.confirm(`Reset ${formatRole(selectedRoleKey)} permissions to factory defaults?`)) {
      return;
    }
    setIsSavingRole(true);
    try {
      await api.users.resetRolePermissions(selectedRoleKey);
      showFeedback('success', `Reset ${formatRole(selectedRoleKey)} to default policy.`);
      await loadRoles();
      await loadUsers();
      if (onRefreshData) onRefreshData();
    } catch (err: unknown) {
      showFeedback('error', (err as Error).message || 'Failed to reset role.');
    } finally {
      setIsSavingRole(false);
    }
  };

  // ==========================================================================
  // Audit Trail Actions
  // ==========================================================================
  const handleExportAuditVault = async () => {
    setIsExportingAudit(true);
    try {
      const res = await api.system.exportAuditLogs();
      const jsonString = `data:text/json;charset=utf-8,${encodeURIComponent(
        JSON.stringify(res, null, 2)
      )}`;
      const downloadAnchor = document.createElement('a');
      downloadAnchor.setAttribute('href', jsonString);
      downloadAnchor.setAttribute(
        'download',
        `IBVAP_AUDIT_EXPORT_${new Date().toISOString().replace(/[:.]/g, '-')}.json`
      );
      document.body.appendChild(downloadAnchor);
      downloadAnchor.click();
      downloadAnchor.remove();

      showFeedback('success', `Exported ${res.totalRecords} immutable audit entries.`);
    } catch (err: unknown) {
      showFeedback('error', (err as Error).message || 'Failed to export audit logs.');
    } finally {
      setIsExportingAudit(false);
    }
  };

  // Group permissions by module
  const permissionCategories: Record<string, PermissionDefinition[]> = {};
  ALL_PERMISSIONS.forEach((p) => {
    if (!permissionCategories[p.category]) {
      permissionCategories[p.category] = [];
    }
    permissionCategories[p.category].push(p);
  });

  // Filtered users
  const filteredUsers = usersList.filter((u) => {
    const term = userSearch.toLowerCase();
    const matchSearch =
      (u.fullName || '').toLowerCase().includes(term) ||
      (u.callsign || '').toLowerCase().includes(term) ||
      (u.email || '').toLowerCase().includes(term) ||
      (u.badgeNumber || '').toLowerCase().includes(term);

    const matchRole =
      roleFilter === 'ALL' || canonicalRole(u.role) === canonicalRole(roleFilter as UserRole);

    const matchStatus = statusFilter === 'ALL' || u.status === statusFilter;

    return matchSearch && matchRole && matchStatus;
  });

  // Role color helper
  const getRoleBadgeVariant = (role: string): 'critical' | 'attention' | 'neutral' | 'healthy' | 'info' => {
    const canonical = canonicalRole(role);
    switch (canonical) {
      case 'ADMINISTRATOR':
      case 'SYSTEM_ADMINISTRATOR':
        return 'critical';
      case 'WATCH_COMMANDER':
        return 'attention';
      case 'FIELD_OPERATOR':
      case 'SURVEILLANCE_OPERATOR':
        return 'healthy';
      case 'FORENSIC_ANALYST':
      case 'EVIDENCE_INVESTIGATOR':
        return 'info';
      case 'SECURITY_AUDITOR':
      default:
        return 'neutral';
    }
  };

  return (
    <div className="flex-1 flex flex-col gap-4 p-4 sm:p-5 overflow-y-auto select-none">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-[#23262B] pb-3 shrink-0">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-base font-semibold text-white tracking-tight">
              Security & Identity Administration
            </h1>
            <span className="px-1.5 py-0.5 text-[10px] font-mono-num font-semibold bg-[#007AFF]/15 text-[#007AFF] border border-[#007AFF]/30 rounded">
              SIMULATED DATA
            </span>
          </div>
          <p className="text-xs text-[#6C727A] mt-0.5">
            Role-based authorization engine (RBAC), operator account directory, immutable audit vault, and security policies.
          </p>
        </div>

        {/* Global Tab Navigation */}
        <div className="inline-flex bg-[#0F1115] p-1 border border-[#23262B] rounded text-xs">
          <button
            type="button"
            onClick={() => setActiveTab('USERS')}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded font-medium cursor-pointer transition-colors ${
              activeTab === 'USERS'
                ? 'bg-[#23262B] text-white shadow-xs'
                : 'text-[#6C727A] hover:text-[#E0E2E6]'
            }`}
          >
            <Users className="w-3.5 h-3.5" />
            Operators ({usersList.length})
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('ROLES')}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded font-medium cursor-pointer transition-colors ${
              activeTab === 'ROLES'
                ? 'bg-[#23262B] text-white shadow-xs'
                : 'text-[#6C727A] hover:text-[#E0E2E6]'
            }`}
          >
            <Shield className="w-3.5 h-3.5" />
            Roles & Matrix
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('AUDIT')}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded font-medium cursor-pointer transition-colors ${
              activeTab === 'AUDIT'
                ? 'bg-[#23262B] text-white shadow-xs'
                : 'text-[#6C727A] hover:text-[#E0E2E6]'
            }`}
          >
            <FileText className="w-3.5 h-3.5" />
            Audit Vault ({auditLogsList.length})
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('SECURITY')}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded font-medium cursor-pointer transition-colors ${
              activeTab === 'SECURITY'
                ? 'bg-[#23262B] text-white shadow-xs'
                : 'text-[#6C727A] hover:text-[#E0E2E6]'
            }`}
          >
            <Lock className="w-3.5 h-3.5" />
            Policy & Sessions
          </button>
        </div>
      </div>

      {/* Toast Feedback Message */}
      {feedbackMsg && (
        <div
          className={`px-4 py-2.5 rounded border text-xs flex items-center justify-between transition-all ${
            feedbackMsg.type === 'success'
              ? 'bg-emerald-950/50 border-emerald-500/40 text-emerald-300'
              : 'bg-rose-950/50 border-rose-500/40 text-rose-300'
          }`}
        >
          <div className="flex items-center gap-2">
            {feedbackMsg.type === 'success' ? (
              <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-400" />
            ) : (
              <AlertTriangle className="w-4 h-4 shrink-0 text-rose-400" />
            )}
            <span>{feedbackMsg.text}</span>
          </div>
          <button
            type="button"
            onClick={() => setFeedbackMsg(null)}
            className="text-[#6C727A] hover:text-white cursor-pointer"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* ================================================================== */}
      {/* TAB 1: OPERATOR USERS DIRECTORY */}
      {/* ================================================================== */}
      {activeTab === 'USERS' && (
        <div className="flex flex-col gap-4">
          {/* Controls Bar */}
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 bg-[#0F1115] p-3 border border-[#23262B] rounded">
            <div className="flex flex-wrap items-center gap-2 flex-1">
              <div className="relative min-w-[200px] flex-1 sm:max-w-xs">
                <SearchIcon className="w-3.5 h-3.5 absolute left-2.5 top-2.5 text-[#6C727A]" />
                <input
                  type="text"
                  placeholder="Search callsign, name, badge, email..."
                  value={userSearch}
                  onChange={(e) => setUserSearch(e.target.value)}
                  className="w-full pl-8 pr-3 py-1.5 bg-[#14161A] border border-[#23262B] rounded text-xs text-white placeholder-[#6C727A] focus:outline-hidden focus:border-[#007AFF]"
                />
              </div>

              {/* Role filter */}
              <select
                value={roleFilter}
                onChange={(e) => setRoleFilter(e.target.value)}
                className="h-8 px-2.5 text-xs bg-[#14161A] text-white border border-[#23262B] rounded cursor-pointer focus:outline-hidden focus:border-[#007AFF]"
              >
                <option value="ALL">All Roles</option>
                <option value="ADMINISTRATOR">Administrator</option>
                <option value="WATCH_COMMANDER">Watch Commander</option>
                <option value="FIELD_OPERATOR">Surveillance Operator</option>
                <option value="FORENSIC_ANALYST">Evidence Analyst</option>
                <option value="SECURITY_AUDITOR">Security Auditor</option>
              </select>

              {/* Status filter */}
              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
                className="h-8 px-2.5 text-xs bg-[#14161A] text-white border border-[#23262B] rounded cursor-pointer focus:outline-hidden focus:border-[#007AFF]"
              >
                <option value="ALL">All Statuses</option>
                <option value="ACTIVE">Active Only</option>
                <option value="DISABLED">Disabled Only</option>
                <option value="SUSPENDED">Suspended</option>
              </select>
            </div>

            <div className="flex items-center gap-2">
              <Button
                variant="primary"
                size="sm"
                onClick={handleOpenCreateModal}
                leftIcon={<Plus className="w-3.5 h-3.5" />}
              >
                Provision Operator
              </Button>
            </div>
          </div>

          {/* Operator Directory Table */}
          <div className="bg-[#0F1115] border border-[#23262B] rounded overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs border-collapse">
                <thead>
                  <tr className="bg-[#14161A] border-b border-[#23262B] text-[#6C727A] uppercase tracking-wider font-semibold">
                    <th className="py-2.5 px-3">Operator</th>
                    <th className="py-2.5 px-3">Callsign</th>
                    <th className="py-2.5 px-3">Assigned Role</th>
                    <th className="py-2.5 px-3">Badge & Sector</th>
                    <th className="py-2.5 px-3">Status</th>
                    <th className="py-2.5 px-3">Clearance / Perms</th>
                    <th className="py-2.5 px-3">Last Active</th>
                    <th className="py-2.5 px-3 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#23262B]">
                  {filteredUsers.length === 0 ? (
                    <tr>
                      <td colSpan={8} className="py-8 text-center text-[#6C727A]">
                        No operators found matching the criteria.
                      </td>
                    </tr>
                  ) : (
                    filteredUsers.map((u) => {
                      const canonical = canonicalRole(u.role);
                      const permsCount = u.permissions?.length || 0;
                      return (
                        <tr
                          key={u.id}
                          className="hover:bg-[#14161A]/60 transition-colors"
                        >
                          <td className="py-2.5 px-3">
                            <div className="font-medium text-white">{u.fullName}</div>
                            <div className="text-[10px] text-[#6C727A] font-mono">{u.email}</div>
                          </td>
                          <td className="py-2.5 px-3 font-mono font-semibold text-[#007AFF]">
                            {u.callsign}
                          </td>
                          <td className="py-2.5 px-3">
                            <Badge variant={getRoleBadgeVariant(canonical)} size="sm">
                              {formatRole(canonical)}
                            </Badge>
                          </td>
                          <td className="py-2.5 px-3 font-mono text-[#E0E2E6]">
                            <div>{u.badgeNumber || '—'}</div>
                            <div className="text-[10px] text-[#6C727A]">{u.sectorAssignmentId || 'ALL'}</div>
                          </td>
                          <td className="py-2.5 px-3">
                            <span
                              className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded text-[10px] font-mono font-semibold ${
                                u.status === 'ACTIVE'
                                  ? 'bg-emerald-950/60 text-emerald-400 border border-emerald-500/30'
                                  : 'bg-rose-950/60 text-rose-400 border border-rose-500/30'
                              }`}
                            >
                              <span
                                className={`w-1.5 h-1.5 rounded-full ${
                                  u.status === 'ACTIVE' ? 'bg-emerald-400' : 'bg-rose-400'
                                }`}
                              />
                              {u.status}
                            </span>
                          </td>
                          <td className="py-2.5 px-3">
                            <button
                              type="button"
                              onClick={() => setInspectUserPermissions(u)}
                              className="text-[11px] text-cyan-400 hover:text-cyan-300 underline font-mono cursor-pointer flex items-center gap-1"
                              title="Inspect resolved permission capabilities"
                            >
                              <Eye className="w-3 h-3" />
                              {permsCount > 0 ? `${permsCount} Permissions` : 'View Perms'}
                            </button>
                          </td>
                          <td className="py-2.5 px-3 font-mono text-[11px] text-[#6C727A]">
                            {u.lastLoginAt ? formatTimestamp(u.lastLoginAt) : 'Never logged in'}
                          </td>
                          <td className="py-2.5 px-3 text-right">
                            <div className="inline-flex items-center gap-1.5">
                              <button
                                type="button"
                                onClick={() => handleOpenEditModal(u)}
                                className="p-1 text-[#6C727A] hover:text-white bg-[#14161A] border border-[#23262B] rounded cursor-pointer transition-colors"
                                title="Edit operator profile"
                              >
                                <Edit2 className="w-3.5 h-3.5" />
                              </button>

                              <button
                                type="button"
                                onClick={() => handleToggleUserStatus(u)}
                                className={`p-1 border border-[#23262B] rounded cursor-pointer transition-colors ${
                                  u.status === 'ACTIVE'
                                    ? 'text-rose-400 hover:text-rose-300 hover:bg-rose-950/40'
                                    : 'text-emerald-400 hover:text-emerald-300 hover:bg-emerald-950/40'
                                }`}
                                title={u.status === 'ACTIVE' ? 'Revoke / Deactivate terminal' : 'Reactivate account'}
                              >
                                {u.status === 'ACTIVE' ? (
                                  <UserX className="w-3.5 h-3.5" />
                                ) : (
                                  <UserCheck className="w-3.5 h-3.5" />
                                )}
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* ================================================================== */}
      {/* TAB 2: ROLES DEFINITIONS & GRANULAR PERMISSIONS MATRIX */}
      {/* ================================================================== */}
      {activeTab === 'ROLES' && (
        <div className="flex flex-col gap-4">
          {/* Top Bar with View Mode Toggle */}
          <div className="flex items-center justify-between bg-[#0F1115] p-3 border border-[#23262B] rounded">
            <div>
              <h2 className="text-sm font-semibold text-white">
                Role-Based Access Control (RBAC) Governance Matrix
              </h2>
              <p className="text-xs text-[#6C727A]">
                Configure fine-grained operational permissions enforced by backend security middleware.
              </p>
            </div>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setMatrixViewMode('CARD')}
                className={`px-3 py-1 rounded text-xs font-medium cursor-pointer transition-colors ${
                  matrixViewMode === 'CARD'
                    ? 'bg-[#007AFF] text-white'
                    : 'bg-[#14161A] text-[#6C727A] hover:text-white border border-[#23262B]'
                }`}
              >
                Role Editor
              </button>
              <button
                type="button"
                onClick={() => setMatrixViewMode('MATRIX')}
                className={`px-3 py-1 rounded text-xs font-medium cursor-pointer transition-colors ${
                  matrixViewMode === 'MATRIX'
                    ? 'bg-[#007AFF] text-white'
                    : 'bg-[#14161A] text-[#6C727A] hover:text-white border border-[#23262B]'
                }`}
              >
                Comparative Matrix
              </button>
            </div>
          </div>

          {/* VIEW MODE 1: Interactive Role Editor */}
          {matrixViewMode === 'CARD' && (
            <div className="grid grid-cols-1 lg:grid-cols-4 gap-4">
              {/* Left Column: Role Selector Cards */}
              <div className="lg:col-span-1 space-y-2">
                <div className="text-xs font-semibold text-[#6C727A] uppercase tracking-wider px-1">
                  Canonical Roles
                </div>

                {rolesList.map((r) => {
                  const canonical = canonicalRole(r.role);
                  const isSelected = canonical === canonicalRole(selectedRoleKey);
                  const assignedCount = usersList.filter(
                    (u) => canonicalRole(u.role) === canonical && u.status === 'ACTIVE'
                  ).length;
                  const permsCount = r.permissions?.length || 0;

                  return (
                    <div
                      key={canonical}
                      onClick={() => setSelectedRoleKey(canonical)}
                      className={`p-3 border rounded cursor-pointer transition-all ${
                        isSelected
                          ? 'bg-[#14161A] border-[#007AFF] shadow-md ring-1 ring-[#007AFF]/30'
                          : 'bg-[#0F1115] border-[#23262B] hover:border-[#383D47]'
                      }`}
                    >
                      <div className="flex items-center justify-between mb-1">
                        <span className="font-semibold text-xs text-white">
                          {r.name || formatRole(canonical)}
                        </span>
                        <Badge variant={getRoleBadgeVariant(canonical)} size="sm">
                          {canonical}
                        </Badge>
                      </div>

                      <p className="text-[11px] text-[#6C727A] line-clamp-2 leading-relaxed mb-2">
                        {r.description}
                      </p>

                      <div className="flex items-center justify-between text-[10px] font-mono text-[#6C727A] pt-2 border-t border-[#23262B]">
                        <span>{assignedCount} Active Operators</span>
                        <span className="text-cyan-400">{permsCount} / {ALL_PERMISSIONS.length} Perms</span>
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Right Column: Interactive Permission Checklists */}
              <div className="lg:col-span-3 bg-[#0F1115] border border-[#23262B] rounded p-4 flex flex-col justify-between">
                <div>
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-3 border-b border-[#23262B] mb-4">
                    <div>
                      <div className="flex items-center gap-2">
                        <h3 className="text-sm font-bold text-white">
                          Policy Configuration for: {formatRole(selectedRoleKey)}
                        </h3>
                        <Badge variant={getRoleBadgeVariant(selectedRoleKey)} size="sm">
                          {canonicalRole(selectedRoleKey)}
                        </Badge>
                      </div>
                      <p className="text-xs text-[#6C727A] mt-0.5">
                        Toggle specific authorization grants. Backend strictly enforces these upon every API request.
                      </p>
                    </div>

                    <div className="flex items-center gap-2">
                      <Button
                        variant="secondary"
                        size="sm"
                        onClick={handleResetRoleDefaults}
                        disabled={isSavingRole}
                        leftIcon={<RotateCcw className="w-3.5 h-3.5" />}
                      >
                        Reset Defaults
                      </Button>
                      <Button
                        variant="primary"
                        size="sm"
                        onClick={handleSaveRolePermissions}
                        isLoading={isSavingRole}
                        leftIcon={<Check className="w-3.5 h-3.5" />}
                      >
                        Save Role Policy
                      </Button>
                    </div>
                  </div>

                  {/* Permissions Category Groups */}
                  <div className="space-y-6 max-h-[60vh] overflow-y-auto pr-2">
                    {Object.entries(permissionCategories).map(([category, items]) => (
                      <div key={category} className="space-y-2">
                        <div className="text-xs font-mono font-semibold uppercase text-cyan-400 tracking-wider flex items-center gap-2">
                          <span>{category}</span>
                          <div className="h-px bg-[#23262B] flex-1" />
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                          {items.map((perm) => {
                            const isChecked = roleEditPermissions.includes(perm.key);
                            return (
                              <label
                                key={perm.key}
                                className={`flex items-start gap-2.5 p-2.5 rounded border transition-colors cursor-pointer select-none ${
                                  isChecked
                                    ? 'bg-[#14161A] border-[#007AFF]/40 hover:border-[#007AFF]'
                                    : 'bg-[#0A0B0D]/50 border-[#23262B] hover:border-[#383D47]'
                                }`}
                              >
                                <input
                                  type="checkbox"
                                  checked={isChecked}
                                  onChange={() => handleTogglePermission(perm.key)}
                                  className="mt-0.5 h-4 w-4 rounded border-[#23262B] bg-[#14161A] text-[#007AFF] focus:ring-0 focus:ring-offset-0 cursor-pointer"
                                />
                                <div className="flex-1">
                                  <div className="flex items-center justify-between">
                                    <span className="text-xs font-medium text-white">
                                      {perm.label}
                                    </span>
                                    <span className="text-[10px] font-mono text-[#6C727A]">
                                      {perm.key}
                                    </span>
                                  </div>
                                  <p className="text-[11px] text-[#6C727A] leading-normal mt-0.5">
                                    {perm.description}
                                  </p>
                                </div>
                              </label>
                            );
                          })}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="pt-3 border-t border-[#23262B] flex items-center justify-between text-xs text-[#6C727A] mt-4">
                  <span>
                    Granted: {roleEditPermissions.length} of {ALL_PERMISSIONS.length} capabilities
                  </span>
                  <span className="font-mono text-[10px] text-emerald-400">
                    ENFORCEMENT: BACKEND STRICT
                  </span>
                </div>
              </div>
            </div>
          )}

          {/* VIEW MODE 2: Comparative Full Matrix */}
          {matrixViewMode === 'MATRIX' && (
            <div className="bg-[#0F1115] border border-[#23262B] rounded overflow-hidden">
              <div className="overflow-x-auto max-h-[75vh]">
                <table className="w-full text-left text-xs border-collapse">
                  <thead className="sticky top-0 z-10">
                    <tr className="bg-[#14161A] border-b border-[#23262B] text-[#6C727A] uppercase tracking-wider font-semibold">
                      <th className="py-3 px-4 min-w-[240px]">Permission Key / Capability</th>
                      <th className="py-3 px-3 text-center">Administrator</th>
                      <th className="py-3 px-3 text-center">Watch Commander</th>
                      <th className="py-3 px-3 text-center">Surveillance Op</th>
                      <th className="py-3 px-3 text-center">Evidence Analyst</th>
                      <th className="py-3 px-3 text-center">Security Auditor</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#23262B]">
                    {ALL_PERMISSIONS.map((perm) => (
                      <tr key={perm.key} className="hover:bg-[#14161A]/50">
                        <td className="py-2.5 px-4">
                          <div className="font-semibold text-white">{perm.label}</div>
                          <div className="text-[10px] font-mono text-cyan-400">{perm.key}</div>
                        </td>

                        {(
                          [
                            'ADMINISTRATOR',
                            'WATCH_COMMANDER',
                            'FIELD_OPERATOR',
                            'FORENSIC_ANALYST',
                            'SECURITY_AUDITOR',
                          ] as UserRole[]
                        ).map((roleKey) => {
                          const roleDef = rolesList.find(
                            (r) => canonicalRole(r.role) === roleKey
                          );
                          const isAllowed = roleDef?.permissions?.includes(perm.key) || false;
                          return (
                            <td key={roleKey} className="py-2.5 px-3 text-center">
                              {isAllowed ? (
                                <span className="inline-flex items-center justify-center w-6 h-6 rounded bg-emerald-950/70 border border-emerald-500/40 text-emerald-400">
                                  <Check className="w-3.5 h-3.5" />
                                </span>
                              ) : (
                                <span className="inline-flex items-center justify-center w-6 h-6 rounded bg-[#14161A] text-[#383D47]">
                                  <X className="w-3.5 h-3.5" />
                                </span>
                              )}
                            </td>
                          );
                        })}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ================================================================== */}
      {/* TAB 3: IMMUTABLE AUDIT VAULT */}
      {/* ================================================================== */}
      {activeTab === 'AUDIT' && (
        <div className="flex flex-col gap-4">
          {/* Audit Controls & Filters */}
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 bg-[#0F1115] p-3 border border-[#23262B] rounded">
            <div className="flex flex-wrap items-center gap-2 flex-1">
              <div className="relative min-w-[200px] flex-1 sm:max-w-xs">
                <SearchIcon className="w-3.5 h-3.5 absolute left-2.5 top-2.5 text-[#6C727A]" />
                <input
                  type="text"
                  placeholder="Search logs, details, IDs..."
                  value={auditSearch}
                  onChange={(e) => setAuditSearch(e.target.value)}
                  className="w-full pl-8 pr-3 py-1.5 bg-[#14161A] border border-[#23262B] rounded text-xs text-white placeholder-[#6C727A] focus:outline-hidden focus:border-[#007AFF]"
                />
              </div>

              {/* Resource Filter */}
              <select
                value={auditResourceFilter}
                onChange={(e) => setAuditResourceFilter(e.target.value)}
                className="h-8 px-2.5 text-xs bg-[#14161A] text-white border border-[#23262B] rounded cursor-pointer focus:outline-hidden focus:border-[#007AFF]"
              >
                <option value="">All Resources</option>
                <option value="AUTH">AUTH</option>
                <option value="USER">USER</option>
                <option value="ROLE">ROLE</option>
                <option value="CAMERA">CAMERA</option>
                <option value="ALERT">ALERT</option>
                <option value="INCIDENT">INCIDENT</option>
                <option value="EVIDENCE">EVIDENCE</option>
                <option value="SYSTEM">SYSTEM</option>
              </select>

              {/* Result Filter */}
              <select
                value={auditResultFilter}
                onChange={(e) => setAuditResultFilter(e.target.value)}
                className="h-8 px-2.5 text-xs bg-[#14161A] text-white border border-[#23262B] rounded cursor-pointer focus:outline-hidden focus:border-[#007AFF]"
              >
                <option value="ALL">All Results</option>
                <option value="SUCCESS">SUCCESS</option>
                <option value="FAILURE">FAILURE</option>
                <option value="DENIED">DENIED (RBAC)</option>
              </select>

              <Button
                variant="secondary"
                size="sm"
                onClick={loadAuditLogs}
                leftIcon={<RefreshCw className="w-3 h-3" />}
              >
                Refresh
              </Button>
            </div>

            <Button
              variant="secondary"
              size="sm"
              onClick={handleExportAuditVault}
              isLoading={isExportingAudit}
              leftIcon={<Download className="w-3.5 h-3.5" />}
            >
              Export Sealed Audit Package
            </Button>
          </div>

          {/* Audit Logs Table */}
          <div className="bg-[#0F1115] border border-[#23262B] rounded overflow-hidden">
            <div className="overflow-x-auto max-h-[70vh]">
              <table className="w-full text-left text-xs border-collapse">
                <thead className="sticky top-0 z-10">
                  <tr className="bg-[#14161A] border-b border-[#23262B] text-[#6C727A] uppercase tracking-wider font-semibold">
                    <th className="py-2.5 px-3">Timestamp (UTC)</th>
                    <th className="py-2.5 px-3">Operator</th>
                    <th className="py-2.5 px-3">Role</th>
                    <th className="py-2.5 px-3">Action</th>
                    <th className="py-2.5 px-3">Resource Target</th>
                    <th className="py-2.5 px-3">Terminal IP</th>
                    <th className="py-2.5 px-3">Result</th>
                    <th className="py-2.5 px-3 text-right">Details</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#23262B]">
                  {auditLogsList.length === 0 ? (
                    <tr>
                      <td colSpan={8} className="py-8 text-center text-[#6C727A]">
                        No audit log entries recorded.
                      </td>
                    </tr>
                  ) : (
                    auditLogsList.map((log) => {
                      const isDenied = log.result === 'DENIED';
                      const isFailure = log.result === 'FAILURE';
                      return (
                        <tr
                          key={log.id}
                          className="hover:bg-[#14161A]/50 transition-colors font-mono text-[11px]"
                        >
                          <td className="py-2.5 px-3 text-[#E0E2E6]">
                            {formatTimestamp(log.timestamp)}
                          </td>
                          <td className="py-2.5 px-3 font-semibold text-white">
                            {log.userCallsign}
                          </td>
                          <td className="py-2.5 px-3">
                            <span className="text-[10px] text-[#6C727A]">
                              {log.userRole ? canonicalRole(log.userRole) : '—'}
                            </span>
                          </td>
                          <td className="py-2.5 px-3 font-semibold text-cyan-400">
                            {log.action}
                          </td>
                          <td className="py-2.5 px-3 text-[#E0E2E6]">
                            <span className="text-[#6C727A]">{log.resourceType}: </span>
                            {log.resourceId}
                          </td>
                          <td className="py-2.5 px-3 text-[#6C727A]">
                            {log.ipAddress}
                          </td>
                          <td className="py-2.5 px-3">
                            <span
                              className={`px-1.5 py-0.5 rounded text-[10px] font-semibold ${
                                isDenied
                                  ? 'bg-amber-950/70 text-amber-400 border border-amber-500/30'
                                  : isFailure
                                  ? 'bg-rose-950/70 text-rose-400 border border-rose-500/30'
                                  : 'bg-emerald-950/70 text-emerald-400 border border-emerald-500/30'
                              }`}
                            >
                              {log.result || 'SUCCESS'}
                            </span>
                          </td>
                          <td className="py-2.5 px-3 text-right">
                            <button
                              type="button"
                              onClick={() => setInspectAuditLog(log)}
                              className="text-cyan-400 hover:text-cyan-300 underline cursor-pointer"
                            >
                              Inspect
                            </button>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* ================================================================== */}
      {/* TAB 4: SECURITY POLICY & SESSION STATE */}
      {/* ================================================================== */}
      {activeTab === 'SECURITY' && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="bg-[#0F1115] border border-[#23262B] rounded p-4 space-y-4">
            <div className="border-b border-[#23262B] pb-3">
              <h2 className="text-sm font-semibold text-white flex items-center gap-2">
                <Shield className="w-4 h-4 text-[#007AFF]" />
                Command Station Authentication Policy
              </h2>
              <p className="text-xs text-[#6C727A] mt-0.5">
                Baseline security controls for terminal ingress and brute-force mitigation.
              </p>
            </div>

            <div className="space-y-3 text-xs">
              <div className="flex items-center justify-between p-2.5 bg-[#14161A] rounded border border-[#23262B]">
                <div>
                  <div className="font-semibold text-white">Maximum Login Attempts</div>
                  <div className="text-[#6C727A]">Failed attempts before temporary terminal lockout</div>
                </div>
                <span className="font-mono text-cyan-400 text-sm font-bold">5 attempts</span>
              </div>

              <div className="flex items-center justify-between p-2.5 bg-[#14161A] rounded border border-[#23262B]">
                <div>
                  <div className="font-semibold text-white">Lockout Duration</div>
                  <div className="text-[#6C727A]">Rate-limiting cool-off period upon limit breach</div>
                </div>
                <span className="font-mono text-cyan-400 text-sm font-bold">300 seconds</span>
              </div>

              <div className="flex items-center justify-between p-2.5 bg-[#14161A] rounded border border-[#23262B]">
                <div>
                  <div className="font-semibold text-white">Session Lifetime</div>
                  <div className="text-[#6C727A]">Maximum authorization token duration before re-auth</div>
                </div>
                <span className="font-mono text-cyan-400 text-sm font-bold">8 hours</span>
              </div>

              <div className="flex items-center justify-between p-2.5 bg-[#14161A] rounded border border-[#23262B]">
                <div>
                  <div className="font-semibold text-white">Credential Encryption</div>
                  <div className="text-[#6C727A]">Algorithm applied for credential vault</div>
                </div>
                <span className="font-mono text-emerald-400 text-xs font-semibold">PBKDF2-SHA512 (10,000 iter)</span>
              </div>
            </div>
          </div>

          <div className="bg-[#0F1115] border border-[#23262B] rounded p-4 space-y-4">
            <div className="border-b border-[#23262B] pb-3">
              <h2 className="text-sm font-semibold text-white flex items-center gap-2">
                <Terminal className="w-4 h-4 text-emerald-400" />
                Active Operator Station Context
              </h2>
              <p className="text-xs text-[#6C727A] mt-0.5">
                Current session cryptographic tokens and operational privileges.
              </p>
            </div>

            <div className="p-3 bg-[#14161A] rounded border border-[#23262B] space-y-2 text-xs">
              <div className="flex justify-between">
                <span className="text-[#6C727A]">Logged Operator:</span>
                <span className="font-semibold text-white font-mono">{currentUser?.callsign || 'ANONYMOUS'}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-[#6C727A]">Designated Role:</span>
                <Badge variant={getRoleBadgeVariant(currentUser?.role || '')} size="sm">
                  {currentUser?.role ? canonicalRole(currentUser.role) : 'UNAUTHENTICATED'}
                </Badge>
              </div>
              <div className="flex justify-between">
                <span className="text-[#6C727A]">Resolved Permissions:</span>
                <span className="font-mono text-cyan-400">{currentUser?.permissions?.length || 0} active</span>
              </div>
              <div className="flex justify-between">
                <span className="text-[#6C727A]">Audit Redaction:</span>
                <span className="font-mono text-emerald-400">ENABLED (Secrets Scrubbed)</span>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ================================================================== */}
      {/* MODAL: PROVISION OPERATOR ACCOUNT */}
      {/* ================================================================== */}
      <Modal
        isOpen={isCreateModalOpen}
        onClose={() => setIsCreateModalOpen(false)}
        title="Provision Operator Account"
        subtitle="Register and credential a new security station operator with specific role clearance."
        maxWidth="md"
        footer={
          <div className="flex items-center justify-end gap-2">
            <Button
              variant="secondary"
              size="sm"
              onClick={() => setIsCreateModalOpen(false)}
              disabled={isLoading}
            >
              Cancel
            </Button>
            <Button
              variant="primary"
              size="sm"
              onClick={handleCreateUserSubmit}
              isLoading={isLoading}
            >
              Provision Account
            </Button>
          </div>
        }
      >
        <form onSubmit={handleCreateUserSubmit} className="space-y-3 text-xs">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-[#6C727A] mb-1 font-medium">Operator Callsign *</label>
              <Input
                value={formCallsign}
                onChange={(e) => setFormCallsign(e.target.value)}
                placeholder="e.g. SENTINEL-03"
                autoFocus
              />
            </div>
            <div>
              <label className="block text-[#6C727A] mb-1 font-medium">Full Name *</label>
              <Input
                value={formFullName}
                onChange={(e) => setFormFullName(e.target.value)}
                placeholder="e.g. Alex Henderson"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-[#6C727A] mb-1 font-medium">Official Email *</label>
              <Input
                type="email"
                value={formEmail}
                onChange={(e) => setFormEmail(e.target.value)}
                placeholder="e.g. alex.h@ibvap.gov"
              />
            </div>
            <div>
              <label className="block text-[#6C727A] mb-1 font-medium">Assigned Role *</label>
              <Select
                value={formRole}
                onChange={(e) => setFormRole(e.target.value as UserRole)}
                options={[
                  { value: 'ADMINISTRATOR', label: 'Administrator' },
                  { value: 'WATCH_COMMANDER', label: 'Watch Commander' },
                  { value: 'FIELD_OPERATOR', label: 'Surveillance Operator' },
                  { value: 'FORENSIC_ANALYST', label: 'Evidence Analyst' },
                  { value: 'SECURITY_AUDITOR', label: 'Security Auditor' },
                ]}
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-[#6C727A] mb-1 font-medium">Badge Number</label>
              <Input
                value={formBadgeNumber}
                onChange={(e) => setFormBadgeNumber(e.target.value)}
                placeholder="e.g. B-8812"
              />
            </div>
            <div>
              <label className="block text-[#6C727A] mb-1 font-medium">Sector Assignment</label>
              <Select
                value={formSector}
                onChange={(e) => setFormSector(e.target.value)}
                options={[
                  { value: 'sec-04', label: 'Sector 04 — Eagle Pass' },
                  { value: 'sec-01', label: 'Sector 01 — El Paso West' },
                  { value: 'sec-02', label: 'Sector 02 — Santa Teresa' },
                  { value: 'sec-03', label: 'Sector 03 — Del Rio Corridor' },
                ]}
              />
            </div>
          </div>

          <div>
            <label className="block text-[#6C727A] mb-1 font-medium">Initial Security Password *</label>
            <Input
              type="text"
              value={formPassword}
              onChange={(e) => setFormPassword(e.target.value)}
              placeholder="e.g. IBVAP-Terminal-2026!"
            />
            <p className="text-[10px] text-[#6C727A] mt-1">
              Securely hashed with PBKDF2-SHA512 upon registration.
            </p>
          </div>
        </form>
      </Modal>

      {/* ================================================================== */}
      {/* MODAL: EDIT OPERATOR PROFILE */}
      {/* ================================================================== */}
      <Modal
        isOpen={isEditModalOpen}
        onClose={() => setIsEditModalOpen(false)}
        title={`Edit Operator: ${selectedUserForEdit?.callsign}`}
        subtitle="Update operator contact, clearance role, or account active status."
        maxWidth="md"
        footer={
          <div className="flex items-center justify-end gap-2">
            <Button
              variant="secondary"
              size="sm"
              onClick={() => setIsEditModalOpen(false)}
              disabled={isLoading}
            >
              Cancel
            </Button>
            <Button
              variant="primary"
              size="sm"
              onClick={handleEditUserSubmit}
              isLoading={isLoading}
            >
              Update Account
            </Button>
          </div>
        }
      >
        <form onSubmit={handleEditUserSubmit} className="space-y-3 text-xs">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-[#6C727A] mb-1 font-medium">Full Name</label>
              <Input
                value={formFullName}
                onChange={(e) => setFormFullName(e.target.value)}
              />
            </div>
            <div>
              <label className="block text-[#6C727A] mb-1 font-medium">Email Address</label>
              <Input
                type="email"
                value={formEmail}
                onChange={(e) => setFormEmail(e.target.value)}
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-[#6C727A] mb-1 font-medium">Role Clearance</label>
              <Select
                value={formRole}
                onChange={(e) => setFormRole(e.target.value as UserRole)}
                options={[
                  { value: 'ADMINISTRATOR', label: 'Administrator' },
                  { value: 'WATCH_COMMANDER', label: 'Watch Commander' },
                  { value: 'FIELD_OPERATOR', label: 'Surveillance Operator' },
                  { value: 'FORENSIC_ANALYST', label: 'Evidence Analyst' },
                  { value: 'SECURITY_AUDITOR', label: 'Security Auditor' },
                ]}
              />
            </div>
            <div>
              <label className="block text-[#6C727A] mb-1 font-medium">Account Status</label>
              <Select
                value={formStatus}
                onChange={(e) => setFormStatus(e.target.value as 'ACTIVE' | 'DISABLED' | 'SUSPENDED')}
                options={[
                  { value: 'ACTIVE', label: 'ACTIVE' },
                  { value: 'DISABLED', label: 'DISABLED' },
                  { value: 'SUSPENDED', label: 'SUSPENDED' },
                ]}
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-[#6C727A] mb-1 font-medium">Badge Number</label>
              <Input
                value={formBadgeNumber}
                onChange={(e) => setFormBadgeNumber(e.target.value)}
              />
            </div>
            <div>
              <label className="block text-[#6C727A] mb-1 font-medium">Reset Password (Optional)</label>
              <Input
                type="text"
                value={formPassword}
                onChange={(e) => setFormPassword(e.target.value)}
                placeholder="Leave blank to keep existing"
              />
            </div>
          </div>
        </form>
      </Modal>

      {/* ================================================================== */}
      {/* MODAL: INSPECT USER PERMISSIONS */}
      {/* ================================================================== */}
      <Modal
        isOpen={Boolean(inspectUserPermissions)}
        onClose={() => setInspectUserPermissions(null)}
        title={`Assigned Permissions: ${inspectUserPermissions?.callsign}`}
        subtitle={`Effective capabilities granted to ${inspectUserPermissions?.fullName} (${formatRole(
          inspectUserPermissions?.role || ''
        )})`}
        maxWidth="lg"
      >
        <div className="space-y-3 text-xs max-h-[60vh] overflow-y-auto pr-1">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {inspectUserPermissions?.permissions && inspectUserPermissions.permissions.length > 0 ? (
              inspectUserPermissions.permissions.map((permKey) => {
                const def = ALL_PERMISSIONS.find((p) => p.key === permKey);
                return (
                  <div
                    key={permKey}
                    className="p-2.5 rounded bg-[#14161A] border border-[#23262B] flex flex-col justify-between"
                  >
                    <div className="font-semibold text-white">{def?.label || permKey}</div>
                    <div className="text-[10px] font-mono text-cyan-400 mt-0.5">{permKey}</div>
                    <p className="text-[11px] text-[#6C727A] mt-1">
                      {def?.description || 'Active operational grant.'}
                    </p>
                  </div>
                );
              })
            ) : (
              <div className="col-span-2 text-center py-6 text-[#6C727A]">
                No explicit permissions granted to this operator.
              </div>
            )}
          </div>
        </div>
      </Modal>

      {/* ================================================================== */}
      {/* MODAL: INSPECT AUDIT LOG ENTRY */}
      {/* ================================================================== */}
      <Modal
        isOpen={Boolean(inspectAuditLog)}
        onClose={() => setInspectAuditLog(null)}
        title="Audit Vault Entry Inspection"
        subtitle={`Cryptographic record ID: ${inspectAuditLog?.id}`}
        maxWidth="md"
      >
        {inspectAuditLog && (
          <div className="space-y-3 text-xs">
            <div className="grid grid-cols-2 gap-2 p-3 bg-[#14161A] rounded border border-[#23262B] font-mono text-[11px]">
              <div>
                <span className="text-[#6C727A]">Timestamp:</span>{' '}
                <span className="text-white">{inspectAuditLog.timestamp}</span>
              </div>
              <div>
                <span className="text-[#6C727A]">Operator:</span>{' '}
                <span className="text-cyan-400 font-bold">{inspectAuditLog.userCallsign}</span>
              </div>
              <div>
                <span className="text-[#6C727A]">Action:</span>{' '}
                <span className="text-emerald-400">{inspectAuditLog.action}</span>
              </div>
              <div>
                <span className="text-[#6C727A]">Target:</span>{' '}
                <span className="text-white">{inspectAuditLog.resourceType} / {inspectAuditLog.resourceId}</span>
              </div>
              <div>
                <span className="text-[#6C727A]">Client IP:</span>{' '}
                <span className="text-white">{inspectAuditLog.ipAddress}</span>
              </div>
              <div>
                <span className="text-[#6C727A]">Result:</span>{' '}
                <span className="text-white font-bold">{inspectAuditLog.result || 'SUCCESS'}</span>
              </div>
            </div>

            <div>
              <div className="text-[#6C727A] font-semibold mb-1">Payload / Details (Sanitized)</div>
              <pre className="p-3 bg-[#0A0B0D] border border-[#23262B] rounded text-[11px] font-mono text-[#E0E2E6] overflow-x-auto max-h-48">
                {JSON.stringify(inspectAuditLog.details, null, 2)}
              </pre>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
};
