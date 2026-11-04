import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { Archive, BookOpen, Bot, CirclePause, GripVertical, ListChecks, MessageCircle, NotebookPen, Plus, Send, Sparkles, Trash2, X } from 'lucide-react'
import { obsidianUrl, useCatalog, useMe, useProjectData, useProjects, useTaskActions, useTaskEvents, useTasks, useVault } from '../api'
import { fmtMoment, fmtShort } from '../lib/format'
import { useUI } from '../ui'
import type { ChecklistItem, Priority, Task, TaskPatch, TaskStatus } from '../types'
import { Check, MemberHead, PrioPicker, STATUS_META, STATUS_ORDER, useMemberMap } from './bits'
import { ProjectMark } from './Brand'

const KIND_ICON: Record<string, typeof Sparkles> = { comentario: MessageCircle, pausa: CirclePause, checkin: Bot, checklist: ListChecks, obsidian: NotebookPen }

export function TaskDrawer() {
  const { openTaskId, closeTask } = useUI()
  const task = useTasks().data?.find((t) => t.id === openTaskId)
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && closeTask()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [closeTask])
  if (openTaskId == null) return null
  return (
    <>
      <div className="scrim" onClick={closeTask} />
      <aside className="drawer" role="dialog" aria-label={task ? `Ficha de ${task.title}` : 'Ficha de tarea'}>
        {task ? <DrawerContent key={task.id} task={task} onClose={closeTask} /> : <p className="empty">Cargando…</p>}
      </aside>
    </>
  )
}

function useAutoHeight(value: string) {
  const ref = useRef<HTMLTextAreaElement>(null)
  useLayoutEffect(() => {
    const el = ref.current
    if (!el) return
    el.style.height = 'auto'
    el.style.height = `${el.scrollHeight}px`
  }, [value])
  return ref
}

