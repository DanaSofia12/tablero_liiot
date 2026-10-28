import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { Archive, Ban, Bot, Globe, MessageCircle, Send, Sparkles, X } from 'lucide-react'
import { useCatalog, useProject, useRubric, useTaskActions, useTaskEvents, useTasks } from '../api'
import { fmtMoment, fmtShort } from '../lib/format'
import { usePrefs } from '../prefs'
import { useUI } from '../ui'
import type { Task, TaskPatch, TaskStatus } from '../types'
import { MemberHead, STATUS_META, STATUS_ORDER, useMemberMap } from './bits'

const KIND_ICON: Record<string, typeof Sparkles> = { comentario: MessageCircle, bloqueo: Ban, checkin: Bot }

export function TaskDrawer() {
  const { openTaskId, closeTask, toast } = useUI()
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
      <aside className="drawer" role="dialog" aria-label={task ? `Ficha de ${task.key}` : 'Ficha de tarea'}>
        {task ? <DrawerContent key={task.id} task={task} onClose={closeTask} toast={toast} /> : <p className="empty">Cargando…</p>}
      </aside>
    </>
  )
}

function DrawerContent({ task, onClose, toast }: { task: Task; onClose: () => void; toast: (t: string, tone?: 'ok' | 'bad' | 'info' | 'party') => void }) {
  const { update, comment, followup } = useTaskActions()
  const catalog = useCatalog().data
  const stages = useProject().data?.stages ?? []
  const codes = (useRubric().data?.categories ?? []).flatMap((c) => c.criteria.map((x) => x.code))
  const members = useMemberMap()
  const events = useTaskEvents(task.id).data ?? []
  const { me } = usePrefs()
  const [title, setTitle] = useState(task.title)
  const titleRef = useRef<HTMLTextAreaElement>(null)
  // El título crece en líneas en vez de cortarse
  useLayoutEffect(() => {
    const el = titleRef.current
    if (!el) return
    el.style.height = 'auto'
    el.style.height = `${el.scrollHeight}px`
  }, [title])
  const [summary, setSummary] = useState(task.summary)
  const [note, setNote] = useState('')
  const [blockReason, setBlockReason] = useState('')
  const [blockWho, setBlockWho] = useState<string>('')
  const [asking, setAsking] = useState(false)

  const save = (patch: TaskPatch, ok?: string) =>
    update.mutate(
      { id: task.id, patch },
      {
        onSuccess: () => ok && toast(ok),
        onError: (e) => toast((e as Error).message, 'bad'),
      },
    )

  const setStatus = (s: TaskStatus) => {
    if (s === 'bloqueada') {
      setAsking(true)
      return
    }
    save({ status: s }, s === 'hecha' ? `🎉 ${task.key} quedó hecha` : `${task.key}: ${STATUS_META[s].label}`)
  }

  return (
    <>
      <div className="drawer-head">
        <span className="key">{task.key}</span>
        {task.legacyId && <span className="chip" title="ID en el vault">{task.legacyId}</span>}
        <span className="grow" />
        <button type="button" className="btn sm" onClick={() => followup.mutate(task.id, { onSuccess: (r) => toast(r.message, r.sent ? 'ok' : 'info') })}>
          <Send size={14} /> Pedir seguimiento
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
          {STATUS_ORDER.map((s) => (
            <button
              key={s}
              type="button"
              aria-pressed={task.status === s}
              style={{ ['--sc' as string]: STATUS_META[s].color }}
              onClick={() => task.status !== s && setStatus(s)}
            >
              {STATUS_META[s].label}
            </button>
          ))}
        </div>

        {(asking || task.status === 'bloqueada') && (
          <div className="blocker">
            <h4>
              <Ban size={16} /> {task.status === 'bloqueada' ? 'Bloqueada' : 'Reportar bloqueo'}
              {task.blockedSince && <span className="muted" style={{ fontWeight: 500, fontSize: 12 }}>desde {fmtMoment(task.blockedSince)}</span>}
            </h4>
            {task.status === 'bloqueada' && !asking ? (
              <>
                <p>
                  <b>{task.blockerReason}</b>
                  {task.blockerWaitingOn && <> · espera a {members[task.blockerWaitingOn]?.name ?? task.blockerWaitingOn}</>}
                </p>
                <div className="row">
                  <button type="button" className="btn sm primary" onClick={() => save({ status: 'en_progreso' }, 'Bloqueo resuelto')}>
                    Resolver bloqueo
                  </button>
                  <button type="button" className="btn sm" onClick={() => setAsking(true)}>
                    Editar detalle
                  </button>
                </div>
              </>
            ) : (
              <>
                <input className="input" placeholder="¿Qué falta para seguir?" value={blockReason} onChange={(e) => setBlockReason(e.target.value)} />
                <div className="people-pick" role="group" aria-label="¿A quién se espera?">
                  {Object.values(members).map((m) => (
                    <button key={m.id} type="button" aria-pressed={blockWho === m.id} onClick={() => setBlockWho(blockWho === m.id ? '' : m.id)}>
                      <MemberHead member={m} size={22} /> {m.name}
                    </button>
                  ))}
                  {['Alguien externo', 'Tema técnico'].map((w) => (
                    <button key={w} type="button" aria-pressed={blockWho === w} onClick={() => setBlockWho(blockWho === w ? '' : w)}>
                      {w}
                    </button>
                  ))}
                </div>
                <div className="row">
                  <button
                    type="button"
                    className="btn sm primary"
                    disabled={!blockReason.trim()}
                    onClick={() => {
                      save({ status: 'bloqueada', blockerReason: blockReason.trim(), blockerWaitingOn: blockWho || null }, 'Bloqueo registrado: se avisa por Telegram')
                      setAsking(false)
                    }}
                  >
                    Guardar bloqueo
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
          <span>Resumen</span>
          <textarea
            className="textarea"
            value={summary}
            onChange={(e) => setSummary(e.target.value)}
            onBlur={() => summary !== task.summary && save({ summary }, 'Resumen guardado')}
            placeholder="Qué se entrega y para qué"
          />
        </div>

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
          <label className="field">
            <span>Prioridad</span>
            <select className="select" value={task.priority} onChange={(e) => save({ priority: e.target.value as Task['priority'] })}>
              {catalog?.priorities.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.id} · {p.label}
                </option>
              ))}
            </select>
          </label>
          <label className="field">
            <span>Esfuerzo</span>
            <select className="select" value={task.effort} onChange={(e) => save({ effort: e.target.value as Task['effort'] })}>
              <option value="S">S · 1 punto</option>
              <option value="M">M · 2 puntos</option>
              <option value="L">L · 3 puntos</option>
            </select>
          </label>
          <label className="field">
            <span>Inicio</span>
            <input className="input" type="date" value={task.startDate ?? ''} onChange={(e) => save({ startDate: e.target.value || null })} />
          </label>
          <label className="field">
            <span>Vence {task.reschedules > 0 && `· movida ${task.reschedules}×`}</span>
            <input className="input" type="date" value={task.dueDate ?? ''} onChange={(e) => save({ dueDate: e.target.value || null }, 'Fecha actualizada')} />
          </label>
          <label className="field full">
            <span>Etapa</span>
            <select className="select" value={task.stageId ?? ''} onChange={(e) => save({ stageId: e.target.value ? Number(e.target.value) : null })}>
              <option value="">Sin etapa</option>
              {stages.map((st) => (
                <option key={st.id} value={st.id}>
                  {st.name} ({fmtShort(st.start)} – {fmtShort(st.end)})
                </option>
              ))}
            </select>
          </label>
          <div className="field full">
            <span>Colaboradores</span>
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
          <div className="field full">
            <span>Criterios de la rúbrica que alimenta</span>
            <div className="people-pick">
              {codes.map((code) => {
                const on = task.rubric.includes(code)
                return (
                  <button
                    key={code}
                    type="button"
                    aria-pressed={on}
                    style={{ padding: '3px 9px' }}
                    onClick={() => save({ rubric: on ? task.rubric.filter((c) => c !== code) : [...task.rubric, code] })}
                  >
                    {code}
                  </button>
                )
              })}
            </div>
          </div>
          <label className="field full">
            <span>Avance · {task.progress} %</span>
            <input
              type="range"
              min={0}
              max={100}
              step={10}
              defaultValue={task.progress}
              onMouseUp={(e) => save({ progress: Number((e.target as HTMLInputElement).value) })}
              onKeyUp={(e) => save({ progress: Number((e.target as HTMLInputElement).value) })}
            />
          </label>
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
            <input className="input" value={note} onChange={(e) => setNote(e.target.value)} placeholder={`Comentario como ${members[me ?? '']?.name ?? 'tú'}…`} />
            <button className="btn" type="submit">
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
                    <b>{who?.name ?? (ev.actor === 'sistema' ? 'HQ' : ev.actor)}</b> {ev.text}
                    {ev.source === 'telegram' && (
                      <span className="src">
                        <Send size={10} /> Telegram
                      </span>
                    )}
                    {ev.source === 'vault' && (
                      <span className="src">
                        <Globe size={10} /> vault
                      </span>
                    )}
                    <span className="when">{fmtMoment(ev.at)}</span>
                  </div>
                </li>
              )
            })}
          </ul>
        </div>
        <div className="row">
          <span className="muted" style={{ fontSize: 12 }}>
            Origen: {task.origin || 'HQ'}
          </span>
          <span className="grow" />
          <button type="button" className="btn sm danger" onClick={() => (save({ archived: true }, `${task.key} archivada`), onClose())}>
            <Archive size={14} /> Archivar
          </button>
        </div>
      </div>
    </>
  )
}
