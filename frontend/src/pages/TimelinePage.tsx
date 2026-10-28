import { useMemo, useState } from 'react'
import { Ban, CalendarCheck, Check, Flag, Rocket } from 'lucide-react'
import { useProject, useProjectTasks } from '../api'
import { Empty, MemberHead, useMemberMap, useTypeMap } from '../components/bits'
import { addDays, daysBetween, fmtShort, parseDay, todayISO } from '../lib/format'
import { useUI } from '../ui'

export default function TimelinePage() {
  const data = useProject().data
  const tasks = useProjectTasks().data ?? []
  const members = useMemberMap()
  const types = useTypeMap()
  const { openTask } = useUI()
  const [owner, setOwner] = useState('todos')
  const today = todayISO()

  const range = useMemo(() => {
    if (!data) return null
    const dates = [
      ...data.stages.flatMap((s) => [s.start, s.end]),
      ...tasks.flatMap((t) => [t.startDate, t.dueDate].filter(Boolean) as string[]),
      data.project.backupDate ?? today,
      today,
    ].sort()
    const start = addDays(dates[0], -2)
    const end = addDays(dates[dates.length - 1], 3)
    return { start, end, span: daysBetween(start, end) + 1 }
  }, [data, tasks, today])

  if (!data || !range) return <div className="page"><Empty>Cargando el cronograma…</Empty></div>
  const { project, stages } = data
  const pct = (iso: string) => `${(daysBetween(range.start, iso) / range.span) * 100}%`
  const width = (a: string, b: string) => `${((daysBetween(a, b) + 1) / range.span) * 100}%`
  const days = Array.from({ length: range.span }, (_, i) => addDays(range.start, i))
  const weekends = days.filter((d) => [0, 6].includes(parseDay(d).getDay()))
  const weekStarts = days.filter((d) => parseDay(d).getDay() === 1)
  const visible = tasks.filter((t) => owner === 'todos' || t.ownerId === owner)
  const unstaged = visible.filter((t) => t.stageId == null)
  const background = (
    <>
      {weekends.map((d) => (
        <span key={d} className="g-we" style={{ left: pct(d), width: `${100 / range.span}%` }} />
      ))}
    </>
  )
  const milestones = [
    // Si una etapa termina el mismo día del piloto o del respaldo, gana el hito del piloto (no se encimen)
    ...stages
      .filter((s) => s.end !== project.pilotDate && s.end !== project.backupDate)
      .map((s) => ({ at: s.end, icon: Flag, label: `Fin ${s.name.split('·')[0].trim()}`, cls: '' })),
    ...(project.pilotDate ? [{ at: project.pilotDate, icon: Rocket, label: 'Piloto', cls: 'launch' }] : []),
    ...(project.backupDate ? [{ at: project.backupDate, icon: CalendarCheck, label: 'Respaldo', cls: '' }] : []),
  ]

  const row = (t: (typeof tasks)[number]) => {
    const start = t.startDate ?? (t.dueDate ? addDays(t.dueDate, -2) : today)
    const end = t.dueDate ?? start
    const late = t.status !== 'hecha' && !!t.dueDate && t.dueDate < today
    const color = types[t.type]?.color ?? 'var(--acc)'
    return (
      <div key={t.id} className="g-row">
        <div className="g-label" onClick={() => openTask(t.id)} role="button" tabIndex={0} onKeyDown={(e) => e.key === 'Enter' && openTask(t.id)}>
          <span className="key">{t.key}</span>
          <span className="t" title={t.title}>
            {t.title}
          </span>
          <MemberHead member={members[t.ownerId]} size={22} />
        </div>
        <div className="g-track">
          {background}
          <span
            className={`g-bar ${t.status}${late ? ' late' : ''}`}
            style={{ left: pct(start < range.start ? range.start : start), width: width(start, end), ['--c' as string]: color }}
            title={`${t.key} · ${fmtShort(start)} → ${fmtShort(end)}`}
            onClick={() => openTask(t.id)}
          >
            {t.status === 'hecha' && <Check />}
            {t.status === 'bloqueada' && <Ban />}
          </span>
        </div>
      </div>
    )
  }

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <p className="eyebrow">{data?.project.name ?? 'Proyecto'} · {fmtShort(range.start)} – {fmtShort(range.end)}</p>
          <h1>Cronograma</h1>
          <p>Etapas del piloto, cada tarea como barra y los hitos clave. Clic en una barra para abrir su ficha.</p>
        </div>
        <span className="grow" />
        <div className="seg" role="group" aria-label="Persona">
          <button type="button" aria-pressed={owner === 'todos'} onClick={() => setOwner('todos')}>
            Todos
          </button>
          {Object.values(members).map((m) => (
            <button key={m.id} type="button" aria-pressed={owner === m.id} onClick={() => setOwner(m.id)}>
              <MemberHead member={m} size={20} /> {m.name}
            </button>
          ))}
        </div>
      </div>

      <section className="panel gantt">
        <div className="gantt-in">
          <div className="g-row g-head">
            <div className="g-label">TAREA</div>
            <div className="g-track" style={{ height: 34 }}>
              {background}
              {weekStarts.map((d) => (
                <span key={d} className="g-wk" style={{ left: pct(d) }}>
                  {fmtShort(d).toUpperCase()}
                </span>
              ))}
            </div>
          </div>
          <div className="g-row">
            <div className="g-label" style={{ cursor: 'default', fontWeight: 600 }}>
              Hitos
            </div>
            <div className="g-track" style={{ height: 34 }}>
              {background}
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
          {stages.map((s) => {
            const items = visible.filter((t) => t.stageId === s.id).sort((a, b) => (a.startDate ?? '').localeCompare(b.startDate ?? '') || a.id - b.id)
            return (
              <div key={s.id}>
                <div className="g-row g-stage">
                  <div className="g-label" title={s.exitCriteria}>
                    {s.name}
                  </div>
                  <div className="g-track">
                    <span className="g-band" style={{ left: pct(s.start), width: width(s.start, s.end) }} title={s.exitCriteria} />
                  </div>
                </div>
                {items.map(row)}
              </div>
            )
          })}
          {unstaged.length > 0 && (
            <div>
              <div className="g-row g-stage">
                <div className="g-label">Sin etapa</div>
                <div className="g-track" />
              </div>
              {unstaged.map(row)}
            </div>
          )}
          <span className="g-today" style={{ left: `calc(280px + (100% - 280px) * ${daysBetween(range.start, today) / range.span})` }}>
            <span>HOY</span>
          </span>
        </div>
      </section>
      <div className="row wrap muted" style={{ fontSize: 12.5 }}>
        {Object.values(types).map((t) => (
          <span key={t.id} className="row" style={{ gap: 6 }}>
            <i style={{ width: 14, height: 9, borderRadius: 3, background: t.color, display: 'inline-block' }} /> {t.label}
          </span>
        ))}
        <span>· Rayado: bloqueada · Borde rojo: vencida · Tenue: hecha</span>
      </div>
    </div>
  )
}
