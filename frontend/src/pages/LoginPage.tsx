import { useState, type FormEvent, type ReactNode } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { ArrowLeft, Eye, EyeOff, KeyRound, LogIn, ShieldCheck, Sparkles } from 'lucide-react'
import { api, APP_NAME, qk } from '../api'
import { Background, Isotipo } from '../components/Brand'
import type { AuthState, Member } from '../types'

type Mode = 'login' | 'code' | 'forgot'

/** Entrada a Liiot Hub: primera cuenta, iniciar sesión o activar una cuenta con un código. */
export default function LoginPage({ state }: { state: AuthState | undefined }) {
  const [mode, setMode] = useState<Mode>('login')
  const needsSetup = Boolean(state?.needsSetup)
  return (
    <>
      <Background />
      <main className="auth">
        <section className="auth-card panel">
          <div className="auth-brand">
            <span className="auth-logo">
              <Isotipo />
            </span>
            <div>
              <b>{APP_NAME}</b>
              <small>El espacio de trabajo de Liiot</small>
            </div>
          </div>
          {state === undefined ? (
            <p className="muted">Conectando…</p>
          ) : needsSetup ? (
            <SetupForm people={state.people} />
          ) : mode === 'login' ? (
            <LoginForm onCode={() => setMode('code')} onForgot={() => setMode('forgot')} />
          ) : mode === 'code' ? (
            <CodeForm onBack={() => setMode('login')} />
          ) : (
            <Forgot onBack={() => setMode('login')} onCode={() => setMode('code')} />
          )}
        </section>
        <p className="auth-foot">
          <ShieldCheck size={14} aria-hidden /> Tu contraseña se guarda cifrada y nunca sale de este equipo.
        </p>
      </main>
    </>
  )
}

function useSignedIn() {
  const qc = useQueryClient()
  return (me: Member) => {
    qc.setQueryData<AuthState>(qk.auth, (prev) => ({ appName: APP_NAME, people: [], ...(prev ?? {}), needsSetup: false, me }))
    qc.invalidateQueries()
  }
}

function Password({ value, onChange, label, autoComplete, autoFocus }: { value: string; onChange: (v: string) => void; label: string; autoComplete: string; autoFocus?: boolean }) {
  const [show, setShow] = useState(false)
  return (
    <label className="field">
      <span>{label}</span>
      <span className="pw">
        <input className="input" type={show ? 'text' : 'password'} value={value} onChange={(e) => onChange(e.target.value)} autoComplete={autoComplete} autoFocus={autoFocus} required />
        <button type="button" className="btn icon sm ghost" onClick={() => setShow(!show)} aria-label={show ? 'Ocultar contraseña' : 'Mostrar contraseña'}>
          {show ? <EyeOff size={16} /> : <Eye size={16} />}
        </button>
      </span>
    </label>
  )
}

function ErrorNote({ children }: { children: ReactNode }) {
  return children ? (
    <p className="auth-error" role="alert">
      {children}
    </p>
  ) : null
}

function LoginForm({ onCode, onForgot }: { onCode: () => void; onForgot: () => void }) {
  const signedIn = useSignedIn()
  const [login, setLogin] = useState('')
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const submit = async (e: FormEvent) => {
    e.preventDefault()
    setBusy(true)
    setError('')
    try {
      const res = await api.post<{ me: Member }>('/api/auth/login', { login, password })
      signedIn(res.me)
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setBusy(false)
    }
  }
  return (
    <form className="stack" onSubmit={submit}>
      <div>
        <h1>¡Hola de nuevo!</h1>
        <p className="muted">Entra con tu correo o tu usuario.</p>
      </div>
      <label className="field">
        <span>Correo o usuario</span>
        <input className="input" value={login} onChange={(e) => setLogin(e.target.value)} autoComplete="username" autoFocus required />
      </label>
      <Password label="Contraseña" value={password} onChange={setPassword} autoComplete="current-password" />
      <ErrorNote>{error}</ErrorNote>
      <button type="submit" className="btn primary lg" disabled={busy || !login || !password}>
        <LogIn size={17} /> {busy ? 'Entrando…' : 'Entrar'}
      </button>
      <div className="auth-links">
        <button type="button" className="link" onClick={onCode}>
          <KeyRound size={14} /> Tengo un código de invitación
        </button>
        <button type="button" className="link" onClick={onForgot}>
          ¿Olvidaste tu contraseña?
        </button>
      </div>
    </form>
  )
}

