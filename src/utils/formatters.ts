// ============================================================================
// IBVAP Safe Formatting Utilities
// Defensive formatters ensuring no "Invalid Date", "NaN%", "undefined", or broken UI
// ============================================================================

/**
 * Formats an ISO date/timestamp string safely.
 * Returns fallback (default: 'Timestamp unavailable') if invalid or missing.
 */
export function formatTimestamp(
  dateValue?: string | number | Date | null,
  options?: {
    includeSeconds?: boolean;
    format?: 'local' | 'utc' | 'relative' | 'date-only' | 'time-only';
    fallback?: string;
  }
): string {
  const fallback = options?.fallback ?? 'Unavailable';
  if (!dateValue) return fallback;

  try {
    const d = new Date(dateValue);
    if (isNaN(d.getTime())) return fallback;

    const format = options?.format ?? 'utc';
    const includeSeconds = options?.includeSeconds ?? true;

    if (format === 'time-only') {
      return d.toLocaleTimeString([], {
        hour: '2-digit',
        minute: '2-digit',
        second: includeSeconds ? '2-digit' : undefined,
        hour12: false,
      });
    }

    if (format === 'date-only') {
      return d.toLocaleDateString([], {
        year: 'numeric',
        month: 'short',
        day: '2-digit',
      });
    }

    if (format === 'local') {
      return d.toLocaleString([], {
        year: 'numeric',
        month: 'short',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        second: includeSeconds ? '2-digit' : undefined,
        hour12: false,
      });
    }

    if (format === 'relative') {
      const now = Date.now();
      const diffMs = now - d.getTime();
      const diffSec = Math.floor(diffMs / 1000);
      if (diffSec < 5) return 'Just now';
      if (diffSec < 60) return `${diffSec}s ago`;
      const diffMin = Math.floor(diffSec / 60);
      if (diffMin < 60) return `${diffMin}m ago`;
      const diffHour = Math.floor(diffMin / 60);
      if (diffHour < 24) return `${diffHour}h ago`;
      return `${Math.floor(diffHour / 24)}d ago`;
    }

    // Default: Clean UTC display
    const hours = String(d.getUTCHours()).padStart(2, '0');
    const minutes = String(d.getUTCMinutes()).padStart(2, '0');
    const seconds = String(d.getUTCSeconds()).padStart(2, '0');
    const timeStr = includeSeconds ? `${hours}:${minutes}:${seconds}` : `${hours}:${minutes}`;
    return `${timeStr} UTC`;
  } catch {
    return fallback;
  }
}

/**
 * Formats a percentage value safely.
 * Returns 'Unavailable' if value is null, undefined, or NaN.
 */
export function formatPercentage(
  val?: number | null,
  decimals: number = 0,
  fallback: string = 'Unavailable'
): string {
  if (val === undefined || val === null || isNaN(Number(val))) {
    return fallback;
  }
  return `${Number(val).toFixed(decimals)}%`;
}

/**
 * Formats network latency in milliseconds safely.
 */
export function formatLatency(
  ms?: number | null,
  fallback: string = 'Unavailable'
): string {
  if (ms === undefined || ms === null || isNaN(Number(ms))) {
    return fallback;
  }
  return `${Math.round(Number(ms))} ms`;
}

/**
 * Formats video frame rate (FPS) safely.
 */
export function formatFps(
  fps?: number | null,
  fallback: string = 'Unavailable'
): string {
  if (fps === undefined || fps === null || isNaN(Number(fps)) || fps <= 0) {
    return fallback;
  }
  return `${Number(fps).toFixed(0)} FPS`;
}

/**
 * Formats bitrate in kbps or Mbps safely.
 */
export function formatBitrate(
  kbps?: number | null,
  fallback: string = 'Unavailable'
): string {
  if (kbps === undefined || kbps === null || isNaN(Number(kbps)) || kbps <= 0) {
    return fallback;
  }
  if (kbps >= 1000) {
    return `${(kbps / 1000).toFixed(1)} Mbps`;
  }
  return `${Math.round(kbps)} kbps`;
}

/**
 * Formats file size in bytes to MB/KB.
 */
export function formatFileSize(
  bytes?: number | null,
  fallback: string = 'Unavailable'
): string {
  if (bytes === undefined || bytes === null || isNaN(Number(bytes)) || bytes <= 0) {
    return fallback;
  }
  const mb = bytes / (1024 * 1024);
  if (mb >= 1) {
    return `${mb.toFixed(1)} MB`;
  }
  const kb = bytes / 1024;
  return `${kb.toFixed(0)} KB`;
}

export const formatBytes = formatFileSize;

/**
 * Normalizes user-facing role names from enum strings.
 */
export function formatRole(role?: string | null): string {
  if (!role) return 'Operator';
  if (role === 'FORENSIC_ANALYST') return 'Evidence Analyst';
  return role
    .replace(/_/g, ' ')
    .toLowerCase()
    .replace(/\b\w/g, (c) => c.toUpperCase());
}
