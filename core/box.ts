import { BufferGeometry, Material, Mesh } from "three";
import { RoundedBoxGeometry } from "three/examples/jsm/geometries/RoundedBoxGeometry.js";
import type { Updatable } from "./updatable";
import type { Box } from "./types";
import { materials } from "./materials";

const DEFAULT_CORNER_RATIO = 0.08;
const DEFAULT_CORNER_SMOOTHNESS = 4;

/** Простой вращающийся куб со скруглёнными рёбрами. */
export class BoxObject extends Mesh implements Updatable {
  /**
   * Создаёт куб с базовым материалом.
   * @param {Box} box Параметры коробки.
   */
  constructor(box: Box) {
    super(
      new RoundedBoxGeometry(
        box.width,
        box.height,
        box.depth,
        BoxObject.resolveCornerSmoothness(box),
        BoxObject.resolveCornerRadius(box)
      ),
      materials[box.material]
    );
    this.position.set(box.position.x, box.position.y, box.position.z);
  }

  /**
   * Вычисляет радиус скругления рёбер с учётом размеров коробки.
   * @param {Box} box Параметры коробки.
   * @returns {number} Допустимое значение радиуса скругления.
   */
  private static resolveCornerRadius(box: Box): number {
    const minDimension = Math.min(box.width, box.height, box.depth);
    const requested = minDimension * DEFAULT_CORNER_RATIO;
    const maxRadius = minDimension / 2 - Number.EPSILON;
    return Math.max(Math.min(requested, maxRadius), 0);
  }

  /**
   * Определяет сглаженность скругления рёбер.
   * @param {Box} box Параметры коробки.
   * @returns {number} Количество сегментов для сглаживания.
   */
  private static resolveCornerSmoothness(box: Box): number {
    return Math.max(Math.floor(DEFAULT_CORNER_SMOOTHNESS), 1);
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