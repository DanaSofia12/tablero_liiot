import { useMemo, useState, type DragEvent } from 'react'
import { useSearchParams } from 'react-router-dom'
import { ChevronDown, CirclePause, LayoutGrid, List, Plus, X } from 'lucide-react'
import { useCatalog, useMe, useProjectData, useProjectTasks, useTaskActions } from '../api'
import { ChecklistProgress, Due, MemberHead, Prio, PRIORITY_META, STATUS_META, STATUS_ORDER, TypeChip, useMemberMap } from '../components/bits'
import { byUrgency, fmtShort, todayISO } from '../lib/format'
import { useUI } from '../ui'
import { useWorld } from '../world'
import type { Task, TaskStatus } from '../types'

type View = 'tablero' | 'lista'
const DONE_LIMIT = 8

export default function TasksPage() {
  const { projectId, project } = useWorld()
  const tasks = useProjectTasks(projectId).data ?? []
  const catalog = useCatalog().data
  const data = useProjectData(projectId).data
  const members = useMemberMap()
  const me = useMe()
  const { openTask, openCreate, toast } = useUI()
  const { update } = useTaskActions()
  const [params, setParams] = useSearchParams()
  const [view, setView] = useState<View>('tablero')
  const [owner, setOwner] = useState(() => params.get('persona') ?? 'todos')
  const [type, setType] = useState('todos')
  const [prio, setPrio] = useState('todas')
  const [phase, setPhase] = useState('todas')
  const [stage, setStage] = useState('todas')
  const [showAllDone, setShowAllDone] = useState(false)
  const [dragId, setDragId] = useState<number | null>(null)
  const [over, setOver] = useState<TaskStatus | null>(null)
  const [pausing, setPausing] = useState<Task | null>(null)
  const q = (params.get('q') ?? '').trim().toLowerCase()
  const today = todayISO()
  const phases = data?.phases ?? []
  const stages = (data?.stages ?? []).filter((st) => phase === 'todas' || String(st.phaseId) === phase)
  const phaseName = (id: number | null) => phases.find((p) => p.id === id)?.name
  const stageName = (id: number | null) => data?.stages.find((s) => s.id === id)?.name

  const filtered = useMemo(
    () =>
      tasks.filter(
        (t) =>
          (owner === 'todos' || t.ownerId === owner) &&
          (type === 'todos' || t.type === type) &&
          (prio === 'todas' || t.priority === prio) &&
          (phase === 'todas' || String(t.phaseId) === phase || (phase === 'sin' && t.phaseId == null)) &&
          (stage === 'todas' || String(t.stageId) === stage) &&
          (!q || `${t.title} ${t.summary}`.toLowerCase().includes(q)),
      ),
    [tasks, owner, type, prio, phase, stage, q],
  )
  const filtersOn = owner !== 'todos' || type !== 'todos' || prio !== 'todas' || phase !== 'todas' || stage !== 'todas' || q

  const move = (task: Task, status: TaskStatus) => {
    if (task.status === status) return
    if (status === 'en_pausa') {
      setPausing(task)
      return
    }
    const previous = task.status
    update.mutate(
      { id: task.id, patch: { status } },
      {
        onSuccess: () =>
          toast(status === 'finalizada' ? `🎉 «${task.title}» quedó finalizada` : `«${task.title}» → ${STATUS_META[status].label}`, status === 'finalizada' ? 'party' : 'ok', {
            label: 'Deshacer',
            run: () => update.mutate({ id: task.id, patch: { status: previous } }),
          }),
      },
    )
  }

  const onDrop = (e: DragEvent, status: TaskStatus) => {
    e.preventDefault()
    setOver(null)
    const task = tasks.find((t) => t.id === Number(e.dataTransfer.getData('text/plain')))
    if (task) move(task, status)
  }

  const newTask = (status?: TaskStatus) => openCreate({ ownerId: owner !== 'todos' ? owner : me.id, projectId: projectId ?? undefined, status })
  const clear = () => {
    setOwner('todos')
    setType('todos')
    setPrio('todas')
    setPhase('todas')
    setStage('todas')
    setParams({})
  }

  return (
    <div className="page tasks">
      <div className="toolbar">
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
        {phases.length > 1 && (
          <select className="select auto" value={phase} onChange={(e) => (setPhase(e.target.value), setStage('todas'))} aria-label="Fase">
            <option value="todas">Todas las fases</option>
            {phases.map((p) => (
              <option key={p.id} value={String(p.id)}>
                {p.name}
              </option>
            ))}
            <option value="sin">Sin fase</option>
          </select>
        )}
        {stages.length > 0 && (
          <select className="select auto" value={stage} onChange={(e) => setStage(e.target.value)} aria-label="Etapa">
            <option value="todas">Todas las etapas</option>
            {stages.map((s) => (
              <option key={s.id} value={String(s.id)}>
                {s.name}
              </option>
            ))}
          </select>
        )}
        <select className="select auto" value={prio} onChange={(e) => setPrio(e.target.value)} aria-label="Prioridad">
          <option value="todas">Toda prioridad</option>
          {(['P0', 'P1', 'P2', 'P3'] as const).map((p) => (
            <option key={p} value={p}>
              {PRIORITY_META[p].label}
            </option>
          ))}
        </select>
        <select className="select auto" value={type} onChange={(e) => setType(e.target.value)} aria-label="Tipo">
          <option value="todos">Todos los tipos</option>
          {catalog?.taskTypes.map((t) => (
            <option key={t.id} value={t.id}>
              {t.label}
            </option>
          ))}
        </select>
        {filtersOn && (
          <button type="button" className="btn sm ghost" onClick={clear}>
            <X size={14} /> {q ? `«${q}» · ` : ''}Quitar filtros
          </button>
        )}
        <span className="grow" />
        <div className="seg" role="group" aria-label="Vista">
          <button type="button" aria-pressed={view === 'tablero'} onClick={() => setView('tablero')}>
            <LayoutGrid size={15} /> Tablero
          </button>
          <button type="button" aria-pressed={view === 'lista'} onClick={() => setView('lista')}>
            <List size={15} /> Lista
          </button>
        </div>
      </div>

      {tasks.length === 0 ? (
        <section className="panel empty-project">
          <h2>{project?.name ?? 'Este proyecto'} todavía no tiene tareas</h2>
          <p className="muted">Empieza por lo primero que hay que hacer.</p>
          <button type="button" className="btn primary" onClick={() => newTask()}>
            <Plus size={16} /> Crear la primera tarea
          </button>
        </section>
      ) : view === 'tablero' ? (
        <div className="board">
          {STATUS_ORDER.map((status) => {
            const meta = STATUS_META[status]
            const Icon = meta.icon
            let items = filtered.filter((t) => t.status === status).sort(byUrgency)
            const hidden = status === 'finalizada' && !showAllDone ? Math.max(0, items.length - DONE_LIMIT) : 0
            if (status === 'finalizada') items = [...items].sort((a, b) => (b.completedAt ?? '').localeCompare(a.completedAt ?? '')).slice(0, showAllDone ? undefined : DONE_LIMIT)
            return (
              <section
                key={status}
                className={`column${over === status ? ' over' : ''}`}
                style={{ ['--sc' as string]: meta.color }}
                onDragOver={(e) => {
                  e.preventDefault()
                  if (over !== status) setOver(status)
                }}
                onDragLeave={() => setOver((o) => (o === status ? null : o))}
                onDrop={(e) => onDrop(e, status)}
                aria-label={meta.column}
              >
                <header className="column-head">
                  <Icon /> {meta.column}
                  <span className="count">{filtered.filter((t) => t.status === status).length}</span>
                </header>
                {items.map((t) => (
                  <TaskCard
                    key={t.id}
                    task={t}
                    dragging={dragId === t.id}
                    owner={members[t.ownerId]}
                    today={today}
                    onOpen={() => openTask(t.id)}
                    onDragStart={(e) => {
                      e.dataTransfer.setData('text/plain', String(t.id))
                      e.dataTransfer.effectAllowed = 'move'
                      setDragId(t.id)
                    }}
                    onDragEnd={() => {
                      setDragId(null)
                      setOver(null)
                    }}
                    onMove={(s) => move(t, s)}
                  />
                ))}
                {hidden > 0 && (
                  <button type="button" className="quick-add" onClick={() => setShowAllDone(true)}>
                    Ver {hidden} finalizadas más
                  </button>
                )}
                {status !== 'en_pausa' && status !== 'finalizada' && (
                  <button type="button" className="quick-add" onClick={() => newTask(status)}>
                    <Plus size={15} /> Agregar tarea
                  </button>
                )}
              </section>
            )
          })}
        </div>
      ) : (
        <div className="panel table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th>Tarea</th>
                <th>Responsable</th>
                <th>Prioridad</th>
                <th>Estado</th>
                <th>Vence</th>
                <th>{phases.length > 1 ? 'Fase y etapa' : 'Etapa'}</th>
                <th>Checklist</th>
              </tr>
            </thead>
            <tbody>
              {[...filtered].sort((a, b) => STATUS_ORDER.indexOf(a.status) - STATUS_ORDER.indexOf(b.status) || byUrgency(a, b)).map((t) => (
                <tr key={t.id} onClick={() => openTask(t.id)}>
                  <td className="t-title">
                    <b>{t.title}</b>
                    {t.summary && <span>{t.summary}</span>}
                  </td>
                  <td>
                    <span className="row" style={{ gap: 6 }}>
                      <MemberHead member={members[t.ownerId]} size={22} /> {members[t.ownerId]?.name}
                    </span>
                  </td>
                  <td>
                    <Prio p={t.priority} />
                  </td>
                  <td onClick={(e) => e.stopPropagation()}>
                    <StatusPick task={t} onChange={(s) => move(t, s)} compact />
                  </td>
                  <td>
                    {fmtShort(t.dueDate)} {t.status !== 'finalizada' && t.dueDate && t.dueDate < today && <span className="due late">· atrasada</span>}
                  </td>
                  <td className="muted">{[phases.length > 1 ? phaseName(t.phaseId) : null, stageName(t.stageId)].filter(Boolean).join(' · ') || '—'}</td>
                  <td>
                    <ChecklistProgress task={t} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {filtered.length === 0 && <p className="empty">Ninguna tarea coincide con los filtros.</p>}
        </div>
      )}
      {pausing && <PauseDialog task={pausing} onClose={() => setPausing(null)} />}
    </div>
  )
}

function TaskCard({
  task: t,
  dragging,
  owner,
  today,
  onOpen,
  onDragStart,
  onDragEnd,
  onMove,
}: {
  task: Task
  dragging: boolean
  owner: ReturnType<typeof useMemberMap>[string] | undefined
  today: string
  onOpen: () => void
  onDragStart: (e: DragEvent) => void
  onDragEnd: () => void
  onMove: (s: TaskStatus) => void
}) {
  return (
    <article
      className={`card${dragging ? ' dragging' : ''}${t.status === 'finalizada' ? ' done' : ''}`}
      style={{ ['--pc' as string]: PRIORITY_META[t.priority].color }}
      draggable
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
      onClick={onOpen}
      onKeyDown={(e) => e.key === 'Enter' && onOpen()}
      tabIndex={0}
      role="button"
      aria-label={t.title}
    >
      <div className="top">
        <Prio p={t.priority} compact />
        <TypeChip type={t.type} />
      </div>
      <div className="title">{t.title}</div>
      {t.summary && <p className="sum">{t.summary}</p>}
      {t.status === 'en_pausa' && t.blockerReason && (
        <div className="why">
          <CirclePause /> {t.blockerReason}
        </div>
      )}
      <ChecklistProgress task={t} wide />
      <div className="bottom">
        <MemberHead member={owner} size={24} />
        {t.status !== 'finalizada' && <Due task={t} today={today} />}
        <span className="grow" />
        <StatusPick task={t} onChange={onMove} mini />
      </div>
    </article>
  )
}

/** Selector de estado: en la tarjeta es un botón pequeño; en la lista, uno con texto. */
function StatusPick({ task, onChange, compact, mini }: { task: Task; onChange: (s: TaskStatus) => void; compact?: boolean; mini?: boolean }) {
  const meta = STATUS_META[task.status]
  const Icon = meta.icon
  return (
    <label
      className={`status-pick${compact ? ' compact' : ''}${mini ? ' mini' : ''}`}
      style={{ ['--sc' as string]: meta.color }}
      onClick={(e) => e.stopPropagation()}
      onKeyDown={(e) => e.stopPropagation()}
      onDragStart={(e) => e.preventDefault()}
      title="Cambiar el estado"
    >
      <Icon aria-hidden />
      {!mini && <span className="label">{meta.label}</span>}
      <select value={task.status} onChange={(e) => onChange(e.target.value as TaskStatus)} aria-label={`Estado de ${task.title}`}>
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

function PauseDialog({ task, onClose }: { task: Task; onClose: () => void }) {
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
            { id: task.id, patch: { status: 'en_pausa', blockerReason: reason.trim(), blockerWaitingOn: who || null } },
            { onSuccess: () => toast(`«${task.title}» quedó en pausa`, 'info') },
          )
          onClose()
        }}
      >
        <h2>¿Por qué pausamos esta tarea?</h2>
        <p className="muted" style={{ marginBottom: 14 }}>
          {task.title}
        </p>
        <div className="stack">
          <input className="input" autoFocus value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Por ejemplo: falta la cuenta del servidor" />
          <span className="field-label">¿Esperas a alguien? (opcional)</span>
          <div className="people-pick">
            {Object.values(members).map((m) => (
              <button key={m.id} type="button" aria-pressed={who === m.id} onClick={() => setWho(who === m.id ? '' : m.id)}>
                <MemberHead member={m} size={22} /> {m.name}
              </button>
            ))}
            <button type="button" aria-pressed={who === 'Alguien externo'} onClick={() => setWho(who === 'Alguien externo' ? '' : 'Alguien externo')}>
              Alguien de afuera
            </button>
          </div>
        </div>
        <div className="modal-actions">
          <button type="button" className="btn ghost" onClick={onClose}>
            Cancelar
          </button>
          <button type="submit" className="btn primary" disabled={!reason.trim()}>
            Pausar
          </button>
        </div>
      </form>
    </>
  )
}
