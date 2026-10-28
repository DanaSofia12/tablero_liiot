import { useSearchParams } from 'react-router-dom'
import { Ban, Check, Flame, Hourglass, Plus, Star } from 'lucide-react'
import { useMetrics, usePresence, useProject, useTaskActions, useTasks } from '../api'
import { Avatar, type Mood } from '../components/Avatar'
import { Due, Empty, MemberHead, Meter, Panel, PresenceChip, Prio, StatusChip, TypeChip, useMemberMap } from '../components/bits'
import { addDays, byUrgency, fmtShort, greeting, parseDay, todayISO, weekdayShort } from '../lib/format'
import { usePrefs } from '../prefs'
import { useUI } from '../ui'
import type { PresenceState, Task } from '../types'

const MOOD: Partial<Record<PresenceState, Mood>> = { bloqueado: 'flat', fuera: 'sleep', celebrando: 'open' }

export default function MePage() {
  const [params, setParams] = useSearchParams()
  const { me } = usePrefs()
  const members = useMemberMap()
  const tasks = useTasks().data ?? []
  const metrics = useMetrics().data
  const presence = usePresence().data ?? []
  const project = useProject().data
  const { openTask, openCreate, toast } = useUI()
  const { update } = useTaskActions()
  const id = params.get('persona') ?? me ?? 'dana'
  const person = members[id]
  const today = todayISO()

  if (!person) return <div className="page"><Empty>Cargando tu espacio…</Empty></div>

  const mine = tasks.filter((t) => t.ownerId === id && t.status !== 'hecha').sort(byUrgency)
  const focus = mine.filter((t) => t.status !== 'en_revision').slice(0, 3)
  const waiting = tasks.filter((t) => t.status === 'bloqueada' && t.blockerWaitingOn === id)
  const reviews = person.role === 'CEO' ? tasks.filter((t) => t.status === 'en_revision') : []
  const load = metrics?.team.find((w) => w.memberId === id)
  const pres = presence.find((p) => p.memberId === id)
  const stage = project?.stages.find((s) => s.id === metrics?.project.currentStageId)
  const xp = (load?.doneTotal ?? 0) * 20 + (load?.done7d ?? 0) * 10
  const level = Math.floor(xp / 100) + 1
  const overdue = mine.filter((t) => t.dueDate && t.dueDate < today).length
  const days = Array.from({ length: 7 }, (_, i) => addDays(today, i))
  const mood = MOOD[pres?.state ?? 'disponible'] ?? 'smile'

  const done = (t: Task) =>
    update.mutate({ id: t.id, patch: { status: 'hecha' } }, { onSuccess: () => toast(`🎉 ${t.key} quedó hecha`, 'party') })

  return (
    <div className="page">
      <div className="row wrap">
        <span className="pix muted">Ver como</span>
        <div className="seg">
          {Object.values(members).map((m) => (
            <button key={m.id} type="button" aria-pressed={m.id === id} onClick={() => setParams(m.id === me ? {} : { persona: m.id })}>
              <MemberHead member={m} size={22} /> {m.name}
            </button>
          ))}
        </div>
      </div>

      <section className="panel edge me-hero">
        <Avatar avatar={person.avatar} color={person.color} variant="full" size={118} mood={mood} cheer={pres?.state === 'celebrando'} title={person.name} />
        <div style={{ minWidth: 0 }}>
          <p className="eyebrow">
            {person.role} · {stage ? stage.name : 'Bleepy'}
          </p>
          <h1>
            {greeting()}, {person.name}
          </h1>
          <p>
            {mine.length === 0
              ? 'No tienes tareas abiertas. Buen momento para tomar algo del tablero.'
              : `Tienes ${mine.length} tareas abiertas${overdue ? `, ${overdue} vencidas` : ''}${waiting.length ? ` y ${waiting.length} bloqueos esperan por ti` : ''}.`}
            {metrics?.project.daysToPilot != null && ` El piloto es en ${metrics.project.daysToPilot} días.`}
          </p>
          <div className="row wrap" style={{ marginTop: 12 }}>
            {pres && <PresenceChip state={pres.state} />}
            <button type="button" className="btn sm" onClick={() => openCreate({ ownerId: id })}>
              <Plus size={14} /> Tarea para {person.name}
            </button>
          </div>
        </div>
        <div className="me-stats">
          <div className="row">
            <Star size={16} style={{ color: 'var(--amber)' }} />
            <span className="pix">
              Nivel {level} · {xp} XP
            </span>
          </div>
          <Meter pct={xp % 100} zone="grad" label="Progreso al siguiente nivel" />
          <div className="row">
            <Flame size={16} style={{ color: 'var(--acc-2)' }} />
            <span style={{ fontSize: 12.5 }}>{load?.done7d ?? 0} hechas esta semana</span>
          </div>
          <div style={{ marginTop: 6 }}>
            <div className="row" style={{ justifyContent: 'space-between' }}>
              <span className="pix muted">Carga</span>
              <b className="num-grad" style={{ fontSize: 22 }}>
                {load?.pct ?? 0}%
              </b>
            </div>
            <Meter pct={load?.pct ?? 0} zone={load?.zone} label="Carga" />
          </div>
        </div>
      </section>

      <div className="me-grid">
        <Panel title="Mi foco hoy" icon={<Star size={17} style={{ color: 'var(--acc)' }} />}>
          {focus.length === 0 && <Empty>Nada urgente. ✨</Empty>}
          {focus.map((t) => (
            <div key={t.id} className="task-row" role="button" tabIndex={0} onClick={() => openTask(t.id)} onKeyDown={(e) => e.key === 'Enter' && openTask(t.id)}>
              <button
                type="button"
                className="check"
                aria-label={`Marcar ${t.key} como hecha`}
                onClick={(e) => {
                  e.stopPropagation()
                  done(t)
                }}
              >
                <Check size={12} />
              </button>
              <div style={{ minWidth: 0 }}>
                <b>{t.title}</b>
                <div className="meta">
                  <TypeChip type={t.type} />
                  <Prio p={t.priority} />
                  {t.status === 'bloqueada' ? <StatusChip s={t.status} /> : <Due task={t} today={today} />}
                  <span className="key">{t.key}</span>
                </div>
              </div>
            </div>
          ))}
        </Panel>

        <Panel title={person.role === 'CEO' ? 'Esperan por ti' : 'Lo que me frena'} icon={<Hourglass size={17} style={{ color: 'var(--info)' }} />}>
          {waiting.length + reviews.length === 0 && mine.filter((t) => t.status === 'bloqueada').length === 0 && <Empty>Nadie te espera ahora mismo.</Empty>}
          {waiting.map((t) => (
            <div key={t.id} className="task-row" role="button" tabIndex={0} onClick={() => openTask(t.id)}>
              <Ban size={18} style={{ color: 'var(--bad)', flexShrink: 0 }} />
              <div>
                <b>
                  {members[t.ownerId]?.name} espera: {t.blockerReason}
                </b>
                <div className="meta">
                  <span className="key">{t.key}</span>
                  <span className="muted" style={{ fontSize: 12 }}>
                    {t.title}
                  </span>
                </div>
              </div>
            </div>
          ))}
          {reviews.map((t) => (
            <div key={t.id} className="task-row" role="button" tabIndex={0} onClick={() => openTask(t.id)}>
              <Hourglass size={18} style={{ color: 'var(--info)', flexShrink: 0 }} />
              <div>
                <b>Revisar: {t.title}</b>
                <div className="meta">
                  <MemberHead member={members[t.ownerId]} size={20} />
                  <span className="key">{t.key}</span>
                </div>
              </div>
            </div>
          ))}
          {mine
            .filter((t) => t.status === 'bloqueada')
            .map((t) => (
              <div key={t.id} className="task-row" role="button" tabIndex={0} onClick={() => openTask(t.id)}>
                <Ban size={18} style={{ color: 'var(--bad)', flexShrink: 0 }} />
                <div>
                  <b>
                    {t.key}: {t.blockerReason}
                  </b>
                  <div className="meta">
                    <span className="muted" style={{ fontSize: 12 }}>
                      Esperas a {members[t.blockerWaitingOn ?? '']?.name ?? t.blockerWaitingOn ?? 'alguien'}
                    </span>
                  </div>
                </div>
              </div>
            ))}
        </Panel>

        <Panel title="Mi semana">
          <div className="week">
            {days.map((d) => {
              const due = mine.filter((t) => t.dueDate === d)
              return (
                <div key={d} className={`d${d === today ? ' today' : ''}`} title={due.map((t) => t.key).join(', ')}>
                  {weekdayShort(d)}
                  <b>{parseDay(d).getDate()}</b>
                  <span className="dots">
                    {due.slice(0, 3).map((t) => (
                      <i key={t.id} />
                    ))}
                  </span>
                </div>
              )
            })}
          </div>
          {overdue > 0 && (
            <p className="muted" style={{ marginTop: 10, fontSize: 12.5 }}>
              Además tienes {overdue} tareas vencidas de etapas anteriores.
            </p>
          )}
        </Panel>

        <Panel title={`Todas mis tareas · ${mine.length}`} className="span-2">
          {mine.length === 0 && <Empty>Sin tareas abiertas.</Empty>}
          {mine.map((t) => (
            <div key={t.id} className="task-row" role="button" tabIndex={0} onClick={() => openTask(t.id)} onKeyDown={(e) => e.key === 'Enter' && openTask(t.id)}>
              <span className="key" style={{ width: 48 }}>
                {t.key}
              </span>
              <div style={{ minWidth: 0, flex: 1 }}>
                <b>{t.title}</b>
                <div className="meta">
                  <StatusChip s={t.status} />
                  <Prio p={t.priority} />
                  <Due task={t} today={today} />
                  {t.dueDate && <span className="muted" style={{ fontSize: 11.5 }}>{fmtShort(t.dueDate)}</span>}
                </div>
              </div>
            </div>
          ))}
        </Panel>

        <Panel title="Equipo ahora">
          {Object.values(members)
            .filter((m) => m.id !== id)
            .map((m) => {
              const p = presence.find((x) => x.memberId === m.id)
              const w = metrics?.team.find((x) => x.memberId === m.id)
              return (
                <div key={m.id} className="task-row" role="button" tabIndex={0} onClick={() => setParams({ persona: m.id })}>
                  <MemberHead member={m} size={34} mood={MOOD[p?.state ?? 'disponible'] === 'open' ? 'open' : undefined} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <b>
                      {m.name} <span className="muted" style={{ fontWeight: 500 }}>· {m.role}</span>
                    </b>
                    <div className="meta">
                      {p && <PresenceChip state={p.state} />}
                      {p?.task && <span className="key">{p.task.key}</span>}
                    </div>
                  </div>
                  <b className="num-grad" style={{ fontSize: 18 }}>
                    {w?.pct ?? 0}%
                  </b>
                </div>
              )
            })}
        </Panel>
      </div>
    </div>
  )
}
