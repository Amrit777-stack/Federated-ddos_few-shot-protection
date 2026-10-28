import React from 'react';
import { 
  ShieldX, 
  Layers, 
  Cpu, 
  Binary, 
  Filter, 
  Target, 
  CheckCircle2, 
  ArrowRight
} from 'lucide-react';

export default function PipelineVisualization() {
  const steps = [
    {
      id: 1,
      title: 'Target Excluded',
      subtitle: 'Pre-FL Holdout',
      icon: ShieldX,
      color: 'red',
      detail: '0 instances of target in FL training (6,000 isolated to support pool)'
    },
    {
      id: 2,
      title: '12-Class FedProx',
      subtitle: '20 FL Rounds',
      icon: Layers,
      color: 'orange',
      detail: '5 non-IID enterprise partitions, μ=0.1 proximal term, batch=256'
    },
    {
      id: 3,
      title: 'Fresh G20 Model',
      subtitle: '12-Class Output',
      icon: Cpu,
      color: 'orange',
      detail: 'Linear(64, 12) head with no prior exposure to target manifolds'
    },
    {
      id: 4,
      title: 'Frozen 64-D Space',
      subtitle: 'Latent Manifold',
      icon: Binary,
      color: 'slate',
      detail: 'Penultimate layer embeddings z = φ(x) extracted without fine-tuning'
    },
    {
      id: 5,
      title: 'k-Shot Support',
      subtitle: '10, 20, 50, 100',
      icon: Filter,
      color: 'amber',
      detail: 'Deterministic nested support exemplars drawn from held-out training pool'
    },
    {
      id: 6,
      title: '1-NN / Prototype',
      subtitle: 'Cosine Scoring',
      icon: Target,
      color: 'orange',
      detail: 'Support-calibrated thresholding: μ_supp - 2.0 * σ_supp'
    },
    {
      id: 7,
      title: 'Zero-Day Detection',
      subtitle: 'Open-Set Queries',
      icon: CheckCircle2,
      color: 'emerald',
      detail: 'Evaluated on 3,000 balanced test queries (1,500 target + 1,500 negatives)'
    }
  ];

  const colorStyles = {
    red: 'border-red-800/50 bg-red-950/30 text-red-400',
    orange: 'border-orange-800/50 bg-orange-950/30 text-orange-400',
    amber: 'border-amber-800/50 bg-amber-950/30 text-amber-300',
    slate: 'border-[#2E2E2E] bg-[#181818] text-[#EDEDED]',
    emerald: 'border-emerald-800/50 bg-emerald-950/30 text-emerald-400'
  };

  return (
    <div className="p-4 sm:p-5 rounded-sm bg-[#141414] border border-[#262626] my-6">
      {/* Header & Subtitle */}
      <div className="mb-5 flex flex-col md:flex-row md:items-center justify-between gap-3">
        <div>
          <h3 className="text-sm font-semibold font-sans text-[#EDEDED] tracking-tight">
            Rigorous Zero-Day Few-Shot Methodology Pipeline
          </h3>
          <p className="text-xs text-[#737373] font-sans mt-0.5">
            End-to-end data isolation, 12-class federated learning, and support-calibrated open-set inference
          </p>
        </div>

        <div className="px-2.5 py-1 rounded-sm bg-[#181818] border border-[#262626] text-xs font-sans text-[#A3A3A3]">
          Leakage Audit: <span className="text-emerald-400 font-semibold font-mono">10/10 Verified</span>
        </div>
      </div>

      {/* Horizontal Flow Pipeline (Desktop) / Vertical (Mobile) */}
      <div className="grid grid-cols-1 md:grid-cols-7 gap-2 relative">
        {steps.map((step, idx) => {
          const Icon = step.icon;
          const style = colorStyles[step.color] || colorStyles.slate;

          return (
            <React.Fragment key={step.id}>
              <div className="relative flex flex-col items-center text-center p-3 rounded-sm bg-[#181818] border border-[#262626] hover:border-orange-500/40 transition-all duration-150">
                <div className={`w-8 h-8 rounded-sm border flex items-center justify-center mb-2 ${style}`}>
                  <Icon className="w-4 h-4" />
                </div>

                <span className="text-[10px] font-mono text-[#737373]">
                  STEP 0{step.id}
                </span>
                <span className="text-xs font-sans font-semibold text-[#EDEDED] mt-0.5">
                  {step.title}
                </span>
                <span className="text-[11px] font-mono text-orange-400 mt-0.5">
                  {step.subtitle}
                </span>

                <p className="text-[11px] text-[#A3A3A3] font-sans mt-2 leading-tight">
                  {step.detail}
                </p>
              </div>

              {/* Connecting arrow for desktop between steps */}
              {idx < steps.length - 1 && (
                <div className="hidden md:flex absolute top-1/2 -translate-y-1/2 pointer-events-none text-[#404040]"
                  style={{ left: `calc(${((idx + 1) * 100) / 7}% - 8px)` }}
                >
                  <ArrowRight className="w-3.5 h-3.5 text-orange-500/50" />
                </div>
              )}
            </React.Fragment>
          );
        })}
      </div>

      {/* Scientific Explanation Box */}
      <div className="mt-4 p-3.5 rounded-sm bg-[#181818] border border-orange-700/30 flex items-start space-x-3 text-xs font-sans">
        <CheckCircle2 className="w-4 h-4 text-emerald-400 flex-shrink-0 mt-0.5" />
        <div>
          <span className="font-semibold text-orange-400 block mb-1">
            Scientific Guarantee of Zero-Day Integrity
          </span>
          <p className="text-[#A3A3A3] leading-relaxed text-xs">
            "The target attack was excluded from federated training. A small target-specific support set was introduced only after training, while query samples remained untouched for evaluation."
          </p>
          <div className="mt-2 flex flex-wrap gap-4 text-xs font-sans text-[#737373]">
            <span>• No representation leakage</span>
            <span>• Scaler fitted on 12-class FL train data only</span>
            <span>• Penultimate weights strictly frozen</span>
          </div>
        </div>
      </div>
    </div>
  );
}