function DrawerContent({ task, onClose }: { task: Task; onClose: () => void }) {
  const { update, comment, followup } = useTaskActions()
  const { toast } = useUI()
  const catalog = useCatalog().data
  const projectData = useProjectData(task.projectId).data
  const project = useProjects().data?.find((p) => p.id === task.projectId)
  const vault = useVault().data
  const noteUrl = obsidianUrl(vault?.vaultName, task.vaultPath)
  const members = useMemberMap()
  const events = useTaskEvents(task.id).data ?? []
  const me = useMe()
  const [title, setTitle] = useState(task.title)
  const [summary, setSummary] = useState(task.summary)
  const titleRef = useAutoHeight(title)
  const summaryRef = useAutoHeight(summary)
  const [note, setNote] = useState('')
  const [pauseReason, setPauseReason] = useState('')
  const [pauseWho, setPauseWho] = useState<string>('')
  const [asking, setAsking] = useState(false)
  const phases = projectData?.phases ?? []
  const stages = (projectData?.stages ?? []).filter((st) => task.phaseId == null || st.phaseId === task.phaseId)

  // Si falla, useTaskActions ya avisa y deja la tarea como estaba
  const save = (patch: TaskPatch, ok?: string) => update.mutate({ id: task.id, patch }, { onSuccess: () => ok && toast(ok) })

  const setStatus = (s: TaskStatus) => {
    if (s === 'en_pausa') {
      setAsking(true)
      return
    }
    const previous = task.status
    update.mutate(
      { id: task.id, patch: { status: s } },
      {
        onSuccess: () =>
          toast(s === 'finalizada' ? `🎉 «${task.title}» quedó finalizada` : `${STATUS_META[s].label}: «${task.title}»`, s === 'finalizada' ? 'party' : 'ok', {
            label: 'Deshacer',
            run: () => update.mutate({ id: task.id, patch: { status: previous } }),
          }),
      },
    )
  }

  return (
    <>
      <div className="drawer-head">
        {project && (
          <span className={`chip project-chip-sm theme-${project.theme}`} title="Proyecto">
            <span className="mini-mark">
              <ProjectMark project={project} />
            </span>
            {project.name}
          </span>
        )}
        <span className="grow" />
        {noteUrl && (
          <a className="btn sm" href={noteUrl} title="Abrir la nota en Obsidian">
            <BookOpen size={14} /> Obsidian
          </a>
        )}
        <button type="button" className="btn sm" onClick={() => followup.mutate(task.id, { onSuccess: (r) => toast(r.message, r.sent ? 'ok' : 'info') })} title="Preguntarle por Telegram cómo va">
          <Send size={14} /> Preguntar cómo va
        </button>
        <button type="button" className="btn icon sm" onClick={onClose} aria-label="Cerrar">
          <X size={16} />
        </button>
      </div>
      <div className="drawer-body">
        <textarea
          ref={titleRef}
          className="title-input"
          rows={1}
          value={title}
          onChange={(e) => setTitle(e.target.value.replace(/\n/g, ' '))}
          onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), e.currentTarget.blur())}
          onBlur={() => title.trim() && title !== task.title && save({ title: title.trim() }, 'Título guardado')}
          aria-label="Título"
        />
        <div className="status-bar" role="group" aria-label="Estado">
          {STATUS_ORDER.map((s) => {
            const Icon = STATUS_META[s].icon
            return (
              <button key={s} type="button" aria-pressed={task.status === s} style={{ ['--sc' as string]: STATUS_META[s].color }} onClick={() => task.status !== s && setStatus(s)}>
                <Icon aria-hidden /> {STATUS_META[s].label}
              </button>
            )
          })}
        </div>

        {(asking || task.status === 'en_pausa') && (
          <div className="pause-box">
            <h4>
              <CirclePause size={16} /> {task.status === 'en_pausa' ? 'En pausa' : '¿Por qué se pausa?'}
              {task.blockedSince && <span className="muted">desde {fmtMoment(task.blockedSince)}</span>}
            </h4>
            {task.status === 'en_pausa' && !asking ? (
              <>
                <p>
                  <b>{task.blockerReason}</b>
                  {task.blockerWaitingOn && <> · espera a {members[task.blockerWaitingOn]?.name ?? task.blockerWaitingOn}</>}
                </p>
                <div className="row">
                  <button type="button" className="btn sm primary" onClick={() => save({ status: 'en_progreso' }, 'Tarea retomada')}>
                    Retomar
                  </button>
                  <button type="button" className="btn sm" onClick={() => setAsking(true)}>
                    Cambiar el motivo
                  </button>
                </div>
              </>
            ) : (
              <>
                <input className="input" autoFocus placeholder="Por ejemplo: falta el logo de Saray" value={pauseReason} onChange={(e) => setPauseReason(e.target.value)} />
                <span className="field-label">¿Esperas a alguien? (opcional)</span>
                <div className="people-pick" role="group" aria-label="¿A quién se espera?">
                  {Object.values(members).map((m) => (
                    <button key={m.id} type="button" aria-pressed={pauseWho === m.id} onClick={() => setPauseWho(pauseWho === m.id ? '' : m.id)}>
                      <MemberHead member={m} size={22} /> {m.name}
                    </button>
                  ))}
                  <button type="button" aria-pressed={pauseWho === 'Alguien externo'} onClick={() => setPauseWho(pauseWho === 'Alguien externo' ? '' : 'Alguien externo')}>
                    Alguien de afuera
                  </button>
                </div>
                <div className="row">
                  <button
                    type="button"
                    className="btn sm primary"
                    disabled={!pauseReason.trim()}
                    onClick={() => {
                      save({ status: 'en_pausa', blockerReason: pauseReason.trim(), blockerWaitingOn: pauseWho || null }, 'Tarea en pausa: avisé por Telegram')
                      setAsking(false)
                    }}
                  >
                    Pausar
                  </button>
                  <button type="button" className="btn sm ghost" onClick={() => setAsking(false)}>
                    Cancelar
                  </button>
                </div>
              </>
            )}
          </div>
        )}

        <div className="field">
          <span>De qué se trata</span>
          <textarea
            ref={summaryRef}
            className={`textarea auto${!summary.trim() ? ' needs' : ''}`}
            rows={2}
            value={summary}
            onChange={(e) => setSummary(e.target.value)}
            onBlur={() => summary.trim() && summary !== task.summary && save({ summary: summary.trim() }, 'Descripción guardada')}
            placeholder="Cuéntale al equipo qué se entrega y para qué"
          />
          {!summary.trim() && <small className="needs-note">Esta tarea aún no tiene descripción: agrégala para que todos entiendan de qué se trata.</small>}
        </div>

        <Checklist task={task} onChange={(items) => save({ checklist: items })} />

        <div className="fields">
          <label className="field">
            <span>Responsable</span>
            <select className="select" value={task.ownerId} onChange={(e) => save({ ownerId: e.target.value }, 'Responsable actualizado')}>
              {Object.values(members).map((m) => (
                <option key={m.id} value={m.id}>
                  {m.name} · {m.role}
                </option>
              ))}
            </select>
          </label>
          <label className="field">
            <span>Tipo</span>
            <select className="select" value={task.type} onChange={(e) => save({ type: e.target.value })}>
              {catalog?.taskTypes.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.label}
                </option>
              ))}
            </select>
          </label>
          <div className="field full">
            <span>Prioridad</span>
            <PrioPicker value={task.priority} onChange={(p: Priority) => p !== task.priority && save({ priority: p }, 'Prioridad actualizada')} />
          </div>
          <label className="field">
            <span>Inicio</span>
            <input className="input" type="date" value={task.startDate ?? ''} onChange={(e) => save({ startDate: e.target.value || null })} />
          </label>
          <label className="field">
            <span>Vence {task.reschedules > 0 && `· se movió ${task.reschedules} ${task.reschedules === 1 ? 'vez' : 'veces'}`}</span>
            <input className="input" type="date" value={task.dueDate ?? ''} onChange={(e) => save({ dueDate: e.target.value || null }, 'Fecha actualizada')} />
          </label>
          {phases.length > 0 && (
            <label className="field">
              <span>Fase</span>
              <select className="select" value={task.phaseId ?? ''} onChange={(e) => save({ phaseId: e.target.value ? Number(e.target.value) : null }, 'Fase actualizada')}>
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
              <select className="select" value={task.stageId ?? ''} onChange={(e) => save({ stageId: e.target.value ? Number(e.target.value) : null }, 'Etapa actualizada')}>
                <option value="">Sin etapa</option>
                {stages.map((st) => (
                  <option key={st.id} value={st.id}>
                    {st.name} ({fmtShort(st.start)} – {fmtShort(st.end)})
                  </option>
                ))}
              </select>
            </label>
          )}
          <div className="field full">
            <span>Colaboran</span>
            <div className="people-pick">
              {Object.values(members)
                .filter((m) => m.id !== task.ownerId)
                .map((m) => {
                  const on = task.collaborators.includes(m.id)
                  return (
                    <button
                      key={m.id}
                      type="button"
                      aria-pressed={on}
                      onClick={() => save({ collaborators: on ? task.collaborators.filter((c) => c !== m.id) : [...task.collaborators, m.id] })}
                    >
                      <MemberHead member={m} size={22} /> {m.name}
                    </button>
                  )
                })}
            </div>
          </div>
        </div>

        <div className="field">
          <span>Bitácora</span>
          <form
            className="row"
            onSubmit={(e) => {
              e.preventDefault()
              if (!note.trim()) return
              comment.mutate({ id: task.id, text: note.trim() }, { onSuccess: () => setNote('') })
            }}
          >
            <input className="input" value={note} onChange={(e) => setNote(e.target.value)} placeholder={`Comentario como ${me.name ?? 'tú'}…`} />
            <button className="btn" type="submit" disabled={!note.trim()}>
              Agregar
            </button>
          </form>
          <ul className="log">
            {events.map((ev) => {
              const Icon = KIND_ICON[ev.kind] ?? Sparkles
              const who = members[ev.actor]
              return (
                <li key={ev.id}>
                  {who ? <MemberHead member={who} size={24} /> : <Icon size={18} style={{ margin: 3, color: 'var(--ink-3)' }} />}
                  <div>
                    <b>{who?.name ?? (ev.actor === 'sistema' ? 'Liiot Hub' : ev.actor)}</b> {ev.text}
                    {ev.source === 'telegram' && (
                      <span className="src">
                        <Send size={10} /> Telegram
                      </span>
                    )}
                    {ev.source === 'obsidian' && (
                      <span className="src">
                        <NotebookPen size={10} /> Obsidian
                      </span>
                    )}
                    <span className="when">{fmtMoment(ev.at)}</span>
                  </div>
                </li>
              )
            })}
          </ul>
        </div>
        <div className="row drawer-foot">
          <span className="muted">Creada desde {task.origin || 'Liiot Hub'}</span>
          <span className="grow" />
          <button type="button" className="btn sm danger" onClick={() => (save({ archived: true }, 'Tarea archivada'), onClose())}>
            <Archive size={14} /> Archivar
          </button>
        </div>
      </div>
    </>
  )
}

