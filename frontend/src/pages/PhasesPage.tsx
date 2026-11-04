import { useEffect, useMemo, useState } from 'react'
import {
  ArrowLeft,
  ArrowRight,
  CalendarRange,
  Check as CheckIcon,
  ChevronDown,
  CircleDot,
  ClipboardCheck,
  Flag,
  ListChecks,
  Lock,
  LockOpen,
  Pencil,
  Plus,
  Rocket,
  Trash2,
} from 'lucide-react'
import { api, qk, useMe, usePhases, useProjectTasks, useRefresh, useRubric, useTaskActions } from '../api'
import { ThermalStar } from '../components/Brand'
import { Check, Due, Empty, MemberHead, Meter, StatusChip, useMemberMap } from '../components/bits'
import { daysBetween, fmtMoment, fmtShort, plural, todayISO } from '../lib/format'
import { useUI } from '../ui'
import { useWorld } from '../world'
import type { Criterion, CriterionState, Decision, Phase, StageRow, Task } from '../types'

const DECISION: Record<Decision, string> = {
  lanzar: 'Se cumple: listos para avanzar',
  lanzar_con_riesgo: 'Se puede avanzar, con algo de riesgo',
  no_lanzar: 'Todavía no se cumple',
}
const STATES: { v: CriterionState; label: string }[] = [
  { v: 'cumple', label: 'Cumple' },
  { v: 'parcial', label: 'A medias' },
  { v: 'no_cumple', label: 'No cumple' },
]
const PHASE_IDEAS = ['Validación de la idea', 'Investigación', 'Diseño', 'Desarrollo', 'Piloto', 'Pruebas del piloto', 'Lanzamiento', 'Lanzamiento definitivo']

function useAct() {
  const refresh = useRefresh()
  const { toast } = useUI()
  return async (run: () => Promise<unknown>, ok?: string) => {
    try {
      await run()
      refresh(qk.phases, qk.rubric, qk.project, qk.projects, qk.metrics, qk.tasks)
      if (ok) toast(ok)
      return true
    } catch (e) {
      toast((e as Error).message, 'bad')
      return false
    }
  }
}

export default function PhasesPage() {
  const { projectId, project } = useWorld()
  const data = usePhases(projectId).data
  const tasks = useProjectTasks(projectId).data ?? []
  const [selected, setSelected] = useState<number | null>(null)
  const [creating, setCreating] = useState(false)
  useEffect(() => {
    if (data && (selected == null || !data.phases.some((p) => p.id === selected))) setSelected(data.currentPhaseId ?? data.phases[0]?.id ?? null)
  }, [data, selected])

  if (!data) return <div className="page"><Empty>Cargando las fases…</Empty></div>
  const phase = data.phases.find((p) => p.id === selected)
  const next = phase ? data.phases.find((p) => p.order > phase.order) : undefined

  return (
    <div className="page phases">
      <nav className="journey" aria-label="Fases del proyecto">
        {data.phases.map((p, i) => (
          <button key={p.id} type="button" className={`step ${p.status}${p.id === selected ? ' selected' : ''}`} onClick={() => setSelected(p.id)}>
            <span className="dot">{p.status === 'completada' ? <CheckIcon size={14} strokeWidth={3} /> : p.status === 'en_curso' ? <CircleDot size={14} /> : i + 1}</span>
            <span className="txt">
              <b>{p.name}</b>
              <small>
                {p.status === 'en_curso' ? 'Fase actual' : p.status === 'completada' ? 'Completada' : 'Pendiente'}
                {p.start || p.end ? ` · ${p.start ? fmtShort(p.start) : '…'} – ${p.end ? fmtShort(p.end) : '…'}` : ''}
              </small>
            </span>
          </button>
        ))}
        <button type="button" className="step add" onClick={() => setCreating(true)}>
          <span className="dot">
            <Plus size={14} />
          </span>
          <span className="txt">
            <b>Nueva fase</b>
            <small>Después de {data.phases.at(-1)?.name ?? 'empezar'}</small>
          </span>
        </button>
      </nav>

      {!phase ? (
        <section className="panel empty-project">
          <Flag size={28} style={{ color: 'var(--acc)' }} />
          <h2>{project?.name ?? 'Este proyecto'} todavía no tiene fases</h2>
          <p className="muted">Una fase es un tramo grande del proyecto: validar la idea, construir, probar el piloto, lanzar… Cada una tiene sus etapas, sus tareas y lo mínimo que debe cumplirse para pasar a la siguiente.</p>
          <button type="button" className="btn primary" onClick={() => setCreating(true)}>
            <Plus size={16} /> Crear la primera fase
          </button>
        </section>
      ) : (
        <PhaseDetail key={phase.id} phase={phase} next={next} tasks={tasks.filter((t) => t.phaseId === phase.id)} isLast={!next} />
      )}
      {data.unphasedTasks > 0 && (
        <p className="muted note">
          {plural(data.unphasedTasks, 'tarea no tiene', 'tareas no tienen')} fase. Ábrelas desde Tareas para asignarles una.
        </p>
      )}
      {creating && projectId && <NewPhaseDialog projectId={projectId} after={data.phases.at(-1)?.name} onClose={() => setCreating(false)} onCreated={(id) => setSelected(id)} />}
    </div>
  )
}

