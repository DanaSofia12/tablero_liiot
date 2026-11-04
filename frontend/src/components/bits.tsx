import { useMemo, type ReactNode } from 'react'
import {
  BookOpen,
  CalendarClock,
  Check as CheckIcon,
  Circle,
  CircleCheckBig,
  CircleDashed,
  CirclePause,
  Code,
  Coffee,
  FlaskConical,
  Handshake,
  ListChecks,
  type LucideIcon,
  Megaphone,
  Moon,
  Palette,
  Phone,
  Scale,
  ShieldCheck,
  Users,
} from 'lucide-react'
import { useCatalog, useMe, useMembers, usePresence, usePresenceAction } from '../api'
import { relativeDue, todayISO } from '../lib/format'
import type { Member, PresenceState, Priority, Task, TaskStatus, TaskType } from '../types'
import { Avatar } from './Avatar'

export const TYPE_ICON: Record<string, LucideIcon> = {
  handshake: Handshake,
  code: Code,
  palette: Palette,
  megaphone: Megaphone,
  'list-checks': ListChecks,
  'shield-check': ShieldCheck,
  scale: Scale,
  'book-open': BookOpen,
}

export const STATUS_META: Record<TaskStatus, { label: string; column: string; icon: LucideIcon; color: string }> = {
  pendiente: { label: 'Pendiente', column: 'Pendientes', icon: Circle, color: '#9a93b0' },
  en_progreso: { label: 'En progreso', column: 'En progreso', icon: CircleDashed, color: '#9b5de5' },
  en_pausa: { label: 'En pausa', column: 'En pausa', icon: CirclePause, color: '#f0a93b' },
  pruebas: { label: 'Pruebas', column: 'Pruebas', icon: FlaskConical, color: '#3b8cf6' },
  finalizada: { label: 'Finalizada', column: 'Finalizadas', icon: CircleCheckBig, color: '#22a06b' },
}
export const STATUS_ORDER: TaskStatus[] = ['pendiente', 'en_progreso', 'en_pausa', 'pruebas', 'finalizada']

export const PRIORITY_META: Record<Priority, { label: string; color: string }> = {
  P0: { label: 'Crítica', color: '#f0445b' },
  P1: { label: 'Alta', color: '#ff7a2f' },
  P2: { label: 'Media', color: '#f5b83d' },
  P3: { label: 'Baja', color: '#3fbf8a' },
}
export const PRIORITY_ORDER: Priority[] = ['P3', 'P2', 'P1', 'P0']

export const PRESENCE_META: Record<PresenceState, { label: string; icon: LucideIcon; color: string }> = {
  trabajando: { label: 'Trabajando', icon: Code, color: '#9b5de5' },
  en_reunion: { label: 'En reunión', icon: Users, color: '#38bdf8' },
  disponible: { label: 'Disponible', icon: Coffee, color: '#34d399' },
  descansando: { label: 'Descansando', icon: Moon, color: '#a39db5' },
}
export const PRESENCE_ORDER: PresenceState[] = ['trabajando', 'en_reunion', 'disponible', 'descansando']

/** Ícono de actividad según el tipo de tarea en curso (lo que «hace» el avatar). */
export const ACTIVITY_ICON: Record<string, LucideIcon> = {
  negocio: Phone,
  desarrollo: Code,
  diseno: Palette,
  marketing: Megaphone,
  gestion: ListChecks,
  calidad: ShieldCheck,
  legal: Scale,
  investigacion: BookOpen,
}

export function useMemberMap(): Record<string, Member> {
  const { data } = useMembers()
  return useMemo(() => Object.fromEntries((data ?? []).map((m) => [m.id, m])), [data])
}

export function useTypeMap(): Record<string, TaskType> {
  const { data } = useCatalog()
  return useMemo(() => Object.fromEntries((data?.taskTypes ?? []).map((t) => [t.id, t])), [data])
}

export function TypeChip({ type }: { type: string }) {
  const types = useTypeMap()
  const t = types[type]
  if (!t) return null
  const Icon = TYPE_ICON[t.icon] ?? Circle
  return (
    <span className="chip type-chip" style={{ ['--c' as string]: t.color }}>
      <Icon aria-hidden /> {t.label}
    </span>
  )
}

/** Prioridad con su nombre completo y su color. */
export function Prio({ p, compact = false }: { p: Priority; compact?: boolean }) {
  const meta = PRIORITY_META[p] ?? PRIORITY_META.P2
  return (
    <span className={`prio${compact ? ' compact' : ''}`} data-p={p} style={{ ['--pc' as string]: meta.color }} title={`Prioridad ${meta.label.toLowerCase()}`}>
      <i aria-hidden />
      {meta.label}
    </span>
  )
}

export function StatusChip({ s }: { s: TaskStatus }) {
  const meta = STATUS_META[s] ?? STATUS_META.pendiente
  const Icon = meta.icon
  return (
    <span className="chip status-chip" style={{ ['--c' as string]: meta.color }}>
      <Icon aria-hidden /> {meta.label}
    </span>
  )
}

export function Due({ task, today = todayISO() }: { task: Pick<Task, 'dueDate' | 'status'>; today?: string }) {
  if (!task.dueDate) return <span className="due muted">sin fecha</span>
  const done = task.status === 'finalizada'
  const late = !done && task.dueDate < today
  const soon = !late && !done && task.dueDate <= today
  return (
    <span className={`due${late ? ' late' : soon ? ' soon' : ''}`} title={task.dueDate}>
      <CalendarClock aria-hidden /> {late ? `venció ${relativeDue(task.dueDate, today)}` : relativeDue(task.dueDate, today)}
    </span>
  )
}

