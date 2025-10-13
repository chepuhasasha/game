import {
  BufferGeometry,
  Material,
  Mesh,
  MeshDepthMaterial,
} from "three";
import { RoundedBoxGeometry } from "three/examples/jsm/geometries/RoundedBoxGeometry.js";
import type { Updatable } from "./updatable";
import type { GameBox } from "./types";
import { materials } from "./materials";

/** Фиксированный радиус скругления в мировых единицах. */
const EDGE_RADIUS = 0.2;   // подбери визуально; при 1×1×1 видно стабильно
const EDGE_SEGMENTS = 4;    // сглаженность (целое ≥1)

export class BoxObject extends Mesh implements Updatable {
  constructor(box: GameBox, gap: number = 0.05) {
    super(
      // Порядок как в твоём рабочем коде: (w,h,d, smoothness, radius)
      new RoundedBoxGeometry(
        box.width - gap,
        box.height - gap,
        box.depth - gap,
        BoxObject.resolveCornerSmoothness(),
        BoxObject.resolveCornerRadius(box)
      ),
      materials[box.material]
    );
    this.position.set(box.x, box.y, box.z);

    const material = this.material as Material | Material[] | undefined;
    if (!Array.isArray(material) && material) {
      const { renderOrder, depthMaterial } = material.userData ?? {};
      if (renderOrder !== undefined) {
        this.renderOrder = renderOrder;
      }
      if (depthMaterial instanceof MeshDepthMaterial) {
        this.customDepthMaterial = depthMaterial;
        this.customDistanceMaterial = depthMaterial;
      }
    }
  }

  /** Радиус фиксированный, но не больше половины меньшей стороны. */
  private static resolveCornerRadius(box: GameBox): number {
    const halfMin = Math.min(box.width, box.height, box.depth) * 0.5 - 1e-6;
    return Math.min(Math.max(EDGE_RADIUS, 0), halfMin);
  }

  private static resolveCornerSmoothness(): number {
    return Math.max(1, Math.floor(EDGE_SEGMENTS));
  }

  update(dt: number): void {
    // this.rotation.y += 1.0 * dt;
  }

  dispose(): void {
    const g = this.geometry as BufferGeometry | undefined;
    const m = this.material as Material | Material[] | undefined;
    g?.dispose?.();
    if (Array.isArray(m)) m.forEach((mm) => mm?.dispose?.());
    else m?.dispose?.();
  }
}
