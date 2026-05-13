import { useQuery } from '@tanstack/react-query'
import { getReplicationStatus, getCapAnalysis } from '../services/api'
import { RefreshCw, Info } from 'lucide-react'
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts'

export default function ReplicationPage() {
  const { data: status = [] } = useQuery({ queryKey: ['replication'], queryFn: () => getReplicationStatus().then(r => r.data), refetchInterval: 15000 })
  const { data: cap } = useQuery({ queryKey: ['cap'], queryFn: () => getCapAnalysis().then(r => r.data) })

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-white">Replication Dashboard</h1>
        <p className="text-slate-400 text-sm">Module 6 — Primary-Replica streaming replication with lag monitoring and CAP Theorem analysis</p>
      </div>

      <div className="card">
        <h2 className="text-sm font-semibold text-slate-300 mb-4 flex items-center gap-2"><RefreshCw size={14} /> Replication Lag Over Time</h2>
        <ResponsiveContainer width="100%" height={180}>
          <LineChart data={(status as any[]).slice(-20).map((s: any) => ({ lag: s.lag_seconds, time: new Date(s.captured_at).toLocaleTimeString() }))}>
            <XAxis dataKey="time" tick={{ fontSize: 10, fill: '#94a3b8' }} />
            <YAxis tick={{ fontSize: 10, fill: '#94a3b8' }} />
            <Tooltip contentStyle={{ background: '#1e293b', border: 'none', borderRadius: 8 }} />
            <Line type="monotone" dataKey="lag" stroke="#6366f1" strokeWidth={2} dot={false} name="Lag (s)" />
          </LineChart>
        </ResponsiveContainer>
        <div className="grid grid-cols-3 gap-3 mt-4 text-xs">
          {[{s:'Normal load',l:'≤2s',c:'text-emerald-400'},{s:'Medium load',l:'~5s',c:'text-amber-400'},{s:'High load',l:'~20s',c:'text-red-400'}].map(i => (
            <div key={i.s} className="bg-slate-700/50 rounded-lg p-2 text-center">
              <p className="text-slate-400">{i.s}</p>
              <p className={`text-lg font-bold ${i.c}`}>{i.l}</p>
            </div>
          ))}
        </div>
      </div>

      {cap && (
        <div className="card">
          <h2 className="text-sm font-semibold text-slate-300 mb-3 flex items-center gap-2"><Info size={14} /> CAP Theorem Analysis</h2>
          <p className="text-xs mb-3">Architecture: <span className="text-indigo-400">{cap.architecture}</span> — CAP Choice: <span className="text-amber-400 font-bold">{cap.cap_choice}</span></p>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-xs">
            {[{title:'Consistency',d:cap.consistency},{title:'Availability',d:cap.availability},{title:'Partition Tolerance',d:cap.partition_tolerance}].map(({title,d}) => (
              <div key={title} className="bg-slate-700/50 rounded-lg p-3">
                <p className="font-semibold text-slate-300 mb-1">{title}</p>
                <p className="text-indigo-400 text-[10px] mb-1">{d?.level}</p>
                <p className="text-slate-400 leading-relaxed">{d?.description}</p>
              </div>
            ))}
          </div>
          <ul className="mt-3 space-y-1">
            {(cap.design_decisions || []).map((d: string) => <li key={d} className="text-xs text-slate-400">• {d}</li>)}
          </ul>
        </div>
      )}
    </div>
  )
}
