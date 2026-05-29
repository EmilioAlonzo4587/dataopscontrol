import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { getAlertRules, createAlertRule, updateAlertRule, deleteAlertRule, getAlertLog, resolveAlert, resolveAllAlerts, forceEvaluateAlerts, sendTestEmail, getAlertSummary } from '../services/api'
import { Bell, Plus, Trash2, CheckCircle, Pencil, X, RefreshCw, Mail, ShieldOff } from 'lucide-react'

const SEV_BADGE: any = { Warning: 'badge-warning', Critical: 'badge-critical', Info: 'text-blue-400' }
const STATUS_BADGE: any = { OPEN: 'badge-critical', RESOLVED: 'badge-healthy', IGNORED: 'text-slate-400' }

const EMPTY_FORM = { name: '', metric: 'cpu', operator: '>', threshold: 85, severity: 'Warning', action: 'email', condition: 'cpu > 85', enabled: true }

export default function AlertsPage() {
  const qc = useQueryClient()
  const [showForm, setShowForm] = useState(false)
  const [editingId, setEditingId] = useState<number | null>(null)
  const [form, setForm] = useState<any>(EMPTY_FORM)

  const { data: rules = [] } = useQuery({ queryKey: ['alert-rules'], queryFn: () => getAlertRules().then(r => r.data) })
  const { data: logs = [] } = useQuery({ queryKey: ['alert-log'], queryFn: () => getAlertLog().then(r => r.data), refetchInterval: 15000 })
  const { data: summary = [] } = useQuery({ queryKey: ['alert-summary'], queryFn: () => getAlertSummary().then(r => r.data) })

  const createMut = useMutation({
    mutationFn: createAlertRule,
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['alert-rules'] }); closeForm() }
  })
  const updateMut = useMutation({
    mutationFn: ({ id, data }: { id: number; data: any }) => updateAlertRule(id, data),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['alert-rules'] }); closeForm() }
  })
  const deleteMut = useMutation({ mutationFn: deleteAlertRule, onSuccess: () => qc.invalidateQueries({ queryKey: ['alert-rules'] }) })
  const resolveMut = useMutation({ mutationFn: resolveAlert, onSuccess: () => qc.invalidateQueries({ queryKey: ['alert-log'] }) })
  const resolveAllMut = useMutation({ mutationFn: resolveAllAlerts, onSuccess: () => qc.invalidateQueries({ queryKey: ['alert-log'] }) })
  const evaluateMut = useMutation({ mutationFn: forceEvaluateAlerts, onSuccess: () => { qc.invalidateQueries({ queryKey: ['alert-log'] }); qc.invalidateQueries({ queryKey: ['alert-summary'] }) } })
  const testEmailMut = useMutation({ mutationFn: sendTestEmail })

  const criticalOpen = (logs as any[]).filter((l: any) => l.severity === 'Critical' && l.status === 'OPEN').length
  const totalOpen = (logs as any[]).filter((l: any) => l.status === 'OPEN').length

  function openCreate() {
    setEditingId(null)
    setForm(EMPTY_FORM)
    setShowForm(true)
  }

  function openEdit(rule: any) {
    setEditingId(rule.id)
    setForm({ name: rule.name, metric: rule.metric, operator: rule.operator, threshold: rule.threshold, severity: rule.severity, action: rule.action, condition: rule.condition, enabled: rule.enabled })
    setShowForm(true)
  }

  function closeForm() {
    setShowForm(false)
    setEditingId(null)
    setForm(EMPTY_FORM)
  }

  function handleSubmit() {
    if (editingId !== null) {
      updateMut.mutate({ id: editingId, data: form })
    } else {
      createMut.mutate(form)
    }
  }

  const isPending = createMut.isPending || updateMut.isPending

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">Alert Engine</h1>
          <p className="text-slate-400 text-sm">Module 9 — Configurable rules · Email notifications · ALERT_LOG with full audit trail</p>
        </div>
        <div className="flex items-center gap-2 flex-wrap justify-end">
          {criticalOpen > 0 && (
            <span className="flex items-center gap-1 text-xs bg-red-500/20 text-red-400 px-3 py-1.5 rounded-full animate-pulse">
              <Bell size={12} /> {criticalOpen} Critical Open
            </span>
          )}
          <button
            onClick={() => testEmailMut.mutate()}
            disabled={testEmailMut.isPending}
            title="Enviar email de prueba SMTP"
            className="flex items-center gap-2 bg-sky-500/10 text-sky-400 border border-sky-500/20 hover:bg-sky-500/20 text-sm px-3 py-2 rounded-lg disabled:opacity-40"
          >
            <Mail size={13} /> {testEmailMut.isPending ? '…' : 'Test Email'}
          </button>
          <button
            onClick={() => resolveAllMut.mutate()}
            disabled={resolveAllMut.isPending || totalOpen === 0}
            title="Resolver todas las alertas OPEN (permite re-disparar)"
            className="flex items-center gap-2 bg-amber-500/10 text-amber-400 border border-amber-500/20 hover:bg-amber-500/20 text-sm px-3 py-2 rounded-lg disabled:opacity-40"
          >
            <ShieldOff size={13} /> Resolver todas ({totalOpen})
          </button>
          <button
            onClick={() => evaluateMut.mutate()}
            disabled={evaluateMut.isPending}
            title="Forzar evaluación de alertas ahora"
            className="flex items-center gap-2 bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 hover:bg-emerald-500/20 text-sm px-3 py-2 rounded-lg disabled:opacity-40"
          >
            <RefreshCw size={13} className={evaluateMut.isPending ? 'animate-spin' : ''} /> Evaluar ahora
          </button>
          <button onClick={openCreate} className="flex items-center gap-2 bg-indigo-600 hover:bg-indigo-700 text-white text-sm px-4 py-2 rounded-lg">
            <Plus size={14} /> New Rule
          </button>
        </div>
      </div>

      {/* Summary badges */}
      {summary.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {(summary as any[]).map((s: any) => (
            <span key={`${s.severity}-${s.status}`} className={`text-xs px-3 py-1 rounded-full border ${s.severity === 'Critical' ? 'border-red-500/30 bg-red-500/10 text-red-400' : 'border-amber-500/30 bg-amber-500/10 text-amber-400'}`}>
              {s.severity} / {s.status}: {s.count}
            </span>
          ))}
        </div>
      )}

      {/* Create / Edit Form */}
      {showForm && (
        <div className="card">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-sm font-semibold text-slate-300">
              {editingId !== null ? 'Edit Alert Rule' : 'Create Alert Rule (no redeployment needed)'}
            </h2>
            <button onClick={closeForm} className="text-slate-400 hover:text-white"><X size={14} /></button>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
            {[
              { k: 'name', l: 'Rule Name', t: 'text' },
              { k: 'condition', l: 'Condition (description)', t: 'text' },
            ].map(({ k, l, t }) => (
              <div key={k}>
                <label className="text-xs text-slate-400 block mb-1">{l}</label>
                <input type={t} value={form[k]} onChange={e => setForm((p: any) => ({ ...p, [k]: e.target.value }))}
                  className="w-full bg-slate-700 border border-slate-600 text-slate-200 text-sm rounded-lg px-3 py-2" />
              </div>
            ))}
            <div>
              <label className="text-xs text-slate-400 block mb-1">Metric</label>
              <select value={form.metric} onChange={e => setForm((p: any) => ({ ...p, metric: e.target.value }))}
                className="w-full bg-slate-700 border border-slate-600 text-slate-200 text-sm rounded-lg px-3 py-2">
                {['cpu','memory','disk_usage','connections','locks','deadlocks'].map(m => <option key={m}>{m}</option>)}
              </select>
            </div>
            <div>
              <label className="text-xs text-slate-400 block mb-1">Operator</label>
              <select value={form.operator} onChange={e => setForm((p: any) => ({ ...p, operator: e.target.value }))}
                className="w-full bg-slate-700 border border-slate-600 text-slate-200 text-sm rounded-lg px-3 py-2">
                {['>','>=','<'].map(o => <option key={o}>{o}</option>)}
              </select>
            </div>
            <div>
              <label className="text-xs text-slate-400 block mb-1">Threshold</label>
              <input type="number" value={form.threshold} onChange={e => setForm((p: any) => ({ ...p, threshold: +e.target.value }))}
                className="w-full bg-slate-700 border border-slate-600 text-slate-200 text-sm rounded-lg px-3 py-2" />
            </div>
            <div>
              <label className="text-xs text-slate-400 block mb-1">Severity</label>
              <select value={form.severity} onChange={e => setForm((p: any) => ({ ...p, severity: e.target.value }))}
                className="w-full bg-slate-700 border border-slate-600 text-slate-200 text-sm rounded-lg px-3 py-2">
                <option>Warning</option><option>Critical</option><option>Info</option>
              </select>
            </div>
            <div>
              <label className="text-xs text-slate-400 block mb-1">Action</label>
              <select value={form.action} onChange={e => setForm((p: any) => ({ ...p, action: e.target.value }))}
                className="w-full bg-slate-700 border border-slate-600 text-slate-200 text-sm rounded-lg px-3 py-2">
                <option>email</option><option>dashboard</option><option>both</option>
              </select>
            </div>
            <div>
              <label className="text-xs text-slate-400 block mb-1">Enabled</label>
              <select value={form.enabled ? 'true' : 'false'} onChange={e => setForm((p: any) => ({ ...p, enabled: e.target.value === 'true' }))}
                className="w-full bg-slate-700 border border-slate-600 text-slate-200 text-sm rounded-lg px-3 py-2">
                <option value="true">Yes</option><option value="false">No</option>
              </select>
            </div>
          </div>
          <div className="flex gap-2 mt-4">
            <button onClick={handleSubmit} className="bg-indigo-600 hover:bg-indigo-700 text-white text-sm px-4 py-2 rounded-lg">
              {isPending ? 'Saving…' : editingId !== null ? 'Save Changes' : 'Create Rule'}
            </button>
            <button onClick={closeForm} className="text-slate-400 hover:text-white text-sm px-4 py-2">Cancel</button>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Rules */}
        <div className="card">
          <h2 className="text-sm font-semibold text-slate-300 mb-3">Alert Rules</h2>
          <div className="space-y-2">
            {(rules as any[]).map((r: any) => (
              <div key={r.id} className="flex items-center justify-between bg-slate-700/50 rounded-lg px-3 py-2 text-xs">
                <div>
                  <p className="text-slate-200 font-medium">{r.name}</p>
                  <p className="text-slate-400 font-mono">{r.metric} {r.operator} {r.threshold} → {r.action}</p>
                </div>
                <div className="flex items-center gap-2">
                  <span className={SEV_BADGE[r.severity]}>{r.severity}</span>
                  <span className={r.enabled ? 'badge-healthy' : 'badge-warning'}>{r.enabled ? 'ON' : 'OFF'}</span>
                  <button onClick={() => openEdit(r)} className="text-indigo-400 hover:text-indigo-300"><Pencil size={12} /></button>
                  <button onClick={() => deleteMut.mutate(r.id)} className="text-red-400 hover:text-red-300"><Trash2 size={12} /></button>
                </div>
              </div>
            ))}
            {rules.length === 0 && <p className="text-slate-500 text-xs text-center py-4">No rules yet.</p>}
          </div>
        </div>

        {/* Log */}
        <div className="card">
          <h2 className="text-sm font-semibold text-slate-300 mb-3 flex items-center gap-2">
            <Bell size={14} /> Alert Log ({totalOpen} open)
          </h2>
          <div className="space-y-2 max-h-80 overflow-y-auto">
            {(logs as any[]).slice(0, 20).map((log: any) => (
              <div key={log.id} className={`rounded-lg px-3 py-2 text-xs border ${log.severity === 'Critical' ? 'bg-red-500/5 border-red-500/20' : 'bg-amber-500/5 border-amber-500/20'}`}>
                <div className="flex items-start justify-between gap-2">
                  <div className="flex-1">
                    <p className="text-slate-200">{log.message}</p>
                    <p className="text-slate-500 mt-0.5">{new Date(log.created_at).toLocaleString()}</p>
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    <span className={SEV_BADGE[log.severity]}>{log.severity}</span>
                    <span className={STATUS_BADGE[log.status]}>{log.status}</span>
                    {log.status === 'OPEN' && (
                      <button onClick={() => resolveMut.mutate(log.id)} className="text-emerald-400 hover:text-emerald-300 ml-1">
                        <CheckCircle size={13} />
                      </button>
                    )}
                  </div>
                </div>
              </div>
            ))}
            {logs.length === 0 && <p className="text-slate-500 text-xs text-center py-6">No alerts triggered yet.</p>}
          </div>
        </div>
      </div>
    </div>
  )
}
