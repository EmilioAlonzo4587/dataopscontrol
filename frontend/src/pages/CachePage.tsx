import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { getCacheStats, demoCachedQuery, getCacheHistory, invalidateCache } from '../services/api'
import { Zap, RefreshCw, Database, Clock, CheckCircle, XCircle } from 'lucide-react'
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell, LabelList } from 'recharts'

export default function CachePage() {
  const qc = useQueryClient()
  const [demoResult, setDemoResult] = useState<any>(null)
  const [pattern, setPattern] = useState('demo')
  const [invalidateResult, setInvalidateResult] = useState<any>(null)

  const { data: stats, refetch: refetchStats } = useQuery({
    queryKey: ['cache-stats'],
    queryFn: () => getCacheStats().then(r => r.data),
    refetchInterval: 10000,
  })

  const { data: history, refetch: refetchHistory } = useQuery({
    queryKey: ['cache-history'],
    queryFn: () => getCacheHistory().then(r => r.data),
  })

  const demoMut = useMutation({
    mutationFn: () => demoCachedQuery(),
    onSuccess: (res) => {
      setDemoResult(res.data)
      refetchStats()
      refetchHistory()
    },
  })

  const invalidateMut = useMutation({
    mutationFn: (p: string) => invalidateCache(p),
    onSuccess: (res) => {
      setInvalidateResult(res.data)
      qc.invalidateQueries({ queryKey: ['cache-stats'] })
      refetchStats()
    },
  })

  // Use real measured averages from DB; fall back to expected values only when no data yet
  const avgCachedMs = history?.avg_cached_ms ?? 0
  const avgDbMs = history?.avg_db_ms ?? 0
  const hasRealData = (history?.history?.length ?? 0) > 0

  const chartData = [
    { name: 'Cache HIT',  ms: hasRealData ? avgCachedMs : 40,  fill: '#10b981' },
    { name: 'DB (miss)',  ms: hasRealData ? avgDbMs : 400,      fill: '#ef4444' },
  ]

  const hitRatio = history?.hit_ratio_pct ?? stats?.hit_ratio_pct ?? 0

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">Redis Cache Monitor</h1>
          <p className="text-slate-400 text-sm">
            Module 7 — Cache-aside pattern · Hit/miss tracking · TTL + manual invalidation
          </p>
        </div>
        <button onClick={() => { refetchStats(); refetchHistory() }}
          className="text-slate-400 hover:text-white p-2 rounded-lg hover:bg-slate-700">
          <RefreshCw size={14} />
        </button>
      </div>

      {/* KPI row */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[
          {
            label: 'Hit Ratio',
            value: `${hitRatio}%`,
            color: hitRatio >= 70 ? 'text-emerald-400' : hitRatio >= 40 ? 'text-amber-400' : 'text-red-400',
          },
          { label: 'Cache Hits',   value: stats?.hits   ?? 0, color: 'text-emerald-400' },
          { label: 'Cache Misses', value: stats?.misses ?? 0, color: 'text-red-400' },
          { label: 'Total Keys',   value: stats?.total_keys ?? 0, color: 'text-cyan-400' },
        ].map(({ label, value, color }) => (
          <div key={label} className="card text-center">
            <p className="text-xs text-slate-400">{label}</p>
            <p className={`text-2xl font-bold ${color}`}>{value}</p>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Performance comparison chart */}
        <div className="card">
          <h2 className="text-sm font-semibold text-slate-300 mb-1">Response Time Comparison</h2>
          <p className="text-xs text-slate-500 mb-4">
            {hasRealData
              ? 'Tiempos reales medidos con time.monotonic() por llamada al demo.'
              : 'Ejecuta el demo para ver tiempos reales medidos.'}
          </p>
          <ResponsiveContainer width="100%" height={180}>
            <BarChart data={chartData} margin={{ top: 20, right: 10, left: 0, bottom: 0 }}>
              <XAxis dataKey="name" tick={{ fontSize: 12, fill: '#94a3b8' }} />
              <YAxis tick={{ fontSize: 11, fill: '#94a3b8' }} unit="ms" />
              <Tooltip
                contentStyle={{ background: '#18181b', border: 'none', borderRadius: 8 }}
                formatter={(v: any) => [`${Number(v).toFixed(1)}ms`, 'Tiempo']}
              />
              <Bar dataKey="ms" radius={[6, 6, 0, 0]}>
                <LabelList dataKey="ms" position="top" formatter={(v: any) => `${Number(v).toFixed(0)}ms`}
                  style={{ fontSize: 11, fill: '#e2e8f0' }} />
                {chartData.map((d) => <Cell key={d.name} fill={d.fill} />)}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
          <div className="flex justify-center gap-6 mt-2 text-xs">
            <span className="text-emerald-400">● Cache HIT: ~40ms (Redis lookup)</span>
            <span className="text-red-400">● DB MISS: ~400ms (pg_sleep + query)</span>
          </div>
        </div>

        {/* Demo panel */}
        <div className="card space-y-4">
          <div>
            <h2 className="text-sm font-semibold text-slate-300">Cache-Aside Demo</h2>
            <p className="text-xs text-slate-400 mt-1">
              Primera llamada: DB query real con <code className="text-cyan-300">pg_sleep(0.35)</code> (~400ms).
              Llamadas siguientes: Redis HIT (~40ms). TTL = 60s.
            </p>
          </div>

          <button
            onClick={() => demoMut.mutate()}
            disabled={demoMut.isPending}
            className="flex items-center gap-2 bg-cyan-600 hover:bg-cyan-700 disabled:opacity-50 text-white text-sm px-4 py-2 rounded-lg transition-colors"
          >
            <Zap size={14} /> {demoMut.isPending ? 'Consultando…' : 'Run Demo Query'}
          </button>

          {demoResult && (
            <div className={`rounded-lg p-3 text-xs border space-y-1.5
              ${demoResult.cache_hit
                ? 'bg-emerald-500/10 border-emerald-500/20'
                : 'bg-amber-500/10 border-amber-500/20'}`}>
              <div className="flex items-center gap-1.5 font-bold">
                {demoResult.cache_hit
                  ? <><CheckCircle size={12} className="text-emerald-400" /> <span className="text-emerald-300">Cache HIT</span></>
                  : <><Database size={12} className="text-amber-400" /> <span className="text-amber-300">Cache MISS — DB consultada</span></>}
              </div>
              <div className="flex items-center gap-1.5 text-slate-300">
                <Clock size={11} />
                Tiempo de respuesta:
                <span className="font-mono font-bold">{demoResult.response_ms}ms</span>
              </div>
              {!demoResult.cache_hit && (
                <p className="text-slate-400">
                  Tiempo DB (pg_sleep + query): <span className="font-mono">{demoResult.db_response_ms}ms</span>
                </p>
              )}
              <p className="text-slate-500">Clave: <span className="font-mono">{demoResult.cache_key}</span></p>
            </div>
          )}

          {/* Invalidation */}
          <div className="border-t border-slate-700 pt-3 space-y-2">
            <p className="text-xs text-slate-300 font-medium">Invalidación manual por patrón</p>
            <p className="text-xs text-slate-500">
              Borra llaves del caché que coincidan con el prefijo — simula invalidación por evento
              (ej. escritura en tabla, cambio de configuración).
            </p>
            <div className="flex gap-2">
              <input
                value={pattern}
                onChange={e => setPattern(e.target.value)}
                className="bg-slate-700 border border-slate-600 text-slate-200 text-xs rounded-lg px-2 py-1 flex-1"
                placeholder="prefijo de clave (ej. demo)"
              />
              <button
                onClick={() => invalidateMut.mutate(pattern)}
                disabled={invalidateMut.isPending}
                className="flex items-center gap-1 bg-slate-600 hover:bg-slate-500 disabled:opacity-50 text-slate-200 text-xs px-3 py-1 rounded-lg"
              >
                <RefreshCw size={11} /> Invalidar
              </button>
            </div>
            {invalidateResult && (
              <p className="text-xs text-amber-400">
                {invalidateResult.deleted_keys} llave(s) eliminada(s) con patrón "{invalidateResult.pattern}*"
              </p>
            )}
          </div>
        </div>
      </div>

      {/* Invalidation strategy info */}
      <div className="card">
        <h2 className="text-sm font-semibold text-slate-300 mb-3">Estrategia de Invalidación</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="bg-cyan-500/10 border border-cyan-500/20 rounded-xl p-4 space-y-2">
            <p className="text-xs font-semibold text-cyan-300">TTL — Expiración automática</p>
            <p className="text-xs text-slate-400 leading-relaxed">
              Cada entrada se almacena con <code className="text-cyan-300">SETEX key 60 value</code>.
              Redis expira la llave automáticamente a los 60 segundos. Ideal para datos que cambian
              con baja frecuencia (métricas, estadísticas de queries).
            </p>
          </div>
          <div className="bg-amber-500/10 border border-amber-500/20 rounded-xl p-4 space-y-2">
            <p className="text-xs font-semibold text-amber-300">Manual — Invalidación por evento</p>
            <p className="text-xs text-slate-400 leading-relaxed">
              Cuando ocurre un evento de escritura (INSERT masivo, cambio de config), se llama a
              <code className="text-amber-300"> DELETE key*</code> por patrón. Garantiza que la
              siguiente lectura obtenga datos frescos directamente de la BD.
            </p>
          </div>
        </div>
      </div>

      {/* History log */}
      <div className="card">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-sm font-semibold text-slate-300">Cache Metrics Log</h2>
          <div className="flex gap-4 text-xs text-slate-400">
            <span>Hit ratio: <span className="text-emerald-400 font-bold">{history?.hit_ratio_pct ?? 0}%</span></span>
            <span>Avg cached: <span className="text-emerald-400 font-bold">{avgCachedMs}ms</span></span>
            <span>Avg DB: <span className="text-red-400 font-bold">{avgDbMs}ms</span></span>
          </div>
        </div>
        <div className="max-h-48 overflow-y-auto space-y-1">
          {(history?.history || []).slice(0, 30).map((h: any, i: number) => (
            <div key={i} className="flex items-center gap-3 text-xs text-slate-400 py-0.5">
              {h.hit
                ? <CheckCircle size={11} className="text-emerald-400 shrink-0" />
                : <XCircle    size={11} className="text-amber-400 shrink-0" />}
              <span className={`w-8 font-bold ${h.hit ? 'text-emerald-400' : 'text-amber-400'}`}>
                {h.hit ? 'HIT' : 'MISS'}
              </span>
              <span className="font-mono w-16">{h.response_ms.toFixed(1)}ms</span>
              {!h.hit && h.db_response_ms > 0 && (
                <span className="text-slate-500 font-mono">(DB: {h.db_response_ms?.toFixed(1)}ms)</span>
              )}
              <span className="ml-auto text-slate-600">{new Date(h.captured_at).toLocaleTimeString()}</span>
            </div>
          ))}
          {(!history?.history || history.history.length === 0) && (
            <p className="text-slate-500 text-center py-6 text-xs">
              Sin métricas aún. Ejecuta el demo query para generar datos.
            </p>
          )}
        </div>
      </div>
    </div>
  )
}
