import { NavLink, useNavigate } from 'react-router-dom'
import {
  LayoutDashboard, Database, Activity, Search,
  GitMerge, HardDrive, RefreshCw, Zap, Bell, Server, LogOut
} from 'lucide-react'

const navItems = [
  { to: '/dashboard',   icon: LayoutDashboard, label: 'Dashboard BI' },
  { to: '/connections', icon: Database,         label: 'Connections' },
  { to: '/metrics',     icon: Activity,         label: 'Health Metrics' },
  { to: '/queries',     icon: Search,           label: 'Slow Queries' },
  { to: '/concurrency', icon: GitMerge,         label: 'Concurrency' },
  { to: '/backup',      icon: HardDrive,        label: 'Backup & Recovery' },
  { to: '/replication', icon: RefreshCw,        label: 'Replication' },
  { to: '/cache',       icon: Zap,              label: 'Redis Cache' },
  { to: '/alerts',      icon: Bell,             label: 'Alert Engine' },
]

export default function Layout({ children }: { children: React.ReactNode }) {
  const navigate = useNavigate()
  const username = localStorage.getItem('username') || 'user'

  const handleLogout = () => {
    localStorage.removeItem('token')
    localStorage.removeItem('username')
    navigate('/login', { replace: true })
  }

  return (
    <div className="flex h-screen bg-slate-900 overflow-hidden">
      {/* Sidebar */}
      <aside className="w-64 bg-slate-900 border-r border-slate-700 flex flex-col">
        <div className="p-4 border-b border-slate-700">
          <div className="flex items-center gap-2">
            <Server className="text-indigo-400" size={22} />
            <div>
              <h1 className="text-sm font-bold text-white">DataOps Control</h1>
              <p className="text-xs text-slate-400">Center v1.0</p>
            </div>
          </div>
        </div>

        <nav className="flex-1 p-3 space-y-1 overflow-y-auto">
          {navItems.map(({ to, icon: Icon, label }) => (
            <NavLink
              key={to}
              to={to}
              className={({ isActive }) =>
                `flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-colors ${
                  isActive
                    ? 'bg-indigo-600/20 text-indigo-400 font-medium'
                    : 'text-slate-400 hover:bg-slate-800 hover:text-slate-200'
                }`
              }
            >
              <Icon size={16} />
              {label}
            </NavLink>
          ))}
        </nav>

        {/* User + Logout */}
        <div className="p-3 border-t border-slate-700 space-y-2">
          <div className="flex items-center gap-2 px-2">
            <div className="w-7 h-7 rounded-full bg-indigo-600/30 flex items-center justify-center text-indigo-400 text-xs font-bold uppercase">
              {username[0]}
            </div>
            <span className="text-xs text-slate-400 truncate">{username}</span>
          </div>
          <button
            onClick={handleLogout}
            className="w-full flex items-center gap-2 px-3 py-2 text-sm text-slate-400 hover:text-red-400 hover:bg-red-500/10 rounded-lg transition-colors"
          >
            <LogOut size={14} />
            Sign out
          </button>
        </div>
      </aside>

      {/* Main content */}
      <main className="flex-1 overflow-y-auto bg-slate-900">
        {children}
      </main>
    </div>
  )
}
