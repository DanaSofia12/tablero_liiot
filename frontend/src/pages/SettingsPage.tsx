import { useEffect, useState } from 'react'
import { BookOpen, Download, Palette, RefreshCw, UserRound } from 'lucide-react'
import { api, qk, useRefresh, useVault } from '../api'
import { fmtMoment } from '../lib/format'
import type { VaultStatus } from '../types'
import { Avatar } from '../components/Avatar'
import { MemberHead, Panel, Toggle, useMemberMap } from '../components/bits'
import { usePrefs, type Mode, type Universe } from '../prefs'
import { useUI } from '../ui'
import type { AvatarCfg, HairStyle, Member, OuterStyle } from '../types'

const HAIR: { v: HairStyle; label: string }[] = [
  { v: 'wolf', label: 'Largo en capas' },
  { v: 'bowl', label: 'Liso con flequillo' },
  { v: 'wavy', label: 'Corto ondulado' },
  { v: 'long', label: 'Largo liso' },
  { v: 'short', label: 'Corto' },
  { v: 'bun', label: 'Moño' },
]
const OUTER: { v: OuterStyle; label: string }[] = [
  { v: 'none', label: 'Sin chaqueta' },
  { v: 'denim', label: 'Chaqueta de jean' },
  { v: 'overshirt', label: 'Sobrecamisa' },
  { v: 'hoodie', label: 'Buzo' },
]
const HAIR_COLORS = ['#16121C', '#2B1E18', '#4A2E1E', '#7A4A2B', '#C98A5B', '#E8C27A', '#8B45CC', '#FF6A33']
const SKINS = ['#F7D9C6', '#F0C9AD', '#E8BD9C', '#D9A27E', '#B57A55', '#8A5638', '#5E3A26']
const CLOTHES = ['#F4F1F6', '#1D1A22', '#5E5B3D', '#7F97B5', '#8B45CC', '#FF6A33', '#E04B66', '#E2B31C', '#34D399', '#60A5FA']

export default function SettingsPage() {
  const { me, setMe, mode, setMode, uni, setUni, pixel, setPixel, ignoreHours, setIgnoreHours, calm, setCalm } = usePrefs()
  const members = useMemberMap()
  const [editing, setEditing] = useState<string>(me ?? 'dana')
  const person = members[editing]

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <p className="eyebrow">Personalización</p>
          <h1>Ajustes</h1>
          <p>Tu avatar, cómo se ve HQ y quién eres en este navegador.</p>
        </div>
      </div>
      <div className="settings-grid">
        <Panel title="Avatares" icon={<UserRound size={18} style={{ color: 'var(--acc)' }} />}>
          <div className="seg" style={{ marginBottom: 14 }} role="group" aria-label="Persona">
            {Object.values(members).map((m) => (
              <button key={m.id} type="button" aria-pressed={editing === m.id} onClick={() => setEditing(m.id)}>
                <MemberHead member={m} size={22} /> {m.name}
              </button>
            ))}
          </div>
          {person && <AvatarEditor key={person.id} member={person} />}
        </Panel>

        <div className="stack" style={{ gap: 16 }}>
          <ObsidianPanel />
          <Panel title="Apariencia" icon={<Palette size={18} style={{ color: 'var(--acc-2)' }} />}>
            <div className="setting">
              <div className="txt">
                <b>Modo</b>
                <span>Automático: oscuro de 6 p. m. a 6 a. m.</span>
              </div>
              <div className="seg">
                {(
                  [
                    ['dark', 'Oscuro'],
                    ['light', 'Claro'],
                    ['auto', 'Automático'],
                  ] as [Mode, string][]
                ).map(([v, label]) => (
                  <button key={v} type="button" aria-pressed={mode === v} onClick={() => setMode(v)}>
                    {label}
                  </button>
                ))}
              </div>
            </div>
            <div className="setting">
              <div className="txt">
                <b>Universo</b>
                <span>Bleepy usa un tema provisional «planeta creativo» hasta la identidad de Saray.</span>
              </div>
              <div className="seg">
                {(
                  [
                    ['liiot', 'Liiot HQ'],
                    ['bleepy', 'Bleepy'],
                  ] as [Universe, string][]
                ).map(([v, label]) => (
                  <button key={v} type="button" aria-pressed={uni === v} onClick={() => setUni(v)}>
                    {label}
                  </button>
                ))}
              </div>
            </div>
            <div className="setting">
              <div className="txt">
                <b>Modo pixel en la oficina</b>
                <span>Pixela la escena 3D, como un videojuego retro.</span>
              </div>
              <Toggle checked={pixel} onChange={setPixel} label="Modo pixel" />
            </div>
            <div className="setting">
              <div className="txt">
                <b>Ver estados aunque sea fuera de horario</b>
                <span>Si lo apagas, fuera del horario de cada persona su avatar duerme en el sofá.</span>
              </div>
              <Toggle checked={ignoreHours} onChange={setIgnoreHours} label="Ignorar horario" />
            </div>
            <div className="setting">
              <div className="txt">
                <b>Menos movimiento</b>
                <span>Quieta el fondo y el grano.</span>
              </div>
              <Toggle checked={calm} onChange={setCalm} label="Menos movimiento" />
            </div>
          </Panel>

          <Panel title="¿Quién usa este navegador?">
            <div className="people-pick">
              {Object.values(members).map((m) => (
                <button key={m.id} type="button" aria-pressed={me === m.id} onClick={() => setMe(m.id)}>
                  <MemberHead member={m} size={26} /> {m.name} · {m.role}
                </button>
              ))}
            </div>
            <p className="muted" style={{ fontSize: 12.5, marginTop: 10 }}>
              HQ corre en local y sin contraseñas. Cuando sea intranet se agrega inicio de sesión.
            </p>
          </Panel>

          <Panel title="Datos">
            <p className="muted" style={{ fontSize: 13, marginBottom: 12 }}>
              Copia completa en JSON de todos los proyectos: tareas, bitácora, rúbricas, revisiones y ajustes. Sirve de respaldo.
            </p>
            <a className="btn" href="/api/export" download>
              <Download size={15} /> Descargar copia
            </a>
          </Panel>
        </div>
      </div>
    </div>
  )
}

