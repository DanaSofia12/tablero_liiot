import type { AvatarCfg, HairStyle } from '../types'

export type Mood = 'smile' | 'open' | 'flat' | 'sleep'

/*
 * Cabello en capas, siempre un poco más grande que la cabeza (círculo de radio 15.5 en 0,-46):
 * atrás (detrás de la cabeza), adelante (casquete que baja por los lados y enmarca la cara) y mechones.
 * Así nunca se ve piel en las sienes.
 */
const HAIR_BACK: Partial<Record<HairStyle, string>> = {
  wolf: 'M-18.4,-48 C-20.4,-67 20.4,-67 18.4,-48 L19.8,-31 L21.6,-17 L17.4,-20 L16,-9 L11.2,-15 L6.6,-11 L0,-14 L-6.6,-11 L-11.2,-15 L-16,-9 L-17.4,-20 L-21.6,-17 L-19.8,-31 Z',
  long: 'M-18.4,-48 C-20.4,-67 20.4,-67 18.4,-48 L19.6,-14 C10,-9.5 -10,-9.5 -19.6,-14 Z',
  bowl: 'M-18.4,-46 C-20.4,-67 20.4,-67 18.4,-46 L18.2,-34.5 C12,-31 -12,-31 -18.2,-34.5 Z',
  wavy: 'M-17.4,-47 C-19.4,-65 19.4,-65 17.4,-47 L16.8,-39 C10,-36.5 -10,-36.5 -16.8,-39 Z',
  short: 'M-17.2,-47 C-19.2,-64 19.2,-64 17.2,-47 L16.6,-40 C10,-37.5 -10,-37.5 -16.6,-40 Z',
  bun: 'M-17.2,-47 C-19.2,-64 19.2,-64 17.2,-47 L16.6,-40 C10,-37.5 -10,-37.5 -16.6,-40 Z',
}

/** Contorno de arriba: de la mandíbula izquierda, por encima de la cabeza, a la derecha. */
const cap = (bottom: number) =>
  `M-17.3,${bottom} C-18.7,${bottom - 6} -18.8,-53 -15.4,-59.2 C-12.1,-64.6 -6.6,-66.4 0,-66.4 C6.6,-66.4 12.1,-64.6 15.4,-59.2 C18.8,-53 18.7,${bottom - 6} 17.3,${bottom}`

const HAIR_FRONT: Record<HairStyle, string> = {
  // flequillo cortina abierto al centro; los lados bajan enmarcando la cara
  wolf:
    cap(-37.5) +
    ' L13.5,-37.5 C13.8,-43 13.3,-47.6 11.9,-50.7 C9.9,-54.3 5.7,-55.4 1.5,-58.5 C1,-56.6 0.5,-55.7 0,-55.3 C-0.5,-55.7 -1,-56.6 -1.5,-58.5 C-5.7,-55.4 -9.9,-54.3 -11.9,-50.7 C-13.3,-47.6 -13.8,-43 -13.5,-37.5 Z',
  // raya al medio, sin flequillo
  long:
    cap(-37.5) +
    ' L13.5,-37.5 C14,-45 13.4,-51.5 10.4,-55.6 C7.6,-59.2 3.6,-60.2 1,-61 C0.6,-59.6 0.3,-59 0,-58.8 C-0.3,-59 -0.6,-59.6 -1,-61 C-3.6,-60.2 -7.6,-59.2 -10.4,-55.6 C-13.4,-51.5 -14,-45 -13.5,-37.5 Z',
  // flequillo recto hasta las cejas
  bowl:
    cap(-38.5) +
    ' L14.2,-38.5 C14.6,-43.5 14.4,-47.4 13.4,-49.8 L11,-49 L8.5,-50.3 L5.6,-49.2 L2.7,-50.4 L0,-49.3 L-2.7,-50.4 L-5.6,-49.2 L-8.5,-50.3 L-11,-49 L-13.4,-49.8 C-14.4,-47.4 -14.6,-43.5 -14.2,-38.5 Z',
  // corto ondulado: rizos sobre la frente
  wavy:
    cap(-41) +
    ' L15.2,-41 C15.4,-45.5 14.8,-49.4 13.4,-51.4 C12.4,-49.6 10.6,-49.2 9.6,-51.6 C8.6,-49 5.6,-48.6 4.6,-51.8 C3.4,-49.2 0.4,-49.4 -0.4,-52.2 C-1.8,-49.6 -4.8,-49.6 -5.6,-52.4 C-7,-50 -9.8,-50.2 -10.4,-52.6 C-11.6,-50.6 -13.4,-50.2 -14,-50.8 C-15,-48.6 -15.4,-45.2 -15.2,-41 Z',
  // corto con flequillo de lado
  short:
    cap(-41.5) +
    ' L15.3,-41.5 C15.5,-46 15,-49.6 13.8,-51.8 C11.6,-53.6 7.6,-54.6 3,-54.4 C-1.6,-54.2 -6,-52.6 -9.6,-51.4 C-12,-50.6 -14.2,-48.6 -15,-46 C-15.4,-44.6 -15.4,-43 -15.3,-41.5 Z',
  bun:
    cap(-41.5) +
    ' L15.3,-41.5 C15.5,-46 15,-49.6 13.8,-51.8 C11.6,-53.6 7.6,-54.6 3,-54.4 C-1.6,-54.2 -6,-52.6 -9.6,-51.4 C-12,-50.6 -14.2,-48.6 -15,-46 C-15.4,-44.6 -15.4,-43 -15.3,-41.5 Z',
}

