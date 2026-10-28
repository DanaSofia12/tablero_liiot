import { Component, Suspense, useEffect, useMemo, type ReactNode } from 'react'
import { Canvas, useFrame, useThree } from '@react-three/fiber'
import { Environment, Lightformer, OrbitControls, OrthographicCamera } from '@react-three/drei'
import { Bloom, EffectComposer, Noise, Pixelation, Vignette } from '@react-three/postprocessing'
import { BlendFunction } from 'postprocessing'
import * as THREE from 'three'
import { ACTIVITY_ICON, PRESENCE_META } from '../components/bits'
import type { Member, Presence } from '../types'
import { anchors, bubbleEls } from './anchors'
import { Avatar3D } from './Avatar3D'
import { paletteFor } from './palette'
import { Room, type RoomData } from './Room'
import type { Universe } from '../prefs'

const CENTER = new THREE.Vector3(6, 0.6, 4.5)
const tmp = new THREE.Vector3()

/** Proyecta el punto sobre la cabeza de cada avatar y mueve su burbuja HTML. */
function BubbleProjector() {
  const { camera, size } = useThree()
  useFrame(() => {
    for (const [id, node] of anchors) {
      const el = bubbleEls.get(id)
      if (!el) continue
      node.getWorldPosition(tmp)
      tmp.project(camera)
      const x = (tmp.x * 0.5 + 0.5) * size.width
      const y = (-tmp.y * 0.5 + 0.5) * size.height
      el.style.transform = `translate(${x.toFixed(1)}px, ${y.toFixed(1)}px) translate(-50%, -100%)`
      el.classList.toggle('hidden', Boolean(node.userData.hidden))
      el.dataset.placed = ''
    }
  })
  return null
}

function Bubble({ member, presence, onSelect }: { member: Member; presence?: Presence; onSelect: () => void }) {
  const state = presence?.state ?? 'disponible'
  const meta = PRESENCE_META[state]
  const Icon = state === 'trabajando' ? ACTIVITY_ICON[presence?.task?.type ?? ''] ?? meta.icon : meta.icon
  const label = state === 'trabajando' ? presence?.activity || meta.label : meta.label
  return (
    <div
      className="bubble-anchor"
      ref={(el) => {
        if (el) bubbleEls.set(member.id, el)
        else bubbleEls.delete(member.id)
      }}
    >
      <button type="button" className="bubble" style={{ ['--bc' as string]: meta.color }} onClick={onSelect} title={`${member.name} · ${meta.label}`}>
        <Icon aria-hidden />
        <b>{label}</b>
        {presence?.task && <span>{presence.task.key}</span>}
        <em className="who">{member.name}</em>
      </button>
    </div>
  )
}

/** Ajusta el zoom de la cámara ortográfica al tamaño del lienzo. */
function FitZoom() {
  const { size, camera } = useThree()
  useEffect(() => {
    const zoom = Math.max(18, Math.min(size.width / 15.5, size.height / 10.5))
    camera.zoom = zoom
    camera.updateProjectionMatrix()
  }, [size.width, size.height, camera])
  return null
}

function Lights({ night, sun, sunColor, ambient, hemiSky, hemiGround }: { night: boolean; sun: number; sunColor: string; ambient: number; hemiSky: string; hemiGround: string }) {
  const target = useMemo(() => {
    const o = new THREE.Object3D()
    o.position.copy(CENTER)
    return o
  }, [])
  return (
    <>
      <primitive object={target} />
      <ambientLight intensity={ambient * 0.55} />
      <hemisphereLight args={[hemiSky, hemiGround, ambient * 0.8]} />
      <directionalLight
        target={target}
        position={[15, 17, 13]}
        intensity={sun}
        color={sunColor}
        castShadow
        shadow-mapSize={[2048, 2048]}
        shadow-camera-left={-11}
        shadow-camera-right={11}
        shadow-camera-top={11}
        shadow-camera-bottom={-11}
        shadow-camera-near={1}
        shadow-camera-far={60}
        shadow-bias={-0.0005}
        shadow-normalBias={0.02}
      />
      {night && <pointLight position={[6, 3, 5]} intensity={6} distance={14} color="#b58cff" />}
    </>
  )
}