/** Conexión con la bóveda de Obsidian: estado, carpeta, sincronizar ahora y últimos movimientos. */
function ObsidianPanel() {
  const vault = useVault().data
  const refresh = useRefresh()
  const { toast } = useUI()
  const [path, setPath] = useState('')
  const [busy, setBusy] = useState(false)
  useEffect(() => {
    if (vault) setPath(vault.path || vault.root || vault.detected || '')
  }, [vault?.path, vault?.root, vault?.detected]) // eslint-disable-line react-hooks/exhaustive-deps

  if (!vault) return null
  const patch = async (body: Partial<Pick<VaultStatus, 'enabled' | 'path'>>, ok: string) => {
    try {
      await api.patch('/api/vault', body)
      refresh(qk.vault)
      toast(ok)
    } catch (e) {
      toast((e as Error).message, 'bad')
    }
  }
  const syncNow = async () => {
    setBusy(true)
    try {
      const res = await api.post<{ result: Record<string, number | boolean | string>; status: VaultStatus }>('/api/vault/sync')
      refresh(qk.vault, qk.tasks, qk.projects)
      const r = res.result
      toast(
        r.ok
          ? `Listo: ${r.imported ?? 0} nuevas desde Obsidian, ${r.exported ?? 0} creadas allá, ${(Number(r.updatedHQ) || 0) + (Number(r.updatedVault) || 0)} actualizadas`
          : 'No se encontró la bóveda: revisa la carpeta',
        r.ok ? 'ok' : 'bad',
      )
    } catch (e) {
      toast((e as Error).message, 'bad')
    } finally {
      setBusy(false)
    }
  }

  return (
    <Panel title="Obsidian" icon={<BookOpen size={18} style={{ color: 'var(--acc)' }} />}>
      <div className="setting">
        <div className="txt">
          <b>Sincronizar tareas y proyectos con el vault</b>
          <span>
            {vault.connected
              ? `Conectado a ${vault.root}. Cada proyecto de 10_Proyectos es un proyecto aquí y cada nota de 01_Gestion/Tareas, una tarea.`
              : vault.enabled
                ? 'No encuentro la bóveda. Escribe abajo la carpeta del vault (la que contiene 10_Proyectos).'
                : 'Apagado: los cambios se quedan solo en HQ.'}
          </span>
        </div>
        <Toggle checked={vault.enabled} onChange={(v) => patch({ enabled: v }, v ? 'Sincronización con Obsidian activada' : 'Sincronización con Obsidian pausada')} label="Sincronizar con Obsidian" />
      </div>
      <form
        className="row"
        style={{ gap: 8, margin: '10px 0' }}
        onSubmit={(e) => {
          e.preventDefault()
          void patch({ path }, 'Carpeta del vault guardada')
        }}
      >
        <input className="input" value={path} onChange={(e) => setPath(e.target.value)} placeholder="G:\Mi unidad\Liiot" aria-label="Carpeta del vault" />
        <button type="submit" className="btn" disabled={!path.trim() || path === (vault.path || vault.root)}>
          Guardar
        </button>
      </form>
      <div className="row wrap" style={{ gap: 8 }}>
        <button type="button" className="btn primary sm" onClick={syncNow} disabled={busy || !vault.connected}>
          <RefreshCw size={14} className={busy || vault.busy ? 'spin' : undefined} /> Sincronizar ahora
        </button>
        <span className="muted" style={{ fontSize: 12.5 }}>
          {vault.linkedTasks} tareas y {vault.linkedProjects} proyectos vinculados
          {vault.lastSync ? ` · última revisión ${fmtMoment(vault.lastSync)}` : ''} · revisa sola cada 15 s
        </span>
      </div>
      {vault.lastError && <p style={{ color: 'var(--bad)', fontSize: 12.5, marginTop: 8 }}>Último error: {vault.lastError}</p>}
      {vault.activity.length > 0 && (
        <ul className="vault-log">
          {vault.activity.slice(0, 6).map((a, i) => (
            <li key={`${a.at}-${i}`}>
              <span className="muted">{fmtMoment(a.at)}</span> {a.text}
            </li>
          ))}
        </ul>
      )}
      <p className="muted" style={{ fontSize: 12, marginTop: 8 }}>
        HQ solo cambia el encabezado (frontmatter) de las notas, nunca su texto, y no borra archivos: si borras una nota, la tarea queda archivada aquí.
      </p>
    </Panel>
  )
}

