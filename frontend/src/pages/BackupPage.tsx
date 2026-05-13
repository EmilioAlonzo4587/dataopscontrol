import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { getBackupHistory, runBackup, restoreBackup, createSnapshot, getSlaReport, simulateDisaster } from '../services/api'
import { HardDrive, Play, RotateCcw, Camera, AlertTriangle, CheckCircle } from 'lucide-react'

const TYPE_COLORS: any = { FULL: 'text-indigo-400', DIFF: 'text-amber-400', INC: 'text-emerald-400', SNAPSHOT: 'text-purple-400' }
const STATUS_BADGE: any = { SUCCESS: 'badge-healthy', FAILED: 'badge-critical', RUNNING: 'badge-warning' }

export default function BackupPage() {
  const qc = useQueryClient()
  const [disasterResult, setDisasterResult] = useState<any>(null)
  const { data: history = [] } = useQuery({ queryKey: ['backup-history'], queryFn: () => getBackupHistory().then(r => r.data) })
  const { data: sla } = useQuery({ queryKey: ['sla'], queryFn: () => getSlaReport().then(r => r.data) })

  const runMut = useMutation({ mutationFn: ({ type, parent }: any) => runBackup(1, type, parent), onSuccess: () => qc.invalidateQueries() })
  const snapMut = useMutation({ mutationFn: (name: string) => createSnapshot(1, name), onSuccess: () => qc.invalidateQueries() })
  const simMut  = useMutation({
    mutationFn: (id: number) => simulateDisaster(1, id),
    onSuccess: (res) => setDisasterResult(res.data),
  })

  // Find a snapshot for disaster demo
  const snapshot = history.find((b: any) => b.backup_type === 'SNAPSHOT')

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-white">Backup & Recovery</h1>
        <p className="text-slate-400 text-sm">Module 5 — Full · Differential · Incremental · Snapshots · AWS S3 replication</p>
      </div>

      {/* SLA Overview */}
      {sla && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {[
            { label: 'SLA Compliance', value: `${sla.backup_sla_pct}%`, ok: sla.backup_sla_pct >= 90 },
            { label: 'Total Backups', value: sla.total_backups },
            { label: 'RPO Target', value: `${sla.rpo_target_minutes} min` },
            { label: 'RTO Target', value: `${sla.rto_target_minutes} min` },
          ].map(({ label, value, ok }) => (
            <div key={label} className="card text-center">
              <p className="text-xs text-slate-400">{label}</p>
              <p className={`text-xl font-bold ${ok === false ? 'text-red-400' : ok ? 'text-emerald-400' : 'text-white'}`}>{value}</p>
            </div>
          ))}
        </div>
      )}

      {/* Actions */}
      <div className="card">
        <h2 className="text-sm font-semibold text-slate-300 mb-4">Backup Operations</h2>
        <div className="flex flex-wrap gap-2">
          <button onClick={() => runMut.mutate({ type: 'FULL' })} className="flex items-center gap-2 bg-indigo-600/20 text-indigo-400 border border-indigo-500/30 hover:bg-indigo-600/30 text-sm px-3 py-2 rounded-lg">
            <Play size={12} /> FULL Backup
          </button>
          <button onClick={() => runMut.mutate({ type: 'DIFF', parent: history.find((b:any) => b.backup_type==='FULL')?.id })} className="flex items-center gap-2 bg-amber-500/10 text-amber-400 border border-amber-500/20 hover:bg-amber-500/20 text-sm px-3 py-2 rounded-lg">
            <Play size={12} /> DIFF Backup
          </button>
          <button onClick={() => runMut.mutate({ type: 'INC' })} className="flex items-center gap-2 bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 hover:bg-emerald-500/20 text-sm px-3 py-2 rounded-lg">
            <Play size={12} /> INC Backup
          </button>
          {['PRE_DEPLOY', 'PRE_TEST', 'PRE_IMPORT'].map(name => (
            <button key={name} onClick={() => snapMut.mutate(name)} className="flex items-center gap-2 bg-purple-500/10 text-purple-400 border border-purple-500/20 hover:bg-purple-500/20 text-sm px-3 py-2 rounded-lg">
              <Camera size={12} /> {name}
            </button>
          ))}
        </div>
        {runMut.isPending && <p className="text-xs text-indigo-400 mt-2 animate-pulse">Creating backup…</p>}
      </div>

      {/* Disaster simulation */}
      <div className="card border-red-500/20">
        <h2 className="text-sm font-semibold text-red-400 mb-3 flex items-center gap-2">
          <AlertTriangle size={14} /> Disaster Recovery Demo
        </h2>
        <p className="text-xs text-slate-400 mb-3">Simulates DROP TABLE and restores from the latest snapshot. Measures RPO and RTO.</p>
        <button
          onClick={() => snapshot && simMut.mutate(snapshot.id)}
          disabled={!snapshot || simMut.isPending}
          className="flex items-center gap-2 bg-red-500/10 text-red-400 border border-red-500/20 hover:bg-red-500/20 text-sm px-4 py-2 rounded-lg disabled:opacity-40"
        >
          <RotateCcw size={12} /> {simMut.isPending ? 'Restoring…' : 'Simulate Disaster & Restore'}
        </button>
        {!snapshot && <p className="text-xs text-slate-500 mt-1">Create a PRE_DEPLOY snapshot first.</p>}
        {disasterResult && (
          <div className="mt-3 bg-emerald-500/10 border border-emerald-500/20 rounded-lg p-3 text-xs space-y-1">
            <p className="flex items-center gap-1 text-emerald-400"><CheckCircle size={12} /> {disasterResult.message}</p>
            <p className="text-slate-400">Disaster: {disasterResult.disaster_simulated}</p>
            <p className="text-slate-400">Restore time: {disasterResult.elapsed_seconds}s · RTO met: {disasterResult.rto_met ? '✅ Yes' : '❌ No'}</p>
          </div>
        )}
      </div>

      {/* History */}
      <div className="card">
        <h2 className="text-sm font-semibold text-slate-300 mb-3">Backup History</h2>
        <div className="overflow-x-auto">
          <table className="w-full text-xs text-slate-300">
            <thead><tr className="border-b border-slate-700 text-slate-400">
              <th className="text-left pb-2 pr-3">Type</th>
              <th className="text-left pb-2 pr-3">File</th>
              <th className="text-left pb-2 pr-3">Size</th>
              <th className="text-left pb-2 pr-3">Duration</th>
              <th className="text-left pb-2 pr-3">S3</th>
              <th className="text-left pb-2 pr-3">SLA</th>
              <th className="text-left pb-2">Status</th>
            </tr></thead>
            <tbody>
              {history.slice(0, 20).map((b: any) => (
                <tr key={b.id} className="border-b border-slate-700/50 hover:bg-slate-700/20">
                  <td className={`py-2 pr-3 font-bold ${TYPE_COLORS[b.backup_type]}`}>{b.backup_type}</td>
                  <td className="py-2 pr-3 font-mono max-w-xs truncate">{b.file_name}</td>
                  <td className="py-2 pr-3">{b.file_size_mb.toFixed(3)} MB</td>
                  <td className="py-2 pr-3">{b.duration_secs.toFixed(2)}s</td>
                  <td className="py-2 pr-3 text-emerald-400">{b.s3_url ? '✅' : '—'}</td>
                  <td className="py-2 pr-3">{b.sla_met ? <span className="badge-healthy">Met</span> : <span className="badge-critical">Missed</span>}</td>
                  <td className="py-2"><span className={STATUS_BADGE[b.status]}>{b.status}</span></td>
                </tr>
              ))}
            </tbody>
          </table>
          {history.length === 0 && <p className="text-center text-slate-500 py-6">No backups yet. Run a backup above.</p>}
        </div>
      </div>
    </div>
  )
}
