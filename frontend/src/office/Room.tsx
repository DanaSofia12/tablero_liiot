import { createContext, useContext, useEffect, useMemo, useRef, type ReactNode } from 'react'
import { useFrame, type ThreeEvent } from '@react-three/fiber'
import { Float, MeshDistortMaterial, RoundedBox, Sparkles } from '@react-three/drei'
import * as THREE from 'three'
import type { ScenePalette } from './palette'
import { DESKS, ROOM } from './layout'

type V3 = [number, number, number]

export interface RoomData {
  counts: { todo: number; doing: number; blocked: number; done: number }
  blockingOk: number
  blockingTotal: number
  daysToPilot: number | null
  tasksDone: number
  tasksTotal: number
  overdue: number
  pilotDay: number
  ready: boolean
}

function Mat({ c, rough = 0.85, metal = 0, emissive, glow = 0 }: { c: string; rough?: number; metal?: number; emissive?: string; glow?: number }) {
  return <meshStandardMaterial color={c} roughness={rough} metalness={metal} emissive={emissive ?? '#000000'} emissiveIntensity={glow} />
}

function Block({ p, s, c, r = 0.04, rough }: { p: V3; s: V3; c: string; r?: number; rough?: number }) {
  return (
    <RoundedBox args={s} radius={Math.min(r, Math.min(...s) / 2.2)} smoothness={3} position={p} castShadow receiveShadow>
      <Mat c={c} rough={rough} />
    </RoundedBox>
  )
}