class SceneBoundary extends Component<{ fallback: ReactNode; children: ReactNode }, { failed: boolean }> {
  state = { failed: false }
  static getDerivedStateFromError() {
    return { failed: true }
  }
  render() {
    return this.state.failed ? this.props.fallback : this.props.children
  }
}

export interface Office3DProps {
  members: Member[]
  presence: Presence[]
  data: RoomData
  uni: Universe
  mode: 'dark' | 'light'
  pixel: boolean
  calm: boolean
  go: (path: string) => void
  toggleUniverse: () => void
  onSelectMember: (id: string) => void
  onHint: (label: string | null) => void
}

export default function Office3D({ members, presence, data, uni, mode, pixel, calm, go, toggleUniverse, onSelectMember, onHint }: Office3DProps) {
  const pal = paletteFor(uni, mode)
  const effects = [
    <Bloom key="bloom" mipmapBlur intensity={pal.night ? 0.95 : 0.45} luminanceThreshold={pal.night ? 0.5 : 0.82} luminanceSmoothing={0.2} />,
    <Noise key="noise" premultiply blendFunction={BlendFunction.SOFT_LIGHT} opacity={calm ? 0.12 : pal.night ? 0.32 : 0.16} />,
    <Vignette key="vignette" darkness={pal.night ? 0.55 : 0.32} offset={0.28} />,
  ]
  if (pixel) effects.push(<Pixelation key="pixel" granularity={5} />)

  return (
    <SceneBoundary fallback={<div className="office-fallback">La escena 3D no pudo cargar en este equipo. Todo lo demás de HQ funciona igual.</div>}>
      <Canvas shadows flat dpr={[1, 1.75]} gl={{ antialias: true, powerPreference: 'high-performance' }} style={{ background: 'transparent' }}>
        <OrthographicCamera makeDefault position={[6 + 18, 17, 4.5 + 18]} zoom={40} near={0.1} far={200} />
        <FitZoom />
        <OrbitControls
          makeDefault
          target={CENTER}
          enableDamping
          dampingFactor={0.08}
          minZoom={18}
          maxZoom={120}
          minPolarAngle={0.62}
          maxPolarAngle={1.18}
          minAzimuthAngle={Math.PI / 4 - 0.55}
          maxAzimuthAngle={Math.PI / 4 + 0.55}
          enablePan
          panSpeed={0.6}
        />
        <Lights night={pal.night} sun={pal.sun} sunColor={pal.sunColor} ambient={pal.ambient} hemiSky={pal.hemiSky} hemiGround={pal.hemiGround} />
        <Suspense fallback={null}>
          <Environment resolution={128} frames={1}>
            <Lightformer form="rect" intensity={2.5} color={pal.neonA} position={[8, 4, 6]} scale={[8, 3, 1]} />
            <Lightformer form="rect" intensity={2} color={pal.neonB} position={[-6, 3, -4]} scale={[6, 3, 1]} />
            <Lightformer form="ring" intensity={3} color="#ffffff" position={[0, 8, 0]} scale={4} />
          </Environment>
        </Suspense>
        <Room pal={pal} bleepy={uni === 'bleepy'} data={data} go={go} toggleUniverse={toggleUniverse} onHint={onHint} />
        {members.map((m) => (
          <Avatar3D key={m.id} member={m} presence={presence.find((p) => p.memberId === m.id)} onSelect={() => onSelectMember(m.id)} onHint={onHint} />
        ))}
        <BubbleProjector />
        <EffectComposer multisampling={pixel ? 0 : 4}>{effects}</EffectComposer>
      </Canvas>
      <div className="bubbles-layer">
        {members.map((m) => (
          <Bubble key={m.id} member={m} presence={presence.find((p) => p.memberId === m.id)} onSelect={() => onSelectMember(m.id)} />
        ))}
      </div>
    </SceneBoundary>
  )
}