function AvatarEditor({ member }: { member: Member }) {
  const refresh = useRefresh()
  const { toast } = useUI()
  const [a, setA] = useState<AvatarCfg>(member.avatar)
  const [color, setColor] = useState(member.color)
  const [capacity, setCapacity] = useState(member.capacity)
  const [hours, setHours] = useState({ start: member.workStart, end: member.workEnd })
  useEffect(() => setA(member.avatar), [member.avatar])
  const set = (patch: Partial<AvatarCfg>) => setA((prev) => ({ ...prev, ...patch }))

  const save = async () => {
    try {
      await api.patch(`/api/members/${member.id}`, { avatar: a, color, capacity, workStart: hours.start, workEnd: hours.end })
      refresh(qk.members, qk.metrics, qk.presence)
      toast(`Avatar de ${member.name} guardado`)
    } catch (e) {
      toast((e as Error).message, 'bad')
    }
  }

  const swatches = (values: string[], current: string | null, onPick: (v: string) => void) => (
    <div className="swatches">
      {values.map((c) => (
        <button key={c} type="button" style={{ background: c }} aria-pressed={current?.toLowerCase() === c.toLowerCase()} aria-label={c} onClick={() => onPick(c)} />
      ))}
      <input type="color" value={current ?? '#000000'} onChange={(e) => onPick(e.target.value)} aria-label="Otro color" />
    </div>
  )

  return (
    <div className="avatar-editor">
      <div className="avatar-preview" style={{ ['--pc' as string]: color }}>
        <Avatar avatar={a} color={color} variant="full" size={160} title={member.name} />
        <b style={{ font: '600 16px var(--font-display)' }}>{member.name}</b>
        <span className="muted" style={{ fontSize: 12 }}>
          {member.role} · {member.area}
        </span>
        <button type="button" className="btn primary" onClick={save}>
          Guardar avatar
        </button>
        <p className="muted" style={{ fontSize: 11.5, textAlign: 'center' }}>
          El mismo diseño se usa en la oficina 3D.
        </p>
      </div>
      <div className="stack" style={{ gap: 14 }}>
        <div className="field">
          <span>Cabello</span>
          <div className="pills">
            {HAIR.map((h) => (
              <button key={h.v} type="button" aria-pressed={a.hair === h.v} onClick={() => set({ hair: h.v })}>
                {h.label}
              </button>
            ))}
          </div>
          {swatches(HAIR_COLORS, a.hairColor, (v) => set({ hairColor: v }))}
        </div>
        <div className="field">
          <span>Piel</span>
          {swatches(SKINS, a.skin, (v) => set({ skin: v }))}
        </div>
        <div className="field">
          <span>Camiseta</span>
          {swatches(CLOTHES, a.top, (v) => set({ top: v }))}
        </div>
        <div className="field">
          <span>Encima</span>
          <div className="pills">
            {OUTER.map((o) => (
              <button key={o.v} type="button" aria-pressed={a.outerStyle === o.v} onClick={() => set({ outerStyle: o.v, outer: o.v === 'none' ? null : a.outer ?? '#1D1A22' })}>
                {o.label}
              </button>
            ))}
          </div>
          {a.outerStyle !== 'none' && swatches(CLOTHES, a.outer, (v) => set({ outer: v }))}
        </div>
        <div className="field">
          <span>Detalles</span>
          <div className="pills">
            <button type="button" aria-pressed={a.glasses} onClick={() => set({ glasses: !a.glasses })}>
              Gafas
            </button>
            <button type="button" aria-pressed={a.necklace} onClick={() => set({ necklace: !a.necklace })}>
              Collares
            </button>
            <button type="button" aria-pressed={!!a.lashes} onClick={() => set({ lashes: !a.lashes })}>
              Pestañas
            </button>
            <button type="button" aria-pressed={!!a.lips} onClick={() => set({ lips: a.lips ? null : '#D2405A' })}>
              Labios con color
            </button>
          </div>
        </div>
        <div className="field">
          <span>Color personal</span>
          {swatches(['#FF6A33', '#8B45CC', '#E2B31C', '#E04B66', '#34D399', '#60A5FA', '#3DD6F5'], color, setColor)}
        </div>
        <div className="fields">
          <label className="field">
            <span>Capacidad semanal (puntos)</span>
            <input className="input" type="number" min={1} max={40} value={capacity} onChange={(e) => setCapacity(Number(e.target.value))} />
          </label>
          <div className="field">
            <span>Horario</span>
            <div className="row">
              <input className="input" type="time" value={hours.start} onChange={(e) => setHours({ ...hours, start: e.target.value })} aria-label="Inicio" />
              <input className="input" type="time" value={hours.end} onChange={(e) => setHours({ ...hours, end: e.target.value })} aria-label="Fin" />
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
