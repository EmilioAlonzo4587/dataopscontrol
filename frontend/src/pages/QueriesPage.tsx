import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { getTopSlowQueries, getQueryStats, seedDemoQueries, getOptimizerScenarios, runOptimizerScenario } from '../services/api'
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell, LabelList } from 'recharts'
import { Search, Zap, Play, ChevronDown, ChevronUp, TrendingDown, RefreshCw, CheckCircle, Clock, AlertTriangle, XCircle } from 'lucide-react'

const CAT_COLORS: any = { Fast: '#10b981', Medium: '#f59e0b', Slow: '#f97316', Critical: '#ef4444' }
const CAT_BADGE: any  = { Fast: 'badge-healthy', Medium: 'badge-warning', Slow: 'text-orange-400 font-bold', Critical: 'badge-critical' }

const SCENARIO_CAT_STYLE: any = {
  CRITICAL: 'bg-red-500/20 text-red-400 border border-red-500/30',
  SLOW:     'bg-orange-500/20 text-orange-400 border border-orange-500/30',
}

function ScanBadge({ type }: { type: string }) {
  const isSeq = type.includes('Sequential')
  return (
    <span className={`text-xs px-2 py-0.5 rounded font-mono ${isSeq ? 'bg-red-500/20 text-red-400' : 'bg-emerald-500/20 text-emerald-400'}`}>
      {type}
    </span>
  )
}

function Step({ n, label, color = 'slate' }: { n: number; label: string; color?: string }) {
  const colors: any = {
    red:     'bg-red-500/20 text-red-400 border-red-500/40',
    emerald: 'bg-emerald-500/20 text-emerald-400 border-emerald-500/40',
    cyan:    'bg-cyan-500/20 text-cyan-400 border-cyan-500/40',
    slate:   'bg-slate-700 text-slate-300 border-slate-600',
  }
  return (
    <div className="flex items-center gap-2">
      <span className={`w-6 h-6 rounded-full border flex items-center justify-center text-xs font-bold shrink-0 ${colors[color]}`}>{n}</span>
      <span className="text-xs font-semibold text-slate-300">{label}</span>
    </div>
  )
}

