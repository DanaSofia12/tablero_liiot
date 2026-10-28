import type { AvatarCfg, HairStyle } from '../types'

export type Mood = 'smile' | 'open' | 'flat' | 'sleep'

const HAIR_BACK: Partial<Record<HairStyle, string>> = {
  wolf: 'M-17.5,-47 C-19.5,-69 19.5,-69 17.5,-47 L18.5,-34 L21,-18 L16.5,-21 L15,-9 L10,-16 L6,-12 L0,-15 L-6,-12 L-10,-16 L-15,-9 L-16.5,-21 L-21,-18 L-18.5,-34 Z',
  long: 'M-17.5,-47 C-19.5,-69 19.5,-69 17.5,-47 L19,-14 C10,-10 -10,-10 -19,-14 Z',
  bowl: 'M-17.6,-45 C-19.5,-67 19.5,-67 17.6,-45 L17.4,-36 C11,-32.5 -11,-32.5 -17.4,-36 Z',
}

const HAIR_FRONT: Record<HairStyle, string> = {
  wolf: 'M-16.2,-44 C-17.5,-63 -6,-66.5 0,-64 C6,-66.5 17.5,-63 16.2,-44 C15.5,-49 13.5,-53 9.5,-55.5 C6.5,-57.5 2.5,-57 0.6,-59.5 C-1.5,-57 -6.5,-57.5 -9.5,-55.5 C-13.5,-53 -15.5,-49 -16.2,-44 Z',
  long: 'M-16.2,-44 C-17.5,-63 17.5,-63 16.2,-44 C14,-52 9,-56 4,-56.5 C-2,-56 -10,-55 -16.2,-44 Z',
  bowl: 'M-17,-41 C-18.6,-65 18.6,-65 17,-41 C16.6,-45 15.6,-48.5 14,-50.2 L11,-49.2 L8.5,-50.6 L5.5,-49.4 L2.5,-50.8 L-0.5,-49.4 L-3.5,-50.8 L-6.5,-49.4 L-9.5,-50.6 L-12,-49.4 L-14,-50.2 C-15.6,-48.5 -16.6,-45 -17,-41 Z',
  wavy: 'M-15.8,-46.5 C-17.5,-60 -10,-67.5 -1,-66 C8,-68.5 17.5,-61 15.8,-46.5 C15,-51 13,-53.5 10.5,-54 C11,-51 9,-49 7,-51.5 C6.5,-48.5 3,-48 2,-52 C0,-49 -3.5,-49.5 -4,-53 C-6,-50.5 -9.5,-51 -9.5,-54 C-12,-53 -14.5,-51 -15.8,-46.5 Z',
  short: 'M-16,-45 C-17,-62 17,-62 16,-45 C14,-52 8,-55 0,-54.5 C-8,-55 -14,-52 -16,-45 Z',
  bun: 'M-16,-45 C-17,-62 17,-62 16,-45 C14,-52 8,-55 0,-54.5 C-8,-55 -14,-52 -16,-45 Z',
}

const STRANDS =
  'M14.8,-50 C16.6,-42 16,-34 12.4,-27.5 C13.2,-35 12.6,-42 10.6,-49 Z M-14.8,-50 C-16.6,-42 -16,-34 -12.4,-27.5 C-13.2,-35 -12.6,-42 -10.6,-49 Z'

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
  return (
    <g>
      {back && <path d={back} fill={a.hairColor} stroke={EDGE} strokeWidth={0.8} />}
      {a.hair === 'bun' && <circle cx={0} cy={-66} r={6.5} fill={a.hairColor} stroke={EDGE} strokeWidth={0.8} />}
      <rect x={-4} y={-33} width={8} height={5} rx={2} fill={a.skin} />
      <circle cx={0} cy={-46} r={15.5} fill={a.skin} stroke={EDGE} strokeWidth={0.8} />
      <Face a={a} mood={mood} />
      <path d={HAIR_FRONT[a.hair]} fill={a.hairColor} stroke={EDGE} strokeWidth={0.8} />
      {a.hair === 'wolf' && <path d={STRANDS} fill={a.hairColor} />}
      {a.hair === 'wavy' && (
        <path d="M-9,-60.5 q4,-3 8,-0.5 M2,-62 q4,-2 7,0.5" fill="none" stroke="rgba(255,255,255,.18)" strokeWidth={1.2} strokeLinecap="round" />
      )}
      <path d="M-11,-58 q6,-5 14,-3" fill="none" stroke="rgba(255,255,255,.16)" strokeWidth={1.4} strokeLinecap="round" />
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
