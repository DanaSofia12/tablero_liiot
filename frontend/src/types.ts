export type TaskStatus = 'pendiente' | 'en_progreso' | 'en_pausa' | 'pruebas' | 'finalizada'
export type Priority = 'P0' | 'P1' | 'P2' | 'P3'
export type HairStyle = 'wolf' | 'bowl' | 'wavy' | 'long' | 'short' | 'bun'
export type OuterStyle = 'none' | 'denim' | 'overshirt' | 'hoodie'
export type PresenceState = 'trabajando' | 'en_reunion' | 'disponible' | 'descansando'
export type Theme = 'liiot' | 'bleepy'

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
  avatar: AvatarCfg
  telegramLinked: boolean
  workStart: string
  workEnd: string
  workDays: number[]
  quietUntil: string | null
  order: number
  hasAccount: boolean
  isAdmin: boolean
  // solo en la cuenta propia (o para quien administra)
  username?: string | null
  email?: string | null
  active?: boolean
  telegramUsername?: string | null
  linkCode?: string
  lastLoginAt?: string | null
}

export interface Account extends Member {
  pendingCode: { kind: string; expiresAt: string } | null
}

export interface AuthState {
  appName: string
  needsSetup: boolean
  me: Member | null
  people: { id: string; name: string; role: string }[]
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
  theme: Theme
  color: string
  archived: boolean
  vaultDir: string | null
  order: number
  currentPhaseId: number | null
  currentPhaseName: string | null
  counts?: { total: number; open: number; done: number; paused: number; overdue: number }
}

export interface Stage {
  id: number
  projectId: string
  phaseId: number | null
  order: number
  name: string
  start: string
  end: string
  exitCriteria: string
}

export interface PhaseBrief {
  id: number
  name: string
  key: string
  status: PhaseStatus
  order: number
  start: string | null
  end: string | null
}

export type PhaseStatus = 'pendiente' | 'en_curso' | 'completada'

export interface PhaseCheck {
  id: number
  phaseId: number
  text: string
  done: boolean
  doneBy: string | null
  doneAt: string | null
  order: number
}

export interface StageRow extends Stage {
  tasksTotal: number
  tasksDone: number
  now: boolean
  past: boolean
}

export interface Gate {
  checksDone: number
  checksTotal: number
  tasksOpen: number
  tasksTotal: number
  tasksDone: number
  rubric: Verdict | null
  missing: string[]
  ready: boolean
}

export interface Phase {
  id: number
  projectId: string
  order: number
  key: string
  name: string
  goal: string
  status: PhaseStatus
  start: string | null
  end: string | null
  useRubric: boolean
  threshold: number
  validatedAt: string | null
  validatedBy: string | null
  validationNote: string
  checks: PhaseCheck[]
  stages: StageRow[]
  unstagedTasks: number
  gate: Gate
}

export interface PhasesData {
  projectId: string
  currentPhaseId: number | null
  phases: Phase[]
  unphasedTasks: number
}

export interface ChecklistItem {
  id: string
  text: string
  done: boolean
}

export interface Task {
  id: number
  key: string
  projectId: string
  phaseId: number | null
  stageId: number | null
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
  origin: string
  legacyId: string | null
  blockerReason: string | null
  blockerWaitingOn: string | null
  blockedSince: string | null
  checklist: ChecklistItem[]
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
    | 'phaseId'
    | 'blockerReason'
    | 'blockerWaitingOn'
    | 'archived'
    | 'sort'
  >
> & { checklist?: Partial<ChecklistItem>[] }

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
  projectId: string
  daysLate?: number
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
  priorities: { id: Priority; label: string; color: string }[]
  criterionStates: string[]
  weekdays: string[]
  presenceStates: { id: PresenceState; label: string }[]
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
  total: number
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
  phaseId: number
  categories: RubricCategory[]
  verdict: Verdict
  reviews: Review[]
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
  testing: number
  overdue: number
  paused: number
  verdict: Verdict | null
  currentPhaseId: number | null
  currentPhaseName: string | null
  currentStageId: number | null
  currentStageName: string | null
}

export interface ProjectData {
  project: Project
  stages: Stage[]
  phases: PhaseBrief[]
  metrics: ProjectMetrics
}

export interface Presence {
  memberId: string
  state: PresenceState
  label: string
  auto: boolean
  inSchedule: boolean
  note: string
  task: TaskBrief | null
  activity: string
  since: string | null
}

export interface MonthLoad {
  month: string
  label: string
  assigned: number
  done: number
  late: number
  current: boolean
}

export interface Overlap {
  start: string
  end: string
  peak: number
  tasks: TaskBrief[]
}

export interface PersonAnalysis {
  memberId: string
  counts: {
    pending: number
    inProgress: number
    paused: number
    testing: number
    open: number
    overdue: number
    dueThisWeek: number
    doneThisMonth: number
    doneTotal: number
    undated: number
  }
  onTimePct: number | null
  onTimeBase: number
  byMonth: MonthLoad[]
  overlaps: Overlap[]
  heavyDays: { day: string; count: number; tasks: TaskBrief[] }[]
  overdue: TaskBrief[]
  next: TaskBrief[]
}

export interface WeekPoint {
  weekStart: string
  weekEnd: string
  label: string
  future: boolean
  current: boolean
  planned: number
  done: number | null
  scope: number
  doneWeek: Record<string, number> | null
}

export interface TeamData {
  projectId: string | null
  today: string
  totals: {
    open: number
    overdue: number
    paused: number
    testing: number
    doneThisMonth: number
    done: number
    total: number
    dueSoFar: number
    dueSoFarDone: number
    onTimeDue: number
    lateDue: number
  }
  people: PersonAnalysis[]
  weeks: WeekPoint[]
}

export interface TelegramSettings {
  groupChatId: number | null
  groupTitle: string | null
  groupNewTasks: boolean
  groupCelebrations: boolean
  groupTesting: boolean
  groupCountdown: boolean
  groupOverdue: boolean
  groupPhases: boolean
  groupBlockers: boolean
  groupWeeklySummary: boolean
  groupTime: string
  dailyCheckin: boolean
  dueReminders: boolean
  dueTime: string
  blockerAlerts: boolean
  maxDaily: number
  weeklyEnabled: boolean
  weeklyDay: number
  weeklyTime: string
  ceoId: string
}

export interface TelegramStatus {
  tokenConfigured: boolean
  running: boolean
  botUsername: string | null
  error: string | null
  nextWeekly: string | null
  group: { linked: boolean; title: string | null }
  members: { id: string; linked: boolean; username: string | null; deepLink: string | null; code: string | null }[]
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
