export type TaskStatus = 'por_hacer' | 'en_progreso' | 'en_revision' | 'bloqueada' | 'hecha'
export type Priority = 'P0' | 'P1' | 'P2' | 'P3'
export type Effort = 'S' | 'M' | 'L'
export type HairStyle = 'wolf' | 'bowl' | 'wavy' | 'long' | 'short' | 'bun'
export type OuterStyle = 'none' | 'denim' | 'overshirt' | 'hoodie'

export interface AvatarCfg {
  hair: HairStyle
  hairColor: string
  skin: string
  eyes: string
  top: string
  outer: string | null
  outerStyle: OuterStyle
  glasses: boolean
  necklace: boolean
  lips: string | null
  lashes?: boolean
}

export interface Member {
  id: string
  name: string
  fullName: string
  role: string
  area: string
  color: string
  capacity: number
  avatar: AvatarCfg
  telegramLinked: boolean
  telegramUsername: string | null
  linkCode: string
  workStart: string
  workEnd: string
  presenceOverride: string | null
  overrideUntil: string | null
  quietUntil: string | null
  order: number
}

export interface Project {
  id: string
  code: string
  name: string
  summary: string
  leadId: string | null
  pilotDate: string | null
  backupDate: string | null
  phase: string
  keyPrefix: string
  theme: string
  color: string
  archived: boolean
  vaultDir: string | null
  order: number
  counts?: { total: number; open: number; done: number; blocked: number }
}

export interface Stage {
  id: number
  projectId: string
  order: number
  name: string
  start: string
  end: string
  exitCriteria: string
}

export interface Task {
  id: number
  key: string
  projectId: string
  phase: string
  vaultPath: string | null
  title: string
  summary: string
  type: string
  priority: Priority
  status: TaskStatus
  ownerId: string
  collaborators: string[]
  startDate: string | null
  dueDate: string | null
  dueOriginal: string | null
  reschedules: number
  stageId: number | null
  rubric: string[]
  effort: Effort
  origin: string
  legacyId: string | null
  blockerReason: string | null
  blockerWaitingOn: string | null
  blockedSince: string | null
  progress: number
  archived: boolean
  createdAt: string
  updatedAt: string
  completedAt: string | null
  sort: number
}

export type TaskPatch = Partial<
  Pick<
    Task,
    | 'title'
    | 'summary'
    | 'type'
    | 'priority'
    | 'status'
    | 'ownerId'
    | 'collaborators'
    | 'startDate'
    | 'dueDate'
    | 'stageId'
    | 'rubric'
    | 'effort'
    | 'progress'
    | 'blockerReason'
    | 'blockerWaitingOn'
    | 'archived'
    | 'sort'
    | 'phase'
  >
>

export interface VaultStatus {
  enabled: boolean
  path: string
  detected: string | null
  root: string | null
  vaultName: string | null
  connected: boolean
  lastSync: string | null
  lastError: string | null
  busy: boolean
  stats: { projects?: number; notes?: number }
  linkedTasks: number
  linkedProjects: number
  activity: { at: string; text: string }[]
}

export interface TaskBrief {
  id: number
  key: string
  title: string
  status: TaskStatus
  priority: Priority
  type: string
  dueDate: string | null
}

export interface TaskEvent {
  id: number
  taskId: number
  at: string
  actor: string
  source: string
  kind: string
  text: string
}

export interface TaskType {
  id: string
  label: string
  icon: string
  color: string
  activity: string
}

export interface Catalog {
  taskTypes: TaskType[]
  statuses: { id: TaskStatus; label: string }[]
  priorities: { id: Priority; label: string }[]
  criterionStates: string[]
  weekdays: string[]
  presenceOverrides: string[]
}

export type CriterionState = 'pendiente' | 'cumple' | 'parcial' | 'no_cumple'

export interface Criterion {
  id: number
  categoryId: number
  code: string
  title: string
  verify: string
  blocking: boolean
  state: CriterionState
  ownerId: string | null
  notes: string
  order: number
  updatedAt: string | null
  taskKeys: string[]
}

export interface RubricCategory {
  id: number
  name: string
  order: number
  criteria: Criterion[]
}

export type Decision = 'lanzar' | 'lanzar_con_riesgo' | 'no_lanzar'

export interface Verdict {
  decision: Decision
  blockingOk: number
  blockingTotal: number
  othersOk: number
  othersTotal: number
  othersPct: number
  threshold: number
  partial: number
  failing: number
  readinessPct: number
}

export interface Review {
  id: number
  at: string
  reviewerId: string
  decision: Decision
  blockingOk: number
  blockingTotal: number
  othersOk: number
  othersTotal: number
  notes: string
}

export interface Rubric {
  categories: RubricCategory[]
  verdict: Verdict
  reviews: Review[]
}

export interface Workload {
  memberId: string
  points: number
  capacity: number
  pct: number
  zone: 'verde' | 'amarillo' | 'rosa'
  open: number
  undated: number
  inProgress: number
  inReview: number
  blocked: number
  overdue: number
  done7d: number
  doneTotal: number
  current: TaskBrief | null
  next: TaskBrief[]
  mix: Record<string, number>
  dueByDay: Record<string, number>
}

export interface ProjectMetrics {
  projectId: string
  today: string
  health: 'verde' | 'amarillo' | 'rojo'
  healthReasons: string[]
  daysToPilot: number | null
  tasksTotal: number
  tasksDone: number
  doneThisWeek: number
  inProgress: number
  inReview: number
  overdue: number
  blocked: number
  rescheduled: number
  verdict: Verdict
  currentStageId: number | null
}

export interface Suggestion {
  taskId: number
  taskKey: string
  taskTitle: string
  fromId: string
  toId: string
  text: string
}

export interface Metrics {
  project: ProjectMetrics
  team: Workload[]
  suggestions: Suggestion[]
}

export type PresenceState = 'trabajando' | 'bloqueado' | 'revision' | 'celebrando' | 'disponible' | 'reunion' | 'foco' | 'fuera'

export interface Presence {
  memberId: string
  state: PresenceState
  task: TaskBrief | null
  detail: string
  activity: string
}

export interface TelegramSettings {
  groupChatId: number | null
  groupTitle: string | null
  weeklyEnabled: boolean
  weeklyDay: number
  weeklyTime: string
  dueReminders: boolean
  dueTime: string
  blockerAlerts: boolean
  groupWeeklySummary: boolean
  groupCelebrations: boolean
  groupBlockers: boolean
  ceoId: string
  maxDaily: number
}

export interface TelegramStatus {
  tokenConfigured: boolean
  running: boolean
  botUsername: string | null
  error: string | null
  nextWeekly: string | null
  group: { linked: boolean; title: string | null }
  members: { id: string; linked: boolean; username: string | null; deepLink: string | null; code: string }[]
}

export interface CheckIn {
  id: number
  at: string
  memberId: string | null
  taskId: number | null
  kind: string
  chat: string
  text: string
  answer: string | null
  answeredAt: string | null
}
