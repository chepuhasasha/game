import type { MaterialName } from "./materials";

export type BoxLocation = "QUEUE" | "BUFFER" | "ACTIVE" | "CONTAINER";

export type BoxDebuff = "FRAGILE" | "NON_TILTABLE" | "HEAVY";

export interface Point {
  x: number;
  y: number;
  z: number;
}

export interface Size {
  width: number;
  height: number;
  depth: number;
}

export type Box = (Point & Size)

export interface GameBox extends Box {
  id: number;
  location: BoxLocation;
  debuffs: BoxDebuff[];
  material: MaterialName;
  position?: Point;
}

export interface GeneratedLevel {
  size: number;
  boxes: GameBox[];
  seed: number;
}
