import axios from 'axios'

const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL_BACKEND || 'http://localhost:8000',
  timeout: 15000,
})
// Attach JWT token
api.interceptors.request.use((config) => {
  const token = localStorage.getItem('token')
  if (token) config.headers.Authorization = `Bearer ${token}`
  return config
})

// ─── Auth ─────────────────────────────────────────────────────
export const login = (username: string, password: string) =>
  api.post('/api/auth/login', new URLSearchParams({ username, password }))

export const register = (data: { username: string; email: string; password: string }) =>
  api.post('/api/auth/register', data)

// ─── Connections ──────────────────────────────────────────────
export const getConnections = () => api.get('/api/connections/')
export const createConnection = (data: any) => api.post('/api/connections/', data)
export const deleteConnection = (id: number) => api.delete(`/api/connections/${id}`)
export const testConnection = (id: number) => api.post(`/api/connections/${id}/test`)

// ─── Metrics ─────────────────────────────────────────────────
export const getLatestMetrics = () => api.get('/api/metrics/latest')
export const getMetricHistory = (dbId: number, limit = 60) =>
  api.get(`/api/metrics/${dbId}/history?limit=${limit}`)
export const getMetricsSummary = () => api.get('/api/metrics/summary/all')

// ─── Queries ─────────────────────────────────────────────────
export const getTopSlowQueries = (limit = 10) => api.get(`/api/queries/top-slow?limit=${limit}`)
export const getQueryStats = () => api.get('/api/queries/stats')
export const seedDemoQueries = () => api.post('/api/queries/seed-demo')

// ─── Query Optimizer (M3 before/after comparison) ────────────
export const getOptimizerScenarios = () => api.get('/api/queries/optimizer/scenarios')
export const runOptimizerScenario = (id: number) =>
  api.post(`/api/queries/optimizer/scenarios/${id}/run`, {}, { timeout: 60000 })

// ─── Transactions ─────────────────────────────────────────────
export const simulateConcurrency = (dbId: number, users = 100) =>
  api.post(`/api/transactions/simulate?db_id=${dbId}&num_users=${users}`)
export const getTxStats = () => api.get('/api/transactions/stats')
export const getRecentDeadlocks = () => api.get('/api/transactions/deadlocks/recent')

// ─── Backup ───────────────────────────────────────────────────
export const runBackup = (dbId: number, type: string, parentId?: number) =>
  api.post(`/api/backup/run?db_id=${dbId}&backup_type=${type}${parentId ? `&parent_id=${parentId}` : ''}`)
export const getBackupHistory = (dbId?: number) =>
  api.get(`/api/backup/history${dbId ? `?db_id=${dbId}` : ''}`)
export const restoreBackup = (backupId: number) => api.post(`/api/backup/restore/${backupId}`)
export const createSnapshot = (dbId: number, name: string) =>
  api.post(`/api/backup/snapshot?db_id=${dbId}&name=${name}`)
export const getSlaReport = () => api.get('/api/backup/sla-report')
export const simulateDisaster = (dbId: number, snapshotId: number) =>
  api.post(`/api/backup/simulate-disaster?db_id=${dbId}&snapshot_backup_id=${snapshotId}`)

// ─── Replication ──────────────────────────────────────────────
export const getReplicationStatus = () => api.get('/api/replication/status')
export const getCurrentLag = () => api.get('/api/replication/current-lag')
export const getCapAnalysis = () => api.get('/api/replication/cap-analysis')
export const simulateReplicationScenario = (scenario: string) =>
  api.post(`/api/replication/simulate/${scenario}`, {}, { timeout: 120000 })

// ─── Cache ────────────────────────────────────────────────────
export const getCacheStats = () => api.get('/api/cache/stats')
export const demoCachedQuery = () => api.get('/api/cache/demo-query')
export const getCacheHistory = () => api.get('/api/cache/metrics/history')
export const invalidateCache = (pattern: string) => api.delete(`/api/cache/invalidate/${pattern}`)

// ─── Alerts ───────────────────────────────────────────────────
export const getAlertRules = () => api.get('/api/alerts/rules')
export const createAlertRule = (data: any) => api.post('/api/alerts/rules', data)
export const updateAlertRule = (id: number, data: any) => api.put(`/api/alerts/rules/${id}`, data)
export const deleteAlertRule = (id: number) => api.delete(`/api/alerts/rules/${id}`)
export const getAlertLog = (severity?: string) =>
  api.get(`/api/alerts/log${severity ? `?severity=${severity}` : ''}`)
export const resolveAlert = (id: number) => api.post(`/api/alerts/log/${id}/resolve`)
export const getAlertSummary = () => api.get('/api/alerts/log/summary')

// ─── Dashboard ────────────────────────────────────────────────
export const getDashboardOverview = () => api.get('/api/dashboard/overview')
export const getAvailabilityByDb = () => api.get('/api/dashboard/availability')
export const getActivityHeatmap = () => api.get('/api/dashboard/heatmap')

export default api
