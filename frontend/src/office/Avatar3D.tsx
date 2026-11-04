import { useEffect, useMemo, useRef, useState, type RefObject } from 'react'
import { useFrame, type ThreeEvent } from '@react-three/fiber'
import { Outlines, Sparkles } from '@react-three/drei'
import * as THREE from 'three'
import type { AvatarCfg, Member, Presence } from '../types'
import { anchors } from './anchors'
import { route, spotFor, type Pose } from './layout'

let toonMap: THREE.DataTexture | null = null
function toonGradient(): THREE.DataTexture {
  if (toonMap) return toonMap
  const data = new Uint8Array([112, 112, 112, 255, 190, 190, 190, 255, 255, 255, 255, 255])
  const texture = new THREE.DataTexture(data, 3, 1, THREE.RGBAFormat)
  texture.minFilter = THREE.NearestFilter
  texture.magFilter = THREE.NearestFilter
  texture.generateMipmaps = false
  texture.needsUpdate = true
  toonMap = texture
  return texture
}

function Toon({ color, side }: { color: string; side?: THREE.Side }) {
  return <meshToonMaterial color={color} gradientMap={toonGradient()} side={side} />
}

const EDGE = '#1c1028'
const HEAD_R = 0.34

/** Ángulo horizontal de la esfera de three.js: π/2 es el frente (+z, hacia la cámara). */
const FRONT = Math.PI / 2

function lerpAngle(a: number, b: number, t: number): number {
  let d = b - a
  while (d > Math.PI) d -= Math.PI * 2
  while (d < -Math.PI) d += Math.PI * 2
  return a + d * t
}

let zzzTexture: THREE.CanvasTexture | null = null
function zzz(): THREE.CanvasTexture {
  if (zzzTexture) return zzzTexture
  const canvas = document.createElement('canvas')
  canvas.width = 64
  canvas.height = 64
  const ctx = canvas.getContext('2d')!
  ctx.font = '700 46px "Pixelify Sans", monospace'
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.lineWidth = 6
  ctx.strokeStyle = 'rgba(30,14,48,.65)'
  ctx.strokeText('z', 32, 34)
  ctx.fillStyle = '#ffffff'
  ctx.fillText('z', 32, 34)
  zzzTexture = new THREE.CanvasTexture(canvas)
  zzzTexture.colorSpace = THREE.SRGBColorSpace
  return zzzTexture
}

/**
 * Cabello en capas, siempre más grande que la cabeza para que no se vea piel en las sienes:
 * casquete (arriba), manto (lados y nuca, con una ventana solo para la cara), mechones a los lados,
 * flequillo según el estilo y, en los estilos largos, el pelo que cae por la espalda.
 */
