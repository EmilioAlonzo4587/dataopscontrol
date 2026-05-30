import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { getConnections, createConnection, updateConnection, deleteConnection, testConnection } from '../services/api'
import { Plus, Trash2, Play, Database, CheckCircle, XCircle, Clock, Lock, Pencil, X } from 'lucide-react'

const STATUS_COLORS: any = {
  ACTIVE:   'badge-healthy',
  INACTIVE: 'badge-warning',
  ERROR:    'badge-critical',
}

const EMPTY_FORM = {
  nombre: '', motor: 'PostgreSQL', host: 'localhost', port: '5432',
  database_name: '', user_name: '', password: '',
}

export default function ConnectionsPage() {
  const qc = useQueryClient()
  const [showForm, setShowForm] = useState(false)
  const [editingId, setEditingId] = useState<number | null>(null)
  const [form, setForm] = useState({ ...EMPTY_FORM })
  const [testResults, setTestResults] = useState<Record<number, any>>({})

  const { data: connections = [] } = useQuery({
    queryKey: ['connections'],
    queryFn: () => getConnections().then(r => r.data),
  })

  const invalidateDashboard = () => {
    qc.invalidateQueries({ queryKey: ['connections'] })
    qc.invalidateQueries({ queryKey: ['overview'] })
    qc.invalidateQueries({ queryKey: ['availability'] })
    qc.invalidateQueries({ queryKey: ['sla'] })
  }

  const closeForm = () => {
    setShowForm(false)
    setEditingId(null)
    setForm({ ...EMPTY_FORM })
  }

  const createMut = useMutation({
    mutationFn: createConnection,
    onSuccess: () => { invalidateDashboard(); closeForm() },
  })

  const updateMut = useMutation({
    mutationFn: ({ id, data }: { id: number; data: any }) => updateConnection(id, data),
    onSuccess: () => { invalidateDashboard(); closeForm() },
  })

  const deleteMut = useMutation({
    mutationFn: deleteConnection,
    onSuccess: invalidateDashboard,
  })

  const handleEdit = (conn: any) => {
    setForm({
      nombre: conn.nombre,
      motor: conn.motor,
      host: conn.host,
      port: String(conn.port),
      database_name: conn.database_name,
      user_name: conn.user_name,
      password: '',
    })
    setEditingId(conn.id)
    setShowForm(true)
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  const handleSave = () => {
    const payload = { ...form, port: parseInt(String(form.port), 10) || 0 }
    if (editingId) {
      updateMut.mutate({ id: editingId, data: payload })
    } else {
      createMut.mutate(payload)
    }
  }

  const handleTest = async (id: number) => {
    const res = await testConnection(id)
    setTestResults(prev => ({ ...prev, [id]: res.data }))
  }

  const isPending = createMut.isPending || updateMut.isPending

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">Connection Registry</h1>
          <p className="text-slate-400 text-sm">Module 1 — Register and manage database engines</p>
        </div>
        <button
          onClick={() => { closeForm(); setShowForm(true) }}
          className="flex items-center gap-2 bg-cyan-600 hover:bg-cyan-700 text-white text-sm px-4 py-2 rounded-lg transition-colors"
        >
          <Plus size={16} /> New Connection
        </button>
      </div>

      {showForm && (
        <div className="card border-cyan-500/30">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-sm font-semibold text-slate-300 flex items-center gap-2">
              {editingId ? <><Pencil size={14} className="text-cyan-400" /> Edit Connection</> : <><Plus size={14} className="text-cyan-400" /> Register New Connection</>}
            </h2>
            <button onClick={closeForm} className="text-slate-500 hover:text-white">
              <X size={16} />
            </button>
          </div>
          <div className="grid grid-cols-2 gap-3">
            {[
              { key: 'nombre', label: 'Alias', type: 'text' },
              { key: 'host',   label: 'Host',  type: 'text' },
              { key: 'database_name', label: 'Database / SID', type: 'text' },
              { key: 'user_name', label: 'Username', type: 'text' },
              { key: 'password', label: editingId ? 'Password (dejar vacío para mantener)' : 'Password', type: 'password' },
              { key: 'port', label: 'Port', type: 'text' },
            ].map(({ key, label, type }) => (
              <div key={key}>
                <label className="text-xs text-slate-400 block mb-1">{label}</label>
                <input
                  type={type}
                  inputMode={key === 'port' ? 'numeric' : undefined}
                  pattern={key === 'port' ? '[0-9]*' : undefined}
                  value={(form as any)[key]}
                  placeholder={editingId && key === 'password' ? '••••••••' : ''}
                  onChange={e => setForm(p => ({ ...p, [key]: e.target.value }))}
                  className="w-full bg-slate-700 border border-slate-600 text-slate-200 text-sm rounded-lg px-3 py-2 focus:outline-none focus:ring-1 focus:ring-cyan-500"
                />
              </div>
            ))}
            <div>
              <label className="text-xs text-slate-400 block mb-1">Engine</label>
              <select
                value={form.motor}
                onChange={e => setForm(p => ({ ...p, motor: e.target.value }))}
                className="w-full bg-slate-700 border border-slate-600 text-slate-200 text-sm rounded-lg px-3 py-2"
              >
                <option>PostgreSQL</option>
                <option>SQL Server</option>
                <option>Oracle</option>
              </select>
            </div>
          </div>
          <div className="flex gap-2 mt-4">
            <button
              onClick={handleSave}
              disabled={isPending}
              className="bg-cyan-600 hover:bg-cyan-700 disabled:opacity-50 text-white text-sm px-4 py-2 rounded-lg"
            >
              {isPending ? 'Guardando…' : editingId ? 'Guardar cambios' : 'Save & Test'}
            </button>
            <button onClick={closeForm} className="text-slate-400 hover:text-white text-sm px-4 py-2">Cancel</button>
          </div>
          <p className="flex items-center gap-1.5 text-xs text-slate-500 mt-2">
            <Lock size={10} className="shrink-0" />
            Credentials are encrypted before storage — never stored as plain text
          </p>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {connections.map((conn: any) => (
          <div key={conn.id} className={`card transition-all ${editingId === conn.id ? 'ring-1 ring-cyan-500/40' : ''}`}>
            <div className="flex items-start justify-between">
              <div className="flex items-center gap-3">
                <Database className="text-cyan-400" size={18} />
                <div>
                  <h3 className="font-semibold text-white text-sm">{conn.nombre}</h3>
                  <p className="text-xs text-slate-400">{conn.motor} · {conn.host}:{conn.port}/{conn.database_name}</p>
                </div>
              </div>
              <span className={STATUS_COLORS[conn.status] || 'badge-warning'}>{conn.status}</span>
            </div>

            <div className="flex items-center gap-2 mt-3">
              <button
                onClick={() => handleTest(conn.id)}
                className="flex items-center gap-1 text-xs bg-slate-700 hover:bg-slate-600 text-slate-300 px-3 py-1.5 rounded-lg"
              >
                <Play size={12} /> Test
              </button>
              <button
                onClick={() => handleEdit(conn)}
                className="flex items-center gap-1 text-xs bg-cyan-500/10 hover:bg-cyan-500/20 text-cyan-400 px-3 py-1.5 rounded-lg"
              >
                <Pencil size={12} /> Edit
              </button>
              <button
                onClick={() => deleteMut.mutate(conn.id)}
                className="flex items-center gap-1 text-xs bg-red-500/10 hover:bg-red-500/20 text-red-400 px-3 py-1.5 rounded-lg"
              >
                <Trash2 size={12} /> Delete
              </button>
            </div>

            {testResults[conn.id] && (
              <div className={`mt-2 text-xs flex items-center gap-1 ${testResults[conn.id].success ? 'text-emerald-400' : 'text-red-400'}`}>
                {testResults[conn.id].success ? <CheckCircle size={12} /> : <XCircle size={12} />}
                {testResults[conn.id].message}
              </div>
            )}

            <p className="text-xs text-slate-500 mt-2">
              <Clock size={10} className="inline mr-1" />
              Last checked: {conn.last_checked ? new Date(conn.last_checked).toLocaleString() : 'Never'}
            </p>
          </div>
        ))}

        {connections.length === 0 && (
          <div className="card col-span-2 text-center py-12 text-slate-500">
            <Database size={32} className="mx-auto mb-3 opacity-30" />
            <p>No connections registered yet.</p>
          </div>
        )}
      </div>
    </div>
  )
}
