import { BoxGeometry, BufferGeometry, Material, Mesh } from "three";
import type { Updatable } from "./updatable";
import type { Box } from "./types";
import { materials } from "./materials";

/** Простой вращающийся куб. */
export class BoxObject extends Mesh implements Updatable {
  /**
   * Создаёт куб с базовым материалом.
   * @param {number} size Размер ребра куба.
   * @param {number} color Цвет материала в hex.
   */
  constructor(box: Box) {
    super(
      new BoxGeometry(box.width, box.height, box.depth),
      materials[box.material]
    );
    this.position.set(box.position.x, box.position.y, box.position.z);
  }

  /**
   * Вращает куб вокруг оси Y.
   * @param {number} dt Дельта времени в секундах.
   * @returns {void}
   */
  update(dt: number): void {
    this.rotation.y += 1.0 * dt;
  }

  /**
   * Освобождает ресурсы геометрии и материала.
   * @returns {void}
   */
  dispose(): void {
    const g = this.geometry as BufferGeometry | undefined;
    const m = this.material as Material | Material[] | undefined;
    g?.dispose?.();
    if (Array.isArray(m)) m.forEach((mm) => mm?.dispose?.());
    else m?.dispose?.();
  }
}
