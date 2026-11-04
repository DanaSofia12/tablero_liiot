import { useMemo, useState } from 'react'
import { CalendarCheck, ChevronLeft, ChevronRight, CirclePause, Download, Flag, Rocket } from 'lucide-react'
import { useProjectData, useProjectTasks } from '../api'
import { Empty, MemberHead, STATUS_META, useMemberMap } from '../components/bits'
import { addDays, addMonths, daysBetween, fmtShort, monthLabel, monthRange, parseDay, todayISO } from '../lib/format'
import { useUI } from '../ui'
import { useWorld } from '../world'
import type { Task } from '../types'

type Span = 'mes' | 'trimestre' | 'todo' | 'rango'

export default function TimelinePage() {
  const { projectId } = useWorld()
  const data = useProjectData(projectId).data
  const tasks = useProjectTasks(projectId).data ?? []
  const members = useMemberMap()
  const { openTask } = useUI()
  const today = todayISO()
  const [span, setSpan] = useState<Span>('mes')
  const [anchor, setAnchor] = useState(today.slice(0, 7) + '-01')
  const [from, setFrom] = useState(today)
  const [to, setTo] = useState(addDays(today, 30))
  const [phase, setPhase] = useState('todas')
  const [stage, setStage] = useState('todas')
  const [owner, setOwner] = useState('todos')

  const phases = data?.phases ?? []
  const stagesAll = data?.stages ?? []
  const stages = stagesAll.filter((s) => phase === 'todas' || String(s.phaseId) === phase)

  const range = useMemo(() => {
    if (span === 'mes') return monthRange(anchor)
    if (span === 'trimestre') return { start: monthRange(anchor).start, end: monthRange(addMonths(anchor, 2)).end }
    if (span === 'rango') return from <= to ? { start: from, end: to } : { start: to, end: from }
    const dates = [...stagesAll.flatMap((s) => [s.start, s.end]), ...tasks.flatMap((t) => [t.startDate, t.dueDate].filter(Boolean) as string[]), data?.project.pilotDate, data?.project.backupDate, today]
      .filter(Boolean)
      .sort() as string[]
    return { start: addDays(dates[0], -3), end: addDays(dates[dates.length - 1], 3) }
  }, [span, anchor, from, to, stagesAll, tasks, data, today])

  const visible = useMemo(
    () =>
      tasks.filter((t) => {
        if (phase !== 'todas' && String(t.phaseId) !== phase) return false
        if (stage !== 'todas' && String(t.stageId) !== stage) return false
        if (owner !== 'todos' && t.ownerId !== owner) return false
        const a = t.startDate ?? t.dueDate
        const b = t.dueDate ?? t.startDate
        if (!a || !b) return span === 'todo'
        return !(b < range.start || a > range.end)
      }),
    [tasks, phase, stage, owner, range, span],
  )

  if (!data) return <div className="page"><Empty>Cargando el cronograma…</Empty></div>
  const { project } = data
  const days = daysBetween(range.start, range.end) + 1
  const weekly = days > 95
  const slots = weekly
    ? Array.from({ length: Math.ceil(days / 7) }, (_, i) => addDays(range.start, i * 7))
    : Array.from({ length: days }, (_, i) => addDays(range.start, i))
  const pct = (iso: string) => `${(Math.max(0, Math.min(days, daysBetween(range.start, iso))) / days) * 100}%`
  const width = (a: string, b: string) => {
    const s = a < range.start ? range.start : a
    const e = b > range.end ? range.end : b
    return `${((daysBetween(s, e) + 1) / days) * 100}%`
  }
  const inRange = (iso: string | null | undefined) => !!iso && iso >= range.start && iso <= range.end
  const milestones = [
    ...stagesAll.filter((s) => inRange(s.end) && s.end !== project.pilotDate).map((s) => ({ at: s.end, icon: Flag, label: `Cierra ${s.name.split('·')[0].trim()}`, cls: '' })),
    ...(inRange(project.pilotDate) ? [{ at: project.pilotDate!, icon: Rocket, label: project.id === 'bleepy' ? 'Piloto' : 'Entrega', cls: 'key' }] : []),
    ...(inRange(project.backupDate) ? [{ at: project.backupDate!, icon: CalendarCheck, label: 'Respaldo', cls: '' }] : []),
  ]
  const groups: { id: string; title: string; sub?: string; tasks: Task[] }[] = []
  const phaseList = phase === 'todas' ? [...phases, { id: -1, name: 'Sin fase' }] : phases.filter((p) => String(p.id) === phase)
  for (const ph of phaseList) {
    const inPhase = visible.filter((t) => (ph.id === -1 ? t.phaseId == null : t.phaseId === ph.id))
    if (!inPhase.length) continue
    const phStages = stagesAll.filter((s) => s.phaseId === ph.id)
    for (const st of phStages) {
      const items = inPhase.filter((t) => t.stageId === st.id)
      if (items.length) groups.push({ id: `s${st.id}`, title: st.name, sub: phases.length > 1 ? ph.name : undefined, tasks: items })
    }
    const loose = inPhase.filter((t) => !phStages.some((s) => s.id === t.stageId))
    if (loose.length) groups.push({ id: `p${ph.id}`, title: phStages.length ? 'Sin etapa' : ph.name, sub: phStages.length && phases.length > 1 ? ph.name : undefined, tasks: loose })
  }
  const exportUrl = `/api/projects/${encodeURIComponent(project.id)}/cronograma.xlsx?${new URLSearchParams({
    ...(span !== 'todo' ? { desde: range.start, hasta: range.end } : {}),
    ...(phase !== 'todas' && phase !== 'sin' ? { fase: phase } : {}),
    ...(stage !== 'todas' ? { etapa: stage } : {}),
    ...(owner !== 'todos' ? { persona: owner } : {}),
  }).toString()}`
  const todayLeft = inRange(today) ? daysBetween(range.start, today) / days : null
  const stepLabel = span === 'mes' ? monthLabel(parseDay(anchor).getFullYear(), parseDay(anchor).getMonth()) : `${monthLabel(parseDay(anchor).getFullYear(), parseDay(anchor).getMonth())} – ${monthLabel(parseDay(addMonths(anchor, 2)).getFullYear(), parseDay(addMonths(anchor, 2)).getMonth())}`

  return (
    <div className="page timeline">
      <div className="toolbar">
        <div className="seg" role="group" aria-label="Periodo">
          {(
            [
              ['mes', 'Mes'],
              ['trimestre', '3 meses'],
              ['todo', 'Todo el proyecto'],
              ['rango', 'Fechas'],
            ] as const
          ).map(([v, label]) => (
            <button key={v} type="button" aria-pressed={span === v} onClick={() => setSpan(v)}>
              {label}
            </button>
          ))}
        </div>
        {(span === 'mes' || span === 'trimestre') && (
          <div className="month-nav">
            <button type="button" className="btn icon sm ghost" onClick={() => setAnchor(addMonths(anchor, span === 'mes' ? -1 : -3))} aria-label="Anterior">
              <ChevronLeft size={16} />
            </button>
            <b>{stepLabel}</b>
            <button type="button" className="btn icon sm ghost" onClick={() => setAnchor(addMonths(anchor, span === 'mes' ? 1 : 3))} aria-label="Siguiente">
              <ChevronRight size={16} />
            </button>
            {anchor !== today.slice(0, 7) + '-01' && (
              <button type="button" className="btn sm ghost" onClick={() => setAnchor(today.slice(0, 7) + '-01')}>
                Hoy
              </button>
            )}
          </div>
        )}
        {span === 'rango' && (
          <div className="row" style={{ gap: 6 }}>
            <input className="input" type="date" value={from} onChange={(e) => setFrom(e.target.value)} aria-label="Desde" />
            <span className="muted">a</span>
            <input className="input" type="date" value={to} onChange={(e) => setTo(e.target.value)} aria-label="Hasta" />
          </div>
        )}
        {phases.length > 1 && (
          <select className="select auto" value={phase} onChange={(e) => (setPhase(e.target.value), setStage('todas'))} aria-label="Fase">
            <option value="todas">Todas las fases</option>
            {phases.map((p) => (
              <option key={p.id} value={String(p.id)}>
                {p.name}
              </option>
            ))}
          </select>
        )}
        {stages.length > 0 && (
          <select className="select auto" value={stage} onChange={(e) => setStage(e.target.value)} aria-label="Etapa">
            <option value="todas">Todas las etapas</option>
            {stages.map((s) => (
              <option key={s.id} value={String(s.id)}>
                {s.name}
              </option>
            ))}
          </select>
        )}
        <select className="select auto" value={owner} onChange={(e) => setOwner(e.target.value)} aria-label="Persona">
          <option value="todos">Todo el equipo</option>
          {Object.values(members).map((m) => (
            <option key={m.id} value={m.id}>
              {m.name}
            </option>
          ))}
        </select>
        <span className="grow" />
        <a className="btn primary" href={exportUrl} download>
          <Download size={16} /> Exportar a Excel
        </a>
      </div>

      <section className="panel gantt">
        <div className="g-grid" style={{ ['--slots' as string]: slots.length }}>
          <div className="g-row g-head">
            <div className="g-label">{visible.length} tareas</div>
            <div className="g-track">
              {slots.map((d) => {
                const date = parseDay(d)
                const we = !weekly && [0, 6].includes(date.getDay())
                return (
                  <span key={d} className={`g-slot${we ? ' we' : ''}${d === today ? ' today' : ''}`} style={{ left: pct(d), width: `${(weekly ? 7 : 1) * (100 / days)}%` }}>
                    {weekly ? fmtShort(d) : date.getDate()}
                    {!weekly && date.getDate() === 1 && <em>{monthLabel(date.getFullYear(), date.getMonth()).split(' ')[0].slice(0, 3)}</em>}
                  </span>
                )
              })}
            </div>
          </div>
          {milestones.length > 0 && (
            <div className="g-row g-ms-row">
              <div className="g-label muted">Hitos</div>
              <div className="g-track">
                {milestones.map((m) => {
                  const Icon = m.icon
                  return (
                    <span key={`${m.label}-${m.at}`} className={`g-ms ${m.cls}`} style={{ left: pct(m.at) }} title={`${m.label} · ${fmtShort(m.at)}`}>
                      <Icon /> {m.label}
                    </span>
                  )
                })}
              </div>
            </div>
          )}
          {groups.length === 0 && <p className="empty">No hay tareas en estas fechas con esos filtros.</p>}
          {groups.map((g) => (
            <div key={g.id} className="g-group">
              <div className="g-row g-stage">
                <div className="g-label">
                  <b>{g.title}</b>
                  {g.sub && <small>{g.sub}</small>}
                </div>
                <div className="g-track" />
              </div>
              {g.tasks
                .sort((a, b) => (a.startDate ?? a.dueDate ?? '').localeCompare(b.startDate ?? b.dueDate ?? '') || a.id - b.id)
                .map((t) => {
                  const start = t.startDate ?? (t.dueDate ? addDays(t.dueDate, -1) : today)
                  const end = t.dueDate ?? start
                  const a = start <= end ? start : end
                  const b = start <= end ? end : start
                  const late = t.status !== 'finalizada' && !!t.dueDate && t.dueDate < today
                  const meta = STATUS_META[t.status]
                  return (
                    <div key={t.id} className="g-row">
                      <button type="button" className="g-label task" onClick={() => openTask(t.id)} title={t.title}>
                        <MemberHead member={members[t.ownerId]} size={22} />
                        <span className="t">{t.title}</span>
                      </button>
                      <div className="g-track">
                        {(t.startDate || t.dueDate) && (
                          <button
                            type="button"
                            className={`g-bar ${t.status}${late ? ' late' : ''}`}
                            style={{ left: pct(a), width: width(a, b), ['--c' as string]: meta.color }}
                            title={`${t.title} · ${fmtShort(a)} → ${fmtShort(b)} · ${meta.label}`}
                            onClick={() => openTask(t.id)}
                          >
                            {t.status === 'en_pausa' && <CirclePause />}
                            <span>{t.checklist.length ? `${t.checklist.filter((i) => i.done).length}/${t.checklist.length}` : ''}</span>
                          </button>
                        )}
                      </div>
                    </div>
                  )
                })}
            </div>
          ))}
          {todayLeft != null && (
            <span className="g-today" style={{ ['--x' as string]: todayLeft }}>
              <span>HOY</span>
            </span>
          )}
        </div>
      </section>
      <div className="legend">
        {(['pendiente', 'en_progreso', 'en_pausa', 'pruebas', 'finalizada'] as const).map((s) => (
          <span key={s}>
            <i style={{ background: STATUS_META[s].color }} /> {STATUS_META[s].label}
          </span>
        ))}
        <span>
          <i className="late" /> Atrasada
        </span>
      </div>
    </div>
  )
}
