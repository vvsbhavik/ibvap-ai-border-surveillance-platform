import React, { useState } from 'react';
import { Shield, Lock, AlertCircle, ArrowRight, ShieldCheck, KeyRound, Sparkles } from 'lucide-react';
import { Button } from '../components/ui/Button';
import { Input } from '../components/ui/Input';
import { tokens } from '../design-system/tokens';

export interface LoginScreenProps {
  onLogin: (credentials: { callsign: string; password?: string; quickSwitch?: boolean }) => Promise<void>;
  isLoading: boolean;
  error?: string | null;
}

export const LoginScreen: React.FC<LoginScreenProps> = ({ onLogin, isLoading, error }) => {
  const [callsign, setCallsign] = useState('INSPECTOR-VIKRAM');
  const [password, setPassword] = useState('IBVAP-Terminal-2026!');
  const [showPassword, setShowPassword] = useState(false);

  const presetOperators = [
    {
      callsign: 'COMMANDER-SHARMA',
      role: 'Administrator',
      name: 'DIG Rajesh Sharma',
      badge: 'Super Admin',
      color: 'border-rose-500/40 text-rose-300 bg-rose-950/20 hover:border-rose-400',
    },
    {
      callsign: 'INSPECTOR-VIKRAM',
      role: 'Watch Commander',
      name: 'Inspector Vikram Singh',
      badge: 'Commander',
      color: 'border-amber-500/40 text-amber-300 bg-amber-950/20 hover:border-amber-400',
    },
    {
      callsign: 'SURVEILLANCE-PRIYA',
      role: 'Surveillance Operator',
      name: 'Sub-Inspector Priya Nair',
      badge: 'Operator',
      color: 'border-emerald-500/40 text-emerald-300 bg-emerald-950/20 hover:border-emerald-400',
    },
    {
      callsign: 'FORENSIC-ROY',
      role: 'Evidence Analyst',
      name: 'Asst. Cmdt. Ananya Roy',
      badge: 'Analyst',
      color: 'border-cyan-500/40 text-cyan-300 bg-cyan-950/20 hover:border-cyan-400',
    },
    {
      callsign: 'AUDITOR-MENON',
      role: 'Security Auditor',
      name: 'Suresh Menon',
      badge: 'Auditor',
      color: 'border-purple-500/40 text-purple-300 bg-purple-950/20 hover:border-purple-400',
    },
  ];

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (callsign.trim()) {
      onLogin({
        callsign: callsign.trim(),
        password: password,
      });
    }
  };

  const handleQuickSwitch = (targetCallsign: string) => {
    setCallsign(targetCallsign);
    setPassword('IBVAP-Terminal-2026!');
    onLogin({
      callsign: targetCallsign,
      password: 'IBVAP-Terminal-2026!',
      quickSwitch: true,
    });
  };

  return (
    <div className="min-h-screen w-full bg-slate-950 flex flex-col justify-between p-4 sm:p-6 select-none relative overflow-hidden">
      {/* Background Mission Grid Texture */}
      <div className="absolute inset-0 pointer-events-none opacity-20 bg-[linear-gradient(to_right,#1e293b_1px,transparent_1px),linear-gradient(to_bottom,#1e293b_1px,transparent_1px)] bg-[size:4rem_4rem]" />

      {/* Header */}
      <header className="relative z-10 flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <div className="p-1.5 bg-cyan-950 border border-cyan-500/50 rounded-xs text-cyan-400">
            <Shield className="w-5 h-5" />
          </div>
          <div>
            <div className="text-sm font-bold tracking-widest font-mono text-slate-100">
              IBVAP
            </div>
            <div className="text-[10px] uppercase font-mono text-slate-400 tracking-wider">
              Intelligent Border Video Analytics Platform
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2 text-[11px] font-mono text-slate-400">
          <span className="px-2 py-0.5 text-[10px] font-mono font-semibold bg-[#007AFF]/15 text-[#007AFF] border border-[#007AFF]/30 rounded">
            SIMULATION MODE
          </span>
          <ShieldCheck className="w-4 h-4 text-emerald-400" />
          <span className="hidden sm:inline">Terminal Ingress Authorization</span>
        </div>
      </header>

      {/* Center Authentication Card */}
      <main className="relative z-10 w-full max-w-lg mx-auto my-auto py-6">
        <div className={`bg-slate-900/95 border border-slate-800 ${tokens.radius.md} p-6 shadow-2xl backdrop-blur-xs`}>
          <div className="mb-5 space-y-1">
            <div className="flex items-center justify-between">
              <h1 className="text-base font-semibold text-slate-100 uppercase tracking-wider">
                Operator Session Login
              </h1>
              <span className="text-[10px] font-mono text-cyan-400 px-2 py-0.5 bg-cyan-950/40 border border-cyan-500/30 rounded">
                RBAC STRICT
              </span>
            </div>
            <p className="text-xs text-slate-400 leading-relaxed">
              Authenticate operator identity to establish station session and load role-authorized clearance policies.
            </p>
          </div>

          {error && (
            <div className="mb-4 p-3 bg-rose-950/40 border border-rose-500/40 rounded-xs flex items-center gap-2 text-xs text-rose-300">
              <AlertCircle className="w-4 h-4 text-rose-400 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          {/* Instant 1-Click Demo Button */}
          <div className="mb-5 p-3.5 bg-gradient-to-r from-blue-950/60 via-slate-900 to-indigo-950/60 border border-blue-500/40 rounded-lg shadow-inner">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div>
                <div className="text-xs font-semibold text-white flex items-center gap-1.5">
                  <Sparkles className="w-4 h-4 text-amber-400 animate-pulse" />
                  <span>Interactive System Demo</span>
                </div>
                <div className="text-[11px] text-slate-300 mt-0.5">
                  Explore full surveillance dashboard with live Indian border CCTV feeds, ANPR & Gemini AI
                </div>
              </div>
              <button
                type="button"
                id="btn-quick-demo-login"
                onClick={() => handleQuickSwitch('COMMANDER-SHARMA')}
                disabled={isLoading}
                className="px-4 py-2 bg-[#007AFF] hover:bg-blue-500 text-white font-semibold text-xs rounded-md shadow-md hover:shadow-blue-500/20 transition-all shrink-0 cursor-pointer flex items-center justify-center gap-1.5"
              >
                <span>Demo Login</span>
                <ArrowRight className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>

          {/* Operator Fast Switch */}
          <div className="mb-5 p-3 bg-slate-950/60 border border-slate-800 rounded">
            <div className="flex items-center justify-between mb-2">
              <span className="text-[11px] font-semibold uppercase font-mono text-slate-300 flex items-center gap-1.5">
                <Sparkles className="w-3.5 h-3.5 text-[#007AFF]" />
                Select Operator Station Profile
              </span>
              <span className="text-[9px] font-mono px-1.5 py-0.5 rounded bg-slate-800 text-slate-400 font-medium">
                QUICK ACCESS
              </span>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-1.5">
              {presetOperators.map((p) => (
                <button
                  key={p.callsign}
                  type="button"
                  onClick={() => handleQuickSwitch(p.callsign)}
                  disabled={isLoading}
                  className={`p-1.5 text-left border rounded transition-all cursor-pointer ${p.color} ${
                    callsign === p.callsign ? 'ring-1 ring-white/50' : 'opacity-85 hover:opacity-100'
                  }`}
                >
                  <div className="font-mono text-[11px] font-bold truncate">{p.callsign}</div>
                  <div className="text-[10px] text-slate-400 truncate">{p.role}</div>
                </button>
              ))}
            </div>
          </div>

          <form onSubmit={handleSubmit} className="space-y-3.5">
            <div>
              <label className="block text-xs text-slate-400 mb-1 font-medium">Operator Callsign or Email</label>
              <Input
                value={callsign}
                onChange={(e) => setCallsign(e.target.value)}
                placeholder="e.g. SENTINEL-LEAD or commander@ibvap.gov"
                autoFocus
              />
            </div>

            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="block text-xs text-slate-400 font-medium">Station Password</label>
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="text-[10px] text-cyan-400 hover:text-cyan-300 cursor-pointer font-mono"
                >
                  {showPassword ? 'Hide' : 'Show'}
                </button>
              </div>
              <Input
                type={showPassword ? 'text' : 'password'}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Terminal password"
              />
              <div className="flex items-center justify-between text-[10px] text-slate-500 font-mono mt-1">
                <span>Default seed password: IBVAP-Terminal-2026!</span>
                <button
                  type="button"
                  onClick={() => setPassword('IBVAP-Terminal-2026!')}
                  className="text-cyan-400 hover:text-cyan-300 underline cursor-pointer"
                >
                  Auto-Fill
                </button>
              </div>
            </div>

            <Button
              type="submit"
              variant="primary"
              size="lg"
              isLoading={isLoading}
              className="w-full mt-2"
              rightIcon={<ArrowRight className="w-4 h-4" />}
            >
              Establish Station Session
            </Button>
          </form>

          <div className="mt-5 pt-3 border-t border-slate-800 flex items-center justify-between text-[10px] font-mono text-slate-500">
            <span>SECURE CRYPTO: PBKDF2-SHA512</span>
            <span>AUDIT TRAIL: ACTIVE</span>
          </div>
        </div>
      </main>

      {/* Footer */}
      <footer className="relative z-10 flex items-center justify-between text-[10px] font-mono text-slate-500">
        <span>IBVAP • Intelligent Border Video Analytics Platform</span>
        <span>Version 2.4.0 • Strictly Enforced RBAC</span>
      </footer>
    </div>
  );
};
