import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react'
import type { TaskCreate } from './api'

export type ToastTone = 'ok' | 'bad' | 'info' | 'party'
export interface Toast {
  id: number
  text: string
  tone: ToastTone
}

interface UI {
  openTaskId: number | null
  openTask: (id: number) => void
  closeTask: () => void
  createDraft: TaskCreate | null
  openCreate: (defaults?: Partial<TaskCreate>) => void
  closeCreate: () => void
  toasts: Toast[]
  toast: (text: string, tone?: ToastTone) => void
  dismiss: (id: number) => void
}

const UIContext = createContext<UI | null>(null)
let toastSeq = 0

export function UIProvider({ children }: { children: ReactNode }) {
  const [openTaskId, setOpenTaskId] = useState<number | null>(null)
  const [createDraft, setCreateDraft] = useState<TaskCreate | null>(null)
  const [toasts, setToasts] = useState<Toast[]>([])

  const dismiss = useCallback((id: number) => setToasts((all) => all.filter((t) => t.id !== id)), [])
  const toast = useCallback(
    (text: string, tone: ToastTone = 'ok') => {
      const id = ++toastSeq
      setToasts((all) => [...all.slice(-3), { id, text, tone }])
      window.setTimeout(() => dismiss(id), tone === 'bad' ? 6500 : 3800)
    },
    [dismiss],
  )

  const value = useMemo<UI>(
    () => ({
      openTaskId,
      openTask: (id) => setOpenTaskId(id),
      closeTask: () => setOpenTaskId(null),
      createDraft,
      openCreate: (defaults) => setCreateDraft({ title: '', ...defaults }),
      closeCreate: () => setCreateDraft(null),
      toasts,
      toast,
      dismiss,
    }),
    [openTaskId, createDraft, toasts, toast, dismiss],
  )
  return <UIContext.Provider value={value}>{children}</UIContext.Provider>
}

export function useUI(): UI {
  const ctx = useContext(UIContext)
  if (!ctx) throw new Error('useUI fuera de UIProvider')
  return ctx
}
