import { BoxGeometry, Mesh, MeshStandardMaterial } from "three";
import type { GameObject } from "../types";

export interface ContainerOptions {
  grid: number;
  size: number;
}

export class Container extends Mesh implements GameObject {
  constructor(options: ContainerOptions) {
    super(
      new BoxGeometry(1, 1, 1),
      new MeshStandardMaterial({ color: 0xff0000 })
    );
    this.position.set(0, 0, 0);
  }

  update(dt: number): void {
    throw new Error("Method not implemented.");
  }
  dispose(): void {
    throw new Error("Method not implemented.");
  }
}
