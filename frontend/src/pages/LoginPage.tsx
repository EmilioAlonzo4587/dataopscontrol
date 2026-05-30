import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { login, register } from '../services/api'
import { Server, Eye, EyeOff, Loader2, AlertCircle, ChevronRight } from 'lucide-react'

type Mode = 'login' | 'register'

export default function LoginPage() {
  const navigate = useNavigate()
  const [mode, setMode] = useState<Mode>('login')
  const [form, setForm] = useState({ username: '', email: '', password: '' })
  const [showPass, setShowPass] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [mounted, setMounted] = useState(false)

  // Redirect if already authenticated
  useEffect(() => {
    if (localStorage.getItem('token')) navigate('/dashboard', { replace: true })
    setTimeout(() => setMounted(true), 50)
  }, [])

  const handleField = (k: string) => (e: React.ChangeEvent<HTMLInputElement>) => {
    setForm(p => ({ ...p, [k]: e.target.value }))
    setError('')
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!form.username || !form.password) { setError('Username and password are required.'); return }
    if (mode === 'register' && !form.email) { setError('Email is required for registration.'); return }

    setLoading(true)
    setError('')

    try {
      if (mode === 'login') {
        const res = await login(form.username, form.password)
        localStorage.setItem('token', res.data.access_token)
        localStorage.setItem('username', form.username)
        navigate('/dashboard', { replace: true })
      } else {
        await register({ username: form.username, email: form.email, password: form.password })
        const res = await login(form.username, form.password)
        localStorage.setItem('token', res.data.access_token)
        localStorage.setItem('username', form.username)
        navigate('/dashboard', { replace: true })
      }
    } catch (err: any) {
      const detail = err?.response?.data?.detail
      if (typeof detail === 'string') setError(detail)
      else if (Array.isArray(detail)) setError(detail[0]?.msg || 'Validation error')
      else setError('Connection error. Check that the backend is running.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-zinc-950 flex items-center justify-center p-4 relative overflow-hidden">
      <div className="absolute inset-0 opacity-[0.04]"
        style={{
          backgroundImage: 'linear-gradient(#06b6d4 1px, transparent 1px), linear-gradient(90deg, #06b6d4 1px, transparent 1px)',
          backgroundSize: '48px 48px',
        }}
      />
      <div className="absolute top-1/4 left-1/3 w-72 h-72 bg-cyan-600/10 rounded-full blur-3xl pointer-events-none" />
      <div className="absolute bottom-1/4 right-1/3 w-56 h-56 bg-cyan-500/5 rounded-full blur-3xl pointer-events-none" />

      <div
        className="relative w-full max-w-sm z-10 transition-all duration-500"
        style={{ opacity: mounted ? 1 : 0, transform: mounted ? 'translateY(0)' : 'translateY(16px)' }}
      >
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-cyan-600/20 border border-cyan-500/30 mb-4 shadow-lg shadow-cyan-500/10">
            <Server className="text-cyan-400" size={26} />
          </div>
          <h1 className="text-2xl font-bold text-white tracking-tight">DataOps Control</h1>
          <p className="text-slate-500 text-sm mt-1">
            {mode === 'login' ? 'Sign in to your workspace' : 'Create a new account'}
          </p>
        </div>

        <div className="bg-zinc-900/70 backdrop-blur border border-zinc-800/70 rounded-2xl p-6 shadow-xl shadow-black/40">
          <div className="flex rounded-xl bg-zinc-950/60 p-1 mb-6 gap-1">
            {(['login', 'register'] as Mode[]).map(m => (
              <button
                key={m}
                type="button"
                onClick={() => { setMode(m); setError(''); setForm({ username: '', email: '', password: '' }) }}
                className={`flex-1 text-sm py-1.5 rounded-lg font-medium transition-all duration-200 ${
                  mode === m
                    ? 'bg-cyan-600 text-white shadow-md shadow-cyan-500/20'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                {m === 'login' ? 'Sign In' : 'Register'}
              </button>
            ))}
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-xs font-medium text-slate-400 mb-1.5">Username</label>
              <input
                type="text"
                autoComplete="username"
                autoFocus
                value={form.username}
                onChange={handleField('username')}
                placeholder="admin"
                className="w-full bg-zinc-900/80 border border-zinc-700 text-slate-200 text-sm rounded-xl px-4 py-2.5 placeholder-slate-600 focus:outline-none focus:ring-2 focus:ring-cyan-500/50 focus:border-cyan-500/50 transition-all"
              />
            </div>

            {mode === 'register' && (
              <div>
                <label className="block text-xs font-medium text-slate-400 mb-1.5">Email</label>
                <input
                  type="email"
                  autoComplete="email"
                  value={form.email}
                  onChange={handleField('email')}
                  placeholder="you@example.com"
                  className="w-full bg-zinc-900/80 border border-zinc-700 text-slate-200 text-sm rounded-xl px-4 py-2.5 placeholder-slate-600 focus:outline-none focus:ring-2 focus:ring-cyan-500/50 focus:border-cyan-500/50 transition-all"
                />
              </div>
            )}

            <div>
              <label className="block text-xs font-medium text-slate-400 mb-1.5">Password</label>
              <div className="relative">
                <input
                  type={showPass ? 'text' : 'password'}
                  autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
                  value={form.password}
                  onChange={handleField('password')}
                  placeholder="••••••••"
                  className="w-full bg-zinc-900/80 border border-zinc-700 text-slate-200 text-sm rounded-xl px-4 py-2.5 pr-10 placeholder-slate-600 focus:outline-none focus:ring-2 focus:ring-cyan-500/50 focus:border-cyan-500/50 transition-all"
                />
                <button
                  type="button"
                  onClick={() => setShowPass(p => !p)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-300 transition-colors"
                >
                  {showPass ? <EyeOff size={15} /> : <Eye size={15} />}
                </button>
              </div>
            </div>

            {error && (
              <div className="flex items-start gap-2 bg-red-500/10 border border-red-500/20 rounded-xl px-3 py-2.5 text-xs text-red-400">
                <AlertCircle size={13} className="mt-0.5 shrink-0" />
                <span>{error}</span>
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full flex items-center justify-center gap-2 bg-cyan-600 hover:bg-cyan-500 disabled:opacity-60 disabled:cursor-not-allowed text-white text-sm font-semibold py-2.5 rounded-xl transition-all duration-200 shadow-lg shadow-cyan-500/20 mt-2"
            >
              {loading
                ? <><Loader2 size={15} className="animate-spin" /> {mode === 'login' ? 'Signing in…' : 'Creating account…'}</>
                : <>{mode === 'login' ? 'Sign In' : 'Create Account'} <ChevronRight size={15} /></>
              }
            </button>
          </form>
        </div>

        <p className="text-center text-xs text-slate-600 mt-5">
          DataOps Control Center
        </p>
      </div>
    </div>
  )
}
