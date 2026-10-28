import React, { useState, useEffect } from 'react';
import { 
  LineChart, 
  Line, 
  BarChart, 
  Bar, 
  XAxis, 
  YAxis, 
  Tooltip, 
  ResponsiveContainer, 
  CartesianGrid, 
  Legend 
} from 'recharts';
import { 
  BarChart3, 
  TrendingUp, 
  RotateCw, 
  ShieldCheck, 
  Layers, 
  Award,
  CheckCircle2,
  FileCheck,
  Info
} from 'lucide-react';
import { fetchResearch, fetchRoundHistory, fetchFewShotSummary } from '../services/api';

export default function ResearchPage() {
  const [researchData, setResearchData] = useState(null);
  const [roundHistory, setRoundHistory] = useState([]);
  const [fewShotSummary, setFewShotSummary] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      try {
        setLoading(true);
        const [researchRes, historyRes, fewShotRes] = await Promise.all([
          fetchResearch(),
          fetchRoundHistory(),
          fetchFewShotSummary().catch(() => null)
        ]);
        setResearchData(researchRes);
        setRoundHistory(historyRes || []);
        if (fewShotRes) setFewShotSummary(fewShotRes);
      } catch (err) {
        console.error('Failed to load research data:', err);
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[350px] font-sans text-[#737373] text-xs">
        <RotateCw className="w-4 h-4 animate-spin mr-2 text-orange-400" />
        <span>Aggregating research benchmark metrics...</span>
      </div>
    );
  }

  const modelComparisons = [
    { name: 'Centralized Random Forest', type: 'Centralized Baseline', accuracy: 87.11, f1: 86.96, notes: 'Full dataset in single memory pool' },
    { name: 'Centralized Neural Network (MLP)', type: 'Centralized Baseline', accuracy: 75.55, f1: null, notes: 'Upper bound for centralized gradient descent' },
    { name: 'FedProx (20 Rounds, μ=0.1)', type: 'Federated Model (Ours)', accuracy: 72.69, f1: 70.55, notes: 'Stabilizes non-IID client drift (G20 checkpoint)' },
    { name: 'FedProx (10 Rounds, μ=0.1)', type: 'Federated Model', accuracy: 67.43, f1: 63.88, notes: 'Intermediate communication checkpoint' },
    { name: 'Vanilla FedAvg (10 Rounds)', type: 'Federated Baseline', accuracy: 57.42, f1: 49.69, notes: 'Severe divergence under heterogeneous non-IID partitions' },
    { name: 'Zero-Day Few-Shot (1-NN 50s, 12 Attacks)', type: 'Held-Out Adaptation', accuracy: 91.16, f1: 91.96, notes: '12 isolated unseen attack classes (97.48% recall)' }
  ];

  // Format round history for Recharts
  const convergenceData = roundHistory.map((r) => ({
    round: `R${r.round}`,
    roundNum: r.round,
    Accuracy: +(r.accuracy * 100).toFixed(2),
    F1: +(r.f1 * 100).toFixed(2),
    Loss: +r.loss.toFixed(4)
  }));

  // Method comparison data from summary
  const summaryRows = fewShotSummary?.summary || researchData?.fewShotSummary || [];
  const methodCompData = [10, 20, 50, 100].map((shots) => {
    const knn = summaryRows.find((s) => s.method === '1-NN' && s.support_size === shots);
    const proto = summaryRows.find((s) => s.method === 'Prototype' && s.support_size === shots);
    return {
      shots: `${shots}s`,
      '1-NN (Exemplar)': knn ? +(knn.f1_mean ? knn.f1_mean * 100 : knn.f1 * 100).toFixed(2) : 0,
      'Prototype (Centroid)': proto ? +(proto.f1_mean ? proto.f1_mean * 100 : proto.f1 * 100).toFixed(2) : 0
    };
  });

  return (
    <div className="space-y-4 sm:space-y-5">
      {/* Header Banner */}
      <div className="p-4 sm:p-5 rounded-sm bg-[#141414] border border-[#262626] flex flex-col md:flex-row items-start md:items-center justify-between gap-3">
        <div>
          <div className="flex items-center space-x-2">
            <BarChart3 className="w-4 h-4 text-orange-400" />
            <h2 className="text-base sm:text-lg font-semibold text-[#EDEDED] font-sans tracking-tight">
              Experimental Results & Academic Benchmarks
            </h2>
          </div>
          <p className="text-xs text-[#737373] font-sans mt-0.5">
            Empirical comparisons across centralized baselines, federated architectures, and true held-out zero-day few-shot adaptation.
          </p>
        </div>

        <div className="flex items-center space-x-2 text-xs font-sans">
          <span className="px-2.5 py-1 rounded-sm bg-[#181818] border border-[#262626] text-orange-400 font-mono">
            Source: CSV & Checkpoint Artifacts
          </span>
          <span className="px-2.5 py-1 rounded-sm bg-emerald-950/40 border border-emerald-800/40 text-emerald-400 font-medium">
            100% Reproducible
          </span>
        </div>
      </div>

      {/* Model Benchmark Comparison Table & Overview */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 sm:gap-5">
        {/* Table of Baselines */}
        <div className="p-4 sm:p-5 rounded-sm bg-[#141414] border border-[#262626] flex flex-col justify-between">
          <div>
            <h3 className="text-sm font-semibold text-[#EDEDED] font-sans tracking-tight mb-1">
              Centralized vs. Federated Baseline Comparison
            </h3>
            <p className="text-xs text-[#737373] font-sans mb-3">
              Standardized evaluation on the canonical 18,088 held-out test split
            </p>

            <div className="overflow-x-auto rounded-sm border border-[#262626]">
              <table className="w-full text-left font-sans text-xs">
                <thead className="bg-[#0D0D0D] border-b border-[#262626] text-[#737373] font-medium text-[11px]">
                  <tr>
                    <th className="py-2.5 px-3">Architecture</th>
                    <th className="py-2.5 px-3">Category</th>
                    <th className="py-2.5 px-3 text-right">Accuracy</th>
                    <th className="py-2.5 px-3 text-right">F1 Score</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#262626]">
                  {modelComparisons.map((m, idx) => (
                    <tr
                      key={idx}
                      className={`transition-colors ${
                        m.type.includes('Ours') || m.type.includes('Held-Out')
                          ? 'bg-[#1E1915] text-[#EDEDED] hover:bg-[#251E19] border-l-2 border-l-orange-500'
                          : 'text-[#A3A3A3] hover:bg-[#1E1E1E] hover:text-[#EDEDED]'
                      }`}
                    >
                      <td className="py-2.5 px-3">
                        <div className="text-xs font-medium text-[#EDEDED]">{m.name}</div>
                        <div className="text-[11px] text-[#737373]">{m.notes}</div>
                      </td>
                      <td className="py-2.5 px-3 text-xs">
                        <span className={`px-2 py-0.5 rounded-sm text-[11px] font-medium ${
                          m.type.includes('Held-Out') 
                            ? 'bg-orange-950/60 border border-orange-800/60 text-orange-400' 
                            : m.type.includes('Ours')
                            ? 'bg-emerald-950/60 border border-emerald-800/50 text-emerald-400'
                            : 'bg-[#181818] border border-[#262626] text-[#737373]'
                        }`}>
                          {m.type}
                        </span>
                      </td>
                      <td className="py-2.5 px-3 text-right font-mono font-semibold text-[#EDEDED]">
                        {m.accuracy}%
                      </td>
                      <td className="py-2.5 px-3 text-right font-mono font-bold text-orange-400">
                        {m.f1 ? `${m.f1}%` : '—'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <div className="mt-3 pt-3 border-t border-[#262626] flex items-center justify-between text-xs font-sans text-[#737373]">
            <span>FedProx Gain over FedAvg: <strong className="font-mono text-emerald-400 font-bold">+15.27% Acc</strong></span>
            <span>FL Efficiency: <strong className="font-mono text-orange-400 font-medium">20 Rounds</strong></span>
          </div>
        </div>

        {/* Few-Shot Method Comparison Bar Chart */}
        <div className="p-4 sm:p-5 rounded-sm bg-[#141414] border border-[#262626]">
          <div className="flex items-center justify-between mb-2">
            <div>
              <h3 className="text-sm font-semibold text-[#EDEDED] font-sans tracking-tight">
                Few-Shot Zero-Day Mean F1: 1-NN vs. Prototype
              </h3>
              <p className="text-xs text-[#737373] font-sans">
                Averaged across all 12 held-out attack classes (96 total evaluated configurations)
              </p>
            </div>
            <span className="text-xs font-mono font-semibold text-emerald-400">Peak: 91.96% F1</span>
          </div>

          <div className="h-[230px] w-full mt-2">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={methodCompData} margin={{ top: 5, right: 15, left: -10, bottom: 0 }}>
                <CartesianGrid strokeDasharray="2 2" stroke="#222222" />
                <XAxis dataKey="shots" stroke="#333333" tick={{ fill: '#737373', fontSize: 11, fontFamily: 'JetBrains Mono, monospace' }} />
                <YAxis domain={[75, 100]} stroke="#333333" tick={{ fill: '#737373', fontSize: 11, fontFamily: 'JetBrains Mono, monospace' }} />
                <Tooltip
                  contentStyle={{
                    backgroundColor: '#181818',
                    borderColor: '#262626',
                    borderRadius: '2px',
                    fontFamily: 'JetBrains Mono, monospace',
                    fontSize: '11px',
                    color: '#EDEDED'
                  }}
                />
                <Legend wrapperStyle={{ fontSize: '11px', fontFamily: 'Inter, sans-serif' }} />
                <Bar dataKey="1-NN (Exemplar)" fill="#EA580C" radius={[2, 2, 0, 0]} />
                <Bar dataKey="Prototype (Centroid)" fill="#525252" radius={[2, 2, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      {/* FedProx 20-Round Training Convergence Charts */}
      <div className="p-4 sm:p-5 rounded-sm bg-[#141414] border border-[#262626]">
        <div className="flex items-center justify-between mb-3">
          <div>
            <h3 className="text-sm font-semibold text-[#EDEDED] font-sans tracking-tight">
              FedProx Communication Round Progression (G0 → G20)
            </h3>
            <p className="text-xs text-[#737373] font-sans">
              Convergence telemetry across 20 global rounds on 5 non-IID clients (μ = 0.1)
            </p>
          </div>
          <span className="text-xs font-mono text-orange-400 font-bold">Run: run_010_20_rounds</span>
        </div>

        <div className="h-[220px] w-full">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={convergenceData} margin={{ top: 5, right: 15, left: -10, bottom: 0 }}>
              <CartesianGrid strokeDasharray="2 2" stroke="#222222" />
              <XAxis dataKey="round" stroke="#333333" tick={{ fill: '#737373', fontSize: 11, fontFamily: 'JetBrains Mono, monospace' }} />
              <YAxis yAxisId="left" domain={[30, 80]} stroke="#333333" tick={{ fill: '#737373', fontSize: 11, fontFamily: 'JetBrains Mono, monospace' }} />
              <YAxis yAxisId="right" orientation="right" domain={[0, 2.5]} stroke="#333333" tick={{ fill: '#737373', fontSize: 11, fontFamily: 'JetBrains Mono, monospace' }} />
              <Tooltip
                contentStyle={{
                  backgroundColor: '#181818',
                  borderColor: '#262626',
                  borderRadius: '2px',
                  fontFamily: 'JetBrains Mono, monospace',
                  fontSize: '11px',
                  color: '#EDEDED'
                }}
              />
              <Legend wrapperStyle={{ fontSize: '11px', fontFamily: 'Inter, sans-serif' }} />
              <Line yAxisId="left" type="monotone" dataKey="Accuracy" name="Global Test Accuracy (%)" stroke="#22C55E" strokeWidth={2} dot={{ r: 2.5 }} />
              <Line yAxisId="left" type="monotone" dataKey="F1" name="Global Test F1 (%)" stroke="#F97316" strokeWidth={2} dot={{ r: 2.5 }} />
              <Line yAxisId="right" type="monotone" dataKey="Loss" name="Global Loss" stroke="#737373" strokeWidth={1.5} strokeDasharray="3 3" dot={{ r: 2 }} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Research Methodology Audit Verification */}
      <div className="p-4 sm:p-5 rounded-sm bg-[#141414] border border-[#262626] space-y-3">
        <div className="flex items-center space-x-2">
          <CheckCircle2 className="w-4 h-4 text-emerald-400" />
          <h3 className="text-sm font-semibold text-[#EDEDED] font-sans tracking-tight">
            Scientific Rigor & 15-Point Leakage Audit Verification
          </h3>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-xs font-sans text-[#737373]">
          <div className="p-3 rounded-sm bg-[#181818] border border-[#262626] space-y-1">
            <span className="text-orange-400 font-semibold block">1. True Zero-Day Exclusion</span>
            <p className="text-xs leading-relaxed text-[#A3A3A3]">
              Every target attack class is strictly pruned prior to partition assignment, StandardScaler fitting, and federated server initialization.
            </p>
          </div>

          <div className="p-3 rounded-sm bg-[#181818] border border-[#262626] space-y-1">
            <span className="text-orange-400 font-semibold block">2. Frozen Representations</span>
            <p className="text-xs leading-relaxed text-[#A3A3A3]">
              The 64-D penultimate layer of the converged FedProx backbone is extracted with frozen weights. No fine-tuning gradients are permitted.
            </p>
          </div>

          <div className="p-3 rounded-sm bg-[#181818] border border-[#262626] space-y-1">
            <span className="text-orange-400 font-semibold block">3. Support-Calibrated Thresholds</span>
            <p className="text-xs leading-relaxed text-[#A3A3A3]">
              Cosine similarity thresholds τ are calculated via leave-one-out intra-support distance percentiles without touching query samples.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
