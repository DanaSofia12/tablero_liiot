import { useEffect, useState } from 'react'
import { Bot, CalendarClock, Copy, ExternalLink, Play, RefreshCw, Send, Users } from 'lucide-react'
import { api, qk, useCatalog, useCheckins, useRefresh, useTelegram, useTasks } from '../api'
import { Empty, MemberHead, Panel, Toggle, useMemberMap } from '../components/bits'
import { fmtMoment } from '../lib/format'
import { useUI } from '../ui'
import type { TelegramSettings } from '../types'

const KIND_LABEL: Record<string, string> = {
  semanal: 'Ritual semanal',
  vencimiento: 'Recordatorio de vencimiento',
  bloqueo: 'Alerta de bloqueo',
  manual: 'Seguimiento a pedido',
  resumen: 'Resumen al grupo',
  respuesta: 'Respuesta',
}

/** Campo para pegar el token de BotFather: HQ lo valida con Telegram y reinicia el bot sin cerrar nada. */
function TokenForm({ onDone }: { onDone: () => void }) {
  const { toast } = useUI()
  const [token, setToken] = useState('')
  const [busy, setBusy] = useState(false)
  return (
    <form
      className="row"
      style={{ gap: 8, marginTop: 12 }}
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
      <input
        className="input"
        type="password"
        autoComplete="off"
        spellCheck={false}
        value={token}
        onChange={(e) => setToken(e.target.value)}
        placeholder="Pega aquí el token de BotFather"
        aria-label="Token del bot de Telegram"
      />
      <button type="submit" className="btn primary" disabled={!token.trim() || busy}>
        {busy ? 'Probando…' : 'Conectar'}
      </button>
    </form>
  )
}

