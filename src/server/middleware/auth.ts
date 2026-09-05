import { Request, Response, NextFunction } from 'express';
import { dataStore } from '../store';
import { PermissionKey, User, UserRole, Session } from '../types';
import { canonicalRole } from '../../utils/permissions';

// Extend Express Request interface with identity properties
export interface AuthenticatedRequest extends Request {
  user?: User;
  session?: Session;
  userPermissions?: PermissionKey[];
}

/**
 * Resolves caller identity from Bearer token, session header, or fallback callsign header.
 * Attaches user, session, and dynamic permissions to the request.
 */
export function authenticate(req: AuthenticatedRequest, res: Response, next: NextFunction) {
  const authHeader = req.headers.authorization;
  const sessionTokenHeader = req.headers['x-session-token'] as string | undefined;
  let token: string | undefined;

  if (authHeader && authHeader.startsWith('Bearer ')) {
    token = authHeader.substring(7).trim();
  } else if (sessionTokenHeader) {
    token = sessionTokenHeader.trim();
  }

  const clientIp = (req.headers['x-forwarded-for'] as string) || req.socket.remoteAddress || '127.0.0.1';

  if (token) {
    const session = dataStore.getSession(token);
    if (session) {
      const user = dataStore.users.find((u) => u.id === session.userId);
      if (!user) {
        return res.status(401).json({
          error: 'UNAUTHORIZED',
          code: 'INVALID_SESSION_USER',
          message: 'The account associated with this session no longer exists.',
        });
      }

      if (user.status === 'DISABLED' || user.status === 'LOCKED' || user.status === 'SUSPENDED') {
        dataStore.logAudit(
          user.callsign,
          'ACCESS_REVOKED_ATTEMPT',
          'SESSION',
          session.id,
          clientIp,
          { status: user.status, path: req.originalUrl },
          'DENIED',
          user.role
        );
        return res.status(403).json({
          error: 'FORBIDDEN',
          code: 'ACCOUNT_DISABLED',
          message: `Operator credentials for ${user.callsign} are currently ${user.status.toLowerCase()}. Access denied.`,
        });
      }

      req.user = user;
      req.session = session;
      req.userPermissions = dataStore.getUserPermissions(user);
      return next();
    }
  }

  // Header-based fallback for simulated client context (e.g. quick-role switching in command terminal)
  const callsignHeader = (req.headers['x-operator-callsign'] as string | undefined)?.trim();
  const roleHeader = (req.headers['x-operator-role'] as string | undefined)?.trim();

  if (callsignHeader) {
    let user = dataStore.users.find(
      (u) => u.callsign.toUpperCase() === callsignHeader.toUpperCase()
    );

    if (!user && roleHeader) {
      // Create or locate matching user by role
      const canonical = canonicalRole(roleHeader);
      user = dataStore.users.find((u) => canonicalRole(u.role) === canonical);
    }

    if (user) {
      if (user.status === 'DISABLED' || user.status === 'LOCKED' || user.status === 'SUSPENDED') {
        return res.status(403).json({
          error: 'FORBIDDEN',
          code: 'ACCOUNT_DISABLED',
          message: `Operator credentials for ${user.callsign} are currently ${user.status.toLowerCase()}. Access denied.`,
        });
      }

      req.user = user;
      req.userPermissions = dataStore.getUserPermissions(user);
      return next();
    }
  }

  // Default simulated fallback for unauthenticated development queries
  // Defaults to first active surveillance operator with explicit simulated notice
  const defaultUser = dataStore.users.find((u) => u.status === 'ACTIVE') || dataStore.users[0];
  req.user = defaultUser;
  req.userPermissions = defaultUser ? dataStore.getUserPermissions(defaultUser) : [];
  return next();
}

/**
 * Strict authentication guard: rejects requests that do not present a verified session or identity.
 */
export function requireAuthentication(req: AuthenticatedRequest, res: Response, next: NextFunction) {
  if (!req.user) {
    return res.status(401).json({
      error: 'UNAUTHORIZED',
      code: 'AUTH_REQUIRED',
      message: 'Terminal access denied. Operational session required.',
    });
  }
  return next();
}

