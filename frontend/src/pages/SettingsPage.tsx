import { useEffect, useState } from 'react'
import { BookOpen, Copy, Download, KeyRound, Palette, RefreshCw, ShieldCheck, UserPlus, UserRound, Users } from 'lucide-react'
import { api, qk, useAccounts, useMe, useRefresh, useVault } from '../api'
import { fmtMoment } from '../lib/format'
import type { Account, AvatarCfg, HairStyle, Member, OuterStyle, VaultStatus } from '../types'
import { Avatar } from '../components/Avatar'
import { MemberHead, Panel, Toggle, useMemberMap } from '../components/bits'
import { usePrefs, type Mode } from '../prefs'
import { useUI } from '../ui'

const HAIR: { v: HairStyle; label: string }[] = [
  { v: 'wolf', label: 'Largo en capas' },
  { v: 'long', label: 'Largo liso' },
  { v: 'bowl', label: 'Liso con flequillo' },
  { v: 'wavy', label: 'Corto ondulado' },
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
const DAYS = ['L', 'M', 'X', 'J', 'V', 'S', 'D']
const DAY_NAMES = ['lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado', 'domingo']

export default function SettingsPage() {
  const me = useMe()
  const members = useMemberMap()
  const [editing, setEditing] = useState<string>(me.id)
  const person = members[editing]

  return (
    <div className="page settings">
      <div className="settings-grid">
        <div className="settings-col">
          <Panel
            title={editing === me.id ? 'Mi perfil' : `Perfil de ${person?.name ?? ''}`}
            icon={<UserRound size={18} className="acc" />}
            actions={
              me.isAdmin ? (
                <div className="seg" role="group" aria-label="Persona">
                  {Object.values(members).map((m) => (
                    <button key={m.id} type="button" aria-pressed={editing === m.id} onClick={() => setEditing(m.id)} title={m.name}>
                      <MemberHead member={m} size={20} />
                    </button>
                  ))}
                </div>
              ) : undefined
            }
          >
            {person && <ProfileEditor key={person.id} member={person} />}
          </Panel>
          <AppearancePanel />
        </div>

        <div className="settings-col">
          <AccountPanel />
          {me.isAdmin && <AccessPanel />}
          <ObsidianPanel admin={me.isAdmin} />
          {me.isAdmin && (
            <Panel title="Copia de seguridad" icon={<Download size={18} className="acc" />}>
              <p className="muted small" style={{ marginBottom: 12 }}>
                Todo en un archivo: proyectos, fases, tareas, bitácora, rúbricas y ajustes. Guárdalo de vez en cuando.
              </p>
              <a className="btn" href="/api/export" download>
                <Download size={15} /> Descargar copia
              </a>
            </Panel>
          )}
        </div>
      </div>
    </div>
  )
}

function AccountPanel() {
  const me = useMe()
  const { toast } = useUI()
  const refresh = useRefresh()
  const [current, setCurrent] = useState('')
  const [next, setNext] = useState('')
  const [confirm, setConfirm] = useState('')
  const [account, setAccount] = useState({ username: me.username ?? '', email: me.email ?? '', password: '' })
  const [editing, setEditing] = useState(false)
  return (
    <Panel title="Mi cuenta" icon={<KeyRound size={18} className="acc" />}>
      {!editing ? (
        <div className="account-info">
          <span>
            <small>Usuario</small>
            <b>{me.username}</b>
          </span>
          <span>
            <small>Correo</small>
            <b>{me.email}</b>
          </span>
          <button type="button" className="btn sm ghost" onClick={() => setEditing(true)}>
            Cambiar
          </button>
        </div>
      ) : (
        <form
          className="stack"
          onSubmit={async (e) => {
            e.preventDefault()
            try {
              await api.patch('/api/auth/account', account)
              refresh(qk.auth, qk.members)
              setEditing(false)
              setAccount((a) => ({ ...a, password: '' }))
              toast('Cuenta actualizada')
            } catch (err) {
              toast((err as Error).message, 'bad')
            }
          }}
        >
          <div className="fields">
            <label className="field">
              <span>Usuario</span>
              <input className="input" value={account.username} onChange={(e) => setAccount({ ...account, username: e.target.value.toLowerCase().replace(/\s/g, '') })} autoComplete="username" />
            </label>
            <label className="field">
              <span>Correo</span>
              <input className="input" type="email" value={account.email} onChange={(e) => setAccount({ ...account, email: e.target.value })} autoComplete="email" />
            </label>
          </div>
          <label className="field">
            <span>Confirma con tu contraseña</span>
            <input className="input" type="password" value={account.password} onChange={(e) => setAccount({ ...account, password: e.target.value })} autoComplete="current-password" />
          </label>
          <div className="row">
            <button type="submit" className="btn primary sm" disabled={!account.password}>
              Guardar
            </button>
            <button type="button" className="btn ghost sm" onClick={() => setEditing(false)}>
              Cancelar
            </button>
          </div>
        </form>
      )}
      <div className="divider" />
      <form
        className="stack"
        onSubmit={async (e) => {
          e.preventDefault()
          if (next !== confirm) return toast('Las dos contraseñas nuevas no coinciden', 'bad')
          try {
            await api.post('/api/auth/password', { current, password: next })
            setCurrent('')
            setNext('')
            setConfirm('')
            toast('Contraseña cambiada. Se cerraron tus otras sesiones.')
          } catch (err) {
            toast((err as Error).message, 'bad')
          }
        }}
      >
        <span className="field-label">Cambiar contraseña</span>
        <input className="input" type="password" placeholder="Contraseña actual" value={current} onChange={(e) => setCurrent(e.target.value)} autoComplete="current-password" />
        <div className="fields">
          <input className="input" type="password" placeholder="Nueva (mínimo 8)" value={next} onChange={(e) => setNext(e.target.value)} autoComplete="new-password" />
          <input className="input" type="password" placeholder="Repite la nueva" value={confirm} onChange={(e) => setConfirm(e.target.value)} autoComplete="new-password" />
        </div>
        <button type="submit" className="btn sm" style={{ justifySelf: 'start' }} disabled={!current || next.length < 8}>
          Cambiar contraseña
        </button>
      </form>
    </Panel>
  )
}

function CodeBox({ code, name, kind, onClose }: { code: string; name: string; kind: string; onClose: () => void }) {
  const { toast } = useUI()
  const text = `Hola ${name}: entra a Liiot Hub, toca «Tengo un código de invitación» y escribe ${code}. Vale una sola vez.`
  return (
    <div className="code-box">
      <span className="field-label">{kind === 'activar' ? `Código para que ${name} active su cuenta` : `Código para que ${name} elija una contraseña nueva`}</span>
      <b className="code">{code}</b>
      <p className="muted small">Compártelo solo con {name}, por un canal privado. {kind === 'activar' ? 'Vale 7 días.' : 'Vale 24 horas.'} Este código no se vuelve a mostrar.</p>
      <div className="row">
        <button
          type="button"
          className="btn sm"
          onClick={async () => {
            try {
              await navigator.clipboard.writeText(text)
              toast('Mensaje copiado con el código')
            } catch {
              toast(text, 'info')
            }
          }}
        >
          <Copy size={13} /> Copiar mensaje
        </button>
        <button type="button" className="btn sm ghost" onClick={onClose}>
          Listo
        </button>
      </div>
    </div>
  )
}

function AccessPanel() {
  const me = useMe()
  const accounts = useAccounts(me.isAdmin).data ?? []
  const refresh = useRefresh()
  const { toast } = useUI()
  const [shown, setShown] = useState<{ id: string; code: string; kind: string } | null>(null)
  const [adding, setAdding] = useState(false)
  const [person, setPerson] = useState({ name: '', role: '', isAdmin: false })
  const act = async (fn: () => Promise<unknown>, ok?: string) => {
    try {
      const res = await fn()
      refresh(qk.accounts, qk.members)
      if (ok) toast(ok)
      return res
    } catch (e) {
      toast((e as Error).message, 'bad')
      return null
    }
  }
  return (
    <Panel
      title="Personas y accesos"
      icon={<Users size={18} className="acc" />}
      actions={
        <button type="button" className="btn sm" onClick={() => setAdding(!adding)}>
          <UserPlus size={14} /> Agregar persona
        </button>
      }
    >
      {adding && (
        <form
          className="add-person"
          onSubmit={async (e) => {
            e.preventDefault()
            if (!person.name.trim()) return
            const res = (await act(() => api.post<{ member: Account; code: string }>('/api/accounts', person), `${person.name} quedó registrada`)) as { member: Account; code: string } | null
            if (res) {
              setShown({ id: res.member.id, code: res.code, kind: 'activar' })
              setPerson({ name: '', role: '', isAdmin: false })
              setAdding(false)
            }
          }}
        >
          <div className="fields">
            <input className="input" placeholder="Nombre completo" value={person.name} onChange={(e) => setPerson({ ...person, name: e.target.value })} autoFocus />
            <input className="input" placeholder="Rol, por ejemplo Diseño" value={person.role} onChange={(e) => setPerson({ ...person, role: e.target.value })} />
          </div>
          <label className="row small" style={{ gap: 8 }}>
            <Toggle checked={person.isAdmin} onChange={(v) => setPerson({ ...person, isAdmin: v })} label="Administra" /> También puede administrar Liiot Hub
          </label>
          <button type="submit" className="btn primary sm" disabled={!person.name.trim()}>
            Registrar y crear su código
          </button>
        </form>
      )}
      {accounts.map((a) => (
        <div key={a.id} className="access-row">
          <MemberHead member={a} size={34} />
          <div className="grow">
            <b>
              {a.name} {a.isAdmin && <ShieldCheck size={13} className="acc" aria-label="Administra" />}
            </b>
            <small className={a.hasAccount && a.active ? 'ok' : 'muted'}>
              {!a.active
                ? 'Cuenta desactivada'
                : a.hasAccount
                  ? `Activa · @${a.username}${a.lastLoginAt ? ` · entró ${fmtMoment(a.lastLoginAt)}` : ''}`
                  : a.pendingCode
                    ? 'Tiene un código sin usar'
                    : 'Aún sin cuenta'}
            </small>
          </div>
          <button
            type="button"
            className="btn sm"
            onClick={async () => {
              const res = (await act(() => api.post<{ code: string; kind: string }>(`/api/accounts/${a.id}/code`))) as { code: string; kind: string } | null
              if (res) setShown({ id: a.id, code: res.code, kind: res.kind })
            }}
            title={a.hasAccount ? 'Código para que elija una contraseña nueva' : 'Código para que active su cuenta'}
          >
            <KeyRound size={13} /> {a.hasAccount ? 'Nueva contraseña' : 'Código de acceso'}
          </button>
          {a.id !== me.id && (
            <details className="more">
              <summary aria-label={`Más opciones para ${a.name}`}>···</summary>
              <div className="menu panel">
                <button type="button" onClick={() => act(() => api.patch(`/api/accounts/${a.id}`, { isAdmin: !a.isAdmin }), a.isAdmin ? `${a.name} ya no administra` : `${a.name} ahora administra`)}>
                  {a.isAdmin ? 'Quitar administración' : 'Hacer administradora'}
                </button>
                <button type="button" className="danger" onClick={() => act(() => api.patch(`/api/accounts/${a.id}`, { active: !a.active }), a.active ? `Se desactivó la cuenta de ${a.name}` : `Se reactivó la cuenta de ${a.name}`)}>
                  {a.active ? 'Desactivar cuenta' : 'Reactivar cuenta'}
                </button>
              </div>
            </details>
          )}
          {shown?.id === a.id && <CodeBox code={shown.code} name={a.name} kind={shown.kind} onClose={() => setShown(null)} />}
        </div>
      ))}
    </Panel>
  )
}

/** Conexión con la bóveda de Obsidian: estado, carpeta, sincronizar ahora y últimos movimientos. */
function ObsidianPanel({ admin }: { admin: boolean }) {
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
      const res = await api.post<{ result: Record<string, number | boolean | string> }>('/api/vault/sync')
      refresh(qk.vault, qk.tasks, qk.projects, qk.phases)
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
    <Panel title="Obsidian" icon={<BookOpen size={18} className="acc" />}>
      <div className="setting">
        <div className="txt">
          <b>{vault.connected ? `Conectado a ${vault.vaultName}` : vault.enabled ? 'No encuentro la bóveda' : 'Sincronización apagada'}</b>
          <span>
            {vault.connected
              ? 'Proyectos, fases, etapas, tareas y checklist viajan en las dos direcciones. Solo se toca el encabezado de las notas.'
              : vault.enabled
                ? 'Escribe abajo la carpeta del vault (la que contiene 10_Proyectos).'
                : 'Los cambios se quedan solo en Liiot Hub.'}
          </span>
        </div>
        {admin && <Toggle checked={vault.enabled} onChange={(v) => patch({ enabled: v }, v ? 'Sincronización con Obsidian activada' : 'Sincronización con Obsidian pausada')} label="Sincronizar con Obsidian" />}
      </div>
      {admin && (
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
      )}
      <div className="row wrap" style={{ gap: 8 }}>
        <button type="button" className="btn primary sm" onClick={syncNow} disabled={busy || !vault.connected}>
          <RefreshCw size={14} className={busy || vault.busy ? 'spin' : undefined} /> Sincronizar ahora
        </button>
        <span className="muted small">
          {vault.linkedTasks} tareas vinculadas{vault.lastSync ? ` · última revisión ${fmtMoment(vault.lastSync)}` : ''}
        </span>
      </div>
      {vault.lastError && <p className="bad small" style={{ marginTop: 8 }}>Último error: {vault.lastError}</p>}
      {vault.activity.length > 0 && (
        <ul className="vault-log">
          {vault.activity.slice(0, 5).map((a, i) => (
            <li key={`${a.at}-${i}`}>
              <span className="muted">{fmtMoment(a.at)}</span> {a.text}
            </li>
          ))}
        </ul>
      )}
    </Panel>
  )
}

