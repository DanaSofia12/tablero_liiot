import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useUI } from './ui'
import type {
  Account,
  AuthState,
  Catalog,
  CheckIn,
  Member,
  PhasesData,
  Presence,
  PresenceState,
  Project,
  ProjectData,
  ProjectMetrics,
  Rubric,
  Task,
  TaskEvent,
  TaskPatch,
  TeamData,
  TelegramSettings,
  TelegramStatus,
  VaultStatus,
} from './types'

export const APP_NAME = 'Liiot Hub'
export const OFFLINE_MESSAGE = `No hay conexión con ${APP_NAME}. Revisa que la ventana «${APP_NAME}» siga abierta (o ábrela con iniciar.cmd).`

/** Si la sesión vence, la app vuelve a la pantalla de entrada. */
export const UNAUTHORIZED_EVENT = 'hub:unauthorized'

async function http<T>(path: string, init?: RequestInit): Promise<T> {
  let res: Response
  try {
    res = await fetch(path, {
      credentials: 'same-origin',
      ...init,
      headers: { 'Content-Type': 'application/json', 'X-Liiot': '1', ...(init?.headers ?? {}) },
    })
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
    if (res.status === 401 && !path.startsWith('/api/auth/')) window.dispatchEvent(new Event(UNAUTHORIZED_EVENT))
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
  auth: ['auth'] as const,
  catalog: ['catalog'] as const,
  members: ['members'] as const,
  accounts: ['accounts'] as const,
  projects: ['projects'] as const,
  project: ['project'] as const,
  tasks: ['tasks'] as const,
  metrics: ['metrics'] as const,
  presence: ['presence'] as const,
  phases: ['phases'] as const,
  rubric: ['rubric'] as const,
  team: ['team'] as const,
  telegram: ['telegram'] as const,
  checkins: ['checkins'] as const,
  events: ['events'] as const,
  vault: ['vault'] as const,
}

export const useAuth = () => useQuery({ queryKey: qk.auth, queryFn: () => api.get<AuthState>('/api/auth/state'), staleTime: 60_000, retry: 0 })

/** La persona que inició sesión (o un objeto vacío mientras carga: solo se usa dentro de la app ya autenticada). */
export function useMe(): Member {
  return (useAuth().data?.me ?? {}) as Member
}

export const useCatalog = () => useQuery({ queryKey: qk.catalog, queryFn: () => api.get<Catalog>('/api/catalog'), staleTime: Infinity })
export const useMembers = () => useQuery({ queryKey: qk.members, queryFn: () => api.get<Member[]>('/api/members') })
export const useAccounts = (enabled = true) => useQuery({ queryKey: qk.accounts, queryFn: () => api.get<Account[]>('/api/accounts'), enabled })
export const useProjects = () => useQuery({ queryKey: qk.projects, queryFn: () => api.get<Project[]>('/api/projects') })

export function useProjectData(pid: string | null | undefined) {
  return useQuery({
    queryKey: [...qk.project, pid],
    queryFn: () => api.get<ProjectData>(`/api/projects/${encodeURIComponent(pid!)}`),
    enabled: Boolean(pid),
  })
}

/** Todas las tareas de todos los proyectos. */
export const useTasks = () => useQuery({ queryKey: qk.tasks, queryFn: () => api.get<Task[]>('/api/tasks') })

/** Solo las tareas de un proyecto. */
export function useProjectTasks(pid: string | null | undefined) {
  const query = useTasks()
  return { ...query, data: pid ? query.data?.filter((t) => t.projectId === pid) : query.data }
}

export function useMetrics(pid: string | null | undefined) {
  return useQuery({
    queryKey: [...qk.metrics, pid],
    queryFn: () => api.get<ProjectMetrics>(`/api/metrics?project=${encodeURIComponent(pid!)}`),
    enabled: Boolean(pid),
  })
}

export function usePhases(pid: string | null | undefined) {
  return useQuery({
    queryKey: [...qk.phases, pid],
    queryFn: () => api.get<PhasesData>(`/api/projects/${encodeURIComponent(pid!)}/phases`),
    enabled: Boolean(pid),
  })
}

export function useRubric(phaseId: number | null | undefined) {
  return useQuery({
    queryKey: [...qk.rubric, phaseId],
    queryFn: () => api.get<Rubric>(`/api/phases/${phaseId}/rubric`),
    enabled: phaseId != null,
  })
}

export function useTeam(pid: string | null) {
  return useQuery({
    queryKey: [...qk.team, pid ?? 'todos'],
    queryFn: () => api.get<TeamData>(pid ? `/api/team?project=${encodeURIComponent(pid)}` : '/api/team'),
  })
}

export const useTelegram = () =>
  useQuery({
    queryKey: qk.telegram,
    queryFn: () => api.get<{ settings: TelegramSettings; status: TelegramStatus }>('/api/telegram'),
  })
export const useCheckins = () => useQuery({ queryKey: qk.checkins, queryFn: () => api.get<CheckIn[]>('/api/checkins') })
export const useVault = () => useQuery({ queryKey: qk.vault, queryFn: () => api.get<VaultStatus>('/api/vault'), refetchInterval: 30_000 })
export const usePresence = () =>
  useQuery({ queryKey: qk.presence, queryFn: () => api.get<Presence[]>('/api/presence'), refetchInterval: 60_000 })

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
  summary?: string
  projectId?: string
  status?: string
  type?: string
  priority?: string
  ownerId?: string
  collaborators?: string[]
  dueDate?: string | null
  startDate?: string | null
  phaseId?: number | null
  stageId?: number | null
  checklist?: string[]
}

