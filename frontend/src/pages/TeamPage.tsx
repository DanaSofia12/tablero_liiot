import { useState, type ReactNode } from 'react'
import { ArrowLeftRight, CalendarDays } from 'lucide-react'
import { useCurrentProject, useMetrics, usePresence, useTaskActions, useTasks } from '../api'
import { Empty, MemberHead, Meter, Panel, PresenceChip, useMemberMap, useTypeMap } from '../components/bits'
import { parseDay, todayISO, weekdayShort } from '../lib/format'
import { useUI } from '../ui'
import type { Member, Presence, TaskBrief, Workload } from '../types'

/** Lo que significa cada zona de carga, dicho en palabras. */
const LOAD: Record<Workload['zone'], { label: string; hint: string }> = {
  verde: { label: 'Tiene espacio', hint: 'Puede recibir más trabajo' },
  amarillo: { label: 'Va al límite', hint: 'Mejor no sumarle más por ahora' },
  rosa: { label: 'Más de lo que cabe', hint: 'Conviene mover o aplazar algo' },
}

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`

export default function TeamPage() {
  const [scope, setScope] = useState<'all' | 'project'>('all')
  const { project } = useCurrentProject()
  const metrics = useMetrics(undefined, scope).data
  const presence = usePresence().data ?? []
  const tasks = useTasks().data ?? []
  const members = useMemberMap()
  const types = useTypeMap()
  const { openTask, toast } = useUI()
  const { update } = useTaskActions()
  const today = todayISO()

  if (!metrics) return <div className="page"><Empty>Calculando la carga…</Empty></div>
  const days = Object.keys(metrics.team[0]?.dueByDay ?? {})
  const scoped = scope === 'project' ? tasks.filter((t) => t.projectId === project?.id) : tasks
  const overdueBy = (id: string) => scoped.filter((t) => t.ownerId === id && t.status !== 'hecha' && t.dueDate && t.dueDate < today).length

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <p className="eyebrow">Próximos 14 días</p>
          <h1>Carga del equipo</h1>
          <p>Cuánto trabajo tiene cada quien, en qué está ahora y qué le sigue.</p>
        </div>
        <span className="grow" />
        <div className="seg" role="group" aria-label="Qué proyectos contar">
          <button type="button" aria-pressed={scope === 'all'} onClick={() => setScope('all')}>
            Todos los proyectos
          </button>
          <button type="button" aria-pressed={scope === 'project'} onClick={() => setScope('project')}>
            Solo {project?.name ?? 'este proyecto'}
          </button>
        </div>
      </div>

      <div className="team-grid">
        {metrics.team.map((w) => (
          <LoadCard
            key={w.memberId}
            w={w}
            member={members[w.memberId]}
            presence={presence.find((x) => x.memberId === w.memberId)}
            mostly={Object.entries(w.mix)
              .sort((a, b) => b[1] - a[1])
              .slice(0, 2)
              .map(([type]) => types[type]?.label ?? type)}
            openTask={openTask}
          />
        ))}
      </div>

      <div className="follow-grid">
        <Panel title="Qué vence cada día" icon={<CalendarDays size={17} style={{ color: 'var(--acc)' }} />}>
          <div className="heat">
            <span />
            {days.map((d) => (
              <span key={d} className="hd">
                {weekdayShort(d).toUpperCase()}
                <br />
                {parseDay(d).getDate()}
              </span>
            ))}
            {metrics.team.map((w) => (
              <FragmentRow key={w.memberId} name={members[w.memberId]?.name ?? w.memberId} overdue={overdueBy(w.memberId)}>
                {days.map((d) => {
                  const n = w.dueByDay[d] ?? 0
                  const we = [0, 6].includes(parseDay(d).getDay())
                  return (
                    <span key={d} className={`cell${n >= 3 ? ' l3' : n === 2 ? ' l2' : n === 1 ? ' l1' : we ? ' we' : ''}`} title={plural(n, 'entrega', 'entregas')}>
                      {n || ''}
                    </span>
                  )
                })}
              </FragmentRow>
            ))}
          </div>
          <p className="muted" style={{ fontSize: 12, marginTop: 10 }}>
            Cada número es cuántas tareas vencen ese día. El círculo rojo junto al nombre son las que ya se pasaron de fecha.
          </p>
        </Panel>
        <Panel title="Ideas para repartir" icon={<ArrowLeftRight size={17} style={{ color: 'var(--acc-2)' }} />}>
          {metrics.suggestions.length === 0 && <Empty>Nada que mover: nadie está por encima de su capacidad mientras otra persona tiene espacio.</Empty>}
          {metrics.suggestions.map((s) => (
            <div key={s.taskId} className="stack" style={{ padding: '12px 0', borderTop: '1px solid var(--line)' }}>
              <p style={{ fontSize: 13.5 }}>{s.text}</p>
              <div className="row">
                <MemberHead member={members[s.fromId]} size={26} />
                <ArrowLeftRight size={16} className="muted" />
                <MemberHead member={members[s.toId]} size={26} />
                <span className="grow" />
                <button type="button" className="btn sm" onClick={() => openTask(s.taskId)}>
                  Ver {s.taskKey}
                </button>
                <button
                  type="button"
                  className="btn sm primary"
                  onClick={() =>
                    update.mutate(
                      { id: s.taskId, patch: { ownerId: s.toId } },
                      { onSuccess: () => toast(`${s.taskKey} ahora es de ${members[s.toId]?.name}. Le aviso por Telegram.`) },
                    )
                  }
                >
                  Pasársela
                </button>
              </div>
            </div>
          ))}
          <details className="how">
            <summary>¿Cómo se calcula la carga?</summary>
            <p>
              Se suman los puntos de esfuerzo (S = 1, M = 2, L = 3) de lo que vence en los próximos 14 días, lo vencido y lo que ya está en marcha, y se
              comparan con la capacidad de cada persona. Lo que espera sin fecha no cuenta: aparece aparte como «sin fecha».
            </p>
          </details>
        </Panel>
      </div>
    </div>
  )
}

function LoadCard({
  w,
  member,
  presence,
  mostly,
  openTask,
}: {
  w: Workload
  member?: Member
  presence?: Presence
  mostly: string[]
  openTask: (id: number) => void
}) {
  const zone = LOAD[w.zone]
  const flags = [
    w.blocked > 0 && { cls: 'bad', text: `⛔ ${plural(w.blocked, 'bloqueada', 'bloqueadas')}` },
    w.inReview > 0 && { cls: '', text: `${plural(w.inReview, 'espera', 'esperan')} revisión` },
    w.undated > 0 && { cls: 'soft', text: `${plural(w.undated, 'sin fecha', 'sin fecha')}` },
  ].filter(Boolean) as { cls: string; text: string }[]
  return (
    <section className={`panel load-card zone-${w.zone}`}>
      <header className="who">
        <MemberHead member={member} size={56} />
        <div className="grow">
          <b>{member?.name}</b>
          <span>{member?.role}</span>
        </div>
        {presence && <PresenceChip state={presence.state} />}
      </header>

      <div className="load">
        <div className="load-top">
          <span className="load-label">{zone.label}</span>
          <span className="load-pct">{w.pct}%</span>
        </div>
        <Meter pct={Math.min(w.pct, 100)} zone={w.zone} label={`Carga de ${member?.name ?? ''}`} />
        <span className="load-hint">
          {w.points} de {w.capacity} puntos · {zone.hint}
        </span>
      </div>

      <div className="kpi3">
        <div>
          <b>{w.open}</b>
          <span>abiertas</span>
        </div>
        <div className={w.overdue ? 'bad' : ''}>
          <b>{w.overdue}</b>
          <span>vencidas</span>
        </div>
        <div className={w.done7d ? 'good' : ''}>
          <b>{w.done7d}</b>
          <span>hechas esta semana</span>
        </div>
      </div>
      {flags.length > 0 && (
        <div className="flags">
          {flags.map((f) => (
            <span key={f.text} className={`chip ${f.cls}`}>
              {f.text}
            </span>
          ))}
        </div>
      )}

      <div className="work">
        <span className="tag">Ahora</span>
        <div>{w.current ? <TaskLine t={w.current} onOpen={openTask} /> : <span className="muted">Nada en curso</span>}</div>
        <span className="tag">Después</span>
        <div className="stack" style={{ gap: 4 }}>
          {w.next.length === 0 && <span className="muted">Nada pendiente</span>}
          {w.next.slice(0, 2).map((t) => (
            <TaskLine key={t.id} t={t} onOpen={openTask} />
          ))}
        </div>
      </div>

      {mostly.length > 0 && <p className="mostly">Sobre todo: {mostly.join(' y ').toLowerCase()}</p>}
    </section>
  )
}

function TaskLine({ t, onOpen }: { t: TaskBrief; onOpen: (id: number) => void }) {
  return (
    <button type="button" className="task-line" onClick={() => onOpen(t.id)} title={`${t.key} · ${t.title}`}>
      <span className="t">{t.title}</span>
      <span className="k">{t.key}</span>
    </button>
  )
}

function FragmentRow({ name, overdue, children }: { name: string; overdue: number; children: ReactNode }) {
  return (
    <>
      <span className="row" style={{ gap: 6, fontSize: 12.5, fontWeight: 700 }}>
        {name}
        {overdue > 0 && (
          <span className="chip" style={{ height: 20, color: 'var(--bad)' }} title="Vencidas">
            {overdue}
          </span>
        )}
      </span>
      {children}
    </>
  )
}
