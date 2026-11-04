import { useUI } from '../ui'
import { Isotipo, ProjectMark } from './Brand'

/** Animación al entrar a un proyecto (la carpeta se abre y llena la pantalla) o al volver a Liiot. */
export function WorldTransition() {
  const { travel } = useUI()
  if (!travel) return null
  const { project, from } = travel
  const style: Record<string, string> = {}
  if (from) {
    style['--fx'] = `${from.x}px`
    style['--fy'] = `${from.y}px`
    style['--fw'] = `${from.w}px`
    style['--fh'] = `${from.h}px`
  }
  return (
    <div
      key={travel.id}
      className={`travel ${project ? 'enter' : 'leave'} theme-${project?.theme ?? 'liiot'}${from ? ' from-rect' : ''}`}
      style={{ ...style, ['--pc' as string]: project?.color ?? '#8b45cc' }}
      aria-hidden="true"
    >
      <div className="travel-sky">
        <i className="t-stars" />
        <i className="t-glow" />
      </div>
      <div className="travel-mark">
        <span className="travel-logo">{project ? <ProjectMark project={project} /> : <Isotipo />}</span>
        <b>{project ? project.name : 'Liiot'}</b>
        <small>{project ? 'Entrando al proyecto' : 'Volviendo a la empresa'}</small>
      </div>
    </div>
  )
}
