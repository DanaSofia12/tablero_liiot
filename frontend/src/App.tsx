import { lazy, Suspense, useEffect } from 'react'
import { Navigate, Route, Routes, useLocation } from 'react-router-dom'
import { useQueryClient } from '@tanstack/react-query'
import { qk, UNAUTHORIZED_EVENT, useAuth } from './api'
import { ProjectDialog } from './components/ProjectDialog'
import { Shell } from './components/Shell'
import { TaskDrawer } from './components/TaskDrawer'
import { TaskForm } from './components/TaskForm'
import { Toasts } from './components/Toasts'
import { WorldTransition } from './components/WorldTransition'
import { useMemberMap } from './components/bits'
import { usePrefs } from './prefs'
import { useLive } from './realtime'
import { useUI } from './ui'
import { useWorld, useWorldTheme } from './world'
import HomePage from './pages/HomePage'
import LoginPage from './pages/LoginPage'
import MePage from './pages/MePage'
import TasksPage from './pages/TasksPage'
import PhasesPage from './pages/PhasesPage'
import TimelinePage from './pages/TimelinePage'
import TeamPage from './pages/TeamPage'
import FollowupPage from './pages/FollowupPage'
import SettingsPage from './pages/SettingsPage'

const OfficePage = lazy(() => import('./pages/OfficePage'))

export default function App() {
  const auth = useAuth()
  const qc = useQueryClient()
  useEffect(() => {
    const expired = () => qc.invalidateQueries({ queryKey: qk.auth })
    window.addEventListener(UNAUTHORIZED_EVENT, expired)
    return () => window.removeEventListener(UNAUTHORIZED_EVENT, expired)
  }, [qc])

  if (auth.isLoading) return <div className="splash" />
  if (!auth.data?.me) return <LoginPage state={auth.data} />
  return <Workspace />
}

/** Rutas viejas (/tareas, /cronograma…) llevan al último proyecto abierto. */
function OldRoute({ sub }: { sub: string }) {
  const { lastProject } = usePrefs()
  const { search } = useLocation()
  return <Navigate to={lastProject ? `/p/${encodeURIComponent(lastProject)}/${sub}${search}` : '/'} replace />
}

function Workspace() {
  const world = useWorld()
  useWorldTheme(world)
  const { toast } = useUI()
  const members = useMemberMap()
  const live = useLive((memberId, title) => {
    const who = memberId ? members[memberId]?.name : null
    toast(`🎉 ${who ?? 'Alguien'} finalizó ${title ? `«${title}»` : 'una tarea'}`, 'party')
  })

  return (
    <Shell live={live} world={world}>
      <Suspense fallback={<div className="page"><p className="empty">Cargando…</p></div>}>
        <Routes>
          <Route path="/" element={<HomePage />} />
          <Route path="/oficina" element={<OfficePage />} />
          <Route path="/yo" element={<MePage />} />
          <Route path="/equipo" element={<TeamPage />} />
          <Route path="/seguimiento" element={<FollowupPage />} />
          <Route path="/ajustes" element={<SettingsPage />} />
          <Route path="/p/:pid" element={<OfficePage />} />
          <Route path="/p/:pid/tareas" element={<TasksPage />} />
          <Route path="/p/:pid/fases" element={<PhasesPage />} />
          <Route path="/p/:pid/cronograma" element={<TimelinePage />} />
          <Route path="/p/:pid/yo" element={<MePage />} />
          <Route path="/p/:pid/equipo" element={<TeamPage />} />
          <Route path="/p/:pid/seguimiento" element={<FollowupPage />} />
          <Route path="/p/:pid/ajustes" element={<SettingsPage />} />
          <Route path="/tareas" element={<OldRoute sub="tareas" />} />
          <Route path="/cronograma" element={<OldRoute sub="cronograma" />} />
          <Route path="/lanzamiento" element={<OldRoute sub="fases" />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </Suspense>
      <TaskDrawer />
      <TaskForm />
      <ProjectDialog />
      <Toasts />
      <WorldTransition />
    </Shell>
  )
}
