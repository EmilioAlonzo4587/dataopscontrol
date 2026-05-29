import { useQuery } from '@tanstack/react-query'
import { getConnections, getLatestMetrics, getMetricHistory } from '../services/api'
import { useState } from 'react'
import { Activity, RefreshCw } from 'lucide-react'
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from 'recharts'

const STATUS_BADGE: any = { Healthy: 'badge-healthy', Warning: 'badge-warning', Critical: 'badge-critical' }
const ENGINE_COLORS: any = {
  PostgreSQL:   'border-blue-500/30 bg-blue-500/5',
  'SQL Server': 'border-red-500/30 bg-red-500/5',
  Oracle:       'border-orange-500/30 bg-orange-500/5',
}
const ENGINE_LABEL: any = {
  PostgreSQL:   'bg-blue-500/10 text-blue-400 border-blue-500/20',
  'SQL Server': 'bg-red-500/10 text-red-400 border-red-500/20',
  Oracle:       'bg-orange-500/10 text-orange-400 border-orange-500/20',
}

export default function MetricsPage() {
  const [historyDbId, setHistoryDbId] = useState<number | null>(null)

  const { data: connections = [] } = useQuery({
    queryKey: ['connections'],
    queryFn: () => getConnections().then(r => r.data),
  })

  const { data: metrics = [], refetch } = useQuery({
    queryKey: ['latest-metrics'],
    queryFn: () => getLatestMetrics().then(r => r.data),
    refetchInterval: 30000,
  })

  const { data: history = [] } = useQuery({
    queryKey: ['metric-history', historyDbId],
    queryFn: () => historyDbId ? getMetricHistory(historyDbId, 30).then(r => r.data) : Promise.resolve([]),
    enabled: historyDbId !== null,
  })

  // Build connection map: db_id → { nombre, motor }
  const connMap: Record<number, { nombre: string; motor: string }> = Object.fromEntries(
    connections.map((c: any) => [c.id, { nombre: c.nombre, motor: c.motor }])
  )

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">Health Check Dashboard</h1>
          <p className="text-slate-400 text-sm">
            Module 2 — Auto health check cada 60s · Umbrales configurables via settings
          </p>
        </div>
        <button onClick={() => refetch()} className="text-slate-400 hover:text-white p-2 rounded-lg hover:bg-slate-700">
          <RefreshCw size={14} />
        </button>
      </div>

      {metrics.length === 0 && (
        <div className="card text-center py-12 text-slate-500">
          <Activity size={32} className="mx-auto mb-3 opacity-30" />
          <p>Esperando primer health check… (corre cada 60s)</p>
          <p className="text-xs mt-1">Registra conexiones en el módulo Connections primero.</p>
        </div>
      )}

      {/* Per-connection metric cards */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {metrics.map((m: any) => {
          const conn = connMap[m.db_id]
          const engineClass = ENGINE_COLORS[conn?.motor] || 'border-slate-600/30 bg-slate-700/10'
          const labelClass  = ENGINE_LABEL[conn?.motor]  || 'bg-slate-500/10 text-slate-400 border-slate-500/20'
          return (
            <div key={m.id} className={`card space-y-3 border ${engineClass}`}>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className={`text-xs px-2 py-0.5 rounded border ${labelClass}`}>
                    {conn?.motor ?? `DB #${m.db_id}`}
                  </span>
                  <h3 className="font-semibold text-white text-sm">
                    {conn?.nombre ?? `Conexión ${m.db_id}`}
                  </h3>
                </div>
                <span className={STATUS_BADGE[m.health_status]}>{m.health_status}</span>
              </div>

              <div className="grid grid-cols-3 gap-2">
                {[
                  { label: 'CPU',         value: m.cpu,         unit: '%', warn: 70, crit: 85 },
                  { label: 'Memory',      value: m.memory,      unit: '%', warn: 70, crit: 85 },
                  { label: 'Disk',        value: m.disk_usage,  unit: '%', warn: 75, crit: 90 },
                  { label: 'Connections', value: m.connections, unit: '',  warn: 80, crit: 100 },
                  { label: 'Locks',       value: m.locks,       unit: '',  warn: 10, crit: 15 },
                  { label: 'Deadlocks',   value: m.deadlocks,   unit: '',  warn: 1,  crit: 3 },
                ].map(({ label, value, unit, warn, crit }) => (
                  <div key={label} className="bg-slate-700/50 rounded-lg p-2 text-center">
                    <p className="text-xs text-slate-400">{label}</p>
                    <p className={`text-lg font-bold ${
                      value >= crit ? 'text-red-400' : value >= warn ? 'text-amber-400' : 'text-emerald-400'
                    }`}>
                      {typeof value === 'number' ? value.toFixed(1) : value}{unit}
                    </p>
                  </div>
                ))}
              </div>

              <div className="flex items-center justify-between">
                <p className="text-xs text-slate-500">
                  Capturado: {new Date(m.capture_time).toLocaleString()}
                </p>
                <button
                  onClick={() => setHistoryDbId(historyDbId === m.db_id ? null : m.db_id)}
                  className="text-xs text-indigo-400 hover:text-indigo-300"
                >
                  {historyDbId === m.db_id ? 'Ocultar historial' : 'Ver historial'}
                </button>
              </div>

              {/* Inline history chart */}
              {historyDbId === m.db_id && history.length > 0 && (
                <div className="border-t border-slate-700 pt-3">
                  <p className="text-xs text-slate-400 mb-2">CPU % — últimas {history.length} capturas</p>
                  <ResponsiveContainer width="100%" height={100}>
                    <LineChart data={history} margin={{ top: 0, right: 5, left: 0, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
                      <XAxis dataKey="capture_time"
                        tickFormatter={v => new Date(v).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                        tick={{ fontSize: 9, fill: '#64748b' }} interval="preserveStartEnd" />
                      <YAxis tick={{ fontSize: 9, fill: '#64748b' }} domain={[0, 100]} width={28} unit="%" />
                      <Tooltip contentStyle={{ background: '#1e293b', border: 'none', borderRadius: 6, fontSize: 11 }}
                        labelFormatter={v => new Date(v).toLocaleTimeString()} />
                      <Line type="monotone" dataKey="cpu" stroke="#6366f1" strokeWidth={1.5} dot={false} name="CPU %" />
                      <Line type="monotone" dataKey="memory" stroke="#10b981" strokeWidth={1.5} dot={false} name="Memory %" />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
