import { useEffect, useRef, useState, type ReactNode } from 'react'
import { NavLink, useLocation, useNavigate } from 'react-router-dom'
import { useQueryClient } from '@tanstack/react-query'
import {
  Building2,
  ChartGantt,
  ChevronLeft,
  FolderOpen,
  Layers,
  LogOut,
  Moon,
  Plus,
  Search,
  Send,
  Settings,
  Sparkles,
  SquareKanban,
  Sun,
  SunMoon,
  UserRound,
  Users,
  WifiOff,
} from 'lucide-react'
import { api, APP_NAME, OFFLINE_MESSAGE, qk, useMe } from '../api'
import { usePrefs } from '../prefs'
import { useUI } from '../ui'
import type { World } from '../world'
import { Background, Isotipo, ProjectMark } from './Brand'
import { MemberHead } from './bits'

const PROJECT_NAV = [
  { sub: '', label: 'Oficina', icon: Building2, end: true },
  { sub: 'tareas', label: 'Tareas', icon: SquareKanban },
  { sub: 'fases', label: 'Fases', icon: Layers },
  { sub: 'cronograma', label: 'Cronograma', icon: ChartGantt },
]
const SHARED_NAV = [
  { sub: 'yo', label: 'Mi espacio', icon: Sparkles },
  { sub: 'equipo', label: 'Equipo', icon: Users },
  { sub: 'seguimiento', label: 'Seguimiento', icon: Send },
]
const TITLES: Record<string, string> = {
  '': 'Oficina',
  oficina: 'Oficina',
  tareas: 'Tareas',
  fases: 'Fases del proyecto',
  cronograma: 'Cronograma',
  yo: 'Mi espacio',
  equipo: 'Equipo',
  seguimiento: 'Seguimiento',
  ajustes: 'Ajustes',
}

/** Aviso cuando se pierde la conexión por más de unos segundos (al abrir no parpadea). */
function OfflineBanner({ live }: { live: boolean }) {
  const [show, setShow] = useState(false)
  useEffect(() => {
    if (live) {
      setShow(false)
      return
    }
    const t = window.setTimeout(() => setShow(true), 5000)
    return () => window.clearTimeout(t)
  }, [live])
  if (!show) return null
  return (
    <div className="offline-banner" role="alert">
      <WifiOff size={18} aria-hidden />
      <span>
        <b>{APP_NAME} está desconectado.</b> {OFFLINE_MESSAGE.replace(`No hay conexión con ${APP_NAME}. `, '')} Mientras tanto los cambios no se guardan.
      </span>
    </div>
  )
}

function AccountMenu() {
  const me = useMe()
  const qc = useQueryClient()
  const navigate = useNavigate()
  const [open, setOpen] = useState(false)
  const box = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!open) return
    const close = (e: MouseEvent) => !box.current?.contains(e.target as Node) && setOpen(false)
    const esc = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false)
    window.addEventListener('mousedown', close)
    window.addEventListener('keydown', esc)
    return () => {
      window.removeEventListener('mousedown', close)
      window.removeEventListener('keydown', esc)
    }
  }, [open])
  const logout = async () => {
    try {
      await api.post('/api/auth/logout')
    } finally {
      qc.clear()
      qc.invalidateQueries({ queryKey: qk.auth })
      navigate('/')
    }
  }
  return (
    <div className="account" ref={box}>
      <button type="button" className="account-btn" onClick={() => setOpen(!open)} aria-haspopup="menu" aria-expanded={open} aria-label="Mi cuenta">
        <MemberHead member={me} size={36} />
      </button>
      {open && (
        <div className="menu panel" role="menu">
          <div className="menu-who">
            <MemberHead member={me} size={40} />
            <span>
              <b>{me.fullName || me.name}</b>
              <small>
                {me.role}
                {me.isAdmin ? ' · administra' : ''}
              </small>
            </span>
          </div>
          <button type="button" role="menuitem" onClick={() => (setOpen(false), navigate('/yo'))}>
            <Sparkles size={16} /> Mi espacio
          </button>
          <button type="button" role="menuitem" onClick={() => (setOpen(false), navigate('/ajustes'))}>
            <UserRound size={16} /> Mi perfil y cuenta
          </button>
          <button type="button" role="menuitem" className="danger" onClick={logout}>
            <LogOut size={16} /> Cerrar sesión
          </button>
        </div>
      )}
    </div>
  )
}

