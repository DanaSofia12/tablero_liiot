import { lazy, Suspense, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Ban, Clock, Hourglass, Orbit, Rocket, Sparkles, TriangleAlert } from 'lucide-react'
import { api, qk, useMembers, useMetrics, usePresence, useProject, useRefresh, useTasks } from '../api'
import { MemberHead, Meter, Panel, PresenceChip, Toggle, useMemberMap } from '../components/bits'
import { daysBetween, fmtDay, relativeDue, todayISO } from '../lib/format'
import { usePrefs } from '../prefs'
import { useUI } from '../ui'
import { hasWebGL } from '../office/webgl'
import type { RoomData } from '../office/Room'

const Office3D = lazy(() => import('../office/Office3D'))

const QUICK: { v: string; label: string }[] = [
  { v: 'auto', label: 'Según mis tareas' },
  { v: 'reunion', label: 'En reunión' },
  { v: 'foco', label: 'Modo foco' },
  { v: 'disponible', label: 'Disponible' },
  { v: 'fuera', label: 'Me desconecto' },
]

export default function OfficePage() {
  const navigate = useNavigate()
  const { me, uni, setUni, resolvedMode, pixel, setPixel, ignoreHours, setIgnoreHours, calm } = usePrefs()
  const members = useMembers().data ?? []
  const memberMap = useMemberMap()
  const presence = usePresence().data ?? []
  const tasks = useTasks().data ?? []
  const metrics = useMetrics().data
  const project = useProject().data
  const refresh = useRefresh()
  const { openTask, toast } = useUI()
  const today = todayISO()
  const webgl = useMemo(hasWebGL, [])
  const [hint, setHint] = useState<string | null>(null)

  const data: RoomData = useMemo(() => {
    const v = metrics?.project.verdict
    const pilot = project?.project.pilotDate
    return {
      counts: {
        todo: tasks.filter((t) => t.status === 'por_hacer').length,
        doing: tasks.filter((t) => t.status === 'en_progreso' || t.status === 'en_revision').length,
        blocked: tasks.filter((t) => t.status === 'bloqueada').length,
        done: tasks.filter((t) => t.status === 'hecha').length,
      },
      blockingOk: v?.blockingOk ?? 0,
      blockingTotal: v?.blockingTotal ?? 0,
      daysToPilot: pilot ? daysBetween(today, pilot) : null,
      tasksDone: metrics?.project.tasksDone ?? 0,
      tasksTotal: metrics?.project.tasksTotal ?? 0,
      overdue: metrics?.project.overdue ?? 0,
      pilotDay: pilot ? Number(pilot.slice(8, 10)) : 15,
      ready: v?.decision === 'lanzar',
    }
  }, [tasks, metrics, project, today])

  const alerts = useMemo(() => {
    const blocked = tasks.filter((t) => t.status === 'bloqueada')
    const review = tasks.filter((t) => t.status === 'en_revision')
    const overdue = tasks.filter((t) => t.status !== 'hecha' && t.dueDate && t.dueDate < today).sort((a, b) => (a.dueDate ?? '').localeCompare(b.dueDate ?? ''))
    return [
      ...blocked.map((t) => ({ t, icon: Ban, color: 'var(--bad)', title: `${t.key} bloqueada`, text: `${memberMap[t.ownerId]?.name}: ${t.blockerReason ?? ''}` })),
      ...review.map((t) => ({ t, icon: Hourglass, color: 'var(--info)', title: `${t.key} por revisar`, text: t.title })),
      ...overdue.slice(0, 4).map((t) => ({ t, icon: Clock, color: 'var(--acc-2)', title: `${t.key} venció ${relativeDue(t.dueDate, today)}`, text: `${memberMap[t.ownerId]?.name} · ${t.title}` })),
    ]
  }, [tasks, memberMap, today])

  const meMember = me ? memberMap[me] : undefined
  const setQuick = async (v: string) => {
    if (!me) return
    await api.patch(`/api/members/${me}`, { presence: v, minutes: v === 'fuera' ? 0 : 120 })
    refresh(qk.members, qk.presence)
    toast(v === 'auto' ? 'Tu avatar vuelve a seguir tus tareas' : `Estado: ${QUICK.find((q) => q.v === v)?.label}`)
  }
  const stage = project?.stages.find((s) => s.id === metrics?.project.currentStageId)
  const v = metrics?.project.verdict

  return (
    <div className="page">
      <div className="office-layout">
        <section className="panel office-stage" aria-label="Oficina 3D">
          <div className="office-tools">
            <div className="title">
              <span className="orb" style={{ width: 30, height: 30 }} />
              <span>
                <b>{uni === 'bleepy' ? 'Estación Bleepy' : 'Oficina Liiot HQ'}</b>
                <small>{stage ? `${stage.name} · ${fmtDay(today)}` : fmtDay(today)}</small>
              </span>
            </div>
            <span className="grow" />
            <button type="button" className="btn sm" onClick={() => setUni(uni === 'liiot' ? 'bleepy' : 'liiot')}>
              <Orbit size={14} /> {uni === 'liiot' ? 'Universo Bleepy' : 'Volver a Liiot'}
            </button>
            <button type="button" className="btn sm" aria-pressed={pixel} onClick={() => setPixel(!pixel)}>
              <Sparkles size={14} /> {pixel ? 'Quitar pixel' : 'Modo pixel'}
            </button>
          </div>
          {webgl ? (
            <Suspense fallback={<div className="office-fallback">Armando la oficina…</div>}>
              <Office3D
                members={members}
                presence={presence}
                data={data}
                uni={uni}
                mode={resolvedMode}
                pixel={pixel}
                calm={calm}
                go={(path) => navigate(path)}
                toggleUniverse={() => setUni(uni === 'liiot' ? 'bleepy' : 'liiot')}
                onSelectMember={(id) => navigate(`/yo?persona=${id}`)}
                onHint={setHint}
              />
            </Suspense>
          ) : (
            <div className="office-fallback">Este navegador no tiene WebGL. Usa Mi espacio y Tareas: muestran lo mismo en 2D.</div>
          )}
          <p className={hint ? 'office-hint on' : 'office-hint'} aria-live="polite">
            {hint ?? 'Arrastra para mirar alrededor · rueda para acercar · clic en el tablero, la pantalla, el calendario o la puerta'}
          </p>
        </section>

        <aside className="pulse">
          <Panel title="Pulso del equipo">
            <div className="stack" style={{ gap: 8 }}>
              {members.map((m) => {
                const p = presence.find((x) => x.memberId === m.id)
                const w = metrics?.team.find((x) => x.memberId === m.id)
                return (
                  <button key={m.id} type="button" className="pulse-row" onClick={() => navigate(`/yo?persona=${m.id}`)}>
                    <MemberHead member={m} size={40} mood={p?.state === 'bloqueado' ? 'flat' : p?.state === 'fuera' ? 'sleep' : undefined} />
                    <span className="who">
                      <span className="row" style={{ gap: 6 }}>
                        <b>{m.name}</b>
                        <span className="muted" style={{ fontSize: 11.5 }}>
                          {m.role}
                        </span>
                        <span className="grow" />
                        {p && <PresenceChip state={p.state} />}
                      </span>
                      <span className="what">{p?.state === 'bloqueado' ? `Bloqueo: ${p.detail}` : p?.task ? `${p.task.key} · ${p.task.title}` : 'Sin tarea en curso'}</span>
                      <Meter pct={w?.pct ?? 0} zone={w?.zone} label={`Carga de ${m.name}`} />
                    </span>
                  </button>
                )
              })}
            </div>
            <div className="divider" />
            <div className="row" style={{ justifyContent: 'space-between' }}>
              <span style={{ fontSize: 12.5 }}>Ver estados aunque sea fuera de horario</span>
              <Toggle checked={ignoreHours} onChange={setIgnoreHours} label="Ignorar horario" />
            </div>
          </Panel>

          {meMember && (
            <Panel title={`Mi estado · ${meMember.name}`}>
              <div className="pills">
                {QUICK.map((q) => (
                  <button key={q.v} type="button" aria-pressed={(meMember.presenceOverride ?? 'auto') === q.v} onClick={() => setQuick(q.v)}>
                    {q.label}
                  </button>
                ))}
              </div>
            </Panel>
          )}

          <Panel title="Necesita atención" icon={<TriangleAlert size={17} style={{ color: 'var(--acc-2)' }} />}>
            {alerts.length === 0 && <p className="muted" style={{ fontSize: 13 }}>Todo en orden. ✨</p>}
            <ul className="alert-list">
              {alerts.slice(0, 6).map(({ t, icon: Icon, color, title, text }) => (
                <li key={`${title}-${t.id}`}>
                  <button type="button" onClick={() => openTask(t.id)}>
                    <Icon style={{ color }} />
                    <span>
                      <b>{title}</b>
                      <span>{text}</span>
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          </Panel>
        </aside>
      </div>

      <div className="kpis">
        <section className="panel kpi">
          <span className="pix muted">Piloto</span>
          <span className="big num-outline">{data.daysToPilot ?? '—'}</span>
          <small>días para el {fmtDay(project?.project.pilotDate)}</small>
        </section>
        <section className="panel kpi" role="button" tabIndex={0} onClick={() => navigate('/lanzamiento')} style={{ cursor: 'pointer' }}>
          <span className="pix muted">
            <Rocket size={12} /> Bloqueantes
          </span>
          <span className="big num-grad">
            {v?.blockingOk ?? 0}/{v?.blockingTotal ?? 0}
          </span>
          <small>{v?.decision === 'lanzar' ? 'Listo para lanzar' : v?.decision === 'lanzar_con_riesgo' ? 'Lanzar con riesgo' : 'Aún no se lanza'}</small>
        </section>
        <section className="panel kpi" role="button" tabIndex={0} onClick={() => navigate('/tareas')} style={{ cursor: 'pointer' }}>
          <span className="pix muted">Tareas hechas</span>
          <span className="big num-grad">
            {metrics?.project.tasksDone ?? 0}/{metrics?.project.tasksTotal ?? 0}
          </span>
          <small>{metrics?.project.inProgress ?? 0} en progreso</small>
        </section>
        <section className="panel kpi">
          <span className="pix muted">Salud</span>
          <span className="big num-grad" style={{ textTransform: 'capitalize' }}>
            {metrics?.project.health ?? '—'}
          </span>
          <small>{metrics?.project.healthReasons[0] ?? 'Sin alertas'}</small>
        </section>
      </div>
    </div>
  )
}
