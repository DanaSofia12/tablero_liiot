import { useEffect, useMemo, useRef, useState } from 'react'
import { useFrame, type ThreeEvent } from '@react-three/fiber'
import { Outlines, Sparkles } from '@react-three/drei'
import * as THREE from 'three'
import type { AvatarCfg, Member, Presence } from '../types'
import { anchors } from './anchors'
import { route, spotFor, type Pose } from './layout'

let toonMap: THREE.DataTexture | null = null
function toonGradient(): THREE.DataTexture {
  if (toonMap) return toonMap
  const data = new Uint8Array([105, 105, 105, 255, 185, 185, 185, 255, 255, 255, 255, 255])
  const texture = new THREE.DataTexture(data, 3, 1, THREE.RGBAFormat)
  texture.minFilter = THREE.NearestFilter
  texture.magFilter = THREE.NearestFilter
  texture.generateMipmaps = false
  texture.needsUpdate = true
  toonMap = texture
  return texture
}

function Toon({ color }: { color: string }) {
  return <meshToonMaterial color={color} gradientMap={toonGradient()} />
}

const EDGE = '#1c1028'

function lerpAngle(a: number, b: number, t: number): number {
  let d = b - a
  while (d > Math.PI) d -= Math.PI * 2
  while (d < -Math.PI) d += Math.PI * 2
  return a + d * t
}

function Hair({ a }: { a: AvatarCfg }) {
  const c = a.hairColor
  const cap = a.hair === 'bowl' ? 1.4 : a.hair === 'wolf' ? 1.16 : 1.22
  const shell = a.hair === 'wavy' || a.hair === 'short' ? 1.72 : 2.05
  return (
    <group>
      <mesh position={[0, 0.02, -0.005]} scale={[1.05, 1.02, 1.05]} castShadow>
        <sphereGeometry args={[0.345, 32, 20, 0, Math.PI * 2, 0, cap]} />
        <Toon color={c} />
      </mesh>
      <mesh position={[0, 0.01, -0.01]} scale={[1.06, 1.02, 1.06]}>
        <sphereGeometry args={[0.345, 32, 20, Math.PI / 2 + 0.95, Math.PI * 2 - 1.9, 0, shell]} />
        <meshToonMaterial color={c} gradientMap={toonGradient()} side={THREE.DoubleSide} />
      </mesh>
      {a.hair === 'wolf' && (
        <>
          <mesh position={[-0.165, 0.13, 0.26]} scale={[1, 0.72, 0.42]}>
            <sphereGeometry args={[0.14, 16, 12]} />
            <Toon color={c} />
          </mesh>
          <mesh position={[0.165, 0.13, 0.26]} scale={[1, 0.72, 0.42]}>
            <sphereGeometry args={[0.14, 16, 12]} />
            <Toon color={c} />
          </mesh>
          <mesh position={[-0.3, -0.13, 0.15]} rotation={[0.1, 0, 0.12]}>
            <capsuleGeometry args={[0.058, 0.34, 4, 8]} />
            <Toon color={c} />
          </mesh>
          <mesh position={[0.3, -0.13, 0.15]} rotation={[0.1, 0, -0.12]}>
            <capsuleGeometry args={[0.058, 0.34, 4, 8]} />
            <Toon color={c} />
          </mesh>
          <mesh position={[0, -0.34, -0.13]} scale={[1.12, 1, 0.62]} castShadow>
            <capsuleGeometry args={[0.29, 0.46, 6, 16]} />
            <Toon color={c} />
          </mesh>
        </>
      )}
      {a.hair === 'long' && (
        <mesh position={[0, -0.34, -0.13]} scale={[1.1, 1, 0.6]} castShadow>
          <capsuleGeometry args={[0.29, 0.5, 6, 16]} />
          <Toon color={c} />
        </mesh>
      )}
      {a.hair === 'wavy' &&
        [
          [-0.21, 0.2, 0.22],
          [-0.08, 0.25, 0.27],
          [0.06, 0.24, 0.28],
          [0.19, 0.2, 0.23],
          [0.0, 0.32, 0.17],
          [-0.15, 0.31, 0.12],
          [0.15, 0.32, 0.1],
        ].map((p, i) => (
          <mesh key={i} position={p as [number, number, number]} scale={[1, 0.82, 0.85]}>
            <sphereGeometry args={[0.105, 14, 10]} />
            <Toon color={c} />
          </mesh>
        ))}
      {a.hair === 'bun' && (
        <mesh position={[0, 0.36, -0.12]}>
          <sphereGeometry args={[0.13, 16, 12]} />
          <Toon color={c} />
        </mesh>
      )}
    </group>
  )
}