/** Mechones largos que caen por delante de los hombros. */
const LOCKS: Partial<Record<HairStyle, string>> = {
  wolf:
    'M17.3,-37.6 C17.9,-32 17.7,-27 16.6,-22 L15,-24.2 L13.9,-21 C14,-26.4 14,-32 13.5,-37.6 Z M-17.3,-37.6 C-17.9,-32 -17.7,-27 -16.6,-22 L-15,-24.2 L-13.9,-21 C-14,-26.4 -14,-32 -13.5,-37.6 Z',
  long: 'M17.3,-37.6 C17.9,-31 17.8,-24 17,-17.5 C15.8,-17 14.6,-17 13.6,-17.6 C14.1,-24 14,-31 13.5,-37.6 Z M-17.3,-37.6 C-17.9,-31 -17.8,-24 -17,-17.5 C-15.8,-17 -14.6,-17 -13.6,-17.6 C-14.1,-24 -14,-31 -13.5,-37.6 Z',
}

const EDGE = 'rgba(30,14,48,.42)'

function Face({ a, mood }: { a: AvatarCfg; mood: Mood }) {
  const showBrows = a.hair !== 'bowl'
  return (
    <g>
      {mood === 'sleep' ? (
        <g fill="none" stroke={a.eyes} strokeWidth={1.3} strokeLinecap="round">
          <path d="M-8,-44.2 q2.4,2 4.8,0" />
          <path d="M3.2,-44.2 q2.4,2 4.8,0" />
        </g>
      ) : (
        <g>
          <ellipse cx={-5.6} cy={-44.6} rx={2.15} ry={2.75} fill={a.eyes} />
          <ellipse cx={5.6} cy={-44.6} rx={2.15} ry={2.75} fill={a.eyes} />
          <circle cx={-4.9} cy={-45.6} r={0.85} fill="#fff" />
          <circle cx={6.3} cy={-45.6} r={0.85} fill="#fff" />
          {a.lashes && (
            <g stroke={a.eyes} strokeWidth={1.1} strokeLinecap="round">
              <path d="M-7.6,-46.4 l-1.7,-1.3" />
              <path d="M7.6,-46.4 l1.7,-1.3" />
            </g>
          )}
        </g>
      )}
      {showBrows && (
        <g fill="none" stroke={a.hairColor} strokeWidth={1.25} strokeLinecap="round" opacity={0.9}>
          <path d={mood === 'flat' ? 'M-8.2,-50.6 q2.4,0.8 4.6,-0.6' : 'M-8.2,-50.4 q2.4,-1.3 4.6,0'} />
          <path d={mood === 'flat' ? 'M3.6,-51.2 q2.2,1.4 4.6,0.6' : 'M3.6,-50.4 q2.2,-1.3 4.6,0'} />
        </g>
      )}
      <ellipse cx={-9.8} cy={-39.6} rx={3} ry={1.7} fill="rgba(255,105,140,.36)" />
      <ellipse cx={9.8} cy={-39.6} rx={3} ry={1.7} fill="rgba(255,105,140,.36)" />
      {mood === 'open' ? (
        <path d="M-3,-38.9 q3,4.8 6,0 z" fill="#7a2f3b" />
      ) : mood === 'flat' || mood === 'sleep' ? (
        <path d="M-2.4,-37.4 q2.4,-1.4 4.8,0" fill="none" stroke="#7a3b3b" strokeWidth={1.3} strokeLinecap="round" />
      ) : a.lips ? (
        <path d="M-2.9,-38.7 q2.9,2.7 5.8,0 q-2.9,1 -5.8,0 z" fill={a.lips} />
      ) : (
        <path d="M-2.6,-38.5 q2.6,2.4 5.2,0" fill="none" stroke="#7a3b3b" strokeWidth={1.3} strokeLinecap="round" />
      )}
      {a.glasses && (
        <g>
          <circle cx={-5.8} cy={-44.5} r={4.9} fill="rgba(255,255,255,.14)" stroke="#191020" strokeWidth={1.5} />
          <circle cx={5.8} cy={-44.5} r={4.9} fill="rgba(255,255,255,.14)" stroke="#191020" strokeWidth={1.5} />
          <path d="M-0.9,-45.2 Q0,-46.4 0.9,-45.2 M-10.7,-45.4 L-15.3,-46.6 M10.7,-45.4 L15.3,-46.6" fill="none" stroke="#191020" strokeWidth={1.3} />
        </g>
      )}
    </g>
  )
}

