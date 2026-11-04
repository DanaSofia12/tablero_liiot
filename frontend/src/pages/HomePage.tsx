import { useNavigate } from 'react-router-dom'
import { CalendarDays, FolderOpen, FolderPlus, Minus, Square, X } from 'lucide-react'
import { useMe, useMembers, usePresence, useProjects, useTasks } from '../api'
import { BleepyComet, BleepyStar, ProjectMark } from '../components/Brand'
import { MemberHead, Prio, PRESENCE_META, useMemberMap } from '../components/bits'
import { addDays, daysBetween, fmtDay, fmtShort, greeting, parseDay, plural, todayISO, weekdayShort } from '../lib/format'
import { useUI } from '../ui'
import type { Project, Task } from '../types'

/** Botones de ventana de computador viejo: solo adorno. */
function WinDots() {
  return (
    <span className="win-dots" aria-hidden>
      <i>
        <Minus />
      </i>
      <i>
        <Square />
      </i>
      <i>
        <X />
      </i>
    </span>
  )
}

/** Inicio de Liiot: la empresa, quién está en la oficina y los proyectos como carpetas. Al abrir una se entra a su mundo. */
export default function HomePage() {
  const me = useMe()
  const projects = useProjects().data ?? []
  const tasks = useTasks().data ?? []
  const members = useMembers().data ?? []
  const presence = usePresence().data ?? []
  const { goWorld, openNewProject } = useUI()
  const navigate = useNavigate()
  const today = todayISO()
  const mineToday = tasks.filter((t) => t.ownerId === me.id && t.status !== 'finalizada' && t.dueDate && t.dueDate <= today).length

  return (
    <div className="page home">
      <section className="home-hero">
        <div className="home-hello">
          <p className="eyebrow">{fmtDay(today)}</p>
          <h1>
            {greeting()}, {me.name}
          </h1>
          <p className="muted">
            {plural(projects.length, 'proyecto activo', 'proyectos activos')}
            {mineToday ? ` · ${plural(mineToday, 'tarea tuya vence hoy o está atrasada', 'tareas tuyas vencen hoy o están atrasadas')}` : ' · hoy no tienes nada atrasado ✨'}
          </p>
        </div>
        <button type="button" className="win home-office" onClick={() => navigate('/oficina')} aria-label="Ir a la oficina">
          <span className="win-bar">
            <span className="win-title">En la oficina</span>
            <WinDots />
          </span>
          <span className="home-people">
            {members.map((m) => {
              const p = presence.find((x) => x.memberId === m.id)
              const meta = PRESENCE_META[p?.state ?? 'disponible']
              return (
                <span key={m.id} className="home-person" style={{ ['--c' as string]: meta.color }}>
                  <MemberHead member={m} size={34} mood={p?.state === 'descansando' ? 'sleep' : undefined} />
                  <span>
                    <b>{m.name}</b>
                    <small>{meta.label}</small>
                  </span>
                </span>
              )
            })}
          </span>
        </button>
      </section>

      <section className="win files" aria-label="Proyectos">
        <header className="win-bar">
          <span className="win-title">
            <FolderOpen aria-hidden /> Mis proyectos
          </span>
          <span className="win-count">{plural(projects.length, 'carpeta', 'carpetas')}</span>
          <button type="button" className="btn sm win-action" onClick={openNewProject} title="Crea el proyecto con su carpeta en Obsidian">
            <FolderPlus size={15} aria-hidden /> Nuevo proyecto
          </button>
          <WinDots />
        </header>
        <div className="folders">
          {projects.map((p) => (
            <Folder key={p.id} project={p} today={today} onOpen={(rect) => goWorld(`/p/${encodeURIComponent(p.id)}`, p, rect)} />
          ))}
          {projects.length === 0 && (
            <button type="button" className="folder-add" onClick={openNewProject}>
              <FolderPlus size={34} aria-hidden />
              <b>Nuevo proyecto</b>
              <small>Con su carpeta en Obsidian</small>
            </button>
          )}
        </div>
      </section>

      <Upcoming tasks={tasks} projects={projects} today={today} onProject={(p) => goWorld(`/p/${encodeURIComponent(p.id)}`, p)} />
    </div>
  )
}

type UpcomingItem = { key: string; date: string; title: string; project?: Project; task?: Task; milestone?: boolean }

