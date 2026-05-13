import { useState } from 'react'
import { useQuery, useMutation } from '@tanstack/react-query'
import { simulateConcurrency, getTxStats, getRecentDeadlocks } from '../services/api'
import { GitMerge, Play, AlertTriangle } from 'lucide-react'
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell } from 'recharts'

const LOCK_COLORS: any = { SHARED: '#6366f1', EXCLUSIVE: '#f59e0b', DEADLOCK: '#ef4444', TIMEOUT: '#f97316' }

export default function ConcurrencyPage() {
  const [users, setUsers] = useState(100)
  const [result, setResult] = useState<any>(null)
  const { data: stats = [] } = useQuery({ queryKey: ['tx-stats'], queryFn: () => getTxStats().then(r => r.data) })
  const { data: deadlocks = [] } = useQuery({ queryKey: ['deadlocks'], queryFn: () => getRecentDeadlocks().then(r => r.data) })

  const simMut = useMutation({
    mutationFn: () => simulateConcurrency(1, users),
    onSuccess: (res) => setResult(res.data),
  })

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-white">Concurrency Simulator</h1>
        <p className="text-slate-400 text-sm">Module 4 — Simulate concurrent users, detect deadlocks, analyze lock contention</p>
      </div>

      <div className="card">
        <h2 className="text-sm font-semibold text-slate-300 mb-4">Simulate Concurrent Load</h2>
        <div className="flex items-center gap-4">
          <div>
            <label className="text-xs text-slate-400 block mb-1">Concurrent Users (min: 100)</label>
            <input
              type="number"
              min={100}
              value={users}
              onChange={e => setUsers(Math.max(100, +e.target.value))}
              className="bg-slate-700 border border-slate-600 text-slate-200 text-sm rounded-lg px-3 py-2 w-32"
            />
          </div>
          <button
            onClick={() => simMut.mutate()}
            disabled={simMut.isPending}
            className="flex items-center gap-2 bg-indigo-600 hover:bg-indigo-700 text-white text-sm px-4 py-2 rounded-lg mt-4"
          >
            <Play size={14} /> {simMut.isPending ? 'Simulating…' : 'Run Simulation'}
          </button>
        </div>

        {result && (
          <div className="mt-4 grid grid-cols-2 md:grid-cols-4 gap-3">
            {[
              { label: 'Sessions',  value: result.sessions_simulated,  color: 'text-indigo-400' },
              { label: 'Deadlocks Detected', value: result.deadlocks_detected, color: 'text-red-400' },
              { label: 'Deadlocks Resolved', value: result.deadlocks_resolved, color: 'text-emerald-400' },
              { label: 'Avg Wait', value: `${result.avg_wait_ms.toFixed(1)}ms`, color: 'text-amber-400' },
            ].map(({ label, value, color }) => (
              <div key={label} className="bg-slate-700/50 rounded-lg p-3 text-center">
                <p className="text-xs text-slate-400">{label}</p>
                <p className={`text-xl font-bold ${color}`}>{value}</p>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="card">
          <h2 className="text-sm font-semibold text-slate-300 mb-4">Lock Type Distribution</h2>
          <ResponsiveContainer width="100%" height={200}>
            <BarChart data={stats}>
              <XAxis dataKey="lock_type" tick={{ fontSize: 11, fill: '#94a3b8' }} />
              <YAxis tick={{ fontSize: 11, fill: '#94a3b8' }} />
              <Tooltip contentStyle={{ background: '#1e293b', border: 'none', borderRadius: 8 }} />
              <Bar dataKey="count" radius={[4, 4, 0, 0]}>
                {stats.map((s: any) => <Cell key={s.lock_type} fill={LOCK_COLORS[s.lock_type] || '#6366f1'} />)}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>

        <div className="card">
          <h2 className="text-sm font-semibold text-slate-300 mb-3 flex items-center gap-2">
            <AlertTriangle size={14} className="text-red-400" /> Recent Deadlocks
          </h2>
          <div className="space-y-2 max-h-48 overflow-y-auto">
            {deadlocks.slice(0, 10).map((d: any) => (
              <div key={d.id} className="bg-red-500/5 border border-red-500/20 rounded-lg p-2 text-xs">
                <p className="text-slate-300">Session: <span className="font-mono text-red-400">{d.session}</span></p>
                <p className="text-slate-400">{d.operacion} · Wait: {d.wait_time?.toFixed(1)}ms · {d.resolved ? '✅ Resolved' : '⚠️ Pending'}</p>
              </div>
            ))}
            {deadlocks.length === 0 && <p className="text-slate-500 text-xs text-center py-4">No deadlocks recorded yet.</p>}
          </div>
        </div>
      </div>
    </div>
  )
}