function PhaseDetail({ phase, next, tasks, isLast }: { phase: Phase; next: Phase | undefined; tasks: Task[]; isLast: boolean }) {
  const act = useAct()
  const [editing, setEditing] = useState(false)
  const [stage, setStage] = useState<StageRow | 'nueva' | null>(null)
  const [advancing, setAdvancing] = useState(false)
  const today = todayISO()
  const g = phase.gate
  const pct = g.tasksTotal ? Math.round((g.tasksDone * 100) / g.tasksTotal) : 0
  const daysLeft = phase.end ? daysBetween(today, phase.end) : null
  const unstaged = tasks.filter((t) => t.stageId == null)

  return (
    <>
      <section className={`panel phase-head ${phase.status}`}>
        <ThermalStar className="thermal-star" />
        <div className="ph-main">
          <div className="ph-eyebrow">
            <p className="eyebrow">
              {phase.status === 'en_curso' ? 'Fase actual' : phase.status === 'completada' ? 'Fase completada' : 'Próxima fase'}
              {phase.start || phase.end ? ` · ${phase.start ? fmtShort(phase.start) : '…'} – ${phase.end ? fmtShort(phase.end) : '…'}` : ''}
            </p>
            <button type="button" className="btn sm ghost" onClick={() => setEditing(true)}>
              <Pencil size={14} /> Editar fase
            </button>
          </div>
          <h1>{phase.name}</h1>
          {phase.goal && <p className="goal">{phase.goal}</p>}
          {phase.status === 'completada' && phase.validatedAt && (
            <p className="muted small">
              Validada {fmtMoment(phase.validatedAt)}
              {phase.validationNote ? ` · «${phase.validationNote}»` : ''}
            </p>
          )}
        </div>
        <div className="ph-stats">
          <div>
            <b className="num-grad">
              {g.tasksDone}/{g.tasksTotal}
            </b>
            <span>tareas finalizadas</span>
            <Meter pct={pct} zone="grad" label="Avance de la fase" />
          </div>
          {g.checksTotal > 0 && (
            <div>
              <b className="num-grad">
                {g.checksDone}/{g.checksTotal}
              </b>
              <span>mínimos cumplidos</span>
            </div>
          )}
          {daysLeft != null && phase.status !== 'completada' && (
            <div>
              <b className="num-outline">{Math.abs(daysLeft)}</b>
              <span>{daysLeft >= 0 ? 'días para cerrarla' : 'días de retraso'}</span>
            </div>
          )}
        </div>
      </section>

      <div className="phase-grid">
        <section className="panel pad">
          <div className="panel-head">
            <CalendarRange size={17} className="acc" />
            <h2>Etapas y tareas</h2>
            <span className="grow" />
            <button type="button" className="btn sm" onClick={() => setStage('nueva')}>
              <Plus size={14} /> Etapa
            </button>
          </div>
          {phase.stages.length === 0 && unstaged.length === 0 && <Empty>Esta fase aún no tiene etapas ni tareas. Las etapas agrupan las tareas por semanas o entregas.</Empty>}
          <div className="stage-list">
            {phase.stages.map((st) => (
              <StageBlock key={st.id} stage={st} tasks={tasks.filter((t) => t.stageId === st.id)} onEdit={() => setStage(st)} />
            ))}
            {unstaged.length > 0 && <StageBlock stage={null} tasks={unstaged} />}
          </div>
        </section>

        <div className="stack phase-side">
          <section className={`panel pad gate ${g.ready ? 'ready' : ''}`}>
            <div className="panel-head">
              <Rocket size={17} className="acc2" />
              <h2>{isLast ? 'Para cerrar esta fase' : `Para pasar a ${next?.name}`}</h2>
            </div>
            <Minimums phase={phase} />
            <div className="gate-meters">
              <GateMeter label="Tareas de la fase" ok={g.tasksDone} total={g.tasksTotal} />
              {g.checksTotal > 0 && <GateMeter label="Mínimos" ok={g.checksDone} total={g.checksTotal} />}
              {phase.useRubric && g.rubric && g.rubric.blockingTotal > 0 && <GateMeter label="Indispensables de la rúbrica" ok={g.rubric.blockingOk} total={g.rubric.blockingTotal} />}
            </div>
            {phase.useRubric && g.rubric && (
              <a className={`rubric-pill ${g.rubric.decision}`} href="#rubrica">
                <ClipboardCheck size={16} />
                <span>
                  <b>Rúbrica: {DECISION[g.rubric.decision]}</b>
                  <small>
                    {g.rubric.blockingOk} de {g.rubric.blockingTotal} indispensables · {g.rubric.othersPct}% del resto
                  </small>
                </span>
              </a>
            )}
            <div className={`gate-state${g.ready ? ' ok' : ''}`}>
              {g.ready ? (
                <p>
                  <b>¡Todo listo!</b> {g.tasksOpen > 0 ? `Quedan ${plural(g.tasksOpen, 'tarea abierta', 'tareas abiertas')}, pero los mínimos se cumplen.` : 'Se cumplen los mínimos.'}
                </p>
              ) : (
                <ul>
                  {g.missing.map((m) => (
                    <li key={m}>{m}</li>
                  ))}
                </ul>
              )}
            </div>
            {phase.status === 'en_curso' && (
              <button type="button" className={`btn ${g.ready ? 'primary' : ''} block`} onClick={() => setAdvancing(true)}>
                {isLast ? 'Cerrar la fase' : `Validar y pasar a ${next?.name}`} <ArrowRight size={16} />
              </button>
            )}
            {phase.status !== 'en_curso' && (
              <button type="button" className="btn block" onClick={() => act(() => api.post(`/api/phases/${phase.id}/activate`), `«${phase.name}» es ahora la fase actual`)}>
                Marcar como fase actual
              </button>
            )}
          </section>
        </div>
      </div>

      <RubricSection phase={phase} />

      {editing && <EditPhaseDialog phase={phase} onClose={() => setEditing(false)} />}
      {stage && <StageDialog stage={stage === 'nueva' ? null : stage} phase={phase} onClose={() => setStage(null)} />}
      {advancing && <AdvanceDialog phase={phase} next={next} onClose={() => setAdvancing(false)} />}
    </>
  )
}

