import React, { useState, useEffect } from 'react';
import {
  Play,
  Pause,
  RotateCcw,
  FastForward,
  Activity,
  Layers,
  CheckCircle,
  AlertCircle,
  Radio,
  Clock,
} from 'lucide-react';
import {
  SimulationScenarioId,
  SimulationScenarioDefinition,
  DigitalTwinState,
} from '../../simulation/types';
import { Button } from '../../components/ui/Button';

interface DigitalTwinControlsProps {
  onScenarioUpdated?: () => void;
}

export const DigitalTwinControls: React.FC<DigitalTwinControlsProps> = ({
  onScenarioUpdated,
}) => {
  const [scenarios, setScenarios] = useState<SimulationScenarioDefinition[]>([]);
  const [state, setState] = useState<DigitalTwinState | null>(null);
  const [selectedScenarioId, setSelectedScenarioId] = useState<SimulationScenarioId>('SCENARIO_A');
  const [loading, setLoading] = useState(false);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);

  const fetchScenarios = async () => {
    try {
      const res = await fetch('/api/v1/simulation/scenarios');
      const json = await res.json();
      if (json.success && json.scenarios) {
        setScenarios(json.scenarios);
      }
    } catch (err) {
      console.error('Failed to fetch simulation scenarios', err);
    }
  };

  const fetchState = async () => {
    try {
      const res = await fetch('/api/v1/simulation/state');
      const json = await res.json();
      if (json.success && json.state) {
        setState(json.state);
        if (json.state.activeScenario) {
          setSelectedScenarioId(json.state.activeScenario.id);
        }
      }
    } catch (err) {
      console.error('Failed to fetch simulation state', err);
    }
  };

  useEffect(() => {
    fetchScenarios();
    fetchState();
    const interval = setInterval(fetchState, 1500);
    return () => clearInterval(interval);
  }, []);

  const handleStart = async () => {
    try {
      setLoading(true);
      const res = await fetch('/api/v1/simulation/start', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-user-callsign': 'COMMANDER-1',
        },
        body: JSON.stringify({ scenarioId: selectedScenarioId }),
      });
      const json = await res.json();
      if (json.success && json.state) {
        setState(json.state);
        setStatusMessage(json.message);
        setTimeout(() => setStatusMessage(null), 3000);
        onScenarioUpdated?.();
      }
    } catch (err: any) {
      setStatusMessage(`Error: ${err.message}`);
    } finally {
      setLoading(false);
    }
  };

  const handlePause = async () => {
    try {
      setLoading(true);
      const res = await fetch('/api/v1/simulation/pause', { method: 'POST' });
      const json = await res.json();
      if (json.success && json.state) {
        setState(json.state);
        onScenarioUpdated?.();
      }
    } finally {
      setLoading(false);
    }
  };

  const handleResume = async () => {
    try {
      setLoading(true);
      const res = await fetch('/api/v1/simulation/resume', { method: 'POST' });
      const json = await res.json();
      if (json.success && json.state) {
        setState(json.state);
        onScenarioUpdated?.();
      }
    } finally {
      setLoading(false);
    }
  };

  const handleSpeed = async (multiplier: number) => {
    try {
      const res = await fetch('/api/v1/simulation/speed', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ multiplier }),
      });
      const json = await res.json();
      if (json.success && json.state) {
        setState(json.state);
      }
    } catch (err) {
      console.error('Failed to change speed', err);
    }
  };

  const handleReset = async () => {
    try {
      setLoading(true);
      const res = await fetch('/api/v1/simulation/reset', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-user-callsign': 'COMMANDER-1',
        },
      });
      const json = await res.json();
      if (json.success && json.state) {
        setState(json.state);
        setStatusMessage(json.message);
        setTimeout(() => setStatusMessage(null), 3000);
        onScenarioUpdated?.();
      }
    } catch (err: any) {
      setStatusMessage(`Error: ${err.message}`);
    } finally {
      setLoading(false);
    }
  };

  const selectedScenario = scenarios.find((s) => s.id === selectedScenarioId);

  return (
    <div className="bg-[#0F1115] border border-[#23262B] rounded-lg p-4 space-y-4 text-xs font-sans">
      {/* Header & Mandatory Provenance */}
      <div className="flex items-center justify-between border-b border-[#23262B] pb-3">
        <div className="flex items-center gap-2">
          <Layers className="w-4 h-4 text-[#007AFF]" />
          <h3 className="text-white font-semibold text-xs">Digital Twin Scenario Engine</h3>
        </div>
        <span className="px-2 py-0.5 text-[10px] font-mono-num font-bold bg-[#FF9500]/15 text-[#FF9500] border border-[#FF9500]/30 rounded">
          SIMULATION MODE / TEST DATA
        </span>
      </div>

      {/* Scenario Selector */}
      <div>
        <label className="text-[11px] font-mono-num text-[#A9ACB1] block mb-1.5 uppercase tracking-wider">
          Select Operational Scenario (A – J)
        </label>
        <select
          value={selectedScenarioId}
          onChange={(e) => setSelectedScenarioId(e.target.value as SimulationScenarioId)}
          className="w-full h-8 px-2.5 bg-[#14161A] border border-[#23262B] rounded text-xs text-white focus:outline-none focus:border-[#007AFF]"
        >
          {scenarios.map((scen) => (
            <option key={scen.id} value={scen.id}>
              {scen.name}
            </option>
          ))}
        </select>
      </div>

      {/* Active Scenario Card */}
      {selectedScenario && (
        <div className="p-3 bg-[#14161A] border border-[#23262B] rounded space-y-2">
          <div className="flex items-center justify-between">
            <span className="font-mono-num text-[11px] font-bold text-[#007AFF]">
              {selectedScenario.code}
            </span>
            <span className="text-[10px] font-mono-num px-1.5 py-0.5 rounded bg-[#0A0B0D] text-[#A9ACB1] border border-[#23262B]">
              {selectedScenario.category}
            </span>
          </div>
          <p className="text-[11px] text-[#A9ACB1] leading-relaxed">
            {selectedScenario.description}
          </p>
          <div className="flex flex-wrap items-center gap-2 pt-1 font-mono-num text-[10px] text-[#6C727A]">
            <span>Sensors: {selectedScenario.involvedCameras.join(', ')}</span>
            <span>·</span>
            <span>Duration: ~{selectedScenario.estimatedDurationSeconds}s</span>
          </div>
        </div>
      )}

      {/* Execution Controls & Status Bar */}
      <div className="space-y-2.5">
        <div className="flex items-center justify-between font-mono-num text-[11px] bg-[#14161A] p-2.5 rounded border border-[#23262B]">
          <div className="flex items-center gap-2">
            <span
              className={`w-2 h-2 rounded-full ${
                state?.status === 'RUNNING'
                  ? 'bg-[#34C759] animate-pulse'
                  : state?.status === 'PAUSED'
                  ? 'bg-[#FF9500]'
                  : state?.status === 'COMPLETED'
                  ? 'bg-[#007AFF]'
                  : 'bg-[#6C727A]'
              }`}
            />
            <span className="text-white font-semibold">{state?.status || 'IDLE'}</span>
          </div>

          <div className="flex items-center gap-3 text-[#A9ACB1]">
            <span className="flex items-center gap-1">
              <Clock className="w-3 h-3 text-[#6C727A]" />
              {state?.elapsedSeconds ?? 0}s
            </span>
            <span className="flex items-center gap-1">
              <Radio className="w-3 h-3 text-[#007AFF]" />
              {state?.activeActors.length ?? 0} Actors
            </span>
          </div>
        </div>

        {/* Buttons Row */}
        <div className="flex items-center gap-2">
          {state?.status === 'RUNNING' ? (
            <Button
              variant="outline"
              size="sm"
              className="flex-1"
              onClick={handlePause}
              disabled={loading}
              leftIcon={<Pause className="w-3.5 h-3.5" />}
            >
              Pause Drill
            </Button>
          ) : state?.status === 'PAUSED' ? (
            <Button
              variant="primary"
              size="sm"
              className="flex-1"
              onClick={handleResume}
              disabled={loading}
              leftIcon={<Play className="w-3.5 h-3.5" />}
            >
              Resume Drill
            </Button>
          ) : (
            <Button
              variant="primary"
              size="sm"
              className="flex-1"
              onClick={handleStart}
              disabled={loading}
              leftIcon={<Play className="w-3.5 h-3.5" />}
            >
              Launch Scenario
            </Button>
          )}

          {/* Speed Toggles */}
          <div className="flex items-center bg-[#14161A] border border-[#23262B] rounded px-1 h-8">
            {[1, 2, 5].map((speed) => (
              <button
                key={speed}
                onClick={() => handleSpeed(speed)}
                className={`px-2 py-0.5 text-[10px] font-mono-num rounded transition-colors ${
                  state?.speedMultiplier === speed
                    ? 'bg-[#007AFF] text-white font-bold'
                    : 'text-[#6C727A] hover:text-white'
                }`}
              >
                {speed}x
              </button>
            ))}
          </div>

          {/* Safe Reset Button */}
          <Button
            variant="outline"
            size="sm"
            onClick={handleReset}
            disabled={loading}
            title="Safe reset: Clears transient simulation tracks and alerts; preserves real logs"
            leftIcon={<RotateCcw className="w-3.5 h-3.5" />}
          >
            Safe Reset
          </Button>
        </div>

        {statusMessage && (
          <div className="text-[10px] font-mono-num text-[#34C759] bg-[#34C759]/10 border border-[#34C759]/20 p-2 rounded">
            {statusMessage}
          </div>
        )}
      </div>

      {/* Realtime Event Stream from Simulation */}
      <div>
        <h4 className="text-[11px] font-mono-num text-[#A9ACB1] block mb-1.5 uppercase tracking-wider">
          Simulation Event Injects ({state?.recentEventsEmitted.length ?? 0})
        </h4>
        <div className="bg-[#14161A] border border-[#23262B] rounded max-h-36 overflow-y-auto divide-y divide-[#23262B] text-[10px] font-mono-num">
          {state?.recentEventsEmitted && state.recentEventsEmitted.length > 0 ? (
            state.recentEventsEmitted.map((evt) => (
              <div key={evt.eventId} className="p-2 space-y-0.5 hover:bg-[#1A1D23] transition-colors">
                <div className="flex justify-between text-[#6C727A]">
                  <span className="text-[#007AFF]">{evt.eventType}</span>
                  <span>{new Date(evt.timestamp).toLocaleTimeString()}</span>
                </div>
                <p className="text-[#E0E2E6]">{evt.description}</p>
              </div>
            ))
          ) : (
            <div className="p-3 text-center text-[#6C727A]">
              No simulation events injected yet. Launch a scenario to observe telemetry.
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
