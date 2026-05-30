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
    <div className="flex h-screen bg-zinc-950 overflow-hidden">
      {/* Sidebar */}
      <aside className="w-60 bg-zinc-950/90 border-r border-zinc-800 flex flex-col">
        <div className="px-4 py-4 border-b border-zinc-800">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-cyan-600/20 border border-cyan-500/30 flex items-center justify-center">
              <Server className="text-cyan-400" size={16} />
            </div>
            <div>
              <h1 className="text-sm font-semibold text-white tracking-tight">DataOps Control</h1>
              <p className="text-[10px] text-slate-500 font-medium uppercase tracking-widest">By Green Arrow</p>
            </div>
          </div>
        </div>

        <nav className="flex-1 px-2 py-3 space-y-0.5 overflow-y-auto">
          {navItems.map(({ to, icon: Icon, label }) => (
            <NavLink
              key={to}
              to={to}
              className={({ isActive }) =>
                `flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-all duration-150 ${
                  isActive
                    ? 'bg-cyan-600/20 text-cyan-300 font-semibold'
                    : 'text-slate-500 hover:bg-zinc-800/60 hover:text-slate-200'
                }`
              }
            >
              {({ isActive }) => (
                <>
                  <Icon size={15} className={isActive ? 'text-cyan-400' : ''} />
                  <span className="tracking-tight">{label}</span>
                </>
              )}
            </NavLink>
          ))}
        </nav>

        {/* User + Logout */}
        <div className="px-2 py-3 border-t border-zinc-800 space-y-1">
          <div className="flex items-center gap-2 px-3 py-1.5">
            <div className="w-6 h-6 rounded-md bg-cyan-600/30 flex items-center justify-center text-cyan-300 text-[10px] font-bold uppercase">
              {username[0]}
            </div>
            <span className="text-xs text-slate-500 truncate font-medium">{username}</span>
          </div>
          <button
            onClick={handleLogout}
            className="w-full flex items-center gap-2 px-3 py-2 text-sm text-slate-500 hover:text-red-400 hover:bg-red-500/10 rounded-lg transition-colors"
          >
            <LogOut size={14} />
            <span className="tracking-tight">Sign out</span>
          </button>
        </div>
      </aside>

      {/* Main content */}
      <main className="flex-1 overflow-y-auto bg-zinc-950">
        {children}
      </main>
    </div>
  )
}
