import { useState } from 'react'
import { useQuery, useMutation } from '@tanstack/react-query'
import { getReplicationStatus, getCurrentLag, getCapAnalysis, simulateReplicationScenario } from '../services/api'
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, ReferenceLine } from 'recharts'
import { RefreshCw, Play, CheckCircle, AlertTriangle, XCircle, ChevronDown, ChevronUp, Activity } from 'lucide-react'

const LAG_CONFIG = [
  { id: 'normal', label: 'Carga Normal',  writes: 'Sin escrituras extra', target: '≤ 2s',  color: 'emerald', icon: CheckCircle },
  { id: 'medium', label: 'Carga Media',   writes: '10,000 filas',         target: '~5s',   color: 'amber',   icon: AlertTriangle },
  { id: 'high',   label: 'Carga Alta',    writes: '100,000 filas',        target: '~20s',  color: 'red',     icon: XCircle },
]

function LagBadge({ lag, status }: { lag: number; status: string }) {
  const color = status === 'Healthy' ? 'text-emerald-400' : status === 'Warning' ? 'text-amber-400' : 'text-red-400'
  const bg    = status === 'Healthy' ? 'bg-emerald-500/10 border-emerald-500/30' : status === 'Warning' ? 'bg-amber-500/10 border-amber-500/30' : 'bg-red-500/10 border-red-500/30'
  return (
    <div className={`rounded-xl border px-4 py-3 text-center ${bg}`}>
      <p className={`text-3xl font-bold font-mono ${color}`}>{lag.toFixed(2)}s</p>
      <p className={`text-xs mt-1 ${color}`}>{status === 'Healthy' ? 'Aceptable' : status === 'Warning' ? 'Advertencia' : 'Crítico'}</p>
    </div>
  )
}

