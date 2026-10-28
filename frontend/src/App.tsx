import { lazy, Suspense } from 'react'
import { Navigate, Route, Routes } from 'react-router-dom'
import { ProjectDialog } from './components/ProjectDialog'
import { Shell } from './components/Shell'
import { TaskDrawer } from './components/TaskDrawer'
import { TaskForm } from './components/TaskForm'
import { Toasts } from './components/Toasts'
import { WhoAmI } from './components/WhoAmI'
import { useMemberMap } from './components/bits'
import { usePrefs } from './prefs'
import { useLive } from './realtime'
import { useUI } from './ui'
import MePage from './pages/MePage'
import TasksPage from './pages/TasksPage'
import LaunchPage from './pages/LaunchPage'
import TimelinePage from './pages/TimelinePage'
import TeamPage from './pages/TeamPage'
import FollowupPage from './pages/FollowupPage'
import SettingsPage from './pages/SettingsPage'

const OfficePage = lazy(() => import('./pages/OfficePage'))

export default function App() {
  const { me } = usePrefs()
  const { toast } = useUI()
  const members = useMemberMap()
  const live = useLive((memberId, taskKey) => {
    const who = memberId ? members[memberId]?.name : null
    toast(`🎉 ${who ?? 'Alguien'} terminó ${taskKey ?? 'una tarea'}`, 'party')
  })

  if (!me) return <WhoAmI />

  return (
    <Shell live={live}>
      <Suspense fallback={<div className="page"><p className="empty">Cargando la oficina…</p></div>}>
        <Routes>
          <Route path="/" element={<OfficePage />} />
          <Route path="/yo" element={<MePage />} />
          <Route path="/tareas" element={<TasksPage />} />
          <Route path="/lanzamiento" element={<LaunchPage />} />
          <Route path="/cronograma" element={<TimelinePage />} />
          <Route path="/equipo" element={<TeamPage />} />
          <Route path="/seguimiento" element={<FollowupPage />} />
          <Route path="/ajustes" element={<SettingsPage />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </Suspense>
      <TaskDrawer />
      <TaskForm />
      <ProjectDialog />
      <Toasts />
    </Shell>
  )
}