function Forgot({ onBack, onCode }: { onBack: () => void; onCode: () => void }) {
  return (
    <div className="stack">
      <div>
        <h1>Recupera tu acceso</h1>
        <p className="muted">Por seguridad, la contraseña se cambia con un código de un solo uso.</p>
      </div>
      <ol className="steps">
        <li>
          <span>Pídele a quien administra {APP_NAME} un código nuevo (Ajustes › Personas y accesos).</span>
        </li>
        <li>
          <span>
            Si eres tú quien administra, en el computador donde corre {APP_NAME} abre <b>recuperar-acceso.cmd</b> y elige tu nombre.
          </span>
        </li>
        <li>
          <span>Con el código, elige una contraseña nueva aquí mismo.</span>
        </li>
      </ol>
      <button type="button" className="btn primary lg" onClick={onCode}>
        <KeyRound size={16} /> Ya tengo un código
      </button>
      <button type="button" className="link" onClick={onBack}>
        <ArrowLeft size={14} /> Volver a entrar
      </button>
    </div>
  )
}

function AccountFields({ data, set }: { data: { email: string; username: string; password: string; confirm: string }; set: (patch: Partial<typeof data>) => void }) {
  return (
    <>
      <div className="fields">
        <label className="field">
          <span>Correo</span>
          <input className="input" type="email" value={data.email} onChange={(e) => set({ email: e.target.value })} autoComplete="email" required placeholder="nombre@liiot.co" />
        </label>
        <label className="field">
          <span>Usuario</span>
          <input
            className="input"
            value={data.username}
            onChange={(e) => set({ username: e.target.value.toLowerCase().replace(/\s/g, '') })}
            autoComplete="username"
            required
            placeholder="dana"
          />
        </label>
      </div>
      <div className="fields">
        <Password label="Contraseña" value={data.password} onChange={(v) => set({ password: v })} autoComplete="new-password" />
        <Password label="Repítela" value={data.confirm} onChange={(v) => set({ confirm: v })} autoComplete="new-password" />
      </div>
      <p className="hint">Mínimo 8 caracteres. Una frase corta que recuerdes es ideal, por ejemplo «cafe con leche 2026».</p>
    </>
  )
}

function SetupForm({ people }: { people: AuthState['people'] }) {
  const signedIn = useSignedIn()
  const [who, setWho] = useState(people[0]?.id ?? '')
  const [code, setCode] = useState('')
  const [data, setData] = useState({ email: '', username: people[0]?.id ?? '', password: '', confirm: '' })
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const set = (patch: Partial<typeof data>) => setData((d) => ({ ...d, ...patch }))
  const submit = async (e: FormEvent) => {
    e.preventDefault()
    if (data.password !== data.confirm) return setError('Las dos contraseñas no coinciden.')
    setBusy(true)
    setError('')
    try {
      const res = await api.post<{ me: Member }>('/api/auth/setup', { code, memberId: who, email: data.email, username: data.username, password: data.password })
      signedIn(res.me)
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setBusy(false)
    }
  }
  return (
    <form className="stack" onSubmit={submit}>
      <div>
        <h1>
          <Sparkles size={22} className="acc" /> Bienvenida a {APP_NAME}
        </h1>
        <p className="muted">Vamos a crear la primera cuenta. Quien la cree administra el espacio y luego invita al resto del equipo.</p>
      </div>
      <div className="field">
        <span>¿Quién eres?</span>
        <div className="pills">
          {people.map((p) => (
            <button
              key={p.id}
              type="button"
              aria-pressed={who === p.id}
              onClick={() => {
                setWho(p.id)
                set({ username: p.id })
              }}
            >
              {p.name} · {p.role}
            </button>
          ))}
        </div>
      </div>
      <label className="field">
        <span>Código de la ventana «{APP_NAME}»</span>
        <input className="input code" value={code} onChange={(e) => setCode(e.target.value.toUpperCase())} placeholder="XXXX-XXXX" required autoComplete="one-time-code" />
      </label>
      <p className="hint">Lo encuentras en la ventana negra que se abrió al iniciar {APP_NAME}, donde dice «usa este código».</p>
      <AccountFields data={data} set={set} />
      <ErrorNote>{error}</ErrorNote>
      <button type="submit" className="btn primary lg" disabled={busy || !who || !code || !data.password}>
        {busy ? 'Creando…' : 'Crear mi cuenta y entrar'}
      </button>
    </form>
  )
}

