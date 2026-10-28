import React from 'react';
import { Zap } from 'lucide-react';

export default function FewShotResultCard({ record, isBest = false }) {
  if (!record) {
    return (
      <div className="p-4 rounded-sm bg-[#141414] border border-[#262626] text-center font-sans text-[#737373] text-xs">
        Select target attack, support size, and method to inspect few-shot metrics.
      </div>
    );
  }

  const {
    unseen_attack,
    method,
    support_size,
    threshold,
    accuracy,
    precision,
    recall,
    f1,
    fpr,
    specificity,
    tp,
    tn,
    fp,
    fn
  } = record;

  const f1Pct = (f1 * 100).toFixed(2);
  const recPct = (recall * 100).toFixed(2);
  const accPct = (accuracy * 100).toFixed(2);
  const precPct = (precision * 100).toFixed(2);
  const fprPct = (fpr * 100).toFixed(2);
  const specPct = (specificity * 100).toFixed(2);

  const totalPos = tp + fn;
  const totalNeg = tn + fp;
  const totalQueries = totalPos + totalNeg;

  return (
    <div
      className={`p-4 sm:p-5 rounded-sm border transition-all duration-200 relative overflow-hidden ${
        isBest
          ? 'bg-[#141414] border-orange-500/50'
          : 'bg-[#141414] border-[#262626] hover:border-[#383838]'
      }`}
    >
      {/* Best Config Indicator */}
      {isBest && (
        <div className="absolute top-3.5 right-3.5 flex items-center space-x-1 px-2 py-0.5 rounded-sm bg-orange-950/40 border border-orange-700/50 text-orange-400 text-[11px] font-sans font-medium">
          <Zap className="w-3 h-3 text-orange-400" />
          <span>Optimal Configuration</span>
        </div>
      )}

      {/* Header Info */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1.5 mb-3.5">
        <div>
          <span className="text-xs font-sans text-orange-400 font-medium block">
            Zero-Day Open-Set Evaluation
          </span>
          <div className="flex items-center space-x-2 mt-0.5">
            <h3 className="text-base sm:text-lg font-sans font-bold text-[#EDEDED]">
              {unseen_attack}
            </h3>
            <span className="px-2 py-0.5 rounded-sm bg-[#1E1E1E] text-orange-400 font-mono text-xs border border-[#2B2B2B] font-semibold">
              {method}
            </span>
            <span className="px-2 py-0.5 rounded-sm bg-[#181818] text-[#D4D4D4] font-mono text-xs border border-[#262626] font-semibold">
              k = {support_size} shots
            </span>
          </div>
        </div>

        <div className="text-left sm:text-right text-xs text-[#737373] font-sans">
          <div>Calibrated Decision Threshold:</div>
          <div className="font-mono text-orange-400 font-semibold text-xs">τ = {Number(threshold).toFixed(4)}</div>
        </div>
      </div>

      {/* Primary Highlight Metrics Grid */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-2 mb-3">
        {/* F1 */}
        <div className="p-2.5 rounded-sm bg-[#181818] border border-[#262626]">
          <span className="text-[11px] font-sans text-[#737373] block">
            F1 Score
          </span>
          <div className="text-lg sm:text-xl font-mono font-bold text-orange-400 mt-0.5">
            {f1Pct}%
          </div>
          <span className="text-[10px] font-sans text-[#737373]">Harmonic mean</span>
        </div>

        {/* Recall */}
        <div className="p-2.5 rounded-sm bg-[#181818] border border-[#262626]">
          <span className="text-[11px] font-sans text-[#737373] block">
            Recall (TPR)
          </span>
          <div className="text-lg sm:text-xl font-mono font-bold text-emerald-400 mt-0.5">
            {recPct}%
          </div>
          <span className="text-[10px] font-sans text-[#737373]">Detection rate</span>
        </div>

        {/* FPR */}
        <div className="p-2.5 rounded-sm bg-[#181818] border border-[#262626]">
          <span className="text-[11px] font-sans text-[#737373] block">
            False Positive Rate
          </span>
          <div className="text-lg sm:text-xl font-mono font-bold text-[#EDEDED] mt-0.5">
            {fprPct}%
          </div>
          <span className="text-[10px] font-sans text-[#737373]">1 - Specificity</span>
        </div>

        {/* Accuracy */}
        <div className="p-2.5 rounded-sm bg-[#181818] border border-[#262626]">
          <span className="text-[11px] font-sans text-[#737373] block">
            Accuracy
          </span>
          <div className="text-lg sm:text-xl font-mono font-bold text-[#EDEDED] mt-0.5">
            {accPct}%
          </div>
          <span className="text-[10px] font-sans text-[#737373]">Total accuracy</span>
        </div>

        {/* Precision */}
        <div className="p-2.5 rounded-sm bg-[#181818] border border-[#262626]">
          <span className="text-[11px] font-sans text-[#737373] block">
            Precision
          </span>
          <div className="text-lg sm:text-xl font-mono font-bold text-[#EDEDED] mt-0.5">
            {precPct}%
          </div>
          <span className="text-[10px] font-sans text-[#737373]">Positive predictive</span>
        </div>

        {/* Specificity */}
        <div className="p-2.5 rounded-sm bg-[#181818] border border-[#262626]">
          <span className="text-[11px] font-sans text-[#737373] block">
            Specificity
          </span>
          <div className="text-lg sm:text-xl font-mono font-bold text-[#EDEDED] mt-0.5">
            {specPct}%
          </div>
          <span className="text-[10px] font-sans text-[#737373]">True negative rate</span>
        </div>
      </div>

      {/* Confusion Matrix */}
      <div className="p-3 rounded-sm bg-[#181818] border border-[#262626]">
        <span className="text-xs font-sans font-semibold text-[#EDEDED] block mb-2">
          Open-Set Binary Confusion Matrix ({Number(totalQueries).toLocaleString()} Held-Out Test Queries)
        </span>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs">
          <div className="p-2 rounded-sm bg-[#141414] border border-[#262626]">
            <span className="text-[#737373] text-[11px] font-sans block">True Positives (TP)</span>
            <span className="text-base font-mono font-bold text-emerald-400">{Number(tp).toLocaleString()}</span>
            <span className="text-[10px] text-[#737373] font-sans block">/ {Number(totalPos).toLocaleString()} target queries</span>
          </div>

          <div className="p-2 rounded-sm bg-[#141414] border border-[#262626]">
            <span className="text-[#737373] text-[11px] font-sans block">True Negatives (TN)</span>
            <span className="text-base font-mono font-bold text-[#EDEDED]">{Number(tn).toLocaleString()}</span>
            <span className="text-[10px] text-[#737373] font-sans block">/ {Number(totalNeg).toLocaleString()} negative queries</span>
          </div>

          <div className="p-2 rounded-sm bg-[#141414] border border-[#262626]">
            <span className="text-[#737373] text-[11px] font-sans block">False Positives (FP)</span>
            <span className="text-base font-mono font-bold text-[#A3A3A3]">{Number(fp).toLocaleString()}</span>
            <span className="text-[10px] text-[#737373] font-sans block">Known traffic misclassified</span>
          </div>

          <div className="p-2 rounded-sm bg-[#141414] border border-[#262626]">
            <span className="text-[#737373] text-[11px] font-sans block">False Negatives (FN)</span>
            <span className="text-base font-mono font-bold text-red-400">{Number(fn).toLocaleString()}</span>
            <span className="text-[10px] text-[#737373] font-sans block">Zero-day missed attacks</span>
          </div>
        </div>
      </div>
    </div>
  );
}
