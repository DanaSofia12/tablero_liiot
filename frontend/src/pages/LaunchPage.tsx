import { useState } from 'react'
import { ChevronRight, ClipboardCheck, ListChecks, Lock, Plus, Rocket } from 'lucide-react'
import { api, useProject, useProjectTasks, useRefresh, useRubric, qk } from '../api'
import { Empty, MemberHead, Meter, useMemberMap } from '../components/bits'
import { daysBetween, fmtDay, fmtMoment, fmtShort, todayISO } from '../lib/format'
import { usePrefs } from '../prefs'
import { useUI } from '../ui'
import type { Criterion, CriterionState, Decision, Stage } from '../types'

const DECISION: Record<Decision, string> = {
  lanzar: 'Listo para lanzar',
  lanzar_con_riesgo: 'Lanzar con riesgo',
  no_lanzar: 'No lanzar todavía',
}
const STATES: { v: CriterionState; label: string }[] = [
  { v: 'pendiente', label: '—' },
  { v: 'cumple', label: 'Cumple' },
  { v: 'parcial', label: 'Parcial' },
  { v: 'no_cumple', label: 'No' },
]

export default function LaunchPage() {
  const projectData = useProject().data
  const rubric = useRubric().data
  const tasks = useProjectTasks().data ?? []
  const members = useMemberMap()
  const refresh = useRefresh()
  const { toast, openTask } = useUI()
  const { me } = usePrefs()
  const [editing, setEditing] = useState<Stage | 'nueva' | null>(null)
  const [reviewOpen, setReviewOpen] = useState(false)
  const today = todayISO()

  if (!projectData || !rubric) return <div className="page"><Empty>Cargando el lanzamiento…</Empty></div>
  const { project, stages } = projectData
  const v = rubric.verdict
  const fuel = v.blockingTotal ? v.blockingOk / v.blockingTotal : 0
  const days = project.pilotDate ? daysBetween(today, project.pilotDate) : null
  const taskByKey = Object.fromEntries(tasks.map((t) => [t.key, t]))
  const milestone = project.id === 'bleepy' ? 'piloto' : 'entrega'
  const criteriaCount = rubric.categories.reduce((n, cat) => n + cat.criteria.length, 0)
  const createBasicRubric = async () => {
    try {
      await api.post('/api/rubric/template', { projectId: project.id })
      refresh(qk.rubric, qk.metrics)
      toast('Rúbrica básica creada: ajústala a tu proyecto')
    } catch (e) {
      toast((e as Error).message, 'bad')
    }
  }

  const setCriterion = async (c: Criterion, patch: Partial<Pick<Criterion, 'state' | 'ownerId'>>) => {
    try {
      await api.patch(`/api/rubric/criteria/${c.id}`, patch)
      refresh(qk.rubric, qk.metrics)
    } catch (e) {
      toast((e as Error).message, 'bad')
    }
  }

  return (
    <div className="page">
      <section className="panel edge launch-head">
        <span className="orb" style={{ width: 64, height: 64 }} />
        <div style={{ minWidth: 0 }}>
          <p className="eyebrow">
            {project.code}
            {project.phase ? ` · ${project.phase}` : ''}
          </p>
          <h1 style={{ fontSize: 'clamp(26px, 3vw, 38px)' }}>{project.name}</h1>
          <p className="muted" style={{ marginTop: 6, maxWidth: '70ch' }}>
            {project.summary}
          </p>
          <div className="row wrap" style={{ marginTop: 10 }}>
            <span className="chip">
              <MemberHead member={members[project.leadId ?? '']} size={18} /> Líder: {members[project.leadId ?? '']?.name ?? '—'}
            </span>
            <span className="chip">
              {milestone === 'piloto' ? 'Piloto' : 'Entrega'} {project.pilotDate ? fmtDay(project.pilotDate) : 'sin fecha'}
            </span>
            {project.backupDate && <span className="chip">Respaldo {fmtDay(project.backupDate)}</span>}
          </div>
        </div>
        <div style={{ textAlign: 'right' }}>
          <div className="num-outline" style={{ fontSize: 64, lineHeight: 0.9 }}>
            {days ?? '—'}
          </div>
          <span className="pix muted">días para la {milestone}</span>
        </div>
      </section>

      <div className="stages">
        {stages.length === 0 && (
          <p className="muted" style={{ fontSize: 13, alignSelf: 'center' }}>
            Este proyecto aún no tiene etapas. Son opcionales: sirven para agrupar las tareas por semanas en el cronograma.
          </p>
        )}
        {stages.map((st) => {
          const stTasks = tasks.filter((t) => t.stageId === st.id)
          const done = stTasks.filter((t) => t.status === 'hecha').length
          const now = st.start <= today && today <= st.end
          const past = st.end < today
          return (
            <button key={st.id} type="button" className={`stage-card${now ? ' now' : ''}${past ? ' past' : ''}`} onClick={() => setEditing(st)} title="Editar etapa">
              <span className="when">
                {fmtShort(st.start)} – {fmtShort(st.end)} {now && '· en curso'}
              </span>
              <b>{st.name}</b>
              <span className="muted" style={{ fontSize: 11.5 }}>
                {done}/{stTasks.length} tareas hechas
              </span>
              <span className="bar">
                <i style={{ width: `${stTasks.length ? (done * 100) / stTasks.length : 0}%` }} />
              </span>
            </button>
          )
        })}
        <button type="button" className="stage-card add" onClick={() => setEditing('nueva')}>
          <Plus size={18} /> <b>Agregar etapa</b>
        </button>
      </div>

      <div className="launch-grid">
        <section className="panel verdict">
          <div className="panel-head" style={{ marginBottom: 0 }}>
            <Rocket size={18} style={{ color: 'var(--acc-2)' }} />
            <h2>Veredicto de hoy</h2>
          </div>
          <div className={`decision ${v.decision}`}>{DECISION[v.decision]}</div>
          <div className="rocket-wrap">
            <RocketGauge fuel={fuel} ready={v.decision === 'lanzar'} />
            <div className="stack">
              <div>
                <div className="row" style={{ justifyContent: 'space-between' }}>
                  <span className="muted" style={{ fontSize: 12.5 }}>
                    Bloqueantes que cumplen
                  </span>
                  <b className="tnum">
                    {v.blockingOk}/{v.blockingTotal}
                  </b>
                </div>
                <Meter pct={fuel * 100} zone="grad" label="Bloqueantes" />
              </div>
              <div>
                <div className="row" style={{ justifyContent: 'space-between' }}>
                  <span className="muted" style={{ fontSize: 12.5 }}>
                    Demás criterios
                  </span>
                  <b className="tnum">
                    {v.othersOk}/{v.othersTotal} · {v.othersPct}%
                  </b>
                </div>
                <Meter pct={v.othersPct} zone={v.othersPct >= v.threshold ? '' : 'amarillo'} label="Demás criterios" />
              </div>
              <span className="muted" style={{ fontSize: 12 }}>
                {v.partial} parciales · {v.failing} no cumplen
              </span>
            </div>
          </div>
          <p className="rule-note">
            <b>Regla de la rúbrica:</b> lanzar si cumplen todos los bloqueantes y al menos el {v.threshold}% de los demás. Con todos los bloqueantes y menos del{' '}
            {v.threshold}%, lanzar con riesgo. Si falla uno, no lanzar y pasar a la fecha de respaldo.
          </p>
          <button type="button" className="btn primary" onClick={() => setReviewOpen(true)}>
            <ClipboardCheck size={16} /> Registrar revisión
          </button>
          <div>
            <p className="pix muted" style={{ marginBottom: 6 }}>
              Revisiones
            </p>
            {rubric.reviews.length === 0 && <p className="muted" style={{ fontSize: 12.5 }}>Aún no hay revisiones. La rúbrica pide una en la semana 4 y otra 24 h antes del piloto.</p>}
            {rubric.reviews.map((r) => (
              <div key={r.id} className="link-row" style={{ fontSize: 12.5 }}>
                <MemberHead member={members[r.reviewerId]} size={22} />
                <div className="grow">
                  <b>{DECISION[r.decision]}</b> · {r.blockingOk}/{r.blockingTotal} bloqueantes
                  {r.notes && <div className="muted">{r.notes}</div>}
                </div>
                <span className="muted">{fmtMoment(r.at)}</span>
              </div>
            ))}
          </div>
        </section>

        <div className="rubric">
          {rubric.categories.length === 0 && (
            <section className="panel empty-project">
              <ListChecks size={28} style={{ color: 'var(--acc)' }} />
              <h2>{project.name} todavía no tiene rúbrica de lanzamiento</h2>
              <p className="muted">
                La rúbrica es la lista de lo que debe cumplirse antes de lanzar. Los criterios con candado son bloqueantes: si uno no cumple, no se lanza.
              </p>
              <button type="button" className="btn primary" onClick={createBasicRubric}>
                <ListChecks size={16} /> Crear rúbrica básica (6 criterios)
              </button>
            </section>
          )}
          {rubric.categories.map((cat, i) => {
            const blocking = cat.criteria.filter((c) => c.blocking)
            const ok = cat.criteria.filter((c) => c.state === 'cumple').length
            return (
              <details key={cat.id} open={i < 2}>
                <summary>
                  <ChevronRight size={16} className="chev" />
                  {cat.name}
                  <span className="counts">
                    <span>
                      <Lock size={11} /> {blocking.filter((c) => c.state === 'cumple').length}/{blocking.length}
                    </span>
                    <span>
                      {ok}/{cat.criteria.length}
                    </span>
                    <span style={{ width: 70 }}>
                      <Meter pct={(ok * 100) / Math.max(1, cat.criteria.length)} zone="grad" label={cat.name} />
                    </span>
                  </span>
                </summary>
                {cat.criteria.map((c) => (
                  <div key={c.id} className="crit">
                    <span className="code">{c.code}</span>
                    <div className="text">
                      <b>{c.title}</b>
                      <span>{c.verify}</span>
                      {c.taskKeys.length > 0 && (
                        <span className="links">
                          {c.taskKeys.map((k) => (
                            <button key={k} type="button" className="code-chip" style={{ border: 0, cursor: 'pointer' }} onClick={() => taskByKey[k] && openTask(taskByKey[k].id)}>
                              {k}
                            </button>
                          ))}
                        </span>
                      )}
                    </div>
                    <span title={c.blocking ? 'Bloqueante: si no cumple, no se lanza' : 'No bloqueante'}>{c.blocking && <Lock size={15} style={{ color: 'var(--bad)' }} />}</span>
                    <div className="crit-state" role="group" aria-label={`Estado de ${c.code}`}>
                      {STATES.map((s) => (
                        <button key={s.v} type="button" data-v={s.v} aria-pressed={c.state === s.v} onClick={() => c.state !== s.v && setCriterion(c, { state: s.v })}>
                          {s.label}
                        </button>
                      ))}
                    </div>
                    <select className="select owner" style={{ height: 32 }} value={c.ownerId ?? ''} onChange={(e) => setCriterion(c, { ownerId: e.target.value || null })} aria-label="Responsable del criterio">
                      <option value="">Sin responsable</option>
                      {Object.values(members).map((m) => (
                        <option key={m.id} value={m.id}>
                          {m.name}
                        </option>
                      ))}
                    </select>
                  </div>
                ))}
              </details>
            )
          })}
        </div>
      </div>

      {editing && <StageDialog stage={editing === 'nueva' ? null : editing} projectId={project.id} onClose={() => setEditing(null)} />}
      {reviewOpen && (
        <ReviewDialog
          onClose={() => setReviewOpen(false)}
          onSave={async (notes) => {
            try {
              await api.post('/api/rubric/reviews', { reviewerId: me, notes, projectId: project.id })
              refresh(qk.rubric)
              toast('Revisión guardada con la foto de la rúbrica')
              setReviewOpen(false)
            } catch (e) {
              toast((e as Error).message, 'bad')
            }
          }}
          summary={`${criteriaCount} criterios · ${DECISION[v.decision]} · ${v.blockingOk}/${v.blockingTotal} bloqueantes · ${v.othersPct}% de los demás`}
        />
      )}
    </div>
  )
}

