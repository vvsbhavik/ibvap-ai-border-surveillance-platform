// ============================================================================
// IBVAP Production Structured Logger
// Complies with ISO/IEC 27001 & SOC 2 Mission-Control Audit Guidelines
// ============================================================================

export type LogSeverity = 'DEBUG' | 'INFO' | 'WARN' | 'ERROR' | 'CRITICAL' | 'AUDIT';

export interface StructuredLogEntry {
  timestamp: string;
  severity: LogSeverity;
  service: string;
  requestId?: string;
  action?: string;
  message: string;
  context?: Record<string, unknown>;
}

// Redact any potential credential fields
const SENSITIVE_KEYS = new Set([
  'password',
  'token',
  'secret',
  'authorization',
  'cookie',
  'credential',
  'rtsp_password',
  'key'
]);

function sanitize(obj: unknown): unknown {
  if (!obj || typeof obj !== 'object') return obj;
  if (Array.isArray(obj)) return obj.map(sanitize);

  const clean: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(obj as Record<string, unknown>)) {
    if (SENSITIVE_KEYS.has(key.toLowerCase())) {
      clean[key] = '[REDACTED]';
    } else if (typeof value === 'object' && value !== null) {
      clean[key] = sanitize(value);
    } else {
      clean[key] = value;
    }
  }
  return clean;
}

export class Logger {
  private service: string;

  constructor(service = 'ibvap-core') {
    this.service = service;
  }

  private write(severity: LogSeverity, message: string, context?: Record<string, unknown>, requestId?: string) {
    const entry: StructuredLogEntry = {
      timestamp: new Date().toISOString(),
      severity,
      service: this.service,
      message,
      ...(requestId && { requestId }),
      ...(context && { context: sanitize(context) as Record<string, unknown> }),
    };

    const formatted = JSON.stringify(entry);
    if (severity === 'ERROR' || severity === 'CRITICAL') {
      console.error(formatted);
    } else if (severity === 'WARN') {
      console.warn(formatted);
    } else {
      console.log(formatted);
    }
  }

  debug(message: string, context?: Record<string, unknown>, reqId?: string) {
    if (process.env.NODE_ENV !== 'production') {
      this.write('DEBUG', message, context, reqId);
    }
  }

  info(message: string, context?: Record<string, unknown>, reqId?: string) {
    this.write('INFO', message, context, reqId);
  }

  warn(message: string, context?: Record<string, unknown>, reqId?: string) {
    this.write('WARN', message, context, reqId);
  }

  error(message: string, context?: Record<string, unknown>, reqId?: string) {
    this.write('ERROR', message, context, reqId);
  }

  audit(action: string, message: string, context?: Record<string, unknown>, reqId?: string) {
    this.write('AUDIT', `[AUDIT: ${action}] ${message}`, context, reqId);
  }
}

export const logger = new Logger('ibvap-command-server');
