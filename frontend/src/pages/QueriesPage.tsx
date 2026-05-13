import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { getTopSlowQueries, getQueryStats, seedDemoQueries } from '../services/api'
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell } from 'recharts'
import { Search, Zap } from 'lucide-react'

const CAT_COLORS: any = { Fast: '#10b981', Medium: '#f59e0b', Slow: '#f97316', Critical: '#ef4444' }
const CAT_BADGE: any  = { Fast: 'badge-healthy', Medium: 'badge-warning', Slow: 'text-orange-400', Critical: 'badge-critical' }

export default function QueriesPage() {
  const qc = useQueryClient()
  const { data: slow = [] } = useQuery({ queryKey: ['slow-queries'], queryFn: () => getTopSlowQueries(10).then(r => r.data) })
  const { data: stats = [] } = useQuery({ queryKey: ['query-stats'], queryFn: () => getQueryStats().then(r => r.data) })
  const seedMut = useMutation({ mutationFn: seedDemoQueries, onSuccess: () => qc.invalidateQueries() })

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">Slow Query Analyzer</h1>
          <p className="text-slate-400 text-sm">Module 3 — Fast &lt;100ms · Medium 100–500ms · Slow 500–2000ms · Critical &gt;2000ms</p>
        </div>
        <button onClick={() => seedMut.mutate()} className="bg-indigo-600 hover:bg-indigo-700 text-white text-sm px-4 py-2 rounded-lg flex items-center gap-2">
          <Zap size={14} /> Seed Demo Data
        </button>
      </div>

      {/* Category distribution */}
      <div className="card">
        <h2 className="text-sm font-semibold text-slate-300 mb-4">Query Classification Distribution</h2>
        <ResponsiveContainer width="100%" height={180}>
          <BarChart data={stats}>
            <XAxis dataKey="category" tick={{ fontSize: 12, fill: '#94a3b8' }} />
            <YAxis tick={{ fontSize: 11, fill: '#94a3b8' }} />
            <Tooltip contentStyle={{ background: '#1e293b', border: 'none', borderRadius: 8 }} />
            <Bar dataKey="count" radius={[4, 4, 0, 0]} name="Count">
              {stats.map((entry: any) => (
                <Cell key={entry.category} fill={CAT_COLORS[entry.category] || '#6366f1'} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
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
              {slow.map((q: any, i: number) => (
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