export default function ReplicationPage() {
  const [showCap, setShowCap] = useState(true)
  const [scenarioResults, setScenarioResults] = useState<Record<string, any>>({})

  const { data: status = [], refetch: refetchStatus } = useQuery({
    queryKey: ['replication'],
    queryFn: () => getReplicationStatus().then(r => r.data),
    refetchInterval: 15000,
  })

  const { data: currentLag, refetch: refetchLag } = useQuery({
    queryKey: ['current-lag'],
    queryFn: () => getCurrentLag().then(r => r.data),
    refetchInterval: 10000,
  })

  const { data: cap } = useQuery({ queryKey: ['cap'], queryFn: () => getCapAnalysis().then(r => r.data) })

  const simulateMut = useMutation({
    mutationFn: (scenario: string) => simulateReplicationScenario(scenario).then(r => r.data),
    onSuccess: (data) => {
      setScenarioResults(prev => ({ ...prev, [data.scenario]: data }))
      refetchStatus()
      refetchLag()
    },
  })

  const chartData = (status as any[])
    .slice(0, 30)
    .reverse()
    .map((s: any) => ({
      lag: s.lag_seconds,
      time: new Date(s.captured_at).toLocaleTimeString(),
    }))

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">Replication Dashboard</h1>
          <p className="text-slate-400 text-sm">Module 6 — Primary-Replica streaming · Lag en tiempo real · Análisis CAP</p>
        </div>
        <button onClick={() => { refetchStatus(); refetchLag() }}
          className="text-slate-400 hover:text-white p-2 rounded-lg hover:bg-slate-700">
          <RefreshCw size={14} />
        </button>
      </div>

      {/* Live lag indicator */}
      {currentLag && (
        <div className="grid grid-cols-3 gap-4">
          <LagBadge lag={currentLag.lag_seconds} status={currentLag.lag_status} />
          <div className="col-span-2 card flex items-center gap-4">
            <Activity size={18} className="text-indigo-400 shrink-0" />
            <div>
              <p className="text-xs text-slate-400 mb-0.5">Fuente de medición</p>
              <p className="text-sm text-slate-200 font-mono">replica → <code className="text-indigo-300">pg_last_xact_replay_timestamp()</code></p>
              <p className="text-xs text-slate-500 mt-1">
                Primario: <span className="text-slate-300">postgres_primary:5432</span>
                {' · '}Réplica: <span className="text-slate-300">postgres_replica:5432</span>
                {' · '}Modo: <span className="text-emerald-400">async streaming WAL</span>
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Lag over time chart */}
      <div className="card">
        <h2 className="text-sm font-semibold text-slate-300 mb-4 flex items-center gap-2">
          <RefreshCw size={14} /> Lag de Replicación en Tiempo Real
        </h2>
        <ResponsiveContainer width="100%" height={180}>
          <LineChart data={chartData} margin={{ top: 5, right: 10, left: 0, bottom: 0 }}>
            <XAxis dataKey="time" tick={{ fontSize: 9, fill: '#94a3b8' }} interval="preserveStartEnd" />
            <YAxis tick={{ fontSize: 10, fill: '#94a3b8' }} unit="s" />
            <Tooltip contentStyle={{ background: '#1e293b', border: 'none', borderRadius: 8, fontSize: 12 }}
              formatter={(v: any) => [`${Number(v).toFixed(2)}s`, 'Lag']} />
            <ReferenceLine y={2}  stroke="#10b981" strokeDasharray="4 2" label={{ value: 'Normal 2s', fill: '#10b981', fontSize: 10 }} />
            <ReferenceLine y={5}  stroke="#f59e0b" strokeDasharray="4 2" label={{ value: 'Medio 5s',  fill: '#f59e0b', fontSize: 10 }} />
            <ReferenceLine y={20} stroke="#ef4444" strokeDasharray="4 2" label={{ value: 'Alto 20s',  fill: '#ef4444', fontSize: 10 }} />
            <Line type="monotone" dataKey="lag" stroke="#6366f1" strokeWidth={2} dot={false} name="Lag (s)" />
          </LineChart>
        </ResponsiveContainer>
      </div>

      {/* Scenario simulation */}
      <div className="card">
        <h2 className="text-sm font-semibold text-slate-300 mb-1">Simulación de Escenarios de Carga</h2>
        <p className="text-xs text-slate-500 mb-4">
          Genera escrituras masivas en el primario y mide el lag resultante en la réplica.
          Las líneas de referencia en el gráfico muestran los umbrales requeridos.
        </p>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {LAG_CONFIG.map(cfg => {
            const result = scenarioResults[cfg.id]
            const isRunning = simulateMut.isPending && simulateMut.variables === cfg.id
            const Icon = cfg.icon
            return (
              <div key={cfg.id} className={`border rounded-xl p-4 space-y-3
                ${cfg.color === 'emerald' ? 'border-emerald-500/20 bg-emerald-500/5' :
                  cfg.color === 'amber'   ? 'border-amber-500/20 bg-amber-500/5' :
                                            'border-red-500/20 bg-red-500/5'}`}>
                <div className="flex items-center gap-2">
                  <Icon size={14} className={`text-${cfg.color}-400`} />
                  <p className={`text-sm font-semibold text-${cfg.color}-300`}>{cfg.label}</p>
                </div>
                <div className="text-xs text-slate-400 space-y-1">
                  <p>Escrituras: <span className="text-slate-200">{cfg.writes}</span></p>
                  <p>Lag esperado: <span className={`font-bold text-${cfg.color}-400`}>{cfg.target}</span></p>
                </div>
                {result && (
                  <div className="bg-slate-800/60 rounded-lg p-2 text-xs space-y-1">
                    <div className="flex justify-between">
                      <span className="text-slate-400">Antes:</span>
                      <span className="text-slate-200 font-mono">{result.lag_before_s}s</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-slate-400">Después:</span>
                      <span className={`font-mono font-bold text-${cfg.color}-400`}>{result.lag_after_s}s</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-slate-400">Estado:</span>
                      <span className={`text-${cfg.color}-400`}>{result.lag_status}</span>
                    </div>
                    {result.rows_written > 0 && (
                      <div className="flex justify-between">
                        <span className="text-slate-400">Filas escritas:</span>
                        <span className="text-slate-200">{result.rows_written.toLocaleString()}</span>
                      </div>
                    )}
                  </div>
                )}
                <button onClick={() => simulateMut.mutate(cfg.id)} disabled={simulateMut.isPending}
                  className={`w-full flex items-center justify-center gap-2 text-xs py-2 rounded-lg font-medium
                    disabled:opacity-50 transition-colors
                    ${cfg.color === 'emerald' ? 'bg-emerald-600 hover:bg-emerald-700 text-white' :
                      cfg.color === 'amber'   ? 'bg-amber-600 hover:bg-amber-700 text-white' :
                                                'bg-red-600 hover:bg-red-700 text-white'}`}>
                  <Play size={11} className={isRunning ? 'animate-pulse' : ''} />
                  {isRunning ? 'Simulando…' : 'Ejecutar escenario'}
                </button>
              </div>
            )
          })}
        </div>
      </div>

      {/* CAP Theorem Analysis */}
      {cap && (
        <div className="card">
          <button onClick={() => setShowCap(p => !p)}
            className="w-full flex items-center justify-between text-left">
            <div>
              <h2 className="text-sm font-semibold text-slate-300">Análisis del Teorema CAP</h2>
              <p className="text-xs text-slate-500 mt-0.5">{cap.architecture}</p>
            </div>
            <div className="flex items-center gap-3">
              <span className="text-xs font-bold text-amber-400 bg-amber-500/10 border border-amber-500/30 px-3 py-1 rounded-full">
                {cap.cap_choice}
              </span>
              {showCap ? <ChevronUp size={14} className="text-slate-400" /> : <ChevronDown size={14} className="text-slate-400" />}
            </div>
          </button>

          {showCap && (
            <div className="mt-4 space-y-4">
              {/* Summary */}
              <div className="bg-indigo-500/10 border border-indigo-500/20 rounded-xl p-4">
                <p className="text-xs text-slate-300 leading-relaxed">{cap.summary}</p>
              </div>

              {/* C, A, P cards */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                {[
                  { key: 'consistency',       title: 'C — Consistencia',             icon: '🔒', data: cap.consistency },
                  { key: 'availability',      title: 'A — Disponibilidad',           icon: '🟢', data: cap.availability },
                  { key: 'partition_tolerance', title: 'P — Tolerancia a Particiones', icon: '🔀', data: cap.partition_tolerance },
                ].map(({ title, icon, data }) => (
                  <div key={title} className="bg-slate-700/40 border border-slate-600/40 rounded-xl p-4 space-y-2">
                    <p className="text-sm font-semibold text-slate-200">{icon} {title}</p>
                    <p className="text-xs text-indigo-300 font-medium">{data?.level}</p>
                    <p className="text-xs text-slate-400 leading-relaxed">{data?.description}</p>
                  </div>
                ))}
              </div>

              {/* Lag scenarios table */}
              <div>
                <p className="text-xs font-semibold text-slate-300 mb-2">Escenarios de Lag Medidos</p>
                <div className="grid grid-cols-3 gap-3">
                  {(cap.lag_scenarios || []).map((s: any) => (
                    <div key={s.scenario} className={`rounded-lg p-3 text-center border
                      ${s.color === 'green' ? 'bg-emerald-500/5 border-emerald-500/20' :
                        s.color === 'amber' ? 'bg-amber-500/5 border-amber-500/20' :
                                              'bg-red-500/5 border-red-500/20'}`}>
                      <p className="text-xs text-slate-400 mb-1">{s.scenario}</p>
                      <p className={`text-xl font-bold font-mono
                        ${s.color === 'green' ? 'text-emerald-400' : s.color === 'amber' ? 'text-amber-400' : 'text-red-400'}`}>
                        {s.lag_target}
                      </p>
                      <p className={`text-xs mt-1
                        ${s.color === 'green' ? 'text-emerald-400' : s.color === 'amber' ? 'text-amber-400' : 'text-red-400'}`}>
                        {s.status}
                      </p>
                      <p className="text-xs text-slate-500 mt-1">{s.writes}</p>
                    </div>
                  ))}
                </div>
              </div>

              {/* Design decisions */}
              <div>
                <p className="text-xs font-semibold text-slate-300 mb-2">Decisiones de Diseño</p>
                <div className="space-y-1.5">
                  {(cap.design_decisions || []).map((d: string, i: number) => (
                    <div key={i} className="flex items-start gap-2 text-xs text-slate-400">
                      <span className="text-indigo-400 mt-0.5 shrink-0">▸</span>
                      <span className="leading-relaxed">{d}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