function CodeForm({ onBack }: { onBack: () => void }) {
  const signedIn = useSignedIn()
  const [code, setCode] = useState('')
  const [info, setInfo] = useState<{ kind: string; member: { name: string }; username: string | null; email: string | null } | null>(null)
  const [data, setData] = useState({ email: '', username: '', password: '', confirm: '' })
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const set = (patch: Partial<typeof data>) => setData((d) => ({ ...d, ...patch }))

  const check = async (e: FormEvent) => {
    e.preventDefault()
    setBusy(true)
    setError('')
    try {
      const res = await api.post<NonNullable<typeof info>>('/api/auth/code', { code })
      setInfo(res)
      setData((d) => ({ ...d, email: res.email ?? '', username: res.username ?? '' }))
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setBusy(false)
    }
  }
  const use = async (e: FormEvent) => {
    e.preventDefault()
    if (data.password !== data.confirm) return setError('Las dos contraseñas no coinciden.')
    setBusy(true)
    setError('')
    try {
      const res = await api.post<{ me: Member }>('/api/auth/code/use', { code, email: data.email, username: data.username, password: data.password })
      signedIn(res.me)
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setBusy(false)
    }
  }

  if (!info) {
    return (
      <form className="stack" onSubmit={check}>
        <div>
          <h1>Usa tu código</h1>
          <p className="muted">Te lo da quien administra {APP_NAME}. Sirve para activar tu cuenta o para elegir una contraseña nueva.</p>
        </div>
        <label className="field">
          <span>Código</span>
          <input className="input code" value={code} onChange={(e) => setCode(e.target.value.toUpperCase())} placeholder="XXXX-XXXX" autoFocus required autoComplete="one-time-code" />
        </label>
        <ErrorNote>{error}</ErrorNote>
        <button type="submit" className="btn primary lg" disabled={busy || code.replace(/[^A-Z0-9]/g, '').length < 8}>
          {busy ? 'Revisando…' : 'Continuar'}
        </button>
        <button type="button" className="link" onClick={onBack}>
          <ArrowLeft size={14} /> Volver a entrar
        </button>
      </form>
    )
  }
  return (
    <form className="stack" onSubmit={use}>
      <div>
        <h1>¡Hola, {info.member.name}! 👋</h1>
        <p className="muted">{info.kind === 'activar' ? 'Elige cómo vas a entrar a partir de hoy.' : 'Elige tu contraseña nueva.'}</p>
      </div>
      <AccountFields data={data} set={set} />
      <ErrorNote>{error}</ErrorNote>
      <button type="submit" className="btn primary lg" disabled={busy || !data.password}>
        {busy ? 'Guardando…' : info.kind === 'activar' ? 'Activar mi cuenta y entrar' : 'Guardar y entrar'}
      </button>
    </form>
  )
}
