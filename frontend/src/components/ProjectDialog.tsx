import { useEffect, useState, type FormEvent } from 'react'
import { FolderPlus } from 'lucide-react'
import { useMe, useProjectActions, useVault, type ProjectCreate } from '../api'
import { useUI } from '../ui'
import { BleepyMark, Isotipo } from './Brand'
import { MemberHead, useMemberMap } from './bits'

const COLORS = ['#8B45CC', '#E04B66', '#FF6A33', '#22A06B', '#2F80ED', '#E8A317', '#7C5CFF', '#0FA3A3']
const FIRST_PHASES = ['Validación de la idea', 'Investigación', 'Diseño', 'Desarrollo', 'Piloto']

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
  const me = useMe()
  const members = useMemberMap()
  const vault = useVault().data
  const { create } = useProjectActions()
  const { toast, goWorld } = useUI()
  const [data, setData] = useState<ProjectCreate>({ name: '', leadId: me.id, color: COLORS[3], theme: 'liiot', firstPhase: FIRST_PHASES[0] })
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
          onClose()
          toast(vault?.connected ? `Proyecto ${p.name} creado · también en Obsidian (10_Proyectos/${p.name})` : `Proyecto ${p.name} creado`, 'party')
          goWorld(`/p/${encodeURIComponent(p.id)}/tareas`, p)
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
        <div className="stack">
          <label className="field">
            <span>Nombre</span>
            <input className="input lg" autoFocus value={data.name} onChange={(e) => set({ name: e.target.value })} placeholder="Por ejemplo, Marketing Liiot" />
          </label>
          <label className="field">
            <span>De qué se trata</span>
            <textarea className="textarea" rows={2} value={data.summary ?? ''} onChange={(e) => set({ summary: e.target.value })} placeholder="Una o dos frases: qué se quiere lograr" />
          </label>
          <div className="fields">
            <label className="field">
              <span>Primera fase</span>
              <input className="input" list="first-phases" value={data.firstPhase ?? ''} onChange={(e) => set({ firstPhase: e.target.value })} />
              <datalist id="first-phases">
                {FIRST_PHASES.map((f) => (
                  <option key={f} value={f} />
                ))}
              </datalist>
            </label>
            <label className="field">
              <span>Fecha clave (opcional)</span>
              <input className="input" type="date" value={data.pilotDate ?? ''} onChange={(e) => set({ pilotDate: e.target.value || null })} />
            </label>
          </div>
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
          <div className="fields">
            <div className="field">
              <span>Estilo</span>
              <div className="style-pick" role="radiogroup" aria-label="Estilo del proyecto">
                <button type="button" role="radio" aria-checked={data.theme === 'liiot'} onClick={() => set({ theme: 'liiot' })}>
                  <Isotipo className="sp-logo liiot" /> Liiot
                </button>
                <button type="button" role="radio" aria-checked={data.theme === 'bleepy'} onClick={() => set({ theme: 'bleepy' })}>
                  <BleepyMark className="sp-logo bleepy" /> Bleepy
                </button>
              </div>
            </div>
            <div className="field">
              <span>Color de la carpeta</span>
              <div className="swatches" role="radiogroup" aria-label="Color del proyecto">
                {COLORS.map((c) => (
                  <button key={c} type="button" role="radio" aria-checked={data.color === c} aria-label={c} style={{ background: c }} onClick={() => set({ color: c })} />
                ))}
              </div>
            </div>
          </div>
          <label className="field">
            <span>Prefijo interno de las tareas</span>
            <input
              className="input"
              style={{ maxWidth: 140 }}
              value={prefix}
              maxLength={5}
              onChange={(e) => {
                setPrefixTouched(true)
                set({ keyPrefix: e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '') })
              }}
              placeholder="MAR"
            />
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
