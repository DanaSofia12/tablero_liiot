import type { PresenceState } from '../types'

/** Planta de la oficina: x = ancho (0–12), z = fondo (0–9). Paredes en x = 0 y z = 0; la cámara mira desde +x +z. */
export const ROOM = { w: 12, d: 9, h: 3.4 }

export const DESKS: Record<string, { x0: number; cx: number }> = {
  jp: { x0: 1.2, cx: 2.3 },
  dana: { x0: 4.9, cx: 6.0 },
  jd: { x0: 8.6, cx: 9.7 },
}
export const DESK_Z = { from: 2.6, to: 3.65 }
const FALLBACK_ORDER = ['dana', 'jp', 'jd']

export type Pose = 'type' | 'phone' | 'focus' | 'sad' | 'cheer' | 'idle' | 'talk' | 'review' | 'sleep'

export interface Spot {
  x: number
  z: number
  /** Ángulo hacia donde mira (0 = hacia +z, la cámara). */
  face: number
  pose: Pose
  seated: boolean
}

function deskFor(memberId: string) {
  if (DESKS[memberId]) return DESKS[memberId]
  const extra = Object.keys(DESKS).length
  return Object.values(DESKS)[FALLBACK_ORDER.indexOf(memberId) % extra] ?? DESKS.dana
}

const SLOT: Record<string, number> = { dana: 0, jp: 1, jd: 2 }

export function spotFor(memberId: string, state: PresenceState, activity: string): Spot {
  const desk = deskFor(memberId)
  const slot = SLOT[memberId] ?? 0
  switch (state) {
    case 'trabajando':
      return { x: desk.cx, z: 2.25, face: 0, pose: activity === 'Habla por teléfono' ? 'phone' : 'type', seated: true }
    case 'foco':
      return { x: desk.cx, z: 2.25, face: 0, pose: 'focus', seated: true }
    case 'bloqueado':
      return { x: desk.x0 - 0.45, z: 2.45, face: 0.3, pose: 'sad', seated: false }
    case 'celebrando':
      return { x: desk.cx, z: 2.25, face: 0, pose: 'cheer', seated: false }
    case 'revision':
      return memberId === 'dana'
        ? { x: 4.1, z: 0.95, face: Math.PI, pose: 'review', seated: false }
        : { x: [5.55, 5.55, 6.55][slot], z: 4.45, face: Math.PI, pose: 'review', seated: false }
    case 'disponible':
      return [
        { x: 1.45, z: 4.85, face: -Math.PI / 2, pose: 'idle' as Pose, seated: false },
        { x: 2.2, z: 5.75, face: -Math.PI / 2 - 0.4, pose: 'idle' as Pose, seated: false },
        { x: 1.5, z: 6.6, face: -Math.PI / 2 - 0.2, pose: 'idle' as Pose, seated: false },
      ][slot]
    case 'reunion':
      return [
        { x: 6.3, z: 5.3, face: 0, pose: 'talk' as Pose, seated: false },
        { x: 4.95, z: 6.7, face: Math.PI / 2, pose: 'talk' as Pose, seated: false },
        { x: 7.65, z: 6.4, face: -Math.PI / 2, pose: 'talk' as Pose, seated: false },
      ][slot]
    case 'fuera':
    default:
      return { x: [9.85, 10.5, 11.15][slot], z: 7.35, face: 0, pose: 'sleep', seated: true }
  }
}

const GAPS = [0.75, 4.15, 7.85, 11.3]
const AISLE_Z = 4.15
const BACK_LANE_Z = 1.45

function gapFor(a: number, b: number): number {
  return GAPS.reduce((best, g) => (Math.abs(a - g) + Math.abs(b - g) < Math.abs(a - best) + Math.abs(b - best) ? g : best), GAPS[0])
}

/** Ruta simple que rodea los escritorios: fila de atrás → pasillo → destino. */
export function route(from: { x: number; z: number }, to: { x: number; z: number }): { x: number; z: number }[] {
  const back = (p: { z: number }) => p.z < DESK_Z.from
  const pts: { x: number; z: number }[] = []
  if (back(from) && !back(to)) {
    const g = gapFor(from.x, to.x)
    pts.push({ x: from.x, z: BACK_LANE_Z }, { x: g, z: BACK_LANE_Z }, { x: g, z: AISLE_Z })
  } else if (!back(from) && back(to)) {
    const g = gapFor(from.x, to.x)
    pts.push({ x: g, z: AISLE_Z }, { x: g, z: BACK_LANE_Z }, { x: to.x, z: BACK_LANE_Z })
  } else if (back(from) && back(to) && Math.abs(from.x - to.x) > 0.4) {
    pts.push({ x: from.x, z: BACK_LANE_Z }, { x: to.x, z: BACK_LANE_Z })
  }
  pts.push({ x: to.x, z: to.z })
  return pts
}
