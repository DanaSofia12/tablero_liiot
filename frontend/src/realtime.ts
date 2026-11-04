import { useEffect, useRef, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { qk } from './api'

type Message =
  | { type: 'changed'; scope: string; taskId?: number }
  | { type: 'celebrate'; taskId: number; memberId: string | null; taskKey: string | null; taskTitle: string | null }

const SCOPES: Record<string, (readonly string[])[]> = {
  tasks: [qk.tasks, qk.metrics, qk.presence, qk.phases, qk.events, qk.checkins, qk.projects, qk.project, qk.team],
  rubric: [qk.rubric, qk.phases, qk.metrics],
  members: [qk.members, qk.presence, qk.telegram, qk.accounts, qk.auth],
  project: [qk.projects, qk.project, qk.metrics, qk.tasks, qk.phases, qk.rubric, qk.presence, qk.team],
  settings: [qk.telegram],
  checkins: [qk.checkins, qk.events],
  vault: [qk.vault],
}

/** Conexión en vivo con el servidor: cada cambio (web, Telegram u Obsidian) refresca lo que corresponde. */
export function useLive(onCelebrate: (memberId: string | null, title: string | null) => void) {
  const qc = useQueryClient()
  const [connected, setConnected] = useState(false)
  const celebrate = useRef(onCelebrate)
  celebrate.current = onCelebrate

  useEffect(() => {
    let ws: WebSocket | null = null
    let retry: number | undefined
    let alive = true

    const connect = () => {
      const proto = location.protocol === 'https:' ? 'wss' : 'ws'
      ws = new WebSocket(`${proto}://${location.host}/ws`)
      ws.onopen = () => setConnected(true)
      ws.onclose = (event) => {
        setConnected(false)
        if (event.code === 4401) {
          qc.invalidateQueries({ queryKey: qk.auth }) // la sesión terminó: de vuelta a la pantalla de entrada
          return
        }
        if (alive) retry = window.setTimeout(connect, 2500)
      }
      ws.onerror = () => ws?.close()
      ws.onmessage = (event) => {
        let msg: Message
        try {
          msg = JSON.parse(event.data) as Message
        } catch {
          return
        }
        if (msg.type === 'changed') {
          for (const key of SCOPES[msg.scope] ?? [qk.tasks]) qc.invalidateQueries({ queryKey: key })
        } else if (msg.type === 'celebrate') {
          celebrate.current(msg.memberId, msg.taskTitle)
          window.dispatchEvent(new CustomEvent('hq:celebrate', { detail: msg }))
        }
      }
    }

    connect()
    const ping = window.setInterval(() => {
      if (ws?.readyState === WebSocket.OPEN) ws.send('ping')
    }, 25_000)
    return () => {
      alive = false
      window.clearInterval(ping)
      window.clearTimeout(retry)
      ws?.close()
    }
  }, [qc])

  return connected
}