/** Una barra de lo que se necesita para pasar de fase: cuántos van de cuántos. */
function GateMeter({ label, ok, total }: { label: string; ok: number; total: number }) {
  const pct = total ? Math.round((ok * 100) / total) : 0
  return (
    <div className={`gate-meter${total && ok >= total ? ' full' : ''}`}>
      <span>
        {label}
        <b>
          {ok} de {total}
        </b>
      </span>
      <Meter pct={pct} zone={total && ok >= total ? '' : 'grad'} label={label} />
    </div>
  )
}

function StageBlock({ stage, tasks, onEdit }: { stage: StageRow | null; tasks: Task[]; onEdit?: () => void }) {
  const members = useMemberMap()
  const { openTask, toast } = useUI()
  const { update } = useTaskActions()
  const [open, setOpen] = useState(Boolean(stage?.now) || !stage)
  const done = tasks.filter((t) => t.status === 'finalizada').length
  const today = todayISO()
  return (
    <div className={`stage-block${stage?.now ? ' now' : ''}${stage?.past ? ' past' : ''}`}>
      <button type="button" className="sb-head" onClick={() => setOpen(!open)} aria-expanded={open}>
        <ChevronDown size={16} className={`chev${open ? ' open' : ''}`} />
        <span className="sb-name">
          <b>{stage ? stage.name : 'Sin etapa'}</b>
          {stage && (
            <small>
              {fmtShort(stage.start)} – {fmtShort(stage.end)}
              {stage.now ? ' · en curso' : ''}
            </small>
          )}
        </span>
        <span className="sb-count">
          {done}/{tasks.length}
        </span>
        <span className="sb-bar">
          <i style={{ width: `${tasks.length ? (done * 100) / tasks.length : 0}%` }} />
        </span>
      </button>
      {open && (
        <div className="sb-body">
          {stage?.exitCriteria && (
            <p className="sb-exit">
              <Flag size={13} /> Para cerrarla: {stage.exitCriteria}
            </p>
          )}
          {tasks.length === 0 && <p className="muted small">Sin tareas en esta etapa.</p>}
          {tasks.map((t) => (
            <div key={t.id} className={`mini-task${t.status === 'finalizada' ? ' done' : ''}`}>
              <Check
                checked={t.status === 'finalizada'}
                onChange={(v) =>
                  update.mutate({ id: t.id, patch: { status: v ? 'finalizada' : 'en_progreso' } }, { onSuccess: () => v && toast(`🎉 «${t.title}» quedó finalizada`, 'party') })
                }
                label={`Finalizar «${t.title}»`}
              />
              <button type="button" className="mt-title" onClick={() => openTask(t.id)}>
                {t.title}
              </button>
              <span className="mt-meta">
                {t.status !== 'finalizada' && t.status !== 'pendiente' && <StatusChip s={t.status} />}
                {t.status !== 'finalizada' && <Due task={t} today={today} />}
                <MemberHead member={members[t.ownerId]} size={22} />
              </span>
            </div>
          ))}
          {onEdit && (
            <button type="button" className="btn sm ghost" onClick={onEdit}>
              <Pencil size={13} /> Editar etapa
            </button>
          )}
        </div>
      )}
    </div>
  )
}

