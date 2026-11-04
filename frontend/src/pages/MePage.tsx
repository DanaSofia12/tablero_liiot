import { useMemo, useState } from 'react'
import { CalendarDays, ChevronLeft, ChevronRight, ListTodo } from 'lucide-react'
import { useMe, usePresence, useProjects, useTaskActions, useTasks } from '../api'
import { Avatar, type Mood } from '../components/Avatar'
import { ThermalStar } from '../components/Brand'
import { ChecklistProgress, Check, Due, Empty, Panel, Prio, PRIORITY_META, StatePicker, StatusChip } from '../components/bits'
import { addMonths, byUrgency, fmtDay, greeting, monthLabel, parseDay, plural, toISO, todayISO } from '../lib/format'
import { useUI } from '../ui'
import type { PresenceState, Task } from '../types'

const MOOD: Partial<Record<PresenceState, Mood>> = { descansando: 'sleep', en_reunion: 'open' }
const WEEK = ['lun', 'mar', 'mié', 'jue', 'vie', 'sáb', 'dom']

/** Lo mío y de nadie más: lo pendiente para hoy, mi calendario y mi estado en la oficina. */
export default function MePage() {
  const me = useMe()
  const tasks = useTasks().data ?? []
  const projects = useProjects().data ?? []
  const presence = usePresence().data ?? []
  const { openTask, toast } = useUI()
  const { update } = useTaskActions()
  const today = todayISO()
  const [month, setMonth] = useState(today.slice(0, 7) + '-01')
  const [day, setDay] = useState(today)

  const mine = useMemo(() => tasks.filter((t) => t.ownerId === me.id), [tasks, me.id])
  const open = mine.filter((t) => t.status !== 'finalizada').sort(byUrgency)
  const overdue = open.filter((t) => t.dueDate && t.dueDate < today)
  const pending = open.filter((t) => (t.dueDate && t.dueDate <= today) || t.status === 'en_progreso' || t.status === 'en_pausa' || t.status === 'pruebas')
  const coming = open.filter((t) => !pending.includes(t) && t.dueDate).slice(0, 6)
  const rest = open.filter((t) => !pending.includes(t) && !coming.includes(t))
  const doneWeek = mine.filter((t) => t.completedAt && Date.now() - new Date(t.completedAt).getTime() < 7 * 86_400_000).length
  const pres = presence.find((p) => p.memberId === me.id)
  const projectName = (id: string) => projects.find((p) => p.id === id)?.name ?? ''
  const nextKey = projects.filter((p) => p.pilotDate && p.pilotDate >= today).sort((a, b) => (a.pilotDate ?? '').localeCompare(b.pilotDate ?? ''))[0]

  const finish = (t: Task, done: boolean) => {
    const previous = t.status
    update.mutate(
      { id: t.id, patch: { status: done ? 'finalizada' : 'en_progreso' } },
      { onSuccess: () => done && toast(`🎉 «${t.title}» quedó finalizada`, 'party', { label: 'Deshacer', run: () => update.mutate({ id: t.id, patch: { status: previous } }) }) },
    )
  }

  return (
    <div className="page me">
      <section className="me-hero panel">
        <ThermalStar className="thermal-star" />
        <Avatar avatar={me.avatar} color={me.color} variant="full" size={92} mood={MOOD[pres?.state ?? 'disponible'] ?? 'smile'} title={me.name} />
        <div className="me-hello">
          <h1>
            {greeting()}, {me.name}
          </h1>
          <p>
            {open.length === 0
              ? 'No tienes tareas abiertas. ✨'
              : `Tienes ${plural(open.length, 'tarea abierta', 'tareas abiertas')}${overdue.length ? `, ${plural(overdue.length, 'atrasada', 'atrasadas')}` : ''}.`}
            {nextKey ? ` ${nextKey.name}: faltan ${Math.max(0, Math.round((parseDay(nextKey.pilotDate!).getTime() - parseDay(today).getTime()) / 86_400_000))} días para la fecha clave.` : ''}
          </p>
          <div className="me-numbers">
            <span>
              <b>{pending.length}</b> para hoy
            </span>
            <span className={overdue.length ? 'late' : ''}>
              <b>{overdue.length}</b> atrasadas
            </span>
            <span>
              <b>{doneWeek}</b> finalizadas esta semana
            </span>
          </div>
        </div>
        <div className="me-state">
          <span className="field-label">Mi estado en la oficina</span>
          <StatePicker />
        </div>
      </section>

      <div className="me-grid">
        <Panel title="Mis pendientes" icon={<ListTodo size={18} className="acc" />} className="me-todo">
          <div className="todo-scroll">
            {pending.length === 0 && <Empty>Nada pendiente para hoy. ✨</Empty>}
            {pending.map((t) => (
              <TodoRow key={t.id} t={t} project={projectName(t.projectId)} today={today} onOpen={() => openTask(t.id)} onDone={(v) => finish(t, v)} />
            ))}
            {coming.length > 0 && (
              <>
                <span className="todo-sep">Lo que viene</span>
                {coming.map((t) => (
                  <TodoRow key={t.id} t={t} project={projectName(t.projectId)} today={today} onOpen={() => openTask(t.id)} onDone={(v) => finish(t, v)} compact />
                ))}
              </>
            )}
            {rest.length > 0 && (
              <p className="muted small more">
                Y {plural(rest.length, 'tarea más', 'tareas más')}
                {rest.every((t) => !t.dueDate) ? ' sin fecha: las ves en Tareas.' : ' después: las ves en el calendario.'}
              </p>
            )}
          </div>
        </Panel>

        <Panel
          title="Mi calendario"
          icon={<CalendarDays size={18} className="acc" />}
          actions={
            <div className="row" style={{ gap: 4 }}>
              <button type="button" className="btn icon sm ghost" onClick={() => setMonth(addMonths(month, -1))} aria-label="Mes anterior">
                <ChevronLeft size={16} />
              </button>
              <b className="cal-month">{monthLabel(parseDay(month).getFullYear(), parseDay(month).getMonth())}</b>
              <button type="button" className="btn icon sm ghost" onClick={() => setMonth(addMonths(month, 1))} aria-label="Mes siguiente">
                <ChevronRight size={16} />
              </button>
              <button type="button" className="btn sm ghost" onClick={() => (setMonth(today.slice(0, 7) + '-01'), setDay(today))}>
                Hoy
              </button>
            </div>
          }
        >
          <Calendar month={month} today={today} day={day} tasks={mine} onPick={setDay} />
          <div className="cal-day">
            <b>{day === today ? 'Hoy' : fmtDay(day)}</b>
            {mine.filter((t) => t.dueDate === day).length === 0 && <span className="muted small">Nada tuyo vence este día.</span>}
            {mine
              .filter((t) => t.dueDate === day)
              .sort(byUrgency)
              .map((t) => (
                <TodoRow key={t.id} t={t} project={projectName(t.projectId)} today={today} onOpen={() => openTask(t.id)} onDone={(v) => finish(t, v)} compact />
              ))}
          </div>
        </Panel>
      </div>
    </div>
  )
}

