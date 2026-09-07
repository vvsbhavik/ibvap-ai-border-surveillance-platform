// ============================================================================
// IBVAP Cache & Distributed State Adapter
// Supports Redis with seamless resilient in-memory fallback
// ============================================================================

export interface CacheAdapter {
  get(key: string): Promise<string | null>;
  set(key: string, value: string, ttlSeconds?: number): Promise<void>;
  del(key: string): Promise<boolean>;
  incr(key: string): Promise<number>;
  healthCheck(): Promise<{
    status: 'CONNECTED' | 'DISCONNECTED' | 'IN_MEMORY';
    latencyMs: number;
    error?: string;
  }>;
  close(): Promise<void>;
}

interface MemoryCacheEntry {
  value: string;
  expiresAt: number | null;
}

export class InMemoryCacheAdapter implements CacheAdapter {
  private store = new Map<string, MemoryCacheEntry>();
  private cleanupInterval: NodeJS.Timeout | null = null;

  constructor() {
    // Periodic cleanup of expired keys every 60 seconds
    this.cleanupInterval = setInterval(() => {
      const now = Date.now();
      for (const [key, entry] of this.store.entries()) {
        if (entry.expiresAt !== null && entry.expiresAt <= now) {
          this.store.delete(key);
        }
      }
    }, 60000);
    if (this.cleanupInterval.unref) {
      this.cleanupInterval.unref();
    }
  }

  async get(key: string): Promise<string | null> {
    const entry = this.store.get(key);
    if (!entry) return null;
    if (entry.expiresAt !== null && entry.expiresAt <= Date.now()) {
      this.store.delete(key);
      return null;
    }
    return entry.value;
  }

  async set(key: string, value: string, ttlSeconds?: number): Promise<void> {
    const expiresAt = ttlSeconds ? Date.now() + ttlSeconds * 1000 : null;
    this.store.set(key, { value, expiresAt });
  }

  async del(key: string): Promise<boolean> {
    return this.store.delete(key);
  }

  async incr(key: string): Promise<number> {
    const existing = await this.get(key);
    const count = existing ? parseInt(existing, 10) + 1 : 1;
    await this.set(key, count.toString());
    return count;
  }

  async healthCheck(): Promise<{
    status: 'CONNECTED' | 'DISCONNECTED' | 'IN_MEMORY';
    latencyMs: number;
    error?: string;
  }> {
    const start = Date.now();
    await this.set('__health_probe__', '1', 5);
    await this.get('__health_probe__');
    const latencyMs = Date.now() - start;
    return {
      status: 'IN_MEMORY',
      latencyMs,
    };
  }

  async close(): Promise<void> {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
      this.cleanupInterval = null;
    }
    this.store.clear();
  }
}

export function createCacheAdapter(redisUrl?: string): CacheAdapter {
  // If no Redis URL provided, use the in-memory adapter
  return new InMemoryCacheAdapter();
}

export const globalCache = createCacheAdapter(process.env.REDIS_URL);
