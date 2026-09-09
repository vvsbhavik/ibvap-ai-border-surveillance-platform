/**
 * IBVAP Video Gateway Credential Vault
 * Securely stores camera credentials in server-side memory.
 * Never exposes plaintext credentials, passwords, or access tokens to the browser or audit logs.
 */

export interface CameraCredentials {
  cameraId: string;
  rawStreamUrl: string;
  username?: string;
  password?: string;
  token?: string;
  headers?: Record<string, string>;
  createdAt: string;
  updatedAt: string;
}

class CredentialVault {
  private vault = new Map<string, CameraCredentials>();
  private refMap = new Map<string, string>(); // secretRef -> cameraId

  /**
   * Securely saves or updates credentials for a camera.
   * Returns an opaque secret vault reference token (sec-ref-*).
   */
  public store(cameraId: string, data: {
    rawStreamUrl: string;
    username?: string;
    password?: string;
    token?: string;
    headers?: Record<string, string>;
  }): string {
    const existingRef = this.getSecretRefForCamera(cameraId);
    const secretRef = existingRef || `sec-ref-${cameraId.toLowerCase().replace(/[^a-z0-9]/g, '')}-${Date.now().toString(36)}`;

    const creds: CameraCredentials = {
      cameraId,
      rawStreamUrl: data.rawStreamUrl.trim(),
      username: data.username?.trim(),
      password: data.password?.trim(),
      token: data.token?.trim(),
      headers: data.headers,
      createdAt: this.vault.get(cameraId)?.createdAt || new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    this.vault.set(cameraId, creds);
    this.refMap.set(secretRef, cameraId);
    return secretRef;
  }

  /**
   * Retrieves credentials by cameraId or secretRef.
   */
  public get(cameraIdOrRef: string): CameraCredentials | null {
    if (this.vault.has(cameraIdOrRef)) {
      return this.vault.get(cameraIdOrRef)!;
    }
    const cameraId = this.refMap.get(cameraIdOrRef);
    if (cameraId && this.vault.has(cameraId)) {
      return this.vault.get(cameraId)!;
    }
    return null;
  }

  /**
   * Resolves the full stream URL for backend ingestion (e.g. FFmpeg) by injecting credentials if present.
   * This resolved URL is strictly used server-side and never sent to clients.
   */
  public resolveIngestUrl(cameraId: string, defaultUrl?: string): string {
    const creds = this.get(cameraId);
    if (!creds && defaultUrl) {
      return defaultUrl;
    }
    if (!creds) {
      return defaultUrl || '';
    }

    const url = creds.rawStreamUrl || defaultUrl || '';
    if (!url) return '';

    // If username & password exist and not already in URL, inject them
    if (creds.username && creds.password && !url.includes('@')) {
      try {
        const parsed = new URL(url);
        parsed.username = encodeURIComponent(creds.username);
        parsed.password = encodeURIComponent(creds.password);
        return parsed.toString();
      } catch {
        // Fallback for rtsp:// or custom protocols URL constructor might not parse in old engines
        const schemeIdx = url.indexOf('://');
        if (schemeIdx !== -1) {
          const scheme = url.substring(0, schemeIdx + 3);
          const rest = url.substring(schemeIdx + 3);
          return `${scheme}${encodeURIComponent(creds.username)}:${encodeURIComponent(creds.password)}@${rest}`;
        }
      }
    }

    return url;
  }

  public getSecretRefForCamera(cameraId: string): string | null {
    for (const [ref, id] of this.refMap.entries()) {
      if (id === cameraId) return ref;
    }
    return null;
  }

  /**
   * Scrubs any plaintext credentials from a URL or text string for safe logging and client transmission.
   */
  public redact(text?: string): string {
    if (!text) return '';
    return text.replace(/([a-zA-Z0-9+.-]+:\/\/)([^:@]+):([^@]+)@/g, '$1***:***@');
  }
}

export const credentialVault = new CredentialVault();
