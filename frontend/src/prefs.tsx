import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'

export type Mode = 'dark' | 'light' | 'auto'
export type Universe = 'liiot' | 'bleepy'

interface Prefs {
  me: string | null
  setMe: (id: string | null) => void
  project: string
  setProject: (id: string) => void
  mode: Mode
  setMode: (m: Mode) => void
  resolvedMode: 'dark' | 'light'
  uni: Universe
  setUni: (u: Universe) => void
  pixel: boolean
  setPixel: (v: boolean) => void
  ignoreHours: boolean
  setIgnoreHours: (v: boolean) => void
  calm: boolean
  setCalm: (v: boolean) => void
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
  const [me, setMe] = usePersisted<string | null>('me', null)
  const [project, setProject] = usePersisted<string>('project', 'bleepy')
  const [mode, setMode] = usePersisted<Mode>('mode', 'dark')
  const [uni, setUni] = usePersisted<Universe>('uni', 'liiot')
  const [pixel, setPixel] = usePersisted<boolean>('pixel', false)
  const [ignoreHours, setIgnoreHours] = usePersisted<boolean>('ignoreHours', true)
  const [calm, setCalm] = usePersisted<boolean>('calm', false)
  const [hourMode, setHourMode] = useState(modeByHour)

  useEffect(() => {
    const t = window.setInterval(() => setHourMode(modeByHour()), 60_000)
    return () => window.clearInterval(t)
  }, [])

  const resolvedMode = mode === 'auto' ? hourMode : mode

  useEffect(() => {
    const root = document.documentElement
    root.dataset.mode = resolvedMode
    root.dataset.uni = uni
    root.dataset.calm = calm ? 'true' : 'false'
    document.querySelector('meta[name="theme-color"]')?.setAttribute('content', resolvedMode === 'dark' ? '#07050d' : '#fff5ef')
  }, [resolvedMode, uni, calm])

  const value = useMemo<Prefs>(
    () => ({ me, setMe, project, setProject, mode, setMode, resolvedMode, uni, setUni, pixel, setPixel, ignoreHours, setIgnoreHours, calm, setCalm }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [me, project, mode, resolvedMode, uni, pixel, ignoreHours, calm],
  )
  return <PrefsContext.Provider value={value}>{children}</PrefsContext.Provider>
}

export function usePrefs(): Prefs {
  const ctx = useContext(PrefsContext)
  if (!ctx) throw new Error('usePrefs fuera de PrefsProvider')
  return ctx
}
