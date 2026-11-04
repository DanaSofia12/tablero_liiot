import { createContext, useCallback, useContext, useMemo, useRef, useState, type ReactNode } from 'react'
import { useNavigate } from 'react-router-dom'
import type { TaskCreate } from './api'
import type { Project } from './types'

export type ToastTone = 'ok' | 'bad' | 'info' | 'party'
export interface Toast {
  id: number
  text: string
  tone: ToastTone
  action?: { label: string; run: () => void }
}

/** Viaje entre mundos: Liiot ↔ un proyecto, con su animación. */
export interface Travel {
  id: number
  to: string
  project: Pick<Project, 'id' | 'name' | 'theme' | 'color'> | null
  from: { x: number; y: number; w: number; h: number } | null
}

interface UI {
  openTaskId: number | null
  openTask: (id: number) => void
  closeTask: () => void
  createDraft: TaskCreate | null
  openCreate: (defaults?: Partial<TaskCreate>) => void
  closeCreate: () => void
  newProject: boolean
  openNewProject: () => void
  closeNewProject: () => void
  toasts: Toast[]
  toast: (text: string, tone?: ToastTone, action?: Toast['action']) => void
  dismiss: (id: number) => void
  travel: Travel | null
  goWorld: (to: string, project: Travel['project'], from?: DOMRect | null) => void
}

const UIContext = createContext<UI | null>(null)
let seq = 0

export function UIProvider({ children }: { children: ReactNode }) {
  const navigate = useNavigate()
  const [openTaskId, setOpenTaskId] = useState<number | null>(null)
  const [createDraft, setCreateDraft] = useState<TaskCreate | null>(null)
  const [newProject, setNewProject] = useState(false)
  const [toasts, setToasts] = useState<Toast[]>([])
  const [travel, setTravel] = useState<Travel | null>(null)
  const timers = useRef<number[]>([])

  const dismiss = useCallback((id: number) => setToasts((all) => all.filter((t) => t.id !== id)), [])
  const toast = useCallback(
    (text: string, tone: ToastTone = 'ok', action?: Toast['action']) => {
      const id = ++seq
      setToasts((all) => [...all.slice(-3), { id, text, tone, action }])
      window.setTimeout(() => dismiss(id), tone === 'bad' ? 6500 : action ? 6000 : 3800)
    },
    [dismiss],
  )

  const goWorld = useCallback(
    (to: string, project: Travel['project'], from?: DOMRect | null) => {
      timers.current.forEach((t) => window.clearTimeout(t))
      const calm = document.documentElement.dataset.calm === 'true' || window.matchMedia('(prefers-reduced-motion: reduce)').matches
      if (calm) {
        navigate(to)
        return
      }
      const id = ++seq
      setTravel({ id, to, project, from: from ? { x: from.left, y: from.top, w: from.width, h: from.height } : null })
      timers.current = [
        window.setTimeout(() => navigate(to), project ? 620 : 380),
        window.setTimeout(() => setTravel((t) => (t?.id === id ? null : t)), project ? 1250 : 820),
      ]
    },
    [navigate],
  )

  const value = useMemo<UI>(
    () => ({
      openTaskId,
      openTask: (id) => setOpenTaskId(id),
      closeTask: () => setOpenTaskId(null),
      createDraft,
      openCreate: (defaults) => setCreateDraft({ title: '', ...defaults }),
      closeCreate: () => setCreateDraft(null),
      newProject,
      openNewProject: () => setNewProject(true),
      closeNewProject: () => setNewProject(false),
      toasts,
      toast,
      dismiss,
      travel,
      goWorld,
    }),
    [openTaskId, createDraft, newProject, toasts, toast, dismiss, travel, goWorld],
  )
  return <UIContext.Provider value={value}>{children}</UIContext.Provider>
}

export function useUI(): UI {
  const ctx = useContext(UIContext)
  if (!ctx) throw new Error('useUI fuera de UIProvider')
  return ctx
}
