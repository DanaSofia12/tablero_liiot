import { lazy, Suspense, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Clock, Grid2x2 } from 'lucide-react'
import { useMe, useMembers, useMetrics, usePhases, usePresence, useProjects, useProjectTasks } from '../api'
import { ChecklistProgress, MemberHead, PRESENCE_META, StatePicker } from '../components/bits'
import { daysBetween, fmtDay, fmtMoment, plural, todayISO } from '../lib/format'
import { usePrefs } from '../prefs'
import { useUI } from '../ui'
import { useWorld } from '../world'
import { hasWebGL } from '../office/webgl'
import type { RoomData } from '../office/Room'
import type { Member, Presence, Task } from '../types'

const Office3D = lazy(() => import('../office/Office3D'))

/** En la oficina de Liiot (la empresa) lo que se toca lleva a las secciones de la empresa. */
const COMPANY_ROUTES: Record<string, string> = { tareas: '/yo', cronograma: '/yo', fases: '/', equipo: '/equipo' }
const COMPANY_LINKS: RoomData['links'] = {
  board: 'Tablero → Mis pendientes',
  tv: 'Pantalla → Equipo',
  calendar: 'Calendario → Mi espacio',
  desk: 'Escritorio → Equipo',
  goal: 'Escultura → Proyectos',
  portal: 'Portal · ver los proyectos',
}

function countOf(tasks: Task[]): RoomData['counts'] {
  return {
    todo: tasks.filter((t) => t.status === 'pendiente').length,
    doing: tasks.filter((t) => t.status === 'en_progreso').length,
    paused: tasks.filter((t) => t.status === 'en_pausa').length,
    testing: tasks.filter((t) => t.status === 'pruebas').length,
    done: tasks.filter((t) => t.status === 'finalizada').length,
  }
}

/** La oficina: en qué está cada quien, en 3D y al lado en una lista. En Liiot reúne a todos los proyectos. */
export default function OfficePage() {
  const navigate = useNavigate()
  const world = useWorld()
  const { resolvedMode, pixel, setPixel, calm } = usePrefs()
  const me = useMe()
  const members = useMembers().data ?? []
  const presence = usePresence().data ?? []
  const projects = useProjects().data ?? []
  const tasks = useProjectTasks(world.projectId).data ?? []
  const metrics = useMetrics(world.projectId).data
  const phases = usePhases(world.projectId).data
  const { goWorld, openTask } = useUI()
  const today = todayISO()
  const webgl = useMemo(hasWebGL, [])
  const [hint, setHint] = useState<string | null>(null)
  const project = world.project
  const company = !world.projectId

  const data: RoomData = useMemo(() => {
    const counts = countOf(tasks)
    if (company) {
      const next = projects.filter((p) => p.pilotDate && p.pilotDate >= today).sort((a, b) => (a.pilotDate ?? '').localeCompare(b.pilotDate ?? ''))[0]
      return {
        name: 'Liiot',
        phase: null,
        counts,
        goalOk: 0,
        goalTotal: 0,
        goalLabel: 'mínimos',
        daysToPilot: next?.pilotDate ? daysBetween(today, next.pilotDate) : null,
        milestone: next ? next.name.toUpperCase() : 'ENTREGA',
        tasksDone: counts.done,
        tasksTotal: tasks.length,
        overdue: tasks.filter((t) => t.status !== 'finalizada' && t.dueDate && t.dueDate < today).length,
        pilotDate: next?.pilotDate ?? null,
        ready: false,
        links: COMPANY_LINKS,
      }
    }
    const current = phases?.phases.find((p) => p.id === phases.currentPhaseId)
    const gate = current?.gate
    const rubric = gate?.rubric
    return {
      name: project?.name ?? 'Liiot',
      phase: current?.name ?? null,
      counts,
      goalOk: rubric && rubric.blockingTotal ? rubric.blockingOk : gate?.checksDone ?? 0,
      goalTotal: rubric && rubric.blockingTotal ? rubric.blockingTotal : gate?.checksTotal ?? 0,
      goalLabel: rubric && rubric.blockingTotal ? 'indispensables' : 'mínimos',
      daysToPilot: project?.pilotDate ? daysBetween(today, project.pilotDate) : null,
      milestone: project?.id === 'bleepy' ? 'PILOTO' : 'ENTREGA',
      tasksDone: metrics?.tasksDone ?? 0,
      tasksTotal: metrics?.tasksTotal ?? 0,
      overdue: metrics?.overdue ?? 0,
      pilotDate: project?.pilotDate ?? null,
      ready: Boolean(gate?.ready),
    }
  }, [company, tasks, projects, metrics, phases, project, today])

  const go = (sub: string) => navigate(company ? COMPANY_ROUTES[sub] ?? '/' : world.path(sub))
  const open = (id: string) => navigate(company ? `/equipo#${id}` : world.path('equipo'))

  return (
    <div className="page office">
      <div className="office-layout">
        <section className="panel office-stage" aria-label="Oficina 3D">
          <div className="office-tools">
            <span className="o-title">
              <b>{company ? 'Oficina · Liiot' : `Oficina · ${project?.name ?? ''}`}</b>
              <small>
                {fmtDay(today)}
                {data.phase ? ` · ${data.phase}` : company ? ` · ${projects.length} proyectos` : ''}
              </small>
            </span>
            <span className="grow" />
            <button type="button" className="btn icon sm" aria-pressed={pixel} onClick={() => setPixel(!pixel)} title={pixel ? 'Quitar el modo pixel' : 'Modo pixel'}>
              <Grid2x2 size={15} />
            </button>
          </div>
          {webgl ? (
            <Suspense fallback={<div className="office-fallback">Armando la oficina…</div>}>
              <Office3D
                members={members}
                presence={presence}
                data={data}
                theme={world.theme}
                mode={resolvedMode}
                pixel={pixel}
                calm={calm}
                go={go}
                goHome={() => (company ? navigate('/') : goWorld('/', null))}
                onSelectMember={open}
                onHint={setHint}
              />
            </Suspense>
          ) : (
            <div className="office-fallback">Este navegador no tiene WebGL. Al lado ves lo mismo: en qué está cada quien.</div>
          )}
          <p className={hint ? 'office-hint on' : 'office-hint'} aria-live="polite">
            {hint ?? 'Arrastra para mirar · rueda para acercar · clic en el tablero, la pantalla, el calendario o el portal'}
          </p>
        </section>

        <aside className="panel office-side" aria-label="El equipo ahora">
          <div className="side-head">
            <h2>El equipo ahora</h2>
            <span className="muted small">{presence.filter((p) => p.state !== 'descansando').length} de {members.length} en la oficina</span>
          </div>
          <div className="team-now">
            {members.map((m) => (
              <PersonNow
                key={m.id}
                member={m}
                presence={presence.find((p) => p.memberId === m.id)}
                tasks={tasks.filter((t) => t.ownerId === m.id && t.status !== 'finalizada')}
                today={today}
                isMe={m.id === me.id}
                onOpen={() => open(m.id)}
                onTask={openTask}
              />
            ))}
          </div>
          <div className="my-state">
            <span className="field-label">Mi estado</span>
            <StatePicker />
          </div>
        </aside>
      </div>
    </div>
  )
}