function Minimums({ phase }: { phase: Phase }) {
  const act = useAct()
  const members = useMemberMap()
  const [text, setText] = useState('')
  const add = async () => {
    const clean = text.trim()
    if (!clean) return
    if (await act(() => api.post(`/api/phases/${phase.id}/checks`, { text: clean }))) setText('')
  }
  return (
    <div className="minimums">
      <span className="field-label">Mínimos que se deben cumplir</span>
      {phase.checks.length === 0 && <p className="muted small">Aún no hay mínimos. Escribe lo indispensable para dar esta fase por terminada.</p>}
      <ul>
        {phase.checks.map((c) => (
          <li key={c.id} className={c.done ? 'done' : ''}>
            <Check checked={c.done} onChange={(v) => act(() => api.patch(`/api/checks/${c.id}`, { done: v }))} label={`Marcar «${c.text}»`} size={20} />
            <span className="grow">
              {c.text}
              {c.done && c.doneBy && (
                <small>
                  {members[c.doneBy]?.name ?? c.doneBy} · {fmtMoment(c.doneAt)}
                </small>
              )}
            </span>
            <button type="button" className="btn icon sm ghost" onClick={() => act(() => api.del(`/api/checks/${c.id}`))} aria-label={`Quitar «${c.text}»`}>
              <Trash2 size={13} />
            </button>
          </li>
        ))}
      </ul>
      <div className="row" style={{ gap: 6 }}>
        <input
          className="input"
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault()
              void add()
            }
          }}
          placeholder="Por ejemplo: 3 empresas usaron el piloto"
        />
        <button type="button" className="btn" onClick={add} disabled={!text.trim()}>
          <Plus size={15} />
        </button>
      </div>
    </div>
  )
}

