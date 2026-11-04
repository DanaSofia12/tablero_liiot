import { useEffect, useMemo, useState, type ReactNode } from 'react'
import {
  Bell,
  Bot,
  CalendarClock,
  CalendarHeart,
  CirclePause,
  Copy,
  ExternalLink,
  Flag,
  FlaskConical,
  Hourglass,
  MessageCircle,
  MessagesSquare,
  PartyPopper,
  Play,
  Plus,
  RefreshCw,
  Rocket,
  Sun,
  UserRound,
  Users,
} from 'lucide-react'
import { api, qk, useCatalog, useCheckins, useMe, useRefresh, useTelegram } from '../api'
import { Empty, MemberHead, Toggle, useMemberMap } from '../components/bits'
import { fmtDay, toISO, todayISO } from '../lib/format'
import { useUI } from '../ui'
import type { CheckIn, TelegramSettings } from '../types'

const KIND: Record<string, { icon: typeof Bot; label: string }> = {
  nueva_tarea: { icon: Plus, label: 'Tarea nueva' },
  entrega: { icon: PartyPopper, label: 'Entrega' },
  pruebas: { icon: FlaskConical, label: 'Lista para pruebas' },
  cuenta_regresiva: { icon: Hourglass, label: 'Cuenta regresiva' },
  atrasadas: { icon: CalendarClock, label: 'Atrasadas' },
  fase: { icon: Rocket, label: 'Cambio de fase' },
  pausa: { icon: CirclePause, label: 'Pausa' },
  resumen: { icon: CalendarHeart, label: 'Resumen semanal' },
  semanal: { icon: CalendarHeart, label: 'Repaso semanal' },
  pregunta_diaria: { icon: Sun, label: 'Pregunta del día' },
  estado: { icon: UserRound, label: 'Estado' },
  vencimiento: { icon: Bell, label: 'Recordatorio' },
  respuesta: { icon: MessageCircle, label: 'Respuesta' },
  manual: { icon: MessageCircle, label: 'Pregunta a pedido' },
  asignacion: { icon: Flag, label: 'Asignación' },
  fecha: { icon: CalendarClock, label: 'Cambio de fecha' },
}

/** Campo para pegar el token de BotFather: se prueba con Telegram y el bot arranca sin cerrar nada. */
function TokenForm({ onDone }: { onDone: () => void }) {
  const { toast } = useUI()
  const [token, setToken] = useState('')
  const [busy, setBusy] = useState(false)
  return (
    <form
      className="row"
      style={{ gap: 8 }}
      onSubmit={async (e) => {
        e.preventDefault()
        if (!token.trim()) return
        setBusy(true)
        try {
          await api.post('/api/telegram/token', { token: token.trim() })
          setToken('')
          onDone()
        } catch (err) {
          toast((err as Error).message, 'bad')
        } finally {
          setBusy(false)
        }
      }}
    >
      <input className="input" type="password" autoComplete="off" spellCheck={false} value={token} onChange={(e) => setToken(e.target.value)} placeholder="Pega aquí el token de BotFather" aria-label="Token del bot de Telegram" />
      <button type="submit" className="btn primary" disabled={!token.trim() || busy}>
        {busy ? 'Probando…' : 'Conectar'}
      </button>
    </form>
  )
}

function Setting({ title, desc, checked, onChange }: { title: string; desc: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <div className="setting">
      <div className="txt">
        <b>{title}</b>
        <span>{desc}</span>
      </div>
      <Toggle checked={checked} onChange={onChange} label={title} />
    </div>
  )
}

function Card({ icon, title, children, className = '' }: { icon: ReactNode; title: string; children: ReactNode; className?: string }) {
  return (
    <section className={`panel pad ${className}`}>
      <div className="panel-head">
        {icon}
        <h2>{title}</h2>
      </div>
      {children}
    </section>
  )
}