export function Shell({ children, live, world }: { children: ReactNode; live: boolean; world: World }) {
  const me = useMe()
  const { mode, setMode } = usePrefs()
  const { openCreate, goWorld } = useUI()
  const navigate = useNavigate()
  const { pathname } = useLocation()
  const [q, setQ] = useState('')
  const nextMode = mode === 'dark' ? 'light' : mode === 'light' ? 'auto' : 'dark'
  const ModeIcon = mode === 'dark' ? Moon : mode === 'light' ? Sun : SunMoon
  const sub = (world.projectId ? pathname.replace(/^\/p\/[^/]+\/?/, '') : pathname.replace(/^\//, '')).split('/')[0]
  const project = world.project
  const inProject = Boolean(world.projectId)

  return (
    <>
      <Background theme={world.theme} />
      <div className={`app${inProject ? ' in-project' : ''}`}>
        <nav className="rail" aria-label="Secciones">
          {inProject ? (
            <>
              <button type="button" className="rail-back" onClick={() => goWorld('/', null)} title="Volver a Liiot">
                <ChevronLeft size={14} aria-hidden /> Liiot
              </button>
              <div className="rail-logo world" title={project?.name}>
                {project ? <ProjectMark project={project} /> : null}
              </div>
              {PROJECT_NAV.map(({ sub: s, label, icon: Icon, end }) => (
                <NavLink key={label} to={world.path(s)} end={end} className={({ isActive }) => (isActive ? 'active' : undefined)}>
                  <Icon size={21} aria-hidden />
                  {label}
                </NavLink>
              ))}
              <span className="rail-sep" />
            </>
          ) : (
            <>
              <NavLink to="/" end className="rail-logo" title={APP_NAME}>
                <Isotipo />
              </NavLink>
              <NavLink to="/" end className={({ isActive }) => (isActive ? 'active' : undefined)}>
                <FolderOpen size={21} aria-hidden />
                Proyectos
              </NavLink>
              <NavLink to="/oficina" className={({ isActive }) => (isActive ? 'active' : undefined)}>
                <Building2 size={21} aria-hidden />
                Oficina
              </NavLink>
              <span className="rail-sep" />
            </>
          )}
          {SHARED_NAV.map(({ sub: s, label, icon: Icon }) => (
            <NavLink key={label} to={world.path(s)} className={({ isActive }) => (isActive ? 'active' : undefined)}>
              <Icon size={21} aria-hidden />
              {label}
            </NavLink>
          ))}
          <span className="spacer" />
          <NavLink to={world.path('ajustes')} className={({ isActive }) => (isActive ? 'active' : undefined)}>
            <Settings size={20} aria-hidden />
            Ajustes
          </NavLink>
          <span className="live" title={live ? 'Conectado en vivo' : 'Reconectando…'}>
            <i className={`dot${live ? ' on' : ''}`} /> {live ? 'En vivo' : 'Sin conexión'}
          </span>
        </nav>
        <div className="main">
          <header className="topbar">
            {inProject ? (
              <button type="button" className="world-chip" onClick={() => goWorld('/', null)} title="Volver a todos los proyectos">
                <span className="world-mark">{project && <ProjectMark project={project} />}</span>
                <span>
                  <small>{project?.currentPhaseName ? `Fase · ${project.currentPhaseName}` : 'Proyecto'}</small>
                  <b>{project?.name ?? '…'}</b>
                </span>
              </button>
            ) : (
              <span className="world-chip static">
                <span className="world-mark liiot">
                  <Isotipo />
                </span>
                <span>
                  <small>Empresa</small>
                  <b>Liiot</b>
                </span>
              </span>
            )}
            <span className="page-title">{sub === '' && !inProject ? 'Proyectos' : TITLES[sub] ?? ''}</span>
            {inProject ? (
              <form
                className="search"
                role="search"
                onSubmit={(e) => {
                  e.preventDefault()
                  navigate(`${world.path('tareas')}?q=${encodeURIComponent(q)}`)
                }}
              >
                <Search size={16} aria-hidden />
                <input value={q} onChange={(e) => setQ(e.target.value)} placeholder={`Buscar en ${project?.name ?? 'el proyecto'}…`} aria-label="Buscar tareas" />
              </form>
            ) : (
              <span className="grow" />
            )}
            <button type="button" className="btn primary" onClick={() => openCreate({ ownerId: me.id, projectId: world.projectId ?? undefined })}>
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
            <AccountMenu />
          </header>
          <OfflineBanner live={live} />
          {children}
        </div>
      </div>
    </>
  )
}