function RubricSection({ phase }: { phase: Phase }) {
  const rubric = useRubric(phase.useRubric ? phase.id : null).data
  const act = useAct()
  const members = useMemberMap()
  const me = useMe()
  const [newCat, setNewCat] = useState('')
  const [reviewOpen, setReviewOpen] = useState(false)

  if (!phase.useRubric) {
    return (
      <section className="panel pad rubric-offer" id="rubrica">
        <ListChecks size={22} className="acc" />
        <div className="grow">
          <b>¿Esta fase necesita una rúbrica?</b>
          <p className="muted small">Una rúbrica es una lista de criterios que se califican (cumple, a medias, no cumple). Los indispensables deciden si se puede avanzar. Es opcional: con los mínimos suele bastar.</p>
        </div>
        <button type="button" className="btn" onClick={() => act(() => api.post(`/api/phases/${phase.id}/rubric/template`), 'Rúbrica creada con 6 criterios: ajústala a esta fase')}>
          Crear una básica
        </button>
        <button type="button" className="btn ghost" onClick={() => act(() => api.patch(`/api/phases/${phase.id}`, { useRubric: true }), 'Rúbrica vacía lista para llenar')}>
          Empezar vacía
        </button>
      </section>
    )
  }
  if (!rubric) return null
  const v = rubric.verdict
  return (
    <section className="panel pad rubric" id="rubrica">
      <div className="panel-head">
        <ClipboardCheck size={17} className="acc" />
        <h2>Rúbrica de la fase</h2>
        <span className={`decision ${v.decision}`}>{DECISION[v.decision]}</span>
        <span className="grow" />
        <button type="button" className="btn sm" onClick={() => setReviewOpen(true)}>
          Registrar revisión
        </button>
        <button
          type="button"
          className="btn sm ghost"
          onClick={() => window.confirm('¿Dejar de usar la rúbrica en esta fase? Los criterios se guardan por si vuelves a activarla.') && act(() => api.patch(`/api/phases/${phase.id}`, { useRubric: false }))}
        >
          Quitar rúbrica
        </button>
      </div>
      <div className="rubric-summary">
        <div>
          <span>Indispensables que se cumplen</span>
          <b className="tnum">
            {v.blockingOk} de {v.blockingTotal}
          </b>
          <Meter pct={v.blockingTotal ? (v.blockingOk * 100) / v.blockingTotal : 100} zone="grad" label="Indispensables" />
        </div>
        <div>
          <span>Resto de criterios</span>
          <b className="tnum">{v.othersPct}%</b>
          <Meter pct={v.othersPct} zone={v.othersPct >= v.threshold ? '' : 'amarillo'} label="Resto" />
        </div>
        <p className="muted small">
          Regla: se avanza cuando se cumplen todos los indispensables (<Lock size={11} />) y al menos el {v.threshold}% del resto.
        </p>
      </div>
      {rubric.categories.map((cat) => {
        const ok = cat.criteria.filter((c) => c.state === 'cumple').length
        const pendingLocks = cat.criteria.filter((c) => c.blocking && c.state !== 'cumple').length
        return (
          <details key={cat.id} className="rub-cat">
            <summary>
              <ChevronDown size={16} className="chev" />
              <CategoryName id={cat.id} name={cat.name} />
              {pendingLocks > 0 && (
                <span className="rub-locks" title="Indispensables que todavía no se cumplen">
                  <Lock size={11} /> {pendingLocks}
                </span>
              )}
              <span className="rub-mini" aria-hidden>
                <i style={{ width: `${cat.criteria.length ? (ok * 100) / cat.criteria.length : 0}%` }} />
              </span>
              <span className="counts">
                {ok}/{cat.criteria.length}
              </span>
            </summary>
            {cat.criteria.map((c) => (
              <CriterionRow key={c.id} c={c} members={members} />
            ))}
            <NewCriterion categoryId={cat.id} />
            <button
              type="button"
              className="btn sm ghost danger"
              onClick={() => window.confirm(`¿Borrar el grupo «${cat.name}» y sus criterios?`) && act(() => api.del(`/api/rubric/categories/${cat.id}`))}
            >
              <Trash2 size={13} /> Borrar grupo
            </button>
          </details>
        )
      })}
      <form
        className="row"
        style={{ gap: 6, marginTop: 10 }}
        onSubmit={async (e) => {
          e.preventDefault()
          if (newCat.trim() && (await act(() => api.post(`/api/phases/${phase.id}/rubric/categories`, { name: newCat.trim() })))) setNewCat('')
        }}
      >
        <input className="input" value={newCat} onChange={(e) => setNewCat(e.target.value)} placeholder="Nuevo grupo de criterios, por ejemplo «Experiencia de usuario»" />
        <button type="submit" className="btn" disabled={!newCat.trim()}>
          <Plus size={15} /> Grupo
        </button>
      </form>
      {rubric.reviews.length > 0 && (
        <div className="reviews">
          <span className="field-label">Revisiones</span>
          {rubric.reviews.map((r) => (
            <div key={r.id} className="link-row small">
              <MemberHead member={members[r.reviewerId]} size={22} />
              <div className="grow">
                <b>{DECISION[r.decision]}</b> · {r.blockingOk}/{r.blockingTotal} indispensables
                {r.notes && <div className="muted">{r.notes}</div>}
              </div>
              <span className="muted">{fmtMoment(r.at)}</span>
            </div>
          ))}
        </div>
      )}
      {reviewOpen && (
        <NoteDialog
          title="Registrar revisión"
          hint={`Se guarda una foto de la rúbrica tal como está hoy, revisada por ${me.name}.`}
          placeholder="Riesgos, acuerdos y próximos pasos"
          action="Guardar revisión"
          onClose={() => setReviewOpen(false)}
          onSave={async (notes) => (await act(() => api.post(`/api/phases/${phase.id}/rubric/reviews`, { notes }), 'Revisión guardada')) && setReviewOpen(false)}
        />
      )}
    </section>
  )
}

function CategoryName({ id, name }: { id: number; name: string }) {
  const act = useAct()
  return (
    <input
      className="cat-name"
      defaultValue={name}
      onClick={(e) => e.preventDefault()}
      onKeyDown={(e) => e.key === 'Enter' && e.currentTarget.blur()}
      onBlur={(e) => e.target.value.trim() && e.target.value.trim() !== name && act(() => api.patch(`/api/rubric/categories/${id}`, { name: e.target.value.trim() }))}
      aria-label="Nombre del grupo"
    />
  )
}