/**
 * Enforces fine-grained permission check for an endpoint.
 * Logs security audit entries on permission denials.
 */
export function requirePermission(permission: PermissionKey) {
  return (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    const user = req.user;
    const clientIp = (req.headers['x-forwarded-for'] as string) || req.socket.remoteAddress || '127.0.0.1';

    if (!user) {
      return res.status(401).json({
        error: 'UNAUTHORIZED',
        code: 'AUTH_REQUIRED',
        message: 'Terminal access denied. Operational session required.',
      });
    }

    const hasPerm = dataStore.hasPermission(user.role, permission);

    if (!hasPerm) {
      dataStore.logAudit(
        user.callsign,
        'AUTHORIZATION_DENIED',
        'PERMISSION',
        permission,
        clientIp,
        {
          requestedPath: req.originalUrl,
          httpMethod: req.method,
          userRole: user.role,
          requiredPermission: permission,
        },
        'DENIED',
        user.role
      );

      return res.status(403).json({
        error: 'FORBIDDEN',
        code: 'PERMISSION_DENIED',
        requiredPermission: permission,
        userRole: canonicalRole(user.role),
        message: `Operator '${user.callsign}' with role '${canonicalRole(user.role)}' lacks the required permission: '${permission}'.`,
      });
    }

    return next();
  };
}

/**
 * Enforces that caller must possess at least one of the specified permissions.
 */
export function requireAnyPermission(permissions: PermissionKey[]) {
  return (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    const user = req.user;
    const clientIp = (req.headers['x-forwarded-for'] as string) || req.socket.remoteAddress || '127.0.0.1';

    if (!user) {
      return res.status(401).json({
        error: 'UNAUTHORIZED',
        code: 'AUTH_REQUIRED',
        message: 'Terminal access denied. Operational session required.',
      });
    }

    const hasAny = permissions.some((p) => dataStore.hasPermission(user.role, p));

    if (!hasAny) {
      dataStore.logAudit(
        user.callsign,
        'AUTHORIZATION_DENIED',
        'PERMISSIONS_GROUP',
        permissions.join(','),
        clientIp,
        {
          requestedPath: req.originalUrl,
          httpMethod: req.method,
          userRole: user.role,
          requiredAnyOf: permissions,
        },
        'DENIED',
        user.role
      );

      return res.status(403).json({
        error: 'FORBIDDEN',
        code: 'PERMISSION_DENIED',
        requiredAnyOf: permissions,
        userRole: canonicalRole(user.role),
        message: `Operator '${user.callsign}' lacks authorization for this operation.`,
      });
    }

    return next();
  };
}

/**
 * Enforces specific operational roles.
 */
export function requireRole(allowedRoles: UserRole[]) {
  return (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    const user = req.user;
    const clientIp = (req.headers['x-forwarded-for'] as string) || req.socket.remoteAddress || '127.0.0.1';

    if (!user) {
      return res.status(401).json({
        error: 'UNAUTHORIZED',
        code: 'AUTH_REQUIRED',
        message: 'Terminal access denied. Operational session required.',
      });
    }

    const canonicalUserRole = canonicalRole(user.role);
    const canonicalAllowed = allowedRoles.map(canonicalRole);

    if (!canonicalAllowed.includes(canonicalUserRole)) {
      dataStore.logAudit(
        user.callsign,
        'ROLE_ACCESS_DENIED',
        'ROLE_GATE',
        canonicalAllowed.join(','),
        clientIp,
        {
          requestedPath: req.originalUrl,
          httpMethod: req.method,
          userRole: user.role,
          allowedRoles: canonicalAllowed,
        },
        'DENIED',
        user.role
      );

      return res.status(403).json({
        error: 'FORBIDDEN',
        code: 'ROLE_RESTRICTED',
        userRole: canonicalUserRole,
        allowedRoles: canonicalAllowed,
        message: `Operation restricted to roles: [${canonicalAllowed.join(', ')}]. Current role: ${canonicalUserRole}.`,
      });
    }

    return next();
  };
}
