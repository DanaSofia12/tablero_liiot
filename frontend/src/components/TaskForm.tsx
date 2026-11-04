import { useEffect, useMemo, useState, type FormEvent } from 'react'
import { Plus, X } from 'lucide-react'
import { useCatalog, useProjectData, useProjects, useTaskActions, type TaskCreate } from '../api'
import { fmtShort, todayISO } from '../lib/format'
import { useUI } from '../ui'
import type { Priority } from '../types'
import { MemberHead, PrioPicker, STATUS_META, STATUS_ORDER, useMemberMap } from './bits'

export function TaskForm() {
  const { createDraft, closeCreate } = useUI()
  if (!createDraft) return null
  return <Form draft={createDraft} onClose={closeCreate} />
}

/** Atajos de fecha: hoy, mañana, el viernes y en una semana. */
function quickDates(): { label: string; value: string }[] {
  const base = new Date(`${todayISO()}T12:00:00`)
  const iso = (d: Date) => d.toISOString().slice(0, 10)
  const plus = (n: number) => {
    const d = new Date(base)
    d.setDate(d.getDate() + n)
    return d
  }
  const toFriday = (5 - base.getDay() + 7) % 7 || 7
  return [
    { label: 'Hoy', value: iso(base) },
    { label: 'Mañana', value: iso(plus(1)) },
    { label: 'El viernes', value: iso(plus(toFriday)) },
    { label: 'En una semana', value: iso(plus(7)) },
  ]
}