function CriterionRow({ c, members }: { c: Criterion; members: ReturnType<typeof useMemberMap> }) {
  const act = useAct()
  const patch = (body: Record<string, unknown>) => act(() => api.patch(`/api/rubric/criteria/${c.id}`, body))
  return (
    <div className={`crit ${c.state}`}>
      <button type="button" className={`lock${c.blocking ? ' on' : ''}`} onClick={() => patch({ blocking: !c.blocking })} title={c.blocking ? 'Indispensable: si no se cumple, no se avanza' : 'Marcar como indispensable'}>
        {c.blocking ? <Lock size={14} /> : <LockOpen size={14} />}
      </button>
      <div className="text">
        <input className="crit-title" defaultValue={c.title} onKeyDown={(e) => e.key === 'Enter' && e.currentTarget.blur()} onBlur={(e) => e.target.value.trim() && e.target.value.trim() !== c.title && patch({ title: e.target.value.trim() })} aria-label="Criterio" />
        <input className="crit-verify" defaultValue={c.verify} placeholder="Cómo se comprueba (opcional)" onKeyDown={(e) => e.key === 'Enter' && e.currentTarget.blur()} onBlur={(e) => e.target.value.trim() !== c.verify && patch({ verify: e.target.value.trim() })} aria-label="Cómo se comprueba" />
      </div>
      <div className="crit-state" role="group" aria-label="¿Se cumple?">
        {STATES.map((s) => (
          <button key={s.v} type="button" data-v={s.v} aria-pressed={c.state === s.v} onClick={() => patch({ state: c.state === s.v ? 'pendiente' : s.v })}>
            {s.label}
          </button>
        ))}
      </div>
      <select className="select owner" value={c.ownerId ?? ''} onChange={(e) => patch({ ownerId: e.target.value || null })} aria-label="Responsable del criterio">
        <option value="">Sin responsable</option>
        {Object.values(members).map((m) => (
          <option key={m.id} value={m.id}>
            {m.name}
          </option>
        ))}
      </select>
      <button type="button" className="btn icon sm ghost" onClick={() => window.confirm('¿Borrar este criterio?') && act(() => api.del(`/api/rubric/criteria/${c.id}`))} aria-label="Borrar criterio">
        <Trash2 size={13} />
      </button>
    </div>
  )
}

function NewCriterion({ categoryId }: { categoryId: number }) {
  const act = useAct()
  const [title, setTitle] = useState('')
  const [blocking, setBlocking] = useState(false)
  return (
    <form
      className="row new-crit"
      onSubmit={async (e) => {
        e.preventDefault()
        if (title.trim() && (await act(() => api.post('/api/rubric/criteria', { categoryId, title: title.trim(), blocking })))) {
          setTitle('')
          setBlocking(false)
        }
      }}
    >
      <button type="button" className={`lock${blocking ? ' on' : ''}`} onClick={() => setBlocking(!blocking)} title="Indispensable">
        {blocking ? <Lock size={14} /> : <LockOpen size={14} />}
      </button>
      <input className="input" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Agregar un criterio" />
      <button type="submit" className="btn sm" disabled={!title.trim()}>
        Agregar
      </button>
    </form>
  )
}

function NoteDialog({ title, hint, placeholder, action, onClose, onSave, required = false }: { title: string; hint: string; placeholder: string; action: string; onClose: () => void; onSave: (note: string) => void; required?: boolean }) {
  const [note, setNote] = useState('')
  return (
    <>
      <div className="scrim" onClick={onClose} />
      <form
        className="panel modal"
        onSubmit={(e) => {
          e.preventDefault()
          if (required && !note.trim()) return
          onSave(note.trim())
        }}
      >
        <h2>{title}</h2>
        <p className="muted" style={{ marginBottom: 12 }}>
          {hint}
        </p>
        <textarea className="textarea" autoFocus value={note} onChange={(e) => setNote(e.target.value)} placeholder={placeholder} />
        <div className="modal-actions">
          <button type="button" className="btn ghost" onClick={onClose}>
            Cancelar
          </button>
          <button type="submit" className="btn primary" disabled={required && !note.trim()}>
            {action}
          </button>
        </div>
      </form>
    </>
  )
}

function AdvanceDialog({ phase, next, onClose }: { phase: Phase; next: Phase | undefined; onClose: () => void }) {
  const act = useAct()
  const g = phase.gate
  const target = next ? `pasar a «${next.name}»` : 'cerrar la fase'
  return (
    <NoteDialog
      title={g.ready ? `¿Validamos y ${next ? `pasamos a ${next.name}` : 'cerramos la fase'}?` : `Aún falta algo para ${target}`}
      hint={g.ready ? 'Queda registrado quién validó y cuándo. El grupo de Telegram recibe el aviso.' : `Falta: ${g.missing.join('; ')}. Si el equipo decidió avanzar igual, deja una nota que lo explique.`}
      placeholder={g.ready ? 'Comentario (opcional)' : 'Por qué avanzamos sin cumplir todo'}
      action={g.ready ? 'Validar' : 'Avanzar de todos modos'}
      required={!g.ready}
      onClose={onClose}
      onSave={async (note) => (await act(() => api.post(`/api/phases/${phase.id}/advance`, { note, force: !g.ready }), next ? `¡Ahora están en ${next.name}! 🚀` : 'Fase cerrada 🏁')) && onClose()}
    />
  )
}

