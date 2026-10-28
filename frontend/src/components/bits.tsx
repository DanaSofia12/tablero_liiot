import { useMemo, type ReactNode } from 'react'
import {
  Ban,
  BookOpen,
  CalendarClock,
  Circle,
  CircleCheck,
  CircleDashed,
  Code,
  Coffee,
  Handshake,
  Headphones,
  Hourglass,
  ListChecks,
  type LucideIcon,
  Megaphone,
  MessageCircle,
  Moon,
  Palette,
  PartyPopper,
  Phone,
  Scale,
  ShieldCheck,
} from 'lucide-react'
import { useCatalog, useMembers } from '../api'
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

export const STATUS_META: Record<TaskStatus, { label: string; icon: LucideIcon; color: string }> = {
  por_hacer: { label: 'Por hacer', icon: Circle, color: '#8f88a6' },
  en_progreso: { label: 'En progreso', icon: CircleDashed, color: '#8b45cc' },
  en_revision: { label: 'En revisión', icon: Hourglass, color: '#3b82f6' },
  bloqueada: { label: 'Bloqueada', icon: Ban, color: '#e8435f' },
  hecha: { label: 'Hecha', icon: CircleCheck, color: '#16a34a' },
}
export const STATUS_ORDER: TaskStatus[] = ['por_hacer', 'en_progreso', 'bloqueada', 'en_revision', 'hecha']

export const PRESENCE_META: Record<PresenceState, { label: string; icon: LucideIcon; color: string }> = {
  trabajando: { label: 'Trabajando', icon: Code, color: '#a874ec' },
  foco: { label: 'Modo foco', icon: Headphones, color: '#a874ec' },
  bloqueado: { label: 'Bloqueado', icon: Ban, color: '#fb5a7a' },
  revision: { label: 'En revisión', icon: Hourglass, color: '#60a5fa' },
  celebrando: { label: '¡Terminó!', icon: PartyPopper, color: '#ffb547' },
  disponible: { label: 'Disponible', icon: Coffee, color: '#34d399' },
  reunion: { label: 'En reunión', icon: MessageCircle, color: '#38bdf8' },
  fuera: { label: 'Fuera de horario', icon: Moon, color: '#a39db5' },
}

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

export function Prio({ p }: { p: Priority }) {
  const label = { P0: 'Crítica', P1: 'Alta', P2: 'Media', P3: 'Baja' }[p]
  return (
    <span className={`prio ${p}`} title={`Prioridad ${label}`}>
      {p}
    </span>
  )
}

export function StatusChip({ s }: { s: TaskStatus }) {
  const meta = STATUS_META[s]
  const Icon = meta.icon
  return (
    <span className="chip status-chip" data-s={s}>
      <Icon aria-hidden /> {meta.label}
    </span>
  )
}

export function Due({ task, today = todayISO() }: { task: Pick<Task, 'dueDate' | 'status'>; today?: string }) {
  if (!task.dueDate) return <span className="due muted">sin fecha</span>
  const late = task.status !== 'hecha' && task.dueDate < today
  const soon = !late && task.status !== 'hecha' && task.dueDate <= today
  return (
    <span className={`due${late ? ' late' : soon ? ' soon' : ''}`} title={task.dueDate}>
      <CalendarClock aria-hidden /> {late ? `venció ${relativeDue(task.dueDate, today)}` : relativeDue(task.dueDate, today)}
    </span>
  )
}

export function PresenceChip({ state }: { state: PresenceState }) {
  const meta = PRESENCE_META[state]
  const Icon = meta.icon
  return (
    <span className="chip presence-chip" data-p={state}>
      <Icon aria-hidden /> {meta.label}
    </span>
  )
}

export function MemberHead({ member, size = 28, mood }: { member?: Member; size?: number; mood?: 'smile' | 'flat' | 'sleep' | 'open' }) {
  if (!member) return <span className="ava" style={{ width: size, height: size }} />
  return <Avatar avatar={member.avatar} color={member.color} size={size} mood={mood} title={`${member.name} · ${member.role}`} />
}

export function Meter({ pct, zone, label }: { pct: number; zone?: string; label?: string }) {
  return (
    <div className={`meter ${zone ?? ''}`} role="meter" aria-valuemin={0} aria-valuemax={100} aria-valuenow={pct} aria-label={label}>
      <i style={{ width: `${Math.max(3, Math.min(100, pct))}%` }} />
    </div>
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
