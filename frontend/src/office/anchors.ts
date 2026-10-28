import type * as THREE from 'three'

/**
 * Registro compartido entre la escena 3D y la capa de burbujas en HTML.
 * Cada avatar publica un punto sobre su cabeza; el proyector lo convierte en coordenadas de pantalla
 * y mueve la burbuja directamente en el DOM (sin re-render de React en cada cuadro).
 */
export const anchors = new Map<string, THREE.Object3D>()
export const bubbleEls = new Map<string, HTMLElement>()