function RocketGauge({ fuel, ready }: { fuel: number; ready: boolean }) {
  const level = 96 - 70 * Math.max(0, Math.min(1, fuel))
  return (
    <svg viewBox="0 0 100 130" width={110} height={143} role="img" aria-label={`Combustible: ${Math.round(fuel * 100)}%`}>
      <defs>
        <linearGradient id="fuelGrad" x1="0" y1="1" x2="0" y2="0">
          <stop offset="0" stopColor="#ff6a33" />
          <stop offset=".55" stopColor="#e04b66" />
          <stop offset="1" stopColor="#8b45cc" />
        </linearGradient>
        <linearGradient id="hull" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0" stopColor="#d8d2e6" />
          <stop offset=".45" stopColor="#ffffff" />
          <stop offset="1" stopColor="#a99fc2" />
        </linearGradient>
        <clipPath id="body">
          <path d="M50 6 C66 22 70 50 66 96 L34 96 C30 50 34 22 50 6 Z" />
        </clipPath>
      </defs>
      {ready && <path d="M40 98 L50 128 L60 98 Z" fill="#ffb547" opacity=".9" />}
      <path d="M34 70 L18 98 L34 92 Z M66 70 L82 98 L66 92 Z" fill="var(--acc)" />
      <path d="M50 6 C66 22 70 50 66 96 L34 96 C30 50 34 22 50 6 Z" fill="url(#hull)" stroke="rgba(30,14,48,.5)" strokeWidth="1.5" />
      <rect x="20" y={level} width="60" height={100 - level} fill="url(#fuelGrad)" clipPath="url(#body)" opacity=".9" />
      <circle cx="50" cy="40" r="9" fill="#2a1446" stroke="#c9a6f2" strokeWidth="3" />
      <circle cx="47" cy="37" r="2.5" fill="#fff" opacity=".8" />
      <text x="50" y="84" textAnchor="middle" fontFamily="var(--font-pixel)" fontSize="11" fill="#fff">
        {Math.round(fuel * 100)}%
      </text>
    </svg>
  )
}

