import { Routes, Route, Navigate } from 'react-router-dom'
import Layout from './components/dashboard/Layout'
import DashboardPage from './pages/DashboardPage'
import ConnectionsPage from './pages/ConnectionsPage'
import MetricsPage from './pages/MetricsPage'
import QueriesPage from './pages/QueriesPage'
import ConcurrencyPage from './pages/ConcurrencyPage'
import BackupPage from './pages/BackupPage'
import ReplicationPage from './pages/ReplicationPage'
import CachePage from './pages/CachePage'
import AlertsPage from './pages/AlertsPage'

export default function App() {
  return (
    <Layout>
      <Routes>
        <Route path="/" element={<Navigate to="/dashboard" replace />} />
        <Route path="/dashboard"    element={<DashboardPage />} />
        <Route path="/connections"  element={<ConnectionsPage />} />
        <Route path="/metrics"      element={<MetricsPage />} />
        <Route path="/queries"      element={<QueriesPage />} />
        <Route path="/concurrency"  element={<ConcurrencyPage />} />
        <Route path="/backup"       element={<BackupPage />} />
        <Route path="/replication"  element={<ReplicationPage />} />
        <Route path="/cache"        element={<CachePage />} />
        <Route path="/alerts"       element={<AlertsPage />} />
      </Routes>
    </Layout>
  )
}
