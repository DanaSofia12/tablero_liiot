import type { Universe } from '../prefs'

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
}

const BLEEPY_DARK: ScenePalette = {
  night: true,
  floor: '#1f1a57',
  grid: '#2f2a78',
  wallA: '#1b1752',
  wallB: '#161349',
  trim: '#2e2879',
  desk: '#2d2874',
  wood: '#433b9a',
  metal: '#6870aa',
  chair: '#2bb7d6',
  sofa: '#e04aa0',
  cushion: '#f5bf33',
  pot: '#e6962e',
  leaf: '#43c47a',
  leaf2: '#2da05e',
  screen: '#080624',
  acc: '#7c5cff',
  acc2: '#ff4fa3',
  acc3: '#3dd6f5',
  rug: '#3b1e63',
  sky1: '#06041a',
  sky2: '#25165e',
  neonA: '#3dd6f5',
  neonB: '#ff4fa3',
  chrome: '#c7f6ff',
  paper: '#e9e7ff',
  notes: ['#ff9fd0', '#ffe27a', '#a9c7ff', '#b6f27e', '#9ef0d9'],
  ambient: 0.55,
  sun: 0.5,
  sunColor: '#9fd8ff',
  hemiSky: '#4f45c9',
  hemiGround: '#0b0930',
}

const BLEEPY_LIGHT: ScenePalette = {
  night: false,
  floor: '#ece6ff',
  grid: '#d8cdfb',
  wallA: '#dcefff',
  wallB: '#cde4ff',
  trim: '#ffffff',
  desk: '#ffffff',
  wood: '#c9bcff',
  metal: '#d6dceb',
  chair: '#7fe0f2',
  sofa: '#ff7dbe',
  cushion: '#ffd45c',
  pot: '#ffb13d',
  leaf: '#5fd38a',
  leaf2: '#36b56c',
  screen: '#1e1660',
  acc: '#5b2ee8',
  acc2: '#ff4fa3',
  acc3: '#3dd6f5',
  rug: '#ffe3f2',
  sky1: '#a8b4ff',
  sky2: '#ffc6e7',
  neonA: '#7c5cff',
  neonB: '#ff4fa3',
  chrome: '#d2f8ff',
  paper: '#ffffff',
  notes: ['#ff9fd0', '#ffe27a', '#a9c7ff', '#b6f27e', '#9ef0d9'],
  ambient: 1.05,
  sun: 1.8,
  sunColor: '#fff6ff',
  hemiSky: '#f1f0ff',
  hemiGround: '#dcd2ff',
}

export function paletteFor(uni: Universe, mode: 'dark' | 'light'): ScenePalette {
  if (uni === 'bleepy') return mode === 'dark' ? BLEEPY_DARK : BLEEPY_LIGHT
  return mode === 'dark' ? LIIOT_DARK : LIIOT_LIGHT
}