function Hair({ a }: { a: AvatarCfg }) {
  const c = a.hairColor
  const long = a.hair === 'wolf' || a.hair === 'long'
  // Ventana de la cara: ±0.72 rad en el frente; el manto baja hasta la mandíbula
  const windowHalf = a.hair === 'bowl' ? 0.78 : 0.7
  const mantle = long ? 2.2 : a.hair === 'bun' ? 1.95 : 1.8
  return (
    <group>
      {/* casquete: cubre la coronilla y llega hasta la línea de la frente */}
      <mesh position={[0, 0.012, -0.004]} scale={[1.07, 1.05, 1.06]} castShadow>
        <sphereGeometry args={[HEAD_R, 40, 24, 0, Math.PI * 2, 0, a.hair === 'bowl' ? 1.36 : 1.12]} />
        <Toon color={c} />
      </mesh>
      {/* manto: lados y nuca */}
      <mesh position={[0, 0.006, -0.01]} scale={[1.08, 1.04, 1.07]}>
        <sphereGeometry args={[HEAD_R, 40, 26, FRONT + windowHalf, Math.PI * 2 - windowHalf * 2, 0.35, mantle - 0.35]} />
        <Toon color={c} side={THREE.DoubleSide} />
      </mesh>
      {/* sienes: dos gajos que tapan la piel entre el flequillo y las orejas */}
      {[-1, 1].map((side) => (
        <mesh key={side} position={[0.272 * side, 0.03, 0.12]} rotation={[0.08, 0, side * 0.12]} scale={[0.5, 1, 0.72]}>
          <sphereGeometry args={[0.15, 18, 14]} />
          <Toon color={c} />
        </mesh>
      ))}
      {a.hair === 'wolf' && (
        <>
          {/* flequillo cortina, abierto al centro */}
          {[-1, 1].map((side) => (
            <mesh key={side} position={[0.13 * side, 0.165, 0.272]} rotation={[0.42, side * 0.32, side * -0.5]} scale={[1.25, 0.62, 0.42]}>
              <sphereGeometry args={[0.13, 18, 12]} />
              <Toon color={c} />
            </mesh>
          ))}
          {/* mechones largos que enmarcan la cara */}
          {[-1, 1].map((side) => (
            <mesh key={`l${side}`} position={[0.292 * side, -0.16, 0.13]} rotation={[0.06, 0, side * 0.1]}>
              <capsuleGeometry args={[0.07, 0.36, 6, 10]} />
              <Toon color={c} />
            </mesh>
          ))}
        </>
      )}
      {a.hair === 'long' && (
        <>
          <mesh position={[0, 0.2, 0.258]} rotation={[0.5, 0, 0]} scale={[1.5, 0.45, 0.4]}>
            <sphereGeometry args={[0.13, 18, 12]} />
            <Toon color={c} />
          </mesh>
          {[-1, 1].map((side) => (
            <mesh key={side} position={[0.295 * side, -0.17, 0.11]} rotation={[0.05, 0, side * 0.08]}>
              <capsuleGeometry args={[0.072, 0.4, 6, 10]} />
              <Toon color={c} />
            </mesh>
          ))}
        </>
      )}
      {long && (
        <group>
          {/* pelo que cae por la espalda */}
          <mesh position={[0, -0.3, -0.16]} scale={[1.2, 1, 0.62]} castShadow>
            <capsuleGeometry args={[0.28, 0.42, 8, 18]} />
            <Toon color={c} />
          </mesh>
          {a.hair === 'wolf' &&
            [-0.2, -0.07, 0.07, 0.2].map((x, i) => (
              <mesh key={x} position={[x, -0.68 - (i % 2) * 0.05, -0.18]} rotation={[Math.PI, 0, x * 0.6]}>
                <coneGeometry args={[0.085, 0.2, 10]} />
                <Toon color={c} />
              </mesh>
            ))}
        </group>
      )}
      {a.hair === 'bowl' && (
        // flequillo recto hasta las cejas
        <mesh position={[0, 0.13, 0.262]} rotation={[0.3, 0, 0]} scale={[1.62, 0.5, 0.5]}>
          <sphereGeometry args={[0.15, 22, 12, 0, Math.PI * 2, 0, Math.PI / 2]} />
          <Toon color={c} />
        </mesh>
      )}
      {a.hair === 'wavy' &&
        [
          [-0.22, 0.2, 0.2],
          [-0.09, 0.26, 0.25],
          [0.05, 0.25, 0.27],
          [0.18, 0.21, 0.23],
          [0.27, 0.12, 0.17],
          [-0.28, 0.11, 0.15],
          [0.0, 0.34, 0.14],
          [-0.15, 0.32, 0.1],
          [0.15, 0.33, 0.08],
          [0.0, 0.3, -0.18],
        ].map((p, i) => (
          <mesh key={i} position={p as [number, number, number]} scale={[1, 0.86, 0.88]}>
            <sphereGeometry args={[0.105, 14, 10]} />
            <Toon color={c} />
          </mesh>
        ))}
      {(a.hair === 'short' || a.hair === 'bun') && (
        <mesh position={[0.07, 0.2, 0.25]} rotation={[0.55, 0.2, -0.35]} scale={[1.35, 0.5, 0.42]}>
          <sphereGeometry args={[0.14, 18, 12]} />
          <Toon color={c} />
        </mesh>
      )}
      {a.hair === 'bun' && (
        <mesh position={[0, 0.38, -0.1]}>
          <sphereGeometry args={[0.13, 18, 14]} />
          <Toon color={c} />
        </mesh>
      )}
    </group>
  )
}