export function PresenceChip({ state }: { state: PresenceState }) {
  const meta = PRESENCE_META[state] ?? PRESENCE_META.disponible
  const Icon = meta.icon
  return (
    <span className="chip presence-chip" style={{ ['--c' as string]: meta.color }}>
      <Icon aria-hidden /> {meta.label}
    </span>
  )
}

/** Mi estado en la oficina: los cuatro estados y una línea que dice de dónde sale. */
export function StatePicker() {
  const me = useMe()
  const presence = usePresence().data ?? []
  const setPresence = usePresenceAction()
  const pres = presence.find((p) => p.memberId === me.id)
  return (
    <>
      <div className="state-pick" role="radiogroup" aria-label="Mi estado">
        {PRESENCE_ORDER.map((s) => {
          const meta = PRESENCE_META[s]
          const Icon = meta.icon
          return (
            <button
              key={s}
              type="button"
              role="radio"
              aria-checked={pres?.state === s}
              style={{ ['--c' as string]: meta.color }}
              onClick={() => setPresence.mutate({ state: s, note: s === 'trabajando' ? pres?.note : undefined, taskId: s === 'trabajando' ? pres?.task?.id : undefined })}
            >
              <Icon aria-hidden /> {meta.label}
            </button>
          )
        })}
      </div>
      <small className="muted state-note">
        {pres?.auto
          ? pres.inSchedule
            ? 'Automático: aún no has dicho en qué estás hoy.'
            : 'Automático: estás fuera de tu horario.'
          : pres?.task
            ? `En «${pres.task.title}»`
            : pres?.note
              ? `En «${pres.note}»`
              : 'Lo elegiste tú; mañana vuelve a lo automático.'}
      </small>
    </>
  )
}

export function MemberHead({ member, size = 28, mood }: { member?: Member; size?: number; mood?: 'smile' | 'flat' | 'sleep' | 'open' }) {
  if (!member?.avatar) return <span className="ava" style={{ width: size, height: size }} />
  return <Avatar avatar={member.avatar} color={member.color} size={size} mood={mood} title={`${member.name} · ${member.role}`} />
}

export function Meter({ pct, zone, label }: { pct: number; zone?: string; label?: string }) {
  return (
    <div className={`meter ${zone ?? ''}`} role="meter" aria-valuemin={0} aria-valuemax={100} aria-valuenow={pct} aria-label={label}>
      <i style={{ width: `${Math.max(3, Math.min(100, pct))}%` }} />
    </div>
  )
}

/** Avance del checklist de una tarea: «3/5» con una barrita. */
export function ChecklistProgress({ task, wide = false }: { task: Pick<Task, 'checklist' | 'progress'>; wide?: boolean }) {
  const total = task.checklist?.length ?? 0
  if (!total) return null
  const done = task.checklist.filter((i) => i.done).length
  return (
    <span className={`cl-progress${wide ? ' wide' : ''}${done === total ? ' full' : ''}`} title={`Checklist: ${done} de ${total} listos`}>
      <ListChecks aria-hidden />
      <span className="bar">
        <i style={{ width: `${(done * 100) / total}%` }} />
      </span>
      <b>
        {done}/{total}
      </b>
    </span>
  )
}

/** Casilla redonda y suave para marcar algo como listo. */
export function Check({ checked, onChange, label, size = 22 }: { checked: boolean; onChange: (v: boolean) => void; label: string; size?: number }) {
  return (
    <button
      type="button"
      className={`checkbox${checked ? ' on' : ''}`}
      style={{ width: size, height: size }}
      role="checkbox"
      aria-checked={checked}
      aria-label={label}
      onClick={(e) => {
        e.stopPropagation()
        onChange(!checked)
      }}
    >
      <CheckIcon aria-hidden strokeWidth={3} />
    </button>
  )
}

export function Panel({ title, icon, actions, children, className = '' }: { title?: ReactNode; icon?: ReactNode; actions?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <section className={`panel pad ${className}`}>
      {(title || actions) && (
        <div className="panel-head">
          {icon}
          {title && <h2>{title}</h2>}
          <span className="grow" />
          {actions}
        </div>
      )}
      {children}
    </section>
  )
}

export function Toggle({ checked, onChange, label }: { checked: boolean; onChange: (v: boolean) => void; label: string }) {
  return <button type="button" className="toggle" role="switch" aria-checked={checked} aria-label={label} onClick={() => onChange(!checked)} />
}

export function Empty({ children }: { children: ReactNode }) {
  return <p className="empty">{children}</p>
}

/** Elegir la prioridad con su nombre y su color (de menor a mayor). */
export function PrioPicker({ value, onChange }: { value: Priority; onChange: (p: Priority) => void }) {
  return (
    <div className="prio-pick" role="radiogroup" aria-label="Prioridad">
      {PRIORITY_ORDER.map((p) => (
        <button key={p} type="button" role="radio" aria-checked={value === p} style={{ ['--pc' as string]: PRIORITY_META[p].color }} onClick={() => onChange(p)}>
          <i aria-hidden />
          {PRIORITY_META[p].label}
        </button>
      ))}
    </div>
  )
}