function OptimizationResult({ result }: { result: any }) {
  const [showPlan, setShowPlan] = useState(false)
  const improvement = result.improvement_pct
  const improvementColor = improvement >= 80 ? 'text-emerald-400' : improvement >= 50 ? 'text-amber-400' : 'text-orange-400'
  const ranAt = new Date().toLocaleString()

  return (
    <div className="space-y-4 mt-4">

      {/* Step 1 — Consulta clasificada */}
      <div className="space-y-2">
        <Step n={1} label="Consulta clasificada como SLOW / CRITICAL (sin optimización)" color="red" />
        <div className="bg-red-500/5 border border-red-500/20 rounded-lg p-3 ml-8">
          <div className="flex items-center gap-2 mb-2">
            <AlertTriangle size={12} className="text-red-400" />
            <span className="text-xs text-red-400 font-semibold">Consulta original · Tiempo real medido</span>
          </div>
          <code className="text-xs text-slate-300 font-mono block mb-3 leading-5">{result.slow_query}</code>
          <div className="flex items-center gap-4">
            <div>
              <p className="text-[10px] text-slate-500 mb-0.5">Tiempo de ejecución</p>
              <p className="text-2xl font-bold text-red-300 font-mono">{result.before.execution_ms} ms</p>
            </div>
            <div>
              <p className="text-[10px] text-slate-500 mb-0.5">Tipo de escaneo</p>
              <ScanBadge type={result.before.scan_type} />
            </div>
          </div>
        </div>
      </div>

      {/* Step 2 — Plan EXPLAIN ANALYZE antes */}
      <div className="space-y-2">
        <Step n={2} label="Plan de ejecución original — EXPLAIN ANALYZE (BEFORE)" color="red" />
        <div className="ml-8">
          <button onClick={() => setShowPlan(p => !p)}
            className="flex items-center gap-1.5 text-xs text-slate-400 hover:text-slate-200 mb-2">
            {showPlan ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
            {showPlan ? 'Ocultar' : 'Ver'} EXPLAIN ANALYZE completo (antes / después)
          </button>
          {showPlan && (
            <div className="grid grid-cols-2 gap-3">
              <div>
                <p className="text-xs text-red-400 mb-1 font-semibold">Plan ANTES — Seq Scan</p>
                <pre className="text-xs text-slate-400 bg-zinc-950 border border-slate-700/50 rounded p-2 overflow-x-auto whitespace-pre-wrap font-mono leading-5 max-h-48">{result.before.plan}</pre>
              </div>
              <div>
                <p className="text-xs text-emerald-400 mb-1 font-semibold">Plan DESPUÉS — Index Scan</p>
                <pre className="text-xs text-slate-400 bg-zinc-950 border border-slate-700/50 rounded p-2 overflow-x-auto whitespace-pre-wrap font-mono leading-5 max-h-48">{result.after.plan}</pre>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Step 3 — Optimización aplicada */}
      <div className="space-y-2">
        <Step n={3} label="Optimización aplicada — CREATE INDEX ejecutado en PostgreSQL" color="cyan" />
        <div className="ml-8 bg-cyan-500/5 border border-cyan-500/20 rounded-lg p-3">
          <div className="flex items-center gap-2 mb-2">
            <Zap size={12} className="text-cyan-400" />
            <span className="text-xs text-cyan-400 font-semibold">DDL ejecutado</span>
          </div>
          <code className="text-xs text-cyan-300 font-mono leading-5 block">{result.optimization_applied}</code>
        </div>
      </div>

      {/* Step 4 — Resultado después */}
      <div className="space-y-2">
        <Step n={4} label="Evidencia comparativa — EXPLAIN ANALYZE (AFTER)" color="emerald" />
        <div className="ml-8 space-y-3">
          <div className="bg-emerald-500/5 border border-emerald-500/20 rounded-lg p-3">
            <div className="flex items-center gap-2 mb-2">
              <CheckCircle size={12} className="text-emerald-400" />
              <span className="text-xs text-emerald-400 font-semibold">Consulta optimizada · Tiempo real medido</span>
            </div>
            <code className="text-xs text-slate-300 font-mono block mb-3 leading-5">{result.optimized_query}</code>
            <div className="flex items-center gap-4">
              <div>
                <p className="text-[10px] text-slate-500 mb-0.5">Tiempo de ejecución</p>
                <p className="text-2xl font-bold text-emerald-300 font-mono">{result.after.execution_ms} ms</p>
              </div>
              <div>
                <p className="text-[10px] text-slate-500 mb-0.5">Tipo de escaneo</p>
                <ScanBadge type={result.after.scan_type} />
              </div>
            </div>
          </div>

          {/* Improvement bar */}
          <div className="bg-slate-700/50 rounded-lg p-3">
            <div className="flex items-center gap-3 mb-2">
              <TrendingDown size={14} className="text-emerald-400 shrink-0" />
              <div className="flex-1">
                <div className="flex justify-between text-xs mb-1">
                  <span className="text-slate-400">Reducción de tiempo</span>
                  <span className={`font-bold text-sm ${improvementColor}`}>{improvement}% más rápido</span>
                </div>
                <div className="w-full bg-slate-600 rounded-full h-2.5">
                  <div className="h-2.5 rounded-full bg-emerald-500 transition-all duration-700"
                    style={{ width: `${Math.min(improvement, 100)}%` }} />
                </div>
              </div>
            </div>
            <div className="grid grid-cols-3 gap-2 mt-3 text-center">
              <div className="bg-red-500/10 rounded px-2 py-1.5">
                <p className="text-[10px] text-slate-500">Antes</p>
                <p className="text-sm font-bold text-red-300 font-mono">{result.before.execution_ms} ms</p>
              </div>
              <div className="bg-slate-800 rounded px-2 py-1.5 flex items-center justify-center">
                <XCircle size={12} className="text-slate-500 mr-1" />
                <span className="text-xs text-slate-500">vs</span>
              </div>
              <div className="bg-emerald-500/10 rounded px-2 py-1.5">
                <p className="text-[10px] text-slate-500">Después</p>
                <p className="text-sm font-bold text-emerald-300 font-mono">{result.after.execution_ms} ms</p>
              </div>
            </div>
          </div>

          <p className="text-[10px] text-slate-600 flex items-center gap-1">
            <Clock size={10} /> Análisis ejecutado: {ranAt} · Tabla demo_orders 100K filas · PostgreSQL EXPLAIN ANALYZE real
          </p>
        </div>
      </div>
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
    onSuccess: (data) => {
      setResults(prev => ({ ...prev, [data.scenario_id]: data }))
      setActiveScenario(data.scenario_id)
    },
  })

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">Slow Query Analyzer</h1>
          <p className="text-slate-400 text-sm">Module 3 — Fast &lt;100ms · Medium 100–500ms · Slow 500–2000ms · Critical &gt;2000ms</p>
        </div>
        <button onClick={() => seedMut.mutate()} disabled={seedMut.isPending}
          className="bg-cyan-600 hover:bg-cyan-700 disabled:opacity-60 text-white text-sm px-4 py-2 rounded-lg flex items-center gap-2">
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
            <RefreshCw size={13} />
          </button>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <p className="text-xs text-slate-400 mb-2">Cantidad por categoría</p>
            <ResponsiveContainer width="100%" height={160}>
              <BarChart data={stats} margin={{ top: 16, right: 8, left: 0, bottom: 0 }}>
                <XAxis dataKey="category" tick={{ fontSize: 11, fill: '#94a3b8' }} />
                <YAxis tick={{ fontSize: 10, fill: '#94a3b8' }} />
                <Tooltip contentStyle={{ background: '#18181b', border: 'none', borderRadius: 8, fontSize: 12 }} formatter={(v: any) => [`${v} queries`, 'Count']} />
                <Bar dataKey="count" radius={[4, 4, 0, 0]}>
                  <LabelList dataKey="count" position="top" style={{ fontSize: 10, fill: '#94a3b8' }} />
                  {(stats as any[]).map((entry: any) => <Cell key={entry.category} fill={CAT_COLORS[entry.category] || '#06b6d4'} />)}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
          <div>
            <p className="text-xs text-slate-400 mb-2">Tiempo promedio por categoría (ms)</p>
            <ResponsiveContainer width="100%" height={160}>
              <BarChart data={stats} margin={{ top: 16, right: 8, left: 0, bottom: 0 }}>
                <XAxis dataKey="category" tick={{ fontSize: 11, fill: '#94a3b8' }} />
                <YAxis tick={{ fontSize: 10, fill: '#94a3b8' }} unit="ms" />
                <Tooltip contentStyle={{ background: '#18181b', border: 'none', borderRadius: 8, fontSize: 12 }} formatter={(v: any) => [`${Number(v).toFixed(1)} ms`, 'Avg Duration']} />
                <Bar dataKey="avg_ms" radius={[4, 4, 0, 0]}>
                  <LabelList dataKey="avg_ms" position="top" formatter={(v: any) => `${Number(v).toFixed(0)}ms`} style={{ fontSize: 10, fill: '#94a3b8' }} />
                  {(stats as any[]).map((entry: any) => <Cell key={entry.category} fill={CAT_COLORS[entry.category] || '#06b6d4'} />)}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      {/* ── Query Optimization Lab ────────────────────────────────── */}
      <div className="card">
        <div className="mb-5">
          <h2 className="text-sm font-semibold text-slate-300 flex items-center gap-2">
            <TrendingDown size={14} className="text-emerald-400" />
            Query Optimization Lab — Evidencia comparativa paso a paso
          </h2>
          <p className="text-xs text-slate-500 mt-1">
            Selecciona una consulta clasificada como <span className="text-orange-400 font-semibold">Slow</span> o <span className="text-red-400 font-semibold">Critical</span>. El sistema ejecuta EXPLAIN ANALYZE real sobre 100K filas,
            aplica la optimización (CREATE INDEX) y muestra la evidencia comparativa antes/después.
          </p>
        </div>

        <div className="space-y-3">
          {(scenarios as any[]).map((s: any) => (
            <div key={s.id} className={`border rounded-lg overflow-hidden transition-all ${activeScenario === s.id ? 'border-cyan-500/40' : 'border-slate-700'}`}>
              <div
                className="flex items-center justify-between px-4 py-3 cursor-pointer hover:bg-slate-700/30"
                onClick={() => setActiveScenario(activeScenario === s.id ? null : s.id)}
              >
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-0.5">
                    <span className={`text-[10px] px-1.5 py-0.5 rounded font-bold ${SCENARIO_CAT_STYLE[s.category] || ''}`}>
                      {s.category}
                    </span>
                    <p className="text-sm font-medium text-slate-200">{s.title}</p>
                  </div>
                  <p className="text-xs text-slate-400">{s.description}</p>
                </div>
                <div className="flex items-center gap-3 ml-4 shrink-0">
                  {results[s.id] && (
                    <span className="text-xs text-emerald-400 font-bold bg-emerald-500/10 border border-emerald-500/20 px-2 py-0.5 rounded">
                      {results[s.id].improvement_pct}% mejora
                    </span>
                  )}
                  <button
                    onClick={(e) => { e.stopPropagation(); runMut.mutate(s.id) }}
                    disabled={runMut.isPending}
                    className="flex items-center gap-1.5 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white text-xs px-3 py-1.5 rounded-lg"
                  >
                    <Play size={11} />
                    {runMut.isPending && runMut.variables === s.id ? 'Ejecutando…' : 'Ejecutar'}
                  </button>
                  {activeScenario === s.id ? <ChevronUp size={14} className="text-slate-400" /> : <ChevronDown size={14} className="text-slate-400" />}
                </div>
              </div>

              {activeScenario === s.id && (
                <div className="px-4 pb-5 border-t border-slate-700/50 bg-slate-800/30">
                  {/* Query preview (before running) */}
                  {!results[s.id] && (
                    <div className="grid grid-cols-2 gap-3 mt-4 mb-2">
                      <div>
                        <p className="text-xs text-red-400 mb-1 font-semibold">Query lenta (ANTES)</p>
                        <code className="text-xs text-slate-300 font-mono bg-zinc-950 border border-slate-700/50 rounded px-2 py-1.5 block leading-5">{s.slow_query}</code>
                      </div>
                      <div>
                        <p className="text-xs text-emerald-400 mb-1 font-semibold">Query optimizada (DESPUÉS)</p>
                        <code className="text-xs text-slate-300 font-mono bg-zinc-950 border border-slate-700/50 rounded px-2 py-1.5 block leading-5">{s.optimized_query}</code>
                      </div>
                      <div className="col-span-2">
                        <p className="text-xs text-cyan-400 mb-1 font-semibold">Optimización a aplicar</p>
                        <code className="text-xs text-cyan-300 font-mono bg-zinc-950 border border-cyan-500/20 rounded px-2 py-1.5 block">{s.optimization}</code>
                      </div>
                    </div>
                  )}
                  {!results[s.id] && (
                    <p className="text-xs text-slate-500 text-center py-3">
                      Presiona <span className="text-emerald-400 font-semibold">Ejecutar</span> para correr EXPLAIN ANALYZE y ver la comparación real paso a paso.
                    </p>
                  )}

                  {results[s.id] && <OptimizationResult result={results[s.id]} />}
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
                <th className="text-left pb-2 pr-4">Index Used</th>
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
