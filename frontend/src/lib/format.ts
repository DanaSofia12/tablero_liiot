import type { Task } from '../types'

const MONTHS = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic']
const DAYS = ['dom', 'lun', 'mar', 'mié', 'jue', 'vie', 'sáb']

export function parseDay(iso: string): Date {
  const [y, m, d] = iso.slice(0, 10).split('-').map(Number)
  return new Date(y, m - 1, d)
}

export function toISO(date: Date): string {
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const d = String(date.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

export const todayISO = () => toISO(new Date())

export function addDays(iso: string, days: number): string {
  const d = parseDay(iso)
  d.setDate(d.getDate() + days)
  return toISO(d)
}

export function daysBetween(from: string, to: string): number {
  return Math.round((parseDay(to).getTime() - parseDay(from).getTime()) / 86_400_000)
}

export function fmtDay(iso: string | null | undefined): string {
  if (!iso) return 'sin fecha'
  const d = parseDay(iso)
  return `${DAYS[d.getDay()]} ${d.getDate()} ${MONTHS[d.getMonth()]}`
}

export function fmtShort(iso: string | null | undefined): string {
  if (!iso) return '—'
  const d = parseDay(iso)
  return `${d.getDate()} ${MONTHS[d.getMonth()]}`
}

export const weekdayShort = (iso: string) => DAYS[parseDay(iso).getDay()]

export function relativeDue(iso: string | null, today = todayISO()): string {
  if (!iso) return 'sin fecha'
  const diff = daysBetween(today, iso)
  if (diff === 0) return 'hoy'
  if (diff === 1) return 'mañana'
  if (diff === -1) return 'ayer'
  if (diff < 0) return `hace ${-diff} días`
  if (diff < 7) return `en ${diff} días`
  return fmtDay(iso)
}

export function fmtMoment(isoDateTime: string | null | undefined): string {
  if (!isoDateTime) return ''
  const date = new Date(isoDateTime)
  const now = new Date()
  const minutes = Math.round((now.getTime() - date.getTime()) / 60_000)
  if (minutes < 1) return 'ahora'
  if (minutes < 60) return `hace ${minutes} min`
  const time = date.toLocaleTimeString('es-CO', { hour: 'numeric', minute: '2-digit' })
  if (toISO(date) === toISO(now)) return time
  const yesterday = new Date(now)
  yesterday.setDate(now.getDate() - 1)
  if (toISO(date) === toISO(yesterday)) return `ayer ${time}`
  return `${date.getDate()} ${MONTHS[date.getMonth()]} ${time}`
}

export function greeting(date = new Date()): string {
  const h = date.getHours()
  if (h >= 5 && h < 12) return 'Buenos días'
  if (h >= 12 && h < 19) return 'Buenas tardes'
  return 'Buenas noches'
}

export const isOpen = (t: Task) => t.status !== 'hecha'
export const isOverdue = (t: Task, today = todayISO()) => isOpen(t) && !!t.dueDate && t.dueDate < today

const PRIORITY_RANK: Record<string, number> = { P0: 0, P1: 1, P2: 2, P3: 3 }

/** Bloqueadas primero, luego por fecha y prioridad. */
export function byUrgency(a: Task, b: Task): number {
  const blocked = Number(b.status === 'bloqueada') - Number(a.status === 'bloqueada')
  if (blocked) return blocked
  const da = a.dueDate ?? '9999-12-31'
  const db = b.dueDate ?? '9999-12-31'
  if (da !== db) return da < db ? -1 : 1
  return (PRIORITY_RANK[a.priority] ?? 9) - (PRIORITY_RANK[b.priority] ?? 9)
}

export const EFFORT_POINTS: Record<string, number> = { S: 1, M: 2, L: 3 }
