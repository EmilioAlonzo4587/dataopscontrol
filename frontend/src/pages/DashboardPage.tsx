import { useQuery } from '@tanstack/react-query'
import { getDashboardOverview, getAvailabilityByDb, getTopSlowQueries, getAlertSummary, getSlaReport } from '../services/api'
import { Activity, Database, AlertTriangle, CheckCircle, Clock, TrendingUp, Zap } from 'lucide-react'
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, PieChart, Pie, Cell } from 'recharts'

const COLORS = { Healthy: '#10b981', Warning: '#f59e0b', Critical: '#ef4444' }

function KpiCard({ label, value, sub, color = 'cyan', icon: Icon }: any) {
  const colorMap: any = {
    cyan:  'bg-cyan-500/10 text-cyan-400',
    green:   'bg-emerald-500/10 text-emerald-400',
    yellow:  'bg-amber-500/10 text-amber-400',
    red:     'bg-red-500/10 text-red-400',
  }
  return (
    <div className="card flex items-center gap-4">
      <div className={`p-3 rounded-xl ${colorMap[color]}`}>
        <Icon size={22} />
      </div>
      <div>
        <p className="text-xs text-slate-400">{label}</p>
        <p className="text-2xl font-bold text-white">{value}</p>
        {sub && <p className="text-xs text-slate-500 mt-0.5">{sub}</p>}
      </div>
    </div>
  )
}

export default function DashboardPage() {
  const { data: overview } = useQuery({ queryKey: ['overview'], queryFn: () => getDashboardOverview().then(r => r.data), refetchInterval: 10000, refetchOnMount: 'always' })
  const { data: availability } = useQuery({ queryKey: ['availability'], queryFn: () => getAvailabilityByDb().then(r => r.data), refetchInterval: 10000, refetchOnMount: 'always' })
  const { data: slowQueries } = useQuery({ queryKey: ['slowQueries'], queryFn: () => getTopSlowQueries(5).then(r => r.data), refetchInterval: 15000, refetchOnMount: 'always' })
  const { data: sla } = useQuery({ queryKey: ['sla'], queryFn: () => getSlaReport().then(r => r.data), refetchInterval: 15000, refetchOnMount: 'always' })

  const healthPie = overview
    ? Object.entries(overview.health_distribution || {}).map(([name, value]) => ({ name, value }))
    : []

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-white">Dashboard BI</h1>
        <p className="text-slate-400 text-sm">Real-time operational overview — Module 8</p>
      </div>

      {/* KPI Row */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <KpiCard icon={Database}       label="Total Connections"   value={overview?.total_connections ?? '—'} color="cyan" />
        <KpiCard icon={Activity}       label="Availability (24h)"  value={`${overview?.availability_24h_pct ?? 0}%`} sub="Target: 99.9%" color="green" />
        <KpiCard icon={AlertTriangle}  label="Critical Alerts Open" value={overview?.critical_alerts_open ?? 0} color="red" />
        <KpiCard icon={CheckCircle}    label="Backup SLA"           value={`${overview?.backup_sla_pct ?? 0}%`} color={overview?.backup_sla_pct >= 90 ? 'green' : 'yellow'} />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Health distribution pie */}
        <div className="card">
          <h2 className="text-sm font-semibold text-slate-300 mb-4">Health Distribution</h2>
          <ResponsiveContainer width="100%" height={200}>
            <PieChart>
              <Pie data={healthPie} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={70} label={({ name, value }) => `${name}: ${value}`}>
                {healthPie.map((entry: any) => (
                  <Cell key={entry.name} fill={COLORS[entry.name as keyof typeof COLORS] || '#06b6d4'} />
                ))}
              </Pie>
              <Tooltip />
            </PieChart>
          </ResponsiveContainer>
        </div>

        {/* Availability by DB */}
        <div className="card col-span-2">
          <h2 className="text-sm font-semibold text-slate-300 mb-4">Availability by Database</h2>
          <ResponsiveContainer width="100%" height={200}>
            <BarChart data={availability || []}>
              <XAxis dataKey="nombre" tick={{ fontSize: 11, fill: '#94a3b8' }} />
              <YAxis domain={[0, 100]} tick={{ fontSize: 11, fill: '#94a3b8' }} />
              <Tooltip contentStyle={{ background: '#18181b', border: 'none', borderRadius: 8 }} />
              <Bar dataKey="availability_pct" fill="#06b6d4" radius={[4, 4, 0, 0]} name="Availability %" />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Top Slow Queries */}
        <div className="card">
          <h2 className="text-sm font-semibold text-slate-300 mb-3 flex items-center gap-2">
            <Clock size={14} /> Top Slow Queries
          </h2>
          <div className="space-y-2">
            {(slowQueries || []).slice(0, 5).map((q: any, i: number) => (
              <div key={q.id} className="flex items-center gap-3 text-xs">
                <span className="text-slate-500 w-4">{i + 1}</span>
                <div className="flex-1 truncate">
                  <p className="text-slate-300 truncate">{q.query_text.slice(0, 60)}…</p>
                  {q.optimized_query && (
                    <p className="text-emerald-400 text-[10px] truncate flex items-center gap-1">
                      <Zap size={9} className="shrink-0" />{q.optimized_query}
                    </p>
                  )}
                </div>
                <span className={`font-mono font-bold ${q.duration_ms > 2000 ? 'text-red-400' : q.duration_ms > 500 ? 'text-amber-400' : 'text-emerald-400'}`}>
                  {q.duration_ms.toFixed(0)}ms
                </span>
              </div>
            ))}
            {(!slowQueries || slowQueries.length === 0) && (
              <p className="text-slate-500 text-xs">No slow queries yet. Run the seed demo in the Queries module.</p>
            )}
          </div>
        </div>

        {/* SLA & Replication */}
        <div className="card space-y-4">
          <h2 className="text-sm font-semibold text-slate-300 flex items-center gap-2">
            <TrendingUp size={14} /> SLA & Replication Summary
          </h2>
          <div className="grid grid-cols-2 gap-3 text-xs">
            <div className="bg-slate-700/50 rounded-lg p-3">
              <p className="text-slate-400">RPO Target</p>
              <p className="text-xl font-bold text-white">{sla?.rpo_target_minutes ?? 15} min</p>
            </div>
            <div className="bg-slate-700/50 rounded-lg p-3">
              <p className="text-slate-400">RTO Target</p>
              <p className="text-xl font-bold text-white">{sla?.rto_target_minutes ?? 45} min</p>
            </div>
            <div className="bg-slate-700/50 rounded-lg p-3">
              <p className="text-slate-400">Avg Backup Duration</p>
              <p className="text-xl font-bold text-white">{sla?.avg_duration_secs?.toFixed(1) ?? 0}s</p>
            </div>
            <div className="bg-slate-700/50 rounded-lg p-3">
              <p className="text-slate-400">Replication Lag</p>
              <p className={`text-xl font-bold ${(overview?.avg_replication_lag_sec ?? 0) > 10 ? 'text-red-400' : 'text-emerald-400'}`}>
                {overview?.avg_replication_lag_sec?.toFixed(1) ?? 0}s
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