export default function FollowupPage() {
  const tg = useTelegram().data
  const checkins = useCheckins().data ?? []
  const weekdays = useCatalog().data?.weekdays ?? ['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado', 'Domingo']
  const members = useMemberMap()
  const me = useMe()
  const refresh = useRefresh()
  const { toast } = useUI()
  const [draft, setDraft] = useState<TelegramSettings | null>(null)
  const [feed, setFeed] = useState<'grupo' | 'privado'>('grupo')

  useEffect(() => {
    if (tg && !draft) setDraft(tg.settings)
  }, [tg, draft])

  const grouped = useMemo(() => {
    const items = checkins.filter((c) => (feed === 'grupo' ? c.chat === 'grupo' : c.chat !== 'grupo')).slice(0, 40)
    const out: { day: string; items: CheckIn[] }[] = []
    for (const c of items) {
      const day = toISO(new Date(c.at))
      if (out.at(-1)?.day !== day) out.push({ day, items: [] })
      out.at(-1)!.items.push(c)
    }
    return out
  }, [checkins, feed])

  if (!tg || !draft) return <div className="page"><Empty>Cargando Telegram…</Empty></div>
  const { status } = tg
  const dirty = JSON.stringify(draft) !== JSON.stringify(tg.settings)
  const set = (patch: Partial<TelegramSettings>) => setDraft({ ...draft, ...patch })
  const mine = status.members.find((m) => m.id === me.id)

  const save = async () => {
    try {
      const saved = await api.patch<TelegramSettings>('/api/telegram/settings', draft)
      setDraft(saved)
      refresh(qk.telegram)
      toast('Listo: el bot ya usa estos ajustes')
    } catch (e) {
      toast((e as Error).message, 'bad')
    }
  }
  const run = async (path: string, label: string) => {
    try {
      const res = await api.post<{ ok: boolean; reason?: string; sent?: number }>(path)
      toast(res.ok ? (res.sent === 0 ? `${label}: hoy no había nada que enviar` : `${label}: enviado`) : res.reason ?? 'El bot no está activo', res.ok ? 'ok' : 'info')
      refresh(qk.checkins)
    } catch (e) {
      toast((e as Error).message, 'bad')
    }
  }
  const copy = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text)
      toast('Enlace copiado')
    } catch {
      toast(text, 'info')
    }
  }
  const today = todayISO()

  return (
    <div className="page follow">
      <section className="panel follow-connect" aria-label="Conexión con Telegram">
        <div className="fc">
          <div className="panel-head">
            <Bot size={18} className={status.running ? 'ok' : 'acc'} />
            <h2>{status.running ? 'Bot conectado' : 'Bot de Telegram'}</h2>
          </div>
          {status.running ? (
            <>
              <p className="lead">
                El bot es <b>@{status.botUsername}</b>. Funciona mientras Liiot Hub esté abierto.
              </p>
              <div className="row wrap">
                <a className="btn sm" href={`https://t.me/${status.botUsername}`} target="_blank" rel="noreferrer">
                  <ExternalLink size={14} /> Abrir en Telegram
                </a>
                {me.isAdmin && (
                  <button
                    type="button"
                    className="btn sm ghost"
                    onClick={async () => {
                      if (!window.confirm('¿Desconectar el bot? Dejará de enviar mensajes hasta que pegues un token otra vez.')) return
                      try {
                        await api.del('/api/telegram/token')
                        refresh(qk.telegram)
                        toast('Bot desconectado', 'info')
                      } catch (e) {
                        toast((e as Error).message, 'bad')
                      }
                    }}
                  >
                    Desconectar
                  </button>
                )}
              </div>
            </>
          ) : me.isAdmin ? (
            <>
              {status.error && <p className="bad small">Telegram respondió: {status.error}</p>}
              <ol className="steps compact">
                <li>
                  <span>
                    En Telegram abre <b>@BotFather</b>, escribe <code>/newbot</code> y elige un nombre y un usuario que termine en <code>bot</code>.
                  </span>
                </li>
                <li>
                  <span>Copia el token que te da y pégalo aquí.</span>
                </li>
              </ol>
              <TokenForm
                onDone={() => {
                  refresh(qk.telegram)
                  toast('¡Bot conectado! Ahora cada quien conecta su Telegram.', 'party')
                }}
              />
            </>
          ) : (
            <p className="muted">El bot todavía no está conectado. Quien administra Liiot Hub lo activa aquí con el token de BotFather.</p>
          )}
        </div>

        <div className="fc">
          <div className="panel-head">
            <UserRound size={18} className="acc" />
            <h2>Tu Telegram</h2>
          </div>
          {mine?.linked ? (
            <>
              <p className="lead">
                Conectado{mine.username ? <> como <b>@{mine.username}</b></> : ''}. Aquí te llega la pregunta de cada mañana y tus recordatorios.
              </p>
              <button
                type="button"
                className="btn sm ghost"
                onClick={async () => {
                  await api.post(`/api/members/${me.id}/telegram/reset`)
                  refresh(qk.telegram, qk.members)
                  toast('Desconectaste tu Telegram')
                }}
              >
                <RefreshCw size={13} /> Desconectar
              </button>
            </>
          ) : mine?.deepLink ? (
            <>
              <p className="lead">Toca el botón, abre el chat y presiona «Iniciar». Así el bot sabe que eres tú.</p>
              <a className="btn primary" href={mine.deepLink} target="_blank" rel="noreferrer">
                <ExternalLink size={15} /> Conectar mi Telegram
              </a>
            </>
          ) : (
            <p className="muted">Cuando el bot esté conectado, aquí aparece tu enlace personal.</p>
          )}
        </div>

        <div className="fc">
          <div className="panel-head">
            <Users size={18} className="acc" />
            <h2>El equipo</h2>
          </div>
          {status.members.map((sm) => {
            const m = members[sm.id]
            return (
              <div key={sm.id} className="link-row">
                <MemberHead member={m} size={30} />
                <div className="grow">
                  <b>{m?.name}</b>
                  <div className={`small ${sm.linked ? 'ok' : 'muted'}`}>{sm.linked ? 'Telegram conectado' : 'Sin conectar'}</div>
                </div>
                {me.isAdmin && sm.id !== me.id && !sm.linked && sm.deepLink && (
                  <button type="button" className="btn sm" onClick={() => copy(sm.deepLink!)} title={`Copiar el enlace de ${m?.name} para enviárselo`}>
                    <Copy size={13} /> Enlace
                  </button>
                )}
              </div>
            )
          })}
          <div className="link-row">
            <span className="group-ico">
              <MessagesSquare size={16} />
            </span>
            <div className="grow">
              <b>Grupo del equipo</b>
              <div className={`small ${status.group.linked ? 'ok' : 'muted'}`}>
                {status.group.linked ? `Conectado: ${status.group.title ?? 'grupo'}` : 'Agrega el bot al grupo y escribe /vincular_grupo'}
              </div>
            </div>
            {status.group.linked && (
              <button
                type="button"
                className="btn sm ghost"
                onClick={async () => {
                  await api.post('/api/telegram/unlink-group')
                  refresh(qk.telegram)
                  setDraft(null)
                }}
              >
                Quitar
              </button>
            )}
          </div>
        </div>
      </section>

      <div className="follow-grid">
        <Card icon={<MessagesSquare size={18} className="acc" />} title="Chat del equipo" className="chat-card">
          <Setting title="Tareas nuevas" desc="«Jean Pierre creó la tarea Configurar el servidor para Dana»" checked={draft.groupNewTasks} onChange={(v) => set({ groupNewTasks: v })} />
          <Setting title="Entregas" desc="«¡Juan David finalizó la tabla de precios! Un aplauso»" checked={draft.groupCelebrations} onChange={(v) => set({ groupCelebrations: v })} />
          <Setting title="Listas para pruebas" desc="«El guion está listo para pruebas. ¿Quién le echa un ojo?»" checked={draft.groupTesting} onChange={(v) => set({ groupTesting: v })} />
          <Setting title="Cuenta regresiva" desc="«Faltan 5 días para el piloto de Bleepy» (a 30, 14, 7, 5, 3, 2 y 1 día)" checked={draft.groupCountdown} onChange={(v) => set({ groupCountdown: v })} />
          <Setting title="Tareas atrasadas" desc="«Tenemos 10 tareas atrasadas en SST», de lunes a viernes" checked={draft.groupOverdue} onChange={(v) => set({ groupOverdue: v })} />
          <Setting title="Cambios de fase" desc="«¡Bleepy pasó a la fase Lanzamiento!»" checked={draft.groupPhases} onChange={(v) => set({ groupPhases: v })} />
          <Setting title="Pausas" desc="Que el grupo también vea cuando algo se pausa" checked={draft.groupBlockers} onChange={(v) => set({ groupBlockers: v })} />
          <Setting title="Resumen semanal" desc="Cómo vamos en cada proyecto y qué viene" checked={draft.groupWeeklySummary} onChange={(v) => set({ groupWeeklySummary: v })} />
          <div className="fields card-fields">
            <label className="field">
              <span>Hora de los avisos del día</span>
              <input className="input" type="time" value={draft.groupTime} onChange={(e) => set({ groupTime: e.target.value })} />
            </label>
            <div className="field">
              <span>Probar</span>
              <button type="button" className="btn" onClick={() => run('/api/telegram/run-group', 'Avisos del grupo')}>
                <Play size={14} /> Enviar los de hoy
              </button>
            </div>
          </div>
        </Card>

        <section className="panel pad chat-card">
          <div className="panel-head">
            <UserRound size={18} className="acc" />
            <h2>Chat personal</h2>
          </div>
          <Setting
            title="«¿En qué vas a trabajar hoy?»"
            desc="Cada mañana, al empezar el horario de cada quien. La respuesta actualiza la oficina."
            checked={draft.dailyCheckin}
            onChange={(v) => set({ dailyCheckin: v })}
          />
          <Setting title="Tareas por vencer" desc="Lo que vence hoy o mañana y lo que venció ayer, con botones para responder" checked={draft.dueReminders} onChange={(v) => set({ dueReminders: v })} />
          <Setting title="Cuando alguien te necesita" desc="Si una tarea se pausa esperándote, te avisa al instante" checked={draft.blockerAlerts} onChange={(v) => set({ blockerAlerts: v })} />
          <div className="fields card-fields">
            <label className="field">
              <span>Hora de los recordatorios</span>
              <input className="input" type="time" value={draft.dueTime} onChange={(e) => set({ dueTime: e.target.value })} />
            </label>
            <label className="field">
              <span>Máximo al día</span>
              <input className="input" type="number" min={1} max={10} value={draft.maxDaily} onChange={(e) => set({ maxDaily: Number(e.target.value) })} />
            </label>
          </div>
          <div className="row wrap card-actions">
            <button type="button" className="btn sm" onClick={() => run('/api/telegram/run-checkin', 'Pregunta del día')}>
              <Play size={13} /> Pruébala conmigo
            </button>
            <button type="button" className="btn sm" onClick={() => run('/api/telegram/run-reminders', 'Recordatorios')}>
              <Play size={13} /> Enviar recordatorios
            </button>
          </div>

          <div className="card-split" />
          <div className="panel-head">
            <CalendarHeart size={18} className="acc" />
            <h2>Repaso semanal</h2>
          </div>
          <Setting
            title="Activado"
            desc="Resumen en el grupo, repaso por privado con cada quien y tu resumen como responsable general."
            checked={draft.weeklyEnabled}
            onChange={(v) => set({ weeklyEnabled: v })}
          />
          <div className="fields card-fields">
            <label className="field">
              <span>Día</span>
              <select className="select" value={draft.weeklyDay} onChange={(e) => set({ weeklyDay: Number(e.target.value) })}>
                {weekdays.map((d, i) => (
                  <option key={d} value={i}>
                    {d}
                  </option>
                ))}
              </select>
            </label>
            <label className="field">
              <span>Hora</span>
              <input className="input" type="time" value={draft.weeklyTime} onChange={(e) => set({ weeklyTime: e.target.value })} />
            </label>
            <label className="field full">
              <span>Responsable general (recibe el resumen y las pausas)</span>
              <select className="select" value={draft.ceoId} onChange={(e) => set({ ceoId: e.target.value })}>
                {Object.values(members).map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.name} · {m.role}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <div className="row wrap card-actions">
            <button type="button" className="btn sm" onClick={() => run('/api/telegram/run-weekly', 'Repaso semanal')}>
              <Play size={13} /> Enviar ahora
            </button>
          </div>
        </section>

        <section className="panel pad activity">
          <div className="panel-head">
            <MessageCircle size={18} className="acc" />
            <h2>Lo que ha dicho el bot</h2>
            <span className="grow" />
            <div className="seg" role="group" aria-label="Chat">
              <button type="button" aria-pressed={feed === 'grupo'} onClick={() => setFeed('grupo')}>
                Equipo
              </button>
              <button type="button" aria-pressed={feed === 'privado'} onClick={() => setFeed('privado')}>
                Personal
              </button>
            </div>
          </div>
          <div className="feed-scroll">
            {grouped.length === 0 && (
              <div className="feed-empty">
                <MessagesSquare aria-hidden />
                <Empty>{feed === 'grupo' ? 'Todavía no hay avisos en el grupo.' : 'Todavía no hay mensajes personales.'}</Empty>
              </div>
            )}
            {grouped.map((g) => (
              <div key={g.day} className="feed-day">
                <span className="feed-date">{g.day === today ? 'Hoy' : fmtDay(g.day)}</span>
                <ul className="feed">
                  {g.items.map((c) => {
                    const meta = KIND[c.kind] ?? { icon: MessageCircle, label: 'Mensaje' }
                    const Icon = meta.icon
                    const who = c.memberId ? members[c.memberId] : undefined
                    return (
                      <li key={c.id}>
                        <span className="feed-ico">
                          <Icon size={15} />
                        </span>
                        <div className="grow">
                          <span className="feed-text">{c.answer && c.kind === 'respuesta' ? `${who?.name ?? 'Alguien'} respondió: ${c.answer}` : c.text}</span>
                          <span className="feed-meta">
                            {meta.label} · {new Date(c.at).toLocaleTimeString('es-CO', { hour: 'numeric', minute: '2-digit' })}
                          </span>
                        </div>
                        {who && <MemberHead member={who} size={24} />}
                      </li>
                    )
                  })}
                </ul>
              </div>
            ))}
          </div>
        </section>
      </div>

      <section className="panel pad talk">
        <div className="panel-head">
          <Bot size={18} className="acc" />
          <h2>Así le puedes escribir</h2>
        </div>
        <ul className="say">
          {[
            '¿Qué tengo hoy?',
            'Terminé la tabla de precios',
            'Estoy en reunión',
            'Hoy trabajo en el guion del piloto',
            'Pausa el logo porque falta la respuesta de Saray',
            'La landing está lista para pruebas',
            'Mueve la tabla de precios para el viernes',
            'Nueva tarea: llamar a la tercera empresa el jueves',
            '¿Cómo va el equipo?',
            'Terminé por hoy',
          ].map((s) => (
            <li key={s}>«{s}»</li>
          ))}
        </ul>
        <p className="small muted cmds">Si prefieres comandos: /hoy · /semana · /pendientes · /estado · /tarea · /nueva · /equipo · /resumen · /silencio 2 · /ayuda</p>
      </section>

      {dirty && (
        <div className="save-bar" role="region" aria-label="Cambios sin guardar">
          <span>Tienes cambios sin guardar en los avisos.</span>
          <button type="button" className="btn ghost" onClick={() => setDraft(tg.settings)}>
            Descartar
          </button>
          <button type="button" className="btn primary" onClick={save}>
            Guardar cambios
          </button>
        </div>
      )}

    </div>
  )
}