function StageDialog({ stage, projectId, onClose }: { stage: Stage | null; projectId: string; onClose: () => void }) {
  const refresh = useRefresh()
  const { toast } = useUI()
  const [data, setData] = useState({ name: stage?.name ?? '', start: stage?.start ?? todayISO(), end: stage?.end ?? todayISO(), exitCriteria: stage?.exitCriteria ?? '' })
  return (
    <>
      <div className="scrim" onClick={onClose} />
      <form
        className="panel modal"
        onSubmit={async (e) => {
          e.preventDefault()
          try {
            if (stage) await api.patch(`/api/stages/${stage.id}`, data)
            else await api.post('/api/stages', { ...data, projectId })
            refresh(qk.project, qk.metrics)
            toast(stage ? 'Etapa actualizada' : 'Etapa creada')
            onClose()
          } catch (err) {
            toast((err as Error).message, 'bad')
          }
        }}
      >
        <h2>{stage ? 'Editar etapa' : 'Nueva etapa'}</h2>
        <div className="stack">
          <label className="field">
            <span>Nombre</span>
            <input className="input" value={data.name} onChange={(e) => setData({ ...data, name: e.target.value })} />
          </label>
          <div className="fields">
            <label className="field">
              <span>Inicio</span>
              <input className="input" type="date" value={data.start} onChange={(e) => setData({ ...data, start: e.target.value })} />
            </label>
            <label className="field">
              <span>Fin</span>
              <input className="input" type="date" value={data.end} onChange={(e) => setData({ ...data, end: e.target.value })} />
            </label>
          </div>
          <label className="field">
            <span>Criterio de salida</span>
            <textarea className="textarea" value={data.exitCriteria} onChange={(e) => setData({ ...data, exitCriteria: e.target.value })} />
          </label>
        </div>
        <div className="modal-actions">
          <button type="button" className="btn ghost" onClick={onClose}>
            Cancelar
          </button>
          <button type="submit" className="btn primary">
            Guardar
          </button>
        </div>
      </form>
    </>
  )
}

function ReviewDialog({ onClose, onSave, summary }: { onClose: () => void; onSave: (notes: string) => Promise<void>; summary: string }) {
  const [notes, setNotes] = useState('')
  return (
    <>
      <div className="scrim" onClick={onClose} />
      <form
        className="panel modal"
        onSubmit={(e) => {
          e.preventDefault()
          void onSave(notes)
        }}
      >
        <h2>Registrar revisión</h2>
        <p className="muted" style={{ marginBottom: 12 }}>
          Se guarda una foto del estado de la rúbrica: {summary}.
        </p>
        <label className="field">
          <span>Notas y decisión del equipo</span>
          <textarea className="textarea" value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Riesgos, acuerdos y próximos pasos" />
        </label>
        <div className="modal-actions">
          <button type="button" className="btn ghost" onClick={onClose}>
            Cancelar
          </button>
          <button type="submit" className="btn primary">
            Guardar revisión
          </button>
        </div>
      </form>
    </>
  )
}