function Face({ a, pose, blink, talk }: { a: AvatarCfg; pose: Pose | 'walk'; blink: RefObject<THREE.Group | null>; talk: RefObject<THREE.Mesh | null> }) {
  const sleeping = pose === 'sleep'
  const happy = pose === 'cheer'
  const talking = pose === 'talk'
  const browY = a.hair === 'bowl' ? 0.112 : 0.1
  return (
    <group>
      <group ref={blink}>
        {[-1, 1].map((side) => (
          <group key={side} position={[0.118 * side, 0.005, 0.305]}>
            {sleeping ? (
              <mesh rotation={[0, 0, 0]}>
                <torusGeometry args={[0.04, 0.009, 6, 14, Math.PI]} />
                <meshBasicMaterial color={a.eyes} />
              </mesh>
            ) : (
              <>
                <mesh scale={[1, 1.34, 0.45]}>
                  <sphereGeometry args={[0.05, 18, 14]} />
                  <meshBasicMaterial color={a.eyes} />
                </mesh>
                <mesh position={[0.016, 0.026, 0.02]}>
                  <sphereGeometry args={[0.017, 10, 8]} />
                  <meshBasicMaterial color="#ffffff" />
                </mesh>
                <mesh position={[-0.014, -0.022, 0.02]}>
                  <sphereGeometry args={[0.008, 8, 6]} />
                  <meshBasicMaterial color="#ffffff" />
                </mesh>
                {a.lashes && (
                  <mesh position={[0.05 * side, 0.05, -0.004]} rotation={[0, 0, side * -0.65]}>
                    <boxGeometry args={[0.04, 0.011, 0.01]} />
                    <meshBasicMaterial color={a.eyes} />
                  </mesh>
                )}
              </>
            )}
          </group>
        ))}
      </group>
      {a.hair !== 'bowl' &&
        [-1, 1].map((side) => (
          <mesh key={side} position={[0.12 * side, browY, 0.31]} rotation={[0, 0, side * (pose === 'sleep' ? 0.05 : -0.12)]}>
            <capsuleGeometry args={[0.011, 0.05, 4, 6]} />
            <meshBasicMaterial color={a.hairColor} />
          </mesh>
        ))}
      {[-1, 1].map((side) => (
        <mesh key={side} position={[0.2 * side, -0.068, 0.268]} rotation={[0, 0.62 * side, 0]}>
          <circleGeometry args={[0.048, 18]} />
          <meshBasicMaterial color="#ff7a9a" transparent opacity={0.42} />
        </mesh>
      ))}
      <mesh position={[0, -0.04, 0.33]}>
        <sphereGeometry args={[0.014, 8, 6]} />
        <meshToonMaterial color={a.skin} gradientMap={toonGradient()} />
      </mesh>
      {happy || talking ? (
        <mesh ref={talk} position={[0, -0.112, 0.304]} scale={[1, 0.8, 0.4]}>
          <sphereGeometry args={[0.046, 14, 10]} />
          <meshBasicMaterial color="#7a2f3b" />
        </mesh>
      ) : sleeping ? (
        <mesh position={[0, -0.11, 0.318]}>
          <boxGeometry args={[0.05, 0.01, 0.01]} />
          <meshBasicMaterial color="#7a3b3b" />
        </mesh>
      ) : (
        <mesh position={[0, -0.095, 0.312]} rotation={[0, 0, Math.PI]}>
          <torusGeometry args={[0.042, a.lips ? 0.016 : 0.01, 8, 16, Math.PI]} />
          <meshBasicMaterial color={a.lips ?? '#7a3b3b'} />
        </mesh>
      )}
      {a.glasses && (
        <group>
          {[-1, 1].map((side) => (
            <mesh key={side} position={[0.118 * side, 0.008, 0.33]}>
              <torusGeometry args={[0.082, 0.012, 8, 26]} />
              <meshStandardMaterial color="#1a1220" roughness={0.4} />
            </mesh>
          ))}
          <mesh position={[0, 0.014, 0.338]} rotation={[0, 0, Math.PI / 2]}>
            <cylinderGeometry args={[0.009, 0.009, 0.075, 6]} />
            <meshStandardMaterial color="#1a1220" />
          </mesh>
        </group>
      )}
    </group>
  )
}

interface Props {
  member: Member
  presence?: Presence
  onSelect: () => void
  onHint: (label: string | null) => void
}

const PRESENCE_HINT: Record<string, string> = {
  trabajando: 'está trabajando',
  en_reunion: 'está en reunión',
  disponible: 'está disponible',
  descansando: 'está descansando',
}

