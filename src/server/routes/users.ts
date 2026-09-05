import { Router, Response } from 'express';
import { dataStore } from '../store';
import { authenticate, AuthenticatedRequest, requirePermission } from '../middleware/auth';
import { canonicalRole, DEFAULT_ROLE_DEFINITIONS, ALL_PERMISSIONS } from '../../utils/permissions';
import { PermissionKey, UserRole } from '../types';

export const usersRouter = Router();

// All user management routes require valid authentication
usersRouter.use(authenticate);

// ============================================================================
// Roles & Permission Matrix Management
// ============================================================================

// GET /api/v1/users/roles
usersRouter.get('/roles', requirePermission('role.view'), (_req: AuthenticatedRequest, res: Response) => {
  const rolesWithStats = dataStore.roles.map((r) => {
    const canonical = canonicalRole(r.role);
    const assignedUsers = dataStore.users.filter((u) => canonicalRole(u.role) === canonical && u.status === 'ACTIVE');
    return {
      ...r,
      permissions: dataStore.rolePermissions[canonical] || r.permissions,
      assignedUsersCount: assignedUsers.length,
    };
  });

  return res.json({
    success: true,
    total: rolesWithStats.length,
    roles: rolesWithStats,
    availablePermissions: ALL_PERMISSIONS,
  });
});

// PUT /api/v1/users/roles/:role (Update role permissions)
usersRouter.put('/roles/:role', requirePermission('role.manage'), (req: AuthenticatedRequest, res: Response) => {
  const clientIp = (req.headers['x-forwarded-for'] as string) || req.socket.remoteAddress || '127.0.0.1';
  const roleKey = req.params.role as UserRole;
  const { permissions } = req.body;

  if (!Array.isArray(permissions)) {
    return res.status(400).json({
      success: false,
      error: 'BAD_REQUEST',
      message: 'Body field "permissions" must be an array of PermissionKey strings.',
    });
  }

  // Validate that all permissions are legitimate
  const validKeys = new Set(ALL_PERMISSIONS.map((p) => p.key));
  const invalidKeys = permissions.filter((p) => !validKeys.has(p as PermissionKey));

  if (invalidKeys.length > 0) {
    return res.status(400).json({
      success: false,
      error: 'INVALID_PERMISSIONS',
      message: `Invalid permission keys provided: ${invalidKeys.join(', ')}`,
      invalidKeys,
    });
  }

  const canonical = canonicalRole(roleKey);
  const updatedRole = dataStore.updateRolePermissions(
    canonical,
    permissions as PermissionKey[],
    req.user?.callsign || 'SYSTEM',
    clientIp
  );

  return res.json({
    success: true,
    message: `Role permissions updated successfully for ${canonical}.`,
    role: updatedRole,
  });
});

// POST /api/v1/users/roles/:role/reset (Reset role permissions to factory defaults)
usersRouter.post('/roles/:role/reset', requirePermission('role.manage'), (req: AuthenticatedRequest, res: Response) => {
  const clientIp = (req.headers['x-forwarded-for'] as string) || req.socket.remoteAddress || '127.0.0.1';
  const canonical = canonicalRole(req.params.role);
  const defaultDef = DEFAULT_ROLE_DEFINITIONS.find((r) => canonicalRole(r.role) === canonical);

  if (!defaultDef) {
    return res.status(404).json({
      success: false,
      error: 'NOT_FOUND',
      message: `Role ${canonical} does not have a default definition.`,
    });
  }

  const resetRole = dataStore.updateRolePermissions(
    canonical,
    defaultDef.permissions,
    req.user?.callsign || 'SYSTEM',
    clientIp
  );

  return res.json({
    success: true,
    message: `Role ${canonical} reset to factory default permissions.`,
    role: resetRole,
  });
});

// ============================================================================
// User Directory & Account Operations
// ============================================================================

// GET /api/v1/users
usersRouter.get('/', requirePermission('user.view'), (req: AuthenticatedRequest, res: Response) => {
  const { role, status, search } = req.query;
  let result = [...dataStore.users];

  if (role && typeof role === 'string') {
    const canonical = canonicalRole(role);
    result = result.filter((u) => canonicalRole(u.role) === canonical);
  }

  if (status && typeof status === 'string') {
    result = result.filter((u) => u.status === status.toUpperCase());
  }

  if (search && typeof search === 'string' && search.trim()) {
    const q = search.trim().toLowerCase();
    result = result.filter(
      (u) =>
        u.callsign.toLowerCase().includes(q) ||
        u.fullName.toLowerCase().includes(q) ||
        u.email.toLowerCase().includes(q) ||
        u.badgeNumber.toLowerCase().includes(q)
    );
  }

  // Attach dynamic permissions to each user for UI inspection
  const enrichedUsers = result.map((u) => ({
    ...u,
    role: canonicalRole(u.role),
    permissions: dataStore.getUserPermissions(u),
  }));

  return res.json({
    success: true,
    total: enrichedUsers.length,
    users: enrichedUsers,
  });
});

