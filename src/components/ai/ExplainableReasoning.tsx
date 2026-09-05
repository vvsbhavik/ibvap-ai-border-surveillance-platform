import React from 'react';
import { CheckCircle2, AlertCircle, HelpCircle, ShieldCheck } from 'lucide-react';
import { AlertReasoningFactor } from '../../server/types';
import { tokens } from '../../design-system/tokens';

export interface ExplainableReasoningProps {
  factors: AlertReasoningFactor[];
  confidenceScore: number;
  isSimulation?: boolean;
  className?: string;
}

export const ExplainableReasoning: React.FC<ExplainableReasoningProps> = ({
  factors,
  confidenceScore,
  isSimulation = false,
  className = '',
}) => {
  const percent = Math.round(confidenceScore * 100);

  return (
    <div className={`flex flex-col gap-2.5 p-3.5 bg-slate-950/70 border border-slate-800/90 ${tokens.radius.md} ${className}`}>
      <div className="flex items-center justify-between border-b border-slate-800 pb-2">
        <div className="flex items-center gap-1.5">
          <ShieldCheck className="w-3.5 h-3.5 text-cyan-400" />
          <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-200">
            Why This Event Was Prioritized
          </span>
        </div>

        <div className="flex items-center gap-2">
          {isSimulation && (
            <span className="text-[10px] font-mono uppercase bg-[#007AFF]/20 text-[#007AFF] px-1.5 py-0.5 border border-[#007AFF]/40 rounded-xs">
              Simulation Mode
            </span>
          )}
          <span className="text-xs font-mono-num font-semibold text-cyan-300">
            {percent}% Confidence
          </span>
        </div>
      </div>

      {/* Reasoning Factors Factor-Weight Stack */}
      <div className="space-y-2">
        {factors.map((factor, idx) => (
          <div key={idx} className="flex flex-col gap-1 p-2 bg-slate-900/60 border border-slate-800/80 rounded-xs">
            <div className="flex items-center justify-between text-xs">
              <div className="flex items-center gap-1.5">
                {factor.verified ? (
                  <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                ) : (
                  <HelpCircle className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                )}
                <span className="font-medium text-slate-200">{factor.factor}</span>
              </div>
              <span className="text-[10px] font-mono-num text-slate-400 shrink-0">
                Weight: {(factor.weight * 100).toFixed(0)}%
              </span>
            </div>
            {factor.detail && (
              <p className="text-[11px] text-slate-400 pl-5 leading-relaxed font-mono-num">
                {factor.detail}
              </p>
            )}
          </div>
        ))}
      </div>

      <div className="pt-1 text-[10px] text-slate-500 font-mono-num flex items-center justify-between">
        <span>Model: Edge-Vision-YOLO-T4</span>
        <span>Explainability Protocol: ISO/IEC DIS 22989</span>
      </div>
    </div>
  );
};