function Form({ draft, onClose }: { draft: TaskCreate; onClose: () => void }) {
  const catalog = useCatalog().data
  const projects = useProjects().data ?? []
  const members = useMemberMap()
  const { create } = useTaskActions()
  const { toast, openTask } = useUI()
  const [data, setData] = useState<TaskCreate>({ type: 'gestion', priority: 'P2', status: 'pendiente', ...draft, projectId: draft.projectId ?? projects[0]?.id })
  const [step, setStep] = useState('')
  const project = useProjectData(data.projectId).data
  const phases = project?.phases ?? []
  const phaseId = data.phaseId === undefined ? project?.project.currentPhaseId ?? null : data.phaseId
  const stages = useMemo(() => (project?.stages ?? []).filter((st) => phaseId == null || st.phaseId === phaseId), [project, phaseId])
  const set = (patch: Partial<TaskCreate>) => setData((d) => ({ ...d, ...patch }))
  const checklist = data.checklist ?? []
  const ready = Boolean(data.title.trim() && data.summary?.trim() && data.projectId)

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])
  useEffect(() => {
    if (!data.projectId && projects[0]) set({ projectId: projects[0].id })
  }, [projects.length]) // eslint-disable-line react-hooks/exhaustive-deps

  const addStep = () => {
    const clean = step.trim()
    if (!clean) return
    set({ checklist: [...checklist, clean] })
    setStep('')
  }

  const submit = (e: FormEvent) => {
    e.preventDefault()
    if (!ready) return
    create.mutate(
      { ...data, title: data.title.trim(), summary: data.summary?.trim(), phaseId, checklist: step.trim() ? [...checklist, step.trim()] : checklist },
      {
        onSuccess: (task) => {
          toast(`Creaste «${task.title}»`)
          onClose()
          openTask(task.id)
        },
      },
    )
  }

  return (
    <>
      <div className="scrim" onClick={onClose} />
      <form className="panel modal task-form" role="dialog" aria-label="Nueva tarea" onSubmit={submit}>
        <div className="modal-title">
          <h2>Nueva tarea</h2>
          <select className="select inline" value={data.projectId} onChange={(e) => set({ projectId: e.target.value, phaseId: undefined, stageId: null })} aria-label="Proyecto">
            {projects.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
          <span className="grow" />
          <button type="button" className="btn icon sm ghost" onClick={onClose} aria-label="Cerrar">
            <X size={16} />
          </button>
        </div>
        <div className="stack">
          <label className="field">
            <span>¿Qué hay que hacer?</span>
            <input className="input lg" autoFocus value={data.title} onChange={(e) => set({ title: e.target.value })} placeholder="Verbo + resultado, por ejemplo «Comprometer a la tercera empresa»" />
          </label>
          <label className="field">
            <span>¿De qué se trata?</span>
            <textarea
              className="textarea"
              value={data.summary ?? ''}
              onChange={(e) => set({ summary: e.target.value })}
              placeholder="Cuéntale al equipo qué se entrega, para qué sirve y cualquier detalle que ayude"
              rows={3}
            />
          </label>
          <div className="field">
            <span>¿Quién la hace?</span>
            <div className="people-pick">
              {Object.values(members).map((m) => (
                <button key={m.id} type="button" aria-pressed={data.ownerId === m.id} onClick={() => set({ ownerId: m.id })}>
                  <MemberHead member={m} size={24} /> {m.name}
                </button>
              ))}
            </div>
          </div>
          <div className="fields">
            <div className="field">
              <span>¿Para cuándo?</span>
              <div className="row wrap" style={{ gap: 6 }}>
                {quickDates().map((d) => (
                  <button key={d.label} type="button" className="btn sm" aria-pressed={data.dueDate === d.value} onClick={() => set({ dueDate: d.value })}>
                    {d.label}
                  </button>
                ))}
                <input className="input" type="date" style={{ width: 160 }} value={data.dueDate ?? ''} onChange={(e) => set({ dueDate: e.target.value || null })} aria-label="Fecha de entrega" />
              </div>
            </div>
            <div className="field">
              <span>Prioridad</span>
              <PrioPicker value={(data.priority as Priority) ?? 'P2'} onChange={(p) => set({ priority: p })} />
            </div>
          </div>
          <div className="field">
            <span>Checklist (pasos, opcional)</span>
            {checklist.length > 0 && (
              <ul className="draft-steps">
                {checklist.map((s, i) => (
                  <li key={`${s}-${i}`}>
                    <i aria-hidden />
                    {s}
                    <button type="button" className="btn icon sm ghost" onClick={() => set({ checklist: checklist.filter((_, j) => j !== i) })} aria-label={`Quitar ${s}`}>
                      <X size={13} />
                    </button>
                  </li>
                ))}
              </ul>
            )}
            <div className="row" style={{ gap: 6 }}>
              <input
                className="input"
                value={step}
                onChange={(e) => setStep(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault()
                    addStep()
                  }
                }}
                placeholder="Escribe un paso y Enter"
              />
              <button type="button" className="btn" onClick={addStep} disabled={!step.trim()}>
                <Plus size={15} /> Paso
              </button>
            </div>
          </div>
          <div className="fields three">
            <label className="field">
              <span>Estado</span>
              <select className="select" value={data.status} onChange={(e) => set({ status: e.target.value })}>
                {STATUS_ORDER.filter((s) => s !== 'en_pausa').map((s) => (
                  <option key={s} value={s}>
                    {STATUS_META[s].label}
                  </option>
                ))}
              </select>
            </label>
            <label className="field">
              <span>Tipo</span>
              <select className="select" value={data.type} onChange={(e) => set({ type: e.target.value })}>
                {catalog?.taskTypes.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.label}
                  </option>
                ))}
              </select>
            </label>
            {phases.length > 0 && (
              <label className="field">
                <span>Fase</span>
                <select className="select" value={phaseId ?? ''} onChange={(e) => set({ phaseId: e.target.value ? Number(e.target.value) : null, stageId: null })}>
                  <option value="">Sin fase</option>
                  {phases.map((ph) => (
                    <option key={ph.id} value={ph.id}>
                      {ph.name}
                    </option>
                  ))}
                </select>
              </label>
            )}
            {stages.length > 0 && (
              <label className="field">
                <span>Etapa</span>
                <select className="select" value={data.stageId ?? ''} onChange={(e) => set({ stageId: e.target.value ? Number(e.target.value) : null })}>
                  <option value="">Según la fecha</option>
                  {stages.map((st) => (
                    <option key={st.id} value={st.id}>
                      {st.name} ({fmtShort(st.start)} – {fmtShort(st.end)})
                    </option>
                  ))}
                </select>
              </label>
            )}
          </div>
        </div>
        <div className="modal-actions">
          {!ready && <span className="muted hint-inline">Falta {!data.title.trim() ? 'el título' : 'contar de qué se trata'}</span>}
          <button type="button" className="btn ghost" onClick={onClose}>
            Cancelar
          </button>
          <button type="submit" className="btn primary" disabled={!ready || create.isPending}>
            Crear tarea
          </button>
        </div>
      </form>
    </>
  )
}
