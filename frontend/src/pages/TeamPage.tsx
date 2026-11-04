import { useEffect, useLayoutEffect, useMemo, useRef, useState, type PointerEvent as RPointerEvent } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { CalendarClock, CalendarRange, CircleCheckBig, ListFilter, TrendingUp } from 'lucide-react'
import { usePresence, useProjectTasks, useTeam } from '../api'
import { Avatar } from '../components/Avatar'
import { Empty, PresenceChip, STATUS_META, useMemberMap } from '../components/bits'
import { addDays, fmtDay, fmtShort, parseDay, plural, weekdayShort } from '../lib/format'
import { useUI } from '../ui'
import { useWorld } from '../world'
import type { Member, MonthLoad, PersonAnalysis, PresenceState, Task, TaskBrief, TaskStatus, TeamData, WeekPoint } from '../types'

const OPEN_STATES: TaskStatus[] = ['pendiente', 'en_progreso', 'en_pausa', 'pruebas']
const STRIP_DAYS = 14

/** Equipo: cómo avanzamos y, por persona, lo que tiene, lo que se le cruza y lo que viene. Solo análisis. */
export default function TeamPage() {
  const { projectId, project, path } = useWorld()
  const [scope, setScope] = useState<'all' | 'project'>(projectId ? 'project' : 'all')
  const data = useTeam(scope === 'project' ? projectId : null)
  const tasks = useProjectTasks(scope === 'project' ? projectId : null).data ?? []
  const presence = usePresence().data ?? []
  const members = useMemberMap()
  const { hash } = useLocation()
  const team = data.data

  // Desde la oficina se llega a una persona: /equipo#dana
  useEffect(() => {
    if (!team || !hash) return
    document.getElementById(`persona-${decodeURIComponent(hash.slice(1))}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }, [team, hash])

  return (
    <div className="page team">
      {projectId && (
        <div className="toolbar">
          <div className="seg" role="group" aria-label="Qué proyectos contar">
            <button type="button" aria-pressed={scope === 'project'} onClick={() => setScope('project')}>
              Solo {project?.name ?? 'este proyecto'}
            </button>
            <button type="button" aria-pressed={scope === 'all'} onClick={() => setScope('all')}>
              Todos los proyectos
            </button>
          </div>
        </div>
      )}
      {!team ? (
        <Empty>Analizando al equipo…</Empty>
      ) : (
        <div className={`team-body${data.isFetching ? ' refetching' : ''}`}>
          <section className="panel team-progress">
            <Summary team={team} />
            <div className="tp-chart">
              <div className="panel-head">
                <TrendingUp size={18} className="acc" />
                <h2>Cómo avanzamos</h2>
              </div>
              <BurnUp weeks={team.weeks} />
            </div>
          </section>

          <div className="people">
            {team.people.map((p) => (
              <PersonCard
                key={p.memberId}
                p={p}
                member={members[p.memberId]}
                presence={presence.find((x) => x.memberId === p.memberId)?.state}
                tasks={tasks.filter((t) => t.ownerId === p.memberId && t.status !== 'finalizada')}
                today={team.today}
                tasksLink={projectId && scope === 'project' ? `${path('tareas')}?persona=${encodeURIComponent(p.memberId)}` : null}
              />
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

/** Anillo que se llena al aparecer. */
function Ring({ pct, size = 136 }: { pct: number; size?: number }) {
  const [shown, setShown] = useState(0)
  useEffect(() => {
    const id = requestAnimationFrame(() => setShown(pct))
    return () => cancelAnimationFrame(id)
  }, [pct])
  const r = (size - 16) / 2
  const c = 2 * Math.PI * r
  return (
    <svg className="ring" width={size} height={size} viewBox={`0 0 ${size} ${size}`} aria-hidden>
      <circle className="ring-track" cx={size / 2} cy={size / 2} r={r} />
      <circle className="ring-val" cx={size / 2} cy={size / 2} r={r} strokeDasharray={`${(shown / 100) * c} ${c}`} transform={`rotate(-90 ${size / 2} ${size / 2})`} />
    </svg>
  )
}

function Summary({ team }: { team: TeamData }) {
  const t = team.totals
  const pct = t.dueSoFar ? Math.round((t.dueSoFarDone * 100) / t.dueSoFar) : 100
  const missing = t.dueSoFar - t.dueSoFarDone
  return (
    <div className="tp-summary">
      <div className="tp-ring">
        <Ring pct={pct} />
        <span className="tp-pct">
          <b>{pct}%</b>
          <small>al día</small>
        </span>
      </div>
      <p className="tp-text">
        {t.dueSoFar
          ? `De ${plural(t.dueSoFar, 'tarea que ya debía estar lista', 'tareas que ya debían estar listas')} van ${t.dueSoFarDone}. ${missing ? `Faltan ${missing} para ponernos al día.` : '¡Vamos al día!'}`
          : 'Todavía no vence ninguna tarea: el avance se verá aquí semana a semana.'}
      </p>
      <div className="tp-stats">
        <span>
          <b>{t.open}</b> abiertas
        </span>
        <span className={t.overdue ? 'bad' : ''}>
          <b>{t.overdue}</b> atrasadas
        </span>
        <span className="good">
          <b>{t.doneThisMonth}</b> finalizadas este mes
        </span>
        {t.lateDue > 0 && (
          <span>
            <b>{t.lateDue}</b> entregadas tarde
          </span>
        )}
        {t.paused > 0 && (
          <span className="warn">
            <b>{t.paused}</b> en pausa
          </span>
        )}
        {t.testing > 0 && (
          <span>
            <b>{t.testing}</b> en pruebas
          </span>
        )}
      </div>
    </div>
  )
}

function useWidth<T extends HTMLElement>() {
  const ref = useRef<T>(null)
  const [width, setWidth] = useState(0)
  useLayoutEffect(() => {
    const el = ref.current
    if (!el) return
    const ro = new ResizeObserver(([entry]) => setWidth(Math.round(entry.contentRect.width)))
    ro.observe(el)
    setWidth(Math.round(el.getBoundingClientRect().width))
    return () => ro.disconnect()
  }, [])
  return [ref, width] as const
}

/** Lo que debía estar listo (por fecha de entrega) contra lo que de verdad se finalizó, semana a semana. */
function BurnUp({ weeks }: { weeks: WeekPoint[] }) {
  const [box, width] = useWidth<HTMLDivElement>()
  const [hover, setHover] = useState<number | null>(null)
  const [table, setTable] = useState(false)
  const height = 210
  const pad = { l: 34, r: 92, t: 14, b: 28 }
  const w = Math.max(240, width)
  const max = Math.max(1, ...weeks.map((p) => Math.max(p.planned, p.done ?? 0)))
  const nice = Math.ceil(max / 5) * 5 || 5
  const x = (i: number) => pad.l + (i * (w - pad.l - pad.r)) / Math.max(1, weeks.length - 1)
  const y = (v: number) => pad.t + (1 - v / nice) * (height - pad.t - pad.b)
  const planned = weeks.map((p, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(p.planned).toFixed(1)}`).join('')
  const doneIdx = weeks.map((p, i) => (p.done != null ? i : -1)).filter((i) => i >= 0)
  const done = doneIdx.map((i, k) => `${k ? 'L' : 'M'}${x(i).toFixed(1)},${y(weeks[i].done!).toFixed(1)}`).join('')
  const lastDone = doneIdx.at(-1)
  const current = weeks.findIndex((p) => p.current)
  const ticks = [0, nice / 2, nice]

  const onMove = (e: RPointerEvent<SVGRectElement>) => {
    const rect = e.currentTarget.getBoundingClientRect()
    const px = e.clientX - rect.left + pad.l
    const step = (w - pad.l - pad.r) / Math.max(1, weeks.length - 1)
    setHover(Math.max(0, Math.min(weeks.length - 1, Math.round((px - pad.l) / step))))
  }
  const hp = hover != null ? weeks[hover] : null

  return (
    <div className="viz" ref={box}>
      <div className="viz-legend">
        <span>
          <i className="key done" /> Finalizadas (acumulado)
        </span>
        <span>
          <i className="key plan" /> Debían estar listas según su fecha
        </span>
        <span className="grow" />
        <button type="button" className="btn sm ghost" onClick={() => setTable(!table)}>
          {table ? 'Ver gráfica' : 'Ver como tabla'}
        </button>
      </div>
      {table ? (
        <div className="viz-table">
          <table className="table compact">
            <thead>
              <tr>
                <th>Semana</th>
                <th>Debían estar listas</th>
                <th>Finalizadas</th>
              </tr>
            </thead>
            <tbody>
              {weeks.map((p) => (
                <tr key={p.weekStart} className={p.current ? 'current' : ''}>
                  <td>
                    {fmtShort(p.weekStart)} – {fmtShort(p.weekEnd)}
                  </td>
                  <td>{p.planned}</td>
                  <td>{p.done ?? '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="viz-plot">
          <svg width={w} height={height} role="img" aria-label="Avance semana a semana: tareas que debían estar listas contra tareas finalizadas">
            {ticks.map((t) => (
              <g key={t}>
                <line className="grid" x1={pad.l} x2={w - pad.r} y1={y(t)} y2={y(t)} />
                <text className="tick" x={pad.l - 8} y={y(t) + 4} textAnchor="end">
                  {t}
                </text>
              </g>
            ))}
            {current >= 0 && (
              <g>
                <rect className="future" x={x(current)} y={pad.t} width={Math.max(0, w - pad.r - x(current))} height={height - pad.t - pad.b} />
                <text className="tick" x={x(current) + 4} y={pad.t + 10}>
                  hoy
                </text>
              </g>
            )}
            <path className="line plan" d={planned} />
            <path className="area done" d={`${done}L${x(lastDone ?? 0).toFixed(1)},${y(0)}L${x(0)},${y(0)}Z`} />
            <path className="line done" d={done} />
            {lastDone != null && (
              <>
                <circle className="dot done" cx={x(lastDone)} cy={y(weeks[lastDone].done!)} r={5} />
                <text className="end-label" x={x(lastDone) + 9} y={y(weeks[lastDone].done!) + 4}>
                  {weeks[lastDone].done} finalizadas
                </text>
              </>
            )}
            <text className="end-label muted" x={x(weeks.length - 1) + 9} y={y(weeks.at(-1)!.planned) + 4}>
              {weeks.at(-1)!.planned} con fecha
            </text>
            {weeks.map((p, i) =>
              i % Math.ceil(weeks.length / 7) === 0 || p.current ? (
                <text key={p.weekStart} className={`tick x${p.current ? ' strong' : ''}`} x={x(i)} y={height - 8} textAnchor="middle">
                  {p.label}
                </text>
              ) : null,
            )}
            {hp && hover != null && (
              <g>
                <line className="crosshair" x1={x(hover)} x2={x(hover)} y1={pad.t} y2={height - pad.b} />
                <circle className="dot plan" cx={x(hover)} cy={y(hp.planned)} r={4} />
                {hp.done != null && <circle className="dot done" cx={x(hover)} cy={y(hp.done)} r={4} />}
              </g>
            )}
            <rect
              x={pad.l}
              y={pad.t}
              width={Math.max(0, w - pad.l - pad.r)}
              height={height - pad.t - pad.b}
              fill="transparent"
              onPointerMove={onMove}
              onPointerLeave={() => setHover(null)}
              tabIndex={0}
              onFocus={() => setHover(current >= 0 ? current : 0)}
              onBlur={() => setHover(null)}
              onKeyDown={(e) => {
                if (e.key === 'ArrowLeft') setHover((h) => Math.max(0, (h ?? 0) - 1))
                if (e.key === 'ArrowRight') setHover((h) => Math.min(weeks.length - 1, (h ?? 0) + 1))
              }}
              aria-label="Recorrer las semanas con las flechas"
            />
          </svg>
          {hp && hover != null && (
            <div className="viz-tip" style={{ left: Math.min(x(hover) + 12, w - 190), top: 8 }}>
              <small>
                Semana del {fmtShort(hp.weekStart)}
                {hp.future ? ' (por venir)' : ''}
              </small>
              <span>
                <i className="key done" /> <b>{hp.done ?? '—'}</b> finalizadas
              </span>
              <span>
                <i className="key plan" /> <b>{hp.planned}</b> debían estar listas
              </span>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

/** Asignaciones por mes de una persona (tareas con fecha de entrega en ese mes). */
function MonthBars({ months, name }: { months: MonthLoad[]; name: string }) {
  const [hover, setHover] = useState<number | null>(null)
  const height = 96
  const max = Math.max(1, ...months.map((m) => m.assigned))
  const colW = 100 / months.length
  return (
    <div className="mbars" role="img" aria-label={`Tareas de ${name} por mes`} onPointerLeave={() => setHover(null)}>
      {months.map((m, i) => {
        const h = m.assigned ? Math.max(6, (m.assigned / max) * (height - 26)) : 0
        const doneH = m.assigned ? (m.done / m.assigned) * h : 0
        return (
          <button
            key={m.month}
            type="button"
            className={`mbar${m.current ? ' current' : ''}${hover === i ? ' hover' : ''}`}
            style={{ width: `${colW}%` }}
            onPointerEnter={() => setHover(i)}
            onFocus={() => setHover(i)}
            onBlur={() => setHover(null)}
            aria-label={`${m.label}: ${m.assigned} asignadas, ${m.done} finalizadas${m.late ? `, ${m.late} atrasadas` : ''}`}
          >
            <span className="val">{m.assigned || ''}</span>
            <span className="col" style={{ height: h }}>
              <i className="part done" style={{ height: doneH }} />
            </span>
            <span className="lbl">{m.label}</span>
            {hover === i && (
              <span className="viz-tip small">
                <b>{m.assigned}</b> asignadas · <b>{m.done}</b> finalizadas{m.late ? ` · ${m.late} atrasadas` : ''}
              </span>
            )}
          </button>
        )
      })}
    </div>
  )
}

function TaskLink({ t, extra }: { t: Pick<TaskBrief, 'id' | 'title'>; extra?: string }) {
  const { openTask } = useUI()
  return (
    <button type="button" className="tlink" onClick={() => openTask(t.id)} title={t.title}>
      <span className="t">{t.title}</span>
      {extra && <span className="x">{extra}</span>}
    </button>
  )
}

/** Las próximas dos semanas de una persona: cuántas entregas tiene cada día y qué días se le cruzan las fechas. */
function DayStrip({ tasks, today, overlaps }: { tasks: Task[]; today: string; overlaps: PersonAnalysis['overlaps'] }) {
  const [pick, setPick] = useState<string | null>(null)
  const days = useMemo(() => Array.from({ length: STRIP_DAYS }, (_, i) => addDays(today, i)), [today])
  const byDay = useMemo(() => {
    const out: Record<string, Task[]> = {}
    for (const t of tasks) if (t.dueDate) (out[t.dueDate] ??= []).push(t)
    return out
  }, [tasks])
  const crossed = (d: string) => overlaps.some((o) => o.start <= d && d <= o.end)
  const picked = pick ? byDay[pick] ?? [] : []
  return (
    <div className="dstrip-wrap">
      <div className="dstrip">
        {days.map((d) => {
          const n = byDay[d]?.length ?? 0
          const wd = parseDay(d).getDay()
          return (
            <button
              key={d}
              type="button"
              className={`dcell l${Math.min(n, 3)}${wd === 0 || wd === 6 ? ' we' : ''}${d === today ? ' today' : ''}${crossed(d) ? ' cross' : ''}${pick === d ? ' on' : ''}`}
              onClick={() => setPick(pick === d ? null : d)}
              disabled={n === 0}
              title={`${fmtDay(d)}: ${n ? plural(n, 'entrega', 'entregas') : 'sin entregas'}${crossed(d) ? ' · fechas que se cruzan' : ''}`}
            >
              <span className="dw">{weekdayShort(d).slice(0, 1)}</span>
              <span className="dbox">{n || ''}</span>
              <span className="dn">{parseDay(d).getDate()}</span>
            </button>
          )
        })}
      </div>
      {pick && (
        <div className="dlist">
          <small>{fmtDay(pick)}</small>
          {picked.map((t) => (
            <TaskLink key={t.id} t={t} extra={STATUS_META[t.status].label} />
          ))}
        </div>
      )}
    </div>
  )
}

function PersonCard({
  p,
  member,
  presence,
  tasks,
  today,
  tasksLink,
}: {
  p: PersonAnalysis
  member: Member | undefined
  presence?: PresenceState
  tasks: Task[]
  today: string
  tasksLink: string | null
}) {
  const navigate = useNavigate()
  const c = p.counts
  const open = OPEN_STATES.map((s) => ({ s, n: tasks.filter((t) => t.status === s).length }))
  const total = open.reduce((a, b) => a + b.n, 0)
  const alerts = p.overlaps.length + p.heavyDays.length + p.overdue.length
  return (
    <section className="panel person" id={`persona-${p.memberId}`} style={{ ['--mc' as string]: member?.color ?? 'var(--acc)' }}>
      <div className="p-band" aria-hidden />
      <header className="p-head">
        {member && <Avatar avatar={member.avatar} color={member.color} variant="bust" size={76} mood={presence === 'descansando' ? 'sleep' : 'smile'} title={member.name} />}
        <div className="grow">
          <b>{member?.name}</b>
          <small>{member?.role}</small>
        </div>
        {presence && <PresenceChip state={presence} />}
      </header>

      <div className="p-dist">
        <div className="p-dist-head">
          <span>
            <b>{total}</b> {total === 1 ? 'tarea abierta' : 'tareas abiertas'}
          </span>
          {c.overdue > 0 && <span className="pill bad">{plural(c.overdue, 'atrasada', 'atrasadas')}</span>}
          <span className="pill good">{c.doneThisMonth} finalizadas este mes</span>
        </div>
        <div className="p-bar" role="img" aria-label={open.map((o) => `${o.n} ${STATUS_META[o.s].label.toLowerCase()}`).join(', ')}>
          {total === 0 ? <i className="empty" /> : open.filter((o) => o.n).map((o) => <i key={o.s} style={{ flexGrow: o.n, background: STATUS_META[o.s].color }} title={`${o.n} ${STATUS_META[o.s].column.toLowerCase()}`} />)}
        </div>
        <div className="p-legend">
          {open.map((o) => (
            <span key={o.s} className={o.n ? '' : 'zero'}>
              <i style={{ background: STATUS_META[o.s].color }} /> {o.n} {STATUS_META[o.s].column.toLowerCase()}
            </span>
          ))}
        </div>
      </div>

      <div className="p-block">
        <span className="p-title">
          <CalendarClock size={14} /> Próximos 14 días
          {c.undated > 0 && <em>{plural(c.undated, 'sin fecha', 'sin fecha')}</em>}
        </span>
        <DayStrip tasks={tasks} today={today} overlaps={p.overlaps} />
      </div>

      <div className="p-block">
        <span className="p-title">
          <CalendarRange size={14} /> Tareas por mes
        </span>
        <MonthBars months={p.byMonth} name={member?.name ?? ''} />
        <span className="p-key">
          <i className="key done" /> finalizadas <i className="key rest" /> por hacer
        </span>
      </div>

      <div className="p-foot">
        {p.onTimePct != null && (
          <p className="p-fact">
            <CircleCheckBig size={14} className="ok" />
            <span>
              Entregó a tiempo <b>{p.onTimePct}%</b> de lo que finalizó en los últimos 60 días ({plural(p.onTimeBase, 'tarea', 'tareas')}).
            </span>
          </p>
        )}
        {alerts === 0 && <p className="p-fact muted">Sin cruces de fechas, días cargados ni atrasos. 👌</p>}
        {alerts > 0 && (
          <div className="p-alerts">
            {p.overlaps.map((o) => (
              <details key={o.start} className="cross">
                <summary>
                  <b>Fechas que se cruzan:</b> del {fmtShort(o.start)} al {fmtShort(o.end)}, {o.peak} tareas abiertas a la vez
                </summary>
                {o.tasks.map((t) => (
                  <TaskLink key={t.id} t={t} extra={t.dueDate ? `vence ${fmtShort(t.dueDate)}` : undefined} />
                ))}
              </details>
            ))}
            {p.heavyDays.map((d) => (
              <details key={d.day} className="heavy">
                <summary>
                  <b>Día cargado:</b> el {fmtDay(d.day)} le vencen {d.count} tareas
                </summary>
                {d.tasks.map((t) => (
                  <TaskLink key={t.id} t={t} />
                ))}
              </details>
            ))}
            {p.overdue.length > 0 && (
              <details className="late">
                <summary>
                  <b>Atrasadas:</b> {plural(c.overdue, 'tarea', 'tareas')}
                  {p.overdue[0]?.daysLate ? `, la más antigua desde hace ${p.overdue[0].daysLate} días` : ''}
                </summary>
                {p.overdue.map((t) => (
                  <TaskLink key={t.id} t={t} extra={t.daysLate ? `hace ${t.daysLate} d` : undefined} />
                ))}
              </details>
            )}
          </div>
        )}
        {tasksLink && (
          <button type="button" className="btn sm ghost p-link" onClick={() => navigate(tasksLink)}>
            <ListFilter size={14} /> Ver sus tareas
          </button>
        )}
      </div>
    </section>
  )
}