function AppearancePanel() {
  const { mode, setMode, pixel, setPixel, calm, setCalm } = usePrefs()
  return (
    <Panel title="Apariencia" icon={<Palette size={18} className="acc" />}>
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
          <b>Menos movimiento</b>
          <span>Quita las animaciones del fondo y al entrar a los proyectos.</span>
        </div>
        <Toggle checked={calm} onChange={setCalm} label="Menos movimiento" />
      </div>
      <div className="setting">
        <div className="txt">
          <b>Oficina en modo pixel</b>
          <span>Pixela la escena 3D, como un videojuego retro.</span>
        </div>
        <Toggle checked={pixel} onChange={setPixel} label="Modo pixel" />
      </div>
    </Panel>
  )
}

function ProfileEditor({ member }: { member: Member }) {
  const refresh = useRefresh()
  const { toast } = useUI()
  const [a, setA] = useState<AvatarCfg>(member.avatar)
  const [color, setColor] = useState(member.color)
  const [info, setInfo] = useState({ name: member.name, fullName: member.fullName, role: member.role })
  const [hours, setHours] = useState({ start: member.workStart, end: member.workEnd })
  const [days, setDays] = useState<number[]>(member.workDays ?? [0, 1, 2, 3, 4])
  useEffect(() => setA(member.avatar), [member.avatar])
  const set = (patch: Partial<AvatarCfg>) => setA((prev) => ({ ...prev, ...patch }))

  const save = async () => {
    try {
      await api.patch(`/api/members/${member.id}`, { avatar: a, color, ...info, workStart: hours.start, workEnd: hours.end, workDays: days })
      refresh(qk.members, qk.presence, qk.auth)
      toast('Perfil guardado')
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
        <Avatar avatar={a} color={color} variant="full" size={150} title={member.name} />
        <b>{info.name}</b>
        <span className="muted small">{info.role}</span>
        <button type="button" className="btn primary" onClick={save}>
          Guardar perfil
        </button>
        <p className="muted small" style={{ textAlign: 'center' }}>
          El mismo diseño se usa en la oficina 3D.
        </p>
      </div>
      <div className="stack" style={{ gap: 14 }}>
        <div className="fields">
          <label className="field">
            <span>Nombre corto</span>
            <input className="input" value={info.name} onChange={(e) => setInfo({ ...info, name: e.target.value })} />
          </label>
          <label className="field">
            <span>Rol</span>
            <input className="input" value={info.role} onChange={(e) => setInfo({ ...info, role: e.target.value })} />
          </label>
        </div>
        <div className="field">
          <span>Horario (fuera de él, la oficina te muestra descansando)</span>
          <div className="row wrap">
            <input className="input" type="time" style={{ width: 130 }} value={hours.start} onChange={(e) => setHours({ ...hours, start: e.target.value })} aria-label="Empiezo" />
            <span className="muted">a</span>
            <input className="input" type="time" style={{ width: 130 }} value={hours.end} onChange={(e) => setHours({ ...hours, end: e.target.value })} aria-label="Termino" />
            <div className="days" role="group" aria-label="Días de trabajo">
              {DAYS.map((d, i) => (
                <button key={d} type="button" aria-pressed={days.includes(i)} title={DAY_NAMES[i]} onClick={() => setDays(days.includes(i) ? days.filter((x) => x !== i) : [...days, i].sort())}>
                  {d}
                </button>
              ))}
            </div>
          </div>
        </div>
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
      </div>
    </div>
  )
}
