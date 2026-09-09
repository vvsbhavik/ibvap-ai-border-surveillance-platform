import { createClient, SupabaseClient } from '@supabase/supabase-js';

export interface SupabaseConfig {
  url: string;
  anonKey: string;
  isConfigured: boolean;
  status: 'CONNECTED' | 'DISCONNECTED' | 'NOT_CONFIGURED' | 'ERROR';
  lastCheckedAt?: string;
  error?: string;
}

// Local storage key for persistent custom Supabase settings entered in UI
const STORAGE_KEY_URL = 'ibvap_supabase_url';
const STORAGE_KEY_KEY = 'ibvap_supabase_key';

export function getSupabaseCredentials(): { url: string; anonKey: string } {
  let url = '';
  let anonKey = '';

  if (typeof window !== 'undefined') {
    url = localStorage.getItem(STORAGE_KEY_URL) || '';
    anonKey = localStorage.getItem(STORAGE_KEY_KEY) || '';
  }

  // Fallback to environment variables
  if (!url) {
    if (typeof import.meta !== 'undefined' && import.meta.env?.VITE_SUPABASE_URL) {
      url = import.meta.env.VITE_SUPABASE_URL;
    } else if (typeof process !== 'undefined' && process.env?.SUPABASE_URL) {
      url = process.env.SUPABASE_URL;
    }
  }

  if (!anonKey) {
    if (typeof import.meta !== 'undefined' && import.meta.env?.VITE_SUPABASE_ANON_KEY) {
      anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;
    } else if (typeof process !== 'undefined' && process.env?.SUPABASE_ANON_KEY) {
      anonKey = process.env.SUPABASE_ANON_KEY;
    }
  }

  return { url: url.trim(), anonKey: anonKey.trim() };
}

export function saveSupabaseCredentials(url: string, anonKey: string): void {
  if (typeof window !== 'undefined') {
    if (url) localStorage.setItem(STORAGE_KEY_URL, url.trim());
    else localStorage.removeItem(STORAGE_KEY_URL);

    if (anonKey) localStorage.setItem(STORAGE_KEY_KEY, anonKey.trim());
    else localStorage.removeItem(STORAGE_KEY_KEY);
  }
  // Reset cached client
  cachedClient = null;
}

let cachedClient: SupabaseClient | null = null;

export function getSupabaseClient(): SupabaseClient | null {
  if (cachedClient) return cachedClient;

  const { url, anonKey } = getSupabaseCredentials();
  if (!url || !anonKey) {
    return null;
  }

  try {
    cachedClient = createClient(url, anonKey, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
      },
    });
    return cachedClient;
  } catch (err) {
    console.error('Failed to initialize Supabase client:', err);
    return null;
  }
}

export async function checkSupabaseHealth(): Promise<SupabaseConfig> {
  const { url, anonKey } = getSupabaseCredentials();
  if (!url || !anonKey) {
    return {
      url: '',
      anonKey: '',
      isConfigured: false,
      status: 'NOT_CONFIGURED',
      lastCheckedAt: new Date().toISOString(),
    };
  }

  const client = getSupabaseClient();
  if (!client) {
    return {
      url,
      anonKey: anonKey ? '••••••••' + anonKey.slice(-4) : '',
      isConfigured: true,
      status: 'ERROR',
      error: 'Client initialization failed',
      lastCheckedAt: new Date().toISOString(),
    };
  }

  try {
    // Probe a standard query or auth health
    const { error } = await client.from('cameras').select('id').limit(1);
    if (error && error.code !== 'PGRST116' && !error.message?.includes('relation "cameras" does not exist')) {
      // If table doesn't exist yet, connection is still valid!
      if (error.message?.includes('relation') && error.message?.includes('does not exist')) {
        return {
          url,
          anonKey: '••••••••' + anonKey.slice(-4),
          isConfigured: true,
          status: 'CONNECTED',
          lastCheckedAt: new Date().toISOString(),
        };
      }
      return {
        url,
        anonKey: '••••••••' + anonKey.slice(-4),
        isConfigured: true,
        status: 'ERROR',
        error: error.message,
        lastCheckedAt: new Date().toISOString(),
      };
    }

    return {
      url,
      anonKey: '••••••••' + anonKey.slice(-4),
      isConfigured: true,
      status: 'CONNECTED',
      lastCheckedAt: new Date().toISOString(),
    };
  } catch (err: any) {
    return {
      url,
      anonKey: '••••••••' + anonKey.slice(-4),
      isConfigured: true,
      status: 'ERROR',
      error: err?.message || 'Connection timeout or network failure',
      lastCheckedAt: new Date().toISOString(),
    };
  }
}

/**
 * SQL Quick Start for setting up Supabase tables
 */
export const SUPABASE_SETUP_SQL = `-- IBVAP (Intelligent Border Video Analytics Platform)
-- Supabase Schema Quick Setup

-- Cameras Table
CREATE TABLE IF NOT EXISTS public.cameras (
  id TEXT PRIMARY KEY,
  identifier TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL,
  sector_id TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'ONLINE',
  current_fps NUMERIC DEFAULT 30.0,
  current_latency_ms INTEGER DEFAULT 45,
  rtsp_stream_uri TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Alerts Table
CREATE TABLE IF NOT EXISTS public.alerts (
  id TEXT PRIMARY KEY,
  alert_number TEXT UNIQUE,
  title TEXT NOT NULL,
  description TEXT,
  severity TEXT NOT NULL DEFAULT 'MEDIUM',
  status TEXT NOT NULL DEFAULT 'PENDING_ACK',
  camera_id TEXT NOT NULL,
  sector_id TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Incidents Table
CREATE TABLE IF NOT EXISTS public.incidents (
  id TEXT PRIMARY KEY,
  incident_number TEXT UNIQUE NOT NULL,
  title TEXT NOT NULL,
  summary TEXT,
  severity TEXT NOT NULL DEFAULT 'HIGH',
  status TEXT NOT NULL DEFAULT 'OPEN',
  sector_id TEXT NOT NULL,
  primary_camera_id TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  resolved_at TIMESTAMPTZ
);

-- ANPR Records Table
CREATE TABLE IF NOT EXISTS public.anpr_records (
  id TEXT PRIMARY KEY,
  plate_number TEXT NOT NULL,
  confidence_score NUMERIC DEFAULT 0.95,
  vehicle_type TEXT,
  camera_id TEXT NOT NULL,
  sector_id TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Enable Row Level Security (RLS) with permissive read/write for service
ALTER TABLE public.cameras ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.alerts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.incidents ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.anpr_records ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow authenticated read" ON public.cameras FOR SELECT USING (true);
CREATE POLICY "Allow authenticated read" ON public.alerts FOR SELECT USING (true);
CREATE POLICY "Allow authenticated read" ON public.incidents FOR SELECT USING (true);
CREATE POLICY "Allow authenticated read" ON public.anpr_records FOR SELECT USING (true);
`;
