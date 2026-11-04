import type { Project, Theme } from '../types'
import { BLEEPY_COMET, BLEEPY_MARK, BLEEPY_STAR } from './brandPaths'

/** Isotipo de Liiot (del brandbook de Liiot). */
export function Isotipo({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="56 20 80 154" aria-hidden="true" fill="currentColor">
      <path d="M94.65,148.81l.1-83.16c0-3.67-4.17-5.77-7.08-3.55-8.65,6.57-17.3,13.13-25.95,19.7-1.1.84-1.75,2.14-1.76,3.53-.09,26.84-.19,53.68-.28,80.52-.01,3.53,3.88,5.67,6.82,3.74,8.71-5.69,17.43-11.37,26.14-17.06,1.25-.82,2.01-2.22,2.01-3.73" />
      <path d="M97.86,45.02l-.1,83.16c0,3.67,4.17,5.77,7.08,3.55,8.65-6.57,17.3-13.13,25.95-19.7,1.1-.84,1.75-2.14,1.76-3.53.09-26.84.19-53.68.28-80.52.01-3.53-3.88-5.67-6.82-3.74-8.71,5.69-17.43,11.37-26.14,17.06-1.25.82-2.01,2.22-2.01,3.73" />
      <path d="M132.57,152.85c0,9.17-7.55,16.6-16.86,16.6s-17.68-7.79-17.68-17.4v-16.02h17.45c9.44,0,17.1,7.54,17.1,16.83" />
      <path d="M59.94,40.98c0-9.17,7.55-16.6,16.86-16.6s17.68,7.79,17.68,17.4v16.03h-17.45c-9.44,0-17.1-7.54-17.1-16.83" />
    </svg>
  )
}

function Paths({ shape, className }: { shape: { viewBox: string; paths: string[] }; className?: string }) {
  return (
    <svg className={className} viewBox={shape.viewBox} aria-hidden="true" fill="currentColor">
      {shape.paths.map((d, i) => (
        <path key={i} d={d} />
      ))}
    </svg>
  )
}

/** La «B» de Bleepy con sus estelas de cometa y la estrella. */
export const BleepyMark = ({ className }: { className?: string }) => <Paths shape={BLEEPY_MARK} className={className} />
export const BleepyComet = ({ className }: { className?: string }) => <Paths shape={BLEEPY_COMET} className={className} />
export const BleepyStar = ({ className }: { className?: string }) => <Paths shape={BLEEPY_STAR} className={className} />

/** La estrella de Bleepy en «gradient map» (amarillo → naranja → rojo → azul); el CSS la difumina. Solo se ve en Bleepy. */
export function ThermalStar({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox={BLEEPY_STAR.viewBox} aria-hidden="true">
      <defs>
        <radialGradient id="bleepy-thermal" cx="50%" cy="52%" r="58%">
          <stop offset="0%" stopColor="#ffd37a" />
          <stop offset="26%" stopColor="#f36f2b" />
          <stop offset="50%" stopColor="#d6453a" />
          <stop offset="76%" stopColor="#3061ad" />
          <stop offset="100%" stopColor="#658db9" />
        </radialGradient>
      </defs>
      {BLEEPY_STAR.paths.map((d, i) => (
        <path key={i} d={d} fill="url(#bleepy-thermal)" />
      ))}
    </svg>
  )
}

export function WorldLogo({ theme, className }: { theme: Theme; className?: string }) {
  return theme === 'bleepy' ? <BleepyMark className={className} /> : <Isotipo className={className} />
}

/** Iniciales para los proyectos sin logo propio. */
export function initials(name: string) {
  const words = name.split(/\s+/).filter(Boolean)
  return (words.length > 1 ? words[0][0] + words[1][0] : name.slice(0, 2)).toUpperCase()
}

export function ProjectMark({ project, className }: { project: Pick<Project, 'theme' | 'name' | 'color'>; className?: string }) {
  if (project.theme === 'bleepy') return <BleepyMark className={className} />
  return (
    <span className={`mark-initials ${className ?? ''}`} style={{ ['--pc' as string]: project.color }}>
      {initials(project.name)}
    </span>
  )
}

/** Fondo vivo: aurora de Liiot o cielo con estrellas y estelas de Bleepy. */
export function Background({ theme = 'liiot' }: { theme?: Theme }) {
  return (
    <>
      <div className={`bg bg-${theme}`} aria-hidden="true">
        <i className="b1" />
        <i className="b2" />
        <i className="b3" />
        <i className="ribbon" />
        <i className="ribbon r2" />
        {theme === 'bleepy' && (
          <>
            <i className="stars s1" />
            <i className="stars s2" />
            <i className="streak k1" />
            <i className="streak k2" />
          </>
        )}
      </div>
      <div className="grain" aria-hidden="true" />
    </>
  )
}
