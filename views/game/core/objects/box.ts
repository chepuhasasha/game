import { BoxGeometry, EdgesGeometry, Mesh, MeshStandardMaterial } from "three";
import type { GameObject } from "../types";

import { LineSegments2 } from "three/addons/lines/LineSegments2.js";
import { LineMaterial } from "three/addons/lines/LineMaterial.js";
import { LineSegmentsGeometry } from "three/addons/lines/LineSegmentsGeometry.js";

export type BoxDebuff = {
  FRAGILE: boolean;
  NON_TILTABLE: boolean;
  HEAVY: boolean;
};

export class Box extends Mesh implements GameObject {
  constructor(
    public readonly width: number,
    public readonly height: number,
    public readonly depth: number,
    public readonly x: number,
    public readonly y: number,
    public readonly z: number,
    public readonly rx: boolean,
    public readonly ry: boolean,
    public readonly rz: boolean,
    public debuffs: BoxDebuff
  ) {
    const geometry = new BoxGeometry(width, height, depth);
    const material = new MeshStandardMaterial({ color: 0x000000 });
    super(geometry, material);

    const egeo = new EdgesGeometry(geometry, 1);
    const segGeo = new LineSegmentsGeometry();
    segGeo.setPositions(egeo.attributes.position.array);
    const edgeMaterial = new LineMaterial({
      color: 0xffffff,
      linewidth: 8,
      depthTest: true,
      depthWrite: false,
    });
    const edge = new LineSegments2(segGeo, edgeMaterial);
    edge.computeLineDistances();
    edge.renderOrder = 2;
    this.add(edge);

    this.position.set(x, y, z);
    this.rotate(rx, ry, rz);
  }

  rotate(rx: boolean, ry: boolean, rz: boolean): void {
    const q = Math.PI / 2;
    if (rx) this.rotateX(q);
    if (ry) this.rotateY(q);
    if (rz) this.rotateZ(q);
  }

  update(dt: number): void {
    throw new Error("Method not implemented.");
  }
  dispose(): void {
    throw new Error("Method not implemented.");
  }
}
