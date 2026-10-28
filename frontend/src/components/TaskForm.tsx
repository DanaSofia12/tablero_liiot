import { useEffect, useState, type FormEvent } from 'react'
import { useCatalog, useProject, useTaskActions, type TaskCreate } from '../api'
import { fmtShort } from '../lib/format'
import { useUI } from '../ui'
import { MemberHead, useMemberMap } from './bits'

export function TaskForm() {
  const { createDraft, closeCreate, toast, openTask } = useUI()
  if (!createDraft) return null
  return <Form draft={createDraft} onClose={closeCreate} toast={toast} openTask={openTask} />
}

function Form({ draft, onClose, toast, openTask }: { draft: TaskCreate; onClose: () => void; toast: (t: string, tone?: 'ok' | 'bad') => void; openTask: (id: number) => void }) {
  const catalog = useCatalog().data
  const stages = useProject().data?.stages ?? []
  const members = useMemberMap()
  const { create } = useTaskActions()
  const [data, setData] = useState<TaskCreate>({ type: 'gestion', priority: 'P2', effort: 'M', ...draft })
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
        onError: (err) => toast((err as Error).message, 'bad'),
      },
    )
  }

  return (
    <>
      <div className="scrim" onClick={onClose} />
      <form className="panel modal" role="dialog" aria-label="Nueva tarea" onSubmit={submit}>
        <h2>Nueva tarea · Bleepy</h2>
        <div className="stack">
          <label className="field">
            <span>Título</span>
            <input className="input" autoFocus value={data.title} onChange={(e) => set({ title: e.target.value })} placeholder="Verbo + resultado, p. ej. «Comprometer a la tercera empresa»" />
          </label>
          <label className="field">
            <span>Resumen</span>
            <textarea className="textarea" value={data.summary ?? ''} onChange={(e) => set({ summary: e.target.value })} placeholder="Qué se entrega y para qué" />
          </label>
          <div className="field">
            <span>Responsable</span>
            <div className="people-pick">
              {Object.values(members).map((m) => (
                <button key={m.id} type="button" aria-pressed={data.ownerId === m.id} onClick={() => set({ ownerId: m.id })}>
                  <MemberHead member={m} size={24} /> {m.name}
                </button>
              ))}
            </div>
          </div>
          <div className="fields">
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
              <span>Vence</span>
              <input className="input" type="date" value={data.dueDate ?? ''} onChange={(e) => set({ dueDate: e.target.value || null })} />
            </label>
            <label className="field">
              <span>Esfuerzo</span>
              <select className="select" value={data.effort} onChange={(e) => set({ effort: e.target.value })}>
                <option value="S">S · 1 punto</option>
                <option value="M">M · 2 puntos</option>
                <option value="L">L · 3 puntos</option>
              </select>
            </label>
            <label className="field full">
              <span>Etapa (si la dejas vacía se toma de la fecha)</span>
              <select className="select" value={data.stageId ?? ''} onChange={(e) => set({ stageId: e.target.value ? Number(e.target.value) : null })}>
                <option value="">Según la fecha</option>
                {stages.map((st) => (
                  <option key={st.id} value={st.id}>
                    {st.name} ({fmtShort(st.start)} – {fmtShort(st.end)})
                  </option>
                ))}
              </select>
            </label>
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