function PersonNow({
  member,
  presence,
  tasks,
  today,
  isMe,
  onOpen,
  onTask,
}: {
  member: Member
  presence?: Presence
  tasks: Task[]
  today: string
  isMe: boolean
  onOpen: () => void
  onTask: (id: number) => void
}) {
  const state = presence?.state ?? 'disponible'
  const meta = PRESENCE_META[state]
  const Icon = meta.icon
  const current = presence?.task ? tasks.find((t) => t.id === presence.task!.id) : undefined
  const what =
    state === 'trabajando' || state === 'en_reunion'
      ? presence?.task?.title || presence?.note || (state === 'trabajando' ? (isMe ? 'Cuéntale al bot en qué trabajas hoy' : 'Trabajando en sus pendientes') : '')
      : presence?.auto && !presence.inSchedule
        ? 'Fuera de su horario'
        : state === 'disponible'
          ? 'Libre para lo que se necesite'
          : ''
  const dueToday = tasks.filter((t) => t.dueDate === today).length
  const late = tasks.filter((t) => t.dueDate && t.dueDate < today).length
  const doing = tasks.filter((t) => t.status === 'en_progreso').length
  return (
    <article className={`now s-${state}`} style={{ ['--c' as string]: meta.color }}>
      <button type="button" className="now-who" onClick={onOpen} title={`Ver a ${member.name} en Equipo`}>
        <span className="now-ava">
          <MemberHead member={member} size={48} mood={state === 'descansando' ? 'sleep' : state === 'en_reunion' ? 'open' : undefined} />
          <i aria-hidden />
        </span>
        <span className="now-main">
          <span className="now-top">
            <b>
              {member.name}
              {isMe ? ' (tú)' : ''}
            </b>
            <span className="now-state">
              <Icon aria-hidden /> {meta.label}
            </span>
          </span>
          <span className="now-meta">
            <Clock aria-hidden /> {member.workStart}–{member.workEnd}
            {presence?.since && !presence.auto ? ` · desde ${fmtMoment(presence.since)}` : ''}
          </span>
        </span>
      </button>
      {what &&
        (current ? (
          <button type="button" className="now-what task" onClick={() => onTask(current.id)}>
            <span>{what}</span>
            <ChecklistProgress task={current} wide />
          </button>
        ) : (
          <p className="now-what">{what}</p>
        ))}
      <div className="now-stats">
        {dueToday + late + doing === 0 ? (
          <span>Nada pendiente para hoy</span>
        ) : (
          <>
            {dueToday > 0 && <span>{plural(dueToday, 'vence hoy', 'vencen hoy')}</span>}
            {late > 0 && <span className="late">{plural(late, 'atrasada', 'atrasadas')}</span>}
            {doing > 0 && <span>{doing} en progreso</span>}
          </>
        )}
      </div>
    </article>
  )
}
