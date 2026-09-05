import { Router, Request, Response } from 'express';
import { dataStore } from '../store';
import { logger } from '../logger';
import { ALL_PERMISSIONS, canonicalRole } from '../../utils/permissions';
import { authenticate, AuthenticatedRequest } from '../middleware/auth';

export const authRouter = Router();

// POST /api/v1/auth/login
authRouter.post('/login', (req: Request, res: Response) => {
  const clientIp = (req.headers['x-forwarded-for'] as string) || req.socket.remoteAddress || '127.0.0.1';
  const { callsign, identifier, password, quickSwitch } = req.body;

  // 1. Rate Limiting Check
  const rateLimitCheck = dataStore.checkLoginRateLimit(clientIp);
  if (!rateLimitCheck.allowed) {
    dataStore.logAudit(
      'RATE_LIMIT',
      'LOGIN_RATE_LIMITED',
      'AUTH',
      clientIp,
      clientIp,
      { retryAfterSeconds: rateLimitCheck.retryAfterSeconds },
      'DENIED'
    );
    return res.status(429).json({
      success: false,
      error: 'TOO_MANY_REQUESTS',
      code: 'RATE_LIMIT_EXCEEDED',
      message: `Too many failed login attempts from this terminal. Please wait ${rateLimitCheck.retryAfterSeconds} seconds before retrying.`,
      retryAfterSeconds: rateLimitCheck.retryAfterSeconds,
    });
  }

  // 2. Identify User
  const targetId = (callsign || identifier || '').trim();
  if (!targetId) {
    return res.status(400).json({
      success: false,
      error: 'BAD_REQUEST',
      message: 'Operator callsign or identifier is required.',
    });
  }

  const user = dataStore.users.find(
    (u) =>
      u.callsign.toUpperCase() === targetId.toUpperCase() ||
      u.email.toLowerCase() === targetId.toLowerCase()
  );

  if (!user) {
    const failRecord = dataStore.recordFailedLogin(clientIp);
    dataStore.logAudit(
      targetId.toUpperCase(),
      'LOGIN_FAILED',
      'AUTH',
      'USER_NOT_FOUND',
      clientIp,
      { targetId, attempts: failRecord.attempts },
      'FAILURE'
    );
    return res.status(401).json({
      success: false,
      error: 'UNAUTHORIZED',
      code: 'INVALID_CREDENTIALS',
      message: 'Invalid operator callsign or password.',
      attemptsRemaining: Math.max(0, 5 - failRecord.attempts),
    });
  }

  // 3. User Account Status Check
  if (user.status === 'DISABLED' || user.status === 'LOCKED' || user.status === 'SUSPENDED') {
    dataStore.logAudit(
      user.callsign,
      'LOGIN_BLOCKED_STATUS',
      'AUTH',
      user.id,
      clientIp,
      { status: user.status },
      'DENIED',
      user.role
    );
    return res.status(403).json({
      success: false,
      error: 'FORBIDDEN',
      code: 'ACCOUNT_DISABLED',
      message: `Operator account for '${user.callsign}' is currently ${user.status.toLowerCase()}. Terminal access is prohibited.`,
    });
  }

  // 4. Password Verification
  if (password) {
    const isValid = dataStore.verifyPassword(user.id, password);
    if (!isValid) {
      const failRecord = dataStore.recordFailedLogin(clientIp);
      dataStore.logAudit(
        user.callsign,
        'LOGIN_FAILED_PASSWORD',
        'AUTH',
        user.id,
        clientIp,
        { attempts: failRecord.attempts },
        'FAILURE',
        user.role
      );
      return res.status(401).json({
        success: false,
        error: 'UNAUTHORIZED',
        code: 'INVALID_CREDENTIALS',
        message: 'Invalid operator callsign or password.',
        attemptsRemaining: Math.max(0, 5 - failRecord.attempts),
      });
    }
  } else if (!quickSwitch) {
    // Password required unless in demo quick-switch mode
    return res.status(400).json({
      success: false,
      error: 'BAD_REQUEST',
      code: 'PASSWORD_REQUIRED',
      message: 'Security credentials required. Enter operator password.',
    });
  }

  // 5. Successful Authentication
  dataStore.resetLoginRateLimit(clientIp);
  user.lastLoginAt = new Date().toISOString();

  const userAgent = req.headers['user-agent'];
  const session = dataStore.createSession(user, clientIp, userAgent);
  const permissions = dataStore.getUserPermissions(user);

  dataStore.logAudit(
    user.callsign,
    quickSwitch ? 'SIMULATED_QUICK_SWITCH' : 'USER_LOGIN',
    'AUTH',
    user.id,
    clientIp,
    { role: canonicalRole(user.role), sessionId: session.id },
    'SUCCESS',
    canonicalRole(user.role)
  );

  logger.audit('LOGIN', `Operator ${user.callsign} authenticated with role ${user.role}`);

  return res.json({
    success: true,
    token: session.token,
    session,
    user: {
      ...user,
      role: canonicalRole(user.role),
      permissions,
    },
  });
});

// GET /api/v1/auth/me
authRouter.get('/me', authenticate, (req: AuthenticatedRequest, res: Response) => {
  if (!req.user) {
    return res.status(401).json({ success: false, error: 'UNAUTHORIZED' });
  }

  const permissions = dataStore.getUserPermissions(req.user);

  return res.json({
    success: true,
    user: {
      ...req.user,
      role: canonicalRole(req.user.role),
      permissions,
    },
    session: req.session,
  });
});

// POST /api/v1/auth/logout
authRouter.post('/logout', authenticate, (req: AuthenticatedRequest, res: Response) => {
  const clientIp = (req.headers['x-forwarded-for'] as string) || req.socket.remoteAddress || '127.0.0.1';
  const token = req.session?.token || (req.headers.authorization?.startsWith('Bearer ') ? req.headers.authorization.substring(7) : undefined);

  if (token) {
    dataStore.revokeSession(token);
  }

  const callsign = req.user?.callsign || 'ANONYMOUS';
  dataStore.logAudit(callsign, 'USER_LOGOUT', 'AUTH', req.user?.id || 'session', clientIp, {}, 'SUCCESS', req.user?.role);

  return res.json({
    success: true,
    message: 'Terminal session successfully terminated.',
  });
});

// GET /api/v1/auth/permissions (Catalog of available permissions)
authRouter.get('/permissions', (_req: Request, res: Response) => {
  return res.json({
    success: true,
    permissions: ALL_PERMISSIONS,
    roles: dataStore.roles,
  });
});

// GET /api/v1/auth/seed-users (Simulated identity roster for evaluation and testing)
authRouter.get('/seed-users', (_req: Request, res: Response) => {
  const simulatedRoster = dataStore.users.map((u) => ({
    id: u.id,
    callsign: u.callsign,
    fullName: u.fullName,
    email: u.email,
    role: canonicalRole(u.role),
    badgeNumber: u.badgeNumber,
    sectorAssignmentId: u.sectorAssignmentId,
    status: u.status,
    lastLoginAt: u.lastLoginAt,
    isSimulated: true,
    demoDefaultPassword: 'IBVAP-Terminal-2026!',
  }));

  return res.json({
    success: true,
    disclaimer: 'SIMULATED DATA — Seed operator credentials for Command Center demonstration and testing.',
    users: simulatedRoster,
  });
});

