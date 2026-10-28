import React from 'react';

export default function StatusBadge({ status, label, size = 'sm' }) {
  const raw = (status || '').trim();
  const normStatus = raw
    .toUpperCase()
    .replace(/[·•\s-]+/g, '_')
    .replace(/[^A-Z0-9_]/g, '');

  const configs = {
    ACTION_REQUIRED: {
      bg: 'bg-red-950/40',
      border: 'border-red-700/60',
      text: 'text-red-200',
      dot: 'bg-red-500 animate-live-pulse',
      defaultLabel: 'Action Required'
    },
    UNDER_ATTACK: {
      bg: 'bg-red-950/40',
      border: 'border-red-700/60',
      text: 'text-red-200',
      dot: 'bg-red-500 animate-live-pulse',
      defaultLabel: 'Under Attack'
    },
    ATTACK_DETECTED: {
      bg: 'bg-red-950/40',
      border: 'border-red-700/60',
      text: 'text-red-200',
      dot: 'bg-red-500 animate-live-pulse',
      defaultLabel: 'Attack Detected'
    },
    ALERT: {
      bg: 'bg-red-950/40',
      border: 'border-red-700/60',
      text: 'text-red-200',
      dot: 'bg-red-500',
      defaultLabel: 'Alert'
    },
    HIGH_ALERT: {
      bg: 'bg-red-950/50',
      border: 'border-red-600/70',
      text: 'text-red-200',
      dot: 'bg-red-500 animate-live-pulse',
      defaultLabel: 'High Alert'
    },
    CRITICAL: {
      bg: 'bg-red-950/60',
      border: 'border-red-600/80',
      text: 'text-red-200',
      dot: 'bg-red-400 animate-live-pulse',
      defaultLabel: 'Critical'
    },
    MITIGATED_SIMULATION: {
      bg: 'bg-orange-950/40',
      border: 'border-orange-700/60',
      text: 'text-orange-300',
      dot: 'bg-orange-400',
      defaultLabel: 'Mitigated · Sim'
    },
    MITIGATED: {
      bg: 'bg-orange-950/40',
      border: 'border-orange-700/60',
      text: 'text-orange-300',
      dot: 'bg-orange-400',
      defaultLabel: 'Mitigated · Sim'
    },
    RESOLVED: {
      bg: 'bg-emerald-950/30',
      border: 'border-emerald-700/50',
      text: 'text-emerald-300',
      dot: 'bg-emerald-400',
      defaultLabel: 'Resolved'
    },
    HEALTHY: {
      bg: 'bg-emerald-950/30',
      border: 'border-emerald-700/50',
      text: 'text-emerald-300',
      dot: 'bg-emerald-400',
      defaultLabel: 'Healthy'
    },
    ONLINE: {
      bg: 'bg-emerald-950/30',
      border: 'border-emerald-700/50',
      text: 'text-emerald-300',
      dot: 'bg-emerald-400',
      defaultLabel: 'Online'
    },
    OFFLINE: {
      bg: 'bg-[#141414]',
      border: 'border-[#262626]',
      text: 'text-[#737373]',
      dot: 'bg-[#525252]',
      defaultLabel: 'Offline'
    },
    INVESTIGATING: {
      bg: 'bg-amber-950/30',
      border: 'border-amber-700/50',
      text: 'text-amber-300',
      dot: 'bg-amber-400',
      defaultLabel: 'Investigating'
    },
    MONITORING: {
      bg: 'bg-amber-950/30',
      border: 'border-amber-700/50',
      text: 'text-amber-300',
      dot: 'bg-amber-400',
      defaultLabel: 'Monitoring'
    },
    ELEVATED: {
      bg: 'bg-amber-950/30',
      border: 'border-amber-700/50',
      text: 'text-amber-300',
      dot: 'bg-amber-400',
      defaultLabel: 'Elevated'
    },
    ELEVATED_TRAFFIC: {
      bg: 'bg-amber-950/30',
      border: 'border-amber-700/50',
      text: 'text-amber-300',
      dot: 'bg-amber-400',
      defaultLabel: 'Elevated'
    },
    SIMULATED: {
      bg: 'bg-[#181818]',
      border: 'border-[#2B2B2B]',
      text: 'text-[#A3A3A3]',
      dot: 'bg-[#737373]',
      defaultLabel: 'Simulated'
    }
  };

  const current = configs[normStatus] || configs.SIMULATED;
  const displayLabel = label || (raw.includes('·') ? raw : current.defaultLabel);

  const sizeClasses = {
    xs: 'text-[9px] px-1.5 py-0.5 space-x-1',
    sm: 'text-[11px] px-2 py-0.5 space-x-1.5',
    md: 'text-xs px-2.5 py-1 space-x-2'
  };

  return (
    <span
      className={`inline-flex items-center rounded-sm border font-mono font-medium ${
        current.bg
      } ${current.border} ${current.text} ${sizeClasses[size] || sizeClasses.sm}`}
    >
      <span className={`w-1.5 h-1.5 rounded-full ${current.dot}`} />
      <span className="truncate">{displayLabel}</span>
    </span>
  );
}