/** Lo que viene en las próximas tres semanas en todos los proyectos: fechas clave y entregas. */
function Upcoming({ tasks, projects, today, onProject }: { tasks: Task[]; projects: Project[]; today: string; onProject: (p: Project) => void }) {
  const { openTask } = useUI()
  const members = useMemberMap()
  const until = addDays(today, 21)
  const byId = Object.fromEntries(projects.map((p) => [p.id, p]))
  const milestones: UpcomingItem[] = projects.flatMap((p) =>
    [
      p.pilotDate ? { key: `${p.id}-clave`, date: p.pilotDate, title: p.id === 'bleepy' ? 'Piloto' : 'Fecha clave', project: p, milestone: true } : null,
      p.backupDate ? { key: `${p.id}-respaldo`, date: p.backupDate, title: 'Fecha de respaldo', project: p, milestone: true } : null,
    ].filter((x): x is NonNullable<typeof x> => x !== null),
  )
  const due: UpcomingItem[] = tasks
    .filter((t) => t.status !== 'finalizada' && t.dueDate)
    .map((t) => ({ key: `t${t.id}`, date: t.dueDate!, title: t.title, task: t, project: byId[t.projectId] }))
  const items = [...milestones, ...due]
    .filter((x) => x.date >= today && x.date <= until)
    .sort((a, b) => a.date.localeCompare(b.date) || Number(Boolean(b.milestone)) - Number(Boolean(a.milestone)))
    .slice(0, 10)
  return (
    <section className="win upcoming" aria-label="Próximas fechas">
      <header className="win-bar">
        <span className="win-title">
          <CalendarDays aria-hidden /> Próximas fechas
        </span>
        <span className="win-count">tres semanas, todos los proyectos</span>
        <WinDots />
      </header>
      {items.length === 0 ? (
        <p className="empty">Nada con fecha en las próximas tres semanas.</p>
      ) : (
        <div className="tickets">
          {items.map((x) => {
            const d = parseDay(x.date)
            const owner = x.task ? members[x.task.ownerId] : undefined
            return (
              <button
                key={x.key}
                type="button"
                className={`ticket${x.milestone ? ' milestone' : ''}${x.project?.theme === 'bleepy' ? ' bleepy' : ''}`}
                style={{ ['--pc' as string]: x.project?.color ?? 'var(--acc)' }}
                onClick={() => (x.task ? openTask(x.task.id) : x.project && onProject(x.project))}
              >
                <span className="t-date">
                  <b>{d.getDate()}</b>
                  <span>
                    {weekdayShort(x.date)}
                    <br />
                    {fmtShort(x.date).split(' ')[1]}
                  </span>
                  {x.date === today && <em>hoy</em>}
                </span>
                <span className="t-title">{x.title}</span>
                <span className="t-foot">
                  {x.project && <span className="t-project">{x.project.name}</span>}
                  {x.task && <Prio p={x.task.priority} compact />}
                  {owner && <MemberHead member={owner} size={22} />}
                </span>
              </button>
            )
          })}
        </div>
      )}
    </section>
  )
}

function Folder({ project, today, onOpen }: { project: Project; today: string; onOpen: (rect: DOMRect) => void }) {
  const counts = project.counts ?? { total: 0, open: 0, done: 0, paused: 0, overdue: 0 }
  const pct = counts.total ? Math.round((counts.done * 100) / counts.total) : 0
  const days = project.pilotDate ? daysBetween(today, project.pilotDate) : null
  const milestone = project.id === 'bleepy' ? 'el piloto' : 'la entrega'
  const bleepy = project.theme === 'bleepy'
  return (
    <button
      type="button"
      className={`folder theme-${project.theme}`}
      style={{ ['--pc' as string]: project.color }}
      onClick={(e) => onOpen((e.currentTarget as HTMLElement).getBoundingClientRect())}
      aria-label={`Entrar a ${project.name}`}
    >
      <span className="f-back" aria-hidden>
        <span className="f-tab">{project.keyPrefix}</span>
      </span>
      <span className="f-paper p2" aria-hidden />
      <span className="f-paper p1" aria-hidden>
        <i />
      </span>
      <span className="f-front">
        {bleepy && <BleepyComet className="f-sticker" />}
        <span className="sparkle s1" aria-hidden>
          {bleepy ? <BleepyStar /> : '✦'}
        </span>
        <span className="sparkle s2" aria-hidden>
          ✦
        </span>
        <span className="f-mark">
          <ProjectMark project={project} />
        </span>
        <b className="f-name">{project.name}</b>
        <small className="f-phase">{project.currentPhaseName ? `Fase · ${project.currentPhaseName}` : 'Sin fases todavía'}</small>
        <span className="f-foot">
          <span className="f-progress">
            <span className="f-bar" title={`${counts.done} de ${counts.total} tareas finalizadas`}>
              <i style={{ width: `${pct}%` }} />
            </span>
            <b>{pct}%</b>
          </span>
          <span className="f-chips">
            <span>
              <b>{counts.open}</b> abiertas
            </span>
            {counts.overdue > 0 && (
              <span className="late">
                <b>{counts.overdue}</b> atrasadas
              </span>
            )}
            {days != null && days >= 0 && (
              <span>
                <b>{days}</b> días para {milestone}
              </span>
            )}
          </span>
        </span>
      </span>
    </button>
  )
}