function useCanvasTexture(width: number, height: number, draw: (ctx: CanvasRenderingContext2D) => void, deps: unknown[]) {
  const canvas = useMemo(() => {
    const el = document.createElement('canvas')
    el.width = width
    el.height = height
    return el
  }, [width, height])
  const texture = useMemo(() => {
    const t = new THREE.CanvasTexture(canvas)
    t.colorSpace = THREE.SRGBColorSpace
    t.anisotropy = 4
    return t
  }, [canvas])
  useEffect(() => {
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    const paint = () => {
      ctx.clearRect(0, 0, width, height)
      draw(ctx)
      texture.needsUpdate = true
    }
    paint()
    void document.fonts?.ready.then(paint)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps)
  return texture
}

export const HintContext = createContext<(label: string | null) => void>(() => {})

/** Objeto clicable: al pasar el mouse, su etiqueta aparece en la barra de ayuda de la oficina. */
function Hot({ label, onClick, children }: { label: string; at?: V3; onClick: () => void; children: ReactNode }) {
  const hint = useContext(HintContext)
  return (
    <group
      onClick={(e: ThreeEvent<MouseEvent>) => {
        e.stopPropagation()
        if (e.delta > 6) return
        onClick()
      }}
      onPointerOver={(e) => {
        e.stopPropagation()
        hint(label)
        document.body.style.cursor = 'pointer'
      }}
      onPointerOut={() => {
        hint(null)
        document.body.style.cursor = ''
      }}
    >
      {children}
    </group>
  )
}

function Floor({ pal }: { pal: ScenePalette }) {
  const tex = useCanvasTexture(
    1200,
    900,
    (ctx) => {
      ctx.fillStyle = pal.floor
      ctx.fillRect(0, 0, 1200, 900)
      ctx.strokeStyle = pal.grid
      ctx.lineWidth = 3
      for (let x = 0; x <= 1200; x += 100) {
        ctx.beginPath()
        ctx.moveTo(x, 0)
        ctx.lineTo(x, 900)
        ctx.stroke()
      }
      for (let y = 0; y <= 900; y += 100) {
        ctx.beginPath()
        ctx.moveTo(0, y)
        ctx.lineTo(1200, y)
        ctx.stroke()
      }
    },
    [pal.floor, pal.grid],
  )
  return (
    <group>
      <mesh position={[ROOM.w / 2, -0.2, ROOM.d / 2]} receiveShadow>
        <boxGeometry args={[ROOM.w, 0.4, ROOM.d]} />
        <meshStandardMaterial attach="material-0" color={pal.trim} />
        <meshStandardMaterial attach="material-1" color={pal.trim} />
        <meshStandardMaterial attach="material-2" map={tex} roughness={0.9} />
        <meshStandardMaterial attach="material-3" color={pal.trim} />
        <meshStandardMaterial attach="material-4" color={pal.trim} />
        <meshStandardMaterial attach="material-5" color={pal.trim} />
      </mesh>
      <mesh position={[6.3, 0.005, 6.5]} rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
        <circleGeometry args={[1.8, 48]} />
        <Mat c={pal.rug} rough={1} />
      </mesh>
      <mesh position={[6.3, 0.01, 6.5]} rotation={[-Math.PI / 2, 0, 0]}>
        <ringGeometry args={[1.45, 1.52, 64]} />
        <meshBasicMaterial color={pal.acc2} transparent opacity={0.5} />
      </mesh>
    </group>
  )
}

function Walls({ pal }: { pal: ScenePalette }) {
  return (
    <group>
      <mesh position={[ROOM.w / 2 - 0.15, ROOM.h / 2, -0.15]} receiveShadow>
        <boxGeometry args={[ROOM.w + 0.3, ROOM.h, 0.3]} />
        <Mat c={pal.wallA} />
      </mesh>
      <mesh position={[-0.15, ROOM.h / 2, ROOM.d / 2]} receiveShadow>
        <boxGeometry args={[0.3, ROOM.h, ROOM.d]} />
        <Mat c={pal.wallB} />
      </mesh>
      <mesh position={[ROOM.w / 2, 0.08, 0.02]}>
        <boxGeometry args={[ROOM.w, 0.16, 0.04]} />
        <Mat c={pal.trim} />
      </mesh>
      <mesh position={[0.02, 0.08, ROOM.d / 2]}>
        <boxGeometry args={[0.04, 0.16, ROOM.d]} />
        <Mat c={pal.trim} />
      </mesh>
    </group>
  )
}

function NeonRibbon({ points, colors, radius = 0.035 }: { points: V3[]; colors: string[]; radius?: number }) {
  const geometry = useMemo(() => {
    const curve = new THREE.CatmullRomCurve3(points.map((p) => new THREE.Vector3(...p)))
    const tubular = 200
    const radial = 8
    const geo = new THREE.TubeGeometry(curve, tubular, radius, radial, false)
    const palette = colors.map((c) => new THREE.Color(c))
    const data: number[] = []
    for (let i = 0; i <= tubular; i++) {
      const t = (i / tubular) * (palette.length - 1)
      const k = Math.min(palette.length - 2, Math.floor(t))
      const col = palette[k].clone().lerp(palette[k + 1], t - k)
      for (let j = 0; j <= radial; j++) data.push(col.r * 2.2, col.g * 2.2, col.b * 2.2)
    }
    geo.setAttribute('color', new THREE.Float32BufferAttribute(data, 3))
    return geo
  }, [points, colors, radius])
  return (
    <mesh geometry={geometry}>
      <meshBasicMaterial vertexColors toneMapped={false} />
    </mesh>
  )
}

function Plant({ p, s = 1 }: { p: V3; s?: number }) {
  return (
    <group position={p} scale={s}>
      <mesh position={[0, 0.22, 0]} castShadow>
        <cylinderGeometry args={[0.2, 0.15, 0.44, 18]} />
        <Mat c="#d98b63" />
      </mesh>
      {[
        [0, 0.72, 0, 0.32],
        [-0.17, 0.58, 0.08, 0.22],
        [0.18, 0.6, -0.04, 0.22],
        [0.04, 0.92, 0.05, 0.2],
      ].map(([x, y, z, r], i) => (
        <mesh key={i} position={[x, y, z]} castShadow>
          <icosahedronGeometry args={[r, 1]} />
          <meshStandardMaterial color={i % 2 ? '#3f8d5d' : '#59ae78'} roughness={0.8} flatShading />
        </mesh>
      ))}
    </group>
  )
}

function Desk({ id, pal, onClick }: { id: string; pal: ScenePalette; onClick: () => void }) {
  const d = DESKS[id]
  const z0 = 2.6
  const top = 0.83
  const cx = d.cx
  const screen = useRef<THREE.MeshStandardMaterial>(null)
  useFrame(({ clock }) => {
    if (screen.current) screen.current.emissiveIntensity = (pal.night ? 1.4 : 0.6) + Math.sin(clock.elapsedTime * 2 + cx) * 0.15
  })
  return (
    <Hot label="Ver su espacio" at={[cx, 1.9, 3.1]} onClick={onClick}>
      <Block p={[d.x0 + 0.12, 0.37, z0 + 0.52]} s={[0.12, 0.74, 0.9]} c={pal.wood} />
      <Block p={[d.x0 + 2.08, 0.37, z0 + 0.52]} s={[0.12, 0.74, 0.9]} c={pal.wood} />
      <Block p={[cx, 0.785, z0 + 0.525]} s={[2.2, 0.09, 1.05]} c={pal.desk} r={0.03} />
      <Block p={[cx, top + 0.02, z0 + 0.3]} s={[0.84, 0.035, 0.5]} c={pal.metal} r={0.01} />
      <group position={[cx, top + 0.27, z0 + 0.56]} rotation={[0.18, 0, 0]}>
        <mesh castShadow>
          <boxGeometry args={[0.84, 0.52, 0.04]} />
          <Mat c={pal.metal} rough={0.4} metal={0.4} />
        </mesh>
        <mesh position={[0, 0, -0.022]} rotation={[0, Math.PI, 0]}>
          <planeGeometry args={[0.76, 0.44]} />
          <meshStandardMaterial ref={screen} color={pal.screen} emissive={pal.acc} emissiveIntensity={1} />
        </mesh>
        <mesh position={[0, 0.02, 0.022]}>
          <circleGeometry args={[0.06, 20]} />
          <meshBasicMaterial color={pal.acc2} />
        </mesh>
      </group>
      {id === 'dana' && (
        <group>
          <Block p={[d.x0 + 1.8, top + 0.06, z0 + 0.42]} s={[0.5, 0.1, 0.4]} c={pal.chair} r={0.02} />
          <Block p={[d.x0 + 1.8, top + 0.13, z0 + 0.42]} s={[0.42, 0.04, 0.32]} c={pal.paper} r={0.01} />
          <Plant p={[d.x0 + 0.35, top, z0 + 0.35]} s={0.42} />
        </group>
      )}
      {id === 'jp' && (
        <group>
          <Block p={[d.x0 + 1.75, top + 0.15, z0 + 0.8]} s={[0.08, 0.3, 0.08]} c={pal.metal} r={0.02} />
          <group position={[d.x0 + 1.75, top + 0.52, z0 + 0.77]}>
            <mesh castShadow>
              <boxGeometry args={[0.62, 0.42, 0.05]} />
              <Mat c="#1c1426" />
            </mesh>
            <mesh position={[0, 0, -0.03]} rotation={[0, Math.PI, 0]}>
              <planeGeometry args={[0.56, 0.36]} />
              <meshStandardMaterial color={pal.screen} emissive={pal.acc3} emissiveIntensity={pal.night ? 1.2 : 0.5} />
            </mesh>
          </group>
          <mesh position={[d.x0 + 0.38, top + 0.1, z0 + 0.68]} castShadow>
            <cylinderGeometry args={[0.08, 0.07, 0.18, 16]} />
            <Mat c={pal.acc} />
          </mesh>
        </group>
      )}
      {id === 'jd' && (
        <group>
          <Block p={[d.x0 + 1.7, top + 0.03, z0 + 0.62]} s={[0.48, 0.04, 0.34]} c={pal.acc2} r={0.01} />
          <Block p={[d.x0 + 0.38, top + 0.03, z0 + 0.72]} s={[0.15, 0.03, 0.27]} c="#1c1426" r={0.01} />
          <Plant p={[d.x0 + 1.95, top, z0 + 0.25]} s={0.38} />
        </group>
      )}
      <Chair x={cx} pal={pal} />
    </Hot>
  )
}

function Chair({ x, pal }: { x: number; pal: ScenePalette }) {
  return (
    <group position={[x, 0, 2.2]}>
      <mesh position={[0, 0.2, 0]} castShadow>
        <cylinderGeometry args={[0.05, 0.05, 0.4, 10]} />
        <Mat c={pal.metal} metal={0.5} rough={0.4} />
      </mesh>
      <mesh position={[0, 0.03, 0]} castShadow>
        <cylinderGeometry args={[0.3, 0.3, 0.05, 5]} />
        <Mat c={pal.metal} metal={0.5} rough={0.4} />
      </mesh>
      <Block p={[0, 0.45, 0.02]} s={[0.66, 0.1, 0.6]} c={pal.chair} r={0.05} />
      <Block p={[0, 0.88, -0.27]} s={[0.66, 0.78, 0.1]} c={pal.chair} r={0.05} />
    </group>
  )
}

function Board({ pal, data, onClick }: { pal: ScenePalette; data: RoomData; onClick: () => void }) {
  const tex = useCanvasTexture(
    960,
    340,
    (ctx) => {
      ctx.fillStyle = pal.paper
      ctx.fillRect(0, 0, 960, 340)
      ctx.fillStyle = pal.acc
      ctx.fillRect(0, 0, 960, 58)
      ctx.fillStyle = '#ffffff'
      ctx.font = '700 30px "Pixelify Sans", monospace'
      ctx.fillText('TABLERO · BLEEPY', 24, 40)
      const cols = [
        { label: 'POR HACER', n: data.counts.todo, blocked: 0 },
        { label: 'EN CURSO', n: data.counts.doing, blocked: data.counts.blocked },
        { label: 'HECHO', n: data.counts.done, blocked: 0 },
      ]
      cols.forEach((col, i) => {
        const x0 = 20 + i * 315
        ctx.fillStyle = 'rgba(40,20,70,.55)'
        ctx.font = '700 20px "Pixelify Sans", monospace'
        ctx.fillText(`${col.label} · ${col.n + col.blocked}`, x0, 92)
        const total = Math.min(14, col.n + col.blocked)
        for (let k = 0; k < total; k++) {
          const cx = x0 + (k % 5) * 58
          const cy = 108 + Math.floor(k / 5) * 72
          ctx.fillStyle = k < col.blocked ? '#e8435f' : i === 2 ? '#9ee0b5' : pal.notes[(k + i) % pal.notes.length]
          ctx.fillRect(cx, cy, 50, 56)
          ctx.fillStyle = 'rgba(0,0,0,.12)'
          ctx.fillRect(cx, cy + 50, 50, 6)
        }
        if (i < 2) {
          ctx.fillStyle = 'rgba(40,20,70,.18)'
          ctx.fillRect(x0 + 300, 70, 3, 260)
        }
      })
    },
    [pal.paper, pal.acc, data.counts.todo, data.counts.doing, data.counts.done, data.counts.blocked, pal.notes],
  )
  return (
    <Hot label="Tablero → Tareas" at={[4, 2.85, 0.3]} onClick={onClick}>
      <mesh position={[4, 1.8, 0.03]} castShadow>
        <boxGeometry args={[4.9, 1.6, 0.06]} />
        <Mat c={pal.trim} />
      </mesh>
      <mesh position={[4, 1.8, 0.065]}>
        <planeGeometry args={[4.7, 1.46]} />
        <meshStandardMaterial map={tex} roughness={0.9} />
      </mesh>
    </Hot>
  )
}

function Tv({ data, onClick }: { data: RoomData; onClick: () => void }) {
  const tex = useCanvasTexture(
    800,
    340,
    (ctx) => {
      const g = ctx.createLinearGradient(0, 0, 800, 340)
      g.addColorStop(0, '#120a24')
      g.addColorStop(1, '#2a0f2e')
      ctx.fillStyle = g
      ctx.fillRect(0, 0, 800, 340)
      ctx.fillStyle = 'rgba(255,255,255,.7)'
      ctx.font = '700 24px "Pixelify Sans", monospace'
      ctx.fillText('BLEEPY · PILOTO', 34, 52)
      const grad = ctx.createLinearGradient(34, 0, 420, 0)
      grad.addColorStop(0, '#b26bff')
      grad.addColorStop(0.6, '#ff4f7a')
      grad.addColorStop(1, '#ffb547')
      ctx.fillStyle = grad
      ctx.font = '700 120px "Unbounded Variable", "Pixelify Sans", sans-serif'
      ctx.fillText(`${data.blockingOk}/${data.blockingTotal}`, 30, 196)
      ctx.fillStyle = 'rgba(255,255,255,.75)'
      ctx.font = '700 22px "Pixelify Sans", monospace'
      ctx.fillText('BLOQUEANTES CUMPLIDOS', 36, 236)
      ctx.fillText(data.daysToPilot != null ? `PILOTO EN ${data.daysToPilot} DÍAS` : 'SIN FECHA', 36, 282)
      ctx.fillText(`TAREAS ${data.tasksDone}/${data.tasksTotal} · VENCIDAS ${data.overdue}`, 36, 318)
      const bars = [data.counts.todo, data.counts.doing, data.counts.blocked, data.counts.done]
      const colors = ['#cdb4f5', '#b26bff', '#e8435f', '#9ee0b5']
      const max = Math.max(1, ...bars)
      bars.forEach((n, i) => {
        const h = (n / max) * 210
        ctx.fillStyle = colors[i]
        ctx.fillRect(560 + i * 56, 300 - h, 38, h)
      })
    },
    [data.blockingOk, data.blockingTotal, data.daysToPilot, data.tasksDone, data.tasksTotal, data.overdue, data.counts.todo, data.counts.doing, data.counts.blocked, data.counts.done],
  )
  return (
    <Hot label="Pantalla → Carga del equipo" at={[8.9, 2.95, 0.2]} onClick={onClick}>
      <mesh position={[8.9, 1.92, 0.05]} castShadow>
        <boxGeometry args={[3.4, 1.44, 0.1]} />
        <Mat c="#140d20" rough={0.5} />
      </mesh>
      <mesh position={[8.9, 1.92, 0.103]}>
        <planeGeometry args={[3.24, 1.3]} />
        <meshBasicMaterial map={tex} toneMapped={false} />
      </mesh>
    </Hot>
  )
}

function Calendar({ pal, data, onClick }: { pal: ScenePalette; data: RoomData; onClick: () => void }) {
  const tex = useCanvasTexture(
    420,
    380,
    (ctx) => {
      ctx.fillStyle = pal.paper
      ctx.fillRect(0, 0, 420, 380)
      ctx.fillStyle = pal.acc2
      ctx.fillRect(0, 0, 420, 70)
      ctx.fillStyle = '#ffffff'
      ctx.font = '700 34px "Pixelify Sans", monospace'
      ctx.fillText('NOV 2026', 24, 48)
      const firstWeekday = 6
      for (let day = 1; day <= 30; day++) {
        const idx = day - 1 + firstWeekday
        const x = 18 + (idx % 7) * 56
        const y = 88 + Math.floor(idx / 7) * 48
        const isPilot = day === data.pilotDay
        ctx.fillStyle = isPilot ? pal.acc : 'rgba(40,20,70,.08)'
        ctx.fillRect(x, y, 48, 40)
        ctx.fillStyle = isPilot ? '#ffffff' : 'rgba(40,20,70,.7)'
        ctx.font = '700 20px "Pixelify Sans", monospace'
        ctx.fillText(String(day), x + 10, y + 28)
      }
    },
    [pal.paper, pal.acc, pal.acc2, data.pilotDay],
  )
  return (
    <Hot label="Calendario → Cronograma" at={[0.2, 3.1, 4.35]} onClick={onClick}>
      <mesh position={[0.04, 2.2, 4.35]} rotation={[0, Math.PI / 2, 0]} castShadow>
        <planeGeometry args={[1.4, 1.27]} />
        <meshStandardMaterial map={tex} roughness={0.9} />
      </mesh>
    </Hot>
  )
}

function Window({ pal, bleepy }: { pal: ScenePalette; bleepy: boolean }) {
  const tex = useCanvasTexture(
    460,
    340,
    (ctx) => {
      const g = ctx.createLinearGradient(0, 0, 0, 340)
      g.addColorStop(0, pal.sky1)
      g.addColorStop(1, pal.sky2)
      ctx.fillStyle = g
      ctx.fillRect(0, 0, 460, 340)
      if (pal.night || bleepy) {
        for (let i = 0; i < 70; i++) {
          ctx.fillStyle = `rgba(255,255,240,${0.4 + ((i * 37) % 60) / 100})`
          const x = (i * 97) % 460
          const y = (i * 53) % 300
          ctx.fillRect(x, y, i % 9 === 0 ? 4 : 2, i % 9 === 0 ? 4 : 2)
        }
      }
      if (bleepy) {
        ctx.fillStyle = pal.acc2
        ctx.beginPath()
        ctx.arc(300, 170, 62, 0, Math.PI * 2)
        ctx.fill()
        ctx.strokeStyle = '#ffd45c'
        ctx.lineWidth = 9
        ctx.beginPath()
        ctx.ellipse(300, 170, 110, 26, -0.35, 0, Math.PI * 2)
        ctx.stroke()
      } else if (pal.night) {
        ctx.fillStyle = '#f4e9c8'
        ctx.beginPath()
        ctx.arc(110, 90, 38, 0, Math.PI * 2)
        ctx.fill()
        ctx.fillStyle = pal.sky1
        ctx.beginPath()
        ctx.arc(126, 80, 34, 0, Math.PI * 2)
        ctx.fill()
      } else {
        ctx.fillStyle = '#ffd36e'
        ctx.beginPath()
        ctx.arc(110, 95, 44, 0, Math.PI * 2)
        ctx.fill()
        ctx.fillStyle = 'rgba(255,255,255,.9)'
        ;[
          [280, 120, 60, 22],
          [320, 105, 40, 20],
          [190, 230, 70, 24],
        ].forEach(([x, y, rx, ry]) => {
          ctx.beginPath()
          ctx.ellipse(x, y, rx, ry, 0, 0, Math.PI * 2)
          ctx.fill()
        })
      }
    },
    [pal.sky1, pal.sky2, pal.night, pal.acc2, bleepy],
  )
  return (
    <group position={[0.03, 1.95, 2.0]} rotation={[0, Math.PI / 2, 0]}>
      <mesh>
        <boxGeometry args={[2.4, 1.8, 0.06]} />
        <Mat c={pal.trim} />
      </mesh>
      <mesh position={[0, 0, 0.035]}>
        <planeGeometry args={[2.2, 1.6]} />
        <meshBasicMaterial map={tex} toneMapped={false} />
      </mesh>
      <mesh position={[0, 0, 0.05]}>
        <boxGeometry args={[0.06, 1.6, 0.02]} />
        <Mat c={pal.trim} />
      </mesh>
      <mesh position={[0, 0, 0.05]}>
        <boxGeometry args={[2.2, 0.06, 0.02]} />
        <Mat c={pal.trim} />
      </mesh>
    </group>
  )
}

function Sign({ text, color, p, rot = 0, w = 3.2 }: { text: string; color: string; p: V3; rot?: number; w?: number }) {
  const tex = useCanvasTexture(
    1024,
    200,
    (ctx) => {
      ctx.font = '700 120px "Pixelify Sans", monospace'
      ctx.textBaseline = 'middle'
      ctx.shadowColor = color
      ctx.shadowBlur = 30
      ctx.fillStyle = '#ffffff'
      ctx.fillText(text, 20, 104)
      ctx.shadowBlur = 0
      ctx.fillStyle = color
      ctx.globalAlpha = 0.7
      ctx.fillText(text, 20, 104)
    },
    [text, color],
  )
  return (
    <mesh position={p} rotation={[0, rot, 0]}>
      <planeGeometry args={[w, w * (200 / 1024)]} />
      <meshBasicMaterial map={tex} transparent toneMapped={false} />
    </mesh>
  )
}

function Portal({ pal, bleepy, onClick }: { pal: ScenePalette; bleepy: boolean; onClick: () => void }) {
  const inner = useRef<THREE.Mesh>(null)
  const tex = useCanvasTexture(
    400,
    400,
    (ctx) => {
      const g = ctx.createRadialGradient(200, 200, 10, 200, 200, 200)
      g.addColorStop(0, '#ffffff')
      g.addColorStop(0.18, bleepy ? '#ffd45c' : '#ff9a76')
      g.addColorStop(0.45, bleepy ? '#7c5cff' : '#3dd6f5')
      g.addColorStop(0.8, bleepy ? '#140f45' : '#5b2ee8')
      g.addColorStop(1, '#07051c')
      ctx.fillStyle = g
      ctx.fillRect(0, 0, 400, 400)
      for (let i = 0; i < 90; i++) {
        ctx.fillStyle = 'rgba(255,255,255,.85)'
        const a = i * 2.39
        const r = 30 + ((i * 41) % 170)
        ctx.fillRect(200 + Math.cos(a) * r, 200 + Math.sin(a) * r, 3, 3)
      }
    },
    [bleepy],
  )
  useFrame((_, delta) => {
    if (inner.current) inner.current.rotation.z += delta * 0.35
  })
  return (
    <Hot label={bleepy ? 'Volver a Liiot HQ' : 'Entrar al universo Bleepy'} at={[0.25, 3.0, 7.1]} onClick={onClick}>
      <group position={[0.06, 0, 7.1]} rotation={[0, Math.PI / 2, 0]}>
        <mesh position={[0, 1.86, 0]}>
          <torusGeometry args={[0.86, 0.1, 12, 48, Math.PI]} />
          <meshBasicMaterial color={bleepy ? pal.acc3 : pal.acc} toneMapped={false} />
        </mesh>
        {[-0.86, 0.86].map((x) => (
          <mesh key={x} position={[x, 0.93, 0]}>
            <boxGeometry args={[0.2, 1.86, 0.2]} />
            <meshBasicMaterial color={bleepy ? pal.acc3 : pal.acc} toneMapped={false} />
          </mesh>
        ))}
        <mesh position={[0, 1.3, -0.02]}>
          <planeGeometry args={[1.52, 2.5]} />
          <meshBasicMaterial color="#07051c" />
        </mesh>
        <mesh ref={inner} position={[0, 1.25, 0.01]}>
          <circleGeometry args={[0.74, 48]} />
          <meshBasicMaterial map={tex} toneMapped={false} />
        </mesh>
      </group>
      <pointLight position={[0.8, 1.3, 7.1]} color={bleepy ? pal.acc3 : pal.acc} intensity={pal.night ? 6 : 2} distance={4} />
    </Hot>
  )
}

function Coffee({ pal }: { pal: ScenePalette }) {
  return (
    <group>
      <Block p={[0.55, 0.46, 5.1]} s={[0.85, 0.92, 1.6]} c={pal.wood} />
      <Block p={[0.55, 0.95, 5.1]} s={[0.93, 0.06, 1.68]} c={pal.desk} r={0.02} />
      <Block p={[0.45, 1.26, 4.65]} s={[0.5, 0.56, 0.46]} c="#1c1426" r={0.04} />
      <mesh position={[0.72, 1.3, 4.65]}>
        <sphereGeometry args={[0.04, 10, 8]} />
        <meshBasicMaterial color={pal.acc2} toneMapped={false} />
      </mesh>
      {[5.35, 5.6].map((z, i) => (
        <mesh key={z} position={[0.47, 1.06, z]} castShadow>
          <cylinderGeometry args={[0.07, 0.06, 0.16, 14]} />
          <Mat c={i ? pal.acc : pal.acc2} />
        </mesh>
      ))}
    </group>
  )
}

function Sofa({ pal }: { pal: ScenePalette }) {
  return (
    <group>
      <Block p={[10.5, 0.49, 6.86]} s={[2.4, 0.98, 0.28]} c={pal.sofa} r={0.08} />
      <Block p={[10.5, 0.21, 7.39]} s={[2.4, 0.42, 0.78]} c={pal.sofa} r={0.08} />
      <Block p={[9.43, 0.42, 7.39]} s={[0.26, 0.64, 0.78]} c={pal.sofa} r={0.08} />
      <Block p={[11.57, 0.42, 7.39]} s={[0.26, 0.64, 0.78]} c={pal.sofa} r={0.08} />
      <Block p={[10.04, 0.47, 7.36]} s={[0.85, 0.1, 0.6]} c={pal.cushion} r={0.05} />
      <Block p={[10.97, 0.47, 7.36]} s={[0.85, 0.1, 0.6]} c={pal.cushion} r={0.05} />
      <group position={[11.6, 0, 6.2]}>
        <mesh position={[0, 0.75, 0]} castShadow>
          <cylinderGeometry args={[0.03, 0.03, 1.5, 8]} />
          <Mat c={pal.metal} metal={0.6} rough={0.3} />
        </mesh>
        <mesh position={[0, 1.55, 0]}>
          <coneGeometry args={[0.24, 0.3, 20, 1, true]} />
          <meshStandardMaterial color={pal.acc2} emissive={pal.acc2} emissiveIntensity={pal.night ? 1.2 : 0.2} side={THREE.DoubleSide} />
        </mesh>
        {pal.night && <pointLight position={[0, 1.3, 0]} color="#ffb27a" intensity={4} distance={4} />}
      </group>
    </group>
  )
}

function Shelf({ pal }: { pal: ScenePalette }) {
  const books = [pal.acc, pal.acc2, '#ffe08a', pal.chair, pal.acc3, '#9ee0b5']
  return (
    <group position={[11.27, 0, 0.36]}>
      <Block p={[0, 1.12, 0]} s={[1.1, 2.25, 0.52]} c={pal.wood} />
      {[0.25, 0.97, 1.64].map((y, row) => (
        <group key={y}>
          <Block p={[0, y - 0.03, 0.05]} s={[1.0, 0.04, 0.42]} c={pal.desk} r={0.01} />
          {[0, 1, 2, 3].map((k) => (
            <Block key={k} p={[-0.36 + k * 0.22, y + 0.18 + ((k + row) % 2) * 0.03, 0.12]} s={[0.16, 0.36 + ((k + row) % 3) * 0.04, 0.3]} c={books[(k + row * 2) % books.length]} r={0.01} />
          ))}
        </group>
      ))}
    </group>
  )
}

function MeetingTable({ pal }: { pal: ScenePalette }) {
  return (
    <group position={[6.3, 0, 6.5]}>
      <mesh position={[0, 0.76, 0]} castShadow receiveShadow>
        <cylinderGeometry args={[0.95, 0.95, 0.08, 48]} />
        <Mat c={pal.desk} rough={0.6} />
      </mesh>
      <mesh position={[0, 0.38, 0]} castShadow>
        <cylinderGeometry args={[0.08, 0.1, 0.72, 14]} />
        <Mat c={pal.metal} metal={0.5} rough={0.4} />
      </mesh>
      <mesh position={[0, 0.02, 0]}>
        <cylinderGeometry args={[0.38, 0.4, 0.04, 30]} />
        <Mat c={pal.metal} metal={0.5} rough={0.4} />
      </mesh>
    </group>
  )
}

/** Lugar de la escultura / cohete: al frente, donde no tapa el café ni a nadie desde la cámara. */
const FEATURE = { x: 5.0, z: 8.25 }

function ChromeSculpture({ pal, onClick }: { pal: ScenePalette; onClick: () => void }) {
  const { x, z } = FEATURE
  return (
    <Hot label="Escultura · abrir Lanzamiento" at={[x, 2.6, z]} onClick={onClick}>
      <Block p={[x, 0.3, z]} s={[0.9, 0.6, 0.9]} c={pal.trim} r={0.06} />
      <group position={[x, 1.45, z]}>
        <Float speed={2} rotationIntensity={0.6} floatIntensity={0.8}>
          <mesh castShadow>
            <icosahedronGeometry args={[0.52, 24]} />
            <MeshDistortMaterial
              color={pal.chrome}
              metalness={0.82}
              roughness={0.1}
              distort={0.42}
              speed={1.6}
              envMapIntensity={2.2}
              emissive={pal.neonA}
              emissiveIntensity={pal.night ? 0.25 : 0.06}
            />
          </mesh>
        </Float>
      </group>
      <pointLight position={[x - 0.8, 2.4, z + 0.8]} color={pal.neonB} intensity={pal.night ? 5 : 2} distance={4} />
      <pointLight position={[x + 0.8, 2.2, z - 0.8]} color={pal.neonA} intensity={pal.night ? 5 : 2} distance={4} />
    </Hot>
  )
}

function Rocket({ pal, data, onClick }: { pal: ScenePalette; data: RoomData; onClick: () => void }) {
  const fuel = data.blockingTotal ? data.blockingOk / data.blockingTotal : 0
  const flame = useRef<THREE.Mesh>(null)
  useFrame(({ clock }) => {
    if (flame.current) flame.current.scale.y = 0.8 + Math.sin(clock.elapsedTime * 18) * 0.15
  })
  const { x, z } = FEATURE
  return (
    <Hot label={`Cohete · ${data.blockingOk}/${data.blockingTotal} bloqueantes`} at={[x, 3.0, z]} onClick={onClick}>
      <Block p={[x, 0.08, z]} s={[1.5, 0.16, 1.5]} c={pal.metal} r={0.05} />
      <group position={[x, 0.25, z]}>
        <Float speed={1.4} rotationIntensity={0.08} floatIntensity={0.25}>
          <mesh position={[0, 0.75, 0]} castShadow>
            <cylinderGeometry args={[0.3, 0.34, 1.2, 28]} />
            <Mat c="#f4f2fa" rough={0.35} metal={0.2} />
          </mesh>
          <mesh position={[0, 1.6, 0]} castShadow>
            <coneGeometry args={[0.3, 0.5, 28]} />
            <Mat c={pal.acc2} rough={0.4} />
          </mesh>
          <mesh position={[0, 0.95, 0.29]}>
            <circleGeometry args={[0.12, 24]} />
            <meshBasicMaterial color={pal.acc3} toneMapped={false} />
          </mesh>
          {[0, 1, 2].map((i) => (
            <mesh key={i} position={[Math.sin((i * Math.PI * 2) / 3) * 0.33, 0.25, Math.cos((i * Math.PI * 2) / 3) * 0.33]} rotation={[0, (i * Math.PI * 2) / 3, 0]} castShadow>
              <boxGeometry args={[0.05, 0.4, 0.28]} />
              <Mat c={pal.acc} />
            </mesh>
          ))}
          {data.ready && (
            <mesh ref={flame} position={[0, -0.12, 0]} rotation={[Math.PI, 0, 0]}>
              <coneGeometry args={[0.2, 0.5, 18]} />
              <meshBasicMaterial color="#ffb547" toneMapped={false} />
            </mesh>
          )}
        </Float>
      </group>
      <group position={[x + 0.95, 0, z - 0.05]}>
        <mesh position={[0, 0.8, 0]}>
          <cylinderGeometry args={[0.12, 0.12, 1.6, 18]} />
          <meshStandardMaterial color="#1c1426" transparent opacity={0.55} />
        </mesh>
        <mesh position={[0, (1.6 * fuel) / 2, 0]}>
          <cylinderGeometry args={[0.1, 0.1, Math.max(0.02, 1.6 * fuel), 18]} />
          <meshBasicMaterial color={pal.acc2} toneMapped={false} />
        </mesh>
      </group>
      <Sparkles count={40} scale={[2.4, 2.4, 2.4]} position={[x, 1.4, z]} size={3} speed={0.3} color={pal.acc3} />
    </Hot>
  )
}

export interface RoomProps {
  pal: ScenePalette
  bleepy: boolean
  data: RoomData
  go: (path: string) => void
  toggleUniverse: () => void
  onHint: (label: string | null) => void
}

export function Room({ pal, bleepy, data, go, toggleUniverse, onHint }: RoomProps) {
  const ribbonA = useMemo<V3[]>(
    () => [
      [4.9, 3.05, 0.05],
      [6.4, 3.22, 0.05],
      [8.0, 2.98, 0.05],
      [9.6, 3.2, 0.05],
      [11.6, 3.04, 0.05],
    ],
    [],
  )
  const ribbonB = useMemo<V3[]>(
    () => [
      [0.05, 3.15, 8.7],
      [0.05, 2.98, 6.6],
      [0.05, 3.2, 4.5],
      [0.05, 2.95, 2.6],
      [0.05, 3.12, 0.4],
    ],
    [],
  )
  return (
    <HintContext.Provider value={onHint}>
      <Floor pal={pal} />
      <Walls pal={pal} />
      <Window pal={pal} bleepy={bleepy} />
      <Board pal={pal} data={data} onClick={() => go('/tareas')} />
      <Tv data={data} onClick={() => go('/equipo')} />
      <Calendar pal={pal} data={data} onClick={() => go('/cronograma')} />
      <Sign text={bleepy ? 'ESTACIÓN BLEEPY' : 'LIIOT HQ'} color={pal.neonA} p={[bleepy ? 2.75 : 2.15, 3.03, 0.08]} w={bleepy ? 3.4 : 2.6} />
      <NeonRibbon points={ribbonA} colors={[pal.neonA, pal.acc3, pal.neonB]} />
      <NeonRibbon points={ribbonB} colors={[pal.neonB, pal.neonA, pal.acc3]} radius={0.028} />
      <Portal pal={pal} bleepy={bleepy} onClick={toggleUniverse} />
      {Object.keys(DESKS).map((id) => (
        <Desk key={id} id={id} pal={pal} onClick={() => go(`/yo?persona=${id}`)} />
      ))}
      <Coffee pal={pal} />
      <MeetingTable pal={pal} />
      <Sofa pal={pal} />
      <Shelf pal={pal} />
      <Plant p={[0.7, 0, 0.65]} s={1.25} />
      <Plant p={[0.8, 0, 8.45]} s={0.7} />
      <Plant p={[11.4, 0, 8.4]} s={0.85} />
      {bleepy ? <Rocket pal={pal} data={data} onClick={() => go('/lanzamiento')} /> : <ChromeSculpture pal={pal} onClick={() => go('/lanzamiento')} />}
      {bleepy && <Sparkles count={70} scale={[12, 3, 9]} position={[6, 2, 4.5]} size={2.5} speed={0.25} color={pal.acc3} />}
      {pal.night &&
        Object.values(DESKS).map((d) => <pointLight key={d.cx} position={[d.cx, 1.7, 3.3]} color="#ffb27a" intensity={3} distance={3.6} />)}
    </HintContext.Provider>
  )
}
