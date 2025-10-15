import { BoxGeometry, Mesh, MeshStandardMaterial } from "three";
import type { GameObject } from "../types";

export class Container extends Mesh implements GameObject {
  constructor(public readonly grid: number, public readonly size: number) {
    super(
      new BoxGeometry(size, size, size),
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
