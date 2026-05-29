import { useState, useEffect } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { getConnections, getBackupHistory, runBackup, restoreBackup, createSnapshot, getSlaReport, simulateDisaster } from '../services/api'
import { HardDrive, Play, RotateCcw, Camera, AlertTriangle, CheckCircle, Database, ChevronDown } from 'lucide-react'

const TYPE_COLORS: any = { FULL: 'text-indigo-400', DIFF: 'text-amber-400', INC: 'text-emerald-400', SNAPSHOT: 'text-purple-400' }
const STATUS_BADGE: any = { SUCCESS: 'badge-healthy', FAILED: 'badge-critical', RUNNING: 'badge-warning' }
const ENGINE_BADGE: any = {
  PostgreSQL: 'bg-blue-500/10 text-blue-400 border-blue-500/20',
  'SQL Server': 'bg-red-500/10 text-red-400 border-red-500/20',
  Oracle: 'bg-orange-500/10 text-orange-400 border-orange-500/20',
}

export default function BackupPage() {
  const qc = useQueryClient()
  const [selectedDbId, setSelectedDbId] = useState<number | null>(null)
  const [disasterResult, setDisasterResult] = useState<any>(null)

  const { data: connections = [] } = useQuery({
    queryKey: ['connections'],
    queryFn: () => getConnections().then(r => r.data),
  })

  // Auto-select first connection when list loads
  useEffect(() => {
    if (connections.length > 0 && selectedDbId === null) {
      setSelectedDbId(connections[0].id)
    }
  }, [connections, selectedDbId])

  const selectedConn = connections.find((c: any) => c.id === selectedDbId)

  const { data: history = [] } = useQuery({
    queryKey: ['backup-history', selectedDbId],
    queryFn: () => getBackupHistory(selectedDbId ?? undefined).then(r => r.data),
    enabled: selectedDbId !== null,
  })

  const { data: sla } = useQuery({
    queryKey: ['sla'],
    queryFn: () => getSlaReport().then(r => r.data),
  })

  const runMut = useMutation({
    mutationFn: ({ type, parent }: any) => runBackup(selectedDbId!, type, parent),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['backup-history'] }),
  })
  const snapMut = useMutation({
    mutationFn: (name: string) => createSnapshot(selectedDbId!, name),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['backup-history'] }),
  })
  const simMut = useMutation({
    mutationFn: (id: number) => simulateDisaster(selectedDbId!, id),
    onSuccess: (res) => setDisasterResult(res.data),
  })

  const snapshot = history.find((b: any) => b.backup_type === 'SNAPSHOT')

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">Backup & Recovery</h1>
          <p className="text-slate-400 text-sm">Module 5 — Full · Differential · Incremental · Snapshots · AWS S3 replication</p>
        </div>
      </div>

      {/* DB Selector */}
      <div className="card">
        <div className="flex items-center gap-3 mb-2">
          <Database size={16} className="text-indigo-400" />
          <h2 className="text-sm font-semibold text-slate-300">Base de datos objetivo</h2>
        </div>
        <p className="text-xs text-slate-500 mb-3">
          Selecciona el motor sobre el que se ejecutarán los backups. Cada motor mantiene su propio historial.
        </p>
        <div className="flex flex-wrap gap-2">
          {connections.map((c: any) => (
            <button
              key={c.id}
              onClick={() => { setSelectedDbId(c.id); setDisasterResult(null) }}
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
          {connections.length === 0 && (
            <p className="text-slate-500 text-xs">No hay conexiones registradas. Registra una en el módulo Connections.</p>
          )}
        </div>
      </div>

      {selectedConn && (
        <>
          {/* SLA Overview */}
          {sla && (
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              {[
                { label: 'SLA Compliance', value: `${sla.sla_compliance_pct ?? sla.backup_sla_pct}%`, ok: (sla.sla_compliance_pct ?? sla.backup_sla_pct) >= 90 },
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
            <div className="flex items-center gap-2 mb-4">
              <h2 className="text-sm font-semibold text-slate-300">Backup Operations</h2>
              <span className={`text-xs px-2 py-0.5 rounded border ${ENGINE_BADGE[selectedConn.motor] || ''}`}>
                {selectedConn.motor} — {selectedConn.nombre}
              </span>
            </div>
            <div className="flex flex-wrap gap-2">
              <button
                onClick={() => runMut.mutate({ type: 'FULL' })}
                disabled={runMut.isPending}
                className="flex items-center gap-2 bg-indigo-600/20 text-indigo-400 border border-indigo-500/30 hover:bg-indigo-600/30 disabled:opacity-50 text-sm px-3 py-2 rounded-lg"
              >
                <Play size={12} /> FULL Backup
              </button>
              <button
                onClick={() => runMut.mutate({ type: 'DIFF', parent: history.find((b: any) => b.backup_type === 'FULL')?.id })}
                disabled={runMut.isPending}
                className="flex items-center gap-2 bg-amber-500/10 text-amber-400 border border-amber-500/20 hover:bg-amber-500/20 disabled:opacity-50 text-sm px-3 py-2 rounded-lg"
              >
                <Play size={12} /> DIFF Backup
              </button>
              <button
                onClick={() => runMut.mutate({ type: 'INC' })}
                disabled={runMut.isPending}
                className="flex items-center gap-2 bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 hover:bg-emerald-500/20 disabled:opacity-50 text-sm px-3 py-2 rounded-lg"
              >
                <Play size={12} /> INC Backup
              </button>
              {['PRE_DEPLOY', 'PRE_TEST', 'PRE_IMPORT'].map(name => (
                <button
                  key={name}
                  onClick={() => snapMut.mutate(name)}
                  disabled={snapMut.isPending}
                  className="flex items-center gap-2 bg-purple-500/10 text-purple-400 border border-purple-500/20 hover:bg-purple-500/20 disabled:opacity-50 text-sm px-3 py-2 rounded-lg"
                >
                  <Camera size={12} /> {name}
                </button>
              ))}
            </div>
            {(runMut.isPending || snapMut.isPending) && (
              <p className="text-xs text-indigo-400 mt-2 animate-pulse">Creando backup en {selectedConn.nombre}…</p>
            )}
          </div>

          {/* Disaster simulation */}
          <div className="card border-red-500/20">
            <h2 className="text-sm font-semibold text-red-400 mb-3 flex items-center gap-2">
              <AlertTriangle size={14} /> Disaster Recovery Demo
            </h2>
            <p className="text-xs text-slate-400 mb-3">
              Simula DROP TABLE y restaura desde el último snapshot de <span className="text-slate-200">{selectedConn.nombre}</span>. Mide RPO y RTO.
            </p>
            <button
              onClick={() => snapshot && simMut.mutate(snapshot.id)}
              disabled={!snapshot || simMut.isPending}
              className="flex items-center gap-2 bg-red-500/10 text-red-400 border border-red-500/20 hover:bg-red-500/20 text-sm px-4 py-2 rounded-lg disabled:opacity-40"
            >
              <RotateCcw size={12} /> {simMut.isPending ? 'Restaurando…' : 'Simulate Disaster & Restore'}
            </button>
            {!snapshot && <p className="text-xs text-slate-500 mt-1">Crea un snapshot PRE_DEPLOY primero.</p>}
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
            <h2 className="text-sm font-semibold text-slate-300 mb-3">
              Backup History — <span className="text-slate-400 font-normal">{selectedConn.nombre}</span>
            </h2>
            <div className="overflow-x-auto">
              <table className="w-full text-xs text-slate-300">
                <thead>
                  <tr className="border-b border-slate-700 text-slate-400">
                    <th className="text-left pb-2 pr-3">Type</th>
                    <th className="text-left pb-2 pr-3">File</th>
                    <th className="text-left pb-2 pr-3">Size</th>
                    <th className="text-left pb-2 pr-3">Duration</th>
                    <th className="text-left pb-2 pr-3">S3</th>
                    <th className="text-left pb-2 pr-3">SLA</th>
                    <th className="text-left pb-2">Status</th>
                  </tr>
                </thead>
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
              {history.length === 0 && (
                <p className="text-center text-slate-500 py-6">No hay backups para {selectedConn.nombre}. Ejecuta un backup arriba.</p>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  )
}
