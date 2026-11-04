import { useEffect, useMemo } from 'react'
import { useLocation } from 'react-router-dom'
import { useProjects } from './api'
import { usePrefs } from './prefs'
import type { Project, Theme } from './types'

/**
 * «Mundo» en el que se está: Liiot (la empresa, en /) o un proyecto (en /p/:id/…).
 * Cada proyecto trae su estilo (Bleepy tiene el suyo; los demás usan el de Liiot).
 */
export interface World {
  projectId: string | null
  project: Project | undefined
  theme: Theme
  /** Prefijo de rutas: «/p/bleepy» dentro de un proyecto, «» en Liiot. */
  base: string
  path: (sub?: string) => string
}

export function projectFromPath(pathname: string): string | null {
  const m = pathname.match(/^\/p\/([^/]+)/)
  return m ? decodeURIComponent(m[1]) : null
}

export function useWorld(): World {
  const { pathname } = useLocation()
  const projects = useProjects().data
  const projectId = projectFromPath(pathname)
  const project = projectId ? projects?.find((p) => p.id === projectId) : undefined
  const theme: Theme = project?.theme === 'bleepy' ? 'bleepy' : 'liiot'
  return useMemo(() => {
    const base = projectId ? `/p/${encodeURIComponent(projectId)}` : ''
    return { projectId, project, theme, base, path: (sub = '') => `${base}${sub ? `/${sub}` : ''}` || '/' }
  }, [projectId, project, theme])
}

/** Aplica el estilo del mundo actual a toda la página y recuerda el último proyecto abierto. */
export function useWorldTheme(world: World) {
  const { setLastProject, lastProject } = usePrefs()
  useEffect(() => {
    document.documentElement.dataset.uni = world.theme
    document.title = world.project ? `${world.project.name} · Liiot Hub` : 'Liiot Hub'
    const meta = document.querySelector('meta[name="theme-color"]')
    meta?.setAttribute('content', world.theme === 'bleepy' ? '#0f1a3d' : '#07050d')
  }, [world.theme, world.project])
  useEffect(() => {
    if (world.projectId && world.projectId !== lastProject) setLastProject(world.projectId)
  }, [world.projectId]) // eslint-disable-line react-hooks/exhaustive-deps
}