export function Avatar3D({ member, presence, onSelect, onHint }: Props) {
  const a = member.avatar
  const state = presence?.state ?? 'disponible'
  const spot = useMemo(() => spotFor(member.id, state, presence?.activity ?? ''), [member.id, state, presence?.activity])
  const root = useRef<THREE.Group>(null)
  const upper = useRef<THREE.Group>(null)
  const head = useRef<THREE.Group>(null)
  const armL = useRef<THREE.Group>(null)
  const armR = useRef<THREE.Group>(null)
  const legL = useRef<THREE.Group>(null)
  const legR = useRef<THREE.Group>(null)
  const blink = useRef<THREE.Group>(null)
  const mouth = useRef<THREE.Mesh>(null)
  const zs = useRef<THREE.Group>(null)
  const pos = useRef(new THREE.Vector2(spot.x, spot.z))
  const yaw = useRef(spot.face)
  const path = useRef<{ x: number; z: number }[]>([])
  const placed = useRef(false)
  const anchor = useRef<THREE.Group>(null)
  const seed = useMemo(() => [...member.id].reduce((n, ch) => n + ch.charCodeAt(0), 0) % 7, [member.id])
  const [walking, setWalking] = useState(false)
  const [cheering, setCheering] = useState(false)

  useEffect(() => {
    const node = anchor.current
    if (!node) return
    anchors.set(member.id, node)
    return () => {
      anchors.delete(member.id)
    }
  }, [member.id])

  // Cuando alguien finaliza una tarea, su avatar celebra unos segundos
  useEffect(() => {
    let timer: number | undefined
    const onCelebrate = (e: Event) => {
      const detail = (e as CustomEvent<{ memberId: string | null }>).detail
      if (detail?.memberId !== member.id) return
      setCheering(true)
      window.clearTimeout(timer)
      timer = window.setTimeout(() => setCheering(false), 4200)
    }
    window.addEventListener('hq:celebrate', onCelebrate)
    return () => {
      window.removeEventListener('hq:celebrate', onCelebrate)
      window.clearTimeout(timer)
    }
  }, [member.id])

  useEffect(() => {
    if (anchor.current) anchor.current.userData.hidden = walking
  }, [walking])

  useEffect(() => {
    if (!placed.current) {
      placed.current = true
      pos.current.set(spot.x, spot.z)
      yaw.current = spot.face
      return
    }
    if (Math.hypot(pos.current.x - spot.x, pos.current.y - spot.z) < 0.05) return
    path.current = route({ x: pos.current.x, z: pos.current.y }, spot)
    setWalking(true)
  }, [spot])

  useFrame((frame, delta) => {
    const g = root.current
    if (!g || !upper.current || !head.current || !armL.current || !armR.current || !legL.current || !legR.current) return
    const t = frame.clock.elapsedTime + seed * 1.7
    const dt = Math.min(delta, 0.05)
    let moving = false
    if (path.current.length) {
      const target = path.current[0]
      const dx = target.x - pos.current.x
      const dz = target.z - pos.current.y
      const dist = Math.hypot(dx, dz)
      const step = 2.3 * dt
      if (dist <= step) {
        pos.current.set(target.x, target.z)
        path.current.shift()
        if (!path.current.length) setWalking(false)
      } else {
        pos.current.x += (dx / dist) * step
        pos.current.y += (dz / dist) * step
      }
      if (dist > 0.01) yaw.current = lerpAngle(yaw.current, Math.atan2(dx, dz), Math.min(1, dt * 10))
      moving = true
    } else {
      yaw.current = lerpAngle(yaw.current, cheering && !spot.seated ? 0 : spot.face, Math.min(1, dt * 5))
    }

    const pose: Pose | 'walk' = moving ? 'walk' : cheering ? 'cheer' : spot.pose
    const seated = !moving && spot.seated && pose !== 'cheer'
    let y = seated ? 0.2 : 0
    if (pose === 'cheer') y = (spot.seated ? 0.2 : 0) + Math.abs(Math.sin(t * 6)) * 0.28
    if (moving) y = Math.abs(Math.sin(t * 11)) * 0.045
    if (pose === 'idle') y = Math.max(0, Math.sin(t * 1.6)) * 0.012
    g.position.set(pos.current.x, y, pos.current.y)
    g.rotation.y = yaw.current

    const swing = Math.sin(t * 11) * 0.65
    legL.current.rotation.x = seated ? -1.45 : moving ? swing : 0
    legR.current.rotation.x = seated ? -1.45 : moving ? -swing : 0

    let aL = 0
    let aR = 0
    let zL = -0.08
    let zR = 0.08
    switch (pose) {
      case 'walk':
        aL = -swing * 0.9
        aR = swing * 0.9
        break
      case 'type':
      case 'focus':
        aL = -1.15 + Math.sin(t * 15) * 0.08
        aR = -1.15 + Math.sin(t * 15 + 1.5) * 0.08
        zL = 0.1
        zR = -0.1
        break
      case 'phone':
        aL = -1.1 + Math.sin(t * 3) * 0.05
        aR = -2.55
        zR = 0.35
        break
      case 'cheer':
        zL = -2.6 - Math.sin(t * 12) * 0.18
        zR = 2.6 + Math.sin(t * 12) * 0.18
        break
      case 'idle': {
        // con la taza: de vez en cuando toma un sorbo y a ratos saluda
        const sip = Math.sin(t * 0.7) > 0.86
        const wave = Math.sin(t * 0.23 + 1) > 0.94
        aR = sip ? -2.25 : -1.05
        if (wave) {
          aL = -0.3
          zL = -2.5 + Math.sin(t * 14) * 0.3
        } else {
          aL = Math.sin(t * 0.9) * 0.06
        }
        break
      }
      case 'talk':
        aR = -0.9 + Math.sin(t * 3) * 0.45
        zR = 0.3
        aL = -0.4 + Math.sin(t * 2.2 + 1) * 0.25
        zL = -0.2
        break
      case 'review':
        aL = -1.05
        aR = -1.05
        zL = 0.18
        zR = -0.18
        break
      case 'sleep':
        aL = -0.35
        aR = -0.35
        break
    }
    armL.current.rotation.set(aL, 0, zL)
    armR.current.rotation.set(aR, 0, zR)

    const h = head.current
    if (pose === 'sleep') h.rotation.set(0.2, 0, 0.34 + Math.sin(t * 0.8) * 0.04)
    else if (pose === 'talk') h.rotation.set(Math.sin(t * 2.4) * 0.09, Math.sin(t * 0.7) * 0.3, 0)
    else if (pose === 'type' || pose === 'focus') h.rotation.set(0.14 + Math.sin(t * 1.3) * 0.03, Math.sin(t * 0.5) * 0.12, 0)
    else if (pose === 'phone') h.rotation.set(0.05, 0.1, -0.12)
    else if (pose === 'cheer') h.rotation.set(-0.15, 0, Math.sin(t * 6) * 0.08)
    else h.rotation.set(Math.sin(t * 1.1) * 0.04, Math.sin(t * 0.6) * 0.22, Math.sin(t * 0.4) * 0.03)
    upper.current.scale.y = 1 + Math.sin(t * (pose === 'sleep' ? 1.2 : 2.2)) * (pose === 'sleep' ? 0.02 : 0.012)

    // Parpadeo (cada 3-5 s) y boca que habla en las reuniones
    if (blink.current) {
      const phase = (t * 0.27 + seed * 0.13) % 1
      blink.current.scale.y = pose === 'sleep' ? 1 : phase > 0.965 ? 0.12 : 1
    }
    if (mouth.current) mouth.current.scale.y = pose === 'talk' ? 0.35 + Math.abs(Math.sin(t * 9)) * 0.7 : 0.8
    if (zs.current) {
      zs.current.children.forEach((child, i) => {
        const k = (t * 0.45 + i / 3) % 1
        child.position.set(0.25 + k * 0.25, 1.42 + k * 0.55, 0.08)
        const m = (child as THREE.Sprite).material as THREE.SpriteMaterial
        m.opacity = Math.sin(k * Math.PI)
        child.scale.setScalar(0.12 + k * 0.12)
      })
    }
  })

  const outer = a.outer && a.outerStyle !== 'none' ? a.outer : null
  const sleeve = outer ?? a.top
  const pose: Pose | 'walk' = walking ? 'walk' : cheering ? 'cheer' : spot.pose
  const handleClick = (e: ThreeEvent<MouseEvent>) => {
    e.stopPropagation()
    if (e.delta > 6) return
    onSelect()
  }

  return (
    <group
      ref={root}
      onClick={handleClick}
      onPointerOver={(e) => {
        e.stopPropagation()
        onHint(`${member.name} ${PRESENCE_HINT[state] ?? ''}${presence?.task ? ` en «${presence.task.title}»` : presence?.note ? ` en «${presence.note}»` : ''}`)
        document.body.style.cursor = 'pointer'
      }}
      onPointerOut={() => {
        onHint(null)
        document.body.style.cursor = ''
      }}
    >
      <group ref={anchor} position={[0, 1.9, 0]} />
      {[-1, 1].map((side) => (
        <group key={side} ref={side < 0 ? legL : legR} position={[0.09 * side, 0.34, 0]}>
          <mesh position={[0, -0.16, 0]} castShadow>
            <capsuleGeometry args={[0.075, 0.2, 4, 10]} />
            <Toon color="#2a2238" />
          </mesh>
          <mesh position={[0, -0.31, 0.045]} castShadow>
            <boxGeometry args={[0.13, 0.07, 0.21]} />
            <Toon color="#f4f1f6" />
          </mesh>
          <mesh position={[0, -0.335, 0.045]}>
            <boxGeometry args={[0.135, 0.02, 0.215]} />
            <Toon color="#17111f" />
          </mesh>
        </group>
      ))}
      <group ref={upper}>
        <mesh position={[0, 0.58, 0]} castShadow>
          <capsuleGeometry args={[0.205, 0.22, 6, 16]} />
          <Toon color={sleeve} />
          <Outlines thickness={0.012} color={EDGE} />
        </mesh>
        {outer && (
          <mesh position={[0, 0.6, 0.196]}>
            <boxGeometry args={[0.12, 0.42, 0.02]} />
            <Toon color={a.top} />
          </mesh>
        )}
        <mesh position={[0, 0.86, 0]}>
          <cylinderGeometry args={[0.07, 0.08, 0.1, 12]} />
          <Toon color={a.skin} />
        </mesh>
        {a.necklace && (
          <group>
            <mesh position={[0, 0.83, 0.03]} rotation={[Math.PI / 2 - 0.3, 0, 0]}>
              <torusGeometry args={[0.135, 0.008, 6, 28]} />
              <meshStandardMaterial color="#e6e9f2" metalness={0.9} roughness={0.25} />
            </mesh>
            <mesh position={[0, 0.72, 0.2]}>
              <sphereGeometry args={[0.022, 10, 8]} />
              <meshStandardMaterial color="#e6e9f2" metalness={0.9} roughness={0.2} />
            </mesh>
          </group>
        )}
        {[-1, 1].map((side) => (
          <group key={side} ref={side < 0 ? armL : armR} position={[0.255 * side, 0.78, 0]}>
            <mesh position={[0, -0.15, 0]} castShadow>
              <capsuleGeometry args={[0.062, 0.2, 4, 10]} />
              <Toon color={sleeve} />
            </mesh>
            <mesh position={[0, -0.31, 0]}>
              <sphereGeometry args={[0.064, 12, 10]} />
              <Toon color={a.skin} />
            </mesh>
            {side > 0 && pose === 'phone' && (
              <mesh position={[0.02, -0.35, 0.06]}>
                <boxGeometry args={[0.065, 0.13, 0.018]} />
                <meshStandardMaterial color="#1c1426" />
              </mesh>
            )}
            {side > 0 && pose === 'idle' && (
              <group position={[0, -0.36, 0.07]}>
                <mesh>
                  <cylinderGeometry args={[0.05, 0.044, 0.1, 16]} />
                  <Toon color={member.color} />
                </mesh>
                <mesh position={[0.055, 0, 0]} rotation={[0, 0, Math.PI / 2]}>
                  <torusGeometry args={[0.025, 0.008, 6, 12]} />
                  <Toon color={member.color} />
                </mesh>
              </group>
            )}
          </group>
        ))}
        <group ref={head} position={[0, 1.1, 0]}>
          <mesh castShadow>
            <sphereGeometry args={[HEAD_R, 36, 28]} />
            <Toon color={a.skin} />
            <Outlines thickness={0.012} color={EDGE} />
          </mesh>
          {[-1, 1].map((side) => (
            <mesh key={side} position={[0.33 * side, -0.02, 0.02]} scale={[0.5, 0.8, 0.6]}>
              <sphereGeometry args={[0.07, 12, 10]} />
              <Toon color={a.skin} />
            </mesh>
          ))}
          <Face a={a} pose={pose} blink={blink} talk={mouth} />
          <Hair a={a} />
        </group>
        {pose === 'sleep' && (
          <group ref={zs}>
            {[0, 1, 2].map((i) => (
              <sprite key={i}>
                <spriteMaterial map={zzz()} transparent depthWrite={false} />
              </sprite>
            ))}
          </group>
        )}
      </group>
      {pose === 'cheer' && <Sparkles count={26} scale={[1.4, 1.2, 1.4]} position={[0, 1.3, 0]} size={5} speed={0.8} color={member.color} />}
    </group>
  )
}
