import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { usePrefs } from './prefs'
import { useUI } from './ui'
import type {
  Catalog,
  CheckIn,
  Member,
  Metrics,
  Presence,
  Project,
  Rubric,
  Stage,
  Task,
  TaskEvent,
  TaskPatch,
  TelegramSettings,
  TelegramStatus,
  VaultStatus,
} from './types'

export const OFFLINE_MESSAGE = 'No hay conexión con HQ. Revisa que la ventana «Liiot HQ» siga abierta (o ábrela con iniciar.cmd).'

async function http<T>(path: string, init?: RequestInit): Promise<T> {
  let res: Response
  try {
    res = await fetch(path, { headers: { 'Content-Type': 'application/json' }, ...init })
  } catch {
    throw new Error(OFFLINE_MESSAGE)
  }
  if (!res.ok) {
    let message = `Error ${res.status}`
    try {
      const body = await res.json()
      if (body?.detail) message = typeof body.detail === 'string' ? body.detail : JSON.stringify(body.detail)
    } catch {
      /* respuesta sin cuerpo JSON */
    }
    throw new Error(message)
  }
  return (await res.json()) as T
}

export const api = {
  get: <T,>(path: string) => http<T>(path),
  post: <T,>(path: string, body?: unknown) => http<T>(path, { method: 'POST', body: JSON.stringify(body ?? {}) }),
  patch: <T,>(path: string, body: unknown) => http<T>(path, { method: 'PATCH', body: JSON.stringify(body) }),
  del: <T,>(path: string) => http<T>(path, { method: 'DELETE' }),
}

export const qk = {
  catalog: ['catalog'] as const,
  members: ['members'] as const,
  projects: ['projects'] as const,
  project: ['project'] as const,
  tasks: ['tasks'] as const,
  metrics: ['metrics'] as const,
  presence: ['presence'] as const,
  rubric: ['rubric'] as const,
  telegram: ['telegram'] as const,
  checkins: ['checkins'] as const,
  events: ['events'] as const,
  vault: ['vault'] as const,
}

export const useCatalog = () =>
  useQuery({ queryKey: qk.catalog, queryFn: () => api.get<Catalog>('/api/catalog'), staleTime: Infinity })
export const useMembers = () => useQuery({ queryKey: qk.members, queryFn: () => api.get<Member[]>('/api/members') })
export const useProjects = () => useQuery({ queryKey: qk.projects, queryFn: () => api.get<Project[]>('/api/projects') })

/** Proyecto elegido arriba a la izquierda (si el guardado ya no existe, el primero de la lista). */
export function useCurrentProject() {
  const { project: saved, setProject } = usePrefs()
  const projects = useProjects().data ?? []
  const project = projects.find((p) => p.id === saved) ?? projects[0]
  return { projectId: project?.id ?? saved, project, projects, setProject }
}

export function useProject(id?: string) {
  const { projectId } = useCurrentProject()
  const pid = id ?? projectId
  return useQuery({
    queryKey: [...qk.project, pid],
    queryFn: () => api.get<{ project: Project; stages: Stage[] }>(`/api/projects/${encodeURIComponent(pid)}`),
    enabled: Boolean(pid),
  })
}

/** Todas las tareas de todos los proyectos (Mi espacio, Equipo y la oficina las mezclan). */
export const useTasks = () => useQuery({ queryKey: qk.tasks, queryFn: () => api.get<Task[]>('/api/tasks') })

/** Solo las tareas del proyecto elegido (o del indicado). */
export function useProjectTasks(id?: string) {
  const { projectId } = useCurrentProject()
  const pid = id ?? projectId
  const query = useTasks()
  return { ...query, data: query.data?.filter((t) => t.projectId === pid) }
}

export function useMetrics(id?: string) {
  const { projectId } = useCurrentProject()
  const pid = id ?? projectId
  return useQuery({
    queryKey: [...qk.metrics, pid],
    queryFn: () => api.get<Metrics>(`/api/metrics?project=${encodeURIComponent(pid)}`),
    enabled: Boolean(pid),
  })
}

export function useRubric(id?: string) {
  const { projectId } = useCurrentProject()
  const pid = id ?? projectId
  return useQuery({
    queryKey: [...qk.rubric, pid],
    queryFn: () => api.get<Rubric>(`/api/rubric?project=${encodeURIComponent(pid)}`),
    enabled: Boolean(pid),
  })
}

export const useTelegram = () =>
  useQuery({
    queryKey: qk.telegram,
    queryFn: () => api.get<{ settings: TelegramSettings; status: TelegramStatus }>('/api/telegram'),
  })
export const useCheckins = () => useQuery({ queryKey: qk.checkins, queryFn: () => api.get<CheckIn[]>('/api/checkins') })
export const useVault = () => useQuery({ queryKey: qk.vault, queryFn: () => api.get<VaultStatus>('/api/vault'), refetchInterval: 30_000 })