/** Checklist dentro de la tarea: pasos que se marcan, se editan, se reordenan y dan el avance. */
function Checklist({ task, onChange }: { task: Task; onChange: (items: ChecklistItem[]) => void }) {
  const [items, setItems] = useState<ChecklistItem[]>(task.checklist)
  const [text, setText] = useState('')
  const [drag, setDrag] = useState<number | null>(null)
  useEffect(() => setItems(task.checklist), [task.checklist])
  const done = items.filter((i) => i.done).length
  const commit = (next: ChecklistItem[]) => {
    setItems(next)
    onChange(next)
  }
  const add = () => {
    const clean = text.trim()
    if (!clean) return
    commit([...items, { id: '', text: clean, done: false }])
    setText('')
  }
  return (
    <div className="field checklist">
      <span>
        Checklist {items.length > 0 && `· ${done} de ${items.length}`}
      </span>
      {items.length > 0 && (
        <div className="cl-bar" aria-hidden>
          <i style={{ width: `${(done * 100) / items.length}%` }} />
        </div>
      )}
      <ul>
        {items.map((item, i) => (
          <li
            key={item.id || `${item.text}-${i}`}
            className={`${item.done ? 'done' : ''}${drag === i ? ' dragging' : ''}`}
            draggable
            onDragStart={() => setDrag(i)}
            onDragOver={(e) => {
              e.preventDefault()
              if (drag === null || drag === i) return
              const next = [...items]
              const [moved] = next.splice(drag, 1)
              next.splice(i, 0, moved)
              setItems(next)
              setDrag(i)
            }}
            onDragEnd={() => {
              setDrag(null)
              onChange(items)
            }}
          >
            <GripVertical className="grip" aria-hidden size={14} />
            <Check checked={item.done} onChange={(v) => commit(items.map((x, j) => (j === i ? { ...x, done: v } : x)))} label={`Marcar «${item.text}»`} size={20} />
            <input
              className="cl-text"
              defaultValue={item.text}
              onBlur={(e) => {
                const clean = e.target.value.trim()
                if (!clean) e.target.value = item.text
                else if (clean !== item.text) commit(items.map((x, j) => (j === i ? { ...x, text: clean } : x)))
              }}
              onKeyDown={(e) => e.key === 'Enter' && e.currentTarget.blur()}
              aria-label="Texto del paso"
            />
            <button type="button" className="btn icon sm ghost" onClick={() => commit(items.filter((_, j) => j !== i))} aria-label={`Quitar «${item.text}»`}>
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
              add()
            }
          }}
          placeholder={items.length ? 'Agregar otro paso' : 'Divide la tarea en pasos: escribe uno y Enter'}
        />
        <button type="button" className="btn" onClick={add} disabled={!text.trim()}>
          <Plus size={15} /> Agregar
        </button>
      </div>
    </div>
  )
}
