import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { getConnections, createConnection, deleteConnection, testConnection } from '../services/api'
import { Plus, Trash2, Play, Database, CheckCircle, XCircle, Clock } from 'lucide-react'

const STATUS_COLORS: any = {
  ACTIVE:   'badge-healthy',
  INACTIVE: 'badge-warning',
  ERROR:    'badge-critical',
}

export default function ConnectionsPage() {
  const qc = useQueryClient()
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState({
    nombre: '', motor: 'PostgreSQL', host: 'localhost', port: 5432,
    database_name: '', user_name: '', password: '',
  })
  const [testResults, setTestResults] = useState<Record<number, any>>({})

  const { data: connections = [] } = useQuery({
    queryKey: ['connections'],
    queryFn: () => getConnections().then(r => r.data),
  })

  const createMut = useMutation({
    mutationFn: createConnection,
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['connections'] }); setShowForm(false) },
  })

  const deleteMut = useMutation({
    mutationFn: deleteConnection,
    onSuccess: () => qc.invalidateQueries({ queryKey: ['connections'] }),
  })

  const handleTest = async (id: number) => {
    const res = await testConnection(id)
    setTestResults(prev => ({ ...prev, [id]: res.data }))
  }

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">Connection Registry</h1>
          <p className="text-slate-400 text-sm">Module 1 — Register and manage database engines</p>
        </div>
        <button
          onClick={() => setShowForm(!showForm)}
          className="flex items-center gap-2 bg-indigo-600 hover:bg-indigo-700 text-white text-sm px-4 py-2 rounded-lg transition-colors"
        >
          <Plus size={16} /> New Connection
        </button>
      </div>

      {showForm && (
        <div className="card">
          <h2 className="text-sm font-semibold text-slate-300 mb-4">Register New Connection</h2>
          <div className="grid grid-cols-2 gap-3">
            {[
              { key: 'nombre', label: 'Alias', type: 'text' },
              { key: 'host',   label: 'Host',  type: 'text' },
              { key: 'database_name', label: 'Database', type: 'text' },
              { key: 'user_name', label: 'Username', type: 'text' },
              { key: 'password', label: 'Password', type: 'password' },
              { key: 'port', label: 'Port', type: 'number' },
            ].map(({ key, label, type }) => (
              <div key={key}>
                <label className="text-xs text-slate-400 block mb-1">{label}</label>
                <input
                  type={type}
                  value={(form as any)[key]}
                  onChange={e => setForm(p => ({ ...p, [key]: type === 'number' ? +e.target.value : e.target.value }))}
                  className="w-full bg-slate-700 border border-slate-600 text-slate-200 text-sm rounded-lg px-3 py-2 focus:outline-none focus:ring-1 focus:ring-indigo-500"
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
              onClick={() => createMut.mutate(form)}
              disabled={createMut.isPending}
              className="bg-indigo-600 hover:bg-indigo-700 text-white text-sm px-4 py-2 rounded-lg"
            >
              {createMut.isPending ? 'Saving…' : 'Save & Test'}
            </button>
            <button onClick={() => setShowForm(false)} className="text-slate-400 hover:text-white text-sm px-4 py-2">Cancel</button>
          </div>
          <p className="text-xs text-slate-500 mt-2">🔒 Credentials are encrypted before storage — never stored as plain text</p>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {connections.map((conn: any) => (
          <div key={conn.id} className="card">
            <div className="flex items-start justify-between">
              <div className="flex items-center gap-3">
                <Database className="text-indigo-400" size={18} />
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
