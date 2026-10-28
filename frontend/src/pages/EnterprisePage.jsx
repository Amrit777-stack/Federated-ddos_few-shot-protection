import React, { useState, useEffect } from 'react';
import { Network, Server, RotateCw, ShieldCheck, BarChart2, Info, Power } from 'lucide-react';
import EnterpriseCard from '../components/EnterpriseCard';
import { fetchEnterprises, toggleEnterpriseStatus } from '../services/api';
import { 
  BarChart, 
  Bar, 
  XAxis, 
  YAxis, 
  Tooltip, 
  ResponsiveContainer, 
  CartesianGrid, 
  Legend 
} from 'recharts';

export default function EnterprisePage() {
  const [enterprises, setEnterprises] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      try {
        setLoading(true);
        const res = await fetchEnterprises();
        setEnterprises(res.enterprises || []);
      } catch (err) {
        console.error('Failed to load enterprises:', err);
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []);

  const handleToggleStatus = async (enterpriseId) => {
    try {
      const res = await toggleEnterpriseStatus(enterpriseId);
      setEnterprises(prev => prev.map(e => {
        const norm = e.id.replace(/\D/g, '');
        const targetNorm = enterpriseId.replace(/\D/g, '');
        if (norm === targetNorm) {
          const isOff = res.isOffline;
          return {
            ...e,
            status: isOff ? 'OFFLINE' : 'ONLINE',
            isOffline: isOff
          };
        }
        return e;
      }));
    } catch (err) {
      console.error('Failed to toggle enterprise status:', err);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[350px] font-sans text-[#737373] text-xs">
        <RotateCw className="w-4 h-4 animate-spin mr-2 text-orange-400" />
        <span>Loading enterprise topology...</span>
      </div>
    );
  }

  const onlineCount = enterprises.filter(e => !e.isOffline && e.status !== 'OFFLINE').length;
  const offlineCount = enterprises.length - onlineCount;

  // Prepare chart data for client sizes
  const chartData = enterprises.map(e => ({
    name: e.id.replace('enterprise_', 'E'),
    fullName: e.name,
    samples: e.clientSize,
    heldoutSamples: e.totalSamplesHeldout,
    anomalyScore: e.isOffline ? 0 : +(e.anomalyScore * 100).toFixed(1),
    status: e.isOffline ? 'OFFLINE' : e.status
  }));

  return (
    <div className="space-y-4 sm:space-y-5">
      {/* Header Banner */}
      <div className="p-4 sm:p-5 rounded-sm bg-[#141414] border border-[#262626] flex flex-col md:flex-row items-start md:items-center justify-between gap-3">
        <div>
          <div className="flex items-center space-x-2">
            <Network className="w-4 h-4 text-orange-400" />
            <h2 className="text-base sm:text-lg font-semibold text-[#EDEDED] font-sans tracking-tight">
              Federated Enterprise Client Partitions
            </h2>
          </div>
          <p className="text-xs text-[#737373] font-sans mt-0.5">
            Heterogeneous Non-IID network nodes participating in FedProx gradient aggregation. Use toggles to switch partition ingress on/off.
          </p>
        </div>

        <div className="flex items-center space-x-2">
          <span className="px-2.5 py-1 rounded-sm bg-[#181818] border border-[#262626] text-[#EDEDED] font-sans text-xs font-medium">
            {onlineCount}/5 Clients Online
          </span>
          {offlineCount > 0 ? (
            <span className="px-2.5 py-1 rounded-sm bg-[#161616] border border-[#262626] text-[#737373] font-sans text-xs font-medium flex items-center space-x-1">
              <Power className="w-3 h-3 text-[#525252]" />
              <span>{offlineCount} Offline (Attacks Dropped)</span>
            </span>
          ) : (
            <span className="px-2.5 py-1 rounded-sm bg-emerald-950/40 border border-emerald-700/40 text-emerald-300 font-sans text-xs font-medium">
              100% Ingress Active
            </span>
          )}
        </div>
      </div>

      {/* Client Size & Non-IID Distribution Overview Bar Chart */}
      <div className="p-4 sm:p-5 rounded-sm bg-[#141414] border border-[#262626]">
        <div className="flex items-center justify-between mb-3">
          <div>
            <h3 className="text-sm font-semibold text-[#EDEDED] font-sans tracking-tight">
              Client Dataset Volumes & Anomaly Scores
            </h3>
            <p className="text-xs text-[#737373] font-sans">
              Training partition breakdown across 5 enterprise boundaries (72,351 total master training rows)
            </p>
          </div>
          <span className="text-xs font-mono text-orange-400 font-bold">Round 20 Aggregated</span>
        </div>

        <div className="h-[210px] w-full">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={chartData} margin={{ top: 5, right: 15, left: -10, bottom: 0 }}>
              <CartesianGrid strokeDasharray="2 2" stroke="#222222" />
              <XAxis dataKey="name" stroke="#404040" tick={{ fill: '#737373', fontSize: 11, fontFamily: 'Inter, sans-serif' }} />
              <YAxis stroke="#404040" tick={{ fill: '#737373', fontSize: 11, fontFamily: 'JetBrains Mono, monospace' }} />
              <Tooltip
                contentStyle={{
                  backgroundColor: '#181818',
                  borderColor: '#2E2E2E',
                  borderRadius: '3px',
                  fontFamily: 'JetBrains Mono, monospace',
                  fontSize: '11px',
                  color: '#EDEDED'
                }}
              />
              <Legend wrapperStyle={{ fontSize: '11px', fontFamily: 'Inter, sans-serif' }} />
              <Bar dataKey="samples" name="All-13 Class Size" fill="#EA580C" radius={[2, 2, 0, 0]} />
              <Bar dataKey="heldoutSamples" name="Held-Out Size" fill="#525252" radius={[2, 2, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* 5 Enterprise Cards Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-5">
        {enterprises.map((e) => (
          <EnterpriseCard 
            key={e.id} 
            enterprise={e} 
            onToggleStatus={handleToggleStatus} 
          />
        ))}
      </div>

      {/* Non-IID Partitioning Academic Protocol Note */}
      <div className="p-4 rounded-sm bg-[#141414] border border-[#262626] flex items-start space-x-3 text-xs text-[#A3A3A3] font-sans">
        <Info className="w-4 h-4 text-orange-400 flex-shrink-0 mt-0.5" />
        <div className="space-y-1">
          <strong className="text-[#EDEDED] font-semibold block">Non-IID Heterogeneity Formulation & Operational State</strong>
          <p className="leading-relaxed text-[#A3A3A3]">
            Traffic across the 5 enterprises is generated via Dirichlet distribution sampling with localized attack class dominance (e.g. Enterprise 1 specializes in DNS/LDAP reflection; Enterprise 3 handles high-volume SYN flooding and database traffic). When any enterprise partition is toggled <strong className="text-white">OFFLINE</strong>, the live detection pipeline and simulator suppress all attack flows targeting that partition, halting alerts and pausing gradient synchronization.
          </p>
        </div>
      </div>
    </div>
  );
}
