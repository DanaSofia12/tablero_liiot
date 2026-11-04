import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'

export type Mode = 'dark' | 'light' | 'auto'

interface Prefs {
  mode: Mode
  setMode: (m: Mode) => void
  resolvedMode: 'dark' | 'light'
  pixel: boolean
  setPixel: (v: boolean) => void
  calm: boolean
  setCalm: (v: boolean) => void
  lastProject: string | null
  setLastProject: (id: string | null) => void
}

const PrefsContext = createContext<Prefs | null>(null)

function read<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(`hq.${key}`)
    return raw == null ? fallback : (JSON.parse(raw) as T)
  } catch {
    return fallback
  }
}

function write(key: string, value: unknown) {
  try {
    localStorage.setItem(`hq.${key}`, JSON.stringify(value))
  } catch {
    /* almacenamiento bloqueado: la preferencia vive solo en esta sesión */
  }
}

function usePersisted<T>(key: string, fallback: T): [T, (v: T) => void] {
  const [value, setValue] = useState<T>(() => read(key, fallback))
  const set = (v: T) => {
    setValue(v)
    write(key, v)
  }
  return [value, set]
}

/** «Automático» = oscuro de 6 p. m. a 6 a. m. */
function modeByHour(): 'dark' | 'light' {
  const h = new Date().getHours()
  return h >= 18 || h < 6 ? 'dark' : 'light'
}

export function PrefsProvider({ children }: { children: ReactNode }) {
  const [mode, setMode] = usePersisted<Mode>('mode', 'dark')
  const [pixel, setPixel] = usePersisted<boolean>('pixel', false)
  const [calm, setCalm] = usePersisted<boolean>('calm', false)
  const [lastProject, setLastProject] = usePersisted<string | null>('project', null)
  const [hourMode, setHourMode] = useState(modeByHour)

  useEffect(() => {
    const t = window.setInterval(() => setHourMode(modeByHour()), 60_000)
    return () => window.clearInterval(t)
  }, [])

  const resolvedMode = mode === 'auto' ? hourMode : mode

  useEffect(() => {
    const root = document.documentElement
    root.dataset.mode = resolvedMode
    root.dataset.calm = calm ? 'true' : 'false'
  }, [resolvedMode, calm])

  const value = useMemo<Prefs>(
    () => ({ mode, setMode, resolvedMode, pixel, setPixel, calm, setCalm, lastProject, setLastProject }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [mode, resolvedMode, pixel, calm, lastProject],
  )
  return <PrefsContext.Provider value={value}>{children}</PrefsContext.Provider>
}

export function usePrefs(): Prefs {
  const ctx = useContext(PrefsContext)
  if (!ctx) throw new Error('usePrefs fuera de PrefsProvider')
  return ctx
}
