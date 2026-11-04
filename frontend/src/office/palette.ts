import type { Theme } from '../types'

export interface ScenePalette {
  night: boolean
  floor: string
  grid: string
  wallA: string
  wallB: string
  trim: string
  desk: string
  wood: string
  metal: string
  chair: string
  sofa: string
  cushion: string
  pot: string
  leaf: string
  leaf2: string
  screen: string
  acc: string
  acc2: string
  acc3: string
  rug: string
  sky1: string
  sky2: string
  neonA: string
  neonB: string
  chrome: string
  paper: string
  notes: string[]
  ambient: number
  sun: number
  sunColor: string
  hemiSky: string
  hemiGround: string
  /** Luz del centro de la oficina de noche. */
  lamp: string
}

const LIIOT_DARK: ScenePalette = {
  night: true,
  floor: '#2b2143',
  grid: '#3d2f5c',
  wallA: '#271b3d',
  wallB: '#1f1633',
  trim: '#3d2f5a',
  desk: '#43355f',
  wood: '#5d4877',
  metal: '#9289ad',
  chair: '#6a46a0',
  sofa: '#d0582f',
  cushion: '#ef8a5f',
  pot: '#c06d45',
  leaf: '#59ae78',
  leaf2: '#3f8d5d',
  screen: '#0e0919',
  acc: '#9d55e6',
  acc2: '#ff6a33',
  acc3: '#e04b66',
  rug: '#4b2142',
  sky1: '#120c33',
  sky2: '#3d2766',
  neonA: '#b26bff',
  neonB: '#ff7a45',
  chrome: '#d6c2ff',
  paper: '#efe8f8',
  notes: ['#ffb59a', '#ffe08a', '#cdb4f5', '#f7a8ba', '#9ee0b5'],
  ambient: 0.55,
  sun: 0.55,
  sunColor: '#b9a8ff',
  hemiSky: '#6b4fa8',
  hemiGround: '#1a1028',
  lamp: '#b58cff',
}

const LIIOT_LIGHT: ScenePalette = {
  night: false,
  floor: '#f2e6d7',
  grid: '#e2cfbb',
  wallA: '#f4eafc',
  wallB: '#e9dcf7',
  trim: '#ffffff',
  desk: '#fff7ec',
  wood: '#e3c4a3',
  metal: '#d8d1e4',
  chair: '#c6abee',
  sofa: '#ffa985',
  cushion: '#ffdac8',
  pot: '#eaa07b',
  leaf: '#78c48f',
  leaf2: '#59ac76',
  screen: '#2f2244',
  acc: '#8b45cc',
  acc2: '#ff6a33',
  acc3: '#e04b66',
  rug: '#fbe1e8',
  sky1: '#b9e0ff',
  sky2: '#ffe2c8',
  neonA: '#a874ec',
  neonB: '#ff8a5c',
  chrome: '#e1d0ff',
  paper: '#ffffff',
  notes: ['#ffb59a', '#ffe08a', '#cdb4f5', '#f7a8ba', '#9ee0b5'],
  ambient: 1.05,
  sun: 1.9,
  sunColor: '#fff3e2',
  hemiSky: '#fff1fb',
  hemiGround: '#e9d8c6',
  lamp: '#b58cff',
}

// Bleepy (brandbook) de noche: azul noche con luces cálidas; naranja #F36F2B, celeste #658DB9 y crema #E2E5B2 resaltan
const BLEEPY_DARK: ScenePalette = {
  night: true,
  floor: '#1c2b59',
  grid: '#27396e',
  wallA: '#182653',
  wallB: '#142149',
  trim: '#2b3e79',
  desk: '#26386f',
  wood: '#35498b',
  metal: '#8a9cc8',
  chair: '#f36f2b',
  sofa: '#f36f2b',
  cushion: '#e2e5b2',
  pot: '#d9561a',
  leaf: '#6fbf8c',
  leaf2: '#4f9d6c',
  screen: '#0b1330',
  acc: '#8fb0e8',
  acc2: '#f36f2b',
  acc3: '#e2e5b2',
  rug: '#3061ad',
  sky1: '#0b1330',
  sky2: '#1f3170',
  neonA: '#8fb0e8',
  neonB: '#f36f2b',
  chrome: '#e2e5b2',
  paper: '#f6f3e4',
  notes: ['#ffb489', '#e2e5b2', '#a9c2e2', '#f3c58f', '#cfe3b6'],
  ambient: 0.62,
  sun: 0.7,
  sunColor: '#b8cdf2',
  hemiSky: '#4a62a8',
  hemiGround: '#0f1a3d',
  lamp: '#a9c2f0',
}

const BLEEPY_LIGHT: ScenePalette = {
  night: false,
  floor: '#f1efdc',
  grid: '#e2dfc4',
  wallA: '#f6f5e6',
  wallB: '#eceadb',
  trim: '#ffffff',
  desk: '#ffffff',
  wood: '#d9cfae',
  metal: '#c9cfdf',
  chair: '#658db9',
  sofa: '#f36f2b',
  cushion: '#e2e5b2',
  pot: '#d9561a',
  leaf: '#7fb98a',
  leaf2: '#5a9a6c',
  screen: '#1b2350',
  acc: '#3061ad',
  acc2: '#f36f2b',
  acc3: '#658db9',
  rug: '#e9e7cf',
  sky1: '#9db8dc',
  sky2: '#f4d8bf',
  neonA: '#3061ad',
  neonB: '#f36f2b',
  chrome: '#e2e5b2',
  paper: '#ffffff',
  notes: ['#f7a77a', '#e2e5b2', '#a9c2e2', '#f3c58f', '#cfe3b6'],
  ambient: 1.05,
  sun: 1.8,
  sunColor: '#fffbea',
  hemiSky: '#f6f5e6',
  hemiGround: '#dcd8bd',
  lamp: '#ffd2a8',
}

export function paletteFor(theme: Theme, mode: 'dark' | 'light'): ScenePalette {
  if (theme === 'bleepy') return mode === 'dark' ? BLEEPY_DARK : BLEEPY_LIGHT
  return mode === 'dark' ? LIIOT_DARK : LIIOT_LIGHT
}
