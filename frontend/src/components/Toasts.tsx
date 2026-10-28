import { CircleAlert, CircleCheck, Info, PartyPopper, X } from 'lucide-react'
import { useUI } from '../ui'

const ICONS = { ok: CircleCheck, bad: CircleAlert, info: Info, party: PartyPopper }

export function Toasts() {
  const { toasts, dismiss } = useUI()
  return (
    <div className="toasts" aria-live="polite">
      {toasts.map((t) => {
        const Icon = ICONS[t.tone]
        return (
          <div key={t.id} className={`toast ${t.tone}`} role="status">
            <Icon size={18} style={{ color: t.tone === 'bad' ? 'var(--bad)' : 'var(--acc)' }} />
            <span className="grow">{t.text}</span>
            <button type="button" className="btn icon sm ghost" onClick={() => dismiss(t.id)} aria-label="Cerrar aviso">
              <X size={14} />
            </button>
          </div>
        )
      })}
    </div>
  )
}
