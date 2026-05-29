import { useState, useEffect } from 'react'
import { useQuery, useMutation } from '@tanstack/react-query'
import { getConnections, simulateConcurrency, getTxStats, getRecentDeadlocks } from '../services/api'
import { GitMerge, Play, AlertTriangle, Database, CheckCircle } from 'lucide-react'
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell } from 'recharts'

const LOCK_COLORS: any = { SHARED: '#6366f1', EXCLUSIVE: '#f59e0b', DEADLOCK: '#ef4444', TIMEOUT: '#f97316' }
const ENGINE_BADGE: any = {
  PostgreSQL:    'bg-blue-500/10 text-blue-400 border-blue-500/20',
  'SQL Server':  'bg-red-500/10 text-red-400 border-red-500/20',
  Oracle:        'bg-orange-500/10 text-orange-400 border-orange-500/20',
}

export default function ConcurrencyPage() {
  const [users, setUsers] = useState(100)
  const [selectedDbId, setSelectedDbId] = useState<number | null>(null)
  const [result, setResult] = useState<any>(null)

  const { data: connections = [] } = useQuery({
    queryKey: ['connections'],
    queryFn: () => getConnections().then(r => r.data),
  })

  // Auto-select first connection on load
  useEffect(() => {
    if (connections.length > 0 && selectedDbId === null) {
      setSelectedDbId(connections[0].id)
    }
  }, [connections, selectedDbId])

  const selectedConn = connections.find((c: any) => c.id === selectedDbId)

  const { data: stats = [] } = useQuery({
    queryKey: ['tx-stats'],
    queryFn: () => getTxStats().then(r => r.data),
  })
  const { data: deadlocks = [] } = useQuery({
    queryKey: ['deadlocks'],
    queryFn: () => getRecentDeadlocks().then(r => r.data),
  })

  const simMut = useMutation({
    mutationFn: () => simulateConcurrency(selectedDbId!, users),
    onSuccess: (res) => setResult(res.data),
  })

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-white">Concurrency Simulator</h1>
        <p className="text-slate-400 text-sm">
          Module 4 — Transacciones reales con PostgreSQL · Detección genuina de deadlocks · TX_LOG
        </p>
      </div>

      {/* DB Selector */}
      <div className="card">
        <div className="flex items-center gap-3 mb-2">
          <Database size={16} className="text-indigo-400" />
          <h2 className="text-sm font-semibold text-slate-300">Base de datos objetivo</h2>
        </div>
        <p className="text-xs text-slate-500 mb-3">
          PostgreSQL ejecuta transacciones reales con <code className="text-indigo-300">SELECT...FOR UPDATE</code> y detecta deadlocks genuinos.
          SQL Server y Oracle usan el servicio de métricas real pero la simulación de concurrencia corre en el primario PostgreSQL.
        </p>
        <div className="flex flex-wrap gap-2">
          {connections.map((c: any) => (
            <button
              key={c.id}
              onClick={() => setSelectedDbId(c.id)}
              className={`flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-medium border transition-all
                ${selectedDbId === c.id
                  ? 'bg-indigo-600/20 border-indigo-500/50 text-indigo-300 ring-1 ring-indigo-500/40'
                  : 'bg-slate-700/40 border-slate-600/40 text-slate-400 hover:border-slate-500'}`}
            >
              <span className={`px-1.5 py-0.5 rounded text-[10px] border ${ENGINE_BADGE[c.motor] || 'bg-slate-500/10 text-slate-400 border-slate-500/20'}`}>
                {c.motor}
              </span>
              {c.nombre}
              {selectedDbId === c.id && <CheckCircle size={11} />}
            </button>
          ))}
        </div>
      </div>

      {/* Simulation panel */}
      <div className="card">
        <h2 className="text-sm font-semibold text-slate-300 mb-4">Simulate Concurrent Load</h2>
        <div className="flex items-end gap-4 flex-wrap">
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
          {selectedConn && (
            <div>
              <label className="text-xs text-slate-400 block mb-1">Motor seleccionado</label>
              <span className={`inline-flex items-center px-3 py-2 rounded-lg text-xs border ${ENGINE_BADGE[selectedConn.motor] || ''}`}>
                {selectedConn.motor} — {selectedConn.nombre}
              </span>
            </div>
          )}
          <button
            onClick={() => simMut.mutate()}
            disabled={simMut.isPending || selectedDbId === null}
            className="flex items-center gap-2 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white text-sm px-4 py-2 rounded-lg"
          >
            <Play size={14} /> {simMut.isPending ? 'Simulando…' : 'Run Simulation'}
          </button>
        </div>

        {simMut.isPending && (
          <div className="mt-3 text-xs text-indigo-400 animate-pulse">
            Ejecutando {users} transacciones reales con bloqueos de filas (FOR UPDATE)…
          </div>
        )}

        {result && (
          <div className="mt-4 space-y-3">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              {[
                { label: 'Sessions',           value: result.sessions_simulated,               color: 'text-indigo-400' },
                { label: 'Deadlocks Detected', value: result.deadlocks_detected,               color: 'text-red-400' },
                { label: 'Deadlocks Resolved', value: result.deadlocks_resolved,               color: 'text-emerald-400' },
                { label: 'Avg Wait',           value: `${result.avg_wait_ms?.toFixed(1)}ms`,   color: 'text-amber-400' },
              ].map(({ label, value, color }) => (
                <div key={label} className="bg-slate-700/50 rounded-lg p-3 text-center">
                  <p className="text-xs text-slate-400">{label}</p>
                  <p className={`text-xl font-bold ${color}`}>{value}</p>
                </div>
              ))}
            </div>
            <div className="bg-slate-700/30 rounded-lg p-3 text-xs text-slate-400">
              <span className="font-semibold text-slate-300">Operaciones: </span>
              {Object.entries(result.operations || {}).map(([op, count]: any) => (
                <span key={op} className="mr-3">{op}: <span className="text-slate-200">{count}</span></span>
              ))}
            </div>
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
              <Tooltip contentStyle={{ background: '#1e293b', border: 'none', borderRadius: 8 }}
                formatter={(v: any, n: any) => [v, n]} />
              <Bar dataKey="count" radius={[4, 4, 0, 0]}>
                {stats.map((s: any) => <Cell key={s.lock_type} fill={LOCK_COLORS[s.lock_type] || '#6366f1'} />)}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
          <div className="flex flex-wrap gap-3 mt-2 text-xs justify-center">
            {Object.entries(LOCK_COLORS).map(([type, color]) => (
              <span key={type} style={{ color: color as string }}>● {type}</span>
            ))}
          </div>
        </div>

        <div className="card">
          <h2 className="text-sm font-semibold text-slate-300 mb-3 flex items-center gap-2">
            <AlertTriangle size={14} className="text-red-400" /> Recent Deadlocks
          </h2>
          <div className="space-y-2 max-h-48 overflow-y-auto">
            {deadlocks.slice(0, 10).map((d: any) => (
              <div key={d.id} className="bg-red-500/5 border border-red-500/20 rounded-lg p-2 text-xs">
                <p className="text-slate-300">Session: <span className="font-mono text-red-400">{d.session}</span></p>
                <p className="text-slate-400">
                  {d.operacion} · Wait: {d.wait_time?.toFixed(1)}ms · {d.resolved ? '✅ Resolved' : '⚠️ Pending'}
                </p>
              </div>
            ))}
            {deadlocks.length === 0 && (
              <p className="text-slate-500 text-xs text-center py-4">No deadlocks recorded yet. Run the simulation.</p>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
