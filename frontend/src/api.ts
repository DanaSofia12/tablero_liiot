import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { usePrefs } from './prefs'
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
} from './types'

async function http<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(path, { headers: { 'Content-Type': 'application/json' }, ...init })
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
}

export const qk = {
  catalog: ['catalog'] as const,
  members: ['members'] as const,
  project: ['project'] as const,
  tasks: ['tasks'] as const,
  metrics: ['metrics'] as const,
  presence: ['presence'] as const,
  rubric: ['rubric'] as const,
  telegram: ['telegram'] as const,
  checkins: ['checkins'] as const,
  events: ['events'] as const,
}

export const useCatalog = () =>
  useQuery({ queryKey: qk.catalog, queryFn: () => api.get<Catalog>('/api/catalog'), staleTime: Infinity })
export const useMembers = () => useQuery({ queryKey: qk.members, queryFn: () => api.get<Member[]>('/api/members') })
export const useProject = () =>
  useQuery({ queryKey: qk.project, queryFn: () => api.get<{ project: Project; stages: Stage[] }>('/api/project') })
export const useTasks = () => useQuery({ queryKey: qk.tasks, queryFn: () => api.get<Task[]>('/api/tasks') })
export const useMetrics = () => useQuery({ queryKey: qk.metrics, queryFn: () => api.get<Metrics>('/api/metrics') })
export const useRubric = () => useQuery({ queryKey: qk.rubric, queryFn: () => api.get<Rubric>('/api/rubric') })
export const useTelegram = () =>
  useQuery({
    queryKey: qk.telegram,
    queryFn: () => api.get<{ settings: TelegramSettings; status: TelegramStatus }>('/api/telegram'),
  })
export const useCheckins = () => useQuery({ queryKey: qk.checkins, queryFn: () => api.get<CheckIn[]>('/api/checkins') })

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

export function useTaskActions() {
  const qc = useQueryClient()
  const { me } = usePrefs()
  const refresh = () => {
    for (const key of [qk.tasks, qk.metrics, qk.presence, qk.rubric, qk.events]) qc.invalidateQueries({ queryKey: key })
  }
  const update = useMutation({
    mutationFn: ({ id, patch }: { id: number; patch: TaskPatch }) => api.patch<Task>(`/api/tasks/${id}`, { ...patch, actorId: me }),
    onMutate: async ({ id, patch }) => {
      await qc.cancelQueries({ queryKey: qk.tasks })
      const previous = qc.getQueryData<Task[]>(qk.tasks)
      if (previous) qc.setQueryData<Task[]>(qk.tasks, previous.map((t) => (t.id === id ? { ...t, ...patch } : t)))
      return { previous }
    },
    onError: (_err, _vars, ctx) => {
      if (ctx?.previous) qc.setQueryData(qk.tasks, ctx.previous)
    },
    onSettled: refresh,
  })
  const create = useMutation({
    mutationFn: (data: TaskCreate) => api.post<Task>('/api/tasks', { ...data, actorId: me }),
    onSuccess: refresh,
  })
  const comment = useMutation({
    mutationFn: ({ id, text }: { id: number; text: string }) => api.post(`/api/tasks/${id}/comments`, { text, actorId: me }),
    onSuccess: refresh,
  })
  const followup = useMutation({
    mutationFn: (id: number) => api.post<{ sent: boolean; message: string }>(`/api/tasks/${id}/followup`, { actorId: me }),
    onSuccess: () => qc.invalidateQueries({ queryKey: qk.checkins }),
  })
  return { update, create, comment, followup }
}