const TASK_KEYS = [qk.tasks, qk.metrics, qk.presence, qk.phases, qk.events, qk.projects, qk.project, qk.team]

/** Crear y editar tareas. Si algo falla (por ejemplo, Liiot Hub está cerrado) se avisa siempre y la tarjeta vuelve a su lugar. */
export function useTaskActions() {
  const qc = useQueryClient()
  const { toast } = useUI()
  const refresh = () => {
    for (const key of TASK_KEYS) qc.invalidateQueries({ queryKey: key })
  }
  const update = useMutation({
    mutationFn: ({ id, patch }: { id: number; patch: TaskPatch }) => api.patch<Task>(`/api/tasks/${id}`, patch),
    onMutate: async ({ id, patch }) => {
      await qc.cancelQueries({ queryKey: qk.tasks })
      const previous = qc.getQueryData<Task[]>(qk.tasks)
      if (previous) qc.setQueryData<Task[]>(qk.tasks, previous.map((t) => (t.id === id ? ({ ...t, ...patch } as Task) : t)))
      return { previous }
    },
    onError: (err, _vars, ctx) => {
      if (ctx?.previous) qc.setQueryData(qk.tasks, ctx.previous)
      toast(`No se guardó el cambio: ${(err as Error).message}`, 'bad')
    },
    onSettled: refresh,
  })
  const create = useMutation({
    mutationFn: (data: TaskCreate) => api.post<Task>('/api/tasks', data),
    onSuccess: refresh,
    onError: (err) => toast(`No se creó la tarea: ${(err as Error).message}`, 'bad'),
  })
  const comment = useMutation({
    mutationFn: ({ id, text }: { id: number; text: string }) => api.post(`/api/tasks/${id}/comments`, { text }),
    onSuccess: refresh,
    onError: (err) => toast((err as Error).message, 'bad'),
  })
  const followup = useMutation({
    mutationFn: (id: number) => api.post<{ sent: boolean; message: string }>(`/api/tasks/${id}/followup`),
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
  theme?: string
  firstPhase?: string
}

export function useProjectActions() {
  const qc = useQueryClient()
  const { toast } = useUI()
  const refresh = () => {
    for (const key of [qk.projects, qk.project, qk.metrics, qk.phases, qk.tasks, qk.vault]) qc.invalidateQueries({ queryKey: key })
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

/** Cambiar mi estado en la oficina (Trabajando, En reunión, Disponible, Descansando). */
export function usePresenceAction() {
  const qc = useQueryClient()
  const { toast } = useUI()
  return useMutation({
    mutationFn: (body: { state: PresenceState; note?: string; taskId?: number | null }) => api.patch<Presence>('/api/me/presence', body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: qk.presence })
      qc.invalidateQueries({ queryKey: qk.members })
    },
    onError: (err) => toast((err as Error).message, 'bad'),
  })
}

/** Enlace para abrir la nota de una tarea directamente en Obsidian. */
export function obsidianUrl(vaultName: string | null | undefined, path: string | null | undefined) {
  if (!vaultName || !path) return null
  return `obsidian://open?vault=${encodeURIComponent(vaultName)}&file=${encodeURIComponent(path.replace(/\.md$/, ''))}`
}
