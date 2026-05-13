import { useState } from 'react'
import { useQuery, useMutation } from '@tanstack/react-query'
import { getCacheStats, demoCachedQuery, getCacheHistory, invalidateCache } from '../services/api'
import { Zap, RefreshCw } from 'lucide-react'
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell } from 'recharts'

export default function CachePage() {
  const [demoResult, setDemoResult] = useState<any>(null)
  const [pattern, setPattern] = useState('demo')

  const { data: stats, refetch: refetchStats } = useQuery({ queryKey: ['cache-stats'], queryFn: () => getCacheStats().then(r => r.data), refetchInterval: 10000 })
  const { data: history } = useQuery({ queryKey: ['cache-history'], queryFn: () => getCacheHistory().then(r => r.data) })

  const demoMut = useMutation({
    mutationFn: demoCachedQuery,
    onSuccess: (res) => { setDemoResult(res.data); refetchStats() },
  })
  const invalidateMut = useMutation({ mutationFn: invalidateCache })

  const chartData = [
    { name: 'Cache (hit)', ms: history?.avg_cached_ms || 40, fill: '#10b981' },
    { name: 'DB (miss)',   ms: history?.avg_db_ms || 400,    fill: '#ef4444' },
  ]

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-white">Redis Cache Monitor</h1>
        <p className="text-slate-400 text-sm">Module 7 — Cache-aside pattern · Hit/miss tracking · TTL invalidation strategy</p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[
          { label: 'Hit Ratio', value: `${stats?.hit_ratio_pct ?? 0}%`, color: stats?.hit_ratio_pct >= 70 ? 'text-emerald-400' : 'text-amber-400' },
          { label: 'Cache Hits', value: stats?.hits ?? 0, color: 'text-emerald-400' },
          { label: 'Cache Misses', value: stats?.misses ?? 0, color: 'text-red-400' },
          { label: 'Total Keys', value: stats?.total_keys ?? 0, color: 'text-indigo-400' },
        ].map(({ label, value, color }) => (
          <div key={label} className="card text-center">
            <p className="text-xs text-slate-400">{label}</p>
            <p className={`text-2xl font-bold ${color}`}>{value}</p>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Performance comparison */}
        <div className="card">
          <h2 className="text-sm font-semibold text-slate-300 mb-4">Response Time Comparison</h2>
          <ResponsiveContainer width="100%" height={180}>
            <BarChart data={chartData}>
              <XAxis dataKey="name" tick={{ fontSize: 12, fill: '#94a3b8' }} />
              <YAxis tick={{ fontSize: 11, fill: '#94a3b8' }} unit="ms" />
              <Tooltip contentStyle={{ background: '#1e293b', border: 'none', borderRadius: 8 }} formatter={(v: any) => [`${v}ms`]} />
              <Bar dataKey="ms" radius={[6, 6, 0, 0]}>
                {chartData.map((d) => <Cell key={d.name} fill={d.fill} />)}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
          <div className="flex justify-center gap-6 mt-2 text-xs">
            <span className="text-emerald-400">● With cache: ~40ms</span>
            <span className="text-red-400">● Without cache: ~400ms</span>
          </div>
        </div>

        {/* Demo */}
        <div className="card space-y-4">
          <h2 className="text-sm font-semibold text-slate-300">Cache-Aside Demo</h2>
          <p className="text-xs text-slate-400">First call goes to the DB (~400ms). Subsequent calls hit cache (~40ms). TTL = 60s.</p>
          <button
            onClick={() => demoMut.mutate()}
            disabled={demoMut.isPending}
            className="flex items-center gap-2 bg-indigo-600 hover:bg-indigo-700 text-white text-sm px-4 py-2 rounded-lg"
          >
            <Zap size={14} /> {demoMut.isPending ? 'Querying…' : 'Run Demo Query'}
          </button>

          {demoResult && (
            <div className={`rounded-lg p-3 text-xs border ${demoResult.cache_hit ? 'bg-emerald-500/10 border-emerald-500/20' : 'bg-amber-500/10 border-amber-500/20'}`}>
              <p className="font-bold mb-1">{demoResult.cache_hit ? '✅ Cache HIT' : '🔄 Cache MISS (DB queried)'}</p>
              <p className="text-slate-300">Response time: <span className="font-mono font-bold">{demoResult.response_ms}ms</span></p>
              {!demoResult.cache_hit && <p className="text-slate-300">DB time: <span className="font-mono">{demoResult.db_response_ms}ms</span></p>}
              <p className="text-slate-400 mt-1">Key: <span className="font-mono">{demoResult.cache_key}</span></p>
            </div>
          )}

          <div className="border-t border-slate-700 pt-3">
            <p className="text-xs text-slate-400 mb-2">Manual cache invalidation:</p>
            <div className="flex gap-2">
              <input
                value={pattern}
                onChange={e => setPattern(e.target.value)}
                className="bg-slate-700 border border-slate-600 text-slate-200 text-xs rounded-lg px-2 py-1 flex-1"
                placeholder="key pattern"
              />
              <button
                onClick={() => invalidateMut.mutate(pattern)}
                className="flex items-center gap-1 bg-slate-600 hover:bg-slate-500 text-slate-200 text-xs px-3 py-1 rounded-lg"
              >
                <RefreshCw size={11} /> Invalidate
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* History log */}
      <div className="card">
        <h2 className="text-sm font-semibold text-slate-300 mb-3">Cache Metrics Log</h2>
        <div className="flex gap-4 text-xs text-slate-400 mb-3">
          <span>Hit ratio: <span className="text-emerald-400 font-bold">{history?.hit_ratio_pct ?? 0}%</span></span>
          <span>Avg cached: <span className="text-emerald-400 font-bold">{history?.avg_cached_ms ?? 0}ms</span></span>
          <span>Avg DB: <span className="text-red-400 font-bold">{history?.avg_db_ms ?? 0}ms</span></span>
        </div>
        <div className="max-h-40 overflow-y-auto space-y-1">
          {(history?.history || []).slice(0, 20).map((h: any, i: number) => (
            <div key={i} className="flex items-center gap-3 text-xs text-slate-400">
              <span className={h.hit ? 'text-emerald-400' : 'text-amber-400'}>{h.hit ? 'HIT' : 'MISS'}</span>
              <span className="font-mono">{h.response_ms.toFixed(1)}ms</span>
              <span>{new Date(h.captured_at).toLocaleTimeString()}</span>
            </div>
          ))}
          {(!history?.history || history.history.length === 0) && (
            <p className="text-slate-500 text-center py-4">No cache metrics yet. Run the demo query above.</p>
          )}
        </div>
      </div>
    </div>
  )
}
