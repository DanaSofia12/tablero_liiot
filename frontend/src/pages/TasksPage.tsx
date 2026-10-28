import { useMemo, useState, type DragEvent } from 'react'
import { useSearchParams } from 'react-router-dom'
import { Ban, ChevronDown, CircleHelp, LayoutGrid, List, Plus } from 'lucide-react'
import { useCatalog, useCurrentProject, useProject, useProjectTasks, useTaskActions, useVault } from '../api'
import { Due, MemberHead, Prio, STATUS_META, STATUS_ORDER, TypeChip, useMemberMap } from '../components/bits'
import { byUrgency, fmtShort, todayISO } from '../lib/format'
import { usePrefs } from '../prefs'
import { useUI } from '../ui'
import type { Task, TaskStatus } from '../types'

type View = 'tablero' | 'lista'
type SortKey = 'due' | 'priority' | 'status' | 'key'

const HELP_KEY = 'hq.help.tareas'

function readHidden() {
  try {
    return localStorage.getItem(HELP_KEY) === '1'
  } catch {
    return false
  }
}

export default function TasksPage() {
  const tasks = useProjectTasks().data ?? []
  const { project, projectId } = useCurrentProject()
  const catalog = useCatalog().data
  const stages = useProject().data?.stages ?? []
  const vault = useVault().data
  const members = useMemberMap()
  const { me } = usePrefs()
  const { openTask, openCreate, toast } = useUI()
  const { update } = useTaskActions()
  const [params, setParams] = useSearchParams()
  const [view, setView] = useState<View>('tablero')
  const [owner, setOwner] = useState('todos')
  const [type, setType] = useState('todos')
  const [prio, setPrio] = useState('todas')
  const [stage, setStage] = useState('todas')
  const [phase, setPhase] = useState('todas')
  const [hideDone, setHideDone] = useState(false)
  const [sort, setSort] = useState<SortKey>('due')
  const [dragId, setDragId] = useState<number | null>(null)
  const [over, setOver] = useState<TaskStatus | null>(null)
  const [blocking, setBlocking] = useState<Task | null>(null)
  const [helpHidden, setHelpHidden] = useState(readHidden)
  const q = (params.get('q') ?? '').trim().toLowerCase()
  const today = todayISO()
  const phases = useMemo(() => [...new Set(tasks.map((t) => t.phase).filter(Boolean))].sort(), [tasks])

  const filtered = useMemo(
    () =>
      tasks.filter(
        (t) =>
          (owner === 'todos' || t.ownerId === owner) &&
          (type === 'todos' || t.type === type) &&
          (prio === 'todas' || t.priority === prio) &&
          (stage === 'todas' || String(t.stageId) === stage) &&
          (phase === 'todas' || t.phase === phase) &&
          (!hideDone || t.status !== 'hecha') &&
          (!q || `${t.key} ${t.title} ${t.summary}`.toLowerCase().includes(q)),
      ),
    [tasks, owner, type, prio, stage, phase, hideDone, q],
  )

  const move = (task: Task, status: TaskStatus) => {
    if (task.status === status) return
    if (status === 'bloqueada') {
      setBlocking(task)
      return
    }
    update.mutate(
      { id: task.id, patch: { status } },
      { onSuccess: () => toast(status === 'hecha' ? `🎉 ${task.key} quedó hecha` : `${task.key} → ${STATUS_META[status].label}`, status === 'hecha' ? 'party' : 'ok') },
    )
  }

  const onDrop = (e: DragEvent, status: TaskStatus) => {
    e.preventDefault()
    setOver(null)
    const id = Number(e.dataTransfer.getData('text/plain'))
    const task = tasks.find((t) => t.id === id)
    if (task) move(task, status)
  }

  const hideHelp = (hidden: boolean) => {
    setHelpHidden(hidden)
    try {
      localStorage.setItem(HELP_KEY, hidden ? '1' : '0')
    } catch {
      /* sin almacenamiento: la ayuda vuelve a salir la próxima vez */
    }
  }

  const sorted = [...filtered].sort((a, b) => {
    if (sort === 'priority') return a.priority.localeCompare(b.priority) || byUrgency(a, b)
    if (sort === 'status') return STATUS_ORDER.indexOf(a.status) - STATUS_ORDER.indexOf(b.status) || byUrgency(a, b)
    if (sort === 'key') return a.id - b.id
    return (a.dueDate ?? '9999').localeCompare(b.dueDate ?? '9999') || byUrgency(a, b)
  })
  const newTask = (defaults: { status?: TaskStatus } = {}) => openCreate({ ownerId: me ?? undefined, projectId, ...defaults })

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <p className="eyebrow">
            <span className="pdot" style={{ background: project?.color }} /> {project?.name ?? 'Proyecto'} · {tasks.length} tareas
          </p>
          <h1>Tareas</h1>
          <p>Cambia el estado con el selector de cada tarjeta o arrastrándola a otra columna. Ábrela para ver y editar todo lo demás.</p>
        </div>
        <span className="grow" />
        {helpHidden && (
          <button type="button" className="btn sm ghost" onClick={() => hideHelp(false)}>
            <CircleHelp size={15} /> ¿Cómo funciona?
          </button>
        )}
        <div className="seg" role="group" aria-label="Vista">
          <button type="button" aria-pressed={view === 'tablero'} onClick={() => setView('tablero')}>
            <LayoutGrid size={15} /> Tablero
          </button>
          <button type="button" aria-pressed={view === 'lista'} onClick={() => setView('lista')}>
            <List size={15} /> Lista
          </button>
        </div>
        <button type="button" className="btn primary" onClick={() => newTask()}>
          <Plus size={16} /> Nueva tarea
        </button>
      </div>

      {!helpHidden && (
        <section className="panel howto" aria-label="Cómo funcionan las tareas">
          <ol>
            <li>
              <span>
                <b>Crea</b> una tarea con «Nueva tarea» o con «Agregar tarea» al final de una columna.
              </span>
            </li>
            <li>
              <span>
                <b>Cambia su estado</b> con el selector de la tarjeta (o arrástrala). Si la pones en Bloqueada te pregunto qué falta.
              </span>
            </li>
            <li>
              <span>
                <b>Ábrela</b> con un clic para cambiar responsable, fecha o prioridad y dejar comentarios.
              </span>
            </li>
            <li>
              <span>
                <b>Se guarda sola</b>
                {vault?.connected ? ' y se copia a su nota de Obsidian; lo que cambies allá también llega aquí.' : '.'}
              </span>
            </li>
          </ol>
          <button type="button" className="btn sm" onClick={() => hideHelp(true)}>
            Entendido
          </button>
        </section>
      )}

      <div className="toolbar panel pad" style={{ padding: 12 }}>
        <div className="seg" role="group" aria-label="Persona">
          <button type="button" aria-pressed={owner === 'todos'} onClick={() => setOwner('todos')}>
            Todos
          </button>
          {Object.values(members).map((m) => (
            <button key={m.id} type="button" aria-pressed={owner === m.id} onClick={() => setOwner(m.id)}>
              <MemberHead member={m} size={20} /> {m.name}
            </button>
          ))}
        </div>
        <select className="select" style={{ width: 160 }} value={type} onChange={(e) => setType(e.target.value)} aria-label="Tipo">
          <option value="todos">Todos los tipos</option>
          {catalog?.taskTypes.map((t) => (
            <option key={t.id} value={t.id}>
              {t.label}
            </option>
          ))}
        </select>
        <select className="select" style={{ width: 150 }} value={prio} onChange={(e) => setPrio(e.target.value)} aria-label="Prioridad">
          <option value="todas">Toda prioridad</option>
          {['P0', 'P1', 'P2', 'P3'].map((p) => (
            <option key={p}>{p}</option>
          ))}
        </select>
        {stages.length > 0 && (
          <select className="select" style={{ width: 230 }} value={stage} onChange={(e) => setStage(e.target.value)} aria-label="Etapa">
            <option value="todas">Todas las etapas</option>
            {stages.map((s) => (
              <option key={s.id} value={String(s.id)}>
                {s.name}
              </option>
            ))}
          </select>
        )}
        {phases.length > 0 && (
          <select className="select" style={{ width: 170 }} value={phase} onChange={(e) => setPhase(e.target.value)} aria-label="Fase">
            <option value="todas">Todas las fases</option>
            {phases.map((p) => (
              <option key={p} value={p}>
                {p.replace(/_/g, ' ')}
              </option>
            ))}
          </select>
        )}
        <label className="row" style={{ gap: 8, fontSize: 13, fontWeight: 600 }}>
          <input type="checkbox" checked={hideDone} onChange={(e) => setHideDone(e.target.checked)} /> Ocultar hechas
        </label>
        {q && (
          <button type="button" className="btn sm" onClick={() => setParams({})}>
            Búsqueda: «{q}» ✕
          </button>
        )}
      </div>

      {tasks.length === 0 ? (
        <section className="panel empty-project">
          <h2>{project?.name ?? 'Este proyecto'} todavía no tiene tareas</h2>
          <p className="muted">Empieza por lo primero que hay que hacer. Puedes crear varias seguidas con «Agregar tarea» en el tablero.</p>
          <button type="button" className="btn primary" onClick={() => newTask()}>
            <Plus size={16} /> Crear la primera tarea
          </button>
        </section>
      ) : view === 'tablero' ? (
        <div className="board">
          {STATUS_ORDER.map((status) => {
            const meta = STATUS_META[status]
            const Icon = meta.icon
            const items = filtered.filter((t) => t.status === status).sort(byUrgency)
            return (
              <section
                key={status}
                className={`column${over === status ? ' over' : ''}`}
                data-s={status}
                onDragOver={(e) => {
                  e.preventDefault()
                  if (over !== status) setOver(status)
                }}
                onDragLeave={() => setOver((o) => (o === status ? null : o))}
                onDrop={(e) => onDrop(e, status)}
                aria-label={meta.label}
              >
                <header className="column-head" style={{ ['--sc' as string]: meta.color }}>
                  <Icon /> {meta.label}
                  <span className="count">{items.length}</span>
                </header>
                {items.map((t) => (
                  <article
                    key={t.id}
                    className={`card${dragId === t.id ? ' dragging' : ''}${t.status === 'hecha' ? ' done' : ''}`}
                    draggable
                    onDragStart={(e) => {
                      e.dataTransfer.setData('text/plain', String(t.id))
                      e.dataTransfer.effectAllowed = 'move'
                      setDragId(t.id)
                    }}
                    onDragEnd={() => {
                      setDragId(null)
                      setOver(null)
                    }}
                    onClick={() => openTask(t.id)}
                    onKeyDown={(e) => e.key === 'Enter' && openTask(t.id)}
                    tabIndex={0}
                    role="button"
                    aria-label={`${t.key} ${t.title}`}
                  >
                    <div className="top">
                      <TypeChip type={t.type} />
                      <Prio p={t.priority} />
                    </div>
                    <div className="title">{t.title}</div>
                    {t.status === 'bloqueada' && t.blockerReason && (
                      <div className="why">
                        <Ban /> {t.blockerReason}
                      </div>
                    )}
                    <div className="bottom">
                      <MemberHead member={members[t.ownerId]} size={24} />
                      {t.status !== 'hecha' && <Due task={t} today={today} />}
                      <span className="key">{t.key}</span>
                    </div>
                    <StatusPick task={t} onChange={(s) => move(t, s)} />
                  </article>
                ))}
                {status !== 'bloqueada' && <QuickAdd status={status} projectId={projectId} ownerId={owner !== 'todos' ? owner : me ?? undefined} />}
              </section>
            )
          })}
        </div>
      ) : (
        <div className="panel table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th onClick={() => setSort('key')}>Clave</th>
                <th>Tarea</th>
                <th>Responsable</th>
                <th>Tipo</th>
                <th onClick={() => setSort('priority')}>Prioridad</th>
                <th onClick={() => setSort('status')}>Estado</th>
                <th onClick={() => setSort('due')}>Vence ↓</th>
                <th>{stages.length ? 'Etapa' : 'Fase'}</th>
              </tr>
            </thead>
            <tbody>
              {sorted.map((t) => (
                <tr key={t.id} onClick={() => openTask(t.id)}>
                  <td className="key">{t.key}</td>
                  <td style={{ fontWeight: 600, maxWidth: 360 }}>{t.title}</td>
                  <td>
                    <span className="row" style={{ gap: 6 }}>
                      <MemberHead member={members[t.ownerId]} size={22} /> {members[t.ownerId]?.name}
                    </span>
                  </td>
                  <td>
                    <TypeChip type={t.type} />
                  </td>
                  <td>
                    <Prio p={t.priority} />
                  </td>
                  <td onClick={(e) => e.stopPropagation()}>
                    <StatusPick task={t} onChange={(s) => move(t, s)} compact />
                  </td>
                  <td>
                    {fmtShort(t.dueDate)} {t.status !== 'hecha' && t.dueDate && t.dueDate < today && <span className="due late">· vencida</span>}
                  </td>
                  <td className="muted">{stages.length ? stages.find((s) => s.id === t.stageId)?.name.split('·')[0] ?? '—' : t.phase.replace(/_/g, ' ') || '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {sorted.length === 0 && <p className="empty">Ninguna tarea coincide con los filtros.</p>}
        </div>
      )}
      {blocking && <BlockDialog task={blocking} onClose={() => setBlocking(null)} />}
    </div>
  )
}

/** Selector de estado visible en cada tarjeta: la forma más directa de mover una tarea. */
function StatusPick({ task, onChange, compact }: { task: Task; onChange: (s: TaskStatus) => void; compact?: boolean }) {
  const meta = STATUS_META[task.status]
  const Icon = meta.icon
  return (
    <label
      className={`status-pick${compact ? ' compact' : ''}`}
      style={{ ['--sc' as string]: meta.color }}
      onClick={(e) => e.stopPropagation()}
      onKeyDown={(e) => e.stopPropagation()}
      onDragStart={(e) => e.preventDefault()}
      title="Cambiar el estado"
    >
      <Icon aria-hidden />
      <span className="label">{meta.label}</span>
      <select value={task.status} onChange={(e) => onChange(e.target.value as TaskStatus)} aria-label={`Estado de ${task.key}`}>
        {STATUS_ORDER.map((s) => (
          <option key={s} value={s}>
            {STATUS_META[s].label}
          </option>
        ))}
      </select>
      <ChevronDown aria-hidden />
    </label>
  )
}

/** «Agregar tarea» al final de cada columna: escribe el título, Enter y listo (queda en esa columna). */
function QuickAdd({ status, projectId, ownerId }: { status: TaskStatus; projectId: string; ownerId?: string }) {
  const { create } = useTaskActions()
  const { toast } = useUI()
  const [open, setOpen] = useState(false)
  const [title, setTitle] = useState('')
  if (!open) {
    return (
      <button type="button" className="quick-add" onClick={() => setOpen(true)}>
        <Plus size={15} /> Agregar tarea
      </button>
    )
  }
  const close = () => {
    setTitle('')
    setOpen(false)
  }
  return (
    <form
      className="quick-add-form"
      onSubmit={(e) => {
        e.preventDefault()
        const clean = title.trim()
        if (!clean) return
        create.mutate({ title: clean, status, projectId, ownerId }, { onSuccess: (t) => toast(`Creaste ${t.key}: ${t.title}`) })
        setTitle('')
      }}
    >
      <input
        className="input"
        autoFocus
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        onKeyDown={(e) => e.key === 'Escape' && close()}
        onBlur={() => !title.trim() && close()}
        placeholder="Título y Enter"
        aria-label={`Nueva tarea en ${STATUS_META[status].label}`}
      />
      <div className="row" style={{ gap: 6 }}>
        <button type="submit" className="btn sm primary" disabled={!title.trim() || create.isPending}>
          Agregar
        </button>
        <button type="button" className="btn sm ghost" onMouseDown={(e) => e.preventDefault()} onClick={close}>
          Cerrar
        </button>
      </div>
    </form>
  )
}

function BlockDialog({ task, onClose }: { task: Task; onClose: () => void }) {
  const members = useMemberMap()
  const { update } = useTaskActions()
  const { toast } = useUI()
  const [reason, setReason] = useState('')
  const [who, setWho] = useState('')
  return (
    <>
      <div className="scrim" onClick={onClose} />
      <form
        className="panel modal"
        onSubmit={(e) => {
          e.preventDefault()
          if (!reason.trim()) return
          update.mutate(
            { id: task.id, patch: { status: 'bloqueada', blockerReason: reason.trim(), blockerWaitingOn: who || null } },
            { onSuccess: () => toast(`${task.key} bloqueada · aviso enviado`, 'info') },
          )
          onClose()
        }}
      >
        <h2>¿Qué bloquea {task.key}?</h2>
        <p className="muted" style={{ marginBottom: 14 }}>
          {task.title}
        </p>
        <div className="stack">
          <input className="input" autoFocus value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Qué falta para seguir" />
          <div className="people-pick">
            {Object.values(members).map((m) => (
              <button key={m.id} type="button" aria-pressed={who === m.id} onClick={() => setWho(who === m.id ? '' : m.id)}>
                <MemberHead member={m} size={22} /> {m.name}
              </button>
            ))}
            {['Alguien externo', 'Tema técnico'].map((w) => (
              <button key={w} type="button" aria-pressed={who === w} onClick={() => setWho(who === w ? '' : w)}>
                {w}
              </button>
            ))}
          </div>
        </div>
        <div className="modal-actions">
          <button type="button" className="btn ghost" onClick={onClose}>
            Cancelar
          </button>
          <button type="submit" className="btn primary" disabled={!reason.trim()}>
            Marcar como bloqueada
          </button>
        </div>
      </form>
    </>
  )
}