function TodoRow({ t, project, today, onOpen, onDone, compact }: { t: Task; project: string; today: string; onOpen: () => void; onDone: (v: boolean) => void; compact?: boolean }) {
  const done = t.status === 'finalizada'
  return (
    <div className={`todo${done ? ' done' : ''}${compact ? ' compact' : ''}`} style={{ ['--pc' as string]: PRIORITY_META[t.priority].color }}>
      <Check checked={done} onChange={onDone} label={done ? `Reabrir «${t.title}»` : `Finalizar «${t.title}»`} size={compact ? 20 : 24} />
      <button type="button" className="todo-main" onClick={onOpen}>
        <b>{t.title}</b>
        <span className="todo-meta">
          <Prio p={t.priority} compact />
          {t.status !== 'pendiente' && !done && <StatusChip s={t.status} />}
          {!done && <Due task={t} today={today} />}
          <ChecklistProgress task={t} />
          {project && <span className="todo-project">{project}</span>}
        </span>
      </button>
    </div>
  )
}

function Calendar({ month, today, day, tasks, onPick }: { month: string; today: string; day: string; tasks: Task[]; onPick: (d: string) => void }) {
  const first = parseDay(month)
  const offset = (first.getDay() + 6) % 7
  const daysIn = new Date(first.getFullYear(), first.getMonth() + 1, 0).getDate()
  const cells: (string | null)[] = [...Array(offset).fill(null), ...Array.from({ length: daysIn }, (_, i) => toISO(new Date(first.getFullYear(), first.getMonth(), i + 1)))]
  while (cells.length % 7) cells.push(null)
  const byDay = new Map<string, Task[]>()
  for (const t of tasks) if (t.dueDate) byDay.set(t.dueDate, [...(byDay.get(t.dueDate) ?? []), t])
  return (
    <div className="cal" role="grid" aria-label="Calendario de mis tareas">
      {WEEK.map((w) => (
        <span key={w} className="cal-wd">
          {w}
        </span>
      ))}
      {cells.map((iso, i) => {
        if (!iso) return <span key={`x${i}`} className="cal-cell empty" />
        const items = byDay.get(iso) ?? []
        const late = items.some((t) => t.status !== 'finalizada' && iso < today)
        const allDone = items.length > 0 && items.every((t) => t.status === 'finalizada')
        return (
          <button
            key={iso}
            type="button"
            className={`cal-cell${iso === today ? ' today' : ''}${iso === day ? ' picked' : ''}${late ? ' late' : ''}${allDone ? ' done' : ''}`}
            onClick={() => onPick(iso)}
            title={items.map((t) => t.title).join(' · ')}
          >
            <span className="n">{parseDay(iso).getDate()}</span>
            {items.length > 0 && (
              <span className="dots">
                {items.slice(0, 4).map((t) => (
                  <i key={t.id} style={{ background: t.status === 'finalizada' ? 'var(--ink-4)' : PRIORITY_META[t.priority].color }} />
                ))}
                {items.length > 4 && <em>+{items.length - 4}</em>}
              </span>
            )}
          </button>
        )
      })}
    </div>
  )
}
