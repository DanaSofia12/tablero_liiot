import type { ReactNode } from 'react'
import { ArrowLeftRight, Gauge } from 'lucide-react'
import { useMetrics, usePresence, useTaskActions, useTasks } from '../api'
import { Empty, MemberHead, Meter, Panel, PresenceChip, useMemberMap, useTypeMap } from '../components/bits'
import { parseDay, todayISO, weekdayShort } from '../lib/format'
import { useUI } from '../ui'

export default function TeamPage() {
  const metrics = useMetrics().data
  const presence = usePresence().data ?? []
  const tasks = useTasks().data ?? []
  const members = useMemberMap()
  const types = useTypeMap()
  const { openTask, toast } = useUI()
  const { update } = useTaskActions()
  const today = todayISO()

  if (!metrics) return <div className="page"><Empty>Calculando la carga…</Empty></div>
  const days = Object.keys(metrics.team[0]?.dueByDay ?? {})
  const overdueBy = (id: string) => tasks.filter((t) => t.ownerId === id && t.status !== 'hecha' && t.dueDate && t.dueDate < today).length

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <p className="eyebrow">Próximos 14 días</p>
          <h1>Carga del equipo</h1>
          <p>Quién está recibiendo más trabajo, qué hace cada quien ahora y qué viene después.</p>
        </div>
      </div>

      <div className="team-grid">
        {metrics.team.map((w) => {
          const m = members[w.memberId]
          const p = presence.find((x) => x.memberId === w.memberId)
          const total = Object.values(w.mix).reduce((a, b) => a + b, 0) || 1
          return (
            <section key={w.memberId} className="panel load-card">
              <div className="head">
                <MemberHead member={m} size={52} />
                <div className="grow">
                  <b>{m?.name}</b>
                  <span className="muted" style={{ fontSize: 12 }}>
                    {m?.role} · capacidad {w.capacity} pts
                  </span>
                </div>
                {p && <PresenceChip state={p.state} />}
              </div>
              <div>
                <div className="row" style={{ justifyContent: 'space-between', alignItems: 'flex-end' }}>
                  <span className="muted" style={{ fontSize: 12.5 }}>
                    {w.points} de {w.capacity} puntos
                  </span>
                  <span className={w.zone === 'rosa' ? 'num-outline pct' : 'num-grad pct'}>{w.pct}%</span>
                </div>
                <Meter pct={w.pct} zone={w.zone} label={`Carga de ${m?.name}`} />
              </div>
              <div className="nums">
                <div>
                  <b>{w.open}</b>
                  <span>abiertas</span>
                </div>
                <div>
                  <b>{w.inProgress}</b>
                  <span>en progreso</span>
                </div>
                <div>
                  <b>{w.inReview}</b>
                  <span>en revisión</span>
                </div>
                <div className={w.overdue ? 'bad' : ''}>
                  <b>{w.overdue}</b>
                  <span>vencidas</span>
                </div>
                <div className={w.blocked ? 'bad' : ''}>
                  <b>{w.blocked}</b>
                  <span>bloqueadas</span>
                </div>
                <div>
                  <b>{w.done7d}</b>
                  <span>hechas 7 d</span>
                </div>
              </div>
              <div className="stack" style={{ gap: 6, fontSize: 12.5 }}>
                <div className="row">
                  <span className="pix muted" style={{ width: 52 }}>
                    Ahora
                  </span>
                  {w.current ? (
                    <button type="button" className="btn sm ghost" style={{ padding: 0, height: 'auto' }} onClick={() => openTask(w.current!.id)}>
                      {w.current.key} · {w.current.title}
                    </button>
                  ) : (
                    <span className="muted">Nada en progreso</span>
                  )}
                </div>
                <div className="row" style={{ alignItems: 'flex-start' }}>
                  <span className="pix muted" style={{ width: 52 }}>
                    Sigue
                  </span>
                  <span className="stack" style={{ gap: 3 }}>
                    {w.next.length === 0 && <span className="muted">Nada pendiente</span>}
                    {w.next.map((t) => (
                      <button key={t.id} type="button" className="btn sm ghost" style={{ padding: 0, height: 'auto', justifyContent: 'flex-start' }} onClick={() => openTask(t.id)}>
                        {t.key} · {t.title}
                      </button>
                    ))}
                  </span>
                </div>
              </div>
              <div>
                <div className="mix" title="Mezcla de trabajo por tipo">
                  {Object.entries(w.mix).map(([type, pts]) => (
                    <i key={type} style={{ flex: pts / total, background: types[type]?.color ?? 'var(--acc)' }} title={`${types[type]?.label ?? type}: ${pts} pts`} />
                  ))}
                </div>
                <div className="row wrap" style={{ marginTop: 6, gap: 8, fontSize: 11.5 }}>
                  {Object.entries(w.mix).map(([type, pts]) => (
                    <span key={type} className="muted">
                      {types[type]?.label ?? type} {pts}
                    </span>
                  ))}
                </div>
              </div>
            </section>
          )
        })}
      </div>

      <div className="follow-grid">
        <Panel title="Entregas por día" icon={<Gauge size={17} style={{ color: 'var(--acc)' }} />}>
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
                    <span key={d} className={`cell${n >= 3 ? ' l3' : n === 2 ? ' l2' : n === 1 ? ' l1' : we ? ' we' : ''}`} title={`${n} entregas`}>
                      {n || ''}
                    </span>
                  )
                })}
              </FragmentRow>
            ))}
          </div>
          <p className="muted" style={{ fontSize: 12, marginTop: 10 }}>
            El número indica cuántas tareas vencen ese día. Las vencidas de días anteriores aparecen junto al nombre.
          </p>
        </Panel>
        <Panel title="Sugerencias de reparto" icon={<ArrowLeftRight size={17} style={{ color: 'var(--acc-2)' }} />}>
          {metrics.suggestions.length === 0 && <Empty>La carga está equilibrada. Nadie pasa del 100 % mientras otro está bajo el 70 %.</Empty>}
          {metrics.suggestions.map((s) => (
            <div key={s.taskId} className="stack" style={{ padding: '10px 0', borderTop: '1px solid var(--line)' }}>
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
                  Reasignar
                </button>
              </div>
            </div>
          ))}
          <p className="muted" style={{ fontSize: 12, marginTop: 12 }}>
            Carga = puntos de esfuerzo (S 1 · M 2 · L 3) de las tareas abiertas que vencen en 14 días, dividido por la capacidad de cada persona. Verde bajo 70 %, amarillo hasta 100 %, rosa por encima.
          </p>
        </Panel>
      </div>
    </div>
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