function NewPhaseDialog({ projectId, after, onClose, onCreated }: { projectId: string; after: string | undefined; onClose: () => void; onCreated: (id: number) => void }) {
  const act = useAct()
  const [data, setData] = useState({ name: '', goal: '', start: '', end: '', rubric: 'ninguna' as 'ninguna' | 'basica' | 'vacia' })
  const [checks, setChecks] = useState<string[]>([])
  const [check, setCheck] = useState('')
  const set = (patch: Partial<typeof data>) => setData((d) => ({ ...d, ...patch }))
  const addCheck = () => {
    if (check.trim()) {
      setChecks([...checks, check.trim()])
      setCheck('')
    }
  }
  return (
    <>
      <div className="scrim" onClick={onClose} />
      <form
        className="panel modal"
        onSubmit={async (e) => {
          e.preventDefault()
          if (!data.name.trim()) return
          let created = 0
          const ok = await act(async () => {
            const res = await api.post<Phase>(`/api/projects/${encodeURIComponent(projectId)}/phases`, {
              name: data.name.trim(),
              goal: data.goal,
              start: data.start || null,
              end: data.end || null,
              checks: check.trim() ? [...checks, check.trim()] : checks,
              useRubric: data.rubric !== 'ninguna',
              basicRubric: data.rubric === 'basica',
            })
            created = res.id
          }, `Fase «${data.name.trim()}» creada`)
          if (ok) {
            onCreated(created)
            onClose()
          }
        }}
      >
        <h2>Nueva fase{after ? ` después de ${after}` : ''}</h2>
        <div className="stack">
          <label className="field">
            <span>Nombre</span>
            <input className="input lg" autoFocus list="phase-ideas" value={data.name} onChange={(e) => set({ name: e.target.value })} placeholder="Por ejemplo, Lanzamiento definitivo" />
            <datalist id="phase-ideas">
              {PHASE_IDEAS.map((p) => (
                <option key={p} value={p} />
              ))}
            </datalist>
          </label>
          <label className="field">
            <span>¿Qué se quiere lograr?</span>
            <textarea className="textarea" rows={2} value={data.goal} onChange={(e) => set({ goal: e.target.value })} placeholder="Una frase con el objetivo de la fase" />
          </label>
          <div className="fields">
            <label className="field">
              <span>Empieza</span>
              <input className="input" type="date" value={data.start} onChange={(e) => set({ start: e.target.value })} />
            </label>
            <label className="field">
              <span>Termina</span>
              <input className="input" type="date" value={data.end} onChange={(e) => set({ end: e.target.value })} />
            </label>
          </div>
          <div className="field">
            <span>Mínimos para dar la fase por terminada</span>
            {checks.length > 0 && (
              <ul className="draft-steps">
                {checks.map((c, i) => (
                  <li key={`${c}-${i}`}>
                    <i aria-hidden />
                    {c}
                    <button type="button" className="btn icon sm ghost" onClick={() => setChecks(checks.filter((_, j) => j !== i))} aria-label={`Quitar ${c}`}>
                      <Trash2 size={13} />
                    </button>
                  </li>
                ))}
              </ul>
            )}
            <div className="row" style={{ gap: 6 }}>
              <input
                className="input"
                value={check}
                onChange={(e) => setCheck(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault()
                    addCheck()
                  }
                }}
                placeholder="Escribe uno y Enter, por ejemplo «Contratos firmados»"
              />
              <button type="button" className="btn" onClick={addCheck} disabled={!check.trim()}>
                <Plus size={15} />
              </button>
            </div>
          </div>
          <div className="field">
            <span>Rúbrica</span>
            <div className="pills">
              {(
                [
                  ['ninguna', 'Sin rúbrica (solo mínimos)'],
                  ['basica', 'Rúbrica básica de 6 criterios'],
                  ['vacia', 'Rúbrica vacía para armar'],
                ] as const
              ).map(([v, label]) => (
                <button key={v} type="button" aria-pressed={data.rubric === v} onClick={() => set({ rubric: v })}>
                  {label}
                </button>
              ))}
            </div>
          </div>
        </div>
        <div className="modal-actions">
          <button type="button" className="btn ghost" onClick={onClose}>
            Cancelar
          </button>
          <button type="submit" className="btn primary" disabled={!data.name.trim()}>
            Crear fase
          </button>
        </div>
      </form>
    </>
  )
}