export default function FollowupPage() {
  const tg = useTelegram().data
  const checkins = useCheckins().data ?? []
  const tasks = useTasks().data ?? []
  const weekdays = useCatalog().data?.weekdays ?? ['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado', 'Domingo']
  const members = useMemberMap()
  const refresh = useRefresh()
  const { toast } = useUI()
  const [draft, setDraft] = useState<TelegramSettings | null>(null)

  useEffect(() => {
    if (tg && !draft) setDraft(tg.settings)
  }, [tg, draft])

  if (!tg || !draft) return <div className="page"><Empty>Cargando Telegram…</Empty></div>
  const { status } = tg
  const dirty = JSON.stringify(draft) !== JSON.stringify(tg.settings)

  const save = async (patch: Partial<TelegramSettings> = {}) => {
    try {
      const saved = await api.patch<TelegramSettings>('/api/telegram/settings', { ...draft, ...patch })
      setDraft(saved)
      refresh(qk.telegram)
      toast('Reglas de Telegram guardadas')
    } catch (e) {
      toast((e as Error).message, 'bad')
    }
  }
  const run = async (path: string, label: string) => {
    const res = await api.post<{ ok: boolean; reason?: string; sent?: number; members?: number }>(path)
    toast(res.ok ? `${label}: enviado` : res.reason ?? 'El bot no está activo', res.ok ? 'ok' : 'info')
    refresh(qk.checkins)
  }
  const copy = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text)
      toast('Copiado')
    } catch {
      toast(text, 'info')
    }
  }
  const nextWeekly = status.nextWeekly ? new Date(status.nextWeekly) : null

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <p className="eyebrow">Telegram · grupo del equipo y chats privados</p>
          <h1>Seguimiento</h1>
          <p>
            Cada {weekdays[draft.weeklyDay].toLowerCase()} a las {draft.weeklyTime} el bot manda el resumen al grupo y pregunta por privado a cada persona por sus tareas.
            Las respuestas con botones actualizan HQ al instante.
          </p>
        </div>
        <span className="grow" />
        <span className={`chip`} style={{ height: 30, color: status.running ? 'var(--ok)' : 'var(--ink-3)' }}>
          <i className={`dot${status.running ? ' on' : ''}`} /> {status.running ? `Bot activo · @${status.botUsername}` : status.tokenConfigured ? 'Bot con error' : 'Bot sin configurar'}
        </span>
      </div>

      <div className="follow-grid">
        <div className="stack" style={{ gap: 16 }}>
          {status.running ? (
            <Panel title="Bot conectado" icon={<Bot size={18} style={{ color: 'var(--ok)' }} />}>
              <p style={{ fontSize: 13.5 }}>
                Tu bot es <b>@{status.botUsername}</b>. Sigue los pasos 4 y 5 de abajo si alguien todavía no lo vinculó.
              </p>
              <div className="row" style={{ marginTop: 10 }}>
                <a className="btn sm" href={`https://t.me/${status.botUsername}`} target="_blank" rel="noreferrer">
                  <ExternalLink size={14} /> Abrir el bot en Telegram
                </a>
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
              </div>
            </Panel>
          ) : (
            <Panel title="Activar el bot (una vez, gratis)" icon={<Bot size={18} style={{ color: 'var(--acc)' }} />}>
              {status.error && <p style={{ color: 'var(--bad)', marginBottom: 10, fontSize: 13 }}>Error de Telegram: {status.error}</p>}
              <ol className="steps">
                <li>
                  <span>
                    En Telegram, busca <b>@BotFather</b> (el que tiene la insignia azul), escribe <code>/newbot</code>, ponle un nombre (por ejemplo <b>Liiot HQ</b>) y
                    un usuario que termine en <code>bot</code> (por ejemplo <code>liiot_hq_bot</code>).
                  </span>
                </li>
                <li>
                  <span>BotFather te responde con un token largo, algo como <code>1234567890:AAH…</code>. Cópialo completo.</span>
                </li>
                <li>
                  <span>Pégalo aquí y toca «Conectar». HQ lo prueba con Telegram y lo guarda solo en este PC (archivo .env).</span>
                </li>
              </ol>
              <TokenForm
                onDone={() => {
                  refresh(qk.telegram)
                  toast('¡Bot conectado! Ahora vincula a cada persona con su enlace.', 'party')
                }}
              />
              <p className="muted" style={{ fontSize: 12, marginTop: 8 }}>
                El bot funciona mientras HQ esté abierto en este PC. No compartas el token: quien lo tenga puede hablar como tu bot.
              </p>
            </Panel>
          )}
          <Panel title="Vincular al equipo">
            <ol className="steps" style={{ counterReset: 's 3' }}>
              <li>
                <span>Cada persona abre su enlace (en «Personas», justo abajo) y toca «Iniciar». Telegram no deja que un bot escriba primero.</span>
              </li>
              <li>
                <span>
                  Agrega el bot al grupo del equipo y escribe <code>/vincular_grupo</code> en ese grupo. Ahí llegan el resumen de los sábados y las celebraciones.
                </span>
              </li>
            </ol>
          </Panel>

          <Panel title="Personas" icon={<Users size={18} style={{ color: 'var(--acc)' }} />}>
            {status.members.map((sm) => {
              const m = members[sm.id]
              return (
                <div key={sm.id} className="link-row">
                  <MemberHead member={m} size={34} />
                  <div className="grow">
                    <b>{m?.name}</b>
                    <div className="muted" style={{ fontSize: 12 }}>
                      {sm.linked ? `Vinculado${sm.username ? ` · @${sm.username}` : ''}` : `Sin vincular · código ${sm.code}`}
                    </div>
                  </div>
                  {sm.deepLink && !sm.linked && (
                    <>
                      <button type="button" className="btn sm" onClick={() => copy(sm.deepLink!)}>
                        <Copy size={13} /> Copiar enlace
                      </button>
                      <a className="btn sm" href={sm.deepLink} target="_blank" rel="noreferrer">
                        <ExternalLink size={13} /> Abrir
                      </a>
                    </>
                  )}
                  {!sm.deepLink && !sm.linked && (
                    <button type="button" className="btn sm" onClick={() => copy(`/start ${sm.code}`)}>
                      <Copy size={13} /> /start {sm.code}
                    </button>
                  )}
                  {sm.linked && (
                    <button
                      type="button"
                      className="btn sm ghost"
                      onClick={async () => {
                        await api.post(`/api/members/${sm.id}/telegram/reset`)
                        refresh(qk.telegram, qk.members)
                        toast(`Se desvinculó a ${m?.name}`)
                      }}
                    >
                      <RefreshCw size={13} /> Desvincular
                    </button>
                  )}
                </div>
              )
            })}
            <div className="link-row">
              <span className="orb" style={{ width: 34, height: 34 }} />
              <div className="grow">
                <b>Grupo del equipo</b>
                <div className="muted" style={{ fontSize: 12 }}>
                  {status.group.linked ? `Conectado: ${status.group.title ?? 'grupo'}` : 'Sin conectar · escribe /vincular_grupo dentro del grupo'}
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
                  Desconectar
                </button>
              )}
            </div>
          </Panel>

          <Panel title="Mensajes recientes" icon={<Send size={18} style={{ color: 'var(--acc-2)' }} />}>
            {checkins.length === 0 && <Empty>Todavía no hay mensajes. Cuando el bot esté activo, aquí verás cada pregunta y respuesta.</Empty>}
            <ul className="feed">
              {checkins.slice(0, 25).map((c) => {
                const task = tasks.find((t) => t.id === c.taskId)
                return (
                  <li key={c.id}>
                    <span className="when">{fmtMoment(c.at)}</span>
                    {c.memberId ? <MemberHead member={members[c.memberId]} size={24} /> : <span className="orb" style={{ width: 24, height: 24 }} />}
                    <div className="grow" style={{ minWidth: 0 }}>
                      <b>{KIND_LABEL[c.kind] ?? c.kind}</b> {task && <span className="key">{task.key}</span>}
                      <div className="muted">{c.answer ? `«${c.answer}»` : c.text}</div>
                    </div>
                    <span className="chip">{c.chat}</span>
                  </li>
                )
              })}
            </ul>
          </Panel>
        </div>

        <div className="stack" style={{ gap: 16 }}>
          <Panel title="Ritual semanal" icon={<CalendarClock size={18} style={{ color: 'var(--acc)' }} />}>
            <div className="setting">
              <div className="txt">
                <b>Activado</b>
                <span>Resumen al grupo, check-in privado a cada uno y resumen para Dana.</span>
              </div>
              <Toggle checked={draft.weeklyEnabled} onChange={(v) => setDraft({ ...draft, weeklyEnabled: v })} label="Ritual semanal" />
            </div>
            <div className="fields" style={{ marginTop: 6 }}>
              <label className="field">
                <span>Día</span>
                <select className="select" value={draft.weeklyDay} onChange={(e) => setDraft({ ...draft, weeklyDay: Number(e.target.value) })}>
                  {weekdays.map((d, i) => (
                    <option key={d} value={i}>
                      {d}
                    </option>
                  ))}
                </select>
              </label>
              <label className="field">
                <span>Hora (Colombia)</span>
                <input className="input" type="time" value={draft.weeklyTime} onChange={(e) => setDraft({ ...draft, weeklyTime: e.target.value })} />
              </label>
            </div>
            {nextWeekly && (
              <p className="muted" style={{ fontSize: 12.5, marginTop: 10 }}>
                Próximo: {nextWeekly.toLocaleString('es-CO', { weekday: 'long', day: 'numeric', month: 'long', hour: 'numeric', minute: '2-digit' })}
              </p>
            )}
            <div className="row" style={{ marginTop: 12 }}>
              <button type="button" className="btn primary" disabled={!dirty} onClick={() => save()}>
                Guardar cambios
              </button>
              <button type="button" className="btn" onClick={() => run('/api/telegram/run-weekly', 'Ritual semanal')}>
                <Play size={14} /> Enviar ahora
              </button>
            </div>
          </Panel>

          <Panel title="Avisos automáticos">
            {(
              [
                ['dueReminders', 'Recordatorios de vencimiento', 'Lo que vence hoy o mañana y lo que venció ayer, por privado.'],
                ['blockerAlerts', 'Alertas de bloqueo', 'Aviso inmediato a Dana y a quien puede desbloquear.'],
                ['groupWeeklySummary', 'Resumen semanal en el grupo', 'Indicadores, bloqueos y lo que viene.'],
                ['groupCelebrations', 'Celebraciones en el grupo', 'Cuando alguien termina una tarea.'],
                ['groupBlockers', 'Bloqueos también en el grupo', 'Si prefieren que todos vean los bloqueos.'],
              ] as const
            ).map(([key, title, desc]) => (
              <div key={key} className="setting">
                <div className="txt">
                  <b>{title}</b>
                  <span>{desc}</span>
                </div>
                <Toggle checked={draft[key]} onChange={(v) => setDraft({ ...draft, [key]: v })} label={title} />
              </div>
            ))}
            <div className="fields" style={{ marginTop: 6 }}>
              <label className="field">
                <span>Hora de recordatorios</span>
                <input className="input" type="time" value={draft.dueTime} onChange={(e) => setDraft({ ...draft, dueTime: e.target.value })} />
              </label>
              <label className="field">
                <span>Máx. mensajes por persona al día</span>
                <input className="input" type="number" min={1} max={10} value={draft.maxDaily} onChange={(e) => setDraft({ ...draft, maxDaily: Number(e.target.value) })} />
              </label>
              <label className="field full">
                <span>Responsable general (recibe alertas y resúmenes)</span>
                <select className="select" value={draft.ceoId} onChange={(e) => setDraft({ ...draft, ceoId: e.target.value })}>
                  {Object.values(members).map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.name} · {m.role}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            <div className="row" style={{ marginTop: 12 }}>
              <button type="button" className="btn primary" disabled={!dirty} onClick={() => save()}>
                Guardar cambios
              </button>
              <button type="button" className="btn" onClick={() => run('/api/telegram/run-reminders', 'Recordatorios')}>
                <Play size={14} /> Probar recordatorios
              </button>
            </div>
          </Panel>

          <Panel title="Comandos del bot">
            <div className="stack" style={{ gap: 6, fontSize: 13 }}>
              {[
                ['/hoy', 'tus tareas de hoy y lo vencido'],
                ['/semana', 'lo que vence en 7 días'],
                ['/pendientes', 'todas tus tareas abiertas'],
                ['/estado BLP-3', 'ver y actualizar una tarea'],
                ['/nueva texto', 'crear una tarea a tu nombre'],
                ['/equipo', 'qué está haciendo cada quien'],
                ['/resumen', 'indicadores del proyecto'],
                ['/silencio 2', 'pausar avisos por 2 horas'],
              ].map(([cmd, desc]) => (
                <div key={cmd} className="row">
                  <code className="mono" style={{ width: 120 }}>
                    {cmd}
                  </code>
                  <span className="muted">{desc}</span>
                </div>
              ))}
            </div>
          </Panel>
        </div>
      </div>
    </div>
  )
}