function Head({ a, mood }: { a: AvatarCfg; mood: Mood }) {
  const back = HAIR_BACK[a.hair]
  const locks = LOCKS[a.hair]
  return (
    <g>
      {back && <path d={back} fill={a.hairColor} stroke={EDGE} strokeWidth={0.8} strokeLinejoin="round" />}
      {a.hair === 'bun' && <circle cx={0} cy={-67.5} r={6.6} fill={a.hairColor} stroke={EDGE} strokeWidth={0.8} />}
      <rect x={-4} y={-33} width={8} height={5} rx={2} fill={a.skin} />
      <ellipse cx={-15.4} cy={-43.6} rx={2.2} ry={3} fill={a.skin} stroke={EDGE} strokeWidth={0.6} />
      <ellipse cx={15.4} cy={-43.6} rx={2.2} ry={3} fill={a.skin} stroke={EDGE} strokeWidth={0.6} />
      <circle cx={0} cy={-46} r={15.5} fill={a.skin} stroke={EDGE} strokeWidth={0.8} />
      <Face a={a} mood={mood} />
      <path d={HAIR_FRONT[a.hair]} fill={a.hairColor} stroke={EDGE} strokeWidth={0.8} strokeLinejoin="round" />
      {locks && <path d={locks} fill={a.hairColor} stroke={EDGE} strokeWidth={0.7} strokeLinejoin="round" />}
      <path d="M-10.5,-61.4 q6,-3.6 13.5,-2.4" fill="none" stroke="rgba(255,255,255,.2)" strokeWidth={1.4} strokeLinecap="round" />
      {a.hair === 'wavy' && (
        <path d="M-9,-60 q4,-3 8,-0.5 M2,-61.6 q4,-2 7,0.5" fill="none" stroke="rgba(255,255,255,.18)" strokeWidth={1.2} strokeLinecap="round" />
      )}
    </g>
  )
}

function Torso({ a }: { a: AvatarCfg }) {
  const outer = a.outer && a.outerStyle !== 'none' ? a.outer : null
  return (
    <g>
      <path
        d="M-12.5,-30.5 Q-12,-32.5 -8.5,-32.5 L8.5,-32.5 Q12,-32.5 12.5,-30.5 L13.5,-11 Q13.5,-8.5 10.5,-8.5 L-10.5,-8.5 Q-13.5,-8.5 -13.5,-11 Z"
        fill={a.top}
        stroke={EDGE}
        strokeWidth={0.8}
      />
      {outer && (
        <g>
          <path d="M-12.6,-31 L-3.4,-31.6 L-2.4,-8.5 L-13.4,-8.5 Q-13.8,-20 -12.6,-31 Z" fill={outer} stroke={EDGE} strokeWidth={0.8} />
          <path d="M12.6,-31 L3.4,-31.6 L2.4,-8.5 L13.4,-8.5 Q13.8,-20 12.6,-31 Z" fill={outer} stroke={EDGE} strokeWidth={0.8} />
          <path d="M-6,-32.6 L-1.4,-26.5 L-3.8,-33.2 Z M6,-32.6 L1.4,-26.5 L3.8,-33.2 Z" fill={outer} stroke={EDGE} strokeWidth={0.6} />
          {a.outerStyle === 'denim' && (
            <path
              d="M-10.5,-24 h6 M4.5,-24 h6 M-9.5,-24 v3 M9.5,-24 v3 M-7.5,-27 v19 M7.5,-27 v19"
              fill="none"
              stroke="rgba(255,255,255,.35)"
              strokeWidth={0.6}
              strokeDasharray="1.2 1"
            />
          )}
        </g>
      )}
      {!outer && <path d="M-4.4,-32.2 Q0,-28.4 4.4,-32.2" fill="none" stroke="rgba(0,0,0,.18)" strokeWidth={1.1} />}
      {a.necklace && (
        <g fill="none" stroke="#dfe3ec" strokeWidth={0.9}>
          <path d="M-5,-31.8 Q0,-29.2 5,-31.8" />
          <path d="M-6.4,-31.2 Q0,-20.5 6.4,-31.2" />
          <circle cx={0} cy={-21.6} r={1.5} fill="#dfe3ec" />
        </g>
      )}
    </g>
  )
}

