import { useEffect, useState, type FormEvent } from 'react'
import { useCatalog, useCurrentProject, useProject, useTaskActions, type TaskCreate } from '../api'
import { fmtShort, todayISO } from '../lib/format'
import { useUI } from '../ui'
import { MemberHead, STATUS_META, STATUS_ORDER, useMemberMap } from './bits'

export function TaskForm() {
  const { createDraft, closeCreate, toast, openTask } = useUI()
  if (!createDraft) return null
  return <Form draft={createDraft} onClose={closeCreate} toast={toast} openTask={openTask} />
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

function Form({ draft, onClose, toast, openTask }: { draft: TaskCreate; onClose: () => void; toast: (t: string, tone?: 'ok' | 'bad') => void; openTask: (id: number) => void }) {
  const catalog = useCatalog().data
  const { projectId: currentId, projects } = useCurrentProject()
  const members = useMemberMap()
  const { create } = useTaskActions()
  const [data, setData] = useState<TaskCreate>({ type: 'gestion', priority: 'P2', effort: 'M', status: 'por_hacer', projectId: currentId, ...draft })
  const stages = useProject(data.projectId).data?.stages ?? []
  const project = projects.find((p) => p.id === data.projectId)
  const set = (patch: Partial<TaskCreate>) => setData((d) => ({ ...d, ...patch }))

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  const submit = (e: FormEvent) => {
    e.preventDefault()
    if (!data.title.trim()) return
    create.mutate(
      { ...data, title: data.title.trim() },
      {
        onSuccess: (task) => {
          toast(`Creaste ${task.key}`)
          onClose()
          openTask(task.id)
        },
      },
    )
  }

  return (
    <>
      <div className="scrim" onClick={onClose} />
      <form className="panel modal" role="dialog" aria-label="Nueva tarea" onSubmit={submit}>
        <h2>
          Nueva tarea{' '}
          <span className="muted" style={{ fontWeight: 500 }}>
            · {project?.name ?? ''}
          </span>
        </h2>
        <div className="stack">
          <label className="field">
            <span>¿Qué hay que hacer?</span>
            <input className="input" autoFocus value={data.title} onChange={(e) => set({ title: e.target.value })} placeholder="Verbo + resultado, p. ej. «Comprometer a la tercera empresa»" />
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
          <div className="field">
            <span>¿Para cuándo?</span>
            <div className="row" style={{ gap: 6, flexWrap: 'wrap' }}>
              {quickDates().map((d) => (
                <button key={d.label} type="button" className="btn sm" aria-pressed={data.dueDate === d.value} onClick={() => set({ dueDate: d.value })}>
                  {d.label}
                </button>
              ))}
              <input className="input" type="date" style={{ width: 170 }} value={data.dueDate ?? ''} onChange={(e) => set({ dueDate: e.target.value || null })} aria-label="Fecha de entrega" />
            </div>
          </div>
          <label className="field">
            <span>Detalle (opcional)</span>
            <textarea className="textarea" value={data.summary ?? ''} onChange={(e) => set({ summary: e.target.value })} placeholder="Qué se entrega y para qué" />
          </label>
          <div className="fields">
            <label className="field">
              <span>Proyecto</span>
              <select className="select" value={data.projectId} onChange={(e) => set({ projectId: e.target.value, stageId: null })}>
                {projects.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="field">
              <span>Estado</span>
              <select className="select" value={data.status} onChange={(e) => set({ status: e.target.value })}>
                {STATUS_ORDER.filter((s) => s !== 'bloqueada').map((s) => (
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
            <label className="field">
              <span>Prioridad</span>
              <select className="select" value={data.priority} onChange={(e) => set({ priority: e.target.value })}>
                {catalog?.priorities.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.id} · {p.label}
                  </option>
                ))}
              </select>
            </label>
            <label className="field">
              <span>Esfuerzo</span>
              <select className="select" value={data.effort} onChange={(e) => set({ effort: e.target.value })}>
                <option value="S">S · 1 punto</option>
                <option value="M">M · 2 puntos</option>
                <option value="L">L · 3 puntos</option>
              </select>
            </label>
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
          <button type="button" className="btn ghost" onClick={onClose}>
            Cancelar
          </button>
          <button type="submit" className="btn primary" disabled={!data.title.trim() || create.isPending}>
            Crear tarea
          </button>
        </div>
      </form>
    </>
  )
}
