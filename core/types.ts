import type { MaterialName } from "./materials"

export type BoxLocation = 'QUEUE' | 'BUFFER' | 'ACTIVE' | 'CONTAINER'

export type BoxDebuff = 'FRAGILE' | 'NON_TILTABLE'

export interface Point {
  x: number
  y: number
  z: number
}

export interface Box {
  id: number
  readonly position: Point
  location: BoxLocation
  width: number
  height: number
  depth: number
  debuffs: BoxDebuff[]
  playerPosition?: Point
  material: MaterialName
  cornerRadius?: number
  cornerSmoothness?: number
}

export interface GeneratedLevel {
  size: number
  boxes: Box[]
  seed: number
}
