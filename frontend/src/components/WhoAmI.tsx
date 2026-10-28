import { useMembers } from '../api'
import { usePrefs } from '../prefs'
import { Avatar } from './Avatar'
import { Background, Isotipo } from './Shell'

/** Primera vez en este navegador: elegir quién eres (HQ corre en local, sin contraseñas). */
export function WhoAmI() {
  const { setMe } = usePrefs()
  const { data: members, isError } = useMembers()
  return (
    <>
      <Background />
      <main className="whoami">
        <section className="panel edge whoami-card">
          <div className="rail-logo" style={{ margin: '0 auto' }}>
            <Isotipo />
          </div>
          <p className="eyebrow" style={{ justifyContent: 'center', marginTop: 16 }}>
            Liiot HQ
          </p>
          <h1>¿Quién está entrando?</h1>
          <p className="muted">Tu espacio, tus pendientes y tu avatar. Puedes cambiarlo luego en Ajustes.</p>
          {isError && <p style={{ color: 'var(--bad)', marginTop: 16 }}>No hay conexión con el backend. Revisa que HQ esté corriendo en el puerto 8000.</p>}
          <div className="whoami-grid">
            {members?.map((m) => (
              <button key={m.id} type="button" onClick={() => setMe(m.id)}>
                <Avatar avatar={m.avatar} color={m.color} variant="full" size={110} title={m.name} />
                <b>{m.name}</b>
                <span className="muted">
                  {m.role} · {m.area}
                </span>
              </button>
            ))}
          </div>
        </section>
      </main>
    </>
  )
}
