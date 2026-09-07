// ============================================================================
// IBVAP Application Configuration & Operating Profile
// Supports explicit DEMO and PRODUCTION operating profiles
// ============================================================================

export type AppProfile = 'DEMO' | 'PRODUCTION';

export interface StorageConfig {
  type: 'LOCAL' | 'OBJECT_STORAGE';
  localBasePath: string;
  maxUploadSizeBytes: number;
}

export interface RetentionConfig {
  eventsTtlHours: number;
  alertsTtlHours: number;
  incidentsTtlHours: number;
  auditLogsTtlHours: number;
  evidenceTtlHours: number;
  recordsTtlHours: number;
}

export interface AppConfig {
  profile: AppProfile;
  port: number;
  databaseUrl?: string;
  redisUrl?: string;
  jwtSecret: string;
  geminiApiKey?: string;
  storage: StorageConfig;
  retention: RetentionConfig;
  rateLimits: {
    authMaxAttempts: number;
    authWindowSeconds: number;
    apiWindowMs: number;
    apiMaxRequests: number;
  };
}

function parseNumber(envVar: string | undefined, defaultValue: number): number {
  if (!envVar) return defaultValue;
  const parsed = parseInt(envVar, 10);
  return isNaN(parsed) ? defaultValue : parsed;
}

export function loadConfig(): AppConfig {
  const profile: AppProfile =
    (process.env.APP_PROFILE?.toUpperCase() as AppProfile) === 'PRODUCTION'
      ? 'PRODUCTION'
      : 'DEMO';

  const port = parseNumber(process.env.PORT, 3000);
  const databaseUrl = process.env.DATABASE_URL?.trim() || undefined;
  const redisUrl = process.env.REDIS_URL?.trim() || undefined;
  const jwtSecret =
    process.env.JWT_SECRET?.trim() || 'ibvap-mission-critical-token-secret-2026';
  const geminiApiKey = process.env.GEMINI_API_KEY?.trim() || undefined;

  const storage: StorageConfig = {
    type: (process.env.EVIDENCE_STORAGE_TYPE?.toUpperCase() as 'LOCAL' | 'OBJECT_STORAGE') || 'LOCAL',
    localBasePath: process.env.EVIDENCE_STORAGE_PATH?.trim() || './storage/evidence',
    maxUploadSizeBytes: parseNumber(process.env.MAX_EVIDENCE_SIZE_BYTES, 25 * 1024 * 1024), // 25MB
  };

  const retention: RetentionConfig = {
    eventsTtlHours: parseNumber(process.env.RETENTION_EVENTS_HOURS, 168), // 7 days
    alertsTtlHours: parseNumber(process.env.RETENTION_ALERTS_HOURS, 720), // 30 days
    incidentsTtlHours: parseNumber(process.env.RETENTION_INCIDENTS_HOURS, 2160), // 90 days
    auditLogsTtlHours: parseNumber(process.env.RETENTION_AUDIT_HOURS, 8760), // 365 days
    evidenceTtlHours: parseNumber(process.env.RETENTION_EVIDENCE_HOURS, 4320), // 180 days
    recordsTtlHours: parseNumber(process.env.RETENTION_RECORDS_HOURS, 336), // 14 days
  };

  return {
    profile,
    port,
    databaseUrl,
    redisUrl,
    jwtSecret,
    geminiApiKey,
    storage,
    retention,
    rateLimits: {
      authMaxAttempts: 5,
      authWindowSeconds: 300, // 5 minutes
      apiWindowMs: 60 * 1000, // 1 minute
      apiMaxRequests: 120, // 120 requests per minute
    },
  };
}

export interface ValidationResult {
  isValid: boolean;
  errors: string[];
  warnings: string[];
}

export function validateConfig(config: AppConfig): ValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  if (config.profile === 'PRODUCTION') {
    if (!config.databaseUrl) {
      errors.push(
        '[PRODUCTION CONFIG] DATABASE_URL is mandatory for PRODUCTION mode. Example: postgres://user:password@host:5432/ibvap_core'
      );
    } else if (!config.databaseUrl.startsWith('postgres://') && !config.databaseUrl.startsWith('postgresql://')) {
      errors.push(
        '[PRODUCTION CONFIG] DATABASE_URL must be a valid PostgreSQL connection string starting with postgres:// or postgresql://'
      );
    }

    if (!config.jwtSecret || config.jwtSecret === 'ibvap-mission-critical-token-secret-2026') {
      warnings.push(
        '[PRODUCTION SECURITY] JWT_SECRET is currently set to the default placeholder. A strong custom secret is recommended for production deployment.'
      );
    }

    if (!config.redisUrl) {
      warnings.push(
        '[PRODUCTION NOTICE] REDIS_URL is not configured; using high-performance bounded in-memory cache fallback.'
      );
    }

    if (!config.geminiApiKey) {
      warnings.push(
        '[PRODUCTION NOTICE] GEMINI_API_KEY is not configured; AI Copilot grounded intelligence tools will operate in rule-based fallback mode.'
      );
    }
  } else {
    // DEMO Profile
    if (!config.databaseUrl) {
      warnings.push(
        '[DEMO PROFILE] Running in DEMO mode with in-memory persistence and synthetic border scenario data.'
      );
    }
  }

  return {
    isValid: errors.length === 0,
    errors,
    warnings,
  };
}

export const appConfig = loadConfig();