// GET /api/v1/users/:id
usersRouter.get('/:id', requirePermission('user.view'), (req: AuthenticatedRequest, res: Response) => {
  const user = dataStore.users.find((u) => u.id === req.params.id);
  if (!user) {
    return res.status(404).json({ success: false, error: 'NOT_FOUND', message: 'User not found.' });
  }

  return res.json({
    success: true,
    user: {
      ...user,
      role: canonicalRole(user.role),
      permissions: dataStore.getUserPermissions(user),
    },
  });
});

// POST /api/v1/users (Create new operator)
usersRouter.post('/', requirePermission('user.create'), (req: AuthenticatedRequest, res: Response) => {
  const clientIp = (req.headers['x-forwarded-for'] as string) || req.socket.remoteAddress || '127.0.0.1';
  const { callsign, fullName, email, role, badgeNumber, sectorAssignmentId, password, status } = req.body;

  if (!callsign || !fullName || !email || !role) {
    return res.status(400).json({
      success: false,
      error: 'BAD_REQUEST',
      message: 'Fields callsign, fullName, email, and role are required.',
    });
  }

  try {
    const newUser = dataStore.createUser(
      {
        callsign,
        fullName,
        email,
        role: canonicalRole(role),
        badgeNumber,
        sectorAssignmentId,
        password,
        status,
      },
      req.user?.callsign || 'SYSTEM',
      clientIp
    );

    return res.status(201).json({
      success: true,
      message: `Operator account ${newUser.callsign} created successfully.`,
      user: {
        ...newUser,
        permissions: dataStore.getUserPermissions(newUser),
      },
    });
  } catch (err: unknown) {
    return res.status(400).json({
      success: false,
      error: 'VALIDATION_ERROR',
      message: (err as Error).message || 'Failed to create user account.',
    });
  }
});

// PUT /api/v1/users/:id (Update operator)
usersRouter.put('/:id', requirePermission('user.update'), (req: AuthenticatedRequest, res: Response) => {
  const clientIp = (req.headers['x-forwarded-for'] as string) || req.socket.remoteAddress || '127.0.0.1';
  const { id } = req.params;

  try {
    const updated = dataStore.updateUser(
      id,
      req.body,
      req.user?.callsign || 'SYSTEM',
      clientIp
    );

    return res.json({
      success: true,
      message: `Operator account ${updated.callsign} updated successfully.`,
      user: {
        ...updated,
        role: canonicalRole(updated.role),
        permissions: dataStore.getUserPermissions(updated),
      },
    });
  } catch (err: unknown) {
    const msg = (err as Error).message;
    const status = msg.includes('not found') ? 404 : 400;
    return res.status(status).json({
      success: false,
      error: 'UPDATE_ERROR',
      message: msg,
    });
  }
});

// POST /api/v1/users/:id/disable (Revoke / Disable operator)
usersRouter.post('/:id/disable', requirePermission('user.disable'), (req: AuthenticatedRequest, res: Response) => {
  const clientIp = (req.headers['x-forwarded-for'] as string) || req.socket.remoteAddress || '127.0.0.1';
  const { reason } = req.body;

  try {
    const disabled = dataStore.disableUser(
      req.params.id,
      reason,
      req.user?.callsign || 'SYSTEM',
      clientIp
    );

    return res.json({
      success: true,
      message: `Operator account ${disabled.callsign} has been disabled and all active sessions revoked.`,
      user: disabled,
    });
  } catch (err: unknown) {
    return res.status(404).json({
      success: false,
      error: 'NOT_FOUND',
      message: (err as Error).message,
    });
  }
});

// POST /api/v1/users/:id/enable (Reactivate operator)
usersRouter.post('/:id/enable', requirePermission('user.update'), (req: AuthenticatedRequest, res: Response) => {
  const clientIp = (req.headers['x-forwarded-for'] as string) || req.socket.remoteAddress || '127.0.0.1';

  try {
    const enabled = dataStore.enableUser(
      req.params.id,
      req.user?.callsign || 'SYSTEM',
      clientIp
    );

    return res.json({
      success: true,
      message: `Operator account ${enabled.callsign} has been reactivated.`,
      user: enabled,
    });
  } catch (err: unknown) {
    return res.status(404).json({
      success: false,
      error: 'NOT_FOUND',
      message: (err as Error).message,
    });
  }
});

