import { useState, type ReactNode } from 'react'
import { NavLink, useLocation, useNavigate } from 'react-router-dom'
import {
  Building2,
  ChartGantt,
  Moon,
  Orbit,
  Plus,
  Rocket,
  Search,
  Send,
  Settings,
  Sparkles,
  SquareKanban,
  Sun,
  SunMoon,
  Users,
} from 'lucide-react'
import { useProject } from '../api'
import { usePrefs } from '../prefs'
import { useUI } from '../ui'
import { MemberHead, useMemberMap } from './bits'

const NAV = [
  { to: '/', label: 'Oficina', icon: Building2, end: true },
  { to: '/yo', label: 'Mi espacio', icon: Sparkles },
  { to: '/tareas', label: 'Tareas', icon: SquareKanban },
  { to: '/lanzamiento', label: 'Lanzar', icon: Rocket },
  { to: '/cronograma', label: 'Cronograma', icon: ChartGantt },
  { to: '/equipo', label: 'Equipo', icon: Users },
  { to: '/seguimiento', label: 'Seguimiento', icon: Send },
]

const TITLES: Record<string, string> = {
  '/': 'Oficina',
  '/yo': 'Mi espacio',
  '/tareas': 'Tareas',
  '/lanzamiento': 'Lanzamiento',
  '/cronograma': 'Cronograma',
  '/equipo': 'Carga del equipo',
  '/seguimiento': 'Seguimiento por Telegram',
  '/ajustes': 'Ajustes',
}

export function Isotipo({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="56 20 80 154" aria-hidden="true">
      <path d="M94.65,148.81l.1-83.16c0-3.67-4.17-5.77-7.08-3.55-8.65,6.57-17.3,13.13-25.95,19.7-1.1.84-1.75,2.14-1.76,3.53-.09,26.84-.19,53.68-.28,80.52-.01,3.53,3.88,5.67,6.82,3.74,8.71-5.69,17.43-11.37,26.14-17.06,1.25-.82,2.01-2.22,2.01-3.73" />
      <path d="M97.86,45.02l-.1,83.16c0,3.67,4.17,5.77,7.08,3.55,8.65-6.57,17.3-13.13,25.95-19.7,1.1-.84,1.75-2.14,1.76-3.53.09-26.84.19-53.68.28-80.52.01-3.53-3.88-5.67-6.82-3.74-8.71,5.69-17.43,11.37-26.14,17.06-1.25.82-2.01,2.22-2.01,3.73" />
      <path d="M132.57,152.85c0,9.17-7.55,16.6-16.86,16.6s-17.68-7.79-17.68-17.4v-16.02h17.45c9.44,0,17.1,7.54,17.1,16.83" />
      <path d="M59.94,40.98c0-9.17,7.55-16.6,16.86-16.6s17.68,7.79,17.68,17.4v16.03h-17.45c-9.44,0-17.1-7.54-17.1-16.83" />
    </svg>
  )
}

export function Background() {
  return (
    <>
      <div className="bg" aria-hidden="true">
        <i className="b1" />
        <i className="b2" />
        <i className="b3" />
        <i className="ribbon" />
        <i className="ribbon r2" />
      </div>
      <div className="grain" aria-hidden="true" />
    </>
  )
}

export function Shell({ children, live }: { children: ReactNode; live: boolean }) {
  const { me, mode, setMode, uni, setUni } = usePrefs()
  const members = useMemberMap()
  const project = useProject().data?.project
  const { openCreate } = useUI()
  const navigate = useNavigate()
  const location = useLocation()
  const [q, setQ] = useState('')
  const nextMode = mode === 'dark' ? 'light' : mode === 'light' ? 'auto' : 'dark'
  const ModeIcon = mode === 'dark' ? Moon : mode === 'light' ? Sun : SunMoon

  return (
    <>
      <Background />
      <div className="app">
        <nav className="rail" aria-label="Secciones">
          <div className="rail-logo" title="Liiot HQ">
            <Isotipo />
          </div>
          {NAV.map(({ to, label, icon: Icon, end }) => (
            <NavLink key={to} to={to} end={end} className={({ isActive }) => (isActive ? 'active' : undefined)}>
              <Icon size={21} aria-hidden />
              {label}
            </NavLink>
          ))}
          <span className="spacer" />
          <NavLink to="/ajustes" className={({ isActive }) => (isActive ? 'active' : undefined)}>
            <Settings size={20} aria-hidden />
            Ajustes
          </NavLink>
          <span className="live" title={live ? 'Conectado en vivo' : 'Reconectando…'}>
            <i className={`dot${live ? ' on' : ''}`} /> {live ? 'En vivo' : 'Sin conexión'}
          </span>
        </nav>
        <div className="main">
          <header className="topbar">
            <button
              type="button"
              className="project-chip"
              onClick={() => setUni(uni === 'liiot' ? 'bleepy' : 'liiot')}
              title="Cambiar de universo visual"
            >
              <span className="orb" />
              <span>
                <b>{uni === 'bleepy' ? 'Universo Bleepy' : 'Liiot HQ'}</b>
                <small>
                  {project?.name ?? 'Bleepy'} · {uni === 'bleepy' ? 'planeta creativo' : 'oficina principal'}
                </small>
              </span>
              <Orbit size={16} aria-hidden />
            </button>
            <span className="page-title">{TITLES[location.pathname] ?? ''}</span>
            <form
              className="search"
              role="search"
              onSubmit={(e) => {
                e.preventDefault()
                navigate(`/tareas?q=${encodeURIComponent(q)}`)
              }}
            >
              <Search size={16} aria-hidden />
              <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar tareas…" aria-label="Buscar tareas" />
              <kbd>ENTER</kbd>
            </form>
            <button type="button" className="btn primary" onClick={() => openCreate({ ownerId: me ?? undefined })}>
              <Plus size={17} aria-hidden /> Nueva tarea
            </button>
            <button
              type="button"
              className="btn icon"
              onClick={() => setMode(nextMode)}
              title={`Modo: ${mode === 'auto' ? 'automático por hora' : mode === 'dark' ? 'oscuro' : 'claro'}`}
              aria-label="Cambiar modo de color"
            >
              <ModeIcon size={18} />
            </button>
            <button type="button" className="btn icon" style={{ padding: 0, border: 0, background: 'none', boxShadow: 'none' }} onClick={() => navigate('/yo')} aria-label="Mi espacio">
              <MemberHead member={me ? members[me] : undefined} size={38} />
            </button>
          </header>
          {children}
        </div>
      </div>
    </>
  )
}
