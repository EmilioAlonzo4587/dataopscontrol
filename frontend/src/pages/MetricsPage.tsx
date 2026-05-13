import { useQuery } from '@tanstack/react-query'
import { getLatestMetrics } from '../services/api'
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from 'recharts'
import { Activity } from 'lucide-react'

const STATUS_BADGE: any = { Healthy: 'badge-healthy', Warning: 'badge-warning', Critical: 'badge-critical' }

export default function MetricsPage() {
  const { data: metrics = [] } = useQuery({
    queryKey: ['latest-metrics'],
    queryFn: () => getLatestMetrics().then(r => r.data),
    refetchInterval: 30000,
  })

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-white">Health Check Dashboard</h1>
        <p className="text-slate-400 text-sm">Module 2 — Auto health check every 60 seconds · Thresholds: CPU/Memory warning &gt;70%, critical &gt;85%</p>
      </div>

      {metrics.length === 0 && (
        <div className="card text-center py-12 text-slate-500">
          <Activity size={32} className="mx-auto mb-3 opacity-30" />
          <p>Waiting for first health check… (runs every 60s)</p>
          <p className="text-xs mt-1">Register connections in the Connections module first.</p>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {metrics.map((m: any) => (
          <div key={m.id} className="card space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="font-semibold text-white text-sm">DB ID: {m.db_id}</h3>
              <span className={STATUS_BADGE[m.health_status]}>{m.health_status}</span>
            </div>

            <div className="grid grid-cols-3 gap-2">
              {[
                { label: 'CPU', value: m.cpu, unit: '%', warn: 70, crit: 85 },
                { label: 'Memory', value: m.memory, unit: '%', warn: 70, crit: 85 },
                { label: 'Disk', value: m.disk_usage, unit: '%', warn: 75, crit: 90 },
                { label: 'Connections', value: m.connections, unit: '', warn: 80, crit: 100 },
                { label: 'Locks', value: m.locks, unit: '', warn: 10, crit: 15 },
                { label: 'Deadlocks', value: m.deadlocks, unit: '', warn: 1, crit: 3 },
              ].map(({ label, value, unit, warn, crit }) => (
                <div key={label} className="bg-slate-700/50 rounded-lg p-2 text-center">
                  <p className="text-xs text-slate-400">{label}</p>
                  <p className={`text-lg font-bold ${value >= crit ? 'text-red-400' : value >= warn ? 'text-amber-400' : 'text-emerald-400'}`}>
                    {typeof value === 'number' ? value.toFixed(1) : value}{unit}
                  </p>
                </div>
              ))}
            </div>

            <p className="text-xs text-slate-500">
              Captured: {new Date(m.capture_time).toLocaleString()}
            </p>
          </div>
        ))}
      </div>
    </div>
  )
}