function EditPhaseDialog({ phase, onClose }: { phase: Phase; onClose: () => void }) {
  const act = useAct()
  const [data, setData] = useState({ name: phase.name, goal: phase.goal, start: phase.start ?? '', end: phase.end ?? '', threshold: phase.threshold })
  const set = (patch: Partial<typeof data>) => setData((d) => ({ ...d, ...patch }))
  return (
    <>
      <div className="scrim" onClick={onClose} />
      <form
        className="panel modal"
        onSubmit={async (e) => {
          e.preventDefault()
          if (await act(() => api.patch(`/api/phases/${phase.id}`, { ...data, start: data.start || null, end: data.end || null }), 'Fase actualizada')) onClose()
        }}
      >
        <h2>Editar fase</h2>
        <div className="stack">
          <label className="field">
            <span>Nombre</span>
            <input className="input" value={data.name} onChange={(e) => set({ name: e.target.value })} />
          </label>
          <label className="field">
            <span>¿Qué se quiere lograr?</span>
            <textarea className="textarea" rows={2} value={data.goal} onChange={(e) => set({ goal: e.target.value })} />
          </label>
          <div className="fields">
            <label className="field">
              <span>Empieza</span>
              <input className="input" type="date" value={data.start} onChange={(e) => set({ start: e.target.value })} />
            </label>
            <label className="field">
              <span>Termina</span>
              <input className="input" type="date" value={data.end} onChange={(e) => set({ end: e.target.value })} />
            </label>
          </div>
          {phase.useRubric && (
            <label className="field">
              <span>De la rúbrica, qué parte del resto debe cumplirse (%)</span>
              <input className="input" type="number" min={0} max={100} value={data.threshold} onChange={(e) => set({ threshold: Number(e.target.value) })} />
            </label>
          )}
          <div className="row wrap">
            <button type="button" className="btn sm" onClick={() => act(() => api.patch(`/api/phases/${phase.id}`, { move: -1 }))}>
              <ArrowLeft size={14} /> Mover antes
            </button>
            <button type="button" className="btn sm" onClick={() => act(() => api.patch(`/api/phases/${phase.id}`, { move: 1 }))}>
              Mover después <ArrowRight size={14} />
            </button>
            <span className="grow" />
            <button
              type="button"
              className="btn sm danger"
              onClick={async () => window.confirm(`¿Borrar la fase «${phase.name}»?`) && (await act(() => api.del(`/api/phases/${phase.id}`), 'Fase borrada')) && onClose()}
            >
              <Trash2 size={14} /> Borrar fase
            </button>
          </div>
        </div>
        <div className="modal-actions">
          <button type="button" className="btn ghost" onClick={onClose}>
            Cancelar
          </button>
          <button type="submit" className="btn primary" disabled={!data.name.trim()}>
            Guardar
          </button>
        </div>
      </form>
    </>
  )
}

function StageDialog({ stage, phase, onClose }: { stage: StageRow | null; phase: Phase; onClose: () => void }) {
  const act = useAct()
  const today = todayISO()
  const [data, setData] = useState({ name: stage?.name ?? '', start: stage?.start ?? phase.start ?? today, end: stage?.end ?? phase.end ?? today, exitCriteria: stage?.exitCriteria ?? '' })
  const set = (patch: Partial<typeof data>) => setData((d) => ({ ...d, ...patch }))
  const valid = useMemo(() => data.name.trim() && data.start && data.end && data.end >= data.start, [data])
  return (
    <>
      <div className="scrim" onClick={onClose} />
      <form
        className="panel modal"
        onSubmit={async (e) => {
          e.preventDefault()
          if (!valid) return
          const ok = stage
            ? await act(() => api.patch(`/api/stages/${stage.id}`, data), 'Etapa actualizada')
            : await act(() => api.post('/api/stages', { ...data, projectId: phase.projectId, phaseId: phase.id }), 'Etapa creada')
          if (ok) onClose()
        }}
      >
        <h2>{stage ? 'Editar etapa' : `Nueva etapa en ${phase.name}`}</h2>
        <div className="stack">
          <label className="field">
            <span>Nombre</span>
            <input className="input" autoFocus value={data.name} onChange={(e) => set({ name: e.target.value })} placeholder="Por ejemplo, Semana 1 · Ajustes del piloto" />
          </label>
          <div className="fields">
            <label className="field">
              <span>Empieza</span>
              <input className="input" type="date" value={data.start} onChange={(e) => set({ start: e.target.value })} />
            </label>
            <label className="field">
              <span>Termina</span>
              <input className="input" type="date" value={data.end} onChange={(e) => set({ end: e.target.value })} />
            </label>
          </div>
          <label className="field">
            <span>Qué debe estar listo al cerrarla (opcional)</span>
            <textarea className="textarea" rows={2} value={data.exitCriteria} onChange={(e) => set({ exitCriteria: e.target.value })} />
          </label>
          {stage && (
            <button
              type="button"
              className="btn sm danger"
              style={{ justifySelf: 'start' }}
              onClick={async () => window.confirm(`¿Borrar la etapa «${stage.name}»? Sus tareas quedan sin etapa.`) && (await act(() => api.del(`/api/stages/${stage.id}`), 'Etapa borrada')) && onClose()}
            >
              <Trash2 size={14} /> Borrar etapa
            </button>
          )}
        </div>
        <div className="modal-actions">
          <button type="button" className="btn ghost" onClick={onClose}>
            Cancelar
          </button>
          <button type="submit" className="btn primary" disabled={!valid}>
            Guardar
          </button>
        </div>
      </form>
    </>
  )
}