function Face({ a, pose }: { a: AvatarCfg; pose: Pose | 'walk' }) {
  const sleeping = pose === 'sleep'
  const happy = pose === 'cheer'
  const sad = pose === 'sad'
  return (
    <group>
      {[-1, 1].map((side) => (
        <group key={side}>
          <mesh position={[0.12 * side, sleeping ? -0.01 : 0.0, 0.3]} scale={[1, sleeping ? 0.18 : 1.3, 0.5]}>
            <sphereGeometry args={[0.052, 16, 12]} />
            <meshBasicMaterial color={a.eyes} />
          </mesh>
          {!sleeping && (
            <mesh position={[0.12 * side + 0.018, 0.035, 0.33]}>
              <sphereGeometry args={[0.016, 8, 6]} />
              <meshBasicMaterial color="#ffffff" />
            </mesh>
          )}
          <mesh position={[0.205 * side, -0.075, 0.268]} rotation={[0, 0.62 * side, 0]}>
            <circleGeometry args={[0.046, 16]} />
            <meshBasicMaterial color="#ff7a9a" transparent opacity={0.45} />
          </mesh>
          {a.lashes && !sleeping && (
            <mesh position={[0.17 * side, 0.05, 0.285]} rotation={[0, 0, side * -0.6]}>
              <boxGeometry args={[0.045, 0.012, 0.01]} />
              <meshBasicMaterial color={a.eyes} />
            </mesh>
          )}
        </group>
      ))}
      {happy ? (
        <mesh position={[0, -0.11, 0.305]} scale={[1, 0.85, 0.4]}>
          <sphereGeometry args={[0.05, 12, 10]} />
          <meshBasicMaterial color="#7a2f3b" />
        </mesh>
      ) : sad || sleeping ? (
        <mesh position={[0, -0.11, 0.318]}>
          <boxGeometry args={[0.07, 0.012, 0.01]} />
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
            <mesh key={side} position={[0.12 * side, 0.005, 0.33]}>
              <torusGeometry args={[0.085, 0.013, 8, 24]} />
              <meshStandardMaterial color="#1a1220" roughness={0.4} />
            </mesh>
          ))}
          <mesh position={[0, 0.012, 0.338]} rotation={[0, 0, Math.PI / 2]}>
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
  const pos = useRef(new THREE.Vector2(spot.x, spot.z))
  const yaw = useRef(spot.face)
  const path = useRef<{ x: number; z: number }[]>([])
  const placed = useRef(false)
  const anchor = useRef<THREE.Group>(null)
  const [walking, setWalking] = useState(false)

  useEffect(() => {
    const node = anchor.current
    if (!node) return
    anchors.set(member.id, node)
    return () => {
      anchors.delete(member.id)
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
    const t = frame.clock.elapsedTime
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
      yaw.current = lerpAngle(yaw.current, spot.face, Math.min(1, dt * 5))
    }

    const pose: Pose | 'walk' = moving ? 'walk' : spot.pose
    const seated = !moving && spot.seated
    let y = seated ? 0.2 : 0
    if (pose === 'cheer') y = Math.abs(Math.sin(t * 6)) * 0.3
    if (moving) y = Math.abs(Math.sin(t * 11)) * 0.045
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
      case 'sad':
        aL = -0.5
        aR = -0.5
        zL = 0.5
        zR = -0.5
        break
      case 'cheer':
        zL = -2.6 - Math.sin(t * 12) * 0.18
        zR = 2.6 + Math.sin(t * 12) * 0.18
        break
      case 'idle':
        aR = Math.sin(t * 0.8) > 0.8 ? -2.2 : -1.1
        break
      case 'talk':
        aR = -0.9 + Math.sin(t * 3) * 0.45
        zR = 0.3
        aL = Math.sin(t * 2) * 0.12
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
    if (pose === 'sad') h.rotation.set(0.32, 0, Math.sin(t * 0.8) * 0.05)
    else if (pose === 'sleep') h.rotation.set(0.18, 0, 0.32)
    else if (pose === 'talk') h.rotation.set(Math.sin(t * 2.4) * 0.08, Math.sin(t * 0.7) * 0.25, 0)
    else if (pose === 'type' || pose === 'focus') h.rotation.set(0.14 + Math.sin(t * 1.3) * 0.03, Math.sin(t * 0.5) * 0.12, 0)
    else if (pose === 'phone') h.rotation.set(0.05, 0.1, -0.12)
    else h.rotation.set(Math.sin(t * 1.1) * 0.04, Math.sin(t * 0.6) * 0.18, 0)
    upper.current.scale.y = 1 + Math.sin(t * 2.2) * 0.012
  })

  const outer = a.outer && a.outerStyle !== 'none' ? a.outer : null
  const sleeve = outer ?? a.top
  const pose: Pose | 'walk' = walking ? 'walk' : spot.pose
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
        onHint(`${member.name} · ${member.role} — clic para ver su espacio`)
        document.body.style.cursor = 'pointer'
      }}
      onPointerOut={() => {
        onHint(null)
        document.body.style.cursor = ''
      }}
    >
      <group ref={anchor} position={[0, pose === 'sad' ? 2.12 : 1.86, 0]} />
      {[-1, 1].map((side) => (
        <group key={side} ref={side < 0 ? legL : legR} position={[0.09 * side, 0.34, 0]}>
          <mesh position={[0, -0.16, 0]} castShadow>
            <capsuleGeometry args={[0.075, 0.2, 4, 10]} />
            <Toon color="#2a2238" />
          </mesh>
          <mesh position={[0, -0.31, 0.045]} castShadow>
            <boxGeometry args={[0.13, 0.07, 0.21]} />
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
              <mesh position={[0, -0.36, 0.06]}>
                <cylinderGeometry args={[0.05, 0.045, 0.1, 14]} />
                <Toon color={member.color} />
              </mesh>
            )}
          </group>
        ))}
        {pose === 'review' && (
          <mesh position={[0, 0.62, 0.36]} rotation={[-0.4, 0, 0]}>
            <boxGeometry args={[0.3, 0.22, 0.02]} />
            <Toon color={member.color} />
          </mesh>
        )}
        <group ref={head} position={[0, 1.1, 0]}>
          <mesh castShadow>
            <sphereGeometry args={[0.34, 32, 24]} />
            <Toon color={a.skin} />
            <Outlines thickness={0.012} color={EDGE} />
          </mesh>
          <Face a={a} pose={pose} />
          <Hair a={a} />
          {pose === 'focus' && (
            <group>
              <mesh rotation={[0, 0, 0]} position={[0, 0.05, 0]}>
                <torusGeometry args={[0.37, 0.022, 8, 32, Math.PI]} />
                <meshStandardMaterial color="#1c1426" />
              </mesh>
              {[-1, 1].map((side) => (
                <mesh key={side} position={[0.36 * side, 0.02, 0]} rotation={[0, 0, Math.PI / 2]}>
                  <cylinderGeometry args={[0.09, 0.09, 0.07, 18]} />
                  <meshStandardMaterial color={member.color} />
                </mesh>
              ))}
            </group>
          )}
        </group>
        {pose === 'sad' && (
          <group position={[0, 1.78, 0]}>
            {[
              [-0.12, 0, 0, 0.13],
              [0.08, 0.04, 0, 0.16],
              [0.22, -0.02, 0, 0.11],
            ].map(([x, yy, z, r], i) => (
              <mesh key={i} position={[x, yy, z]}>
                <sphereGeometry args={[r, 14, 10]} />
                <meshStandardMaterial color="#6f6a86" roughness={1} />
              </mesh>
            ))}
          </group>
        )}
      </group>
      {pose === 'cheer' && <Sparkles count={26} scale={[1.4, 1.2, 1.4]} position={[0, 1.3, 0]} size={5} speed={0.8} color={member.color} />}
    </group>
  )
}
