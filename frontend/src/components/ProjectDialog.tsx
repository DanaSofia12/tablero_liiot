import { useEffect, useState, type FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { FolderPlus } from 'lucide-react'
import { useProjectActions, useVault, type ProjectCreate } from '../api'
import { usePrefs } from '../prefs'
import { useUI } from '../ui'
import { MemberHead, useMemberMap } from './bits'

const COLORS = ['#8B45CC', '#E04B66', '#FF6A33', '#22A06B', '#2F80ED', '#E8A317', '#7C5CFF', '#0FA3A3']

/** Prefijo sugerido para las claves de tarea: «Marketing» → MAR (MAR-1, MAR-2…). */
function suggestPrefix(name: string) {
  return name
    .normalize('NFKD')
    .replace(/[^A-Za-z0-9]/g, '')
    .toUpperCase()
    .slice(0, 3)
}

export function ProjectDialog() {
  const { newProject, closeNewProject } = useUI()
  if (!newProject) return null
  return <Dialog onClose={closeNewProject} />
}

function Dialog({ onClose }: { onClose: () => void }) {
  const { me, setProject } = usePrefs()
  const members = useMemberMap()
  const vault = useVault().data
  const { create } = useProjectActions()
  const { toast } = useUI()
  const navigate = useNavigate()
  const [data, setData] = useState<ProjectCreate>({ name: '', leadId: me, color: COLORS[3], basicRubric: true })
  const [prefixTouched, setPrefixTouched] = useState(false)
  const set = (patch: Partial<ProjectCreate>) => setData((d) => ({ ...d, ...patch }))
  const prefix = prefixTouched ? data.keyPrefix ?? '' : suggestPrefix(data.name)

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  const submit = (e: FormEvent) => {
    e.preventDefault()
    if (!data.name.trim()) return
    create.mutate(
      { ...data, name: data.name.trim(), keyPrefix: prefix },
      {
        onSuccess: (p) => {
          setProject(p.id)
          onClose()
          navigate('/tareas')
          toast(vault?.connected ? `Proyecto ${p.name} creado · también en Obsidian (10_Proyectos/${p.name})` : `Proyecto ${p.name} creado`, 'party')
        },
      },
    )
  }

  return (
    <>
      <div className="scrim" onClick={onClose} />
      <form className="panel modal" role="dialog" aria-label="Nuevo proyecto" onSubmit={submit}>
        <h2>
          <FolderPlus size={20} style={{ verticalAlign: '-3px', color: 'var(--acc)' }} /> Nuevo proyecto
        </h2>
        <p className="muted" style={{ marginBottom: 14 }}>
          Tendrá su propio tablero de tareas, cronograma y rúbrica de lanzamiento.
          {vault?.connected ? ' También se crea su carpeta en Obsidian, con la plantilla de proyecto del vault.' : ''}
        </p>
        <div className="stack">
          <label className="field">
            <span>Nombre</span>
            <input className="input" autoFocus value={data.name} onChange={(e) => set({ name: e.target.value })} placeholder="p. ej. Marketing Liiot" />
          </label>
          <div className="fields">
            <label className="field">
              <span>Prefijo de las tareas</span>
              <input
                className="input"
                value={prefix}
                maxLength={5}
                onChange={(e) => {
                  setPrefixTouched(true)
                  set({ keyPrefix: e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '') })
                }}
                placeholder="MAR"
              />
              <small className="muted">Las tareas se llamarán {prefix || 'XXX'}-1, {prefix || 'XXX'}-2…</small>
            </label>
            <label className="field">
              <span>Fecha de entrega (opcional)</span>
              <input className="input" type="date" value={data.pilotDate ?? ''} onChange={(e) => set({ pilotDate: e.target.value || null })} />
            </label>
          </div>
          <label className="field">
            <span>De qué se trata</span>
            <textarea className="textarea" value={data.summary ?? ''} onChange={(e) => set({ summary: e.target.value })} placeholder="Una o dos frases: qué se quiere lograr" />
          </label>
          <div className="field">
            <span>Líder</span>
            <div className="people-pick">
              {Object.values(members).map((m) => (
                <button key={m.id} type="button" aria-pressed={data.leadId === m.id} onClick={() => set({ leadId: m.id })}>
                  <MemberHead member={m} size={24} /> {m.name}
                </button>
              ))}
            </div>
          </div>
          <div className="field">
            <span>Color</span>
            <div className="swatches" role="radiogroup" aria-label="Color del proyecto">
              {COLORS.map((c) => (
                <button key={c} type="button" role="radio" aria-checked={data.color === c} aria-label={c} style={{ background: c }} onClick={() => set({ color: c })} />
              ))}
            </div>
          </div>
          <label className="row" style={{ gap: 8, fontSize: 13.5 }}>
            <input type="checkbox" checked={Boolean(data.basicRubric)} onChange={(e) => set({ basicRubric: e.target.checked })} />
            Crear una rúbrica de lanzamiento básica (6 criterios que puedes editar)
          </label>
        </div>
        <div className="modal-actions">
          <button type="button" className="btn ghost" onClick={onClose}>
            Cancelar
          </button>
          <button type="submit" className="btn primary" disabled={!data.name.trim() || prefix.length < 2 || create.isPending}>
            Crear proyecto
          </button>
        </div>
      </form>
    </>
  )
}
