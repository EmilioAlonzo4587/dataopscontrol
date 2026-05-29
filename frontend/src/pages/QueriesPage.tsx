import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { getTopSlowQueries, getQueryStats, seedDemoQueries, getOptimizerScenarios, runOptimizerScenario } from '../services/api'
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell, LabelList } from 'recharts'
import { Search, Zap, Play, ChevronDown, ChevronUp, TrendingDown, RefreshCw } from 'lucide-react'

const CAT_COLORS: any = { Fast: '#10b981', Medium: '#f59e0b', Slow: '#f97316', Critical: '#ef4444' }
const CAT_BADGE: any  = { Fast: 'badge-healthy', Medium: 'badge-warning', Slow: 'text-orange-400', Critical: 'badge-critical' }

function ScanBadge({ type }: { type: string }) {
  const isSeq = type.includes('Sequential')
  return (
    <span className={`text-xs px-2 py-0.5 rounded font-mono ${isSeq ? 'bg-red-500/20 text-red-400' : 'bg-emerald-500/20 text-emerald-400'}`}>
      {type}
    </span>
  )
}

function OptimizationResult({ result }: { result: any }) {
  const [showPlan, setShowPlan] = useState(false)
  const improvementColor = result.improvement_pct >= 80 ? 'text-emerald-400' : result.improvement_pct >= 50 ? 'text-amber-400' : 'text-orange-400'

  return (
    <div className="space-y-3 mt-3">
      {/* Before / After comparison */}
      <div className="grid grid-cols-2 gap-3">
        <div className="bg-red-500/5 border border-red-500/20 rounded-lg p-3">
          <p className="text-xs text-red-400 font-semibold mb-2">ANTES (sin optimización)</p>
          <p className="text-2xl font-bold text-red-300 font-mono">{result.before.execution_ms} ms</p>
          <div className="mt-2">
            <ScanBadge type={result.before.scan_type} />
          </div>
          <p className="text-xs text-slate-500 mt-2 font-mono truncate">{result.slow_query.slice(0, 60)}…</p>
        </div>
        <div className="bg-emerald-500/5 border border-emerald-500/20 rounded-lg p-3">
          <p className="text-xs text-emerald-400 font-semibold mb-2">DESPUÉS (con optimización)</p>
          <p className="text-2xl font-bold text-emerald-300 font-mono">{result.after.execution_ms} ms</p>
          <div className="mt-2">
            <ScanBadge type={result.after.scan_type} />
          </div>
          <p className="text-xs text-slate-500 mt-2 font-mono truncate">{result.optimized_query.slice(0, 60)}…</p>
        </div>
      </div>

      {/* Improvement bar */}
      <div className="bg-slate-700/50 rounded-lg p-3 flex items-center gap-4">
        <TrendingDown size={16} className="text-emerald-400 shrink-0" />
        <div className="flex-1">
          <div className="flex justify-between text-xs mb-1">
            <span className="text-slate-400">Mejora de rendimiento</span>
            <span className={`font-bold ${improvementColor}`}>{result.improvement_pct}% más rápido</span>
          </div>
          <div className="w-full bg-slate-600 rounded-full h-2">
            <div className="h-2 rounded-full bg-emerald-500 transition-all duration-700"
              style={{ width: `${Math.min(result.improvement_pct, 100)}%` }} />
          </div>
        </div>
      </div>

      {/* Optimization applied */}
      <div className="bg-slate-700/30 rounded-lg p-2">
        <p className="text-xs text-slate-400 mb-1">Optimización aplicada:</p>
        <code className="text-xs text-indigo-300 font-mono">{result.optimization_applied}</code>
      </div>

      {/* EXPLAIN ANALYZE plans toggle */}
      <button onClick={() => setShowPlan(p => !p)}
        className="flex items-center gap-1 text-xs text-slate-400 hover:text-slate-200">
        {showPlan ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
        {showPlan ? 'Ocultar' : 'Ver'} EXPLAIN ANALYZE completo
      </button>
      {showPlan && (
        <div className="grid grid-cols-2 gap-3">
          <div>
            <p className="text-xs text-red-400 mb-1">Plan ANTES</p>
            <pre className="text-xs text-slate-400 bg-slate-900 rounded p-2 overflow-x-auto whitespace-pre-wrap font-mono leading-5">{result.before.plan}</pre>
          </div>
          <div>
            <p className="text-xs text-emerald-400 mb-1">Plan DESPUÉS</p>
            <pre className="text-xs text-slate-400 bg-slate-900 rounded p-2 overflow-x-auto whitespace-pre-wrap font-mono leading-5">{result.after.plan}</pre>
          </div>
        </div>
      )}
    </div>
  )
}

export default function QueriesPage() {
  const qc = useQueryClient()
  const [activeScenario, setActiveScenario] = useState<number | null>(null)
  const [results, setResults] = useState<Record<number, any>>({})

  const { data: slow = [], refetch: refetchSlow } = useQuery({ queryKey: ['slow-queries'], queryFn: () => getTopSlowQueries(10).then(r => r.data), refetchInterval: 30000 })
  const { data: stats = [], refetch: refetchStats } = useQuery({ queryKey: ['query-stats'], queryFn: () => getQueryStats().then(r => r.data), refetchInterval: 30000 })
  const { data: scenarios = [] } = useQuery({ queryKey: ['optimizer-scenarios'], queryFn: () => getOptimizerScenarios().then(r => r.data) })

  const seedMut = useMutation({
    mutationFn: seedDemoQueries,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['query-stats'] })
      qc.invalidateQueries({ queryKey: ['slow-queries'] })
      refetchStats()
      refetchSlow()
    }
  })

  const runMut = useMutation({
    mutationFn: (id: number) => runOptimizerScenario(id).then(r => r.data),
    onSuccess: (data) => setResults(prev => ({ ...prev, [data.scenario_id]: data })),
  })

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">Slow Query Analyzer</h1>
          <p className="text-slate-400 text-sm">Module 3 — Fast &lt;100ms · Medium 100–500ms · Slow 500–2000ms · Critical &gt;2000ms</p>
        </div>
        <button onClick={() => seedMut.mutate()} disabled={seedMut.isPending}
          className="bg-indigo-600 hover:bg-indigo-700 disabled:opacity-60 text-white text-sm px-4 py-2 rounded-lg flex items-center gap-2">
          <Zap size={14} className={seedMut.isPending ? 'animate-spin' : ''} />
          {seedMut.isPending ? 'Seeding…' : 'Seed Demo Data'}
        </button>
      </div>

      {/* Category distribution */}
      <div className="card">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 className="text-sm font-semibold text-slate-300">Query Classification Distribution</h2>
            <p className="text-xs text-slate-500 mt-0.5">
              Total: {(stats as any[]).reduce((s: number, r: any) => s + r.count, 0)} queries registradas
            </p>
          </div>
          <button onClick={() => { refetchStats(); refetchSlow() }}
            className="text-slate-400 hover:text-slate-200 p-1.5 rounded hover:bg-slate-700">
            <RefreshCw size={13} className={seedMut.isPending ? 'animate-spin' : ''} />
          </button>
        </div>

        <div className="grid grid-cols-2 gap-4">
          {/* Count chart */}
          <div>
            <p className="text-xs text-slate-400 mb-2">Cantidad por categoría</p>
            <ResponsiveContainer width="100%" height={160}>
              <BarChart key={`count-${(stats as any[]).reduce((s: number, r: any) => s + r.count, 0)}`} data={stats} margin={{ top: 16, right: 8, left: 0, bottom: 0 }}>
                <XAxis dataKey="category" tick={{ fontSize: 11, fill: '#94a3b8' }} />
                <YAxis tick={{ fontSize: 10, fill: '#94a3b8' }} />
                <Tooltip
                  contentStyle={{ background: '#1e293b', border: 'none', borderRadius: 8, fontSize: 12 }}
                  formatter={(v: any) => [`${v} queries`, 'Count']}
                />
                <Bar dataKey="count" radius={[4, 4, 0, 0]} isAnimationActive={true}>
                  <LabelList dataKey="count" position="top" style={{ fontSize: 10, fill: '#94a3b8' }} />
                  {(stats as any[]).map((entry: any) => (
                    <Cell key={entry.category} fill={CAT_COLORS[entry.category] || '#6366f1'} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>

          {/* Avg ms chart */}
          <div>
            <p className="text-xs text-slate-400 mb-2">Tiempo promedio por categoría (ms)</p>
            <ResponsiveContainer width="100%" height={160}>
              <BarChart key={`avg-${(stats as any[]).reduce((s: number, r: any) => s + r.avg_ms, 0).toFixed(0)}`} data={stats} margin={{ top: 16, right: 8, left: 0, bottom: 0 }}>
                <XAxis dataKey="category" tick={{ fontSize: 11, fill: '#94a3b8' }} />
                <YAxis tick={{ fontSize: 10, fill: '#94a3b8' }} unit="ms" />
                <Tooltip
                  contentStyle={{ background: '#1e293b', border: 'none', borderRadius: 8, fontSize: 12 }}
                  formatter={(v: any) => [`${Number(v).toFixed(1)} ms`, 'Avg Duration']}
                />
                <Bar dataKey="avg_ms" radius={[4, 4, 0, 0]} isAnimationActive={true}>
                  <LabelList dataKey="avg_ms" position="top" formatter={(v: any) => `${Number(v).toFixed(0)}ms`} style={{ fontSize: 10, fill: '#94a3b8' }} />
                  {(stats as any[]).map((entry: any) => (
                    <Cell key={entry.category} fill={CAT_COLORS[entry.category] || '#6366f1'} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      {/* ── Query Optimization Lab ────────────────────────────────── */}
      <div className="card">
        <div className="mb-4">
          <h2 className="text-sm font-semibold text-slate-300 flex items-center gap-2">
            <TrendingDown size={14} className="text-emerald-400" />
            Query Optimization Lab — Evidencia comparativa antes/después
          </h2>
          <p className="text-xs text-slate-500 mt-1">
            Ejecuta EXPLAIN ANALYZE real sobre 100K filas. Mide el tiempo antes de la optimización y después de aplicar el índice.
          </p>
        </div>

        <div className="space-y-3">
          {(scenarios as any[]).map((s: any) => (
            <div key={s.id} className="border border-slate-700 rounded-lg overflow-hidden">
              {/* Scenario header */}
              <div
                className="flex items-center justify-between px-4 py-3 cursor-pointer hover:bg-slate-700/30"
                onClick={() => setActiveScenario(activeScenario === s.id ? null : s.id)}
              >
                <div className="flex-1">
                  <p className="text-sm font-medium text-slate-200">{s.title}</p>
                  <p className="text-xs text-slate-400 mt-0.5">{s.description}</p>
                </div>
                <div className="flex items-center gap-3 ml-4 shrink-0">
                  {results[s.id] && (
                    <span className="text-xs text-emerald-400 font-bold">
                      {results[s.id].improvement_pct}% mejora
                    </span>
                  )}
                  <button
                    onClick={(e) => { e.stopPropagation(); runMut.mutate(s.id) }}
                    disabled={runMut.isPending && runMut.variables === s.id}
                    className="flex items-center gap-1.5 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white text-xs px-3 py-1.5 rounded-lg"
                  >
                    <Play size={11} />
                    {runMut.isPending && runMut.variables === s.id ? 'Ejecutando…' : 'Ejecutar'}
                  </button>
                  {activeScenario === s.id ? <ChevronUp size={14} className="text-slate-400" /> : <ChevronDown size={14} className="text-slate-400" />}
                </div>
              </div>

              {/* Query preview */}
              {activeScenario === s.id && (
                <div className="px-4 pb-4 border-t border-slate-700/50 bg-slate-800/30">
                  <div className="grid grid-cols-2 gap-3 mt-3 mb-2">
                    <div>
                      <p className="text-xs text-red-400 mb-1">Query lenta (antes)</p>
                      <code className="text-xs text-slate-300 font-mono bg-slate-900 rounded px-2 py-1 block">{s.slow_query}</code>
                    </div>
                    <div>
                      <p className="text-xs text-emerald-400 mb-1">Query optimizada (después)</p>
                      <code className="text-xs text-slate-300 font-mono bg-slate-900 rounded px-2 py-1 block">{s.optimized_query}</code>
                    </div>
                  </div>

                  {results[s.id] && <OptimizationResult result={results[s.id]} />}
                  {!results[s.id] && (
                    <p className="text-xs text-slate-500 text-center py-4">
                      Presiona "Ejecutar" para correr EXPLAIN ANALYZE y ver la comparación real.
                    </p>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* Top slow queries table */}
      <div className="card">
        <h2 className="text-sm font-semibold text-slate-300 mb-3 flex items-center gap-2">
          <Search size={14} /> Top 10 Slowest Queries
        </h2>
        <div className="overflow-x-auto">
          <table className="w-full text-xs text-slate-300">
            <thead>
              <tr className="border-b border-slate-700 text-slate-400">
                <th className="text-left pb-2 pr-4">#</th>
                <th className="text-left pb-2 pr-4">Query</th>
                <th className="text-left pb-2 pr-4">Duration</th>
                <th className="text-left pb-2 pr-4">Category</th>
                <th className="text-left pb-2">Index Used</th>
                <th className="text-left pb-2">Optimization Suggestion</th>
              </tr>
            </thead>
            <tbody>
              {(slow as any[]).map((q: any, i: number) => (
                <tr key={q.id} className="border-b border-slate-700/50 hover:bg-slate-700/30">
                  <td className="py-2 pr-4 text-slate-500">{i + 1}</td>
                  <td className="py-2 pr-4 max-w-xs truncate font-mono">{q.query_text.slice(0, 80)}</td>
                  <td className={`py-2 pr-4 font-bold font-mono ${q.duration_ms > 2000 ? 'text-red-400' : q.duration_ms > 500 ? 'text-amber-400' : 'text-emerald-400'}`}>
                    {q.duration_ms.toFixed(0)}ms
                  </td>
                  <td className="py-2 pr-4">
                    <span className={CAT_BADGE[q.category] || ''}>{q.category}</span>
                  </td>
                  <td className="py-2 pr-4">{q.index_used || <span className="text-red-400">None</span>}</td>
                  <td className="py-2 text-emerald-400">{q.optimized_query || '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {slow.length === 0 && (
            <p className="text-slate-500 text-center py-8">No queries logged yet. Click "Seed Demo Data".</p>
          )}
        </div>
      </div>
    </div>
  )
}