function Legs() {
  return (
    <g>
      <rect x={-7.4} y={-10} width={6} height={9.5} rx={2.8} fill="#2a2238" />
      <rect x={1.4} y={-10} width={6} height={9.5} rx={2.8} fill="#2a2238" />
      <ellipse cx={-4.4} cy={-0.8} rx={4} ry={2.2} fill="#17111f" />
      <ellipse cx={4.4} cy={-0.8} rx={4} ry={2.2} fill="#17111f" />
    </g>
  )
}

function Arms({ a, raised }: { a: AvatarCfg; raised: boolean }) {
  const sleeve = a.outer && a.outerStyle !== 'none' ? a.outer : a.top
  if (raised) {
    return (
      <g>
        <rect x={-19} y={-47} width={6.2} height={17} rx={3.1} fill={sleeve} stroke={EDGE} strokeWidth={0.7} transform="rotate(-20 -16 -31)" />
        <rect x={12.8} y={-47} width={6.2} height={17} rx={3.1} fill={sleeve} stroke={EDGE} strokeWidth={0.7} transform="rotate(20 16 -31)" />
        <circle cx={-21.5} cy={-46} r={3.1} fill={a.skin} />
        <circle cx={21.5} cy={-46} r={3.1} fill={a.skin} />
      </g>
    )
  }
  return (
    <g>
      <rect x={-15.6} y={-30.5} width={6.2} height={17} rx={3.1} fill={sleeve} stroke={EDGE} strokeWidth={0.7} />
      <rect x={9.4} y={-30.5} width={6.2} height={17} rx={3.1} fill={sleeve} stroke={EDGE} strokeWidth={0.7} />
      <circle cx={-12.5} cy={-13.2} r={3.1} fill={a.skin} />
      <circle cx={12.5} cy={-13.2} r={3.1} fill={a.skin} />
    </g>
  )
}

interface Props {
  avatar: AvatarCfg
  color: string
  size?: number
  variant?: 'head' | 'bust' | 'full'
  mood?: Mood
  title?: string
  cheer?: boolean
}

/** Avatar chibi en 2D con los rasgos configurados de cada persona. */
export function Avatar({ avatar, color, size = 32, variant = 'head', mood = 'smile', title, cheer = false }: Props) {
  const a: AvatarCfg = { ...avatar, outerStyle: avatar.outerStyle ?? 'none' }
  if (variant === 'full') {
    return (
      <svg className="ava-full" viewBox="-30 -74 60 78" width={size} height={size * 1.3} role="img" aria-label={title}>
        <ellipse cx={0} cy={0.5} rx={14} ry={3.4} fill="rgba(0,0,0,.25)" />
        <Legs />
        <Arms a={a} raised={cheer} />
        <Torso a={a} />
        <Head a={a} mood={cheer ? 'open' : mood} />
      </svg>
    )
  }
  const viewBox = variant === 'bust' ? '-25 -71 50 50' : '-21 -69 42 42'
  return (
    <span className="ava" style={{ width: size, height: size, ['--pc' as string]: color }} title={title}>
      <svg viewBox={viewBox} width={size} height={size} aria-hidden="true">
        {variant === 'bust' && <Torso a={a} />}
        <Head a={a} mood={mood} />
      </svg>
    </span>
  )
}