export function usePresence() {
  const { ignoreHours } = usePrefs()
  return useQuery({
    queryKey: [...qk.presence, ignoreHours],
    queryFn: () => api.get<Presence[]>(`/api/presence?ignoreHours=${ignoreHours}`),
    refetchInterval: 60_000,
  })
}

export const useTaskEvents = (taskId: number | null) =>
  useQuery({
    queryKey: [...qk.events, taskId],
    queryFn: () => api.get<TaskEvent[]>(`/api/tasks/${taskId}/events`),
    enabled: taskId != null,
  })

export function useRefresh() {
  const qc = useQueryClient()
  return (...keys: (readonly string[])[]) => keys.forEach((key) => qc.invalidateQueries({ queryKey: key }))
}

export interface TaskCreate {
  title: string
  projectId?: string
  status?: string
  summary?: string
  type?: string
  priority?: string
  ownerId?: string
  collaborators?: string[]
  dueDate?: string | null
  startDate?: string | null
  stageId?: number | null
  effort?: string
  rubric?: string[]
}

/** Crear y editar tareas. Si algo falla (por ejemplo, HQ está apagado) se avisa siempre y la tarjeta vuelve a su lugar. */
export function useTaskActions() {
  const qc = useQueryClient()
  const { me } = usePrefs()
  const { toast } = useUI()
  const refresh = () => {
    for (const key of [qk.tasks, qk.metrics, qk.presence, qk.rubric, qk.events, qk.projects]) qc.invalidateQueries({ queryKey: key })
  }
  const update = useMutation({
    mutationFn: ({ id, patch }: { id: number; patch: TaskPatch }) => api.patch<Task>(`/api/tasks/${id}`, { ...patch, actorId: me }),
    onMutate: async ({ id, patch }) => {
      await qc.cancelQueries({ queryKey: qk.tasks })
      const previous = qc.getQueryData<Task[]>(qk.tasks)
      if (previous) qc.setQueryData<Task[]>(qk.tasks, previous.map((t) => (t.id === id ? { ...t, ...patch } : t)))
      return { previous }
    },
    onError: (err, _vars, ctx) => {
      if (ctx?.previous) qc.setQueryData(qk.tasks, ctx.previous)
      toast(`No se guardó el cambio: ${(err as Error).message}`, 'bad')
    },
    onSettled: refresh,
  })
  const create = useMutation({
    mutationFn: (data: TaskCreate) => api.post<Task>('/api/tasks', { ...data, actorId: me }),
    onSuccess: refresh,
    onError: (err) => toast(`No se creó la tarea: ${(err as Error).message}`, 'bad'),
  })
  const comment = useMutation({
    mutationFn: ({ id, text }: { id: number; text: string }) => api.post(`/api/tasks/${id}/comments`, { text, actorId: me }),
    onSuccess: refresh,
    onError: (err) => toast((err as Error).message, 'bad'),
  })
  const followup = useMutation({
    mutationFn: (id: number) => api.post<{ sent: boolean; message: string }>(`/api/tasks/${id}/followup`, { actorId: me }),
    onSuccess: () => qc.invalidateQueries({ queryKey: qk.checkins }),
    onError: (err) => toast((err as Error).message, 'bad'),
  })
  return { update, create, comment, followup }
}

export interface ProjectCreate {
  name: string
  keyPrefix?: string
  summary?: string
  leadId?: string | null
  pilotDate?: string | null
  color?: string
  basicRubric?: boolean
}

export function useProjectActions() {
  const qc = useQueryClient()
  const { toast } = useUI()
  const refresh = () => {
    for (const key of [qk.projects, qk.project, qk.metrics, qk.rubric, qk.tasks, qk.vault]) qc.invalidateQueries({ queryKey: key })
  }
  const create = useMutation({
    mutationFn: (data: ProjectCreate) => api.post<Project>('/api/projects', data),
    onSuccess: refresh,
    onError: (err) => toast(`No se creó el proyecto: ${(err as Error).message}`, 'bad'),
  })
  const update = useMutation({
    mutationFn: ({ id, patch }: { id: string; patch: Partial<ProjectCreate> & { archived?: boolean } }) =>
      api.patch<Project>(`/api/projects/${encodeURIComponent(id)}`, patch),
    onSuccess: refresh,
    onError: (err) => toast((err as Error).message, 'bad'),
  })
  return { create, update }
}

/** Enlace para abrir la nota de una tarea directamente en Obsidian. */
export function obsidianUrl(vaultName: string | null | undefined, path: string | null | undefined) {
  if (!vaultName || !path) return null
  return `obsidian://open?vault=${encodeURIComponent(vaultName)}&file=${encodeURIComponent(path.replace(/\.md$/, ''))}`
}
